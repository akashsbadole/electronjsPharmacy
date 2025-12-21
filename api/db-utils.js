const fs = require('fs');
const path = require('path');

/**
 * Database utility module to handle directory creation and database path management
 * with enhanced retry logic for Windows file system timing issues
 */

/**
 * Get the application data directory path
 * @returns {string} Path to the application data directory
 */
function getAppDataDir() {
    const appName = process.env.APPNAME || 'PharmaSoft';
    const appData = process.env.APPDATA || (process.platform === 'win32' ? process.env.USERPROFILE + '/AppData/Roaming' : process.env.HOME + '/.config');
    return path.join(appData, appName);
}

/**
 * Get the database directory path
 * @returns {string} Path to the database directory
 */
function getDatabaseDir() {
    return path.join(getAppDataDir(), "server", "databases");
}

/**
 * Get the uploads directory path
 * @returns {string} Path to the uploads directory
 */
function getUploadsDir() {
    return path.join(getAppDataDir(), "uploads");
}

/**
 * Ensure directory exists recursively
 * @param {string} dirPath Directory path to create
 */
function ensureDirectoryExists(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Created directory: ${dirPath}`);
        }
    } catch (error) {
        console.error(`Error creating directory ${dirPath}:`, error);
        throw error;
    }
}

/**
 * Ensure directory exists with retry logic for NeDB operations
 * @param {string} dirPath Directory path to create
 * @param {number} retryCount Number of retries (default: 3)
 * @param {number} retryDelay Delay between retries in ms (default: 100)
 */
function ensureDirectoryExistsWithRetry(dirPath, retryCount = 3, retryDelay = 100) {
    for (let i = 0; i < retryCount; i++) {
        try {
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                console.log(`Created directory: ${dirPath}`);
                return true;
            } else {
                // Directory exists, check if it's accessible
                try {
                    fs.accessSync(dirPath, fs.constants.W_OK);
                    return true;
                } catch (accessError) {
                    // Directory might be in the process of being created, wait and retry
                    if (i < retryCount - 1) {
                        console.log(`Directory access failed, retrying in ${retryDelay}ms... (${i + 1}/${retryCount})`);
                        setTimeout(() => {}, retryDelay);
                    }
                }
            }
        } catch (error) {
            console.error(`Error creating directory ${dirPath} (attempt ${i + 1}/${retryCount}):`, error);
            if (i < retryCount - 1) {
                console.log(`Retrying in ${retryDelay}ms... (${i + 1}/${retryCount})`);
                setTimeout(() => {}, retryDelay);
            } else {
                throw error;
            }
        }
    }
    return false;
}

/**
 * Async version of ensureDirectoryExistsWithRetry
 * @param {string} dirPath Directory path to create
 * @param {number} retryCount Number of retries (default: 3)
 * @param {number} retryDelay Delay between retries in ms (default: 100)
 * @returns {Promise<boolean>}
 */
async function ensureDirectoryExistsWithRetryAsync(dirPath, retryCount = 3, retryDelay = 100) {
    for (let i = 0; i < retryCount; i++) {
        try {
            const exists = await fs.promises.access(dirPath).then(() => true).catch(() => false);
            
            if (!exists) {
                await fs.promises.mkdir(dirPath, { recursive: true });
                console.log(`Created directory: ${dirPath}`);
                return true;
            } else {
                // Directory exists, check if it's accessible
                try {
                    await fs.promises.access(dirPath, fs.constants.W_OK);
                    return true;
                } catch (accessError) {
                    // Directory might be in the process of being created, wait and retry
                    if (i < retryCount - 1) {
                        console.log(`Directory access failed, retrying in ${retryDelay}ms... (${i + 1}/${retryCount})`);
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
            }
        } catch (error) {
            console.error(`Error creating directory ${dirPath} (attempt ${i + 1}/${retryCount}):`, error);
            if (i < retryCount - 1) {
                console.log(`Retrying in ${retryDelay}ms... (${i + 1}/${retryCount})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            } else {
                throw error;
            }
        }
    }
    return false;
}

