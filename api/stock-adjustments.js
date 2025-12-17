const app = require("express")();
const server = require("http").Server(app);
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
    "stock-adjustments.db",
);

app.use(bodyParser.json());

module.exports = app;

let stockAdjustmentsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

stockAdjustmentsDB.ensureIndex({ fieldName: "_id", unique: true });
stockAdjustmentsDB.ensureIndex({ fieldName: "productId" });
stockAdjustmentsDB.ensureIndex({ fieldName: "adjustmentDate" });
stockAdjustmentsDB.ensureIndex({ fieldName: "reason" });

/**
 * GET endpoint: Get welcome message for Stock Adjustments API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Stock Adjustments API");
});

/**
 * GET endpoint: Retrieve stock adjustments.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build query based on filters
    let query = {};
    if (req.query.productId) {
        query.productId = parseInt(req.query.productId);
    }
    if (req.query.reason) {
        query.reason = validator.escape(req.query.reason);
    }
    if (req.query.startDate && req.query.endDate) {
        query.adjustmentDate = {
            $gte: validator.escape(req.query.startDate),
            $lte: validator.escape(req.query.endDate)
        };
    }
    
    stockAdjustmentsDB.find(query)
        .sort({ adjustmentDate: -1 })
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
            stockAdjustmentsDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    adjustments: docs,
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
 * POST endpoint: Create new stock adjustment.
 *
 * @param {Object} req request object with stock adjustment data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.productId || req.body.adjustmentQuantity === undefined || !req.body.reason) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product ID, adjustment quantity, and reason are required fields.",
        });
    }
    
    // Check if product exists
    const Datastore = require("@seald-io/nedb");
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
    
    inventoryDB.findOne({ _id: parseInt(req.body.productId) }, function (err, product) {
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
                message: "Product not found.",
            });
        }
        
        const currentQuantity = parseInt(product.quantity) || 0;
        const adjustmentQuantity = parseInt(req.body.adjustmentQuantity);
        const newQuantity = currentQuantity + adjustmentQuantity;
        
        // Check if new quantity would be negative
        if (newQuantity < 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Adjustment would result in negative stock quantity.",
            });
        }
        
        // Check if batch is specified and exists
        if (req.body.batchId) {
            const batchesDbPath = path.join(
                process.env.APPDATA,
                process.env.APPNAME,
                "server",
                "databases",
                "batches.db",
            );
            
            const batchesDB = new Datastore({
                filename: batchesDbPath,
                autoload: true,
            });
            
            batchesDB.findOne({ _id: parseInt(req.body.batchId) }, function (err, batch) {
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
                
                if (batch.productId !== parseInt(req.body.productId)) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Batch does not belong to the specified product.",
                    });
                }
                
                const currentBatchQuantity = parseInt(batch.currentQuantity) || 0;
                const newBatchQuantity = currentBatchQuantity + adjustmentQuantity;
                
                if (newBatchQuantity < 0) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Adjustment would result in negative batch quantity.",
                    });
                }
                
                createAdjustment();
            });
        } else {
            createAdjustment();
        }
        
        function createAdjustment() {
            const newAdjustment = {
                _id: Math.floor(Date.now() / 1000),
                productId: parseInt(req.body.productId),
                batchId: req.body.batchId ? parseInt(req.body.batchId) : null,
                adjustmentType: adjustmentQuantity >= 0 ? 'INCREASE' : 'DECREASE',
                adjustmentQuantity: adjustmentQuantity,
                previousQuantity: currentQuantity,
                newQuantity: newQuantity,
                reason: validator.escape(req.body.reason),
                notes: req.body.notes ? validator.escape(req.body.notes) : null,
                adjustmentDate: req.body.adjustmentDate || new Date().toISOString().split('T')[0],
                createdBy: req.body.createdBy ? parseInt(req.body.createdBy) : null,
                createdAt: new Date()
            };
            
            stockAdjustmentsDB.insert(newAdjustment, function (err, adjustment) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Update inventory quantity
                inventoryDB.update(
                    { _id: parseInt(req.body.productId) },
                    { $set: { quantity: newQuantity } },
                    {},
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "Failed to update inventory quantity.",
                            });
                        }
                        
                        // Update batch quantity if specified
                        if (req.body.batchId) {
                            updateBatchQuantity(parseInt(req.body.batchId), adjustmentQuantity, function(err) {
                                if (err) {
                                    console.error(err);
                                    return res.status(500).json({
                                        error: "Internal Server Error",
                                        message: "Failed to update batch quantity.",
                                    });
                                }
                                
                                res.status(201).json(adjustment);
                            });
                        } else {
                            res.status(201).json(adjustment);
                        }
                    }
                );
            });
        }
    });
});

/**
 * GET endpoint: Get specific stock adjustment by ID.
 *
 * @param {Object} req request object with adjustment ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Stock adjustment ID is required.",
        });
    }
    
    stockAdjustmentsDB.findOne({ _id: parseInt(req.params.id) }, function (err, adjustment) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!adjustment) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock adjustment not found.",
            });
        }
        
        res.json(adjustment);
    });
});

/**
 * PUT endpoint: Update stock adjustment.
 *
 * @param {Object} req request object with updated stock adjustment data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Stock adjustment ID is required.",
        });
    }
    
    const adjustmentId = parseInt(req.params.id);
    
    // Check if adjustment exists
    stockAdjustmentsDB.findOne({ _id: adjustmentId }, function (err, existingAdjustment) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingAdjustment) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock adjustment not found.",
            });
        }
        
        // Only allow updating notes and reason for audit purposes
        const updatedAdjustment = {
            reason: req.body.reason !== undefined ? validator.escape(req.body.reason) : existingAdjustment.reason,
            notes: req.body.notes !== undefined ? validator.escape(req.body.notes) : existingAdjustment.notes,
            updatedAt: new Date()
        };
        
        stockAdjustmentsDB.update({ _id: adjustmentId }, { $set: updatedAdjustment }, {}, function (err, numReplaced) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({ ...updatedAdjustment, _id: adjustmentId });
        });
    });
});

/**
 * DELETE endpoint: Delete stock adjustment.
 *
 * @param {Object} req request object with adjustment ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Stock adjustment ID is required.",
        });
    }
    
    const adjustmentId = parseInt(req.params.id);
    
    // Check if adjustment exists
    stockAdjustmentsDB.findOne({ _id: adjustmentId }, function (err, adjustment) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!adjustment) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock adjustment not found.",
            });
        }
        
        // Reverse the adjustment in inventory
        const Datastore = require("@seald-io/nedb");
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
        
        const reverseQuantity = -adjustment.adjustmentQuantity;
        const newQuantity = adjustment.previousQuantity;
        
        inventoryDB.update(
            { _id: adjustment.productId },
            { $set: { quantity: newQuantity } },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to reverse inventory adjustment.",
                    });
                }
                
                // Reverse batch quantity if applicable
                if (adjustment.batchId) {
                    reverseBatchQuantity(adjustment.batchId, reverseQuantity, function(err) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "Failed to reverse batch adjustment.",
                            });
                        }
                        
                        deleteAdjustment();
                    });
                } else {
                    deleteAdjustment();
                }
                
                function deleteAdjustment() {
                    stockAdjustmentsDB.remove({ _id: adjustmentId }, function (err, numRemoved) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        res.json({ message: "Stock adjustment deleted and inventory reversed successfully." });
                    });
                }
            }
        );
    });
});

/**
 * GET endpoint: Get adjustments by reason.
 *
 * @param {Object} req request object with reason as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/reason/:reason", function (req, res) {
    if (!req.params.reason) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Reason is required.",
        });
    }
    
    const reason = validator.escape(req.params.reason);
    
    stockAdjustmentsDB.find({ reason: reason })
        .sort({ adjustmentDate: -1 })
        .exec(function (err, adjustments) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(adjustments);
        });
});

/**
 * Helper function to update batch quantity
 *
 * @param {number} batchId batch ID
 * @param {number} adjustmentQuantity quantity to adjust
 * @param {function} callback callback function
 * @returns {void}
 */
