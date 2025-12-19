const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const moment = require("moment");
const dbUtils = require("./db-utils");

// Initialize databases
const customReportsDB = new Datastore({ filename: dbUtils.getDatabasePath("custom-reports.db"), autoload: true });
const reportExecutionsDB = new Datastore({ filename: dbUtils.getDatabasePath("report-executions.db"), autoload: true });

// Create indexes for better performance
customReportsDB.ensureIndex({ fieldName: "name", unique: true });
customReportsDB.ensureIndex({ fieldName: "createdBy" });
customReportsDB.ensureIndex({ fieldName: "createdAt" });
reportExecutionsDB.ensureIndex({ fieldName: "reportId" });
reportExecutionsDB.ensureIndex({ fieldName: "executedAt" });

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get welcome message for Custom Reports API.
 */
router.get("/", function (req, res) {
    res.send("Custom Reports API");
});

/**
 * GET endpoint: Get all custom reports
 */
router.get("/reports", function (req, res) {
    const { createdBy, page = 1, limit = 10 } = req.query;
    
    let query = {};
    if (createdBy) {
        query.createdBy = createdBy;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    customReportsDB.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .exec(function (err, reports) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            customReportsDB.count(query, function (err, totalCount) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.json({
                    reports: reports,
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
 * GET endpoint: Get a specific custom report by ID
 */
router.get("/reports/:id", function (req, res) {
    const { id } = req.params;

    customReportsDB.findOne({ _id: id }, function (err, report) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!report) {
            return res.status(404).json({
                error: "Not Found",
                message: "Report not found.",
            });
        }

        res.json(report);
    });
});

/**
 * POST endpoint: Create a new custom report
 */
router.post("/reports", function (req, res) {
    const { name, description, dataSource, fields, filters, groupBy, sortBy, chartConfig, createdBy } = req.body;

    if (!name || !dataSource || !fields || !createdBy) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name, data source, fields, and created by are required.",
        });
    }

    const report = {
        name: name,
        description: description || "",
        dataSource: dataSource,
        fields: fields,
        filters: filters || {},
        groupBy: groupBy || [],
        sortBy: sortBy || { field: "createdAt", direction: "desc" },
        chartConfig: chartConfig || null,
        createdBy: createdBy,
        createdAt: new Date(),
        updatedAt: new Date(),
        isActive: true
    };

    customReportsDB.insert(report, function (err, newReport) {
        if (err) {
            if (err.errorType === "uniqueViolated") {
                return res.status(409).json({
                    error: "Conflict",
                    message: "A report with this name already exists.",
                });
            }
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        res.status(201).json(newReport);
    });
});

/**
 * PUT endpoint: Update an existing custom report
 */
router.put("/reports/:id", function (req, res) {
    const { id } = req.params;
    const { name, description, dataSource, fields, filters, groupBy, sortBy, chartConfig, updatedBy } = req.body;

    if (!name || !dataSource || !fields || !updatedBy) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name, data source, fields, and updated by are required.",
        });
    }

    const updateData = {
        name: name,
        description: description || "",
        dataSource: dataSource,
        fields: fields,
        filters: filters || {},
        groupBy: groupBy || [],
        sortBy: sortBy || { field: "createdAt", direction: "desc" },
        chartConfig: chartConfig || null,
        updatedBy: updatedBy,
        updatedAt: new Date()
    };

    customReportsDB.update({ _id: id }, { $set: updateData }, {}, function (err, numUpdated) {
        if (err) {
            if (err.errorType === "uniqueViolated") {
                return res.status(409).json({
                    error: "Conflict",
                    message: "A report with this name already exists.",
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
                message: "Report not found.",
            });
        }

        customReportsDB.findOne({ _id: id }, function (err, updatedReport) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            res.json(updatedReport);
        });
    });
});

/**
 * DELETE endpoint: Delete a custom report
 */
router.delete("/reports/:id", function (req, res) {
    const { id } = req.params;

    customReportsDB.remove({ _id: id }, {}, function (err, numRemoved) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (numRemoved === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: "Report not found.",
            });
        }

        res.json({ message: "Report deleted successfully" });
    });
});

/**
 * POST endpoint: Duplicate a custom report
 */
router.post("/reports/:id/duplicate", function (req, res) {
    const { id } = req.params;
    const { name, createdBy } = req.body;

    if (!name || !createdBy) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name and created by are required.",
        });
    }

    customReportsDB.findOne({ _id: id }, function (err, originalReport) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!originalReport) {
            return res.status(404).json({
                error: "Not Found",
                message: "Report not found.",
            });
        }

        const duplicatedReport = {
            name: name,
            description: originalReport.description + " (Copy)",
            dataSource: originalReport.dataSource,
            fields: originalReport.fields,
            filters: originalReport.filters,
            groupBy: originalReport.groupBy,
            sortBy: originalReport.sortBy,
            chartConfig: originalReport.chartConfig,
            createdBy: createdBy,
            createdAt: new Date(),
            updatedAt: new Date(),
            isActive: true
        };

        customReportsDB.insert(duplicatedReport, function (err, newReport) {
            if (err) {
                if (err.errorType === "uniqueViolated") {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "A report with this name already exists.",
                    });
                }
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            res.status(201).json(newReport);
        });
    });
});

/**
 * GET endpoint: Get report execution history
 */
router.get("/reports/:id/executions", function (req, res) {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    reportExecutionsDB.find({ reportId: id })
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

            reportExecutionsDB.count({ reportId: id }, function (err, totalCount) {
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
 * POST endpoint: Toggle report active status
 */
router.post("/reports/:id/toggle", function (req, res) {
    const { id } = req.params;

    customReportsDB.findOne({ _id: id }, function (err, report) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!report) {
            return res.status(404).json({
                error: "Not Found",
                message: "Report not found.",
            });
        }

        const updatedStatus = !report.isActive;

        customReportsDB.update({ _id: id }, { $set: { isActive: updatedStatus, updatedAt: new Date() } }, {}, function (err, numUpdated) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            res.json({
                message: `Report ${updatedStatus ? 'activated' : 'deactivated'} successfully`,
                isActive: updatedStatus
            });
        });
    });
});