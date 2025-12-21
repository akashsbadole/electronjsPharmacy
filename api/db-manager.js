const Datastore = require('@seald-io/nedb');
const path = require('path');
const fs = require('fs');
const dbUtils = require('./db-utils');

/**
 * Singleton Database Manager to prevent multiple instances of the same database
 * with synchronization to prevent race conditions during initialization
 */
class DatabaseManager {
    constructor() {
        this.instances = {};
        this.initPromises = {}; // Track ongoing initialization promises
        this.healthStatus = {}; // Track database health status
        this.initializationQueue = []; // Queue for sequential initialization
        this.isProcessingQueue = false; // Flag to prevent concurrent queue processing
    }

    /**
     * Get a database instance for the given name or path synchronously if it exists
     * @param {string} dbName - The name of the database (e.g., 'inventory.db')
     * @returns {Datastore|null}
     */
    getDatabaseSync(dbName) {
        const dbPath = dbName.includes(path.sep) ? dbName : dbUtils.getDatabasePath(dbName);
        return this.instances[dbPath] || null;
    }

    /**
     * Get a database instance for the given name or path with synchronization
     * @param {string} dbName - The name of the database (e.g., 'inventory.db')
     * @param {Object} options - NeDB options
     * @returns {Promise<Datastore>}
     */
    async getDatabase(dbName, options = {}) {
        const dbPath = dbName.includes(path.sep) ? dbName : dbUtils.getDatabasePath(dbName);
        
        // Return existing instance if already initialized
        if (this.instances[dbPath]) {
            // Check health status periodically
            if (this.healthStatus[dbPath] && this.healthStatus[dbPath].lastCheck) {
                const timeSinceLastCheck = Date.now() - this.healthStatus[dbPath].lastCheck;
                // Recheck health every 5 minutes
                if (timeSinceLastCheck > 5 * 60 * 1000) {
                    await this._checkDatabaseHealth(dbPath);
                }
            }
            return this.instances[dbPath];
        }

        // If initialization is in progress, wait for it to complete
        if (this.initPromises[dbPath]) {
            return this.initPromises[dbPath];
        }

        // Add to initialization queue for sequential processing
        return new Promise((resolve, reject) => {
            this.initializationQueue.push({
                dbPath,
                options,
                resolve,
                reject
            });
            
            this._processInitializationQueue();
        });
    }

