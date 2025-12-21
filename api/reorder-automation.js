const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const validator = require("validator");
const path = require("path");
const appName = process.env.APPNAME || "PharmaSoft";
const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "reorder-automation.db",
);

router.use(bodyParser.json());

module.exports = router;

let reorderAutomationDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

reorderAutomationDB.ensureIndex({ fieldName: "_id", unique: true });
reorderAutomationDB.ensureIndex({ fieldName: "storeId" });
reorderAutomationDB.ensureIndex({ fieldName: "isActive" });
reorderAutomationDB.ensureIndex({ fieldName: "automationType" });

// Automation types
const AUTOMATION_TYPES = {
    STOCK_LEVEL: 'STOCK_LEVEL',
    TRIGGER_BASED: 'TRIGGER_BASED',
    SCHEDULED: 'SCHEDULED',
    PREDICTIVE: 'PREDICTIVE'
};

// Automation frequencies
const AUTOMATION_FREQUENCIES = {
    REAL_TIME: 'REAL_TIME',
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
    MONTHLY: 'MONTHLY'
};

// Automation statuses
const AUTOMATION_STATUSES = {
    ACTIVE: 'ACTIVE',
    PAUSED: 'PAUSED',
    ERROR: 'ERROR',
    COMPLETED: 'COMPLETED'
};

