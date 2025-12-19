const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const moment = require("moment");
const dbUtils = require("./db-utils");

// Initialize databases
const reportExecutionsDB = new Datastore({ filename: dbUtils.getDatabasePath("report-executions.db"), autoload: true });
const transactionsDB = new Datastore({ filename: dbUtils.getDatabasePath("transactions.db"), autoload: true });
const inventoryDB = new Datastore({ filename: dbUtils.getDatabasePath("inventory.db"), autoload: true });
const customersDB = new Datastore({ filename: dbUtils.getDatabasePath("customers.db"), autoload: true });
const batchesDB = new Datastore({ filename: dbUtils.getDatabasePath("batches.db"), autoload: true });
const storeInventoryDB = new Datastore({ filename: dbUtils.getDatabasePath("store-inventory.db"), autoload: true });

// Create indexes for better performance
reportExecutionsDB.ensureIndex({ fieldName: "reportId" });
reportExecutionsDB.ensureIndex({ fieldName: "executedAt" });

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get welcome message for Report Execution API.
 */
router.get("/", function (req, res) {
    res.send("Report Execution API");
});

/**
 * POST endpoint: Execute a custom report
 */
router.post("/execute", function (req, res) {
    const { reportId, reportConfig, filters, page = 1, limit = 50, exportFormat } = req.body;

    if (!reportConfig) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Report configuration is required.",
        });
    }

    const execution = {
        reportId: reportId,
        reportConfig: reportConfig,
        filters: filters || {},
        executedAt: new Date(),
        status: "running",
        parameters: { page, limit, exportFormat }
    };

    reportExecutionsDB.insert(execution, function (err, executionRecord) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to create execution record.",
            });
        }

        executeReport(reportConfig, filters, page, limit, function (err, result) {
            const statusUpdate = err ? "failed" : "completed";
            const error = err ? err.message : null;
            const completedAt = new Date();

            reportExecutionsDB.update(
                { _id: executionRecord._id },
                { $set: { status: statusUpdate, error: error, completedAt: completedAt, result: result } },
                {},
                function (updateErr) {
                    if (updateErr) {
                        console.error("Failed to update execution record:", updateErr);
                    }
                }
            );

            if (err) {
                return res.status(500).json({
                    error: "Report Execution Failed",
                    message: err.message,
                    executionId: executionRecord._id
                });
            }

            res.json({
                executionId: executionRecord._id,
                status: statusUpdate,
                executedAt: executionRecord.executedAt,
                completedAt: completedAt,
                result: result
            });
        });
    });
});

/**
 * POST endpoint: Execute report with real-time streaming
 */
router.post("/execute-stream", function (req, res) {
    const { reportConfig, filters } = req.body;

    if (!reportConfig) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Report configuration is required.",
        });
    }

    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked'
    });

    const sendChunk = (data) => {
        res.write(JSON.stringify(data) + '\n');
    };

    sendChunk({ status: "started", timestamp: new Date() });

    executeReportStream(reportConfig, filters, sendChunk, function (err) {
        if (err) {
            sendChunk({ status: "error", error: err.message, timestamp: new Date() });
        } else {
            sendChunk({ status: "completed", timestamp: new Date() });
        }
        res.end();
    });
});

/**
 * GET endpoint: Get execution status
 */
router.get("/execution/:id", function (req, res) {
    const { id } = req.params;

    reportExecutionsDB.findOne({ _id: id }, function (err, execution) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!execution) {
            return res.status(404).json({
                error: "Not Found",
                message: "Execution not found.",
            });
        }

        res.json(execution);
    });
});

/**
 * GET endpoint: Get execution history
 */
router.get("/executions", function (req, res) {
    const { reportId, status, page = 1, limit = 10 } = req.query;

    let query = {};
    if (reportId) {
        query.reportId = reportId;
    }
    if (status) {
        query.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    reportExecutionsDB.find(query)
        .sort({ executedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .exec(function (err, executions) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            reportExecutionsDB.count(query, function (err, totalCount) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.json({
                    executions: executions,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: totalCount,
                        pages: Math.ceil(totalCount / parseInt(limit))
                    }
                });
            });
        });
});

/**
 * POST endpoint: Export report data
 */
router.post("/export", function (req, res) {
    const { reportId, reportConfig, filters, exportFormat, filename } = req.body;

    if (!reportConfig || !exportFormat) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Report configuration and export format are required.",
        });
    }

    executeReport(reportConfig, filters, 1, 10000, function (err, result) {
        if (err) {
            return res.status(500).json({
                error: "Report Export Failed",
                message: err.message
            });
        }

        const exportData = {
            reportId: reportId,
            reportConfig: reportConfig,
            filters: filters,
            exportFormat: exportFormat,
            filename: filename || `report-${moment().format('YYYY-MM-DD-HH-mm-ss')}`,
            data: result.data,
            summary: result.summary,
            exportedAt: new Date()
        };

        // Store export record
        reportExecutionsDB.insert({
            ...exportData,
            status: "exported",
            executedAt: new Date(),
            completedAt: new Date()
        }, function (err, exportRecord) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to create export record.",
                });
            }

            res.json({
                exportId: exportRecord._id,
                filename: exportData.filename,
                format: exportFormat,
                recordCount: result.data.length,
                exportedAt: exportData.exportedAt
            });
        });
    });
});