    /**
     * Process initialization queue sequentially to prevent race conditions
     * @private
     */
    async _processInitializationQueue() {
        if (this.isProcessingQueue || this.initializationQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.initializationQueue.length > 0) {
            const item = this.initializationQueue.shift();
            
            try {
                // Create initialization promise to prevent concurrent initialization
                this.initPromises[item.dbPath] = this._initializeDatabase(item.dbPath, item.options);
                
                const instance = await this.initPromises[item.dbPath];
                
                // Clear promise after success
                delete this.initPromises[item.dbPath];
                
                // Set initial health status
                this.healthStatus[item.dbPath] = {
                    isHealthy: true,
                    lastCheck: Date.now(),
                    lastError: null,
                    accessCount: 0
                };
                
                item.resolve(instance);
            } catch (error) {
                // Clean up failed initialization promise
                delete this.initPromises[item.dbPath];
                
                // Set health status to unhealthy
                this.healthStatus[item.dbPath] = {
                    isHealthy: false,
                    lastCheck: Date.now(),
                    lastError: error.message,
                    accessCount: 0
                };
                
                item.reject(error);
            }
            
            // Add a small delay between initializations to reduce file system contention
            if (this.initializationQueue.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        this.isProcessingQueue = false;
    }

    /**
     * Initialize a database instance with retry logic
     * @param {string} dbPath - Path to the database file
     * @param {Object} options - NeDB options
     * @returns {Promise<Datastore>}
     * @private
     */
    async _initializeDatabase(dbPath, options = {}) {
        // Ensure directory exists with retry logic
        await dbUtils.ensureDirectoryExistsWithRetryAsync(path.dirname(dbPath));
        
        const defaultOptions = {
            filename: dbPath,
            autoload: true,
            // Add corruption handling options
            corruptAlertThreshold: 0.1,
            timestampData: true
        };

        const finalOptions = { ...defaultOptions, ...options };
        
        console.log(`Initializing database instance: ${dbPath}`);
        
        // Create database with retry logic
        const maxRetries = 5;
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Ensure the directory is definitely there before trying to open the file
                await dbUtils.ensureDirectoryExistsWithRetryAsync(path.dirname(dbPath));
                
                // Check if database file exists and is accessible
                const fileExists = await dbUtils.fileExistsWithRetry(dbPath);
                if (!fileExists) {
                    console.log(`Database file does not exist, will be created: ${dbPath}`);
                }
                
                const instance = new Datastore(finalOptions);
                
                // Wait for database to be fully loaded
                await this._waitForDatabaseLoad(instance);
                
                // Verify database is working with a simple operation
                await this._verifyDatabaseOperation(instance);
                
                // Store the instance
                this.instances[dbPath] = instance;
                
                console.log(`Database initialized successfully: ${dbPath}`);
                return instance;
            } catch (error) {
                lastError = error;
                console.error(`Database initialization failed (attempt ${attempt}/${maxRetries}): ${dbPath}`, error);
                
                if (attempt < maxRetries) {
                    // Wait before retry with exponential backoff
                    const delay = Math.pow(2, attempt) * 200; // 400ms, 800ms, 1600ms, 3200ms
                    console.log(`Retrying database initialization in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
        
        // All retries failed
        throw new Error(`Failed to initialize database after ${maxRetries} attempts: ${dbPath}. Last error: ${lastError.message}`);
    }

    /**
     * Wait for database to be fully loaded
     * @param {Datastore} db - Database instance
     * @returns {Promise<void>}
     * @private
     */
    async _waitForDatabaseLoad(db) {
        return new Promise((resolve, reject) => {
            // Wait for NeDB to finished loading (autoload: true handles the initial load)
            // But we want to ensure it's ready. Count is a simple way to check if it's usable.
            
            // For @seald-io/nedb, we can also check persistent layer if needed
            // But a simple count should suffice
            const timeout = setTimeout(() => {
                reject(new Error("Database load timeout"));
            }, 15000); // Increased timeout to 15 seconds

            db.count({}, (err, count) => {
                clearTimeout(timeout);
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Verify database is working with a simple operation
     * @param {Datastore} db - Database instance
     * @returns {Promise<void>}
     * @private
     */
    async _verifyDatabaseOperation(db) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("Database verification timeout"));
            }, 5000);

            // Try a simple count operation to verify database is working
            db.count({}, (err, count) => {
                clearTimeout(timeout);
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Check database health status
     * @param {string} dbPath - Path to the database file
     * @returns {Promise<Object>} Health status object
     * @private
     */
    async _checkDatabaseHealth(dbPath) {
        const instance = this.instances[dbPath];
        if (!instance) {
            this.healthStatus[dbPath] = {
                isHealthy: false,
                lastCheck: Date.now(),
                lastError: "Database instance not found",
                accessCount: 0
            };
            return this.healthStatus[dbPath];
        }

        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                this.healthStatus[dbPath] = {
                    isHealthy: false,
                    lastCheck: Date.now(),
                    lastError: "Health check timeout",
                    accessCount: this.healthStatus[dbPath]?.accessCount || 0
                };
                resolve(this.healthStatus[dbPath]);
            }, 3000);

            // Try a simple operation to check health
            instance.count({}, (err, count) => {
                clearTimeout(timeout);
                if (err) {
                    this.healthStatus[dbPath] = {
                        isHealthy: false,
                        lastCheck: Date.now(),
                        lastError: err.message,
                        accessCount: this.healthStatus[dbPath]?.accessCount || 0
                    };
                } else {
                    this.healthStatus[dbPath] = {
                        isHealthy: true,
                        lastCheck: Date.now(),
                        lastError: null,
                        accessCount: (this.healthStatus[dbPath]?.accessCount || 0) + 1
                    };
                }
                resolve(this.healthStatus[dbPath]);
            });
        });
    }

    /**
     * Get health status for all databases
     * @returns {Promise<Object>} Health status for all databases
     */
    async getAllDatabaseHealth() {
        const healthReport = {};
        
        // Check health for all initialized databases
        for (const dbPath of Object.keys(this.instances)) {
            await this._checkDatabaseHealth(dbPath);
            healthReport[dbPath] = this.healthStatus[dbPath];
        }
        
        return healthReport;
    }

    /**
     * Get health status for a specific database
     * @param {string} dbName - Database name or path
     * @returns {Promise<Object>} Health status for database
     */
    async getDatabaseHealth(dbName) {
        const dbPath = dbName.includes(path.sep) ? dbName : dbUtils.getDatabasePath(dbName);
        return await this._checkDatabaseHealth(dbPath);
    }

    /**
     * Close all database instances
     */
    async closeAll() {
        // @seald-io/nedb doesn't have a simple close() but we can nullify or handle if needed
        // For now, we'll just clear the instances
        this.instances = {};
        this.initPromises = {};
        this.healthStatus = {};
        this.initializationQueue = [];
        this.isProcessingQueue = false;
    }

    /**
     * Get all initialized database paths
     * @returns {Array<string>} Array of database paths
     */
    getInitializedDatabases() {
        return Object.keys(this.instances);
    }

    /**
     * Check if a database is initialized
     * @param {string} dbName - Database name or path
     * @returns {boolean} True if database is initialized
     */
    isInitialized(dbName) {
        const dbPath = dbName.includes(path.sep) ? dbName : dbUtils.getDatabasePath(dbName);
        return !!this.instances[dbPath];
    }
}

const instance = new DatabaseManager();
module.exports = instance;