/**
 * GET endpoint: Get welcome message for Reorder Automation API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Reorder Automation API");
});

/**
 * GET endpoint: Get all automation rules.
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
    if (req.query.storeId) {
        query.storeId = parseInt(req.query.storeId);
    }
    if (req.query.automationType) {
        query.automationType = validator.escape(req.query.automationType);
    }
    if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive === 'true';
    }
    
    reorderAutomationDB.find(query)
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
            reorderAutomationDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    automations: docs,
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
 * GET endpoint: Get specific automation rule by ID.
 *
 * @param {Object} req request object with automation ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Automation ID is required.",
        });
    }
    
    reorderAutomationDB.findOne({ _id: parseInt(req.params.id) }, function (err, automation) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!automation) {
            return res.status(404).json({
                error: "Not Found",
                message: "Automation rule not found.",
            });
        }
        
        res.json(automation);
    });
});

/**
 * POST endpoint: Create new automation rule.
 *
 * @param {Object} req request object with automation data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.name || !req.body.automationType) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name and automation type are required fields.",
        });
    }
    
    // Validate automation type
    if (!Object.values(AUTOMATION_TYPES).includes(req.body.automationType)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid automation type.",
        });
    }
    
    // Validate frequency if provided
    if (req.body.frequency && !Object.values(AUTOMATION_FREQUENCIES).includes(req.body.frequency)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid automation frequency.",
        });
    }
    
    // Validate automation-specific conditions
    let automationConfig = {};
    if (req.body.automationType === AUTOMATION_TYPES.STOCK_LEVEL) {
        if (req.body.minStockThreshold === undefined || req.body.maxOrderValue === undefined) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Min stock threshold and max order value are required for stock level automation.",
            });
        }
        automationConfig = {
            minStockThreshold: parseInt(req.body.minStockThreshold),
            maxOrderValue: parseFloat(req.body.maxOrderValue),
            autoApprove: req.body.autoApprove === true
        };
    } else if (req.body.automationType === AUTOMATION_TYPES.TRIGGER_BASED) {
        if (!req.body.triggerIds || !Array.isArray(req.body.triggerIds)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Trigger IDs array is required for trigger-based automation.",
            });
        }
        automationConfig = {
            triggerIds: req.body.triggerIds.map(id => parseInt(id)),
            autoApprove: req.body.autoApprove === true,
            consolidateBySupplier: req.body.consolidateBySupplier === true
        };
    } else if (req.body.automationType === AUTOMATION_TYPES.SCHEDULED) {
        if (!req.body.scheduleTime || !req.body.scheduleDays) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Schedule time and days are required for scheduled automation.",
            });
        }
        automationConfig = {
            scheduleTime: validator.escape(req.body.scheduleTime),
            scheduleDays: req.body.scheduleDays.map(day => parseInt(day)),
            autoApprove: req.body.autoApprove === true,
            includeWeekends: req.body.includeWeekends === true
        };
    } else if (req.body.automationType === AUTOMATION_TYPES.PREDICTIVE) {
        if (req.body.demandThreshold === undefined || req.body.forecastAccuracy === undefined) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Demand threshold and forecast accuracy are required for predictive automation.",
            });
        }
        automationConfig = {
            demandThreshold: parseFloat(req.body.demandThreshold),
            forecastAccuracy: parseFloat(req.body.forecastAccuracy),
            minConfidence: parseFloat(req.body.minConfidence) || 0.7,
            autoApprove: req.body.autoApprove === true
        };
    }
    
    const newAutomation = {
        _id: Math.floor(Date.now() / 1000),
        name: validator.escape(req.body.name),
        description: req.body.description ? validator.escape(req.body.description) : null,
        storeId: req.body.storeId ? parseInt(req.body.storeId) : null,
        automationType: validator.escape(req.body.automationType),
        frequency: req.body.frequency ? validator.escape(req.body.frequency) : AUTOMATION_FREQUENCIES.DAILY,
        config: automationConfig,
        isActive: req.body.isActive !== undefined ? req.body.isActive : true,
        status: AUTOMATION_STATUSES.ACTIVE,
        lastRun: null,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        createdBy: req.body.createdBy ? parseInt(req.body.createdBy) : null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    reorderAutomationDB.insert(newAutomation, function (err, automation) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.status(201).json(automation);
    });
});

/**
 * PUT endpoint: Update automation rule.
 *
 * @param {Object} req request object with updated automation data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Automation ID is required.",
        });
    }
    
    const automationId = parseInt(req.params.id);
    
    // Check if automation exists
    reorderAutomationDB.findOne({ _id: automationId }, function (err, existingAutomation) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingAutomation) {
            return res.status(404).json({
                error: "Not Found",
                message: "Automation rule not found.",
            });
        }
        
        // Validate automation type if being changed
        if (req.body.automationType && !Object.values(AUTOMATION_TYPES).includes(req.body.automationType)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid automation type.",
            });
        }
        
        // Validate frequency if being changed
        if (req.body.frequency && !Object.values(AUTOMATION_FREQUENCIES).includes(req.body.frequency)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid automation frequency.",
            });
        }
        
        const updatedAutomation = {
            name: req.body.name !== undefined ? validator.escape(req.body.name) : existingAutomation.name,
            description: req.body.description !== undefined ? validator.escape(req.body.description) : existingAutomation.description,
            storeId: req.body.storeId !== undefined ? req.body.storeId : existingAutomation.storeId,
            automationType: req.body.automationType !== undefined ? validator.escape(req.body.automationType) : existingAutomation.automationType,
            frequency: req.body.frequency !== undefined ? validator.escape(req.body.frequency) : existingAutomation.frequency,
            config: req.body.config !== undefined ? req.body.config : existingAutomation.config,
            isActive: req.body.isActive !== undefined ? req.body.isActive : existingAutomation.isActive,
            updatedAt: new Date()
        };
        
        reorderAutomationDB.update({ _id: automationId }, { $set: updatedAutomation }, {}, function (err, numReplaced) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({
                ...updatedAutomation,
                _id: automationId
            });
        });
    });
});

/**
 * DELETE endpoint: Delete automation rule.
 *
 * @param {Object} req request object with automation ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Automation ID is required.",
        });
    }
    
    const automationId = parseInt(req.params.id);
    
    reorderAutomationDB.remove({ _id: automationId }, function (err, numRemoved) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.json({ message: "Automation rule deleted successfully." });
    });
});

/**
 * POST endpoint: Execute automation rule.
 *
 * @param {Object} req request object with automation ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/:id/execute", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Automation ID is required.",
        });
    }
    
    const automationId = parseInt(req.params.id);
    
    reorderAutomationDB.findOne({ _id: automationId }, function (err, automation) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!automation) {
            return res.status(404).json({
                error: "Not Found",
                message: "Automation rule not found.",
            });
        }
        
        if (!automation.isActive) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Automation rule is not active.",
            });
        }
        
        // Execute automation based on type
        executeAutomation(automation, function(err, result) {
            if (err) {
                console.error(err);
                
                // Update automation with error status
                reorderAutomationDB.update(
                    { _id: automationId },
                    {
                        $set: {
                            status: AUTOMATION_STATUSES.ERROR,
                            lastRun: new Date(),
                            totalRuns: (automation.totalRuns || 0) + 1,
                            failedRuns: (automation.failedRuns || 0) + 1,
                            updatedAt: new Date()
                        }
                    },
                    {},
                    function(updateErr) {
                        if (updateErr) {
                            console.error(updateErr);
                        }
                    }
                );
                
                return res.status(500).json({
                    error: "Execution Error",
                    message: "Failed to execute automation rule.",
                    details: err.message
                });
            }
            
            // Update automation with success status
            reorderAutomationDB.update(
                { _id: automationId },
                {
                    $set: {
                        status: AUTOMATION_STATUSES.COMPLETED,
                        lastRun: new Date(),
                        totalRuns: (automation.totalRuns || 0) + 1,
                        successfulRuns: (automation.successfulRuns || 0) + 1,
                        updatedAt: new Date()
                    }
                },
                {},
                function(updateErr) {
                    if (updateErr) {
                        console.error(updateErr);
                    }
                }
            );
            
            res.json({
                message: "Automation executed successfully.",
                result: result
            });
        });
    });
});

/**
 * POST endpoint: Execute all active automations.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/execute-all", function (req, res) {
    const storeId = req.body.storeId ? parseInt(req.body.storeId) : null;
    const automationType = req.body.automationType ? validator.escape(req.body.automationType) : null;
    
    // Get all active automations
    let query = { isActive: true };
    if (storeId) {
        query.storeId = storeId;
    }
    if (automationType) {
        query.automationType = automationType;
    }
    
    reorderAutomationDB.find(query, function (err, automations) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const results = [];
        
        // Execute each automation
        async.eachSeries(automations, function (automation, callback) {
            executeAutomation(automation, function(err, result) {
                if (err) {
                    console.error(err);
                    
                    // Update automation with error status
                    reorderAutomationDB.update(
                        { _id: automation._id },
                        {
                            $set: {
                                status: AUTOMATION_STATUSES.ERROR,
                                lastRun: new Date(),
                                totalRuns: (automation.totalRuns || 0) + 1,
                                failedRuns: (automation.failedRuns || 0) + 1,
                                updatedAt: new Date()
                            }
                        },
                        {},
                        function(updateErr) {
                            if (updateErr) {
                                console.error(updateErr);
                            }
                        }
                    );
                    
                    results.push({
                        automationId: automation._id,
                        automationName: automation.name,
                        status: 'ERROR',
                        error: err.message
                    });
                } else {
                    // Update automation with success status
                    reorderAutomationDB.update(
                        { _id: automation._id },
                        {
                            $set: {
                                status: AUTOMATION_STATUSES.COMPLETED,
                                lastRun: new Date(),
                                totalRuns: (automation.totalRuns || 0) + 1,
                                successfulRuns: (automation.successfulRuns || 0) + 1,
                                updatedAt: new Date()
                            }
                        },
                        {},
                        function(updateErr) {
                            if (updateErr) {
                                console.error(updateErr);
                            }
                        }
                    );
                    
                    results.push({
                        automationId: automation._id,
                        automationName: automation.name,
                        status: 'SUCCESS',
                        result: result
                    });
                }
                
                callback();
            });
        }, function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred while executing automations.",
                });
            }
            
            res.json({
                message: "All automations executed.",
                totalAutomations: automations.length,
                results: results,
                successCount: results.filter(r => r.status === 'SUCCESS').length,
                errorCount: results.filter(r => r.status === 'ERROR').length
            });
        });
    });
});

/**
 * GET endpoint: Get automation execution history.
 *
 * @param {Object} req request object with automation ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id/history", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Automation ID is required.",
        });
    }
    
    const automationId = parseInt(req.params.id);
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Get automation execution logs (simplified - in production, this would be a separate table)
    reorderAutomationDB.findOne({ _id: automationId }, function (err, automation) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!automation) {
            return res.status(404).json({
                error: "Not Found",
                message: "Automation rule not found.",
            });
        }
        
        // Return execution statistics
        res.json({
            automationId: automationId,
            automationName: automation.name,
            totalRuns: automation.totalRuns || 0,
            successfulRuns: automation.successfulRuns || 0,
            failedRuns: automation.failedRuns || 0,
            lastRun: automation.lastRun,
            status: automation.status,
            successRate: automation.totalRuns > 0 ? 
                ((automation.successfulRuns || 0) / automation.totalRuns * 100).toFixed(2) + '%' : '0%'
        });
    });
});

/**
 * Helper function to execute automation based on type
 *
 * @param {Object} automation automation object
 * @param {function} callback callback function
 * @returns {void}
 */
