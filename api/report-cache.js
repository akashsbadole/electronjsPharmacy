const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const moment = require("moment");
const dbUtils = require("./db-utils");

// Initialize databases
const reportCacheDB = new Datastore({ filename: dbUtils.getDatabasePath("report-cache.db"), autoload: true });

// Create indexes for better performance
reportCacheDB.ensureIndex({ fieldName: "cacheKey" });
reportCacheDB.ensureIndex({ fieldName: "expiresAt" });
reportCacheDB.ensureIndex({ fieldName: "reportId" });

// In-memory cache for frequently accessed reports
const memoryCache = new Map();
const MAX_MEMORY_CACHE_SIZE = 100;
const DEFAULT_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get welcome message for Report Cache API.
 */
router.get("/", function (req, res) {
    res.send("Report Cache API");
});

/**
 * POST endpoint: Store report data in cache
 */
router.post("/store", function (req, res) {
    const { cacheKey, reportId, data, ttl = DEFAULT_CACHE_TTL } = req.body;

    if (!cacheKey || !reportId || !data) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Cache key, report ID, and data are required.",
        });
    }

    const expiresAt = new Date(Date.now() + ttl);

    // Store in memory cache
    storeInMemoryCache(cacheKey, {
        data: data,
        reportId: reportId,
        expiresAt: expiresAt,
        cachedAt: new Date()
    });

    // Store in persistent cache
    const cacheEntry = {
        cacheKey: cacheKey,
        reportId: reportId,
        data: data,
        expiresAt: expiresAt,
        cachedAt: new Date(),
        ttl: ttl
    };

    reportCacheDB.insert(cacheEntry, function (err, newEntry) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to store cache entry.",
            });
        }

        res.status(201).json({
            message: "Cache entry stored successfully",
            cacheKey: cacheKey,
            expiresAt: expiresAt
        });
    });
});

/**
 * GET endpoint: Retrieve report data from cache
 */
router.get("/retrieve/:cacheKey", function (req, res) {
    const { cacheKey } = req.params;

    // First check memory cache
    const memoryEntry = getFromMemoryCache(cacheKey);
    if (memoryEntry) {
        return res.json({
            data: memoryEntry.data,
            cachedAt: memoryEntry.cachedAt,
            expiresAt: memoryEntry.expiresAt,
            source: "memory"
        });
    }

    // Check persistent cache
    reportCacheDB.findOne({ cacheKey: cacheKey }, function (err, entry) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve cache entry.",
            });
        }

        if (!entry) {
            return res.status(404).json({
                error: "Not Found",
                message: "Cache entry not found.",
            });
        }

        // Check if cache entry has expired
        if (new Date() > entry.expiresAt) {
            // Remove expired entry
            reportCacheDB.remove({ cacheKey: cacheKey }, {});
            return res.status(404).json({
                error: "Not Found",
                message: "Cache entry has expired.",
            });
        }

        // Store in memory cache for faster future access
        storeInMemoryCache(cacheKey, {
            data: entry.data,
            reportId: entry.reportId,
            expiresAt: entry.expiresAt,
            cachedAt: entry.cachedAt
        });

        res.json({
            data: entry.data,
            cachedAt: entry.cachedAt,
            expiresAt: entry.expiresAt,
            source: "persistent"
        });
    });
});

/**
 * DELETE endpoint: Remove cache entry
 */
router.delete("/remove/:cacheKey", function (req, res) {
    const { cacheKey } = req.params;

    // Remove from memory cache
    removeFromMemoryCache(cacheKey);

    // Remove from persistent cache
    reportCacheDB.remove({ cacheKey: cacheKey }, {}, function (err, numRemoved) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to remove cache entry.",
            });
        }

        res.json({
            message: "Cache entry removed successfully",
            cacheKey: cacheKey
        });
    });
});

/**
 * DELETE endpoint: Clear expired cache entries
 */
router.delete("/cleanup", function (req, res) {
    const now = new Date();

    // Clean up memory cache
    cleanupMemoryCache();

    // Clean up persistent cache
    reportCacheDB.remove({ expiresAt: { $lt: now } }, { multi: true }, function (err, numRemoved) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to cleanup cache entries.",
            });
        }

        res.json({
            message: "Cache cleanup completed",
            expiredEntriesRemoved: numRemoved
        });
    });
});

/**
 * DELETE endpoint: Clear all cache entries for a specific report
 */
router.delete("/clear/:reportId", function (req, res) {
    const { reportId } = req.params;

    // Remove from memory cache
    clearReportFromMemoryCache(reportId);

    // Remove from persistent cache
    reportCacheDB.remove({ reportId: reportId }, { multi: true }, function (err, numRemoved) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to clear cache entries.",
            });
        }

        res.json({
            message: "Report cache cleared successfully",
            reportId: reportId,
            entriesRemoved: numRemoved
        });
    });
});

/**
 * GET endpoint: Get cache statistics
 */
