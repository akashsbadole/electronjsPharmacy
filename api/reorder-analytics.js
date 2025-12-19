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
    "reorder-analytics.db",
);

router.use(bodyParser.json());

module.exports = router;

let reorderAnalyticsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

reorderAnalyticsDB.ensureIndex({ fieldName: "_id", unique: true });
reorderAnalyticsDB.ensureIndex({ fieldName: "storeId" });
reorderAnalyticsDB.ensureIndex({ fieldName: "metricType" });
reorderAnalyticsDB.ensureIndex({ fieldName: "date" });

// Analytics metric types
const METRIC_TYPES = {
    REORDER_SUGGESTION_ACCURACY: 'REORDER_SUGGESTION_ACCURACY',
    TRIGGER_PERFORMANCE: 'TRIGGER_PERFORMANCE',
    AUTOMATION_EFFICIENCY: 'AUTOMATION_EFFICIENCY',
    SUPPLIER_PERFORMANCE: 'SUPPLIER_PERFORMANCE',
    INVENTORY_TURNOVER: 'INVENTORY_TURNOVER',
    STOCK_OUT_ANALYSIS: 'STOCK_OUT_ANALYSIS',
    DEMAND_FORECAST_ACCURACY: 'DEMAND_FORECAST_ACCURACY'
};

// Time periods for analytics
const TIME_PERIODS = {
    DAILY: 'DAILY',
    WEEKLY: 'WEEKLY',
    MONTHLY: 'MONTHLY',
    QUARTERLY: 'QUARTERLY',
    YEARLY: 'YEARLY'
};

