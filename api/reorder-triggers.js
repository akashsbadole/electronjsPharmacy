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
    "reorder-triggers.db",
);

router.use(bodyParser.json());

module.exports = router;

let reorderTriggersDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

reorderTriggersDB.ensureIndex({ fieldName: "_id", unique: true });
reorderTriggersDB.ensureIndex({ fieldName: "productId" });
reorderTriggersDB.ensureIndex({ fieldName: "storeId" });
reorderTriggersDB.ensureIndex({ fieldName: "triggerType" });
reorderTriggersDB.ensureIndex({ fieldName: "isActive" });

// Trigger types
const TRIGGER_TYPES = {
    STOCK_LEVEL: 'STOCK_LEVEL',
    EXPIRY: 'EXPIRY',
    DEMAND_FORECAST: 'DEMAND_FORECAST',
    SEASONAL: 'SEASONAL',
    MANUAL: 'MANUAL'
};

// Trigger frequencies
const TRIGGER_FREQUENCIES = {
    REAL_TIME: 'REAL_TIME',
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
    MONTHLY: 'MONTHLY'
};

/**
 * GET endpoint: Get welcome message for Reorder Triggers API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Reorder Triggers API");
});

/**
 * GET endpoint: Get all reorder triggers.
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
    if (req.query.storeId) {
        query.storeId = parseInt(req.query.storeId);
    }
    if (req.query.triggerType) {
        query.triggerType = validator.escape(req.query.triggerType);
    }
    if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive === 'true';
    }
    
    reorderTriggersDB.find(query)
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
            
            // Get total count for pagination
            reorderTriggersDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    triggers: docs,
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
 * GET endpoint: Get specific trigger by ID.
 *
 * @param {Object} req request object with trigger ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Trigger ID is required.",
        });
    }
    
    reorderTriggersDB.findOne({ _id: parseInt(req.params.id) }, function (err, trigger) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!trigger) {
            return res.status(404).json({
                error: "Not Found",
                message: "Trigger not found.",
            });
        }
        
        res.json(trigger);
    });
});

/**
 * POST endpoint: Create new reorder trigger.
 *
 * @param {Object} req request object with trigger data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.productId || !req.body.triggerType) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product ID and trigger type are required fields.",
        });
    }
    
    // Validate trigger type
    if (!Object.values(TRIGGER_TYPES).includes(req.body.triggerType)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid trigger type.",
        });
    }
    
    // Validate frequency if provided
    if (req.body.frequency && !Object.values(TRIGGER_FREQUENCIES).includes(req.body.frequency)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid trigger frequency.",
        });
    }
    
    // Check if product exists
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
        
        // Validate trigger-specific conditions
        let triggerConditions = {};
        if (req.body.triggerType === TRIGGER_TYPES.STOCK_LEVEL) {
            if (req.body.minStockLevel === undefined || req.body.maxStockLevel === undefined) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Min and max stock levels are required for stock level triggers.",
                });
            }
            triggerConditions = {
                minStockLevel: parseInt(req.body.minStockLevel),
                maxStockLevel: parseInt(req.body.maxStockLevel)
            };
        } else if (req.body.triggerType === TRIGGER_TYPES.EXPIRY) {
            if (!req.body.expiryThresholdDays) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Expiry threshold days is required for expiry triggers.",
                });
            }
            triggerConditions = {
                expiryThresholdDays: parseInt(req.body.expiryThresholdDays)
            };
        } else if (req.body.triggerType === TRIGGER_TYPES.DEMAND_FORECAST) {
            if (!req.body.demandThreshold) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Demand threshold is required for demand forecast triggers.",
                });
            }
            triggerConditions = {
                demandThreshold: parseFloat(req.body.demandThreshold),
                forecastDays: parseInt(req.body.forecastDays) || 30
            };
        }
        
        const newTrigger = {
            _id: Math.floor(Date.now() / 1000),
            productId: parseInt(req.body.productId),
            productName: product.name,
            storeId: req.body.storeId ? parseInt(req.body.storeId) : null,
            triggerType: validator.escape(req.body.triggerType),
            frequency: req.body.frequency ? validator.escape(req.body.frequency) : TRIGGER_FREQUENCIES.DAILY,
            conditions: triggerConditions,
            isActive: req.body.isActive !== undefined ? req.body.isActive : true,
            lastTriggered: null,
            triggerCount: 0,
            createdBy: req.body.createdBy ? parseInt(req.body.createdBy) : null,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        reorderTriggersDB.insert(newTrigger, function (err, trigger) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.status(201).json(trigger);
        });
    });
});

/**
 * PUT endpoint: Update reorder trigger.
 *
 * @param {Object} req request object with updated trigger data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Trigger ID is required.",
        });
    }
    
    const triggerId = parseInt(req.params.id);
    
    // Check if trigger exists
    reorderTriggersDB.findOne({ _id: triggerId }, function (err, existingTrigger) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingTrigger) {
            return res.status(404).json({
                error: "Not Found",
                message: "Trigger not found.",
            });
        }
        
        // Validate trigger type if being changed
        if (req.body.triggerType && !Object.values(TRIGGER_TYPES).includes(req.body.triggerType)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid trigger type.",
            });
        }
        
        // Validate frequency if being changed
        if (req.body.frequency && !Object.values(TRIGGER_FREQUENCIES).includes(req.body.frequency)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid trigger frequency.",
            });
        }
        
        const updatedTrigger = {
            productId: req.body.productId !== undefined ? parseInt(req.body.productId) : existingTrigger.productId,
            storeId: req.body.storeId !== undefined ? req.body.storeId : existingTrigger.storeId,
            triggerType: req.body.triggerType !== undefined ? validator.escape(req.body.triggerType) : existingTrigger.triggerType,
            frequency: req.body.frequency !== undefined ? validator.escape(req.body.frequency) : existingTrigger.frequency,
            conditions: req.body.conditions !== undefined ? req.body.conditions : existingTrigger.conditions,
            isActive: req.body.isActive !== undefined ? req.body.isActive : existingTrigger.isActive,
            updatedAt: new Date()
        };
        
        reorderTriggersDB.update({ _id: triggerId }, { $set: updatedTrigger }, {}, function (err, numReplaced) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({
                ...updatedTrigger,
                _id: triggerId
            });
        });
    });
});

/**
 * DELETE endpoint: Delete reorder trigger.
 *
 * @param {Object} req request object with trigger ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Trigger ID is required.",
        });
    }
    
    const triggerId = parseInt(req.params.id);
    
    reorderTriggersDB.remove({ _id: triggerId }, function (err, numRemoved) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.json({ message: "Trigger deleted successfully." });
    });
});

/**
 * POST endpoint: Activate/deactivate trigger.
 *
 * @param {Object} req request object with trigger ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/:id/toggle", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Trigger ID is required.",
        });
    }
    
    const triggerId = parseInt(req.params.id);
    
    reorderTriggersDB.findOne({ _id: triggerId }, function (err, trigger) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!trigger) {
            return res.status(404).json({
                error: "Not Found",
                message: "Trigger not found.",
            });
        }
        
        const newStatus = !trigger.isActive;
        
        reorderTriggersDB.update(
            { _id: triggerId },
            { 
                $set: {
                    isActive: newStatus,
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
                    message: `Trigger ${newStatus ? 'activated' : 'deactivated'} successfully.`,
                    isActive: newStatus
                });
            }
        );
    });
});

/**
 * POST endpoint: Check and execute triggers.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/check-triggers", function (req, res) {
    const storeId = req.body.storeId ? parseInt(req.body.storeId) : null;
    
    // Get all active triggers
    let query = { isActive: true };
    if (storeId) {
        query.storeId = storeId;
    }
    
    reorderTriggersDB.find(query, function (err, triggers) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const triggeredItems = [];
        
        // Check each trigger
        async.eachSeries(triggers, function (trigger, callback) {
            checkTriggerCondition(trigger, function(err, shouldTrigger, data) {
                if (err) {
                    console.error(err);
                    return callback();
                }
                
                if (shouldTrigger) {
                    // Update trigger with last triggered info
                    reorderTriggersDB.update(
                        { _id: trigger._id },
                        {
                            $set: {
                                lastTriggered: new Date(),
                                triggerCount: (trigger.triggerCount || 0) + 1
                            }
                        },
                        {},
                        function(err) {
                            if (err) {
                                console.error(err);
                            }
                        }
                    );
                    
                    triggeredItems.push({
                        trigger: trigger,
                        triggeredAt: new Date(),
                        data: data
                    });
                }
                
                callback();
            });
        }, function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred while checking triggers.",
                });
            }
            
            res.json({
                message: "Trigger check completed.",
                totalTriggers: triggers.length,
                triggeredItems: triggeredItems,
                triggeredCount: triggeredItems.length
            });
        });
    });
});

/**
 * GET endpoint: Get triggers by product.
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
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    
    let query = { productId: productId };
    if (storeId) {
        query.storeId = storeId;
    }
    
    reorderTriggersDB.find(query)
        .sort({ createdAt: -1 })
        .exec(function (err, triggers) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(triggers);
        });
});

/**
 * GET endpoint: Get triggers by store.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/store/:storeId", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID is required.",
        });
    }
    
    const storeId = parseInt(req.params.storeId);
    
    reorderTriggersDB.find({ storeId: storeId })
        .sort({ createdAt: -1 })
        .exec(function (err, triggers) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(triggers);
        });
});

/**
 * Helper function to check trigger condition
 *
 * @param {Object} trigger trigger object
 * @param {function} callback callback function
 * @returns {void}
 */
