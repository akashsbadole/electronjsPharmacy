const app = require("express")();
const server = require("http").Server(app);
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

app.use(bodyParser.json());

module.exports = app;

let reorderSuggestionsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

reorderSuggestionsDB.ensureIndex({ fieldName: "_id", unique: true });
reorderSuggestionsDB.ensureIndex({ fieldName: "productId" });
reorderSuggestionsDB.ensureIndex({ fieldName: "priority" });
reorderSuggestionsDB.ensureIndex({ fieldName: "isDismissed" });

/**
 * GET endpoint: Get welcome message for Reorder Suggestions API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Reorder Suggestions API");
});

/**
 * GET endpoint: Get reorder suggestions.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
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
app.post("/:id/dismiss", function (req, res) {
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
app.get("/critical", function (req, res) {
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
app.post("/generate", function (req, res) {
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
            const currentQuantity = parseInt(product.quantity) || 0;
            const minStock = parseInt(product.minStock) || 0;
            
            // Skip if current quantity is above minimum stock
            if (currentQuantity > minStock) {
                return callback();
            }
            
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
                reorderSuggestionsDB.findOne({
                    productId: product._id,
                    isDismissed: false
                }, function (err, existingSuggestion) {
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
                            supplierId: supplier ? supplier._id : null,
                            supplierName: supplier ? supplier.name : null,
                            lastPurchasePrice: product.price || 0,
                            estimatedCost: (product.price || 0) * suggestedQuantity,
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
                suggestions: suggestions
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
app.post("/create-purchase-order", function (req, res) {
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

module.exports.generateOrderNumber = generateOrderNumber;