/**
 * GET endpoint: Get welcome message for Reorder Analytics API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Reorder Analytics API");
});

/**
 * GET endpoint: Get analytics metrics.
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
    if (req.query.metricType) {
        query.metricType = validator.escape(req.query.metricType);
    }
    if (req.query.startDate && req.query.endDate) {
        query.date = {
            $gte: validator.escape(req.query.startDate),
            $lte: validator.escape(req.query.endDate)
        };
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
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
            reorderAnalyticsDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    metrics: docs,
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
 * GET endpoint: Get specific metric by ID.
 *
 * @param {Object} req request object with metric ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Metric ID is required.",
        });
    }
    
    reorderAnalyticsDB.findOne({ _id: parseInt(req.params.id) }, function (err, metric) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!metric) {
            return res.status(404).json({
                error: "Not Found",
                message: "Metric not found.",
            });
        }
        
        res.json(metric);
    });
});

/**
 * POST endpoint: Create analytics metric.
 *
 * @param {Object} req request object with metric data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.metricType || !req.body.value === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Metric type and value are required fields.",
        });
    }
    
    // Validate metric type
    if (!Object.values(METRIC_TYPES).includes(req.body.metricType)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid metric type.",
        });
    }
    
    const newMetric = {
        _id: Math.floor(Date.now() / 1000),
        metricType: validator.escape(req.body.metricType),
        value: parseFloat(req.body.value),
        unit: req.body.unit ? validator.escape(req.body.unit) : null,
        storeId: req.body.storeId ? parseInt(req.body.storeId) : null,
        productId: req.body.productId ? parseInt(req.body.productId) : null,
        supplierId: req.body.supplierId ? parseInt(req.body.supplierId) : null,
        referenceId: req.body.referenceId ? validator.escape(req.body.referenceId) : null,
        metadata: req.body.metadata || {},
        date: req.body.date ? new Date(req.body.date) : new Date(),
        createdAt: new Date()
    };
    
    reorderAnalyticsDB.insert(newMetric, function (err, metric) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.status(201).json(metric);
    });
});

/**
 * GET endpoint: Get reorder suggestion accuracy metrics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/suggestion-accuracy", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const timePeriod = req.query.timePeriod || TIME_PERIODS.MONTHLY;
    
    // Build query
    let query = { metricType: METRIC_TYPES.REORDER_SUGGESTION_ACCURACY };
    if (storeId) {
        query.storeId = storeId;
    }
    if (startDate && endDate) {
        query.date = {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Calculate accuracy statistics
            const accuracyStats = calculateAccuracyStats(metrics, timePeriod);
            
            res.json({
                metrics: metrics,
                statistics: accuracyStats,
                timePeriod: timePeriod,
                totalMetrics: metrics.length
            });
        });
});

/**
 * GET endpoint: Get trigger performance metrics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/trigger-performance", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const triggerId = req.query.triggerId ? parseInt(req.query.triggerId) : null;
    
    // Build query
    let query = { metricType: METRIC_TYPES.TRIGGER_PERFORMANCE };
    if (storeId) {
        query.storeId = storeId;
    }
    if (triggerId) {
        query.referenceId = triggerId.toString();
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Calculate trigger performance statistics
            const performanceStats = calculateTriggerPerformanceStats(metrics);
            
            res.json({
                metrics: metrics,
                statistics: performanceStats,
                totalMetrics: metrics.length
            });
        });
});

/**
 * GET endpoint: Get automation efficiency metrics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/automation-efficiency", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const automationId = req.query.automationId ? parseInt(req.query.automationId) : null;
    
    // Build query
    let query = { metricType: METRIC_TYPES.AUTOMATION_EFFICIENCY };
    if (storeId) {
        query.storeId = storeId;
    }
    if (automationId) {
        query.referenceId = automationId.toString();
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Calculate automation efficiency statistics
            const efficiencyStats = calculateAutomationEfficiencyStats(metrics);
            
            res.json({
                metrics: metrics,
                statistics: efficiencyStats,
                totalMetrics: metrics.length
            });
        });
});

/**
 * GET endpoint: Get supplier performance metrics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/supplier-performance", function (req, res) {
    const supplierId = req.query.supplierId ? parseInt(req.query.supplierId) : null;
    
    // Build query
    let query = { metricType: METRIC_TYPES.SUPPLIER_PERFORMANCE };
    if (supplierId) {
        query.supplierId = supplierId;
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Calculate supplier performance statistics
            const performanceStats = calculateSupplierPerformanceStats(metrics);
            
            res.json({
                metrics: metrics,
                statistics: performanceStats,
                totalMetrics: metrics.length
            });
        });
});

/**
 * GET endpoint: Get inventory turnover metrics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/inventory-turnover", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const productId = req.query.productId ? parseInt(req.query.productId) : null;
    const timePeriod = req.query.timePeriod || TIME_PERIODS.MONTHLY;
    
    // Build query
    let query = { metricType: METRIC_TYPES.INVENTORY_TURNOVER };
    if (storeId) {
        query.storeId = storeId;
    }
    if (productId) {
        query.productId = productId;
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Calculate inventory turnover statistics
            const turnoverStats = calculateInventoryTurnoverStats(metrics, timePeriod);
            
            res.json({
                metrics: metrics,
                statistics: turnoverStats,
                timePeriod: timePeriod,
                totalMetrics: metrics.length
            });
        });
});

/**
 * GET endpoint: Get stock-out analysis metrics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/stock-out-analysis", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const productId = req.query.productId ? parseInt(req.query.productId) : null;
    const timePeriod = req.query.timePeriod || TIME_PERIODS.MONTHLY;
    
    // Build query
    let query = { metricType: METRIC_TYPES.STOCK_OUT_ANALYSIS };
    if (storeId) {
        query.storeId = storeId;
    }
    if (productId) {
        query.productId = productId;
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Calculate stock-out analysis statistics
            const stockOutStats = calculateStockOutStats(metrics, timePeriod);
            
            res.json({
                metrics: metrics,
                statistics: stockOutStats,
                timePeriod: timePeriod,
                totalMetrics: metrics.length
            });
        });
});

/**
 * GET endpoint: Get demand forecast accuracy metrics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/demand-forecast-accuracy", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const productId = req.query.productId ? parseInt(req.query.productId) : null;
    const timePeriod = req.query.timePeriod || TIME_PERIODS.MONTHLY;
    
    // Build query
    let query = { metricType: METRIC_TYPES.DEMAND_FORECAST_ACCURACY };
    if (storeId) {
        query.storeId = storeId;
    }
    if (productId) {
        query.productId = productId;
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Calculate demand forecast accuracy statistics
            const forecastStats = calculateDemandForecastAccuracyStats(metrics, timePeriod);
            
            res.json({
                metrics: metrics,
                statistics: forecastStats,
                timePeriod: timePeriod,
                totalMetrics: metrics.length
            });
        });
});

/**
 * GET endpoint: Get comprehensive dashboard analytics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/dashboard", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const timePeriod = req.query.timePeriod || TIME_PERIODS.MONTHLY;
    
    // Get all relevant metrics for the dashboard
    const metricTypes = [
        METRIC_TYPES.REORDER_SUGGESTION_ACCURACY,
        METRIC_TYPES.TRIGGER_PERFORMANCE,
        METRIC_TYPES.AUTOMATION_EFFICIENCY,
        METRIC_TYPES.INVENTORY_TURNOVER,
        METRIC_TYPES.STOCK_OUT_ANALYSIS
    ];
    
    let query = { metricType: { $in: metricTypes } };
    if (storeId) {
        query.storeId = storeId;
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Group metrics by type
            const metricsByType = {};
            metrics.forEach(metric => {
                if (!metricsByType[metric.metricType]) {
                    metricsByType[metric.metricType] = [];
                }
                metricsByType[metric.metricType].push(metric);
            });
            
            // Calculate dashboard statistics
            const dashboardStats = {
                suggestionAccuracy: calculateAccuracyStats(metricsByType[METRIC_TYPES.REORDER_SUGGESTION_ACCURACY] || [], timePeriod),
                triggerPerformance: calculateTriggerPerformanceStats(metricsByType[METRIC_TYPES.TRIGGER_PERFORMANCE] || []),
                automationEfficiency: calculateAutomationEfficiencyStats(metricsByType[METRIC_TYPES.AUTOMATION_EFFICIENCY] || []),
                inventoryTurnover: calculateInventoryTurnoverStats(metricsByType[METRIC_TYPES.INVENTORY_TURNOVER] || [], timePeriod),
                stockOutAnalysis: calculateStockOutStats(metricsByType[METRIC_TYPES.STOCK_OUT_ANALYSIS] || [], timePeriod)
            };
            
            res.json({
                dashboard: dashboardStats,
                timePeriod: timePeriod,
                totalMetrics: metrics.length,
                lastUpdated: new Date()
            });
        });
});

/**
 * POST endpoint: Generate analytics report.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/generate-report", function (req, res) {
    const storeId = req.body.storeId ? parseInt(req.body.storeId) : null;
    const metricTypes = req.body.metricTypes || [];
    const startDate = req.body.startDate ? new Date(req.body.startDate) : null;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;
    const timePeriod = req.body.timePeriod || TIME_PERIODS.MONTHLY;
    
    if (metricTypes.length === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "At least one metric type is required.",
        });
    }
    
    // Validate metric types
    const validMetricTypes = metricTypes.filter(type => Object.values(METRIC_TYPES).includes(type));
    if (validMetricTypes.length !== metricTypes.length) {
        return res.status(400).json({
            error: "Bad Request",
            message: "One or more invalid metric types provided.",
        });
    }
    
    // Build query
    let query = { metricType: { $in: validMetricTypes } };
    if (storeId) {
        query.storeId = storeId;
    }
    if (startDate && endDate) {
        query.date = {
            $gte: startDate,
            $lte: endDate
        };
    }
    
    reorderAnalyticsDB.find(query)
        .sort({ date: -1 })
        .exec(function (err, metrics) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Group metrics by type
            const metricsByType = {};
            metrics.forEach(metric => {
                if (!metricsByType[metric.metricType]) {
                    metricsByType[metric.metricType] = [];
                }
                metricsByType[metric.metricType].push(metric);
            });
            
            // Generate report
            const report = {
                generatedAt: new Date(),
                storeId: storeId,
                timePeriod: timePeriod,
                dateRange: {
                    startDate: startDate,
                    endDate: endDate
                },
                summary: {
                    totalMetrics: metrics.length,
                    metricTypes: validMetricTypes
                },
                sections: {}
            };
            
            // Add sections for each metric type
            validMetricTypes.forEach(metricType => {
                const typeMetrics = metricsByType[metricType] || [];
                
                switch (metricType) {
                    case METRIC_TYPES.REORDER_SUGGESTION_ACCURACY:
                        report.sections.suggestionAccuracy = calculateAccuracyStats(typeMetrics, timePeriod);
                        break;
                    case METRIC_TYPES.TRIGGER_PERFORMANCE:
                        report.sections.triggerPerformance = calculateTriggerPerformanceStats(typeMetrics);
                        break;
                    case METRIC_TYPES.AUTOMATION_EFFICIENCY:
                        report.sections.automationEfficiency = calculateAutomationEfficiencyStats(typeMetrics);
                        break;
                    case METRIC_TYPES.SUPPLIER_PERFORMANCE:
                        report.sections.supplierPerformance = calculateSupplierPerformanceStats(typeMetrics);
                        break;
                    case METRIC_TYPES.INVENTORY_TURNOVER:
                        report.sections.inventoryTurnover = calculateInventoryTurnoverStats(typeMetrics, timePeriod);
                        break;
                    case METRIC_TYPES.STOCK_OUT_ANALYSIS:
                        report.sections.stockOutAnalysis = calculateStockOutStats(typeMetrics, timePeriod);
                        break;
                    case METRIC_TYPES.DEMAND_FORECAST_ACCURACY:
                        report.sections.demandForecastAccuracy = calculateDemandForecastAccuracyStats(typeMetrics, timePeriod);
                        break;
                }
            });
            
            res.json({
                report: report,
                message: "Analytics report generated successfully."
            });
        });
});

/**
 * Helper function to calculate accuracy statistics
 *
 * @param {Array} metrics array of metrics
 * @param {string} timePeriod time period
 * @returns {Object} accuracy statistics
 */
