const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const validator = require("validator");
const path = require("path");
const dbUtils = require("./db-utils");

router.use(bodyParser.json());

module.exports = router;

let stockCountingDB = new Datastore({
    filename: dbUtils.getDatabasePath("stock-counting.db"),
    autoload: true,
});

stockCountingDB.ensureIndex({ fieldName: "_id", unique: true });
stockCountingDB.ensureIndex({ fieldName: "storeId" });
stockCountingDB.ensureIndex({ fieldName: "countStatus" });
stockCountingDB.ensureIndex({ fieldName: "countType" });
stockCountingDB.ensureIndex({ fieldName: "scheduledDate" });

// Initialize related databases
const storeInventoryDB = new Datastore({
    filename: dbUtils.getDatabasePath("store-inventory.db"),
    autoload: true,
});

const inventoryDB = new Datastore({
    filename: dbUtils.getDatabasePath("inventory.db"),
    autoload: true,
});

const storesDB = new Datastore({
    filename: dbUtils.getDatabasePath("stores.db"),
    autoload: true,
});

/**
 * GET endpoint: Get the welcome message for the Stock Counting API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Stock Counting API");
});

/**
 * GET endpoint: Retrieve stock count sessions with pagination and filtering.
 *
 * @param {Object} req request object with pagination and filter parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build query based on filters
    let query = {};
    if (req.query.storeId) {
        query.storeId = parseInt(req.query.storeId);
    }
    if (req.query.status) {
        query.countStatus = validator.escape(req.query.status);
    }
    if (req.query.type) {
        query.countType = validator.escape(req.query.type);
    }
    if (req.query.startDate && req.query.endDate) {
        query.scheduledDate = {
            $gte: validator.escape(req.query.startDate),
            $lte: validator.escape(req.query.endDate)
        };
    }
    
    stockCountingDB.find(query)
        .sort({ scheduledDate: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, docs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get total count for pagination
            stockCountingDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    stockCounts: docs,
                    pagination: {
                        total: count,
                        page: page,
                        limit: limit,
                        pages: Math.ceil(count / limit)
                    }
                });
            });
        });
});

/**
 * POST endpoint: Create new stock count session.
 *
 * @param {Object} req request object with stock count session data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.storeId || !req.body.countName || !req.body.countType) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID, count name, and count type are required fields.",
        });
    }
    
    // Validate count type
    const validTypes = ['FULL', 'PARTIAL', 'CYCLE', 'SPOT', 'EXPIRY'];
    if (!validTypes.includes(req.body.countType)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid count type. Must be one of: FULL, PARTIAL, CYCLE, SPOT, EXPIRY",
        });
    }
    
    // Check if store exists
    storesDB.findOne({ _id: parseInt(req.body.storeId), isActive: true }, function (err, store) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }
        
        // Create new stock count session
        const newStockCount = {
            _id: Math.floor(Date.now() / 1000),
            storeId: parseInt(req.body.storeId),
            countName: validator.escape(req.body.countName),
            countType: validator.escape(req.body.countType),
            countStatus: 'PLANNED',
            scheduledDate: req.body.scheduledDate || new Date().toISOString().split('T')[0],
            startedAt: null,
            completedAt: null,
            assignedTo: req.body.assignedTo || [],
            supervisedBy: req.body.supervisedBy ? parseInt(req.body.supervisedBy) : null,
            approvedBy: null,
            countScope: req.body.countScope || {},
            totalItems: 0,
            countedItems: 0,
            varianceItems: 0,
            totalVarianceValue: 0,
            notes: req.body.notes ? validator.escape(req.body.notes) : null,
            createdBy: req.body.createdBy ? parseInt(req.body.createdBy) : null,
            createdAt: new Date(),
            updatedAt: new Date(),
            syncVersion: 1
        };
        
        stockCountingDB.insert(newStockCount, function (err, stockCount) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Generate count items based on scope
            generateCountItems(stockCount._id, function(err, itemsGenerated) {
                if (err) {
                    console.error("Error generating count items:", err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to generate count items.",
                    });
                }
                
                // Update total items count
                stockCountingDB.update(
                    { _id: stockCount._id },
                    { $set: { totalItems: itemsGenerated } },
                    {},
                    function (err) {
                        if (err) {
                            console.error("Error updating total items:", err);
                        }
                    }
                );
                
                res.status(201).json({
                    ...stockCount,
                    totalItems: itemsGenerated
                });
            });
        });
    });
});

/**
 * GET endpoint: Get specific stock count session by ID.
 *
 * @param {Object} req request object with stock count ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Stock count ID is required.",
        });
    }
    
    stockCountingDB.findOne({ _id: parseInt(req.params.id) }, function (err, stockCount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!stockCount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock count session not found.",
            });
        }
        
        // Get store information
        storesDB.findOne({ _id: stockCount.storeId }, function (err, store) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (store) {
                stockCount.storeName = store.name;
                stockCount.storeCode = store.code;
            }
            
            res.json(stockCount);
        });
    });
});

/**
 * PUT endpoint: Update stock count session.
 *
 * @param {Object} req request object with updated stock count data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Stock count ID is required.",
        });
    }
    
    const countId = parseInt(req.params.id);
    
    // Check if stock count exists
    stockCountingDB.findOne({ _id: countId }, function (err, existingCount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingCount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock count session not found.",
            });
        }
        
        // Validate status transitions
        const validTransitions = {
            'PLANNED': ['ACTIVE', 'CANCELLED'],
            'ACTIVE': ['PAUSED', 'COMPLETED'],
            'PAUSED': ['ACTIVE', 'COMPLETED', 'CANCELLED'],
            'COMPLETED': [],
            'CANCELLED': []
        };
        
        if (req.body.countStatus && !validTransitions[existingCount.countStatus].includes(req.body.countStatus)) {
            return res.status(400).json({
                error: "Bad Request",
                message: `Invalid status transition from ${existingCount.countStatus} to ${req.body.countStatus}`,
            });
        }
        
        const updatedCount = {
            countName: req.body.countName ? validator.escape(req.body.countName) : existingCount.countName,
            countStatus: req.body.countStatus ? validator.escape(req.body.countStatus) : existingCount.countStatus,
            scheduledDate: req.body.scheduledDate ? validator.escape(req.body.scheduledDate) : existingCount.scheduledDate,
            assignedTo: req.body.assignedTo !== undefined ? req.body.assignedTo : existingCount.assignedTo,
            supervisedBy: req.body.supervisedBy !== undefined ? (req.body.supervisedBy ? parseInt(req.body.supervisedBy) : null) : existingCount.supervisedBy,
            notes: req.body.notes !== undefined ? validator.escape(req.body.notes) : existingCount.notes,
            updatedAt: new Date(),
            syncVersion: existingCount.syncVersion + 1
        };
        
        // Set timestamps based on status changes
        if (req.body.countStatus === 'ACTIVE' && existingCount.countStatus !== 'ACTIVE') {
            updatedCount.startedAt = new Date();
        }
        if (req.body.countStatus === 'COMPLETED' && existingCount.countStatus !== 'COMPLETED') {
            updatedCount.completedAt = new Date();
        }
        
        stockCountingDB.update({ _id: countId }, { $set: updatedCount }, {}, function (err, numReplaced) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({ ...updatedCount, _id: countId });
        });
    });
});

/**
 * DELETE endpoint: Cancel stock count session.
 *
 * @param {Object} req request object with stock count ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Stock count ID is required.",
        });
    }
    
    const countId = parseInt(req.params.id);
    
    // Check if stock count exists and can be cancelled
    stockCountingDB.findOne({ _id: countId }, function (err, stockCount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!stockCount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock count session not found.",
            });
        }
        
        if (stockCount.countStatus !== 'PLANNED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Only planned stock counts can be cancelled.",
            });
        }
        
        stockCountingDB.update(
            { _id: countId },
            { $set: { countStatus: 'CANCELLED', updatedAt: new Date() } },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({ message: "Stock count session cancelled successfully." });
            }
        );
    });
});

/**
 * POST endpoint: Start stock count session.
 *
 * @param {Object} req request object with stock count ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/:id/start", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Stock count ID is required.",
        });
    }
    
    const countId = parseInt(req.params.id);
    
    stockCountingDB.findOne({ _id: countId }, function (err, stockCount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!stockCount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock count session not found.",
            });
        }
        
        if (stockCount.countStatus !== 'PLANNED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Only planned stock counts can be started.",
            });
        }
        
        stockCountingDB.update(
            { _id: countId },
            { 
                $set: { 
                    countStatus: 'ACTIVE',
                    startedAt: new Date(),
                    updatedAt: new Date()
                }
            },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({ message: "Stock count session started successfully." });
            }
        );
    });
});

/**
 * POST endpoint: Complete stock count session.
 *
 * @param {Object} req request object with stock count ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/:id/complete", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Stock count ID is required.",
        });
    }
    
    const countId = parseInt(req.params.id);
    
    stockCountingDB.findOne({ _id: countId }, function (err, stockCount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!stockCount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock count session not found.",
            });
        }
        
        if (stockCount.countStatus !== 'ACTIVE') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Only active stock counts can be completed.",
            });
        }
        
        // Calculate final statistics
        calculateCountStatistics(countId, function(err, stats) {
            if (err) {
                console.error("Error calculating statistics:", err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to calculate count statistics.",
                });
            }
            
            stockCountingDB.update(
                { _id: countId },
                { 
                    $set: { 
                        countStatus: 'COMPLETED',
                        completedAt: new Date(),
                        countedItems: stats.countedItems,
                        varianceItems: stats.varianceItems,
                        totalVarianceValue: stats.totalVarianceValue,
                        updatedAt: new Date()
                    }
                },
                {},
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.json({ 
                        message: "Stock count session completed successfully.",
                        statistics: stats
                    });
                }
            );
        });
    });
});

/**
 * Helper function to generate count items based on scope
 *
 * @param {number} countSessionId stock count session ID
 * @param {function} callback callback function
 * @returns {void}
 */
