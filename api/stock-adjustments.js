const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const validator = require("validator");
const dbUtils = require('./db-utils');
const dbPath = dbUtils.getDatabasePath('stock-adjustments.db');

router.use(bodyParser.json());

module.exports = router;

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
router.get("/", function (req, res) {
    res.send("Stock Adjustments API");
});

/**
 * GET endpoint: Retrieve stock adjustments.
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
router.post("/", function (req, res) {
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
                            updateBatchQuantity(parseInt(req.body.batchId), adjustmentQuantity, function (err) {
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
router.get("/:id", function (req, res) {
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
router.put("/:id", function (req, res) {
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
router.delete("/:id", function (req, res) {
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
                    reverseBatchQuantity(adjustment.batchId, reverseQuantity, function (err) {
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
router.get("/reason/:reason", function (req, res) {
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

/**
 * GET endpoint: Get stock adjustments for stock count session.
 *
 * @param {Object} req request object with session ID and filter parameters.
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
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;

    // Build query for stock count adjustments
    let query = {
        $or: [
            { reason: { $regex: 'Stock Count', $options: 'i' } },
            { referenceType: 'STOCK_COUNT' },
            { referenceId: sessionId }
        ]
    };

    if (req.query.type) {
        query.adjustmentType = validator.escape(req.query.type);
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

            // Get product details for each adjustment
            const productIds = docs.map(adj => adj.productId);

            if (productIds.length === 0) {
                return res.json({
                    adjustments: docs,
                    pagination: {
                        total: docs.length,
                        page: page,
                        limit: limit,
                        pages: Math.ceil(docs.length / limit)
                    }
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

                // Enrich adjustments with product details
                const enrichedAdjustments = docs.map(adjustment => {
                    const product = products.find(p => p._id === adjustment.productId);

                    return {
                        ...adjustment,
                        productName: product ? product.name : 'Unknown Product',
                        productBarcode: product ? product.barcode : null,
                        productCategory: product ? product.category : null
                    };
                });

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
                        adjustments: enrichedAdjustments,
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
 * POST endpoint: Create bulk stock adjustments from approved variances.
 *
 * @param {Object} req request object with bulk adjustment data.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/bulk-from-variances", function (req, res) {
    if (!req.body.sessionId || !req.body.variances) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID and variances array are required.",
        });
    }

    const sessionId = parseInt(req.body.sessionId);
    const variances = req.body.variances;
    const approvedBy = req.body.approvedBy ? parseInt(req.body.approvedBy) : null;

    if (!approvedBy) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Approved by user ID is required.",
        });
    }

    // Verify stock count session is completed
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
                message: "Adjustments can only be created for completed stock count sessions.",
            });
        }

        // Process each variance into a stock adjustment
        const adjustmentPromises = variances.map(varianceData => {
            return new Promise((resolve, reject) => {
                const adjustment = {
                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                    productId: parseInt(varianceData.productId),
                    batchId: varianceData.batchId ? parseInt(varianceData.batchId) : null,
                    adjustmentType: varianceData.varianceQuantity >= 0 ? 'INCREASE' : 'DECREASE',
                    adjustmentQuantity: parseInt(varianceData.varianceQuantity),
                    previousQuantity: parseInt(varianceData.expectedQuantity),
                    newQuantity: parseInt(varianceData.countedQuantity),
                    reason: `Stock Count - ${varianceData.varianceType}`,
                    notes: varianceData.notes || `Variance adjustment from stock count session ${sessionId}`,
                    adjustmentDate: new Date().toISOString().split('T')[0],
                    createdBy: approvedBy,
                    createdAt: new Date(),
                    referenceType: 'STOCK_COUNT',
                    referenceId: sessionId
                };

                stockAdjustmentsDB.insert(adjustment, function (err, newAdjustment) {
                    if (err) {
                        return reject(err);
                    }

                    // Update inventory quantity
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

                    inventoryDB.update(
                        { _id: adjustment.productId },
                        { $set: { quantity: adjustment.newQuantity } },
                        {},
                        function (err) {
                            if (err) {
                                return reject(err);
                            }

                            // Update batch quantity if specified
                            if (adjustment.batchId) {
                                updateBatchQuantity(adjustment.batchId, adjustment.adjustmentQuantity, function (err) {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve({
                                        adjustment: newAdjustment,
                                        batchUpdated: true
                                    });
                                });
                            } else {
                                resolve({
                                    adjustment: newAdjustment,
                                    batchUpdated: false
                                });
                            }
                        }
                    );
                });
            });
        });

        Promise.all(adjustmentPromises)
            .then(results => {
                res.json({
                    message: "Bulk stock adjustments created successfully.",
                    adjustments: results.map(r => r.adjustment),
                    totalAdjustments: results.length,
                    batchUpdates: results.filter(r => r.batchUpdated).length
                });
            })
            .catch(err => {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to create bulk stock adjustments.",
                });
            });
    });
});

/**
 * GET endpoint: Get adjustment summary for stock count session.
 *
 * @param {Object} req request object with session ID as parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/session/:sessionId/summary", function (req, res) {
    if (!req.params.sessionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID is required.",
        });
    }

    const sessionId = parseInt(req.params.sessionId);

    // Get all adjustments for the session
    stockAdjustmentsDB.find({
        $or: [
            { reason: { $regex: 'Stock Count', $options: 'i' } },
            { referenceType: 'STOCK_COUNT' },
            { referenceId: sessionId }
        ]
    }, function (err, adjustments) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const summary = {
            totalAdjustments: adjustments.length,
            increases: adjustments.filter(a => a.adjustmentType === 'INCREASE').length,
            decreases: adjustments.filter(a => a.adjustmentType === 'DECREASE').length,
            totalIncreaseQuantity: adjustments.reduce((sum, a) =>
                a.adjustmentType === 'INCREASE' ? sum + a.adjustmentQuantity : sum, 0),
            totalDecreaseQuantity: adjustments.reduce((sum, a) =>
                a.adjustmentType === 'DECREASE' ? sum + Math.abs(a.adjustmentQuantity) : sum, 0),
            adjustmentByType: {},
            totalValue: 0
        };

        // Group by adjustment reason/type
        adjustments.forEach(adjustment => {
            const type = adjustment.reason.split(' - ')[1] || 'OTHER';
            if (!summary.adjustmentByType[type]) {
                summary.adjustmentByType[type] = {
                    count: 0,
                    quantity: 0
                };
            }
            summary.adjustmentByType[type].count++;
            summary.adjustmentByType[type].quantity += Math.abs(adjustment.adjustmentQuantity);
        });

        // Calculate total value (would need product prices for accurate calculation)
        summary.totalValue = adjustments.reduce((sum, a) =>
            sum + Math.abs(a.adjustmentQuantity * (a.unitCost || 0)), 0);

        res.json(summary);
    });
});

/**
 * POST endpoint: Reverse stock adjustments from rejected variances.
 *
 * @param {Object} req request object with reversal data.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/reverse-variance-adjustments", function (req, res) {
    if (!req.body.sessionId || !req.body.adjustmentIds) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID and adjustment IDs array are required.",
        });
    }

    const sessionId = parseInt(req.body.sessionId);
    const adjustmentIds = req.body.adjustmentIds.map(id => parseInt(id));
    const rejectedBy = req.body.rejectedBy ? parseInt(req.body.rejectedBy) : null;
    const rejectionReason = req.body.rejectionReason ? validator.escape(req.body.rejectionReason) : null;

    if (!rejectedBy || !rejectionReason) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Rejected by user ID and rejection reason are required.",
        });
    }

    // Get adjustments to reverse
    stockAdjustmentsDB.find({ _id: { $in: adjustmentIds } }, function (err, adjustments) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (adjustments.length === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: "No adjustments found to reverse.",
            });
        }

        // Process reversals
        const reversalPromises = adjustments.map(adjustment => {
            return new Promise((resolve, reject) => {
                // Reverse the inventory quantity
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
                const originalQuantity = adjustment.previousQuantity;

                inventoryDB.update(
                    { _id: adjustment.productId },
                    { $set: { quantity: originalQuantity } },
                    {},
                    function (err) {
                        if (err) {
                            return reject(err);
                        }

                        // Reverse batch quantity if applicable
                        if (adjustment.batchId) {
                            reverseBatchQuantity(adjustment.batchId, reverseQuantity, function (err) {
                                if (err) {
                                    return reject(err);
                                }

                                // Create reversal record
                                createReversalRecord(adjustment, rejectedBy, rejectionReason, function (err, reversal) {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve({
                                        adjustment: adjustment,
                                        reversal: reversal,
                                        batchReversed: true
                                    });
                                });
                            });
                        } else {
                            // Create reversal record
                            createReversalRecord(adjustment, rejectedBy, rejectionReason, function (err, reversal) {
                                if (err) {
                                    return reject(err);
                                }
                                resolve({
                                    adjustment: adjustment,
                                    reversal: reversal,
                                    batchReversed: false
                                });
                            });
                        }
                    }
                );
            });
        });

        Promise.all(reversalPromises)
            .then(results => {
                res.json({
                    message: "Stock adjustments reversed successfully.",
                    reversals: results.map(r => r.reversal),
                    totalReversed: results.length,
                    batchReversals: results.filter(r => r.batchReversed).length
                });
            })
            .catch(err => {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to reverse stock adjustments.",
                });
            });
    });
});

/**
 * Helper function to create reversal record
 *
 * @param {Object} originalAdjustment original adjustment being reversed
 * @param {number} rejectedBy user ID who rejected the variance
 * @param {string} rejectionReason reason for reversal
 * @param {function} callback callback function
 * @returns {void}
 */
function createReversalRecord(originalAdjustment, rejectedBy, rejectionReason, callback) {
    const reversal = {
        _id: Math.floor(Date.now() / 1000) + Math.random(),
        originalAdjustmentId: originalAdjustment._id,
        productId: originalAdjustment.productId,
        batchId: originalAdjustment.batchId,
        reversalQuantity: -originalAdjustment.adjustmentQuantity,
        originalQuantity: originalAdjustment.previousQuantity,
        reversalReason: rejectionReason,
        rejectedBy: rejectedBy,
        createdAt: new Date(),
        referenceType: 'STOCK_COUNT_REVERSAL',
        referenceId: originalAdjustment.referenceId
    };

    // Store in a separate reversals database
    const reversalsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "stock-adjustment-reversals.db",
    );

    const reversalsDB = new Datastore({
        filename: reversalsDbPath,
        autoload: true,
    });

    reversalsDB.insert(reversal, function (err, newReversal) {
        if (err) {
            return callback(err);
        }
        callback(null, newReversal);
    });
}

module.exports.updateBatchQuantity = updateBatchQuantity;
module.exports.createReversalRecord = createReversalRecord;