function calculateAccuracyStats(metrics, timePeriod) {
    if (metrics.length === 0) {
        return {
            averageAccuracy: 0,
            totalSuggestions: 0,
            acceptedSuggestions: 0,
            accuracyRate: '0%'
        };
    }
    
    const totalSuggestions = metrics.reduce((sum, m) => sum + (m.metadata.totalSuggestions || 0), 0);
    const acceptedSuggestions = metrics.reduce((sum, m) => sum + (m.metadata.acceptedSuggestions || 0), 0);
    const averageAccuracy = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    
    return {
        averageAccuracy: parseFloat(averageAccuracy.toFixed(2)),
        totalSuggestions: totalSuggestions,
        acceptedSuggestions: acceptedSuggestions,
        accuracyRate: totalSuggestions > 0 ? ((acceptedSuggestions / totalSuggestions) * 100).toFixed(2) + '%' : '0%',
        trend: calculateTrend(metrics),
        timePeriod: timePeriod
    };
}

/**
 * Helper function to calculate trigger performance statistics
 *
 * @param {Array} metrics array of metrics
 * @returns {Object} trigger performance statistics
 */
function calculateTriggerPerformanceStats(metrics) {
    if (metrics.length === 0) {
        return {
            averageResponseTime: 0,
            totalTriggers: 0,
            successfulTriggers: 0,
            successRate: '0%'
        };
    }
    
    const totalTriggers = metrics.reduce((sum, m) => sum + (m.metadata.totalTriggers || 0), 0);
    const successfulTriggers = metrics.reduce((sum, m) => sum + (m.metadata.successfulTriggers || 0), 0);
    const averageResponseTime = metrics.reduce((sum, m) => sum + (m.metadata.responseTime || 0), 0) / metrics.length;
    
    return {
        averageResponseTime: parseFloat(averageResponseTime.toFixed(2)),
        totalTriggers: totalTriggers,
        successfulTriggers: successfulTriggers,
        successRate: totalTriggers > 0 ? ((successfulTriggers / totalTriggers) * 100).toFixed(2) + '%' : '0%',
        trend: calculateTrend(metrics)
    };
}