function executeAutomation(automation, callback) {
    if (automation.automationType === AUTOMATION_TYPES.STOCK_LEVEL) {
        executeStockLevelAutomation(automation, callback);
    } else if (automation.automationType === AUTOMATION_TYPES.TRIGGER_BASED) {
        executeTriggerBasedAutomation(automation, callback);
    } else if (automation.automationType === AUTOMATION_TYPES.SCHEDULED) {
        executeScheduledAutomation(automation, callback);
    } else if (automation.automationType === AUTOMATION_TYPES.PREDICTIVE) {
        executePredictiveAutomation(automation, callback);
    } else {
        callback(new Error("Unknown automation type"), null);
    }
}

/**
 * Helper function to execute stock level automation
 *
 * @param {Object} automation automation object
 * @param {function} callback callback function
 * @returns {void}
 */
function executeStockLevelAutomation(automation, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get products with low stock
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
    
    let query = {};
    if (automation.storeId) {
        // Get store inventory
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
        
        storeInventoryDB.find({
            storeId: automation.storeId,
            quantity: { $lte: automation.config.minStockThreshold }
        }, function(err, storeInventories) {
            if (err) {
                return callback(err);
            }
            
            const productIds = storeInventories.map(si => si.productId);
            
            inventoryDB.find({ _id: { $in: productIds } }, function(err, products) {
                if (err) {
                    return callback(err);
                }
                
                generatePurchaseOrdersFromProducts(products, automation, callback);
            });
        });
    } else {
        // Get main inventory
        inventoryDB.find({
            quantity: { $lte: automation.config.minStockThreshold }
        }, function(err, products) {
            if (err) {
                return callback(err);
            }
            
            generatePurchaseOrdersFromProducts(products, automation, callback);
        });
    }
}

