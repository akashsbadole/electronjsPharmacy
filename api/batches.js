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
    "batches.db",
);

router.use(bodyParser.json());

module.exports = router;

let batchesDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

batchesDB.ensureIndex({ fieldName: "_id", unique: true });
batchesDB.ensureIndex({ fieldName: "productId" });
batchesDB.ensureIndex({ fieldName: "expiryDate" });
batchesDB.ensureIndex({ fieldName: "batchNumber" });

/**
 * GET endpoint: Get the welcome message for the Batches API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Batches API");
});

/**
 * GET endpoint: Retrieve batch records with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build query based on filters
    let query = {};
    if (req.query.productId) {
        query.productId = parseInt(req.query.productId);
    }
    if (req.query.supplierId) {
        query.supplierId = parseInt(req.query.supplierId);
    }
    
    batchesDB.find(query)
        .sort({ expiryDate: 1 })
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
            batchesDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    batches: docs,
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
 * POST endpoint: Add new batch.
 *
 * @param {Object} req request object with batch data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.productId || !req.body.batchNumber || !req.body.expiryDate) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product ID, batch number, and expiry date are required fields.",
        });
    }
    
    // Check if batch with same number and product already exists
    batchesDB.findOne({
        productId: parseInt(req.body.productId),
        batchNumber: validator.escape(req.body.batchNumber)
    }, function (err, existingBatch) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (existingBatch) {
            return res.status(409).json({
                error: "Conflict",
                message: "A batch with this number already exists for this product.",
            });
        }
        
        // Create new batch
        const newBatch = {
            _id: Math.floor(Date.now() / 1000),
            productId: parseInt(req.body.productId),
            batchNumber: validator.escape(req.body.batchNumber),
            expiryDate: validator.escape(req.body.expiryDate),
            manufacturingDate: validator.escape(req.body.manufacturingDate) || null,
            initialQuantity: parseInt(req.body.initialQuantity) || 0,
            currentQuantity: parseInt(req.body.currentQuantity) || parseInt(req.body.initialQuantity) || 0,
            costPrice: parseFloat(req.body.costPrice) || 0,
            sellingPrice: parseFloat(req.body.sellingPrice) || 0,
            supplierId: req.body.supplierId ? parseInt(req.body.supplierId) : null,
            rackLocation: validator.escape(req.body.rackLocation) || null,
            shelfLocation: validator.escape(req.body.shelfLocation) || null,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        batchesDB.insert(newBatch, function (err, batch) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Update inventory with batch information
            updateInventoryWithBatch(newBatch);
            
            res.status(201).json(batch);
        });
    });
});

/**
 * GET endpoint: Get specific batch by ID.
 *
 * @param {Object} req request object with batch ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Batch ID is required.",
        });
    }
    
    batchesDB.findOne({ _id: parseInt(req.params.id) }, function (err, batch) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!batch) {
            return res.status(404).json({
                error: "Not Found",
                message: "Batch not found.",
            });
        }
        
        res.json(batch);
    });
});

/**
 * Helper function to update batch
 *
 * @param {number} batchId - The ID of the batch to update
 * @param {Object} existingBatch - The existing batch data
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @returns {void}
 */
