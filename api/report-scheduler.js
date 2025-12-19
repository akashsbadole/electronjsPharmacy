const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const moment = require("moment");
const cron = require("node-cron");
const dbUtils = require("./db-utils");

// Initialize databases
const reportSchedulerDB = new Datastore({ filename: dbUtils.getDatabasePath("report-scheduler.db"), autoload: true });
const reportExecutionsDB = new Datastore({ filename: dbUtils.getDatabasePath("report-executions.db"), autoload: true });

// Create indexes for better performance
reportSchedulerDB.ensureIndex({ fieldName: "reportId" });
reportSchedulerDB.ensureIndex({ fieldName: "isActive" });
reportSchedulerDB.ensureIndex({ fieldName: "nextRun" });

router.use(bodyParser.json());

// Store active scheduled tasks
const scheduledTasks = {};

module.exports = router;

/**
 * GET endpoint: Get welcome message for Report Scheduler API.
 */
router.get("/", function (req, res) {
    res.send("Report Scheduler API");
});

/**
 * GET endpoint: Get all scheduled reports
 */
router.get("/schedules", function (req, res) {
    const { reportId, isActive, page = 1, limit = 10 } = req.query;
    
    let query = {};
    if (reportId) {
        query.reportId = reportId;
    }
    if (isActive !== undefined) {
        query.isActive = isActive === 'true';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    reportSchedulerDB.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .exec(function (err, schedules) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            reportSchedulerDB.count(query, function (err, totalCount) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.json({
                    schedules: schedules,
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
 * GET endpoint: Get a specific scheduled report by ID
 */
router.get("/schedules/:id", function (req, res) {
    const { id } = req.params;

    reportSchedulerDB.findOne({ _id: id }, function (err, schedule) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!schedule) {
            return res.status(404).json({
                error: "Not Found",
                message: "Schedule not found.",
            });
        }

        res.json(schedule);
    });
});

/**
 * POST endpoint: Create a new scheduled report
 */
router.post("/schedules", function (req, res) {
    const { 
        reportId, 
        reportName, 
        scheduleType, 
        cronExpression, 
        recipients, 
        exportFormat, 
        filters, 
        createdBy 
    } = req.body;

    if (!reportId || !reportName || !scheduleType || !createdBy) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Report ID, report name, schedule type, and created by are required.",
        });
    }

    // Validate cron expression if provided
    let validatedCronExpression = cronExpression;
    if (scheduleType === 'custom' && cronExpression) {
        if (!cron.validate(cronExpression)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid cron expression.",
            });
        }
    } else {
        // Generate cron expression based on schedule type
        validatedCronExpression = generateCronExpression(scheduleType);
    }

    const nextRun = getNextRunTime(validatedCronExpression);

    const schedule = {
        reportId: reportId,
        reportName: reportName,
        scheduleType: scheduleType,
        cronExpression: validatedCronExpression,
        recipients: recipients || [],
        exportFormat: exportFormat || 'json',
        filters: filters || {},
        isActive: true,
        lastRun: null,
        nextRun: nextRun,
        runCount: 0,
        createdBy: createdBy,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    reportSchedulerDB.insert(schedule, function (err, newSchedule) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Start the scheduled task
        if (newSchedule.isActive) {
            startScheduledTask(newSchedule);
        }

        res.status(201).json(newSchedule);
    });
});

/**
 * PUT endpoint: Update an existing scheduled report
 */
