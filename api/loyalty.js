const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const path = require("path");
const validator = require("validator");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;

// Database paths
const customerLoyaltyDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "customer-loyalty-accounts.db",
);

const loyaltyTransactionsDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "loyalty-transactions.db",
);

router.use(bodyParser.json());

module.exports = router;

// Initialize databases
let customerLoyaltyDB = new Datastore({
    filename: customerLoyaltyDbPath,
    autoload: true,
});

let loyaltyTransactionsDB = new Datastore({
    filename: loyaltyTransactionsDbPath,
    autoload: true,
});

// Create indexes for performance
customerLoyaltyDB.ensureIndex({ fieldName: "customer_id", unique: true });
customerLoyaltyDB.ensureIndex({ fieldName: "loyalty_account_number", unique: true });
customerLoyaltyDB.ensureIndex({ fieldName: "tier" });
customerLoyaltyDB.ensureIndex({ fieldName: "is_active" });

loyaltyTransactionsDB.ensureIndex({ fieldName: "customer_loyalty_id" });
loyaltyTransactionsDB.ensureIndex({ fieldName: "transaction_id" });
loyaltyTransactionsDB.ensureIndex({ fieldName: "transaction_type" });
loyaltyTransactionsDB.ensureIndex({ fieldName: "created_at" });

