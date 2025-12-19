const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const dbUtils = require("./db-utils");

// Initialize databases
const reportTemplatesDB = new Datastore({ filename: dbUtils.getDatabasePath("report-templates.db"), autoload: true });

// Create indexes for better performance
reportTemplatesDB.ensureIndex({ fieldName: "name", unique: true });
reportTemplatesDB.ensureIndex({ fieldName: "category" });
reportTemplatesDB.ensureIndex({ fieldName: "isSystem" });

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get welcome message for Report Templates API.
 */
router.get("/", function (req, res) {
    res.send("Report Templates API");
});

/**
 * GET endpoint: Get all report templates
 */
router.get("/templates", function (req, res) {
    const { category, isSystem, page = 1, limit = 10 } = req.query;
    
    let query = {};
    if (category) {
        query.category = category;
    }
    if (isSystem !== undefined) {
        query.isSystem = isSystem === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    reportTemplatesDB.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .exec(function (err, templates) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            reportTemplatesDB.count(query, function (err, totalCount) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.json({
                    templates: templates,
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
 * GET endpoint: Get a specific report template by ID
 */
router.get("/templates/:id", function (req, res) {
    const { id } = req.params;

    reportTemplatesDB.findOne({ _id: id }, function (err, template) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!template) {
            return res.status(404).json({
                error: "Not Found",
                message: "Template not found.",
            });
        }

        res.json(template);
    });
});

/**
 * POST endpoint: Create a new report template
 */
router.post("/templates", function (req, res) {
    const { name, description, category, dataSource, fields, filters, groupBy, sortBy, chartConfig, isSystem, createdBy } = req.body;

    if (!name || !category || !dataSource || !fields) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name, category, data source, and fields are required.",
        });
    }

    const template = {
        name: name,
        description: description || "",
        category: category,
        dataSource: dataSource,
        fields: fields,
        filters: filters || {},
        groupBy: groupBy || [],
        sortBy: sortBy || { field: "createdAt", direction: "desc" },
        chartConfig: chartConfig || null,
        isSystem: isSystem || false,
        createdBy: createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
    };

    reportTemplatesDB.insert(template, function (err, newTemplate) {
        if (err) {
            if (err.errorType === "uniqueViolated") {
                return res.status(409).json({
                    error: "Conflict",
                    message: "A template with this name already exists.",
                });
            }
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        res.status(201).json(newTemplate);
    });
});

/**
 * PUT endpoint: Update an existing report template
 */
router.put("/templates/:id", function (req, res) {
    const { id } = req.params;
    const { name, description, category, dataSource, fields, filters, groupBy, sortBy, chartConfig, updatedBy } = req.body;

    if (!name || !category || !dataSource || !fields) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name, category, data source, and fields are required.",
        });
    }

    const updateData = {
        name: name,
        description: description || "",
        category: category,
        dataSource: dataSource,
        fields: fields,
        filters: filters || {},
        groupBy: groupBy || [],
        sortBy: sortBy || { field: "createdAt", direction: "desc" },
        chartConfig: chartConfig || null,
        updatedBy: updatedBy,
        updatedAt: new Date()
    };

    reportTemplatesDB.update({ _id: id }, { $set: updateData }, {}, function (err, numUpdated) {
        if (err) {
            if (err.errorType === "uniqueViolated") {
                return res.status(409).json({
                    error: "Conflict",
                    message: "A template with this name already exists.",
                });
            }
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (numUpdated === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: "Template not found.",
            });
        }

        reportTemplatesDB.findOne({ _id: id }, function (err, updatedTemplate) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            res.json(updatedTemplate);
        });
    });
});

/**
 * DELETE endpoint: Delete a report template
 */
router.delete("/templates/:id", function (req, res) {
    const { id } = req.params;

    reportTemplatesDB.findOne({ _id: id }, function (err, template) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!template) {
            return res.status(404).json({
                error: "Not Found",
                message: "Template not found.",
            });
        }

        if (template.isSystem) {
            return res.status(403).json({
                error: "Forbidden",
                message: "System templates cannot be deleted.",
            });
        }

        reportTemplatesDB.remove({ _id: id }, {}, function (err, numRemoved) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            res.json({ message: "Template deleted successfully" });
        });
    });
});

/**
 * GET endpoint: Get template categories
 */
router.get("/categories", function (req, res) {
    reportTemplatesDB.find({ isActive: true }).exec(function (err, templates) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const categories = [...new Set(templates.map(template => template.category))];
        
        res.json({
            categories: categories.sort()
        });
    });
});

/**
 * POST endpoint: Initialize system templates
 */
