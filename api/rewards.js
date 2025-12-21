const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const validator = require("validator");
const dbUtils = require('./db-utils');

// Database paths
const loyaltyRewardsDbPath = dbUtils.getDatabasePath('loyalty-rewards.db');
const loyaltyRewardRedemptionsDbPath = dbUtils.getDatabasePath('loyalty-reward-redemptions.db');

router.use(bodyParser.json());

module.exports = router;

// Initialize databases
let loyaltyRewardsDB = new Datastore({
    filename: loyaltyRewardsDbPath,
    autoload: true,
});

let loyaltyRewardRedemptionsDB = new Datastore({
    filename: loyaltyRewardRedemptionsDbPath,
    autoload: true,
});

// Create indexes for performance
loyaltyRewardsDB.ensureIndex({ fieldName: "is_active" });
loyaltyRewardsDB.ensureIndex({ fieldName: "reward_type" });
loyaltyRewardsDB.ensureIndex({ fieldName: "points_required" });

loyaltyRewardRedemptionsDB.ensureIndex({ fieldName: "customer_loyalty_id" });
loyaltyRewardRedemptionsDB.ensureIndex({ fieldName: "reward_id" });
loyaltyRewardRedemptionsDB.ensureIndex({ fieldName: "redemption_status" });
loyaltyRewardRedemptionsDB.ensureIndex({ fieldName: "redeemed_at" });
loyaltyRewardRedemptionsDB.ensureIndex({ fieldName: "expires_at" });

