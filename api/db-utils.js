const fs = require('fs');
const path = require('path');

/**
 * Database utility module to handle directory creation and database path management
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
 * Get database file path
 * @param {string} dbName Database file name (e.g., "inventory.db")
 * @returns {string} Full path to the database file
 */
function getDatabasePath(dbName) {
    return path.join(getDatabaseDir(), dbName);
}

module.exports = {
    getAppDataDir,
    getDatabaseDir,
    getUploadsDir,
    ensureDirectoryExists,
    initializeDirectories,
    getDatabasePath
};