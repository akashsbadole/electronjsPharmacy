const dbManager = require('./db-manager');
const dbUtils = require('./db-utils');
const path = require('path');

/**
 * Centralized Database Initialization Module
 *
 * This module provides a single entry point for database initialization,
 * standardizes how all databases are initialized, and implements
 * retry logic for failed operations.
 *
 * NOTE: NeDB initialization is disabled - using SQLite only
 */

// List of all required databases for the application
// DISABLED: Using SQLite only instead of NeDB
const REQUIRED_DATABASES = [
    // Empty array - NeDB initialization disabled
    // All data is now stored in SQLite via sqlite-db-manager.js
];

/**
 * Initialize all required databases
 * @param {Object} options - Initialization options
 * @param {boolean} options.forceReinit - Force reinitialization of existing databases
 * @param {Array<string>} options.only - Initialize only specific databases (by name)
 * @param {Function} options.progressCallback - Callback for progress updates
 * @returns {Promise<Object>} Initialization results
 */
async function initializeAllDatabases(options = {}) {
    const {
        forceReinit = false,
        only = null,
        progressCallback = null
    } = options;

    console.log('Starting centralized database initialization...');
    
    // Initialize directories first
    const dirsInitialized = await dbUtils.initializeDirectoriesAsync();
    if (!dirsInitialized) {
        throw new Error('Failed to initialize database directories');
    }
    
    // Filter databases if 'only' option is provided
    const databasesToInit = only 
        ? REQUIRED_DATABASES.filter(db => only.includes(db.name))
        : REQUIRED_DATABASES;
    
    console.log(`Initializing ${databasesToInit.length} databases...`);
    
    const results = {
        success: [],
        failed: [],
        skipped: [],
        total: databasesToInit.length
    };
    
    // Initialize databases sequentially to prevent race conditions
    for (let i = 0; i < databasesToInit.length; i++) {
        const dbConfig = databasesToInit[i];
        
        try {
            // Check if already initialized and not forcing reinit
            if (!forceReinit && dbManager.isInitialized(dbConfig.name)) {
                console.log(`Database already initialized, skipping: ${dbConfig.name}`);
                results.skipped.push({
                    name: dbConfig.name,
                    reason: 'Already initialized'
                });
                
                if (progressCallback) {
                    progressCallback(i + 1, results.total, dbConfig.name, 'skipped');
                }
                
                continue;
            }
            
            // Initialize the database
            const db = await dbManager.getDatabase(dbConfig.name);
            
            // Create indexes
            for (const indexConfig of dbConfig.indexes) {
                await new Promise((resolve, reject) => {
                    db.ensureIndex(indexConfig, (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            }
            
            results.success.push(dbConfig.name);
            console.log(`Database initialized successfully: ${dbConfig.name}`);
            
            if (progressCallback) {
                progressCallback(i + 1, results.total, dbConfig.name, 'success');
            }
            
            // Add a small delay between initializations to reduce file system contention
            if (i < databasesToInit.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
        } catch (error) {
            results.failed.push({
                name: dbConfig.name,
                error: error.message
            });
            console.error(`Failed to initialize database: ${dbConfig.name}`, error);
            
            if (progressCallback) {
                progressCallback(i + 1, results.total, dbConfig.name, 'failed', error.message);
            }
        }
    }
    
    console.log(`Database initialization completed: ${results.success.length} success, ${results.failed.length} failed, ${results.skipped.length} skipped`);
    
    return results;
}

/**
 * Verify all database files exist and are accessible
 * @returns {Promise<Object>} Verification results
 */
async function verifyDatabaseFiles() {
    console.log('Verifying database files...');
    
    const results = {
        exist: [],
        missing: [],
        inaccessible: [],
        total: REQUIRED_DATABASES.length
    };
    
    for (const dbConfig of REQUIRED_DATABASES) {
        const dbPath = dbUtils.getDatabasePath(dbConfig.name);
        
        try {
            const exists = await dbUtils.fileExistsWithRetry(dbPath);
            
            if (exists) {
                // Try to access the file to ensure it's readable
                try {
                    await fs.promises.access(dbPath, fs.constants.R_OK | fs.constants.W_OK);
                    results.exist.push({
                        name: dbConfig.name,
                        path: dbPath
                    });
                } catch (accessError) {
                    results.inaccessible.push({
                        name: dbConfig.name,
                        path: dbPath,
                        error: accessError.message
                    });
                }
            } else {
                results.missing.push({
                    name: dbConfig.name,
                    path: dbPath
                });
            }
        } catch (error) {
            results.inaccessible.push({
                name: dbConfig.name,
                path: dbPath,
                error: error.message
            });
        }
    }
    
    console.log(`Database file verification completed: ${results.exist.length} exist, ${results.missing.length} missing, ${results.inaccessible.length} inaccessible`);
    
    return results;
}

/**
 * Get health status for all databases
 * @returns {Promise<Object>} Health status for all databases
 */
async function getAllDatabaseHealth() {
    return await dbManager.getAllDatabaseHealth();
}

/**
 * Get health status for a specific database
 * @param {string} dbName - Database name
 * @returns {Promise<Object>} Health status for the database
 */
async function getDatabaseHealth(dbName) {
    return await dbManager.getDatabaseHealth(dbName);
}

/**
 * Get a specific database instance
 * @param {string} dbName - Database name
 * @param {Object} options - Database options
 * @returns {Promise<Datastore>} Database instance
 */
async function getDatabase(dbName, options = {}) {
    return await dbManager.getDatabase(dbName, options);
}

/**
 * Check if a database is initialized
 * @param {string} dbName - Database name
 * @returns {boolean} True if database is initialized
 */
function isDatabaseInitialized(dbName) {
    return dbManager.isInitialized(dbName);
}

/**
 * Get all initialized database names
 * @returns {Array<string>} Array of database names
 */
function getInitializedDatabases() {
    return dbManager.getInitializedDatabases().map(dbPath => {
        // Extract just the filename from the full path
        return path.basename(dbPath);
    });
}

/**
 * Close all database instances
 * @returns {Promise<void>}
 */
async function closeAllDatabases() {
    return await dbManager.closeAll();
}

/**
 * Initialize a single database with retry logic
 * @param {string} dbName - Database name
 * @param {Array<Object>} indexes - Indexes to create
 * @param {Object} options - Database options
 * @returns {Promise<Datastore>} Database instance
 */
async function initializeSingleDatabase(dbName, indexes = [], options = {}) {
    try {
        const db = await dbManager.getDatabase(dbName, options);
        
        // Create indexes
        for (const indexConfig of indexes) {
            await new Promise((resolve, reject) => {
                db.ensureIndex(indexConfig, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        }
        
        return db;
    } catch (error) {
        console.error(`Failed to initialize database: ${dbName}`, error);
        throw error;
    }
}

module.exports = {
    initializeAllDatabases,
    verifyDatabaseFiles,
    getAllDatabaseHealth,
    getDatabaseHealth,
    getDatabase,
    isDatabaseInitialized,
    getInitializedDatabases,
    closeAllDatabases,
    initializeSingleDatabase,
    REQUIRED_DATABASES
};