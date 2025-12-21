/**
 * NeDB Patch for ENOENT Error Handling
 * 
 * This module patches the NeDB persistence layer to handle ENOENT errors
 * during file rename operations, which are common on Windows systems
 * due to timing issues with temporary file cleanup.
 */

const fs = require('fs');
const path = require('path');
const dbUtils = require('./db-utils');

/**
 * Patch the original fs.rename function to handle ENOENT errors with retry logic
 */
const originalRename = fs.rename;
fs.rename = function(oldPath, newPath, callback) {
    // Use our safe file operation with retry logic
    dbUtils.safeFileOperation('rename', oldPath, newPath)
        .then(() => callback(null))
        .catch(err => callback(err));
};

/**
 * Patch the original fs.renameSync function to handle ENOENT errors with retry logic
 */
const originalRenameSync = fs.renameSync;
fs.renameSync = function(oldPath, newPath) {
    // For sync operations, we'll use a simplified retry approach
    const maxRetries = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            // Check if source file exists before attempting rename
            if (fs.existsSync(oldPath)) {
                return originalRenameSync(oldPath, newPath);
            } else {
                throw new Error(`Source file does not exist: ${oldPath}`);
            }
        } catch (error) {
            lastError = error;
            
            // Special handling for ENOENT errors
            if (error.code === 'ENOENT' && attempt < maxRetries) {
                console.warn(`ENOENT error during rename (attempt ${attempt}/${maxRetries}): ${oldPath} -> ${newPath}`, error);
                
                // Wait before retry with exponential backoff
                const delay = Math.pow(2, attempt) * 50; // 100ms, 200ms, 400ms
                const start = Date.now();
                while (Date.now() - start < delay) {
                    // Busy wait
                }
            } else {
                throw error;
            }
        }
    }
    
    throw lastError;
};

/**
 * Initialize the NeDB patch
 * This should be called before any NeDB instances are created
 */
function initializePatch() {
    console.log("Initializing NeDB ENOENT error handling patch...");
    
    // The patch is already applied above by replacing fs.rename and fs.renameSync
    console.log("NeDB ENOENT error handling patch initialized successfully");
}

/**
 * Restore the original fs functions
 * Useful for testing or if the patch causes issues
 */
function restoreOriginal() {
    fs.rename = originalRename;
    fs.renameSync = originalRenameSync;
    console.log("Original fs.rename functions restored");
}

module.exports = {
    initializePatch,
    restoreOriginal
};