/**
 * GET endpoint: Get the welcome message for the Rewards API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Rewards API");
});

/**
 * POST endpoint: Create a new reward.
 *
 * @param {Object} req request object with reward details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/create", function (req, res) {
    // Validate required fields
    const requiredFields = ['name', 'description', 'reward_type', 'points_required'];
    for (const field of requiredFields) {
        if (!req.body[field]) {
            return res.status(400).json({
                error: "Bad Request",
                message: `${field} is required.`,
            });
        }
    }

    // Validate reward type
    const validTypes = ['DISCOUNT', 'FREE_PRODUCT', 'SERVICE', 'VOUCHER', 'POINTS_BONUS'];
    if (!validTypes.includes(req.body.reward_type)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid reward type.",
        });
    }

    // Validate points required
    const pointsRequired = parseInt(req.body.points_required);
    if (isNaN(pointsRequired) || pointsRequired <= 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Points required must be a positive number.",
        });
    }

    // For DISCOUNT type, validate discount details
    if (req.body.reward_type === 'DISCOUNT') {
        if (!req.body.discount_value) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Discount value is required for DISCOUNT rewards.",
            });
        }

        const validDiscountTypes = ['FIXED_AMOUNT', 'PERCENTAGE'];
        if (!validDiscountTypes.includes(req.body.discount_type)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid discount type. Must be FIXED_AMOUNT or PERCENTAGE.",
            });
        }

        if (req.body.discount_type === 'PERCENTAGE') {
            const discountValue = parseFloat(req.body.discount_value);
            if (isNaN(discountValue) || discountValue <= 0 || discountValue > 100) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Percentage discount must be between 1 and 100.",
                });
            }
        }
    }

    // Create new reward
    const newReward = {
        _id: Math.floor(Date.now() / 1000),
        name: req.body.name,
        description: req.body.description,
        reward_type: req.body.reward_type,
        points_required: pointsRequired,
        discount_value: req.body.reward_type === 'DISCOUNT' ? parseFloat(req.body.discount_value) : null,
        discount_type: req.body.reward_type === 'DISCOUNT' ? req.body.discount_type : null,
        applicable_categories: req.body.applicable_categories || [],
        applicable_products: req.body.applicable_products || [],
        product_id: req.body.reward_type === 'FREE_PRODUCT' ? req.body.product_id : null,
        voucher_code: req.body.reward_type === 'VOUCHER' ? req.body.voucher_code : null,
        voucher_value: req.body.reward_type === 'VOUCHER' ? parseFloat(req.body.voucher_value) : null,
        bonus_points: req.body.reward_type === 'POINTS_BONUS' ? parseInt(req.body.bonus_points) : null,
        expiry_days: parseInt(req.body.expiry_days) || 365, // Default 1 year
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
        created_at: new Date(),
        updated_at: new Date()
    };

    loyaltyRewardsDB.insert(newReward, function (err, reward) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        res.status(201).json(reward);
    });
});

/**
 * GET endpoint: Get all rewards.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const isActive = req.query.active !== undefined ? req.query.active === 'true' : undefined;
    const customerId = req.query.customerId || null;

    let query = {};
    if (isActive !== undefined) {
        query.is_active = isActive;
    }

    loyaltyRewardsDB.find(query)
        .sort({ points_required: 1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, rewards) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // If customer ID is provided, check which rewards the customer can afford
            if (customerId) {
                const customerLoyaltyDbPath = path.join(
                    appData,
                    appName,
                    "server",
                    "databases",
                    "customer-loyalty-accounts.db",
                );

                const customerLoyaltyDB = new Datastore({
                    filename: customerLoyaltyDbPath,
                    autoload: true,
                });

                customerLoyaltyDB.findOne({ customer_id: customerId }, function (err, loyaltyAccount) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    const customerPoints = loyaltyAccount ? loyaltyAccount.current_points : 0;

                    // Add affordability information to each reward
                    const rewardsWithAffordability = rewards.map(reward => ({
                        ...reward,
                        can_afford: customerPoints >= reward.points_required,
                        points_short: reward.points_required > customerPoints ? reward.points_required - customerPoints : 0
                    }));

                    // Get total count for pagination
                    loyaltyRewardsDB.count(query, function (err, count) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }

                        res.json({
                            rewards: rewardsWithAffordability,
                            customer_points: customerPoints,
                            pagination: {
                                total: count,
                                page: page,
                                limit: limit,
                                pages: Math.ceil(count / limit)
                            }
                        });
                    });
                });
            } else {
                // Get total count for pagination
                loyaltyRewardsDB.count(query, function (err, count) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    res.json({
                        rewards: rewards,
                        pagination: {
                            total: count,
                            page: page,
                            limit: limit,
                            pages: Math.ceil(count / limit)
                        }
                    });
                });
            }
        });
});

/**
 * GET endpoint: Get a specific reward by ID.
 *
 * @param {Object} req request object with reward ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:rewardId", function (req, res) {
    if (!req.params.rewardId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Reward ID is required.",
        });
    }

    loyaltyRewardsDB.findOne({ _id: parseInt(req.params.rewardId) }, function (err, reward) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!reward) {
            return res.status(404).json({
                error: "Not Found",
                message: "Reward not found.",
            });
        }

        res.json(reward);
    });
});

/**
 * PUT endpoint: Update an existing reward.
 *
 * @param {Object} req request object with updated reward details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:rewardId", function (req, res) {
    if (!req.params.rewardId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Reward ID is required.",
        });
    }

    // Validate points required if provided
    if (req.body.points_required !== undefined) {
        const pointsRequired = parseInt(req.body.points_required);
        if (isNaN(pointsRequired) || pointsRequired <= 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Points required must be a positive number.",
            });
        }
    }

    // Build update object with only provided fields
    const updateFields = {};
    const allowedFields = [
        'name', 'description', 'reward_type', 'points_required', 'discount_value',
        'discount_type', 'applicable_categories', 'applicable_products', 'product_id',
        'voucher_code', 'voucher_value', 'bonus_points', 'expiry_days', 'is_active'
    ];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updateFields[field] = req.body[field];
        }
    }

    updateFields.updated_at = new Date();

    loyaltyRewardsDB.update(
        { _id: parseInt(req.params.rewardId) },
        { $set: updateFields },
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
                    message: "Reward not found.",
                });
            }

            res.json({
                _id: parseInt(req.params.rewardId),
                ...updateFields
            });
        }
    );
});

/**
 * DELETE endpoint: Delete a reward.
 *
 * @param {Object} req request object with reward ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:rewardId", function (req, res) {
    if (!req.params.rewardId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Reward ID is required.",
        });
    }

    loyaltyRewardsDB.remove(
        { _id: parseInt(req.params.rewardId) },
        {},
        function (err, numRemoved) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (numRemoved === 0) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Reward not found.",
                });
            }

            res.json({
                message: "Reward deleted successfully.",
                _id: parseInt(req.params.rewardId)
            });
        }
    );
});

/**
 * POST endpoint: Redeem a reward.
 *
 * @param {Object} req request object with redemption details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/redeem", function (req, res) {
    if (!req.body.customerId || !req.body.rewardId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID and reward ID are required.",
        });
    }

    // Get customer loyalty account
    const customerLoyaltyDbPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "customer-loyalty-accounts.db",
    );

    const customerLoyaltyDB = new Datastore({
        filename: customerLoyaltyDbPath,
        autoload: true,
    });

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

        // Get reward details
        loyaltyRewardsDB.findOne({ _id: parseInt(req.body.rewardId) }, function (err, reward) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (!reward) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Reward not found.",
                });
            }

            if (!reward.is_active) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Reward is not active.",
                });
            }

            // Check if customer has enough points
            if (loyaltyAccount.current_points < reward.points_required) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Insufficient points balance.",
                });
            }

            // Calculate expiry date
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + reward.expiry_days);

            // Create reward redemption record
            const redemption = {
                _id: Math.floor(Date.now() / 1000) + Math.random(),
                customer_loyalty_id: loyaltyAccount._id,
                reward_id: parseInt(req.body.rewardId),
                transaction_id: req.body.transactionId || null,
                points_used: reward.points_required,
                redemption_status: "USED",
                redeemed_at: new Date(),
                expires_at: expiresAt
            };

            loyaltyRewardRedemptionsDB.insert(redemption, function (err, redemptionRecord) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Update customer loyalty account
                const updatedAccount = {
                    current_points: loyaltyAccount.current_points - reward.points_required,
                    total_points_redeemed: loyaltyAccount.total_points_redeemed + reward.points_required,
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

                        // Create loyalty transaction record
                        const loyaltyTransactionsDbPath = path.join(
                            appData,
                            appName,
                            "server",
                            "databases",
                            "loyalty-transactions.db",
                        );

                        const loyaltyTransactionsDB = new Datastore({
                            filename: loyaltyTransactionsDbPath,
                            autoload: true,
                        });

                        const loyaltyTransaction = {
                            _id: Math.floor(Date.now() / 1000) + Math.random(),
                            customer_loyalty_id: loyaltyAccount._id,
                            transaction_id: req.body.transactionId || null,
                            transaction_type: "REDEEM",
                            points: reward.points_required,
                            description: `Reward redeemed: ${reward.name}`,
                            reference_id: redemptionRecord._id.toString(),
                            created_at: new Date()
                        };

                        loyaltyTransactionsDB.insert(loyaltyTransaction, function (err) {
                            if (err) {
                                console.error("Failed to create loyalty transaction:", err);
                            }
                        });

                        // Prepare reward details for response
                        let rewardDetails = {
                            reward_id: reward._id,
                            reward_name: reward.name,
                            reward_type: reward.reward_type
                        };

                        switch (reward.reward_type) {
                            case 'DISCOUNT':
                                rewardDetails.discount_value = reward.discount_value;
                                rewardDetails.discount_type = reward.discount_type;
                                rewardDetails.applicable_categories = reward.applicable_categories;
                                rewardDetails.applicable_products = reward.applicable_products;
                                break;
                            case 'FREE_PRODUCT':
                                rewardDetails.product_id = reward.product_id;
                                break;
                            case 'VOUCHER':
                                rewardDetails.voucher_code = reward.voucher_code;
                                rewardDetails.voucher_value = reward.voucher_value;
                                break;
                            case 'POINTS_BONUS':
                                rewardDetails.bonus_points = reward.bonus_points;
                                break;
                        }

                        res.status(201).json({
                            redemption: redemptionRecord,
                            reward: rewardDetails,
                            updated_account: {
                                ...updatedAccount,
                                _id: loyaltyAccount._id,
                                customer_id: loyaltyAccount.customer_id,
                                loyalty_account_number: loyaltyAccount.loyalty_account_number
                            }
                        });
                    }
                );
            });
        });
    });
});

/**
 * GET endpoint: Get redemption history for a customer.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/redemptions/:customerId", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }

    // First get the loyalty account
    const customerLoyaltyDbPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "customer-loyalty-accounts.db",
    );

    const customerLoyaltyDB = new Datastore({
        filename: customerLoyaltyDbPath,
        autoload: true,
    });

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

        // Get redemption history
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        loyaltyRewardRedemptionsDB.find({ customer_loyalty_id: loyaltyAccount._id })
            .sort({ redeemed_at: -1 })
            .skip(skip)
            .limit(limit)
            .exec(function (err, redemptions) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Get total count for pagination
                loyaltyRewardRedemptionsDB.count({ customer_loyalty_id: loyaltyAccount._id }, function (err, count) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    // Enrich redemptions with reward details
                    const enrichedRedemptions = [];
                    let completedCount = 0;

                    if (redemptions.length === 0) {
                        return res.json({
                            redemptions: [],
                            pagination: {
                                total: count,
                                page: page,
                                limit: limit,
                                pages: Math.ceil(count / limit)
                            }
                        });
                    }

                    redemptions.forEach(function (redemption) {
                        loyaltyRewardsDB.findOne({ _id: redemption.reward_id }, function (err, reward) {
                            if (!err && reward) {
                                enrichedRedemptions.push({
                                    ...redemption,
                                    reward: reward
                                });
                            } else {
                                enrichedRedemptions.push(redemption);
                            }

                            completedCount++;
                            if (completedCount === redemptions.length) {
                                res.json({
                                    redemptions: enrichedRedemptions,
                                    pagination: {
                                        total: count,
                                        page: page,
                                        limit: limit,
                                        pages: Math.ceil(count / limit)
                                    }
                                });
                            }
                        });
                    });
                });
            });
    });
});

/**
 * GET endpoint: Get redemption statistics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/stats", function (req, res) {
    const rewardId = req.query.rewardId ? parseInt(req.query.rewardId) : null;

    let query = {};
    if (rewardId) {
        query.reward_id = rewardId;
    }

    loyaltyRewardRedemptionsDB.find(query, function (err, redemptions) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const totalRedemptions = redemptions.length;
        const totalPointsUsed = redemptions.reduce((sum, redemption) => sum + redemption.points_used, 0);
        const uniqueCustomers = new Set(redemptions.map(redemption => redemption.customer_loyalty_id)).size;

        // Group by reward type
        const rewardTypeStats = {};
        redemptions.forEach(redemption => {
            // This is a simplified approach - in production, you'd join with rewards table
            const rewardType = 'UNKNOWN'; // Default value
            if (!rewardTypeStats[rewardType]) {
                rewardTypeStats[rewardType] = {
                    redemptionCount: 0,
                    totalPointsUsed: 0,
                    uniqueCustomers: new Set()
                };
            }
            rewardTypeStats[rewardType].redemptionCount++;
            rewardTypeStats[rewardType].totalPointsUsed += redemption.points_used;
            rewardTypeStats[rewardType].uniqueCustomers.add(redemption.customer_loyalty_id);
        });

        // Convert Set objects to counts
        for (const rewardType in rewardTypeStats) {
            rewardTypeStats[rewardType].uniqueCustomers = rewardTypeStats[rewardType].uniqueCustomers.size;
        }

        // Group by reward
        const rewardStats = {};
        redemptions.forEach(redemption => {
            if (!rewardStats[redemption.reward_id]) {
                rewardStats[redemption.reward_id] = {
                    redemptionCount: 0,
                    totalPointsUsed: 0,
                    uniqueCustomers: new Set()
                };
            }
            rewardStats[redemption.reward_id].redemptionCount++;
            rewardStats[redemption.reward_id].totalPointsUsed += redemption.points_used;
            rewardStats[redemption.reward_id].uniqueCustomers.add(redemption.customer_loyalty_id);
        });

        // Convert Set objects to counts
        for (const rewardId in rewardStats) {
            rewardStats[rewardId].uniqueCustomers = rewardStats[rewardId].uniqueCustomers.size;
        }

        res.json({
            totalRedemptions: totalRedemptions,
            totalPointsUsed: totalPointsUsed,
            uniqueCustomers: uniqueCustomers,
            rewardTypeStats: rewardTypeStats,
            rewardStats: rewardStats
        });
    });
});