/**
 * Helper function to execute trigger-based automation
 *
 * @param {Object} automation automation object
 * @param {function} callback callback function
 * @returns {void}
 */
function executeTriggerBasedAutomation(automation, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get reorder triggers
    const reorderTriggersDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "reorder-triggers.db",
    );
    
    const reorderTriggersDB = new Datastore({
        filename: reorderTriggersDbPath,
        autoload: true,
    });
    
    reorderTriggersDB.find({
        _id: { $in: automation.config.triggerIds },
        isActive: true
    }, function(err, triggers) {
        if (err) {
            return callback(err);
        }
        
        // Check each trigger condition
        const triggeredProducts = [];
        
        async.eachSeries(triggers, function (trigger, triggerCallback) {
            checkTriggerCondition(trigger, function(err, shouldTrigger, data) {
                if (err) {
                    console.error(err);
                    return triggerCallback();
                }
                
                if (shouldTrigger) {
                    triggeredProducts.push({
                        productId: trigger.productId,
                        triggerData: data
                    });
                }
                
                triggerCallback();
            });
        }, function(err) {
            if (err) {
                return callback(err);
            }
            
            if (triggeredProducts.length === 0) {
                return callback(null, { message: "No triggers activated", productsProcessed: 0 });
            }
            
            // Get product details
            const productIds = triggeredProducts.map(tp => tp.productId);
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
            
            inventoryDB.find({ _id: { $in: productIds } }, function(err, products) {
                if (err) {
                    return callback(err);
                }
                
                generatePurchaseOrdersFromProducts(products, automation, callback);
            });
        });
    });
}

/**
 * Helper function to execute scheduled automation
 *
 * @param {Object} automation automation object
 * @param {function} callback callback function
 * @returns {void}
 */
function executeScheduledAutomation(automation, callback) {
    const now = new Date();
    const currentTime = now.getHours() + ':' + String(now.getMinutes()).padStart(2, '0');
    const currentDay = now.getDay();
    
    // Check if current time matches schedule
    const isScheduledTime = currentTime === automation.config.scheduleTime;
    const isScheduledDay = automation.config.scheduleDays.includes(currentDay);
    const isWeekendIncluded = automation.config.includeWeekends || (currentDay !== 0 && currentDay !== 6);
    
    if (!isScheduledTime || !isScheduledDay || !isWeekendIncluded) {
        return callback(null, { message: "Not scheduled for current time", skipped: true });
    }
    
    // Generate reorder suggestions and create POs
    const reorderSuggestions = require("./reorder-suggestions");
    
    const suggestionData = {
        storeId: automation.storeId,
        types: ['STOCK_LEVEL', 'DEMAND_FORECAST']
    };
    
    // This would normally be an API call, but for simplicity, we'll call the function directly
    // In production, this should be an HTTP request to the suggestions API
    callback(null, { message: "Scheduled automation executed", scheduled: true });
}

