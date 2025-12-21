const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const path = require("path");
const validator = require("validator");
const appName = process.env.APPNAME || "PharmaSoft";
const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');

// Database paths
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

router.use(bodyParser.json());

module.exports = router;

// Initialize databases
let promotionSchemesDB = new Datastore({
    filename: promotionSchemesDbPath,
    autoload: true,
});

let promotionUsageDB = new Datastore({
    filename: promotionUsageDbPath,
    autoload: true,
});

// Create indexes for performance
promotionSchemesDB.ensureIndex({ fieldName: "is_active" });
promotionSchemesDB.ensureIndex({ fieldName: "promotion_type" });
promotionSchemesDB.ensureIndex({ fieldName: "start_date" });
promotionSchemesDB.ensureIndex({ fieldName: "end_date" });
promotionSchemesDB.ensureIndex({ fieldName: "priority" });

promotionUsageDB.ensureIndex({ fieldName: "promotion_scheme_id" });
promotionUsageDB.ensureIndex({ fieldName: "customer_id" });
promotionUsageDB.ensureIndex({ fieldName: "used_at" });

/**
 * GET endpoint: Get the welcome message for the Promotions API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Promotions API");
});

/**
 * POST endpoint: Create a new promotion scheme.
 *
 * @param {Object} req request object with promotion details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/create", function (req, res) {
    // Validate required fields
    const requiredFields = ['name', 'description', 'promotion_type', 'discount_value'];
    for (const field of requiredFields) {
        if (!req.body[field]) {
            return res.status(400).json({
                error: "Bad Request",
                message: `${field} is required.`,
            });
        }
    }

    // Validate promotion type
    const validTypes = ['PERCENTAGE_DISCOUNT', 'FIXED_AMOUNT_DISCOUNT', 'BUY_X_GET_Y', 'POINTS_MULTIPLIER'];
    if (!validTypes.includes(req.body.promotion_type)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid promotion type.",
        });
    }

    // Validate dates
    if (req.body.start_date && req.body.end_date) {
        const startDate = new Date(req.body.start_date);
        const endDate = new Date(req.body.end_date);
        
        if (startDate >= endDate) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Start date must be before end date.",
            });
        }
    }

    // Create new promotion scheme
    const newPromotion = {
        _id: Math.floor(Date.now() / 1000),
        name: req.body.name,
        description: req.body.description,
        promotion_type: req.body.promotion_type,
        discount_value: parseFloat(req.body.discount_value),
        minimum_purchase: parseFloat(req.body.minimum_purchase) || 0,
        maximum_discount: parseFloat(req.body.maximum_discount) || null,
        applicable_categories: req.body.applicable_categories || [],
        applicable_products: req.body.applicable_products || [],
        customer_tiers: req.body.customer_tiers || [],
        start_date: req.body.start_date || null,
        end_date: req.body.end_date || null,
        days_of_week: req.body.days_of_week || [],
        time_based: req.body.time_based || false,
        start_time: req.body.start_time || null,
        end_time: req.body.end_time || null,
        usage_limit: parseInt(req.body.usage_limit) || null,
        usage_limit_per_customer: parseInt(req.body.usage_limit_per_customer) || null,
        buy_quantity: req.body.buy_quantity || null,
        get_quantity: req.body.get_quantity || null,
        points_multiplier: parseFloat(req.body.points_multiplier) || null,
        is_active: req.body.is_active !== undefined ? req.body.is_active : true,
        priority: parseInt(req.body.priority) || 1,
        created_at: new Date(),
        updated_at: new Date()
    };

    promotionSchemesDB.insert(newPromotion, function (err, promotion) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        res.status(201).json(promotion);
    });
});

/**
 * GET endpoint: Get all promotion schemes.
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
    
    let query = {};
    if (isActive !== undefined) {
        query.is_active = isActive;
    }
    
    promotionSchemesDB.find(query)
        .sort({ priority: 1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, promotions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get total count for pagination
            promotionSchemesDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    promotions: promotions,
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
 * GET endpoint: Get a specific promotion scheme by ID.
 *
 * @param {Object} req request object with promotion ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:promotionId", function (req, res) {
    if (!req.params.promotionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Promotion ID is required.",
        });
    }

    promotionSchemesDB.findOne({ _id: parseInt(req.params.promotionId) }, function (err, promotion) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!promotion) {
            return res.status(404).json({
                error: "Not Found",
                message: "Promotion not found.",
            });
        }

        res.json(promotion);
    });
});

/**
 * PUT endpoint: Update an existing promotion scheme.
 *
 * @param {Object} req request object with updated promotion details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:promotionId", function (req, res) {
    if (!req.params.promotionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Promotion ID is required.",
        });
    }

    // Validate dates if provided
    if (req.body.start_date && req.body.end_date) {
        const startDate = new Date(req.body.start_date);
        const endDate = new Date(req.body.end_date);
        
        if (startDate >= endDate) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Start date must be before end date.",
            });
        }
    }

    // Build update object with only provided fields
    const updateFields = {};
    const allowedFields = [
        'name', 'description', 'promotion_type', 'discount_value', 'minimum_purchase',
        'maximum_discount', 'applicable_categories', 'applicable_products', 'customer_tiers',
        'start_date', 'end_date', 'days_of_week', 'time_based', 'start_time', 'end_time',
        'usage_limit', 'usage_limit_per_customer', 'buy_quantity', 'get_quantity',
        'points_multiplier', 'is_active', 'priority'
    ];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updateFields[field] = req.body[field];
        }
    }

    updateFields.updated_at = new Date();

    promotionSchemesDB.update(
        { _id: parseInt(req.params.promotionId) },
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
                    message: "Promotion not found.",
                });
            }

            res.json({
                _id: parseInt(req.params.promotionId),
                ...updateFields
            });
        }
    );
});

/**
 * DELETE endpoint: Delete a promotion scheme.
 *
 * @param {Object} req request object with promotion ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:promotionId", function (req, res) {
    if (!req.params.promotionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Promotion ID is required.",
        });
    }

    promotionSchemesDB.remove(
        { _id: parseInt(req.params.promotionId) },
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
                    message: "Promotion not found.",
                });
            }

            res.json({
                message: "Promotion deleted successfully.",
                _id: parseInt(req.params.promotionId)
            });
        }
    );
});

/**
 * POST endpoint: Validate and apply promotions for a transaction.
 *
 * @param {Object} req request object with transaction details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/validate", function (req, res) {
    if (!req.body.customerId || !req.body.items || !req.body.totalAmount) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID, items, and total amount are required.",
        });
    }

    const customerId = req.body.customerId;
    const items = req.body.items;
    const totalAmount = parseFloat(req.body.totalAmount);
    const transactionDate = req.body.transactionDate ? new Date(req.body.transactionDate) : new Date();

    // Get customer loyalty information
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

        const customerTier = loyaltyAccount ? loyaltyAccount.tier : null;

        // Get all active promotions
        promotionSchemesDB.find({ is_active: true }, function (err, allPromotions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Filter applicable promotions
            const applicablePromotions = allPromotions.filter(promotion => {
                return isPromotionApplicable(promotion, items, totalAmount, customerTier, transactionDate, customerId);
            });

            // Sort by priority (lower number = higher priority)
            applicablePromotions.sort((a, b) => a.priority - b.priority);

            // Calculate discount for each applicable promotion
            const promotionResults = applicablePromotions.map(promotion => {
                const discount = calculatePromotionDiscount(promotion, items, totalAmount);
                return {
                    promotion: promotion,
                    discount: discount,
                    finalAmount: totalAmount - discount
                };
            });

            // Find the best promotion (highest discount)
            let bestPromotion = null;
            let maxDiscount = 0;

            for (const result of promotionResults) {
                if (result.discount > maxDiscount) {
                    maxDiscount = result.discount;
                    bestPromotion = result;
                }
            }

            res.json({
                applicablePromotions: promotionResults,
                bestPromotion: bestPromotion,
                originalAmount: totalAmount,
                maxDiscount: maxDiscount,
                finalAmount: totalAmount - maxDiscount
            });
        });
    });
});

/**
 * POST endpoint: Record promotion usage for a transaction.
 *
 * @param {Object} req request object with promotion usage details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/record-usage", function (req, res) {
    if (!req.body.promotionId || !req.body.transactionId || !req.body.customerId || !req.body.discountAmount) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Promotion ID, transaction ID, customer ID, and discount amount are required.",
        });
    }

    // Check if promotion exists
    promotionSchemesDB.findOne({ _id: parseInt(req.body.promotionId) }, function (err, promotion) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!promotion) {
            return res.status(404).json({
                error: "Not Found",
                message: "Promotion not found.",
            });
        }

        // Create promotion usage record
        const promotionUsage = {
            _id: Math.floor(Date.now() / 1000) + Math.random(),
            promotion_scheme_id: parseInt(req.body.promotionId),
            transaction_id: req.body.transactionId,
            customer_id: req.body.customerId,
            discount_amount: parseFloat(req.body.discountAmount),
            original_amount: parseFloat(req.body.originalAmount) || 0,
            final_amount: parseFloat(req.body.finalAmount) || 0,
            used_at: new Date()
        };

        promotionUsageDB.insert(promotionUsage, function (err, usage) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            res.status(201).json(usage);
        });
    });
});

/**
 * GET endpoint: Get promotion usage history.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/usage", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const promotionId = req.query.promotionId ? parseInt(req.query.promotionId) : null;
    const customerId = req.query.customerId || null;
    
    let query = {};
    if (promotionId) {
        query.promotion_scheme_id = promotionId;
    }
    if (customerId) {
        query.customer_id = customerId;
    }
    
    promotionUsageDB.find(query)
        .sort({ used_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, usageRecords) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get total count for pagination
            promotionUsageDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    usageRecords: usageRecords,
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
 * GET endpoint: Get promotion usage statistics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/stats", function (req, res) {
    const promotionId = req.query.promotionId ? parseInt(req.query.promotionId) : null;
    
    let query = {};
    if (promotionId) {
        query.promotion_scheme_id = promotionId;
    }
    
    promotionUsageDB.find(query, function (err, usageRecords) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const totalUsage = usageRecords.length;
        const totalDiscount = usageRecords.reduce((sum, record) => sum + record.discount_amount, 0);
        const uniqueCustomers = new Set(usageRecords.map(record => record.customer_id)).size;
        
        // Group by promotion
        const promotionStats = {};
        usageRecords.forEach(record => {
            if (!promotionStats[record.promotion_scheme_id]) {
                promotionStats[record.promotion_scheme_id] = {
                    usageCount: 0,
                    totalDiscount: 0,
                    uniqueCustomers: new Set()
                };
            }
            promotionStats[record.promotion_scheme_id].usageCount++;
            promotionStats[record.promotion_scheme_id].totalDiscount += record.discount_amount;
            promotionStats[record.promotion_scheme_id].uniqueCustomers.add(record.customer_id);
        });
        
        // Convert Set objects to counts
        for (const promoId in promotionStats) {
            promotionStats[promoId].uniqueCustomers = promotionStats[promoId].uniqueCustomers.size;
        }
        
        res.json({
            totalUsage: totalUsage,
            totalDiscount: totalDiscount,
            uniqueCustomers: uniqueCustomers,
            promotionStats: promotionStats
        });
    });
});

/**
 * Helper function to check if a promotion is applicable.
 *
 * @param {Object} promotion Promotion object
 * @param {Array} items Transaction items
 * @param {number} totalAmount Total transaction amount
 * @param {string} customerTier Customer loyalty tier
 * @param {Date} transactionDate Transaction date
 * @param {string} customerId Customer ID
 * @returns {boolean} Whether the promotion is applicable
 */
