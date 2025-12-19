const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const validator = require("validator");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "stock-count-items.db",
);

router.use(bodyParser.json());

module.exports = router;

let stockCountItemsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

stockCountItemsDB.ensureIndex({ fieldName: "_id", unique: true });
stockCountItemsDB.ensureIndex({ fieldName: "countSessionId" });
stockCountItemsDB.ensureIndex({ fieldName: "productId" });
stockCountItemsDB.ensureIndex({ fieldName: "batchId" });
stockCountItemsDB.ensureIndex({ fieldName: "countStatus" });
stockCountItemsDB.ensureIndex({ fieldName: "isHighVariance" });

// Initialize related databases
const inventoryDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "inventory.db",
);

const inventoryDB = new Datastore({
    filename: inventoryDBPath,
    autoload: true,
});

const batchesDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "batches.db",
);

const batchesDB = new Datastore({
    filename: batchesDBPath,
    autoload: true,
});

const stockCountingDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "stock-counting.db",
);

const stockCountingDB = new Datastore({
    filename: stockCountingDBPath,
    autoload: true,
});

/**
 * GET endpoint: Get the welcome message for the Stock Count Items API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Stock Count Items API");
});

/**
 * GET endpoint: Retrieve count items for a specific session with pagination and filtering.
 *
 * @param {Object} req request object with session ID, pagination and filter parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/session/:sessionId", function (req, res) {
    if (!req.params.sessionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID is required.",
        });
    }
    
    const sessionId = parseInt(req.params.sessionId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    
    // Build query based on filters
    let query = { countSessionId: sessionId };
    
    if (req.query.status) {
        query.countStatus = validator.escape(req.query.status);
    }
    if (req.query.location) {
        query.locationRack = new RegExp(validator.escape(req.query.location), 'i');
    }
    if (req.query.variance === 'true') {
        query.isHighVariance = true;
    }
    if (req.query.barcodeScanned === 'true') {
        query.barcodeScanned = true;
    }
    
    stockCountItemsDB.find(query)
        .sort({ locationRack: 1, locationShelf: 1 })
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
            
            // Get product details for each count item
            const productIds = docs.map(item => item.productId);
            const batchIds = docs.filter(item => item.batchId).map(item => item.batchId);
            
            async.parallel({
                products: function(callback) {
                    if (productIds.length === 0) {
                        return callback(null, []);
                    }
                    inventoryDB.find({ _id: { $in: productIds } }, callback);
                },
                batches: function(callback) {
                    if (batchIds.length === 0) {
                        return callback(null, []);
                    }
                    batchesDB.find({ _id: { $in: batchIds } }, callback);
                }
            }, function(err, results) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to load product details.",
                    });
                }
                
                // Enrich count items with product and batch details
                const enrichedItems = docs.map(item => {
                    const product = results.products.find(p => p._id === item.productId);
                    const batch = results.batches.find(b => b._id === item.batchId);
                    
                    return {
                        ...item,
                        productName: product ? product.name : 'Unknown Product',
                        productBarcode: product ? product.barcode : null,
                        batchNumber: batch ? batch.batchNumber : null,
                        batchExpiry: batch ? batch.expiryDate : null
                    };
                });
                
                // Get total count for pagination
                stockCountItemsDB.count(query, function (err, count) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.json({
                        countItems: enrichedItems,
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
});

/**
 * GET endpoint: Get specific count item by ID.
 *
 * @param {Object} req request object with count item ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Count item ID is required.",
        });
    }
    
    stockCountItemsDB.findOne({ _id: parseInt(req.params.id) }, function (err, countItem) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!countItem) {
            return res.status(404).json({
                error: "Not Found",
                message: "Count item not found.",
            });
        }
        
        // Get product and batch details
        async.parallel({
            product: function(callback) {
                inventoryDB.findOne({ _id: countItem.productId }, callback);
            },
            batch: function(callback) {
                if (countItem.batchId) {
                    batchesDB.findOne({ _id: countItem.batchId }, callback);
                } else {
                    callback(null, null);
                }
            }
        }, function(err, results) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to load item details.",
                });
            }
            
            const enrichedItem = {
                ...countItem,
                productName: results.product ? results.product.name : 'Unknown Product',
                productBarcode: results.product ? results.product.barcode : null,
                batchNumber: results.batch ? results.batch.batchNumber : null,
                batchExpiry: results.batch ? results.batch.expiryDate : null
            };
            
            res.json(enrichedItem);
        });
    });
});

/**
 * PUT endpoint: Update count item.
 *
 * @param {Object} req request object with updated count item data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Count item ID is required.",
        });
    }
    
    const itemId = parseInt(req.params.id);
    
    // Check if count item exists
    stockCountItemsDB.findOne({ _id: itemId }, function (err, existingItem) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingItem) {
            return res.status(404).json({
                error: "Not Found",
                message: "Count item not found.",
            });
        }
        
        // Check if stock count session is active
        stockCountingDB.findOne({ _id: existingItem.countSessionId }, function (err, stockCount) {
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
                    message: "Count items can only be updated for active stock count sessions.",
                });
            }
            
            const updatedItem = {
                countedQuantity: req.body.countedQuantity !== undefined ? parseInt(req.body.countedQuantity) : existingItem.countedQuantity,
                locationRack: req.body.locationRack !== undefined ? validator.escape(req.body.locationRack) : existingItem.locationRack,
                locationShelf: req.body.locationShelf !== undefined ? validator.escape(req.body.locationShelf) : existingItem.locationShelf,
                notes: req.body.notes !== undefined ? validator.escape(req.body.notes) : existingItem.notes,
                barcodeScanned: req.body.barcodeScanned !== undefined ? req.body.barcodeScanned : existingItem.barcodeScanned,
                updatedAt: new Date()
            };
            
            // Update status based on whether quantity has been counted
            if (req.body.countedQuantity !== undefined && req.body.countedQuantity !== null) {
                updatedItem.countStatus = 'COUNTED';
                updatedItem.countedBy = req.body.countedBy ? parseInt(req.body.countedBy) : existingItem.countedBy;
                updatedItem.countedAt = new Date();
                
                // Calculate variance
                const varianceQuantity = req.body.countedQuantity - existingItem.expectedQuantity;
                updatedItem.varianceQuantity = varianceQuantity;
                updatedItem.varianceValue = Math.abs(varianceQuantity) * (existingItem.unitCost || 0);
                
                // Determine if this is a high variance item
                const variancePercentage = existingItem.expectedQuantity > 0 ? 
                    Math.abs((varianceQuantity / existingItem.expectedQuantity) * 100) : 0;
                updatedItem.isHighVariance = variancePercentage > 10 || Math.abs(updatedItem.varianceValue) > 100;
            }
            
            stockCountItemsDB.update({ _id: itemId }, { $set: updatedItem }, {}, function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({ ...updatedItem, _id: itemId });
            });
        });
    });
});

/**
 * POST endpoint: Batch update count items.
 *
 * @param {Object} req request object with batch update data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/batch", function (req, res) {
    if (!req.body.sessionId || !req.body.items) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID and items array are required.",
        });
    }
    
    const sessionId = parseInt(req.body.sessionId);
    const items = req.body.items;
    
    // Check if stock count session is active
    stockCountingDB.findOne({ _id: sessionId }, function (err, stockCount) {
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
                message: "Count items can only be updated for active stock count sessions.",
            });
        }
        
        const updatePromises = items.map(itemData => {
            return new Promise((resolve, reject) => {
                const itemId = parseInt(itemData.id);
                
                stockCountItemsDB.findOne({ _id: itemId, countSessionId: sessionId }, function (err, existingItem) {
                    if (err) {
                        return reject(err);
                    }
                    
                    if (!existingItem) {
                        return reject(new Error(`Count item ${itemId} not found`));
                    }
                    
                    const updatedItem = {
                        countedQuantity: itemData.countedQuantity !== undefined ? parseInt(itemData.countedQuantity) : existingItem.countedQuantity,
                        locationRack: itemData.locationRack !== undefined ? validator.escape(itemData.locationRack) : existingItem.locationRack,
                        locationShelf: itemData.locationShelf !== undefined ? validator.escape(itemData.locationShelf) : existingItem.locationShelf,
                        notes: itemData.notes !== undefined ? validator.escape(itemData.notes) : existingItem.notes,
                        barcodeScanned: itemData.barcodeScanned !== undefined ? itemData.barcodeScanned : existingItem.barcodeScanned,
                        updatedAt: new Date()
                    };
                    
                    // Update status based on whether quantity has been counted
                    if (itemData.countedQuantity !== undefined && itemData.countedQuantity !== null) {
                        updatedItem.countStatus = 'COUNTED';
                        updatedItem.countedBy = itemData.countedBy ? parseInt(itemData.countedBy) : existingItem.countedBy;
                        updatedItem.countedAt = new Date();
                        
                        // Calculate variance
                        const varianceQuantity = itemData.countedQuantity - existingItem.expectedQuantity;
                        updatedItem.varianceQuantity = varianceQuantity;
                        updatedItem.varianceValue = Math.abs(varianceQuantity) * (existingItem.unitCost || 0);
                        
                        // Determine if this is a high variance item
                        const variancePercentage = existingItem.expectedQuantity > 0 ? 
                            Math.abs((varianceQuantity / existingItem.expectedQuantity) * 100) : 0;
                        updatedItem.isHighVariance = variancePercentage > 10 || Math.abs(updatedItem.varianceValue) > 100;
                    }
                    
                    stockCountItemsDB.update({ _id: itemId }, { $set: updatedItem }, {}, function (err, numReplaced) {
                        if (err) {
                            return reject(err);
                        }
                        resolve({ ...updatedItem, _id: itemId });
                    });
                });
            });
        });
        
        Promise.all(updatePromises)
            .then(results => {
                res.json({
                    message: "Batch update completed successfully.",
                    updatedItems: results
                });
            })
            .catch(err => {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to complete batch update.",
                });
            });
    });
});

/**
 * POST endpoint: Process barcode scan for counting.
 *
 * @param {Object} req request object with barcode scan data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/scan", function (req, res) {
    if (!req.body.sessionId || !req.body.barcode) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID and barcode are required.",
        });
    }
    
    const sessionId = parseInt(req.body.sessionId);
    const barcode = validator.escape(req.body.barcode);
    
    // Check if stock count session is active
    stockCountingDB.findOne({ _id: sessionId }, function (err, stockCount) {
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
                message: "Barcode scanning is only available for active stock count sessions.",
            });
        }
        
        // Find product by barcode
        inventoryDB.findOne({ barcode: parseInt(barcode) }, function (err, product) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!product) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Product not found for the given barcode.",
                });
            }
            
            // Find count item for this product in the session
            stockCountItemsDB.findOne({ 
                countSessionId: sessionId, 
                productId: product._id 
            }, function (err, countItem) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (!countItem) {
                    return res.status(404).json({
                        error: "Not Found",
                        message: "Count item not found for this product in the current session.",
                    });
                }
                
                // Return count item details for quick counting
                res.json({
                    countItem: {
                        id: countItem._id,
                        productId: product._id,
                        productName: product.name,
                        expectedQuantity: countItem.expectedQuantity,
                        countedQuantity: countItem.countedQuantity,
                        locationRack: countItem.locationRack,
                        locationShelf: countItem.locationShelf,
                        unitCost: countItem.unitCost
                    },
                    product: {
                        id: product._id,
                        name: product.name,
                        barcode: product.barcode,
                        category: product.category,
                        price: product.price
                    }
                });
            });
        });
    });
});

/**
 * GET endpoint: Get scan-ready items for a session (optimized for mobile scanning).
 *
 * @param {Object} req request object with session ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/session/:sessionId/scan-ready", function (req, res) {
    if (!req.params.sessionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID is required.",
        });
    }
    
    const sessionId = parseInt(req.params.sessionId);
    
    stockCountItemsDB.find({ 
        countSessionId: sessionId,
        countStatus: { $in: ['PENDING', 'COUNTED'] }
    })
    .sort({ locationRack: 1, locationShelf: 1 })
    .exec(function (err, items) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        // Get product details for scan optimization
        const productIds = items.map(item => item.productId);
        
        if (productIds.length === 0) {
            return res.json({ scanItems: [] });
        }
        
        inventoryDB.find({ _id: { $in: productIds } }, function (err, products) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to load product details.",
                });
            }
            
            // Create scan-optimized items
            const scanItems = items.map(item => {
                const product = products.find(p => p._id === item.productId);
                
                return {
                    id: item._id,
                    productId: product._id,
                    productName: product ? product.name : 'Unknown Product',
                    productBarcode: product ? product.barcode : null,
                    expectedQuantity: item.expectedQuantity,
                    countedQuantity: item.countedQuantity,
                    locationRack: item.locationRack,
                    locationShelf: item.locationShelf,
                    countStatus: item.countStatus,
                    isHighVariance: item.isHighVariance
                };
            });
            
            res.json({ scanItems: scanItems });
        });
    });
});

/**
 * PUT endpoint: Verify count item.
 *
 * @param {Object} req request object with verification data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id/verify", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Count item ID is required.",
        });
    }
    
    const itemId = parseInt(req.params.id);
    
    stockCountItemsDB.findOne({ _id: itemId }, function (err, countItem) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!countItem) {
            return res.status(404).json({
                error: "Not Found",
                message: "Count item not found.",
            });
        }
        
        if (countItem.countStatus !== 'COUNTED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Only counted items can be verified.",
            });
        }
        
        const updatedItem = {
            countStatus: 'VERIFIED',
            verifiedBy: req.body.verifiedBy ? parseInt(req.body.verifiedBy) : null,
            verifiedAt: new Date(),
            updatedAt: new Date()
        };
        
        stockCountItemsDB.update({ _id: itemId }, { $set: updatedItem }, {}, function (err, numReplaced) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({ ...updatedItem, _id: itemId });
        });
    });
});
