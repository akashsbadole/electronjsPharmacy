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
    "reorder-suggestions.db",
);

router.use(bodyParser.json());

module.exports = router;

let reorderSuggestionsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

reorderSuggestionsDB.ensureIndex({ fieldName: "_id", unique: true });
reorderSuggestionsDB.ensureIndex({ fieldName: "productId" });
reorderSuggestionsDB.ensureIndex({ fieldName: "priority" });
reorderSuggestionsDB.ensureIndex({ fieldName: "isDismissed" });
reorderSuggestionsDB.ensureIndex({ fieldName: "suggestionType" });
reorderSuggestionsDB.ensureIndex({ fieldName: "storeId" });

// Advanced suggestion algorithms
const SUGGESTION_TYPES = {
    STOCK_LEVEL: 'STOCK_LEVEL',
    EXPIRY: 'EXPIRY',
    DEMAND_FORECAST: 'DEMAND_FORECAST',
    SEASONAL: 'SEASONAL',
    EOQ_OPTIMIZED: 'EOQ_OPTIMIZED'
};

const PRIORITY_LEVELS = {
    CRITICAL: 1,
    HIGH: 2,
    MEDIUM: 3,
    LOW: 4
};

/**
 * GET endpoint: Get welcome message for Reorder Suggestions API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Reorder Suggestions API");
});

/**
 * GET endpoint: Get reorder suggestions.
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
    let query = { isDismissed: false };
    if (req.query.priority) {
        query.priority = validator.escape(req.query.priority);
    }
    if (req.query.supplierId) {
        query.supplierId = parseInt(req.query.supplierId);
    }
    if (req.query.suggestionType) {
        query.suggestionType = validator.escape(req.query.suggestionType);
    }
    if (req.query.storeId) {
        query.storeId = parseInt(req.query.storeId);
    }
    
    reorderSuggestionsDB.find(query)
        .sort({ priority: -1, createdAt: -1 })
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
            reorderSuggestionsDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    suggestions: docs,
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
 * POST endpoint: Dismiss a reorder suggestion.
 *
 * @param {Object} req request object with suggestion ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/:id/dismiss", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Reorder suggestion ID is required.",
        });
    }
    
    const suggestionId = parseInt(req.params.id);
    
    // Check if suggestion exists
    reorderSuggestionsDB.findOne({ _id: suggestionId }, function (err, suggestion) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!suggestion) {
            return res.status(404).json({
                error: "Not Found",
                message: "Reorder suggestion not found.",
            });
        }
        
        if (suggestion.isDismissed) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Reorder suggestion has already been dismissed.",
            });
        }
        
        // Dismiss the suggestion
        reorderSuggestionsDB.update(
            { _id: suggestionId },
            { 
                $set: {
                    isDismissed: true,
                    dismissedAt: new Date(),
                    dismissalReason: req.body.reason ? validator.escape(req.body.reason) : null,
                    updatedAt: new Date()
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
                
                res.json({ message: "Reorder suggestion dismissed successfully." });
            }
        );
    });
});

/**
 * GET endpoint: Get critical reorder items.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/critical", function (req, res) {
    reorderSuggestionsDB.find({ 
        isDismissed: false,
        priority: 'CRITICAL'
    })
        .sort({ createdAt: -1 })
        .exec(function (err, suggestions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(suggestions);
        });
});

/**
 * POST endpoint: Generate reorder suggestions based on current inventory levels.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/generate", function (req, res) {
    const storeId = req.body.storeId ? parseInt(req.body.storeId) : null;
    const suggestionTypes = req.body.types || [SUGGESTION_TYPES.STOCK_LEVEL, SUGGESTION_TYPES.EXPIRY];
    
    // Get all products with their current quantities and min stock levels
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const inventoryDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "inventory.db",
    );
    
    const inventoryDB = new Datastore({
        filename: inventoryDbPath,
        autoload: true,
    });
    
    // Get store inventory if storeId is provided
    const storeInventoryDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "store-inventory.db",
    );
    
    const storeInventoryDB = new Datastore({
        filename: storeInventoryDbPath,
        autoload: true,
    });
    
    inventoryDB.find({}, function (err, products) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const suggestions = [];
        
        // Process each product to determine if reorder is needed
        async.eachSeries(products, function (product, callback) {
            // Get store-specific quantity if storeId is provided
            if (storeId) {
                storeInventoryDB.findOne({
                    productId: product._id,
                    storeId: storeId
                }, function(err, storeInventory) {
                    if (err) {
                        return callback(err);
                    }
                    
                    const currentQuantity = storeInventory ? parseInt(storeInventory.quantity) || 0 : parseInt(product.quantity) || 0;
                    const minStock = storeInventory ? parseInt(storeInventory.minStock) || 0 : parseInt(product.minStock) || 0;
                    
                    processProductForReorder(product, currentQuantity, minStock, storeId, suggestionTypes, suggestions, callback);
                });
            } else {
                const currentQuantity = parseInt(product.quantity) || 0;
                const minStock = parseInt(product.minStock) || 0;
                
                processProductForReorder(product, currentQuantity, minStock, storeId, suggestionTypes, suggestions, callback);
            }
        }, function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred while generating reorder suggestions.",
                });
            }
            
            res.json({
                message: "Reorder suggestions generated successfully.",
                suggestions: suggestions,
                totalSuggestions: suggestions.length
            });
        });
    });
});

/**
 * POST endpoint: Generate advanced reorder suggestions with AI/ML algorithms.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/generate-advanced", function (req, res) {
    const storeId = req.body.storeId ? parseInt(req.body.storeId) : null;
    const includeForecasting = req.body.includeForecasting !== false;
    const includeEOQ = req.body.includeEOQ !== false;
    
    // Get all products with their current quantities and min stock levels
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const inventoryDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "inventory.db",
    );
    
    const inventoryDB = new Datastore({
        filename: inventoryDbPath,
        autoload: true,
    });
    
    const storeInventoryDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "store-inventory.db",
    );
    
    const storeInventoryDB = new Datastore({
        filename: storeInventoryDbPath,
        autoload: true,
    });
    
    inventoryDB.find({}, function (err, products) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const suggestions = [];
        
        // Process each product with advanced algorithms
        async.eachSeries(products, function (product, callback) {
            // Get store-specific quantity if storeId is provided
            if (storeId) {
                storeInventoryDB.findOne({
                    productId: product._id,
                    storeId: storeId
                }, function(err, storeInventory) {
                    if (err) {
                        return callback(err);
                    }
                    
                    const currentQuantity = storeInventory ? parseInt(storeInventory.quantity) || 0 : parseInt(product.quantity) || 0;
                    const minStock = storeInventory ? parseInt(storeInventory.minStock) || 0 : parseInt(product.minStock) || 0;
                    
                    processProductAdvanced(product, currentQuantity, minStock, storeId, includeForecasting, includeEOQ, suggestions, callback);
                });
            } else {
                const currentQuantity = parseInt(product.quantity) || 0;
                const minStock = parseInt(product.minStock) || 0;
                
                processProductAdvanced(product, currentQuantity, minStock, storeId, includeForecasting, includeEOQ, suggestions, callback);
            }
        }, function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred while generating advanced reorder suggestions.",
                });
            }
            
            res.json({
                message: "Advanced reorder suggestions generated successfully.",
                suggestions: suggestions,
                totalSuggestions: suggestions.length,
                algorithms: {
                    forecasting: includeForecasting,
                    eoq: includeEOQ
                }
            });
        });
    });
});

/**
 * POST endpoint: Generate EOQ-optimized suggestions.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/generate-eoq", function (req, res) {
    const storeId = req.body.storeId ? parseInt(req.body.storeId) : null;
    
    // Get all products with their current quantities and min stock levels
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const inventoryDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "inventory.db",
    );
    
    const inventoryDB = new Datastore({
        filename: inventoryDbPath,
        autoload: true,
    });
    
    const storeInventoryDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "store-inventory.db",
    );
    
    const storeInventoryDB = new Datastore({
        filename: storeInventoryDbPath,
        autoload: true,
    });
    
    inventoryDB.find({}, function (err, products) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const suggestions = [];
        
        // Process each product with EOQ calculation
        async.eachSeries(products, function (product, callback) {
            // Get store-specific quantity if storeId is provided
            if (storeId) {
                storeInventoryDB.findOne({
                    productId: product._id,
                    storeId: storeId
                }, function(err, storeInventory) {
                    if (err) {
                        return callback(err);
                    }
                    
                    const currentQuantity = storeInventory ? parseInt(storeInventory.quantity) || 0 : parseInt(product.quantity) || 0;
                    const minStock = storeInventory ? parseInt(storeInventory.minStock) || 0 : parseInt(product.minStock) || 0;
                    
                    processProductEOQ(product, currentQuantity, minStock, storeId, suggestions, callback);
                });
            } else {
                const currentQuantity = parseInt(product.quantity) || 0;
                const minStock = parseInt(product.minStock) || 0;
                
                processProductEOQ(product, currentQuantity, minStock, storeId, suggestions, callback);
            }
        }, function (err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred while generating EOQ suggestions.",
                });
            }
            
            res.json({
                message: "EOQ-optimized suggestions generated successfully.",
                suggestions: suggestions,
                totalSuggestions: suggestions.length
            });
        });
    });
});

/**
 * POST endpoint: Create purchase order from reorder suggestions.
 *
 * @param {Object} req request object with suggestion IDs in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/create-purchase-order", function (req, res) {
    if (!req.body.suggestionIds || !Array.isArray(req.body.suggestionIds) || req.body.suggestionIds.length === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Suggestion IDs array is required.",
        });
    }
    
    const suggestionIds = req.body.suggestionIds.map(id => parseInt(id));
    
    // Get all suggestions
    reorderSuggestionsDB.find({ _id: { $in: suggestionIds } }, function (err, suggestions) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (suggestions.length === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: "No valid reorder suggestions found.",
            });
        }
        
        // Group suggestions by supplier
        const suggestionsBySupplier = {};
        suggestions.forEach(function(suggestion) {
            if (!suggestionsBySupplier[suggestion.supplierId]) {
                suggestionsBySupplier[suggestion.supplierId] = [];
            }
            suggestionsBySupplier[suggestion.supplierId].push(suggestion);
        });
        
        // Create a purchase order for each supplier
        const purchaseOrders = [];
        const Datastore = require("@seald-io/nedb");
        const path = require("path");
        
        const purchaseOrdersDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "purchase-orders.db",
        );
        
        const purchaseOrdersDB = new Datastore({
            filename: purchaseOrdersDbPath,
            autoload: true,
        });
        
        const purchaseOrderItemsDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "purchase-order-items.db",
        );
        
        const purchaseOrderItemsDB = new Datastore({
            filename: purchaseOrderItemsDbPath,
            autoload: true,
        });
        
        async.eachSeries(Object.keys(suggestionsBySupplier), function(supplierId, callback) {
            const supplierSuggestions = suggestionsBySupplier[supplierId];
            const supplierIdNum = parseInt(supplierId);
            
            // Calculate totals
            let subtotal = 0;
            const items = [];
            
            supplierSuggestions.forEach(function(suggestion) {
                const itemTotal = suggestion.lastPurchasePrice * suggestion.suggestedQuantity;
                subtotal += itemTotal;
                
                items.push({
                    productId: suggestion.productId,
                    quantity: suggestion.suggestedQuantity,
                    unitPrice: suggestion.lastPurchasePrice,
                    gstRate: 0,
                    discountPercent: 0,
                    discountAmount: 0
                });
            });
            
            // Generate unique order number
            const orderNumber = generateOrderNumber();
            
            const newPurchaseOrder = {
                _id: Math.floor(Date.now() / 1000) + Math.random(),
                orderNumber: orderNumber,
                supplierId: supplierIdNum,
                orderDate: new Date().toISOString().split('T')[0],
                expectedDeliveryDate: null,
                status: 'PENDING',
                subtotal: parseFloat(subtotal.toFixed(2)),
                gstAmount: 0,
                totalAmount: parseFloat(subtotal.toFixed(2)),
                discountAmount: 0,
                notes: 'Generated from reorder suggestions',
                createdBy: req.body.createdBy ? parseInt(req.body.createdBy) : null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            purchaseOrdersDB.insert(newPurchaseOrder, function (err, purchaseOrder) {
                if (err) {
                    return callback(err);
                }
                
                // Create purchase order items
                const createdItems = [];
                
                async.eachSeries(items, function(itemData, itemCallback) {
                    const newItem = {
                        _id: Math.floor(Date.now() / 1000) + Math.random(),
                        purchaseOrderId: purchaseOrder._id,
                        productId: parseInt(itemData.productId),
                        batchNumber: null,
                        quantity: parseInt(itemData.quantity),
                        unitPrice: parseFloat(itemData.unitPrice),
                        gstRate: parseFloat(itemData.gstRate) || 0,
                        discountPercent: parseFloat(itemData.discountPercent) || 0,
                        discountAmount: parseFloat(itemData.discountAmount) || 0,
                        totalPrice: parseFloat(itemData.unitPrice) * parseInt(itemData.quantity),
                        receivedQuantity: 0,
                        createdAt: new Date()
                    };
                    
                    purchaseOrderItemsDB.insert(newItem, function (err, item) {
                        if (err) {
                            return itemCallback(err);
                        }
                        
                        createdItems.push(item);
                        itemCallback();
                    });
                }, function(err) {
                    if (err) {
                        return callback(err);
                    }
                    
                    purchaseOrders.push({
                        ...purchaseOrder,
                        items: createdItems
                    });
                    
                    callback();
                });
            });
        }, function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to create purchase orders from reorder suggestions.",
                });
            }
            
            // Mark suggestions as processed
            reorderSuggestionsDB.update(
                { _id: { $in: suggestionIds } },
                { 
                    $set: {
                        isDismissed: true,
                        dismissedAt: new Date(),
                        dismissalReason: 'Purchase order created',
                        updatedAt: new Date()
                    }
                },
                { multi: true },
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                    }
                    
                    res.json({
                        message: "Purchase orders created successfully from reorder suggestions.",
                        purchaseOrders: purchaseOrders
                    });
                }
            );
        });
    });
});

/**
 * Helper function to get preferred supplier for a product
 *
 * @param {number} productId product ID
 * @param {function} callback callback function
 * @returns {void}
 */
