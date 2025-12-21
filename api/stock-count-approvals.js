const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const validator = require("validator");
const dbUtils = require('./db-utils');
const dbPath = dbUtils.getDatabasePath('stock-count-approvals.db');

router.use(bodyParser.json());

module.exports = router;

let stockCountApprovalsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

stockCountApprovalsDB.ensureIndex({ fieldName: "_id", unique: true });
stockCountApprovalsDB.ensureIndex({ fieldName: "countSessionId" });
stockCountApprovalsDB.ensureIndex({ fieldName: "approvalLevel" });
stockCountApprovalsDB.ensureIndex({ fieldName: "approvalStatus" });
stockCountApprovalsDB.ensureIndex({ fieldName: "approverId" });

// Initialize related databases
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

const stockVariancesDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "stock-variances.db",
);

const stockVariancesDB = new Datastore({
    filename: stockVariancesDBPath,
    autoload: true,
});

const usersDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "users.db",
);

const usersDB = new Datastore({
    filename: usersDBPath,
    autoload: true,
});

/**
 * GET endpoint: Get welcome message for the Stock Count Approvals API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Stock Count Approvals API");
});

/**
 * GET endpoint: Retrieve approval records for a specific session with pagination and filtering.
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
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query based on filters
    let query = { countSessionId: sessionId };

    if (req.query.status) {
        query.approvalStatus = validator.escape(req.query.status);
    }
    if (req.query.level) {
        query.approvalLevel = parseInt(req.query.level);
    }
    if (req.query.approver) {
        query.approverId = parseInt(req.query.approver);
    }

    stockCountApprovalsDB.find(query)
        .sort({ approvalLevel: 1, createdAt: 1 })
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

            // Get user details for approvers
            const approverIds = docs.filter(approval => approval.approverId).map(approval => approval.approverId);

            if (approverIds.length === 0) {
                return res.json({
                    approvals: docs,
                    pagination: {
                        total: docs.length,
                        page: page,
                        limit: limit,
                        pages: Math.ceil(docs.length / limit)
                    }
                });
            }

            usersDB.find({ _id: { $in: approverIds } }, function (err, users) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to load user details.",
                    });
                }

                // Enrich approvals with user details
                const enrichedApprovals = docs.map(approval => {
                    const approver = users.find(u => u._id === approval.approverId);

                    return {
                        ...approval,
                        approverName: approver ? approver.name : 'Unknown User',
                        approverRole: approver ? approver.role : null
                    };
                });

                // Get total count for pagination
                stockCountApprovalsDB.count(query, function (err, count) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    res.json({
                        approvals: enrichedApprovals,
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
 * POST endpoint: Initialize approval workflow for a stock count session.
 *
 * @param {Object} req request object with session ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/session/:sessionId/initialize", function (req, res) {
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

        if (stockCount.countStatus !== 'COMPLETED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Approval workflow can only be initialized for completed stock count sessions.",
            });
        }

        // Check if approval workflow already exists
        stockCountApprovalsDB.findOne({ countSessionId: sessionId }, function (err, existingApproval) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (existingApproval) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Approval workflow already initialized for this session.",
                });
            }

            // Get variances for the session to determine required approval levels
            stockVariancesDB.find({ countSessionId: sessionId }, function (err, variances) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to load variances.",
                    });
                }

                // Determine maximum approval level required
                let maxApprovalLevel = 1; // Default to supervisor level

                variances.forEach(variance => {
                    if (variance.thresholdExceeded) {
                        const variancePercentage = parseFloat(variance.variancePercentage) || 0;
                        const varianceValue = Math.abs(variance.varianceValue) || 0;

                        if (variancePercentage > 50 || varianceValue > 5000) {
                            maxApprovalLevel = 3; // Owner level
                        } else if (variancePercentage > 25 || varianceValue > 1000) {
                            maxApprovalLevel = 2; // Manager level
                        } else if (variancePercentage > 15 || varianceValue > 500) {
                            maxApprovalLevel = 1; // Supervisor level
                        }
                    }
                });

                // Create approval workflow records
                const approvalLevels = [
                    { level: 1, role: 'SUPERVISOR' },
                    { level: 2, role: 'MANAGER' },
                    { level: 3, role: 'OWNER' }
                ];

                const requiredApprovals = approvalLevels.filter(level => level.level <= maxApprovalLevel);

                const approvalRecords = requiredApprovals.map(level => ({
                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                    countSessionId: sessionId,
                    approvalLevel: level.level,
                    requiredApproverRole: level.role,
                    approverId: null,
                    approvalStatus: level.level === 1 ? 'PENDING' : 'SKIPPED',
                    approvedAt: null,
                    rejectionReason: null,
                    comments: null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                }));

                // Insert approval records
                if (approvalRecords.length > 0) {
                    stockCountApprovalsDB.insert(approvalRecords, function (err, approvals) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "Failed to create approval workflow.",
                            });
                        }

                        res.json({
                            message: "Approval workflow initialized successfully.",
                            approvalWorkflow: approvals,
                            maxApprovalLevel: maxApprovalLevel
                        });
                    });
                } else {
                    res.json({
                        message: "No approval workflow required (all variances within auto-approval thresholds).",
                        approvalWorkflow: [],
                        maxApprovalLevel: 0
                    });
                }
            });
        });
    });
});

/**
 * GET endpoint: Get specific approval record by ID.
 *
 * @param {Object} req request object with approval ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Approval ID is required.",
        });
    }

    stockCountApprovalsDB.findOne({ _id: parseInt(req.params.id) }, function (err, approval) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!approval) {
            return res.status(404).json({
                error: "Not Found",
                message: "Approval record not found.",
            });
        }

        // Get approver details
        if (approval.approverId) {
            usersDB.findOne({ _id: approval.approverId }, function (err, user) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to load approver details.",
                    });
                }

                const enrichedApproval = {
                    ...approval,
                    approverName: user ? user.name : 'Unknown User',
                    approverRole: user ? user.role : null
                };

                res.json(enrichedApproval);
            });
        } else {
            res.json(approval);
        }
    });
});

/**
 * PUT endpoint: Approve an approval record.
 *
 * @param {Object} req request object with approval data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id/approve", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Approval ID is required.",
        });
    }

    const approvalId = parseInt(req.params.id);
    const approverId = req.body.approverId ? parseInt(req.body.approverId) : null;
    const comments = req.body.comments ? validator.escape(req.body.comments) : null;

    if (!approverId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Approver ID is required.",
        });
    }

    stockCountApprovalsDB.findOne({ _id: approvalId }, function (err, approval) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!approval) {
            return res.status(404).json({
                error: "Not Found",
                message: "Approval record not found.",
            });
        }

        if (approval.approvalStatus !== 'PENDING') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Only pending approvals can be approved.",
            });
        }

        // Verify approver role
        usersDB.findOne({ _id: approverId }, function (err, user) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to verify approver role.",
                });
            }

            if (!user || user.role !== approval.requiredApproverRole) {
                return res.status(403).json({
                    error: "Forbidden",
                    message: `User does not have required role: ${approval.requiredApproverRole}`,
                });
            }

            const updatedApproval = {
                approverId: approverId,
                approvalStatus: 'APPROVED',
                approvedAt: new Date(),
                comments: comments,
                updatedAt: new Date()
            };

            stockCountApprovalsDB.update({ _id: approvalId }, { $set: updatedApproval }, {}, function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to update approval record.",
                    });
                }

                // Check if this approval unlocks the next level
                checkAndUnlockNextApproval(approval.countSessionId, approval.approvalLevel, function (err, nextApprovalUnlocked) {
                    if (err) {
                        console.error("Error checking next approval:", err);
                    }

                    res.json({
                        message: "Approval recorded successfully.",
                        approval: { ...approval, ...updatedApproval },
                        nextApprovalUnlocked: nextApprovalUnlocked
                    });
                });
            });
        });
    });
});

/**
 * PUT endpoint: Reject an approval record.
 *
 * @param {Object} req request object with rejection data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id/reject", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Approval ID is required.",
        });
    }

    const approvalId = parseInt(req.params.id);
    const approverId = req.body.approverId ? parseInt(req.body.approverId) : null;
    const rejectionReason = req.body.rejectionReason ? validator.escape(req.body.rejectionReason) : null;
    const comments = req.body.comments ? validator.escape(req.body.comments) : null;

    if (!approverId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Approver ID is required.",
        });
    }

    if (!rejectionReason) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Rejection reason is required.",
        });
    }

    stockCountApprovalsDB.findOne({ _id: approvalId }, function (err, approval) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!approval) {
            return res.status(404).json({
                error: "Not Found",
                message: "Approval record not found.",
            });
        }

        if (approval.approvalStatus !== 'PENDING') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Only pending approvals can be rejected.",
            });
        }

        // Verify approver role
        usersDB.findOne({ _id: approverId }, function (err, user) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to verify approver role.",
                });
            }

            if (!user || user.role !== approval.requiredApproverRole) {
                return res.status(403).json({
                    error: "Forbidden",
                    message: `User does not have required role: ${approval.requiredApproverRole}`,
                });
            }

            const updatedApproval = {
                approverId: approverId,
                approvalStatus: 'REJECTED',
                rejectionReason: rejectionReason,
                comments: comments,
                updatedAt: new Date()
            };

            stockCountApprovalsDB.update({ _id: approvalId }, { $set: updatedApproval }, {}, function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to update approval record.",
                    });
                }

                // Cancel all subsequent approvals in the workflow
                cancelSubsequentApprovals(approval.countSessionId, approval.approvalLevel, function (err, cancelledApprovals) {
                    if (err) {
                        console.error("Error cancelling subsequent approvals:", err);
                    }

                    res.json({
                        message: "Approval rejected and workflow cancelled.",
                        approval: { ...approval, ...updatedApproval },
                        cancelledApprovals: cancelledApprovals
                    });
                });
            });
        });
    });
});

/**
 * GET endpoint: Get approval status summary for a session.
 *
 * @param {Object} req request object with session ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/session/:sessionId/status", function (req, res) {
    if (!req.params.sessionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID is required.",
        });
    }

    const sessionId = parseInt(req.params.sessionId);

    stockCountApprovalsDB.find({ countSessionId: sessionId }, function (err, approvals) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const status = {
            totalApprovals: approvals.length,
            pending: approvals.filter(a => a.approvalStatus === 'PENDING').length,
            approved: approvals.filter(a => a.approvalStatus === 'APPROVED').length,
            rejected: approvals.filter(a => a.approvalStatus === 'REJECTED').length,
            skipped: approvals.filter(a => a.approvalStatus === 'SKIPPED').length,
            workflowComplete: false,
            currentLevel: null
        };

        // Determine if workflow is complete and current level
        if (approvals.length > 0) {
            const sortedApprovals = approvals.sort((a, b) => a.approvalLevel - b.approvalLevel);
            const lastApproval = sortedApprovals[sortedApprovals.length - 1];

            status.workflowComplete = lastApproval.approvalStatus === 'APPROVED' ||
                lastApproval.approvalStatus === 'REJECTED';

            // Find current pending level
            const currentPending = sortedApprovals.find(a => a.approvalStatus === 'PENDING');
            status.currentLevel = currentPending ? currentPending.approvalLevel : null;
        }

        res.json(status);
    });
});

/**
 * Helper function to check and unlock the next approval level
 *
 * @param {number} sessionId stock count session ID
 * @param {number} currentLevel current approval level that was just approved
 * @param {function} callback callback function
 * @returns {void}
 */