/**
 * GET endpoint: Get available data sources
 */
router.get("/data-sources", function (req, res) {
    const dataSources = [
        {
            id: "transactions",
            name: "Sales Transactions",
            description: "All sales transactions and invoices",
            fields: [
                { key: "_id", label: "ID", type: "text" },
                { key: "date", label: "Date", type: "date" },
                { key: "invoiceNumber", label: "Invoice Number", type: "text" },
                { key: "customer", label: "Customer", type: "text" },
                { key: "items", label: "Items", type: "array" },
                { key: "subtotal", label: "Subtotal", type: "number" },
                { key: "taxAmount", label: "Tax Amount", type: "number" },
                { key: "discountAmount", label: "Discount Amount", type: "number" },
                { key: "total", label: "Total", type: "number" },
                { key: "paymentMethod", label: "Payment Method", type: "text" },
                { key: "status", label: "Status", type: "number" },
                { key: "storeId", label: "Store ID", type: "number" },
                { key: "user_id", label: "User ID", type: "text" }
            ]
        },
        {
            id: "inventory",
            name: "Inventory",
            description: "Product inventory and stock levels",
            fields: [
                { key: "_id", label: "ID", type: "text" },
                { key: "name", label: "Product Name", type: "text" },
                { key: "barcode", label: "Barcode", type: "text" },
                { key: "category", label: "Category", type: "text" },
                { key: "description", label: "Description", type: "text" },
                { key: "price", label: "Price", type: "number" },
                { key: "cost", label: "Cost", type: "number" },
                { key: "quantity", label: "Quantity", type: "number" },
                { key: "minStock", label: "Min Stock", type: "number" },
                { key: "maxStock", label: "Max Stock", type: "number" },
                { key: "supplier", label: "Supplier", type: "text" },
                { key: "isActive", label: "Is Active", type: "boolean" }
            ]
        },
        {
            id: "customers",
            name: "Customers",
            description: "Customer information and accounts",
            fields: [
                { key: "_id", label: "ID", type: "text" },
                { key: "name", label: "Name", type: "text" },
                { key: "email", label: "Email", type: "text" },
                { key: "phone", label: "Phone", type: "text" },
                { key: "address", label: "Address", type: "text" },
                { key: "city", label: "City", type: "text" },
                { key: "state", label: "State", type: "text" },
                { key: "postalCode", label: "Postal Code", type: "text" },
                { key: "loyaltyPoints", label: "Loyalty Points", type: "number" },
                { key: "totalPurchases", label: "Total Purchases", type: "number" },
                { key: "isActive", label: "Is Active", type: "boolean" }
            ]
        },
        {
            id: "batches",
            name: "Product Batches",
            description: "Batch information for inventory tracking",
            fields: [
                { key: "_id", label: "ID", type: "text" },
                { key: "productId", label: "Product ID", type: "text" },
                { key: "batchNumber", label: "Batch Number", type: "text" },
                { key: "expiryDate", label: "Expiry Date", type: "date" },
                { key: "manufactureDate", label: "Manufacture Date", type: "date" },
                { key: "initialQuantity", label: "Initial Quantity", type: "number" },
                { key: "currentQuantity", label: "Current Quantity", type: "number" },
                { key: "cost", label: "Cost", type: "number" },
                { key: "supplier", label: "Supplier", type: "text" },
                { key: "isActive", label: "Is Active", type: "boolean" }
            ]
        }
    ];

    res.json({ dataSources: dataSources });
});

/**
 * Helper function to execute a report
 */
function executeReport(reportConfig, filters, page, limit, callback) {
    const dataSource = reportConfig.dataSource;
    let db;

    // Select appropriate database
    switch (dataSource) {
        case "transactions":
            db = transactionsDB;
            break;
        case "inventory":
            db = inventoryDB;
            break;
        case "customers":
            db = customersDB;
            break;
        case "batches":
            db = batchesDB;
            break;
        default:
            return callback(new Error("Unknown data source: " + dataSource));
    }

    // Build query based on filters
    let query = buildQuery(filters, dataSource);

    const skip = (parseInt(page) - 1) * parseInt(limit);

    db.find(query)
        .sort(buildSortQuery(reportConfig.sortBy))
        .skip(skip)
        .limit(parseInt(limit))
        .exec(function (err, data) {
            if (err) {
                return callback(err);
            }

            // Process data based on report configuration
            const processedData = processData(data, reportConfig);

            // Get total count for pagination
            db.count(query, function (err, totalCount) {
                if (err) {
                    return callback(err);
                }

                const result = {
                    data: processedData.data,
                    summary: processedData.summary,
                    pagination: {
                        page: parseInt(page),
                        limit: parseInt(limit),
                        total: totalCount,
                        pages: Math.ceil(totalCount / parseInt(limit))
                    },
                    executedAt: new Date()
                };

                callback(null, result);
            });
        });
}

/**
 * Helper function to execute report with streaming
 */