router.put("/schedules/:id", function (req, res) {
    const { id } = req.params;
    const { 
        reportName, 
        scheduleType, 
        cronExpression, 
        recipients, 
        exportFormat, 
        filters, 
        updatedBy 
    } = req.body;

    if (!reportName || !scheduleType || !updatedBy) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Report name, schedule type, and updated by are required.",
        });
    }

    // Validate cron expression if provided
    let validatedCronExpression = cronExpression;
    if (scheduleType === 'custom' && cronExpression) {
        if (!cron.validate(cronExpression)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid cron expression.",
            });
        }
    } else {
        // Generate cron expression based on schedule type
        validatedCronExpression = generateCronExpression(scheduleType);
    }

    const nextRun = getNextRunTime(validatedCronExpression);

    const updateData = {
        reportName: reportName,
        scheduleType: scheduleType,
        cronExpression: validatedCronExpression,
        recipients: recipients || [],
        exportFormat: exportFormat || 'json',
        filters: filters || {},
        nextRun: nextRun,
        updatedBy: updatedBy,
        updatedAt: new Date()
    };

    reportSchedulerDB.update({ _id: id }, { $set: updateData }, {}, function (err, numUpdated) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (numUpdated === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: "Schedule not found.",
            });
        }

        reportSchedulerDB.findOne({ _id: id }, function (err, updatedSchedule) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Restart the scheduled task if it was active
            if (updatedSchedule.isActive) {
                stopScheduledTask(id);
                startScheduledTask(updatedSchedule);
            }

            res.json(updatedSchedule);
        });
    });
});

/**
 * DELETE endpoint: Delete a scheduled report
 */
router.delete("/schedules/:id", function (req, res) {
    const { id } = req.params;

    // Stop the scheduled task if it's running
    stopScheduledTask(id);

    reportSchedulerDB.remove({ _id: id }, {}, function (err, numRemoved) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (numRemoved === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: "Schedule not found.",
            });
        }

        res.json({ message: "Schedule deleted successfully" });
    });
});

/**
 * POST endpoint: Toggle scheduled report active status
 */
router.post("/schedules/:id/toggle", function (req, res) {
    const { id } = req.params;

    reportSchedulerDB.findOne({ _id: id }, function (err, schedule) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!schedule) {
            return res.status(404).json({
                error: "Not Found",
                message: "Schedule not found.",
            });
        }

        const updatedStatus = !schedule.isActive;

        reportSchedulerDB.update(
            { _id: id }, 
            { $set: { isActive: updatedStatus, updatedAt: new Date() } }, 
            {}, 
            function (err, numUpdated) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                if (updatedStatus) {
                    startScheduledTask(schedule);
                } else {
                    stopScheduledTask(id);
                }

                res.json({
                    message: `Schedule ${updatedStatus ? 'activated' : 'deactivated'} successfully`,
                    isActive: updatedStatus
                });
            }
        );
    });
});

/**
 * POST endpoint: Run scheduled report manually
 */
router.post("/schedules/:id/run", function (req, res) {
    const { id } = req.params;

    reportSchedulerDB.findOne({ _id: id }, function (err, schedule) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!schedule) {
            return res.status(404).json({
                error: "Not Found",
                message: "Schedule not found.",
            });
        }

        executeScheduledReport(schedule, function (err, result) {
            if (err) {
                return res.status(500).json({
                    error: "Report Execution Failed",
                    message: err.message
                });
            }

            res.json({
                message: "Report executed successfully",
                executionId: result.executionId,
                executedAt: result.executedAt
            });
        });
    });
});

/**
 * GET endpoint: Get schedule types
 */
router.get("/schedule-types", function (req, res) {
    const scheduleTypes = [
        {
            id: "daily",
            name: "Daily",
            description: "Run once every day at midnight",
            cronExpression: "0 0 * * *"
        },
        {
            id: "weekly",
            name: "Weekly",
            description: "Run once every week on Sunday at midnight",
            cronExpression: "0 0 * * 0"
        },
        {
            id: "monthly",
            name: "Monthly",
            description: "Run once every month on the 1st at midnight",
            cronExpression: "0 0 1 * *"
        },
        {
            id: "hourly",
            name: "Hourly",
            description: "Run once every hour at the beginning of the hour",
            cronExpression: "0 * * * *"
        },
        {
            id: "custom",
            name: "Custom",
            description: "Custom cron expression",
            cronExpression: null
        }
    ];

    res.json({ scheduleTypes: scheduleTypes });
});

/**
 * GET endpoint: Get scheduled report execution history
 */