/**
 * GET endpoint: Get the welcome message for the Loyalty API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Loyalty API");
});

/**
 * POST endpoint: Enroll a customer in the loyalty program.
 *
 * @param {Object} req request object with customer ID in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/enroll", function (req, res) {
    if (!req.body.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }

    // Check if customer exists
    const customersDB = new Datastore({
        filename: path.join(
            appData,
            appName,
            "server",
            "databases",
            "customers.db",
        ),
        autoload: true,
    });

    customersDB.findOne({ _id: req.body.customerId }, function (err, customer) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }

        // Check if customer already has a loyalty account
        customerLoyaltyDB.findOne({ customer_id: req.body.customerId }, function (err, existingAccount) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (existingAccount) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Customer already has a loyalty account.",
                });
            }

            // Generate unique loyalty account number
            const loyaltyAccountNumber = generateLoyaltyAccountNumber();

            // Create new loyalty account
            const newLoyaltyAccount = {
                _id: Math.floor(Date.now() / 1000),
                customer_id: req.body.customerId,
                loyalty_account_number: loyaltyAccountNumber,
                current_points: 0,
                tier: "Basic",
                tier_expiry_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
                total_points_earned: 0,
                total_points_redeemed: 0,
                enrollment_date: new Date().toISOString().split('T')[0],
                last_activity_date: new Date().toISOString().split('T')[0],
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            };

            customerLoyaltyDB.insert(newLoyaltyAccount, function (err, loyaltyAccount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Create enrollment transaction record
                const enrollmentTransaction = {
                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                    customer_loyalty_id: loyaltyAccount._id,
                    transaction_id: null,
                    transaction_type: "ENROLL",
                    points: 0,
                    description: "Loyalty program enrollment",
                    reference_id: req.body.customerId,
                    created_at: new Date()
                };

                loyaltyTransactionsDB.insert(enrollmentTransaction, function (err) {
                    if (err) {
                        console.error("Failed to create enrollment transaction:", err);
                    }
                });

                res.status(201).json(loyaltyAccount);
            });
        });
    });
});

/**
 * GET endpoint: Get loyalty account by customer ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }

    customerLoyaltyDB.findOne({ customer_id: req.params.customerId }, function (err, loyaltyAccount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!loyaltyAccount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Loyalty account not found.",
            });
        }

        res.json(loyaltyAccount);
    });
});

/**
 * GET endpoint: Get loyalty account by loyalty account number.
 *
 * @param {Object} req request object with loyalty account number as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/account/:accountNumber", function (req, res) {
    if (!req.params.accountNumber) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Loyalty account number is required.",
        });
    }

    customerLoyaltyDB.findOne({ loyalty_account_number: req.params.accountNumber }, function (err, loyaltyAccount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!loyaltyAccount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Loyalty account not found.",
            });
        }

        res.json(loyaltyAccount);
    });
});

/**
 * GET endpoint: Get all loyalty accounts.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    customerLoyaltyDB.find({})
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, accounts) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get total count for pagination
            customerLoyaltyDB.count({}, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    accounts: accounts,
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
 * POST endpoint: Add points to a customer's loyalty account.
 *
 * @param {Object} req request object with customer ID, points, and transaction details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/earn-points", function (req, res) {
    if (!req.body.customerId || !req.body.points || !req.body.transactionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID, points, and transaction ID are required.",
        });
    }

    const points = parseInt(req.body.points);
    if (isNaN(points) || points <= 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Points must be a positive number.",
        });
    }

    customerLoyaltyDB.findOne({ customer_id: req.body.customerId }, function (err, loyaltyAccount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!loyaltyAccount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Loyalty account not found.",
            });
        }

        if (!loyaltyAccount.is_active) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Loyalty account is not active.",
            });
        }

        // Apply tier bonus if applicable
        const tierBonus = getTierBonus(loyaltyAccount.tier);
        const pointsWithBonus = Math.floor(points * (1 + tierBonus));

        // Update loyalty account
        const updatedAccount = {
            current_points: loyaltyAccount.current_points + pointsWithBonus,
            total_points_earned: loyaltyAccount.total_points_earned + pointsWithBonus,
            last_activity_date: new Date().toISOString().split('T')[0],
            updated_at: new Date()
        };

        // Check for tier progression
        const newTier = checkTierProgression(updatedAccount.total_points_earned);
        if (newTier !== loyaltyAccount.tier) {
            updatedAccount.tier = newTier;
            updatedAccount.tier_expiry_date = new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];
        }

        customerLoyaltyDB.update(
            { _id: loyaltyAccount._id },
            { $set: updatedAccount },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Create points transaction record
                const pointsTransaction = {
                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                    customer_loyalty_id: loyaltyAccount._id,
                    transaction_id: req.body.transactionId,
                    transaction_type: "EARN",
                    points: pointsWithBonus,
                    description: req.body.description || "Purchase points earned",
                    reference_id: req.body.transactionId,
                    created_at: new Date()
                };

                loyaltyTransactionsDB.insert(pointsTransaction, function (err) {
                    if (err) {
                        console.error("Failed to create points transaction:", err);
                    }
                });

                res.json({
                    ...updatedAccount,
                    _id: loyaltyAccount._id,
                    customer_id: loyaltyAccount.customer_id,
                    loyalty_account_number: loyaltyAccount.loyalty_account_number,
                    points_earned: pointsWithBonus,
                    tier_progressed: newTier !== loyaltyAccount.tier
                });
            }
        );
    });
});

/**
 * POST endpoint: Redeem points from a customer's loyalty account.
 *
 * @param {Object} req request object with customer ID, points to redeem, and redemption details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/redeem-points", function (req, res) {
    if (!req.body.customerId || !req.body.points || !req.body.transactionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID, points, and transaction ID are required.",
        });
    }

    const points = parseInt(req.body.points);
    if (isNaN(points) || points <= 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Points must be a positive number.",
        });
    }

    customerLoyaltyDB.findOne({ customer_id: req.body.customerId }, function (err, loyaltyAccount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!loyaltyAccount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Loyalty account not found.",
            });
        }

        if (!loyaltyAccount.is_active) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Loyalty account is not active.",
            });
        }

        if (loyaltyAccount.current_points < points) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Insufficient points balance.",
            });
        }

        // Update loyalty account
        const updatedAccount = {
            current_points: loyaltyAccount.current_points - points,
            total_points_redeemed: loyaltyAccount.total_points_redeemed + points,
            last_activity_date: new Date().toISOString().split('T')[0],
            updated_at: new Date()
        };

        customerLoyaltyDB.update(
            { _id: loyaltyAccount._id },
            { $set: updatedAccount },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Create redemption transaction record
                const redemptionTransaction = {
                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                    customer_loyalty_id: loyaltyAccount._id,
                    transaction_id: req.body.transactionId,
                    transaction_type: "REDEEM",
                    points: points,
                    description: req.body.description || "Points redeemed",
                    reference_id: req.body.transactionId,
                    created_at: new Date()
                };

                loyaltyTransactionsDB.insert(redemptionTransaction, function (err) {
                    if (err) {
                        console.error("Failed to create redemption transaction:", err);
                    }
                });

                res.json({
                    ...updatedAccount,
                    _id: loyaltyAccount._id,
                    customer_id: loyaltyAccount.customer_id,
                    loyalty_account_number: loyaltyAccount.loyalty_account_number,
                    points_redeemed: points
                });
            }
        );
    });
});

/**
 * GET endpoint: Get loyalty transaction history for a customer.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/transactions/:customerId", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }

    // First get the loyalty account
    customerLoyaltyDB.findOne({ customer_id: req.params.customerId }, function (err, loyaltyAccount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!loyaltyAccount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Loyalty account not found.",
            });
        }

        // Get transaction history
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        loyaltyTransactionsDB.find({ customer_loyalty_id: loyaltyAccount._id })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .exec(function (err, transactions) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Get total count for pagination
                loyaltyTransactionsDB.count({ customer_loyalty_id: loyaltyAccount._id }, function (err, count) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    res.json({
                        transactions: transactions,
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
 * PUT endpoint: Update loyalty account status.
 *
 * @param {Object} req request object with loyalty account ID and status in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/account/:accountId/status", function (req, res) {
    if (!req.params.accountId || req.body.is_active === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Account ID and status are required.",
        });
    }

    customerLoyaltyDB.update(
        { _id: req.params.accountId },
        { 
            $set: { 
                is_active: req.body.is_active,
                updated_at: new Date()
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

            if (numReplaced === 0) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Loyalty account not found.",
                });
            }

            res.json({
                _id: req.params.accountId,
                is_active: req.body.is_active,
                updated_at: new Date()
            });
        }
    );
});

/**
 * Helper function to generate a unique loyalty account number.
 *
 * @returns {string} Unique loyalty account number
 */
function generateLoyaltyAccountNumber() {
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `LOY-${timestamp}${random}`;
}

/**
 * Helper function to get tier bonus multiplier.
 *
 * @param {string} tier Customer tier
 * @returns {number} Bonus multiplier
 */
function getTierBonus(tier) {
    const tierBonuses = {
        'Basic': 0,
        'Silver': 0.1, // 10% bonus
        'Gold': 0.25, // 25% bonus
        'Platinum': 0.5 // 50% bonus
    };
    return tierBonuses[tier] || 0;
}

/**
 * Helper function to check tier progression based on total points earned.
 *
 * @param {number} totalPoints Total points earned
 * @returns {string} New tier
 */
function checkTierProgression(totalPoints) {
    if (totalPoints >= 10000) {
        return 'Platinum';
    } else if (totalPoints >= 5000) {
        return 'Gold';
    } else if (totalPoints >= 2000) {
        return 'Silver';
    } else {
        return 'Basic';
    }
}