/**
 * Helper function to calculate automation efficiency statistics
 *
 * @param {Array} metrics array of metrics
 * @returns {Object} automation efficiency statistics
 */
function calculateAutomationEfficiencyStats(metrics) {
    if (metrics.length === 0) {
        return {
            averageEfficiency: 0,
            totalAutomations: 0,
            successfulAutomations: 0,
            timeSaved: 0,
            efficiencyRate: '0%'
        };
    }
    
    const totalAutomations = metrics.reduce((sum, m) => sum + (m.metadata.totalAutomations || 0), 0);
    const successfulAutomations = metrics.reduce((sum, m) => sum + (m.metadata.successfulAutomations || 0), 0);
    const averageEfficiency = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    const timeSaved = metrics.reduce((sum, m) => sum + (m.metadata.timeSaved || 0), 0);
    
    return {
        averageEfficiency: parseFloat(averageEfficiency.toFixed(2)),
        totalAutomations: totalAutomations,
        successfulAutomations: successfulAutomations,
        timeSaved: timeSaved,
        efficiencyRate: totalAutomations > 0 ? ((successfulAutomations / totalAutomations) * 100).toFixed(2) + '%' : '0%',
        trend: calculateTrend(metrics)
    };
}

/**
 * Helper function to calculate supplier performance statistics
 *
 * @param {Array} metrics array of metrics
 * @returns {Object} supplier performance statistics
 */