router.post("/initialize-system-templates", function (req, res) {
    const systemTemplates = [
        {
            name: "Sales Summary",
            description: "Summary of sales transactions with total revenue and item counts",
            category: "Sales",
            dataSource: "transactions",
            fields: [
                { key: "date", label: "Date", type: "date", format: "YYYY-MM-DD" },
                { key: "invoiceNumber", label: "Invoice Number", type: "text" },
                { key: "customer", label: "Customer", type: "text" },
                { key: "items", label: "Items Count", type: "number" },
                { key: "subtotal", label: "Subtotal", type: "currency" },
                { key: "tax", label: "Tax", type: "currency" },
                { key: "total", label: "Total", type: "currency" },
                { key: "paymentMethod", label: "Payment Method", type: "text" }
            ],
            filters: {
                dateRange: true,
                customer: true,
                paymentMethod: true
            },
            groupBy: ["date"],
            sortBy: { field: "date", direction: "desc" },
            chartConfig: {
                type: "line",
                xAxis: "date",
                yAxis: "total"
            },
            isSystem: true,
            createdBy: "system"
        },
        {
            name: "Inventory Status",
            description: "Current inventory levels with stock status indicators",
            category: "Inventory",
            dataSource: "inventory",
            fields: [
                { key: "name", label: "Product Name", type: "text" },
                { key: "barcode", label: "Barcode", type: "text" },
                { key: "category", label: "Category", type: "text" },
                { key: "currentQuantity", label: "Current Quantity", type: "number" },
                { key: "minStock", label: "Min Stock", type: "number" },
                { key: "price", label: "Price", type: "currency" },
                { key: "stockValue", label: "Stock Value", type: "currency" },
                { key: "status", label: "Status", type: "text" }
            ],
            filters: {
                category: true,
                status: true,
                lowStock: true
            },
            groupBy: ["category"],
            sortBy: { field: "name", direction: "asc" },
            chartConfig: {
                type: "pie",
                xAxis: "category",
                yAxis: "stockValue"
            },
            isSystem: true,
            createdBy: "system"
        },
        {
            name: "Customer Analysis",
            description: "Customer purchase patterns and transaction history",
            category: "Customers",
            dataSource: "transactions",
            fields: [
                { key: "customer", label: "Customer", type: "text" },
                { key: "transactionCount", label: "Transaction Count", type: "number" },
                { key: "totalSpent", label: "Total Spent", type: "currency" },
                { key: "averageTransactionValue", label: "Average Transaction", type: "currency" },
                { key: "firstTransaction", label: "First Transaction", type: "date" },
                { key: "lastTransaction", label: "Last Transaction", type: "date" }
            ],
            filters: {
                dateRange: true,
                customerType: true
            },
            groupBy: ["customer"],
            sortBy: { field: "totalSpent", direction: "desc" },
            chartConfig: {
                type: "bar",
                xAxis: "customer",
                yAxis: "totalSpent"
            },
            isSystem: true,
            createdBy: "system"
        },
        {
            name: "Financial Summary",
            description: "Financial overview including revenue, costs, and profit analysis",
            category: "Financial",
            dataSource: "transactions",
            fields: [
                { key: "date", label: "Date", type: "date", format: "YYYY-MM-DD" },
                { key: "revenue", label: "Revenue", type: "currency" },
                { key: "costOfGoods", label: "Cost of Goods", type: "currency" },
                { key: "grossProfit", label: "Gross Profit", type: "currency" },
                { key: "profitMargin", label: "Profit Margin", type: "percentage" },
                { key: "transactionCount", label: "Transaction Count", type: "number" }
            ],
            filters: {
                dateRange: true,
                store: true
            },
            groupBy: ["date"],
            sortBy: { field: "date", direction: "desc" },
            chartConfig: {
                type: "mixed",
                xAxis: "date",
                yAxis: ["revenue", "grossProfit"]
            },
            isSystem: true,
            createdBy: "system"
        },
        {
            name: "Product Performance",
            description: "Product sales performance and profitability analysis",
            category: "Products",
            dataSource: "transactions",
            fields: [
                { key: "productName", label: "Product Name", type: "text" },
                { key: "category", label: "Category", type: "text" },
                { key: "quantitySold", label: "Quantity Sold", type: "number" },
                { key: "revenue", label: "Revenue", type: "currency" },
                { key: "averagePrice", label: "Average Price", type: "currency" },
                { key: "transactionCount", label: "Transaction Count", type: "number" }
            ],
            filters: {
                dateRange: true,
                category: true,
                product: true
            },
            groupBy: ["productName"],
            sortBy: { field: "revenue", direction: "desc" },
            chartConfig: {
                type: "bar",
                xAxis: "productName",
                yAxis: "revenue"
            },
            isSystem: true,
            createdBy: "system"
        }
    ];

    let insertedCount = 0;
    let errors = [];

    systemTemplates.forEach(template => {
        reportTemplatesDB.findOne({ name: template.name }, function (err, existingTemplate) {
            if (err) {
                errors.push(`Error checking template ${template.name}: ${err.message}`);
                return;
            }

            if (!existingTemplate) {
                const fullTemplate = {
                    ...template,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    isActive: true
                };

                reportTemplatesDB.insert(fullTemplate, function (err, newTemplate) {
                    if (err) {
                        errors.push(`Error inserting template ${template.name}: ${err.message}`);
                    } else {
                        insertedCount++;
                    }

                    if (insertedCount + errors.length === systemTemplates.length) {
                        res.json({
                            message: "System templates initialization completed",
                            inserted: insertedCount,
                            errors: errors
                        });
                    }
                });
            } else {
                if (insertedCount + errors.length === systemTemplates.length) {
                    res.json({
                        message: "System templates initialization completed",
                        inserted: insertedCount,
                        errors: errors
                    });
                }
            }
        });
    });
});

/**
 * POST endpoint: Create report from template
 */
router.post("/templates/:id/create-report", function (req, res) {
    const { id } = req.params;
    const { reportName, createdBy } = req.body;

    if (!reportName || !createdBy) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Report name and created by are required.",
        });
    }

    reportTemplatesDB.findOne({ _id: id }, function (err, template) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!template) {
            return res.status(404).json({
                error: "Not Found",
                message: "Template not found.",
            });
        }

        // Import the custom-reports module to create the report
        const customReportsDB = require("@seald-io/nedb");
        const reportsDB = new customReportsDB({ filename: dbUtils.getDatabasePath("custom-reports.db"), autoload: true });

        const report = {
            name: reportName,
            description: `Created from template: ${template.name}`,
            dataSource: template.dataSource,
            fields: template.fields,
            filters: template.filters,
            groupBy: template.groupBy,
            sortBy: template.sortBy,
            chartConfig: template.chartConfig,
            createdBy: createdBy,
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: true
        };

        reportsDB.insert(report, function (err, newReport) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            res.status(201).json(newReport);
        });
    });
});