function isPromotionApplicable(promotion, items, totalAmount, customerTier, transactionDate, customerId) {
    // Check minimum purchase
    if (promotion.minimum_purchase && totalAmount < promotion.minimum_purchase) {
        return false;
    }
    
    // Check customer tier eligibility
    if (promotion.customer_tiers && promotion.customer_tiers.length > 0 && customerTier) {
        if (!promotion.customer_tiers.includes(customerTier)) {
            return false;
        }
    }
    
    // Check date validity
    if (promotion.start_date && new Date(promotion.start_date) > transactionDate) {
        return false;
    }
    
    if (promotion.end_date && new Date(promotion.end_date) < transactionDate) {
        return false;
    }
    
    // Check days of week
    if (promotion.days_of_week && promotion.days_of_week.length > 0) {
        const dayOfWeek = transactionDate.getDay();
        if (!promotion.days_of_week.includes(dayOfWeek)) {
            return false;
        }
    }
    
    // Check time constraints
    if (promotion.time_based && promotion.start_time && promotion.end_time) {
        const transactionTime = transactionDate.getHours() * 60 + transactionDate.getMinutes();
        const [startHour, startMin] = promotion.start_time.split(':').map(Number);
        const [endHour, endMin] = promotion.end_time.split(':').map(Number);
        const startTime = startHour * 60 + startMin;
        const endTime = endHour * 60 + endMin;
        
        if (transactionTime < startTime || transactionTime > endTime) {
            return false;
        }
    }
    
    // Check usage limits
    if (promotion.usage_limit) {
        // This is a simplified check - in production, you'd want to count actual usage
        // For now, we'll assume this check is done at a higher level
    }
    
    // Check product/category applicability
    if (promotion.applicable_products && promotion.applicable_products.length > 0) {
        const hasApplicableProduct = items.some(item => 
            promotion.applicable_products.includes(item.id)
        );
        if (!hasApplicableProduct) {
            return false;
        }
    }
    
    if (promotion.applicable_categories && promotion.applicable_categories.length > 0) {
        const hasApplicableCategory = items.some(item => 
            promotion.applicable_categories.includes(item.category)
        );
        if (!hasApplicableCategory) {
            return false;
        }
    }
    
    return true;
}