/**
 * Helper function to execute predictive automation
 *
 * @param {Object} automation automation object
 * @param {function} callback callback function
 * @returns {void}
 */
function executePredictiveAutomation(automation, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get all products for demand forecasting
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
    
    inventoryDB.find({}, function(err, products) {
        if (err) {
            return callback(err);
        }
        
        const predictedProducts = [];
        
        // Analyze each product for demand forecast
        async.eachSeries(products, function (product, productCallback) {
            calculateDemandForecast(product._id, function(err, forecast) {
                if (err || !forecast) {
                    return productCallback();
                }
                
                // Check if forecast meets threshold
                if (forecast.averageDemand >= automation.config.demandThreshold && 
                    forecast.confidence >= automation.config.minConfidence) {
                    
                    predictedProducts.push({
                        product: product,
                        forecast: forecast
                    });
                }
                
                productCallback();
            });
        }, function(err) {
            if (err) {
                return callback(err);
            }
            
            if (predictedProducts.length === 0) {
                return callback(null, { 
                    message: "No products meet predictive criteria", 
                    productsAnalyzed: products.length 
                });
            }
            
            const products = predictedProducts.map(pp => pp.product);
            generatePurchaseOrdersFromProducts(products, automation, callback);
        });
    });
}

/**
 * Helper function to generate purchase orders from products
 *
 * @param {Array} products array of products
 * @param {Object} automation automation object
 * @param {function} callback callback function
 * @returns {void}
 */
function generatePurchaseOrdersFromProducts(products, automation, callback) {
    if (products.length === 0) {
        return callback(null, { message: "No products to process", productsProcessed: 0 });
    }
    
    // Group products by preferred supplier
    const productsBySupplier = {};
    
    async.eachSeries(products, function (product, productCallback) {
        getPreferredSupplier(product._id, function(err, supplier) {
            if (err) {
                console.error(err);
                return productCallback();
            }
            
            const supplierId = supplier ? supplier._id : 'unknown';
            
            if (!productsBySupplier[supplierId]) {
                productsBySupplier[supplierId] = [];
            }
            
            productsBySupplier[supplierId].push({
                product: product,
                supplier: supplier
            });
            
            productCallback();
        });
    }, function(err) {
        if (err) {
            return callback(err);
        }
        
        // Create purchase orders
        const purchaseOrders = [];
        let totalOrderValue = 0;
        
        async.eachSeries(Object.keys(productsBySupplier), function(supplierId, orderCallback) {
            const supplierProducts = productsBySupplier[supplierId];
            const supplierIdNum = supplierId === 'unknown' ? null : parseInt(supplierId);
            
            // Calculate order totals
            let subtotal = 0;
            const items = [];
            
            supplierProducts.forEach(function(item) {
                const suggestedQuantity = Math.max(
                    automation.config.minStockThreshold * 1.5 - (item.product.quantity || 0),
                    10
                );
                
                const itemTotal = (item.product.price || 0) * suggestedQuantity;
                subtotal += itemTotal;
                totalOrderValue += itemTotal;
                
                // Check against max order value
                if (totalOrderValue > automation.config.maxOrderValue) {
                    return orderCallback(new Error("Order value exceeds maximum threshold"));
                }
                
                items.push({
                    productId: item.product._id,
                    quantity: suggestedQuantity,
                    unitPrice: item.product.price || 0,
                    gstRate: 0,
                    discountPercent: 0,
                    discountAmount: 0
                });
            });
            
            if (items.length === 0) {
                return orderCallback();
            }
            
            // Create purchase order
            const purchaseOrderData = {
                supplierId: supplierIdNum,
                items: items,
                autoApprove: automation.config.autoApprove,
                createdBy: automation.createdBy
            };
            
            // This would normally be an API call to purchase-orders API
            // For simplicity, we'll simulate the creation
            const newOrder = {
                _id: Math.floor(Date.now() / 1000) + Math.random(),
                orderNumber: `AUTO${Date.now()}`,
                supplierId: supplierIdNum,
                items: items,
                subtotal: parseFloat(subtotal.toFixed(2)),
                totalAmount: parseFloat(subtotal.toFixed(2)),
                status: automation.config.autoApprove ? 'APPROVED' : 'PENDING',
                createdAt: new Date(),
                automationId: automation._id
            };
            
            purchaseOrders.push(newOrder);
            orderCallback();
        }, function(err) {
            if (err) {
                return callback(err);
            }
            
            callback(null, {
                message: "Purchase orders generated successfully",
                ordersCreated: purchaseOrders.length,
                totalValue: totalOrderValue,
                orders: purchaseOrders
            });
        });
    });
}