function getPreferredSupplier(productId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Check batches for supplier information
    const batchesDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "batches.db",
    );
    
    const batchesDB = new Datastore({
        filename: batchesDbPath,
        autoload: true,
    });
    
    batchesDB.findOne({ productId: productId, supplierId: { $ne: null } }, function (err, batch) {
        if (err) {
            return callback(err);
        }
        
        if (batch && batch.supplierId) {
            // Get supplier details
            const suppliersDbPath = path.join(
                process.env.APPDATA,
                process.env.APPNAME,
                "server",
                "databases",
                "suppliers.db",
            );
            
            const suppliersDB = new Datastore({
                filename: suppliersDbPath,
                autoload: true,
            });
            
            suppliersDB.findOne({ _id: batch.supplierId }, function (err, supplier) {
                if (err) {
                    return callback(err);
                }
                
                callback(null, supplier);
            });
        } else {
            callback(null, null);
        }
    });
}

/**
 * Helper function to generate unique order number
 *
 * @returns {string} unique order number
 */
function generateOrderNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = date.getTime();
    
    return `RO${year}${month}${day}${time.toString().slice(-6)}`;
}

/**
 * Helper function to process product for basic reorder suggestions
 *
 * @param {Object} product product object
 * @param {number} currentQuantity current quantity
 * @param {number} minStock minimum stock level
 * @param {number} storeId store ID (optional)
 * @param {Array} suggestionTypes types of suggestions to generate
 * @param {Array} suggestions array to store suggestions
 * @param {function} callback callback function
 * @returns {void}
 */