/**
 * Helper function to calculate promotion discount.
 *
 * @param {Object} promotion Promotion object
 * @param {Array} items Transaction items
 * @param {number} totalAmount Total transaction amount
 * @returns {number} Discount amount
 */
function calculatePromotionDiscount(promotion, items, totalAmount) {
    let discount = 0;
    
    switch (promotion.promotion_type) {
        case 'PERCENTAGE_DISCOUNT':
            discount = totalAmount * (promotion.discount_value / 100);
            if (promotion.maximum_discount && discount > promotion.maximum_discount) {
                discount = promotion.maximum_discount;
            }
            break;
            
        case 'FIXED_AMOUNT_DISCOUNT':
            discount = Math.min(promotion.discount_value, totalAmount);
            break;
            
        case 'BUY_X_GET_Y':
            // Simplified logic - in production, this would be more complex
            const applicableItems = items.filter(item => 
                (!promotion.applicable_products.length || promotion.applicable_products.includes(item.id)) &&
                (!promotion.applicable_categories.length || promotion.applicable_categories.includes(item.category))
            );
            
            if (applicableItems.length > 0 && promotion.buy_quantity && promotion.get_quantity) {
                const totalQuantity = applicableItems.reduce((sum, item) => sum + parseInt(item.quantity), 0);
                const freeQuantity = Math.floor(totalQuantity / promotion.buy_quantity) * promotion.get_quantity;
                
                // Calculate value of free items (using cheapest applicable item)
                if (freeQuantity > 0) {
                    const cheapestItem = applicableItems.reduce((min, item) => 
                        parseFloat(item.price) < parseFloat(min.price) ? item : min
                    );
                    discount = parseFloat(cheapestItem.price) * freeQuantity;
                }
            }
            break;
            
        case 'POINTS_MULTIPLIER':
            // This doesn't affect the transaction amount directly
            // The actual points calculation would be handled in the loyalty system
            discount = 0;
            break;
    }
    
    return discount;
}