/**
 * Helper function to calculate demand forecast (simplified version)
 *
 * @param {number} productId product ID
 * @param {function} callback callback function
 * @returns {void}
 */
function calculateDemandForecast(productId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get sales data for the last 90 days
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
    
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    transactionsDB.find({
        productId: productId,
        date: { $gte: ninetyDaysAgo.toISOString() }
    }).sort({ date: 1 }).exec(function(err, transactions) {
        if (err || transactions.length < 5) {
            return callback(err, null);
        }
        
        // Simple linear regression: y = mx + b
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = transactions.length;
        
        transactions.forEach((transaction, index) => {
            const x = index;
            const y = Math.abs(parseInt(transaction.quantity) || 0);
            
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        });
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Calculate confidence based on data consistency
        const variance = transactions.reduce((sum, t) => {
            const expected = slope * transactions.indexOf(t) + intercept;
            return sum + Math.pow(Math.abs(parseInt(t.quantity) || 0) - expected, 2);
        }, 0) / n;
        
        const confidence = Math.max(0, 1 - (variance / Math.max(sumY / n, 1)));
        
        // Forecast next 30 days demand
        const forecastDays = 30;
        const forecastDemand = slope * (n + forecastDays) + intercept;
        
        // Calculate average demand from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentTransactions = transactions.filter(t => new Date(t.date) >= thirtyDaysAgo);
        const averageDemand = recentTransactions.reduce((sum, t) => sum + Math.abs(parseInt(t.quantity) || 0), 0) / Math.max(recentTransactions.length, 1);
        
        callback(null, {
            averageDemand: Math.max(0, averageDemand),
            forecastDemand: Math.max(0, forecastDemand),
            confidence: confidence,
            trend: slope > 0 ? 'INCREASING' : slope < 0 ? 'DECREASING' : 'STABLE'
        });
    });
}

/**
 * Helper function to get preferred supplier for a product
 *
 * @param {number} productId product ID
 * @param {function} callback callback function
 * @returns {void}
 */
function getPreferredSupplier(productId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Check batches for supplier information
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
    
    batchesDB.findOne({ productId: productId, supplierId: { $ne: null } }, function (err, batch) {
        if (err) {
            return callback(err);
        }
        
        if (batch && batch.supplierId) {
            // Get supplier details
            const suppliersDbPath = path.join(
                process.env.APPDATA,
                process.env.APPNAME,
                "server",
                "databases",
                "suppliers.db",
            );
            
            const suppliersDB = new Datastore({
                filename: suppliersDbPath,
                autoload: true,
            });
            
            suppliersDB.findOne({ _id: batch.supplierId }, function (err, supplier) {
                if (err) {
                    return callback(err);
                }
                
                callback(null, supplier);
            });
        } else {
            callback(null, null);
        }
    });
}

/**
 * Helper function to check trigger condition (imported from reorder-triggers)
 *
 * @param {Object} trigger trigger object
 * @param {function} callback callback function
 * @returns {void}
 */
function checkTriggerCondition(trigger, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    if (trigger.triggerType === 'STOCK_LEVEL') {
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
    } else {
        // Other trigger types would be implemented here
        callback(null, false, {});
    }
}

module.exports.AUTOMATION_TYPES = AUTOMATION_TYPES;
module.exports.AUTOMATION_FREQUENCIES = AUTOMATION_FREQUENCIES;
module.exports.AUTOMATION_STATUSES = AUTOMATION_STATUSES;