function processProductForReorder(product, currentQuantity, minStock, storeId, suggestionTypes, suggestions, callback) {
    // Skip if current quantity is above minimum stock
    if (currentQuantity > minStock && suggestionTypes.includes(SUGGESTION_TYPES.STOCK_LEVEL)) {
        return callback();
    }
    
    // Generate stock level suggestion
    if (suggestionTypes.includes(SUGGESTION_TYPES.STOCK_LEVEL)) {
        // Determine priority based on stock level
        let priority = 'LOW';
        if (currentQuantity === 0) {
            priority = 'CRITICAL';
        } else if (currentQuantity <= minStock * 0.5) {
            priority = 'HIGH';
        } else if (currentQuantity <= minStock * 0.75) {
            priority = 'MEDIUM';
        }
        
        // Calculate suggested order quantity
        let suggestedQuantity = 0;
        if (currentQuantity === 0) {
            suggestedQuantity = minStock * 2; // Order double the min stock for out of stock items
        } else {
            suggestedQuantity = (minStock * 1.5) - currentQuantity; // Order to reach 150% of min stock
        }
        
        // Get preferred supplier for this product
        getPreferredSupplier(product._id, function(err, supplier) {
            if (err) {
                console.error(err);
                return callback();
            }
            
            // Check if suggestion already exists and is not dismissed
            const query = {
                productId: product._id,
                suggestionType: SUGGESTION_TYPES.STOCK_LEVEL,
                isDismissed: false
            };
            
            if (storeId) {
                query.storeId = storeId;
            }
            
            reorderSuggestionsDB.findOne(query, function (err, existingSuggestion) {
                if (err) {
                    console.error(err);
                    return callback();
                }
                
                if (existingSuggestion) {
                    // Update existing suggestion
                    reorderSuggestionsDB.update(
                        { _id: existingSuggestion._id },
                        {
                            $set: {
                                currentQuantity: currentQuantity,
                                minStock: minStock,
                                suggestedQuantity: suggestedQuantity,
                                priority: priority,
                                updatedAt: new Date()
                            }
                        },
                        {},
                        function (err, numReplaced) {
                            if (err) {
                                console.error(err);
                            }
                            callback();
                        }
                    );
                } else {
                    // Create new suggestion
                    const newSuggestion = {
                        _id: Math.floor(Date.now() / 1000) + Math.random(),
                        productId: product._id,
                        productName: product.name,
                        currentQuantity: currentQuantity,
                        minStock: minStock,
                        suggestedQuantity: suggestedQuantity,
                        priority: priority,
                        suggestionType: SUGGESTION_TYPES.STOCK_LEVEL,
                        supplierId: supplier ? supplier._id : null,
                        supplierName: supplier ? supplier.name : null,
                        lastPurchasePrice: product.price || 0,
                        estimatedCost: (product.price || 0) * suggestedQuantity,
                        storeId: storeId,
                        isDismissed: false,
                        dismissedAt: null,
                        dismissalReason: null,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    
                    reorderSuggestionsDB.insert(newSuggestion, function (err, suggestion) {
                        if (err) {
                            console.error(err);
                        } else {
                            suggestions.push(suggestion);
                        }
                        callback();
                    });
                }
            });
        });
    } else {
        callback();
    }
}

/**
 * Helper function to process product with advanced algorithms
 *
 * @param {Object} product product object
 * @param {number} currentQuantity current quantity
 * @param {number} minStock minimum stock level
 * @param {number} storeId store ID (optional)
 * @param {boolean} includeForecasting include demand forecasting
 * @param {boolean} includeEOQ include EOQ calculation
 * @param {Array} suggestions array to store suggestions
 * @param {function} callback callback function
 * @returns {void}
 */
function processProductAdvanced(product, currentQuantity, minStock, storeId, includeForecasting, includeEOQ, suggestions, callback) {
    async.parallel([
        function(parallelCallback) {
            // Stock level analysis
            if (currentQuantity <= minStock) {
                let priority = 'LOW';
                if (currentQuantity === 0) {
                    priority = 'CRITICAL';
                } else if (currentQuantity <= minStock * 0.5) {
                    priority = 'HIGH';
                } else if (currentQuantity <= minStock * 0.75) {
                    priority = 'MEDIUM';
                }
                
                let suggestedQuantity = minStock * 1.5 - currentQuantity;
                if (currentQuantity === 0) {
                    suggestedQuantity = minStock * 2;
                }
                
                createSuggestion(product, currentQuantity, minStock, suggestedQuantity, priority,
                    SUGGESTION_TYPES.STOCK_LEVEL, storeId, suggestions, parallelCallback);
            } else {
                parallelCallback();
            }
        },
        function(parallelCallback) {
            // Demand forecasting
            if (includeForecasting) {
                calculateDemandForecast(product._id, function(err, forecast) {
                    if (err || !forecast) {
                        return parallelCallback();
                    }
                    
                    const projectedDemand = forecast.averageDemand || 0;
                    const suggestedQuantity = Math.max(projectedDemand * 2, minStock - currentQuantity);
                    
                    if (suggestedQuantity > 0) {
                        createSuggestion(product, currentQuantity, minStock, suggestedQuantity, 'MEDIUM',
                            SUGGESTION_TYPES.DEMAND_FORECAST, storeId, suggestions, parallelCallback);
                    } else {
                        parallelCallback();
                    }
                });
            } else {
                parallelCallback();
            }
        },
        function(parallelCallback) {
            // EOQ calculation
            if (includeEOQ) {
                calculateEOQ(product._id, function(err, eoq) {
                    if (err || !eoq) {
                        return parallelCallback();
                    }
                    
                    if (currentQuantity < eoq.reorderPoint) {
                        createSuggestion(product, currentQuantity, minStock, eoq.orderQuantity, 'MEDIUM',
                            SUGGESTION_TYPES.EOQ_OPTIMIZED, storeId, suggestions, parallelCallback);
                    } else {
                        parallelCallback();
                    }
                });
            } else {
                parallelCallback();
            }
        }
    ], callback);
}

/**
 * Helper function to process product with EOQ calculation
 *
 * @param {Object} product product object
 * @param {number} currentQuantity current quantity
 * @param {number} minStock minimum stock level
 * @param {number} storeId store ID (optional)
 * @param {Array} suggestions array to store suggestions
 * @param {function} callback callback function
 * @returns {void}
 */
function processProductEOQ(product, currentQuantity, minStock, storeId, suggestions, callback) {
    calculateEOQ(product._id, function(err, eoq) {
        if (err || !eoq) {
            return callback();
        }
        
        if (currentQuantity < eoq.reorderPoint) {
            createSuggestion(product, currentQuantity, minStock, eoq.orderQuantity, 'MEDIUM',
                SUGGESTION_TYPES.EOQ_OPTIMIZED, storeId, suggestions, callback);
        } else {
            callback();
        }
    });
}

/**
 * Helper function to create a suggestion
 *
 * @param {Object} product product object
 * @param {number} currentQuantity current quantity
 * @param {number} minStock minimum stock level
 * @param {number} suggestedQuantity suggested quantity
 * @param {string} priority priority level
 * @param {string} suggestionType suggestion type
 * @param {number} storeId store ID (optional)
 * @param {Array} suggestions array to store suggestions
 * @param {function} callback callback function
 * @returns {void}
 */
function createSuggestion(product, currentQuantity, minStock, suggestedQuantity, priority, suggestionType, storeId, suggestions, callback) {
    getPreferredSupplier(product._id, function(err, supplier) {
        if (err) {
            console.error(err);
            return callback();
        }
        
        // Check if suggestion already exists and is not dismissed
        const query = {
            productId: product._id,
            suggestionType: suggestionType,
            isDismissed: false
        };
        
        if (storeId) {
            query.storeId = storeId;
        }
        
        reorderSuggestionsDB.findOne(query, function (err, existingSuggestion) {
            if (err) {
                console.error(err);
                return callback();
            }
            
            if (existingSuggestion) {
                // Update existing suggestion
                reorderSuggestionsDB.update(
                    { _id: existingSuggestion._id },
                    {
                        $set: {
                            currentQuantity: currentQuantity,
                            minStock: minStock,
                            suggestedQuantity: suggestedQuantity,
                            priority: priority,
                            updatedAt: new Date()
                        }
                    },
                    {},
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                        }
                        callback();
                    }
                );
            } else {
                // Create new suggestion
                const newSuggestion = {
                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                    productId: product._id,
                    productName: product.name,
                    currentQuantity: currentQuantity,
                    minStock: minStock,
                    suggestedQuantity: suggestedQuantity,
                    priority: priority,
                    suggestionType: suggestionType,
                    supplierId: supplier ? supplier._id : null,
                    supplierName: supplier ? supplier.name : null,
                    lastPurchasePrice: product.price || 0,
                    estimatedCost: (product.price || 0) * suggestedQuantity,
                    storeId: storeId,
                    isDismissed: false,
                    dismissedAt: null,
                    dismissalReason: null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                
                reorderSuggestionsDB.insert(newSuggestion, function (err, suggestion) {
                    if (err) {
                        console.error(err);
                    } else {
                        suggestions.push(suggestion);
                    }
                    callback();
                });
            }
        });
    });
}