function updateBatchQuantity(batchId, adjustmentQuantity, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const batchesDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "batches.db",
    );
    
    const batchesDB = new Datastore({
        filename: batchesDbPath,
        autoload: true,
    });
    
    batchesDB.findOne({ _id: batchId }, function (err, batch) {
        if (err) {
            return callback(err);
        }
        
        if (!batch) {
            return callback(new Error("Batch not found"));
        }
        
        const newQuantity = batch.currentQuantity + adjustmentQuantity;
        
        batchesDB.update(
            { _id: batchId },
            { $set: { currentQuantity: newQuantity } },
            {},
            function (err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                
                callback(null);
            }
        );
    });
}

/**
 * Helper function to reverse batch quantity
 *
 * @param {number} batchId batch ID
 * @param {number} reverseQuantity quantity to reverse
 * @param {function} callback callback function
 * @returns {void}
 */
function reverseBatchQuantity(batchId, reverseQuantity, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const batchesDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "batches.db",
    );
    
    const batchesDB = new Datastore({
        filename: batchesDbPath,
        autoload: true,
    });
    
    batchesDB.findOne({ _id: batchId }, function (err, batch) {
        if (err) {
            return callback(err);
        }
        
        if (!batch) {
            return callback(new Error("Batch not found"));
        }
        
        const newQuantity = batch.currentQuantity + reverseQuantity;
        
        batchesDB.update(
            { _id: batchId },
            { $set: { currentQuantity: newQuantity } },
            {},
            function (err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                
                callback(null);
            }
        );
    });
}

module.exports.updateBatchQuantity = updateBatchQuantity;