function updateBatch(batchId, existingBatch, req, res) {
    const updatedBatch = {
        productId: req.body.productId ? parseInt(req.body.productId) : existingBatch.productId,
        batchNumber: req.body.batchNumber ? validator.escape(req.body.batchNumber) : existingBatch.batchNumber,
        expiryDate: req.body.expiryDate ? validator.escape(req.body.expiryDate) : existingBatch.expiryDate,
        manufacturingDate: req.body.manufacturingDate ? validator.escape(req.body.manufacturingDate) : existingBatch.manufacturingDate,
        initialQuantity: req.body.initialQuantity ? parseInt(req.body.initialQuantity) : existingBatch.initialQuantity,
        currentQuantity: req.body.currentQuantity !== undefined ? parseInt(req.body.currentQuantity) : existingBatch.currentQuantity,
        costPrice: req.body.costPrice !== undefined ? parseFloat(req.body.costPrice) : existingBatch.costPrice,
        sellingPrice: req.body.sellingPrice !== undefined ? parseFloat(req.body.sellingPrice) : existingBatch.sellingPrice,
        supplierId: req.body.supplierId !== undefined ? (req.body.supplierId ? parseInt(req.body.supplierId) : null) : existingBatch.supplierId,
        rackLocation: req.body.rackLocation !== undefined ? validator.escape(req.body.rackLocation) : existingBatch.rackLocation,
        shelfLocation: req.body.shelfLocation !== undefined ? validator.escape(req.body.shelfLocation) : existingBatch.shelfLocation,
        isActive: req.body.isActive !== undefined ? req.body.isActive : existingBatch.isActive,
        updatedAt: new Date()
    };
    
    batchesDB.update({ _id: batchId }, { $set: updatedBatch }, {}, function (err, numReplaced) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        // Update inventory with batch information
        updateInventoryWithBatch(updatedBatch);
        
        res.json({ ...updatedBatch, _id: batchId });
    });
}

/**
 * PUT endpoint: Update batch.
 *
 * @param {Object} req request object with updated batch data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Batch ID is required.",
        });
    }
    
    const batchId = parseInt(req.params.id);
    
    // Check if batch exists
    batchesDB.findOne({ _id: batchId }, function (err, existingBatch) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingBatch) {
            return res.status(404).json({
                error: "Not Found",
                message: "Batch not found.",
            });
        }
        
        // Check for duplicate batch number if it's being changed
        if (req.body.batchNumber && req.body.batchNumber !== existingBatch.batchNumber) {
            batchesDB.findOne({
                productId: parseInt(req.body.productId) || existingBatch.productId,
                batchNumber: validator.escape(req.body.batchNumber),
                _id: { $ne: batchId }
            }, function (err, duplicateBatch) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (duplicateBatch) {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "A batch with this number already exists for this product.",
                    });
                }
                
                updateBatch(batchId, existingBatch, req, res);
            });
        } else {
            updateBatch(batchId, existingBatch, req, res);
        }
    });
});

/**
 * DELETE endpoint: Delete batch.
 *
 * @param {Object} req request object with batch ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Batch ID is required.",
        });
    }
    
    const batchId = parseInt(req.params.id);
    
    // Check if batch exists and has quantity
    batchesDB.findOne({ _id: batchId }, function (err, batch) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!batch) {
            return res.status(404).json({
                error: "Not Found",
                message: "Batch not found.",
            });
        }
        
        if (batch.currentQuantity > 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete batch with remaining quantity. Adjust quantity to zero first.",
            });
        }
        
        batchesDB.remove({ _id: batchId }, function (err, numRemoved) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({ message: "Batch deleted successfully." });
        });
    });
});

/**
 * GET endpoint: Get batches expiring within 30 days.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/expiring-soon", function (req, res) {
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    
    batchesDB.find({
        expiryDate: { 
            $gte: today.toISOString().split('T')[0],
            $lte: thirtyDaysFromNow.toISOString().split('T')[0]
        },
        currentQuantity: { $gt: 0 },
        isActive: true
    }).sort({ expiryDate: 1 }).exec(function (err, batches) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.json(batches);
    });
});

/**
 * GET endpoint: Get expired batches.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/expired", function (req, res) {
    const today = new Date();
    
    batchesDB.find({
        expiryDate: { $lt: today.toISOString().split('T')[0] },
        currentQuantity: { $gt: 0 },
        isActive: true
    }).sort({ expiryDate: 1 }).exec(function (err, batches) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.json(batches);
    });
});

/**
 * GET endpoint: Get all batches for a product.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/product/:productId", function (req, res) {
    if (!req.params.productId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product ID is required.",
        });
    }
    
    const productId = parseInt(req.params.productId);
    
    batchesDB.find({ 
        productId: productId,
        isActive: true
    }).sort({ expiryDate: 1 }).exec(function (err, batches) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.json(batches);
    });
});

/**
 * Helper function to update inventory with batch information
 *
 * @param {Object} batch batch object
 * @returns {void}
 */