/**
 * Helper function to calculate demand forecast using simple linear regression
 *
 * @param {number} productId product ID
 * @param {function} callback callback function
 * @returns {void}
 */
function calculateDemandForecast(productId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get sales data for the last 90 days
    const transactionsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "transactions.db",
    );
    
    const transactionsDB = new Datastore({
        filename: transactionsDbPath,
        autoload: true,
    });
    
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
    transactionsDB.find({
        productId: productId,
        date: { $gte: ninetyDaysAgo.toISOString() }
    }).sort({ date: 1 }).exec(function(err, transactions) {
        if (err || transactions.length < 5) {
            return callback(err, null);
        }
        
        // Simple linear regression: y = mx + b
        // x = days since start, y = quantity sold
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = transactions.length;
        
        transactions.forEach((transaction, index) => {
            const x = index; // Day index
            const y = Math.abs(parseInt(transaction.quantity) || 0); // Absolute quantity sold
            
            sumX += x;
            sumY += y;
            sumXY += x * y;
            sumX2 += x * x;
        });
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;
        
        // Forecast next 30 days demand
        const forecastDays = 30;
        const forecastDemand = slope * (n + forecastDays) + intercept;
        
        // Calculate average demand from last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentTransactions = transactions.filter(t => new Date(t.date) >= thirtyDaysAgo);
        const averageDemand = recentTransactions.reduce((sum, t) => sum + Math.abs(parseInt(t.quantity) || 0), 0) / Math.max(recentTransactions.length, 1);
        
        callback(null, {
            averageDemand: Math.max(0, averageDemand),
            forecastDemand: Math.max(0, forecastDemand),
            trend: slope > 0 ? 'INCREASING' : slope < 0 ? 'DECREASING' : 'STABLE',
            confidence: recentTransactions.length >= 10 ? 'HIGH' : recentTransactions.length >= 5 ? 'MEDIUM' : 'LOW'
        });
    });
}