router.get("/schedules/:id/history", function (req, res) {
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
 * Helper function to generate cron expression based on schedule type
 */
function generateCronExpression(scheduleType) {
    switch (scheduleType) {
        case "daily":
            return "0 0 * * *";
        case "weekly":
            return "0 0 * * 0";
        case "monthly":
            return "0 0 1 * *";
        case "hourly":
            return "0 * * * *";
        default:
            return "0 0 * * *";
    }
}

/**
 * Helper function to get next run time based on cron expression
 */
function getNextRunTime(cronExpression) {
    try {
        // This is a simplified calculation - in production, you'd use a proper cron parser
        const now = moment();
        let nextRun;

        switch (cronExpression) {
            case "0 0 * * *": // Daily
                nextRun = now.clone().add(1, 'day').startOf('day');
                break;
            case "0 0 * * 0": // Weekly
                nextRun = now.clone().day(0).add(1, 'week').startOf('day');
                break;
            case "0 0 1 * *": // Monthly
                nextRun = now.clone().add(1, 'month').startOf('month');
                break;
            case "0 * * * *": // Hourly
                nextRun = now.clone().add(1, 'hour').startOf('hour');
                break;
            default:
                nextRun = now.clone().add(1, 'day').startOf('day');
        }

        return nextRun.toDate();
    } catch (error) {
        return moment().add(1, 'day').startOf('day').toDate();
    }
}

/**
 * Helper function to start a scheduled task
 */
function startScheduledTask(schedule) {
    if (scheduledTasks[schedule._id]) {
        stopScheduledTask(schedule._id);
    }

    const task = cron.schedule(schedule.cronExpression, function() {
        executeScheduledReport(schedule, function (err, result) {
            if (err) {
                console.error(`Scheduled report execution failed for ${schedule._id}:`, err);
            } else {
                console.log(`Scheduled report executed successfully for ${schedule._id}`);
                
                // Update next run time
                const nextRun = getNextRunTime(schedule.cronExpression);
                reportSchedulerDB.update(
                    { _id: schedule._id },
                    { 
                        $set: { 
                            nextRun: nextRun,
                            lastRun: new Date(),
                            runCount: schedule.runCount + 1
                        } 
                    },
                    {}
                );
            }
        });
    }, {
        scheduled: false
    });

    task.start();
    scheduledTasks[schedule._id] = task;
}

/**
 * Helper function to stop a scheduled task
 */
function stopScheduledTask(scheduleId) {
    if (scheduledTasks[scheduleId]) {
        scheduledTasks[scheduleId].stop();
        delete scheduledTasks[scheduleId];
    }
}

/**
 * Helper function to execute a scheduled report
 */
function executeScheduledReport(schedule, callback) {
    // Import the report execution module
    const reportExecution = require('./report-execution');

    // Create execution record
    const execution = {
        reportId: schedule.reportId,
        reportConfig: { name: schedule.reportName }, // Simplified for scheduled execution
        filters: schedule.filters,
        executedAt: new Date(),
        status: "running",
        scheduledExecution: true,
        scheduleId: schedule._id
    };

    reportExecutionsDB.insert(execution, function (err, executionRecord) {
        if (err) {
            return callback(err);
        }

        // Here you would implement the actual report execution
        // For now, we'll simulate a successful execution
        const result = {
            data: [],
            summary: { totalRecords: 0 },
            executedAt: new Date()
        };

        const statusUpdate = "completed";
        const completedAt = new Date();

        reportExecutionsDB.update(
            { _id: executionRecord._id },
            { $set: { status: statusUpdate, completedAt: completedAt, result: result } },
            {},
            function (updateErr) {
                if (updateErr) {
                    return callback(updateErr);
                }

                callback(null, {
                    executionId: executionRecord._id,
                    executedAt: executionRecord.executedAt,
                    completedAt: completedAt
                });
            }
        );
    });
}

// Initialize active schedules on server start
reportSchedulerDB.find({ isActive: true }, function (err, activeSchedules) {
    if (err) {
        console.error("Error loading active schedules:", err);
        return;
    }

    activeSchedules.forEach(schedule => {
        startScheduledTask(schedule);
    });

    console.log(`Started ${activeSchedules.length} active scheduled reports`);
});