router.get("/stats", function (req, res) {
    const now = new Date();

    // Memory cache stats
    const memoryStats = {
        size: memoryCache.size,
        maxSize: MAX_MEMORY_CACHE_SIZE,
        entries: Array.from(memoryCache.entries()).map(([key, value]) => ({
            cacheKey: key,
            reportId: value.reportId,
            cachedAt: value.cachedAt,
            expiresAt: value.expiresAt,
            isExpired: now > value.expiresAt
        }))
    };

    // Persistent cache stats
    reportCacheDB.find({}, function (err, entries) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve cache statistics.",
            });
        }

        const persistentStats = {
            totalEntries: entries.length,
            expiredEntries: entries.filter(entry => now > entry.expiresAt).length,
            validEntries: entries.filter(entry => now <= entry.expiresAt).length,
            entriesByReport: entries.reduce((acc, entry) => {
                acc[entry.reportId] = (acc[entry.reportId] || 0) + 1;
                return acc;
            }, {})
        };

        res.json({
            memory: memoryStats,
            persistent: persistentStats,
            generatedAt: new Date()
        });
    });
});

/**
 * POST endpoint: Generate cache key from report configuration
 */
router.post("/generate-key", function (req, res) {
    const { reportConfig, filters, page, limit } = req.body;

    if (!reportConfig) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Report configuration is required.",
        });
    }

    const cacheKey = generateCacheKey(reportConfig, filters, page, limit);

    res.json({
        cacheKey: cacheKey
    });
});

/**
 * Helper functions for memory cache management
 */

function storeInMemoryCache(key, value) {
    // Remove oldest entry if cache is full
    if (memoryCache.size >= MAX_MEMORY_CACHE_SIZE) {
        const firstKey = memoryCache.keys().next().value;
        memoryCache.delete(firstKey);
    }

    memoryCache.set(key, value);
}

function getFromMemoryCache(key) {
    const entry = memoryCache.get(key);
    
    if (!entry) {
        return null;
    }

    // Check if entry has expired
    if (new Date() > entry.expiresAt) {
        memoryCache.delete(key);
        return null;
    }

    return entry;
}

function removeFromMemoryCache(key) {
    return memoryCache.delete(key);
}

function cleanupMemoryCache() {
    const now = new Date();
    
    for (const [key, value] of memoryCache.entries()) {
        if (now > value.expiresAt) {
            memoryCache.delete(key);
        }
    }
}

function clearReportFromMemoryCache(reportId) {
    for (const [key, value] of memoryCache.entries()) {
        if (value.reportId === reportId) {
            memoryCache.delete(key);
        }
    }
}

/**
 * Helper function to generate cache key
 */
function generateCacheKey(reportConfig, filters, page, limit) {
    const keyComponents = [
        reportConfig.dataSource || "",
        JSON.stringify(reportConfig.fields || []),
        JSON.stringify(filters || {}),
        page || 1,
        limit || 50
    ];

    // Create a hash from the components
    const keyString = keyComponents.join("|");
    
    // Simple hash function (in production, use a proper crypto hash)
    let hash = 0;
    for (let i = 0; i < keyString.length; i++) {
        const char = keyString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }

    return `report_${Math.abs(hash)}`;
}

/**
 * Middleware function for caching report results
 */
function cacheMiddleware(ttl = DEFAULT_CACHE_TTL) {
    return function (req, res, next) {
        const { reportConfig, filters, page, limit } = req.body;
        
        if (!reportConfig) {
            return next();
        }

        const cacheKey = generateCacheKey(reportConfig, filters, page, limit);

        // Try to get from cache
        getFromMemoryCache(cacheKey, function (err, cachedData) {
            if (err || !cachedData) {
                // Not in cache, proceed with request
                req.cacheKey = cacheKey;
                req.cacheTTL = ttl;
                
                // Override res.json to cache the response
                const originalJson = res.json;
                res.json = function (data) {
                    // Cache the response if successful
                    if (res.statusCode === 200 && data && data.data) {
                        storeInMemoryCache(cacheKey, {
                            data: data,
                            reportId: reportConfig._id || reportConfig.name,
                            expiresAt: new Date(Date.now() + ttl),
                            cachedAt: new Date()
                        });
                    }
                    
                    return originalJson.call(this, data);
                };
                
                return next();
            }

            // Return cached data
            res.json({
                ...cachedData.data,
                cached: true,
                cachedAt: cachedData.cachedAt,
                cacheKey: cacheKey
            });
        });
    };
}

/**
 * Function to invalidate cache for a report
 */
function invalidateReportCache(reportId) {
    // Remove from memory cache
    clearReportFromMemoryCache(reportId);
    
    // Remove from persistent cache
    reportCacheDB.remove({ reportId: reportId }, { multi: true }, function (err) {
        if (err) {
            console.error("Failed to invalidate report cache:", err);
        }
    });
}

// Export utility functions
router.cacheMiddleware = cacheMiddleware;
router.invalidateReportCache = invalidateReportCache;
router.generateCacheKey = generateCacheKey;

// Schedule periodic cleanup
setInterval(() => {
    cleanupMemoryCache();
    
    const now = new Date();
    reportCacheDB.remove({ expiresAt: { $lt: now } }, { multi: true }, function (err) {
        if (err) {
            console.error("Failed to cleanup expired cache entries:", err);
        }
    });
}, 5 * 60 * 1000); // Run every 5 minutes