function executeReportStream(reportConfig, filters, sendChunk, callback) {
    const dataSource = reportConfig.dataSource;
    let db;

    // Select appropriate database
    switch (dataSource) {
        case "transactions":
            db = transactionsDB;
            break;
        case "inventory":
            db = inventoryDB;
            break;
        case "customers":
            db = customersDB;
            break;
        case "batches":
            db = batchesDB;
            break;
        default:
            return callback(new Error("Unknown data source: " + dataSource));
    }

    // Build query based on filters
    let query = buildQuery(filters, dataSource);

    const cursor = db.find(query).sort(buildSortQuery(reportConfig.sortBy));
    
    let processedCount = 0;
    const batchSize = 100;

    cursor.exec(function (err, data) {
        if (err) {
            return callback(err);
        }

        // Process data in batches
        for (let i = 0; i < data.length; i += batchSize) {
            const batch = data.slice(i, i + batchSize);
            const processedBatch = processData(batch, reportConfig);
            
            sendChunk({
                type: "data",
                batch: Math.floor(i / batchSize) + 1,
                data: processedBatch.data,
                progress: Math.min(100, Math.round((i + batchSize) / data.length * 100))
            });

            processedCount += batch.length;
        }

        sendChunk({
            type: "summary",
            totalRecords: data.length,
            processedRecords: processedCount
        });

        callback(null);
    });
}

/**
 * Helper function to build query from filters
 */
function buildQuery(filters, dataSource) {
    let query = {};

    if (filters.dateRange && filters.dateRange.start && filters.dateRange.end) {
        query.date = {
            $gte: new Date(filters.dateRange.start),
            $lte: new Date(filters.dateRange.end)
        };
    }

    if (filters.customer) {
        query.customer = filters.customer;
    }

    if (filters.storeId) {
        query.storeId = parseInt(filters.storeId);
    }

    if (filters.category) {
        query.category = filters.category;
    }

    if (filters.status !== undefined) {
        query.status = parseInt(filters.status);
    }

    if (filters.isActive !== undefined) {
        query.isActive = filters.isActive === 'true';
    }

    return query;
}

/**
 * Helper function to build sort query
 */
function buildSortQuery(sortBy) {
    if (!sortBy) {
        return { createdAt: -1 };
    }

    const sort = {};
    sort[sortBy.field] = sortBy.direction === 'desc' ? -1 : 1;
    return sort;
}

/**
 * Helper function to process data based on report configuration
 */
function processData(data, reportConfig) {
    const processedData = {
        data: [],
        summary: {}
    };

    // Process each record
    data.forEach(record => {
        const processedRecord = {};

        // Map fields according to report configuration
        reportConfig.fields.forEach(field => {
            let value = getNestedValue(record, field.key);

            // Apply formatting
            if (field.format) {
                switch (field.type) {
                    case 'date':
                        value = moment(value).format(field.format);
                        break;
                    case 'currency':
                        value = parseFloat(value || 0).toFixed(2);
                        break;
                    case 'percentage':
                        value = parseFloat(value || 0).toFixed(2) + '%';
                        break;
                }
            }

            processedRecord[field.key] = value;
        });

        processedData.data.push(processedRecord);
    });

    // Apply grouping if specified
    if (reportConfig.groupBy && reportConfig.groupBy.length > 0) {
        processedData.data = groupData(processedData.data, reportConfig.groupBy);
    }

    // Generate summary
    processedData.summary = generateSummary(processedData.data, reportConfig);

    return processedData;
}

/**
 * Helper function to get nested value from object
 */
function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        return current && current[key] !== undefined ? current[key] : '';
    }, obj);
}

/**
 * Helper function to group data
 */
function groupData(data, groupBy) {
    const grouped = {};

    data.forEach(record => {
        const groupKey = groupBy.map(field => record[field] || 'Unknown').join('-');

        if (!grouped[groupKey]) {
            grouped[groupKey] = {
                group: groupKey,
                records: [],
                count: 0
            };
        }

        grouped[groupKey].records.push(record);
        grouped[groupKey].count++;
    });

    return Object.values(grouped);
}

/**
 * Helper function to generate summary
 */
function generateSummary(data, reportConfig) {
    const summary = {
        totalRecords: Array.isArray(data[0]?.records) ? 
            data.reduce((sum, group) => sum + group.count, 0) : 
            data.length,
        groups: Array.isArray(data[0]?.records) ? data.length : 0
    };

    // Calculate numeric field summaries
    reportConfig.fields.forEach(field => {
        if (field.type === 'number' || field.type === 'currency') {
            let total = 0;
            let count = 0;

            if (Array.isArray(data[0]?.records)) {
                data.forEach(group => {
                    group.records.forEach(record => {
                        const value = parseFloat(record[field.key]) || 0;
                        total += value;
                        count++;
                    });
                });
            } else {
                data.forEach(record => {
                    const value = parseFloat(record[field.key]) || 0;
                    total += value;
                    count++;
                });
            }

            summary[`${field.key}_total`] = total;
            summary[`${field.key}_average`] = count > 0 ? total / count : 0;
        }
    });

    return summary;
}