function checkTriggerCondition(trigger, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    if (trigger.triggerType === TRIGGER_TYPES.STOCK_LEVEL) {
        // Check stock level
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
        
        if (trigger.storeId) {
            // Check store inventory
            const storeInventoryDbPath = path.join(
                process.env.APPDATA,
                process.env.APPNAME,
                "server",
                "databases",
                "store-inventory.db",
            );
            
            const storeInventoryDB = new Datastore({
                filename: storeInventoryDbPath,
                autoload: true,
            });
            
            storeInventoryDB.findOne({
                productId: trigger.productId,
                storeId: trigger.storeId
            }, function(err, storeInventory) {
                if (err) {
                    return callback(err);
                }
                
                const currentQuantity = storeInventory ? parseInt(storeInventory.quantity) || 0 : 0;
                const shouldTrigger = currentQuantity <= trigger.conditions.minStockLevel;
                
                callback(null, shouldTrigger, {
                    currentQuantity: currentQuantity,
                    threshold: trigger.conditions.minStockLevel
                });
            });
        } else {
            // Check main inventory
            inventoryDB.findOne({ _id: trigger.productId }, function(err, product) {
                if (err) {
                    return callback(err);
                }
                
                const currentQuantity = product ? parseInt(product.quantity) || 0 : 0;
                const shouldTrigger = currentQuantity <= trigger.conditions.minStockLevel;
                
                callback(null, shouldTrigger, {
                    currentQuantity: currentQuantity,
                    threshold: trigger.conditions.minStockLevel
                });
            });
        }
    } else if (trigger.triggerType === TRIGGER_TYPES.EXPIRY) {
        // Check expiry dates
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
        
        const thresholdDate = new Date();
        thresholdDate.setDate(thresholdDate.getDate() + trigger.conditions.expiryThresholdDays);
        
        batchesDB.find({
            productId: trigger.productId,
            expiryDate: { $lte: thresholdDate.toISOString().split('T')[0] },
            currentQuantity: { $gt: 0 },
            isActive: true
        }, function(err, batches) {
            if (err) {
                return callback(err);
            }
            
            const shouldTrigger = batches.length > 0;
            
            callback(null, shouldTrigger, {
                expiringBatches: batches,
                thresholdDays: trigger.conditions.expiryThresholdDays
            });
        });
    } else if (trigger.triggerType === TRIGGER_TYPES.DEMAND_FORECAST) {
        // Check demand forecast
        const transactionsDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "transactions.db",
        );
        
        const transactionsDB = new Datastore({
            filename: transactionsDbPath,
            autoload: true,
        });
        
        const daysAgo = new Date();
        daysAgo.setDate(daysAgo.getDate() - trigger.conditions.forecastDays);
        
        transactionsDB.find({
            productId: trigger.productId,
            date: { $gte: daysAgo.toISOString() }
        }, function(err, transactions) {
            if (err) {
                return callback(err);
            }
            
            const totalDemand = transactions.reduce((sum, t) => sum + Math.abs(parseInt(t.quantity) || 0), 0);
            const averageDemand = totalDemand / Math.max(transactions.length, 1);
            
            const shouldTrigger = averageDemand >= trigger.conditions.demandThreshold;
            
            callback(null, shouldTrigger, {
                averageDemand: averageDemand,
                threshold: trigger.conditions.demandThreshold,
                forecastDays: trigger.conditions.forecastDays
            });
        });
    } else {
        // Manual trigger or other types
        callback(null, false, {});
    }
}

module.exports.TRIGGER_TYPES = TRIGGER_TYPES;
module.exports.TRIGGER_FREQUENCIES = TRIGGER_FREQUENCIES;