function calculateSupplierPerformanceStats(metrics) {
    if (metrics.length === 0) {
        return {
            averageDeliveryTime: 0,
            averageQuality: 0,
            totalOrders: 0,
            onTimeDeliveryRate: '0%'
        };
    }
    
    const totalOrders = metrics.reduce((sum, m) => sum + (m.metadata.totalOrders || 0), 0);
    const averageDeliveryTime = metrics.reduce((sum, m) => sum + (m.metadata.deliveryTime || 0), 0) / metrics.length;
    const averageQuality = metrics.reduce((sum, m) => sum + (m.metadata.quality || 0), 0) / metrics.length;
    const onTimeDeliveries = metrics.reduce((sum, m) => sum + (m.metadata.onTimeDeliveries || 0), 0);
    
    return {
        averageDeliveryTime: parseFloat(averageDeliveryTime.toFixed(2)),
        averageQuality: parseFloat(averageQuality.toFixed(2)),
        totalOrders: totalOrders,
        onTimeDeliveryRate: totalOrders > 0 ? ((onTimeDeliveries / totalOrders) * 100).toFixed(2) + '%' : '0%',
        trend: calculateTrend(metrics)
    };
}

/**
 * Helper function to calculate inventory turnover statistics
 *
 * @param {Array} metrics array of metrics
 * @param {string} timePeriod time period
 * @returns {Object} inventory turnover statistics
 */