function generateCountItems(countSessionId, callback) {
    stockCountingDB.findOne({ _id: countSessionId }, function (err, stockCount) {
        if (err) {
            return callback(err);
        }
        
        if (!stockCount) {
            return callback(new Error("Stock count session not found"));
        }
        
        // Build query based on count scope
        let query = { storeId: stockCount.storeId };
        
        // Apply scope filters
        if (stockCount.countScope && Object.keys(stockCount.countScope).length > 0) {
            const scope = stockCount.countScope;
            
            if (scope.categories && scope.categories.length > 0) {
                // Will need to join with inventory for category filtering
                // For now, get all store inventory and filter later
            }
            
            if (scope.suppliers && scope.suppliers.length > 0) {
                // Will need to join with batches for supplier filtering
            }
            
            if (scope.valueRange) {
                query.$or = [
                    { quantity: { $gte: scope.valueRange.min || 0 } },
                    { quantity: { $lte: scope.valueRange.max || Number.MAX_SAFE_INTEGER } }
                ];
            }
        }
        
        storeInventoryDB.find(query, function (err, storeInventories) {
            if (err) {
                return callback(err);
            }
            
            // Get product details for all store inventory items
            const productIds = storeInventories.map(si => si.productId);
            
            if (productIds.length === 0) {
                return callback(null, 0);
            }
            
            inventoryDB.find({ _id: { $in: productIds } }, function (err, products) {
                if (err) {
                    return callback(err);
                }
                
                // Filter products based on scope criteria
                let filteredProducts = products;
                
                if (stockCount.countScope && stockCount.countScope.categories && stockCount.countScope.categories.length > 0) {
                    filteredProducts = filteredProducts.filter(p => 
                        stockCount.countScope.categories.includes(p.category)
                    );
                }
                
                // Create count items
                const countItems = [];
                const stockCountItemsDB = new Datastore({
                    filename: dbUtils.getDatabasePath("stock-count-items.db"),
                    autoload: true
                });
                
                filteredProducts.forEach(product => {
                    const storeInventory = storeInventories.find(si => si.productId === product._id);
                    const expectedQuantity = storeInventory ? storeInventory.quantity : product.quantity || 0;
                    
                    const countItem = {
                        _id: Math.floor(Date.now() / 1000) + Math.random(),
                        countSessionId: countSessionId,
                        productId: product._id,
                        batchId: null,
                        expectedQuantity: expectedQuantity,
                        countedQuantity: null,
                        varianceQuantity: null,
                        unitCost: product.price || 0,
                        varianceValue: null,
                        countStatus: 'PENDING',
                        countedBy: null,
                        countedAt: null,
                        verifiedBy: null,
                        verifiedAt: null,
                        locationRack: product.rackLocation || null,
                        locationShelf: product.shelfLocation || null,
                        notes: null,
                        barcodeScanned: false,
                        expiryDate: product.expirationDate || null,
                        isHighVariance: false,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    countItems.push(countItem);
                });
                
                // Insert count items in batch
                if (countItems.length > 0) {
                    stockCountItemsDB.insert(countItems, function (err, items) {
                        if (err) {
                            return callback(err);
                        }
                        callback(null, items.length);
                    });
                } else {
                    callback(null, 0);
                }
            });
        });
    });
}

/**
 * Helper function to calculate count statistics
 *
 * @param {number} countSessionId stock count session ID
 * @param {function} callback callback function
 * @returns {void}
 */
function calculateCountStatistics(countSessionId, callback) {
    const stockCountItemsDB = new Datastore({
        filename: dbUtils.getDatabasePath("stock-count-items.db"),
        autoload: true
    });
    
    stockCountItemsDB.find({ countSessionId: countSessionId }, function (err, items) {
        if (err) {
            return callback(err);
        }
        
        const countedItems = items.filter(item => item.countStatus === 'COUNTED' || item.countStatus === 'VERIFIED').length;
        const varianceItems = items.filter(item => item.varianceQuantity !== 0 && item.varianceQuantity !== null).length;
        
        let totalVarianceValue = 0;
        items.forEach(item => {
            if (item.varianceValue) {
                totalVarianceValue += Math.abs(item.varianceValue);
            }
        });
        
        callback(null, {
            countedItems: countedItems,
            varianceItems: varianceItems,
            totalVarianceValue: totalVarianceValue
        });
    });
}

module.exports.generateCountItems = generateCountItems;
module.exports.calculateCountStatistics = calculateCountStatistics;