/**
 * Safe file operation with retry logic for Windows file system timing issues
 * @param {string} operation - File operation type ('rename', 'write', 'read')
 * @param {string} sourcePath - Source file path (for rename)
 * @param {string} targetPath - Target file path
 * @param {string|Buffer} data - Data to write (for write operation)
 * @param {number} retryCount - Number of retries (default: 5)
 * @param {number} retryDelay - Delay between retries in ms (default: 200)
 * @returns {Promise<any>}
 */
async function safeFileOperation(operation, sourcePath, targetPath, data = null, retryCount = 5, retryDelay = 200) {
    let lastError;
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
        try {
            switch (operation) {
                case 'rename':
                    // Check if source file exists before rename
                    await fs.promises.access(sourcePath, fs.constants.F_OK);
                    await fs.promises.rename(sourcePath, targetPath);
                    console.log(`File renamed successfully: ${sourcePath} -> ${targetPath}`);
                    return true;
                    
                case 'write':
                    await fs.promises.writeFile(targetPath, data);
                    console.log(`File written successfully: ${targetPath}`);
                    return true;
                    
                case 'read':
                    const result = await fs.promises.readFile(targetPath, 'utf8');
                    return result;
                    
                default:
                    throw new Error(`Unsupported file operation: ${operation}`);
            }
        } catch (error) {
            lastError = error;
            
            // Special handling for ENOENT errors during rename operations
            if (operation === 'rename' && error.code === 'ENOENT') {
                console.error(`File operation failed with ENOENT (attempt ${attempt}/${retryCount}): ${operation} ${sourcePath} -> ${targetPath}`, error);
                
                if (attempt < retryCount) {
                    // For ENOENT errors, use exponential backoff with longer delays
                    const delay = retryDelay * Math.pow(1.5, attempt - 1);
                    console.log(`Retrying file operation in ${delay}ms due to ENOENT error...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            } else {
                console.error(`File operation failed (attempt ${attempt}/${retryCount}): ${operation}`, error);
                
                if (attempt < retryCount) {
                    const delay = retryDelay * attempt;
                    console.log(`Retrying file operation in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
    }
    
    // All retries failed
    throw new Error(`File operation failed after ${retryCount} attempts: ${operation}. Last error: ${lastError.message}`);
}

/**
 * Check if a file exists with retry logic
 * @param {string} filePath - Path to the file
 * @param {number} retryCount - Number of retries (default: 3)
 * @param {number} retryDelay - Delay between retries in ms (default: 100)
 * @returns {Promise<boolean>}
 */
async function fileExistsWithRetry(filePath, retryCount = 3, retryDelay = 100) {
    for (let i = 0; i < retryCount; i++) {
        try {
            await fs.promises.access(filePath, fs.constants.F_OK);
            return true;
        } catch (error) {
            if (error.code === 'ENOENT') {
                // File doesn't exist, no need to retry
                return false;
            }
            
            console.error(`Error checking file existence ${filePath} (attempt ${i + 1}/${retryCount}):`, error);
            
            if (i < retryCount - 1) {
                console.log(`Retrying in ${retryDelay}ms... (${i + 1}/${retryCount})`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
    
    // If we get here, assume file doesn't exist due to access errors
    return false;
}

/**
 * Initialize all required directories for the application
 */
function initializeDirectories() {
    try {
        // Create main app data directory
        ensureDirectoryExists(getAppDataDir());
        
        // Create server directory
        ensureDirectoryExists(path.join(getAppDataDir(), "server"));
        
        // Create databases directory
        ensureDirectoryExists(getDatabaseDir());
        
        // Create uploads directory
        ensureDirectoryExists(getUploadsDir());
        
        console.log('Database directories initialized successfully');
        console.log(`Database directory: ${getDatabaseDir()}`);
        console.log(`Uploads directory: ${getUploadsDir()}`);
        
        return true;
    } catch (error) {
        console.error('Failed to initialize directories:', error);
        return false;
    }
}

/**
 * Async version of initializeDirectories with retry logic
 * @returns {Promise<boolean>}
 */
async function initializeDirectoriesAsync() {
    try {
        // Create main app data directory
        await ensureDirectoryExistsWithRetryAsync(getAppDataDir());
        
        // Create server directory
        await ensureDirectoryExistsWithRetryAsync(path.join(getAppDataDir(), "server"));
        
        // Create databases directory
        await ensureDirectoryExistsWithRetryAsync(getDatabaseDir());
        
        // Create uploads directory
        await ensureDirectoryExistsWithRetryAsync(getUploadsDir());
        
        console.log('Database directories initialized successfully');
        console.log(`Database directory: ${getDatabaseDir()}`);
        console.log(`Uploads directory: ${getUploadsDir()}`);
        
        return true;
    } catch (error) {
        console.error('Failed to initialize directories:', error);
        return false;
    }
}

/**
 * Get database file path
 * @param {string} dbName Database file name (e.g., "inventory.db")
 * @returns {string} Full path to the database file
 */
function getDatabasePath(dbName) {
    return path.join(getDatabaseDir(), dbName);
}

/**
 * Get SQLite database file path
 * @param {string} dbName Database name (optional, defaults to 'pharmasoft.db')
 * @returns {string} Full path to the SQLite database file
 */
function getSQLiteDatabasePath(dbName = 'pharmasoft.db') {
    return path.join(getDatabaseDir(), dbName);
}

/**
 * Check if SQLite database exists
 * @param {string} dbName Database name (optional)
 * @returns {Promise<boolean>} True if database exists
 */
async function sqliteDatabaseExists(dbName = 'pharmasoft.db') {
    const dbPath = getSQLiteDatabasePath(dbName);
    return await fileExistsWithRetry(dbPath);
}

/**
 * Backup SQLite database
 * @param {string} dbName Database name to backup
 * @param {string} backupName Backup file name (optional)
 * @returns {Promise<string>} Path to backup file
 */
async function backupSQLiteDatabase(dbName = 'pharmasoft.db', backupName = null) {
    const sourcePath = getSQLiteDatabasePath(dbName);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = backupName || `${dbName.replace('.db', '')}_backup_${timestamp}.db`;
    const backupPath = path.join(getDatabaseDir(), backupFileName);
    
    try {
        await safeFileOperation('copy', sourcePath, backupPath);
        console.log(`Database backed up successfully: ${backupPath}`);
        return backupPath;
    } catch (error) {
        console.error('Failed to backup database:', error);
        throw error;
    }
}

/**
 * Get database size in bytes
 * @param {string} dbName Database name (optional)
 * @returns {Promise<number>} Database size in bytes
 */
async function getDatabaseSize(dbName = 'pharmasoft.db') {
    const dbPath = getSQLiteDatabasePath(dbName);
    try {
        const stats = await fs.promises.stat(dbPath);
        return stats.size;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return 0;
        }
        throw error;
    }
}

/**
 * Validate database integrity (SQLite specific)
 * @param {sqlite3.Database} db SQLite database instance
 * @returns {Promise<boolean>} True if database is valid
 */
async function validateDatabaseIntegrity(db) {
    return new Promise((resolve, reject) => {
        db.get('PRAGMA integrity_check', (err, row) => {
            if (err) {
                reject(err);
            } else {
                // SQLite returns 'ok' if integrity check passes
                resolve(row.integrity_check === 'ok');
            }
        });
    });
}

/**
 * Optimize database (SQLite specific)
 * @param {sqlite3.Database} db SQLite database instance
 * @returns {Promise<void>}
 */
async function optimizeDatabase(db) {
    const operations = [
        'ANALYZE',
        'VACUUM',
        'PRAGMA optimize'
    ];
    
    for (const sql of operations) {
        await new Promise((resolve, reject) => {
            db.run(sql, (err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
    
    console.log('Database optimization completed');
}

module.exports = {
    getAppDataDir,
    getDatabaseDir,
    getUploadsDir,
    ensureDirectoryExists,
    ensureDirectoryExistsWithRetry,
    ensureDirectoryExistsWithRetryAsync,
    safeFileOperation,
    fileExistsWithRetry,
    initializeDirectories,
    initializeDirectoriesAsync,
    getDatabasePath,
    // SQLite specific functions
    getSQLiteDatabasePath,
    sqliteDatabaseExists,
    backupSQLiteDatabase,
    getDatabaseSize,
    validateDatabaseIntegrity,
    optimizeDatabase
};