function calculateInventoryTurnoverStats(metrics, timePeriod) {
    if (metrics.length === 0) {
        return {
            averageTurnover: 0,
            totalProducts: 0,
            fastMovingProducts: 0,
            slowMovingProducts: 0
        };
    }
    
    const totalProducts = metrics.reduce((sum, m) => sum + (m.metadata.totalProducts || 0), 0);
    const averageTurnover = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    const fastMovingProducts = metrics.reduce((sum, m) => sum + (m.metadata.fastMovingProducts || 0), 0);
    const slowMovingProducts = metrics.reduce((sum, m) => sum + (m.metadata.slowMovingProducts || 0), 0);
    
    return {
        averageTurnover: parseFloat(averageTurnover.toFixed(2)),
        totalProducts: totalProducts,
        fastMovingProducts: fastMovingProducts,
        slowMovingProducts: slowMovingProducts,
        fastMovingRate: totalProducts > 0 ? ((fastMovingProducts / totalProducts) * 100).toFixed(2) + '%' : '0%',
        slowMovingRate: totalProducts > 0 ? ((slowMovingProducts / totalProducts) * 100).toFixed(2) + '%' : '0%',
        trend: calculateTrend(metrics),
        timePeriod: timePeriod
    };
}

/**
 * Helper function to calculate stock-out statistics
 *
 * @param {Array} metrics array of metrics
 * @param {string} timePeriod time period
 * @returns {Object} stock-out statistics
 */
function calculateStockOutStats(metrics, timePeriod) {
    if (metrics.length === 0) {
        return {
            averageStockOutDuration: 0,
            totalStockOuts: 0,
            averageLostSales: 0
        };
    }
    
    const totalStockOuts = metrics.reduce((sum, m) => sum + (m.metadata.totalStockOuts || 0), 0);
    const averageStockOutDuration = metrics.reduce((sum, m) => sum + (m.metadata.duration || 0), 0) / metrics.length;
    const averageLostSales = metrics.reduce((sum, m) => sum + (m.metadata.lostSales || 0), 0) / metrics.length;
    
    return {
        averageStockOutDuration: parseFloat(averageStockOutDuration.toFixed(2)),
        totalStockOuts: totalStockOuts,
        averageLostSales: parseFloat(averageLostSales.toFixed(2)),
        trend: calculateTrend(metrics),
        timePeriod: timePeriod
    };
}

/**
 * Helper function to calculate demand forecast accuracy statistics
 *
 * @param {Array} metrics array of metrics
 * @param {string} timePeriod time period
 * @returns {Object} demand forecast accuracy statistics
 */
function calculateDemandForecastAccuracyStats(metrics, timePeriod) {
    if (metrics.length === 0) {
        return {
            averageAccuracy: 0,
            totalForecasts: 0,
            accurateForecasts: 0,
            accuracyRate: '0%'
        };
    }
    
    const totalForecasts = metrics.reduce((sum, m) => sum + (m.metadata.totalForecasts || 0), 0);
    const accurateForecasts = metrics.reduce((sum, m) => sum + (m.metadata.accurateForecasts || 0), 0);
    const averageAccuracy = metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length;
    
    return {
        averageAccuracy: parseFloat(averageAccuracy.toFixed(2)),
        totalForecasts: totalForecasts,
        accurateForecasts: accurateForecasts,
        accuracyRate: totalForecasts > 0 ? ((accurateForecasts / totalForecasts) * 100).toFixed(2) + '%' : '0%',
        trend: calculateTrend(metrics),
        timePeriod: timePeriod
    };
}

/**
 * Helper function to calculate trend from metrics
 *
 * @param {Array} metrics array of metrics
 * @returns {string} trend direction
 */
function calculateTrend(metrics) {
    if (metrics.length < 2) {
        return 'INSUFFICIENT_DATA';
    }
    
    // Sort metrics by date
    const sortedMetrics = metrics.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate trend using first and last values
    const firstValue = sortedMetrics[0].value;
    const lastValue = sortedMetrics[sortedMetrics.length - 1].value;
    
    if (lastValue > firstValue * 1.1) {
        return 'IMPROVING';
    } else if (lastValue < firstValue * 0.9) {
        return 'DECLINING';
    } else {
        return 'STABLE';
    }
}

module.exports.METRIC_TYPES = METRIC_TYPES;
module.exports.TIME_PERIODS = TIME_PERIODS;