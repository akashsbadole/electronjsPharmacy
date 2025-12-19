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

const promotionSchemesDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "promotion-schemes.db",
);

const promotionUsageDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "promotion-usage.db",
);

const loyaltyRewardsDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "loyalty-rewards.db",
);

const loyaltyRewardRedemptionsDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "loyalty-reward-redemptions.db",
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

let promotionSchemesDB = new Datastore({
    filename: promotionSchemesDbPath,
    autoload: true,
});

let promotionUsageDB = new Datastore({
    filename: promotionUsageDbPath,
    autoload: true,
});

let loyaltyRewardsDB = new Datastore({
    filename: loyaltyRewardsDbPath,
    autoload: true,
});

let loyaltyRewardRedemptionsDB = new Datastore({
    filename: loyaltyRewardRedemptionsDbPath,
    autoload: true,
});

/**
 * GET endpoint: Get the welcome message for the Loyalty Analytics API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Loyalty Analytics API");
});

/**
 * GET endpoint: Get loyalty program overview statistics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/overview", function (req, res) {
    async.parallel({
        totalCustomers: function(callback) {
            customerLoyaltyDB.count({ is_active: true }, callback);
        },
        totalPointsIssued: function(callback) {
            loyaltyTransactionsDB.find({ transaction_type: "EARN" }, function(err, transactions) {
                if (err) return callback(err);
                const totalPoints = transactions.reduce((sum, transaction) => sum + transaction.points, 0);
                callback(null, totalPoints);
            });
        },
        totalPointsRedeemed: function(callback) {
            loyaltyTransactionsDB.find({ transaction_type: "REDEEM" }, function(err, transactions) {
                if (err) return callback(err);
                const totalPoints = transactions.reduce((sum, transaction) => sum + transaction.points, 0);
                callback(null, totalPoints);
            });
        },
        activePromotions: function(callback) {
            promotionSchemesDB.count({ is_active: true }, callback);
        },
        totalRedemptions: function(callback) {
            loyaltyRewardRedemptionsDB.count({ redemption_status: "USED" }, callback);
        },
        tierDistribution: function(callback) {
            customerLoyaltyDB.find({ is_active: true }, function(err, accounts) {
                if (err) return callback(err);
                const distribution = { Basic: 0, Silver: 0, Gold: 0, Platinum: 0 };
                accounts.forEach(account => {
                    if (distribution.hasOwnProperty(account.tier)) {
                        distribution[account.tier]++;
                    }
                });
                callback(null, distribution);
            });
        }
    }, function(err, results) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const currentPointsBalance = results.totalPointsIssued - results.totalPointsRedeemed;
        const redemptionRate = results.totalPointsIssued > 0 ? 
            (results.totalPointsRedeemed / results.totalPointsIssued * 100).toFixed(2) : 0;

        res.json({
            totalCustomers: results.totalCustomers,
            totalPointsIssued: results.totalPointsIssued,
            totalPointsRedeemed: results.totalPointsRedeemed,
            currentPointsBalance: currentPointsBalance,
            redemptionRate: parseFloat(redemptionRate),
            activePromotions: results.activePromotions,
            totalRedemptions: results.totalRedemptions,
            tierDistribution: results.tierDistribution
        });
    });
});

/**
 * GET endpoint: Get customer loyalty analytics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customers", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const tier = req.query.tier || null;
    const sortBy = req.query.sortBy || 'total_points_earned';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;

    let query = { is_active: true };
    if (tier) {
        query.tier = tier;
    }

    const sortObj = {};
    sortObj[sortBy] = sortOrder;

    customerLoyaltyDB.find(query)
        .sort(sortObj)
        .skip(skip)
        .limit(limit)
        .exec(function (err, customers) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Get total count for pagination
            customerLoyaltyDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Enrich with customer details
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

                const enrichedCustomers = [];
                let completedCount = 0;

                if (customers.length === 0) {
                    return res.json({
                        customers: [],
                        pagination: {
                            total: count,
                            page: page,
                            limit: limit,
                            pages: Math.ceil(count / limit)
                        }
                    });
                }

                customers.forEach(function (customer) {
                    customersDB.findOne({ _id: customer.customer_id }, function (err, customerDetails) {
                        if (!err && customerDetails) {
                            enrichedCustomers.push({
                                ...customer,
                                customer_name: customerDetails.name,
                                customer_phone: customerDetails.phone,
                                customer_email: customerDetails.email
                            });
                        } else {
                            enrichedCustomers.push(customer);
                        }

                        completedCount++;
                        if (completedCount === customers.length) {
                            res.json({
                                customers: enrichedCustomers,
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

/**
 * GET endpoint: Get points transaction analytics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/points", function (req, res) {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    const transactionType = req.query.transactionType || null;

    let query = {
        created_at: { $gte: startDate, $lte: endDate }
    };
    
    if (transactionType) {
        query.transaction_type = transactionType;
    }

    loyaltyTransactionsDB.find(query).sort({ created_at: -1 }).exec(function (err, transactions) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Group by date
        const dailyStats = {};
        transactions.forEach(transaction => {
            const date = transaction.created_at.toISOString().split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = {
                    date: date,
                    earnTransactions: 0,
                    redeemTransactions: 0,
                    totalPointsEarned: 0,
                    totalPointsRedeemed: 0
                };
            }

            if (transaction.transaction_type === "EARN") {
                dailyStats[date].earnTransactions++;
                dailyStats[date].totalPointsEarned += transaction.points;
            } else if (transaction.transaction_type === "REDEEM") {
                dailyStats[date].redeemTransactions++;
                dailyStats[date].totalPointsRedeemed += transaction.points;
            }
        });

        // Convert to array and sort by date
        const dailyStatsArray = Object.values(dailyStats).sort((a, b) => 
            new Date(a.date) - new Date(b.date)
        );

        // Calculate totals
        const totalStats = {
            totalTransactions: transactions.length,
            totalEarnTransactions: transactions.filter(t => t.transaction_type === "EARN").length,
            totalRedeemTransactions: transactions.filter(t => t.transaction_type === "REDEEM").length,
            totalPointsEarned: transactions.filter(t => t.transaction_type === "EARN").reduce((sum, t) => sum + t.points, 0),
            totalPointsRedeemed: transactions.filter(t => t.transaction_type === "REDEEM").reduce((sum, t) => sum + t.points, 0)
        };

        res.json({
            dailyStats: dailyStatsArray,
            totalStats: totalStats,
            dateRange: {
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            }
        });
    });
});

/**
 * GET endpoint: Get promotion performance analytics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/promotions", function (req, res) {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    let query = {
        used_at: { $gte: startDate, $lte: endDate }
    };

    promotionUsageDB.find(query, function (err, usageRecords) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Group by promotion
        const promotionStats = {};
        usageRecords.forEach(record => {
            if (!promotionStats[record.promotion_scheme_id]) {
                promotionStats[record.promotion_scheme_id] = {
                    promotionId: record.promotion_scheme_id,
                    usageCount: 0,
                    totalDiscount: 0,
                    uniqueCustomers: new Set(),
                    dailyUsage: {}
                };
            }

            const stats = promotionStats[record.promotion_scheme_id];
            stats.usageCount++;
            stats.totalDiscount += record.discount_amount;
            stats.uniqueCustomers.add(record.customer_id);

            // Group by date
            const date = record.used_at.toISOString().split('T')[0];
            if (!stats.dailyUsage[date]) {
                stats.dailyUsage[date] = {
                    date: date,
                    usageCount: 0,
                    totalDiscount: 0
                };
            }
            stats.dailyUsage[date].usageCount++;
            stats.dailyUsage[date].totalDiscount += record.discount_amount;
        });

        // Convert to array and enrich with promotion details
        const promotionStatsArray = Object.values(promotionStats);
        let completedCount = 0;

        if (promotionStatsArray.length === 0) {
            return res.json({
                promotionStats: [],
                dateRange: {
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0]
                }
            });
        }

        promotionStatsArray.forEach(function (stats) {
            // Convert Set to count
            stats.uniqueCustomers = stats.uniqueCustomers.size;
            
            // Convert dailyUsage to array and sort by date
            stats.dailyUsage = Object.values(stats.dailyUsage).sort((a, b) => 
                new Date(a.date) - new Date(b.date)
            );

            // Get promotion details
            promotionSchemesDB.findOne({ _id: stats.promotionId }, function (err, promotion) {
                if (!err && promotion) {
                    stats.promotionName = promotion.name;
                    stats.promotionType = promotion.promotion_type;
                    stats.promotionDescription = promotion.description;
                }

                completedCount++;
                if (completedCount === promotionStatsArray.length) {
                    // Sort by usage count
                    promotionStatsArray.sort((a, b) => b.usageCount - a.usageCount);

                    res.json({
                        promotionStats: promotionStatsArray,
                        dateRange: {
                            startDate: startDate.toISOString().split('T')[0],
                            endDate: endDate.toISOString().split('T')[0]
                        }
                    });
                }
            });
        });
    });
});

/**
 * GET endpoint: Get reward redemption analytics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/rewards", function (req, res) {
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

    let query = {
        redeemed_at: { $gte: startDate, $lte: endDate }
    };

    loyaltyRewardRedemptionsDB.find(query, function (err, redemptions) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Group by reward
        const rewardStats = {};
        redemptions.forEach(redemption => {
            if (!rewardStats[redemption.reward_id]) {
                rewardStats[redemption.reward_id] = {
                    rewardId: redemption.reward_id,
                    redemptionCount: 0,
                    totalPointsUsed: 0,
                    uniqueCustomers: new Set(),
                    dailyRedemptions: {}
                };
            }

            const stats = rewardStats[redemption.reward_id];
            stats.redemptionCount++;
            stats.totalPointsUsed += redemption.points_used;
            stats.uniqueCustomers.add(redemption.customer_loyalty_id);

            // Group by date
            const date = redemption.redeemed_at.toISOString().split('T')[0];
            if (!stats.dailyRedemptions[date]) {
                stats.dailyRedemptions[date] = {
                    date: date,
                    redemptionCount: 0,
                    totalPointsUsed: 0
                };
            }
            stats.dailyRedemptions[date].redemptionCount++;
            stats.dailyRedemptions[date].totalPointsUsed += redemption.points_used;
        });

        // Convert to array and enrich with reward details
        const rewardStatsArray = Object.values(rewardStats);
        let completedCount = 0;

        if (rewardStatsArray.length === 0) {
            return res.json({
                rewardStats: [],
                dateRange: {
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0]
                }
            });
        }

        rewardStatsArray.forEach(function (stats) {
            // Convert Set to count
            stats.uniqueCustomers = stats.uniqueCustomers.size;
            
            // Convert dailyRedemptions to array and sort by date
            stats.dailyRedemptions = Object.values(stats.dailyRedemptions).sort((a, b) => 
                new Date(a.date) - new Date(b.date)
            );

            // Get reward details
            loyaltyRewardsDB.findOne({ _id: stats.rewardId }, function (err, reward) {
                if (!err && reward) {
                    stats.rewardName = reward.name;
                    stats.rewardType = reward.reward_type;
                    stats.rewardDescription = reward.description;
                    stats.pointsRequired = reward.points_required;
                }

                completedCount++;
                if (completedCount === rewardStatsArray.length) {
                    // Sort by redemption count
                    rewardStatsArray.sort((a, b) => b.redemptionCount - a.redemptionCount);

                    res.json({
                        rewardStats: rewardStatsArray,
                        dateRange: {
                            startDate: startDate.toISOString().split('T')[0],
                            endDate: endDate.toISOString().split('T')[0]
                        }
                    });
                }
            });
        });
    });
});

/**
 * GET endpoint: Get customer segment analytics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/segments", function (req, res) {
    customerLoyaltyDB.find({ is_active: true }, function (err, accounts) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Define segments
        const segments = {
            new: { count: 0, customers: [] }, // Enrolled in last 30 days
            active: { count: 0, customers: [] }, // Last activity in last 30 days
            atRisk: { count: 0, customers: [] }, // No activity in 30-90 days
            inactive: { count: 0, customers: [] }, // No activity in 90+ days
            highValue: { count: 0, customers: [] }, // Gold or Platinum tier
            pointsRich: { count: 0, customers: [] } // More than 1000 points
        };

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const ninetyDaysAgo = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));

        accounts.forEach(account => {
            const lastActivity = new Date(account.last_activity_date);
            const enrollmentDate = new Date(account.enrollment_date);

            // New customers
            if (enrollmentDate >= thirtyDaysAgo) {
                segments.new.count++;
                segments.new.customers.push(account);
            }

            // Active customers
            if (lastActivity >= thirtyDaysAgo) {
                segments.active.count++;
                segments.active.customers.push(account);
            }

            // At-risk customers
            if (lastActivity < thirtyDaysAgo && lastActivity >= ninetyDaysAgo) {
                segments.atRisk.count++;
                segments.atRisk.customers.push(account);
            }

            // Inactive customers
            if (lastActivity < ninetyDaysAgo) {
                segments.inactive.count++;
                segments.inactive.customers.push(account);
            }

            // High-value customers
            if (account.tier === 'Gold' || account.tier === 'Platinum') {
                segments.highValue.count++;
                segments.highValue.customers.push(account);
            }

            // Points-rich customers
            if (account.current_points > 1000) {
                segments.pointsRich.count++;
                segments.pointsRich.customers.push(account);
            }
        });

        // Calculate percentages
        const totalCustomers = accounts.length;
        for (const segment in segments) {
            segments[segment].percentage = totalCustomers > 0 ? 
                (segments[segment].count / totalCustomers * 100).toFixed(2) : 0;
        }

        res.json({
            totalCustomers: totalCustomers,
            segments: segments
        });
    });
});

/**
 * GET endpoint: Get loyalty program trends over time.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/trends", function (req, res) {
    const months = parseInt(req.query.months) || 12;
    const endDate = new Date();
    const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - months + 1, 1);

    // Get monthly enrollment data
    customerLoyaltyDB.find({ 
        is_active: true,
        enrollment_date: { $gte: startDate, $lte: endDate }
    }, function (err, accounts) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Group enrollments by month
        const monthlyEnrollments = {};
        accounts.forEach(account => {
            const date = new Date(account.enrollment_date);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            
            if (!monthlyEnrollments[monthKey]) {
                monthlyEnrollments[monthKey] = {
                    month: monthKey,
                    enrollments: 0
                };
            }
            monthlyEnrollments[monthKey].enrollments++;
        });

        // Get monthly points data
        loyaltyTransactionsDB.find({
            created_at: { $gte: startDate, $lte: endDate }
        }, function (err, transactions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Group transactions by month
            const monthlyPoints = {};
            transactions.forEach(transaction => {
                const date = new Date(transaction.created_at);
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                
                if (!monthlyPoints[monthKey]) {
                    monthlyPoints[monthKey] = {
                        month: monthKey,
                        pointsEarned: 0,
                        pointsRedeemed: 0,
                        transactions: 0
                    };
                }

                if (transaction.transaction_type === "EARN") {
                    monthlyPoints[monthKey].pointsEarned += transaction.points;
                } else if (transaction.transaction_type === "REDEEM") {
                    monthlyPoints[monthKey].pointsRedeemed += transaction.points;
                }
                monthlyPoints[monthKey].transactions++;
            });

            // Combine data for all months in the range
            const trends = [];
            for (let d = new Date(startDate); d <= endDate; d.setMonth(d.getMonth() + 1)) {
                const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                
                trends.push({
                    month: monthKey,
                    enrollments: monthlyEnrollments[monthKey] ? monthlyEnrollments[monthKey].enrollments : 0,
                    pointsEarned: monthlyPoints[monthKey] ? monthlyPoints[monthKey].pointsEarned : 0,
                    pointsRedeemed: monthlyPoints[monthKey] ? monthlyPoints[monthKey].pointsRedeemed : 0,
                    transactions: monthlyPoints[monthKey] ? monthlyPoints[monthKey].transactions : 0
                });
            }

            res.json({
                trends: trends,
                dateRange: {
                    startDate: startDate.toISOString().split('T')[0],
                    endDate: endDate.toISOString().split('T')[0]
                }
            });
        });
    });
});