function checkAndUnlockNextApproval(sessionId, currentLevel, callback) {
    stockCountApprovalsDB.find({
        countSessionId: sessionId,
        approvalLevel: currentLevel + 1,
        approvalStatus: 'SKIPPED'
    }, function (err, nextApproval) {
        if (err) {
            return callback(err);
        }

        if (nextApproval.length > 0) {
            // Unlock the next approval
            stockCountApprovalsDB.update(
                { _id: nextApproval[0]._id },
                { $set: { approvalStatus: 'PENDING', updatedAt: new Date() } },
                {},
                function (err, numReplaced) {
                    if (err) {
                        return callback(err);
                    }
                    callback(null, true);
                }
            );
        } else {
            // No next approval to unlock
            callback(null, false);
        }
    });
}

/**
 * Helper function to cancel subsequent approvals in the workflow
 *
 * @param {number} sessionId stock count session ID
 * @param {number} rejectedLevel approval level that was rejected
 * @param {function} callback callback function
 * @returns {void}
 */
function cancelSubsequentApprovals(sessionId, rejectedLevel, callback) {
    stockCountApprovalsDB.find({
        countSessionId: sessionId,
        approvalLevel: { $gt: rejectedLevel },
        approvalStatus: 'PENDING'
    }, function (err, subsequentApprovals) {
        if (err) {
            return callback(err);
        }

        if (subsequentApprovals.length === 0) {
            return callback(null, []);
        }

        const approvalIds = subsequentApprovals.map(a => a._id);

        stockCountApprovalsDB.update(
            { _id: { $in: approvalIds } },
            { $set: { approvalStatus: 'CANCELLED', updatedAt: new Date() } },
            { multi: true },
            function (err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                callback(null, subsequentApprovals);
            }
        );
    });
}