/**
 * Helper function to calculate Economic Order Quantity (EOQ)
 *
 * @param {number} productId product ID
 * @param {function} callback callback function
 * @returns {void}
 */
function calculateEOQ(productId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get product data and sales history
    const inventoryDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "inventory.db",
    );
    
    const inventoryDB = new Datastore({
        filename: inventoryDbPath,
        autoload: true,
    });
    
    inventoryDB.findOne({ _id: productId }, function(err, product) {
        if (err || !product) {
            return callback(err, null);
        }
        
        // Get purchase order history for this product
        const purchaseOrdersDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "purchase-order-items.db",
        );
        
        const purchaseOrderItemsDB = new Datastore({
            filename: purchaseOrdersDbPath,
            autoload: true,
        });
        
        purchaseOrderItemsDB.find({ productId: productId }, function(err, items) {
            if (err || items.length === 0) {
                return callback(err, null);
            }
            
            // Calculate annual demand (simplified)
            const totalQuantity = items.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
            const daysSpan = 90; // Assume last 90 days of data
            const annualDemand = (totalQuantity / daysSpan) * 365;
            
            // Estimate ordering cost (simplified)
            const orderingCost = 50; // Fixed cost per order
            
            // Estimate holding cost (25% of unit cost annually)
            const unitCost = parseFloat(product.price) || 10;
            const holdingCost = unitCost * 0.25;
            
            // Calculate EOQ: sqrt(2 * D * S / H)
            // D = Annual demand, S = Ordering cost, H = Holding cost per unit per year
            const eoq = Math.sqrt((2 * annualDemand * orderingCost) / holdingCost);
            
            // Calculate reorder point
            const leadTime = 7; // 7 days lead time (assumed)
            const dailyDemand = annualDemand / 365;
            const reorderPoint = dailyDemand * leadTime;
            
            callback(null, {
                orderQuantity: Math.round(eoq),
                reorderPoint: Math.round(reorderPoint),
                annualDemand: Math.round(annualDemand),
                orderingCost: orderingCost,
                holdingCost: holdingCost,
                unitCost: unitCost
            });
        });
    });
}

module.exports.generateOrderNumber = generateOrderNumber;
module.exports.SUGGESTION_TYPES = SUGGESTION_TYPES;
module.exports.PRIORITY_LEVELS = PRIORITY_LEVELS;