function updateInventoryWithBatch(batch) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const inventoryDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "inventory.db",
    );
    
    const inventoryDB = new Datastore({
        filename: inventoryDbPath,
        autoload: true,
    });
    
    // Update product with batch-related information
    inventoryDB.update(
        { _id: batch.productId },
        { 
            $set: {
                hasBatchTracking: true,
                updatedAt: new Date()
            }
        },
        {},
        function (err, numReplaced) {
            if (err) {
                console.error("Error updating inventory with batch info:", err);
            }
        }
    );
}

/**
 * GET endpoint: Get batches for stock counting.
 *
 * @param {Object} req request object with stock count parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/stock-count/:sessionId", function (req, res) {
    if (!req.params.sessionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID is required.",
        });
    }
    
    const sessionId = parseInt(req.params.sessionId);
    
    // Get stock count session details
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
        
        // Build query based on count scope
        let query = { isActive: true, currentQuantity: { $gt: 0 } };
        
        // Apply scope filters if specified
        if (stockCount.countScope && Object.keys(stockCount.countScope).length > 0) {
            const scope = stockCount.countScope;
            
            if (scope.products && scope.products.length > 0) {
                query.productId = { $in: scope.products };
            }
            
            if (scope.suppliers && scope.suppliers.length > 0) {
                query.supplierId = { $in: scope.suppliers };
            }
            
            if (scope.expiryDate) {
                if (scope.expiryDate.before) {
                    query.expiryDate = { $lte: scope.expiryDate.before };
                }
                if (scope.expiryDate.after) {
                    query.expiryDate = query.expiryDate || {};
                    query.expiryDate.$gte = scope.expiryDate.after;
                }
            }
        }
        
        batchesDB.find(query)
            .sort({ expiryDate: 1 })
            .exec(function (err, batches) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get product details for each batch
                const productIds = batches.map(batch => batch.productId);
                
                if (productIds.length === 0) {
                    return res.json({
                        batches: [],
                        sessionId: sessionId,
                        countType: stockCount.countType
                    });
                }
                
                const inventoryDbPath = path.join(
                    process.env.APPDATA,
                    process.env.APPNAME,
                    "server",
                    "databases",
                    "inventory.db",
                );
                
                const inventoryDB = new Datastore({
                    filename: inventoryDbPath,
                    autoload: true,
                });
                
                inventoryDB.find({ _id: { $in: productIds } }, function (err, products) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to load product details.",
                        });
                    }
                    
                    // Get store inventory quantities
                    const storeInventoryDBPath = path.join(
                        process.env.APPDATA,
                        process.env.APPNAME,
                        "server",
                        "databases",
                        "store-inventory.db",
                    );
                    
                    const storeInventoryDB = new Datastore({
                        filename: storeInventoryDBPath,
                        autoload: true,
                    });
                    
                    storeInventoryDB.find({
                        productId: { $in: productIds },
                        storeId: stockCount.storeId
                    }, function(err, storeInventories) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "Failed to load store inventory.",
                            });
                        }
                        
                        // Enrich batches with product and store inventory details
                        const enrichedBatches = batches.map(batch => {
                            const product = products.find(p => p._id === batch.productId);
                            const storeInventory = storeInventories.find(si => si.productId === batch.productId);
                            
                            const today = new Date();
                            const expiryDate = new Date(batch.expiryDate);
                            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
                            
                            return {
                                ...batch,
                                productName: product ? product.name : 'Unknown Product',
                                productBarcode: product ? product.barcode : null,
                                productCategory: product ? product.category : null,
                                storeQuantity: storeInventory ? storeInventory.quantity : 0,
                                daysUntilExpiry: daysUntilExpiry,
                                expiryStatus: daysUntilExpiry < 0 ? 'EXPIRED' :
                                             daysUntilExpiry <= 30 ? 'EXPIRING_SOON' :
                                             daysUntilExpiry <= 90 ? 'EXPIRING' : 'OK',
                                totalValue: batch.currentQuantity * (product ? product.price || 0 : 0)
                            };
                        });
                        
                        res.json({
                            batches: enrichedBatches,
                            sessionId: sessionId,
                            countType: stockCount.countType,
                            storeId: stockCount.storeId
                        });
                    });
                });
            });
    });
});

/**
 * POST endpoint: Update batch quantities from stock count.
 *
 * @param {Object} req request object with batch update data.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/update-from-stock-count", function (req, res) {
    if (!req.body.sessionId || !req.body.batches) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID and batches array are required.",
        });
    }
    
    const sessionId = parseInt(req.body.sessionId);
    const batchUpdates = req.body.batches;
    
    // Verify stock count session
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
        
        if (stockCount.countStatus !== 'COMPLETED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Batch quantities can only be updated from completed stock counts.",
            });
        }
        
        // Process each batch update
        const updatePromises = batchUpdates.map(batchData => {
            return new Promise((resolve, reject) => {
                const batchId = parseInt(batchData.batchId);
                const countedQuantity = parseInt(batchData.countedQuantity);
                
                // Find existing batch
                batchesDB.findOne({ _id: batchId }, function (err, batch) {
                    if (err) {
                        return reject(err);
                    }
                    
                    if (!batch) {
                        return reject(new Error(`Batch ${batchId} not found`));
                    }
                    
                    const variance = countedQuantity - batch.currentQuantity;
                    
                    // Update batch quantity
                    batchesDB.update(
                        { _id: batchId },
                        {
                            $set: {
                                currentQuantity: countedQuantity,
                                lastCounted: new Date(),
                                lastCountSession: sessionId
                            }
                        },
                        {},
                        function(err, numReplaced) {
                            if (err) {
                                return reject(err);
                            }
                            
                            // Create batch movement record
                            createBatchMovement({
                                batchId: batchId,
                                movementType: variance >= 0 ? 'STOCK_COUNT_INCREASE' : 'STOCK_COUNT_DECREASE',
                                quantity: Math.abs(variance),
                                referenceType: 'STOCK_COUNT',
                                referenceId: sessionId,
                                previousQuantity: batch.currentQuantity,
                                newQuantity: countedQuantity,
                                notes: batchData.notes || `Stock count adjustment for session ${sessionId}`
                            });
                            
                            resolve({
                                batchId: batchId,
                                previousQuantity: batch.currentQuantity,
                                newQuantity: countedQuantity,
                                variance: variance
                            });
                        }
                    );
                });
            });
        });
        
        Promise.all(updatePromises)
            .then(results => {
                res.json({
                    message: "Batch quantities updated successfully from stock count.",
                    updatedBatches: results,
                    sessionId: sessionId
                });
            })
            .catch(err => {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to update batch quantities from stock count.",
                });
            });
    });
});

/**
 * GET endpoint: Get batch movements for tracking.
 *
 * @param {Object} req request object with batch ID and filter parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:batchId/movements", function (req, res) {
    if (!req.params.batchId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Batch ID is required.",
        });
    }
    
    const batchId = parseInt(req.params.batchId);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // Get batch movements from batch movements database
    const batchMovementsDBPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "batch-movements.db",
    );
    
    const batchMovementsDB = new Datastore({
        filename: batchMovementsDBPath,
        autoload: true,
    });
    
    batchMovementsDB.find({ batchId: batchId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, movements) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get total count for pagination
            batchMovementsDB.count({ batchId: batchId }, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    movements: movements,
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
 * Helper function to create batch movement record
 *
 * @param {Object} movementData movement data object
 * @returns {void}
 */
function createBatchMovement(movementData) {
    const batchMovementsDBPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "batch-movements.db",
    );
    
    const batchMovementsDB = new Datastore({
        filename: batchMovementsDBPath,
        autoload: true,
    });
    
    const movement = {
        _id: Math.floor(Date.now() / 1000) + Math.random(),
        ...movementData,
        createdAt: new Date()
    };
    
    batchMovementsDB.insert(movement, function (err, newMovement) {
        if (err) {
            console.error("Error creating batch movement:", err);
        }
    });
}

module.exports.updateBatch = updateBatch;
module.exports.createBatchMovement = createBatchMovement;
