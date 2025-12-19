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
    "stock-variances.db",
);

router.use(bodyParser.json());

module.exports = router;

let stockVariancesDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

stockVariancesDB.ensureIndex({ fieldName: "_id", unique: true });
stockVariancesDB.ensureIndex({ fieldName: "countItemId" });
stockVariancesDB.ensureIndex({ fieldName: "varianceType" });
stockVariancesDB.ensureIndex({ fieldName: "approvalStatus" });
stockVariancesDB.ensureIndex({ fieldName: "thresholdExceeded" });

// Initialize related databases
const stockCountItemsDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "stock-count-items.db",
);

const stockCountItemsDB = new Datastore({
    filename: stockCountItemsDBPath,
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

const stockAdjustmentsDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "stock-adjustments.db",
);

const stockAdjustmentsDB = new Datastore({
    filename: stockAdjustmentsDBPath,
    autoload: true,
});

/**
 * Variance threshold configuration
 */
const varianceThresholds = {
    autoApproval: {
        percentage: 5,    // 5% variance auto-approved
        value: 100         // $100 variance auto-approved
    },
    supervisorApproval: {
        percentage: 15,    // 15% requires supervisor approval
        value: 500         // $500 requires supervisor approval
    },
    managerApproval: {
        percentage: 25,    // 25% requires manager approval
        value: 1000        // $1000 requires manager approval
    },
    ownerApproval: {
        percentage: 50,    // 50% requires owner approval
        value: 5000        // $5000 requires owner approval
    }
};

/**
 * GET endpoint: Get the welcome message for the Stock Variances API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Stock Variances API");
});

/**
 * GET endpoint: Retrieve variances for a specific session with pagination and filtering.
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
    const limit = parseInt(req.query.limit) || 25;
    const skip = (page - 1) * limit;
    
    // Build query based on filters
    let query = { countSessionId: sessionId };
    
    if (req.query.type) {
        query.varianceType = validator.escape(req.query.type);
    }
    if (req.query.status) {
        query.approvalStatus = validator.escape(req.query.status);
    }
    if (req.query.threshold === 'true') {
        query.thresholdExceeded = true;
    }
    
    stockVariancesDB.find(query)
        .sort({ createdAt: -1 })
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
            
            // Get count item details for each variance
            const countItemIds = docs.map(variance => variance.countItemId);
            
            if (countItemIds.length === 0) {
                return res.json({
                    variances: docs,
                    pagination: {
                        total: docs.length,
                        page: page,
                        limit: limit,
                        pages: Math.ceil(docs.length / limit)
                    }
                });
            }
            
            stockCountItemsDB.find({ _id: { $in: countItemIds } }, function (err, countItems) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to load count item details.",
                    });
                }
                
                // Get product details
                const productIds = countItems.map(item => item.productId);
                
                inventoryDB.find({ _id: { $in: productIds } }, function (err, products) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to load product details.",
                        });
                    }
                    
                    // Enrich variances with count item and product details
                    const enrichedVariances = docs.map(variance => {
                        const countItem = countItems.find(ci => ci._id === variance.countItemId);
                        const product = products.find(p => p._id === (countItem ? countItem.productId : null));
                        
                        return {
                            ...variance,
                            countItem: countItem,
                            product: product
                        };
                    });
                    
                    // Get total count for pagination
                    stockVariancesDB.count(query, function (err, count) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        res.json({
                            variances: enrichedVariances,
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
});

/**
 * POST endpoint: Calculate and create variance records for a count session.
 *
 * @param {Object} req request object with session ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/session/:sessionId/calculate", function (req, res) {
    if (!req.params.sessionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID is required.",
        });
    }
    
    const sessionId = parseInt(req.params.sessionId);
    
    // Check if stock count session exists and is completed
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
        
        // Get all count items for the session
        stockCountItemsDB.find({ countSessionId: sessionId }, function (err, countItems) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to load count items.",
                });
            }
            
            // Filter items that have been counted
            const countedItems = countItems.filter(item => 
                item.countedQuantity !== null && item.countedQuantity !== undefined
            );
            
            if (countedItems.length === 0) {
                return res.json({
                    message: "No counted items found for variance calculation.",
                    variancesCreated: 0
                });
            }
            
            // Calculate variances for each counted item
            const variancePromises = countedItems.map(countItem => {
                return new Promise((resolve, reject) => {
                    calculateVarianceForItem(countItem, function(err, varianceData) {
                        if (err) {
                            return reject(err);
                        }
                        
                        // Check if variance already exists for this count item
                        stockVariancesDB.findOne({ countItemId: countItem._id }, function(err, existingVariance) {
                            if (err) {
                                return reject(err);
                            }
                            
                            if (existingVariance) {
                                // Update existing variance
                                stockVariancesDB.update(
                                    { _id: existingVariance._id },
                                    { $set: varianceData },
                                    {},
                                    function(err, numReplaced) {
                                        if (err) {
                                            return reject(err);
                                        }
                                        resolve({ ...varianceData, _id: existingVariance._id, isNew: false });
                                    }
                                );
                            } else {
                                // Create new variance
                                const newVariance = {
                                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                                    countSessionId: sessionId,
                                    ...varianceData,
                                    createdAt: new Date(),
                                    updatedAt: new Date()
                                };
                                
                                stockVariancesDB.insert(newVariance, function(err, variance) {
                                    if (err) {
                                        return reject(err);
                                    }
                                    resolve({ ...variance, isNew: true });
                                });
                            }
                        });
                    });
                });
            });
            
            Promise.all(variancePromises)
                .then(results => {
                    const newVariances = results.filter(r => r.isNew);
                    const updatedVariances = results.filter(r => !r.isNew);
                    
                    res.json({
                        message: "Variance calculation completed successfully.",
                        variancesCreated: newVariances.length,
                        variancesUpdated: updatedVariances.length,
                        totalVariances: results.length
                    });
                })
                .catch(err => {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to calculate variances.",
                    });
                });
        });
    });
});

/**
 * GET endpoint: Get specific variance by ID.
 *
 * @param {Object} req request object with variance ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Variance ID is required.",
        });
    }
    
    stockVariancesDB.findOne({ _id: parseInt(req.params.id) }, function (err, variance) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!variance) {
            return res.status(404).json({
                error: "Not Found",
                message: "Variance not found.",
            });
        }
        
        // Get count item and product details
        async.parallel({
            countItem: function(callback) {
                stockCountItemsDB.findOne({ _id: variance.countItemId }, callback);
            },
            product: function(callback) {
                stockCountItemsDB.findOne({ _id: variance.countItemId }, function(err, countItem) {
                    if (err || !countItem) {
                        return callback(null, null);
                    }
                    inventoryDB.findOne({ _id: countItem.productId }, callback);
                });
            }
        }, function(err, results) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to load variance details.",
                });
            }
            
            const enrichedVariance = {
                ...variance,
                countItem: results.countItem,
                product: results.product
            };
            
            res.json(enrichedVariance);
        });
    });
});

/**
 * PUT endpoint: Approve variance and create stock adjustment.
 *
 * @param {Object} req request object with approval data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id/approve", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Variance ID is required.",
        });
    }
    
    const varianceId = parseInt(req.params.id);
    const approvedBy = req.body.approvedBy ? parseInt(req.body.approvedBy) : null;
    
    if (!approvedBy) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Approved by user ID is required.",
        });
    }
    
    stockVariancesDB.findOne({ _id: varianceId }, function (err, variance) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!variance) {
            return res.status(404).json({
                error: "Not Found",
                message: "Variance not found.",
            });
        }
        
        if (variance.approvalStatus === 'APPROVED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Variance is already approved.",
            });
        }
        
        // Get count item details for stock adjustment
        stockCountItemsDB.findOne({ _id: variance.countItemId }, function (err, countItem) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to load count item details.",
                });
            }
            
            if (!countItem) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Count item not found.",
                });
            }
            
            // Create stock adjustment
            const stockAdjustment = {
                _id: Math.floor(Date.now() / 1000),
                productId: countItem.productId,
                batchId: countItem.batchId,
                adjustmentQuantity: variance.varianceQuantity,
                adjustmentType: variance.varianceQuantity >= 0 ? 'INCREASE' : 'DECREASE',
                previousQuantity: countItem.expectedQuantity,
                newQuantity: countItem.countedQuantity,
                reason: `Stock Count - ${variance.varianceType}`,
                notes: req.body.notes || `Variance approved for stock count session ${variance.countSessionId}`,
                adjustmentDate: new Date().toISOString().split('T')[0],
                createdBy: approvedBy,
                createdAt: new Date(),
                referenceType: 'STOCK_COUNT',
                referenceId: variance.countSessionId
            };
            
            stockAdjustmentsDB.insert(stockAdjustment, function (err, adjustment) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to create stock adjustment.",
                    });
                }
                
                // Update variance status
                const updatedVariance = {
                    approvalStatus: 'APPROVED',
                    approvedBy: approvedBy,
                    approvedAt: new Date(),
                    adjustmentReferenceId: adjustment._id,
                    updatedAt: new Date()
                };
                
                stockVariancesDB.update({ _id: varianceId }, { $set: updatedVariance }, {}, function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to update variance status.",
                        });
                    }
                    
                    res.json({
                        message: "Variance approved successfully and stock adjustment created.",
                        variance: { ...variance, ...updatedVariance },
                        stockAdjustment: adjustment
                    });
                });
            });
        });
    });
});

/**
 * PUT endpoint: Reject variance.
 *
 * @param {Object} req request object with rejection data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id/reject", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Variance ID is required.",
        });
    }
    
    const varianceId = parseInt(req.params.id);
    const rejectionReason = req.body.rejectionReason;
    
    if (!rejectionReason) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Rejection reason is required.",
        });
    }
    
    stockVariancesDB.findOne({ _id: varianceId }, function (err, variance) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!variance) {
            return res.status(404).json({
                error: "Not Found",
                message: "Variance not found.",
            });
        }
        
        if (variance.approvalStatus === 'APPROVED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot reject an already approved variance.",
            });
        }
        
        const updatedVariance = {
            approvalStatus: 'REJECTED',
            rejectionReason: validator.escape(rejectionReason),
            updatedAt: new Date()
        };
        
        stockVariancesDB.update({ _id: varianceId }, { $set: updatedVariance }, {}, function (err, numReplaced) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({
                message: "Variance rejected successfully.",
                variance: { ...variance, ...updatedVariance }
            });
        });
    });
});

/**
 * GET endpoint: Get variance summary for a session.
 *
 * @param {Object} req request object with session ID as a parameter.
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
    
    stockVariancesDB.find({ countSessionId: sessionId }, function (err, variances) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const summary = {
            totalVariances: variances.length,
            pendingApproval: variances.filter(v => v.approvalStatus === 'PENDING').length,
            approved: variances.filter(v => v.approvalStatus === 'APPROVED').length,
            rejected: variances.filter(v => v.approvalStatus === 'REJECTED').length,
            totalVarianceValue: variances.reduce((sum, v) => sum + Math.abs(v.varianceValue), 0),
            varianceByType: {},
            highValueVariances: variances.filter(v => v.thresholdExceeded).length
        };
        
        // Group by variance type
        variances.forEach(variance => {
            if (!summary.varianceByType[variance.varianceType]) {
                summary.varianceByType[variance.varianceType] = {
                    count: 0,
                    totalValue: 0
                };
            }
            summary.varianceByType[variance.varianceType].count++;
            summary.varianceByType[variance.varianceType].totalValue += Math.abs(variance.varianceValue);
        });
        
        res.json(summary);
    });
});

/**
 * Helper function to calculate variance for a count item
 *
 * @param {Object} countItem count item object
 * @param {function} callback callback function
 * @returns {void}
 */
function calculateVarianceForItem(countItem, callback) {
    const expectedQuantity = countItem.expectedQuantity || 0;
    const countedQuantity = countItem.countedQuantity || 0;
    const varianceQuantity = countedQuantity - expectedQuantity;
    
    // Skip if no variance
    if (varianceQuantity === 0) {
        return callback(null, null);
    }
    
    const varianceValue = Math.abs(varianceQuantity) * (countItem.unitCost || 0);
    const variancePercentage = expectedQuantity > 0 ? Math.abs((varianceQuantity / expectedQuantity) * 100) : 0;
    
    // Determine variance type
    let varianceType = 'SURPLUS';
    if (varianceQuantity < 0) {
        varianceType = 'SHORTAGE';
    }
    
    // Check if variance is expired
    if (countItem.expiryDate) {
        const expiryDate = new Date(countItem.expiryDate);
        const today = new Date();
        if (expiryDate < today) {
            varianceType = 'EXPIRED';
        }
    }
    
    // Determine if variance exceeds thresholds
    const thresholdExceeded = 
        variancePercentage > varianceThresholds.autoApproval.percentage ||
        varianceValue > varianceThresholds.autoApproval.value;
    
    // Determine required approval level
    let requiredApprovalLevel = 'AUTO';
    if (thresholdExceeded) {
        if (variancePercentage > varianceThresholds.ownerApproval.percentage || 
            varianceValue > varianceThresholds.ownerApproval.value) {
            requiredApprovalLevel = 'OWNER';
        } else if (variancePercentage > varianceThresholds.managerApproval.percentage || 
                   varianceValue > varianceThresholds.managerApproval.value) {
            requiredApprovalLevel = 'MANAGER';
        } else if (variancePercentage > varianceThresholds.supervisorApproval.percentage || 
                   varianceValue > varianceThresholds.supervisorApproval.value) {
            requiredApprovalLevel = 'SUPERVISOR';
        }
    }
    
    const varianceData = {
        countItemId: countItem._id,
        varianceType: varianceType,
        varianceQuantity: varianceQuantity,
        varianceValue: varianceValue,
        variancePercentage: variancePercentage.toFixed(2),
        thresholdExceeded: thresholdExceeded,
        approvalStatus: thresholdExceeded ? 'PENDING' : 'APPROVED',
        approvedBy: thresholdExceeded ? null : 'SYSTEM',
        approvedAt: thresholdExceeded ? null : new Date(),
        rejectionReason: null,
        adjustmentReferenceId: null,
        notes: null
    };
    
    callback(null, varianceData);
}
