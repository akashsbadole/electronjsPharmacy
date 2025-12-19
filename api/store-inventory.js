const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const validator = require("validator");

const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "store-inventory.db",
);

router.use(bodyParser.json());

module.exports = router;

let storeInventoryDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

storeInventoryDB.ensureIndex({ fieldName: "_id", unique: true });
storeInventoryDB.ensureIndex({ fieldName: ["storeId", "productId"], unique: true });

/**
 * GET endpoint: Get the welcome message for the Store Inventory API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Store Inventory API");
});

/**
 * GET endpoint: Get all inventory for a specific store.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/store/:storeId", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }

    storeInventoryDB.find(
        {
            storeId: parseInt(req.params.storeId),
        },
        function (err, docs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            res.send(docs);
        }
    );
});

/**
 * GET endpoint: Get inventory for a specific product across all stores.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/product/:productId", function (req, res) {
    if (!req.params.productId) {
        return res.status(400).send("Product ID is required.");
    }

    storeInventoryDB.find(
        {
            productId: parseInt(req.params.productId),
        },
        function (err, docs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            res.send(docs);
        }
    );
});

/**
 * GET endpoint: Get specific inventory record for a store-product combination.
 *
 * @param {Object} req request object with store ID and product ID as parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/store/:storeId/product/:productId", function (req, res) {
    if (!req.params.storeId || !req.params.productId) {
        return res.status(400).send("Store ID and Product ID are required.");
    }

    storeInventoryDB.findOne(
        {
            storeId: parseInt(req.params.storeId),
            productId: parseInt(req.params.productId),
        },
        function (err, doc) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            res.send(doc);
        }
    );
});

/**
 * POST endpoint: Create or update inventory for a store-product combination.
 *
 * @param {Object} req request object with inventory data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/update", function (req, res) {
    // Validate required fields
    if (!req.body.storeId || !req.body.productId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID and Product ID are required fields.",
        });
    }

    const storeId = parseInt(req.body.storeId);
    const productId = parseInt(req.body.productId);

    // Check if inventory record exists
    storeInventoryDB.findOne(
        {
            storeId: storeId,
            productId: productId,
        },
        function (err, existingInventory) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            const inventoryData = {
                storeId: storeId,
                productId: productId,
                quantity: req.body.quantity !== undefined ? parseInt(req.body.quantity) : 0,
                minStock: req.body.minStock !== undefined ? parseInt(req.body.minStock) : 0,
                maxStock: req.body.maxStock !== undefined ? parseInt(req.body.maxStock) : 0,
                reorderQuantity: req.body.reorderQuantity !== undefined ? parseInt(req.body.reorderQuantity) : 0,
                lastUpdated: new Date(),
                updatedBy: req.body.updatedBy ? validator.escape(req.body.updatedBy) : "system"
            };

            if (existingInventory) {
                // Update existing record
                storeInventoryDB.update(
                    { _id: existingInventory._id },
                    { $set: inventoryData },
                    {},
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        res.json({ message: "Store inventory updated successfully." });
                    }
                );
            } else {
                // Create new record
                inventoryData._id = Math.floor(Date.now() / 1000);
                inventoryData.createdAt = new Date();
                
                storeInventoryDB.insert(inventoryData, function (err, newInventory) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    res.status(201).send(newInventory);
                });
            }
        }
    );
});

/**
 * POST endpoint: Adjust inventory quantity.
 *
 * @param {Object} req request object with adjustment data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/adjust", function (req, res) {
    // Validate required fields
    if (!req.body.storeId || !req.body.productId || req.body.adjustment === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID, Product ID, and adjustment amount are required fields.",
        });
    }

    const storeId = parseInt(req.body.storeId);
    const productId = parseInt(req.body.productId);
    const adjustment = parseInt(req.body.adjustment);

    // Check if inventory record exists
    storeInventoryDB.findOne(
        {
            storeId: storeId,
            productId: productId,
        },
        function (err, existingInventory) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (!existingInventory) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Inventory record not found for this store-product combination.",
                });
            }

            const newQuantity = existingInventory.quantity + adjustment;

            if (newQuantity < 0) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Insufficient inventory for this adjustment.",
                });
            }

            // Update quantity
            storeInventoryDB.update(
                { _id: existingInventory._id },
                {
                    $set: {
                        quantity: newQuantity,
                        lastUpdated: new Date(),
                        updatedBy: req.body.updatedBy ? validator.escape(req.body.updatedBy) : "system"
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
                    
                    res.json({
                        message: "Inventory adjusted successfully.",
                        previousQuantity: existingInventory.quantity,
                        newQuantity: newQuantity,
                        adjustment: adjustment
                    });
                }
            );
        }
    );
});

/**
 * GET endpoint: Get low stock items for a specific store.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/store/:storeId/low-stock", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }

    storeInventoryDB.find(
        {
            storeId: parseInt(req.params.storeId),
        },
        function (err, docs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            const lowStockItems = docs.filter(function(item) {
                return item.quantity <= item.minStock;
            });

            res.send(lowStockItems);
        }
    );
});

/**
 * GET endpoint: Get inventory summary across all stores.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/summary", function (req, res) {
    storeInventoryDB.find({}, function (err, docs) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Group by product ID
        const summary = {};
        docs.forEach(function(item) {
            if (!summary[item.productId]) {
                summary[item.productId] = {
                    productId: item.productId,
                    totalQuantity: 0,
                    storeCount: 0,
                    stores: []
                };
            }
            
            summary[item.productId].totalQuantity += item.quantity;
            summary[item.productId].storeCount++;
            summary[item.productId].stores.push({
                storeId: item.storeId,
                quantity: item.quantity
            });
        });

        res.send(Object.values(summary));
    });
});

/**
 * POST endpoint: Initialize inventory for a new store.
 *
 * @param {Object} req request object with store ID in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/initialize-store", function (req, res) {
    if (!req.body.storeId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID is required.",
        });
    }

    const storeId = parseInt(req.body.storeId);

    // Get all products from main inventory
    const inventoryDBPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "inventory.db",
    );
    
    const inventoryDB = new Datastore({
        filename: inventoryDBPath,
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

        let processedCount = 0;
        let errorCount = 0;

        // Create inventory records for each product
        products.forEach(function(product) {
            storeInventoryDB.findOne(
                {
                    storeId: storeId,
                    productId: product._id,
                },
                function (err, existingInventory) {
                    if (err) {
                        console.error(err);
                        errorCount++;
                    } else if (!existingInventory) {
                        // Create new inventory record for this store
                        const inventoryData = {
                            _id: Math.floor(Date.now() / 1000) + Math.random(),
                            storeId: storeId,
                            productId: product._id,
                            quantity: 0, // Start with 0 for new stores
                            minStock: product.minStock ? parseInt(product.minStock) : 0,
                            maxStock: product.maxStock ? parseInt(product.maxStock) : 0,
                            reorderQuantity: product.reorderQuantity ? parseInt(product.reorderQuantity) : 0,
                            createdAt: new Date(),
                            lastUpdated: new Date(),
                            updatedBy: "system"
                        };

                        storeInventoryDB.insert(inventoryData, function (err, newInventory) {
                            if (err) {
                                console.error(err);
                                errorCount++;
                            }
                            
                            processedCount++;
                            
                            // Check if all products have been processed
                            if (processedCount === products.length) {
                                res.json({
                                    message: "Store inventory initialized successfully.",
                                    totalProducts: products.length,
                                    successCount: products.length - errorCount,
                                    errorCount: errorCount
                                });
                            }
                        });
                    } else {
                        processedCount++;
                        
                        // Check if all products have been processed
                        if (processedCount === products.length) {
                            res.json({
                                message: "Store inventory initialization completed.",
                                totalProducts: products.length,
                                successCount: products.length - errorCount,
                                errorCount: errorCount
                            });
                        }
                    }
                }
            );
        });
    });
});

/**
 * GET endpoint: Get reorder suggestions for a specific store.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/store/:storeId/reorder-suggestions", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID is required.",
        });
    }

    const storeId = parseInt(req.params.storeId);
    const suggestionType = req.query.suggestionType || null;
    
    // Get store inventory
    storeInventoryDB.find({ storeId: storeId }, function (err, storeItems) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve store inventory.",
            });
        }
        
        // Filter items that need reordering
        const itemsNeedingReorder = storeItems.filter(item =>
            item.quantity <= item.minStock && item.reorderQuantity > 0
        );
        
        if (itemsNeedingReorder.length === 0) {
            return res.json({
                storeId: storeId,
                suggestions: [],
                message: "No items need reordering for this store."
            });
        }
        
        // Get product details
        const inventoryDbPath = path.join(
            appData,
            appName,
            "server",
            "databases",
            "inventory.db",
        );
        
        const inventoryDB = new Datastore({
            filename: inventoryDbPath,
            autoload: true,
        });
        
        const productIds = itemsNeedingReorder.map(item => item.productId);
        
        inventoryDB.find({ _id: { $in: productIds } }, function(err, products) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve product details.",
                });
            }
            
            // Create reorder suggestions
            const suggestions = itemsNeedingReorder.map(storeItem => {
                const product = products.find(p => p._id === storeItem.productId);
                
                return {
                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                    storeId: storeId,
                    productId: storeItem.productId,
                    productName: product ? product.name : 'Unknown Product',
                    currentStock: storeItem.quantity,
                    minStock: storeItem.minStock,
                    maxStock: storeItem.maxStock,
                    reorderQuantity: storeItem.reorderQuantity,
                    suggestedQuantity: calculateSuggestedQuantity(storeItem, product),
                    suggestionType: suggestionType || 'STOCK_LEVEL',
                    priority: calculatePriority(storeItem, product),
                    estimatedUnitPrice: product ? product.price : 0,
                    estimatedTotalValue: 0, // Will be calculated below
                    suggestedDeliveryDate: calculateSuggestedDeliveryDate(),
                    createdAt: new Date(),
                    status: 'PENDING'
                };
            });
            
            // Calculate total values
            suggestions.forEach(suggestion => {
                suggestion.estimatedTotalValue = suggestion.suggestedQuantity * suggestion.estimatedUnitPrice;
            });
            
            // Sort by priority (high to low)
            suggestions.sort((a, b) => b.priority - a.priority);
            
            res.json({
                storeId: storeId,
                suggestions: suggestions,
                summary: {
                    totalItems: suggestions.length,
                    highPriority: suggestions.filter(s => s.priority >= 8).length,
                    mediumPriority: suggestions.filter(s => s.priority >= 5 && s.priority < 8).length,
                    lowPriority: suggestions.filter(s => s.priority < 5).length,
                    totalEstimatedValue: suggestions.reduce((sum, s) => sum + s.estimatedTotalValue, 0)
                }
            });
        });
    });
});

/**
 * GET endpoint: Get reorder suggestions across all stores.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/reorder-suggestions", function (req, res) {
    const suggestionType = req.query.suggestionType || null;
    const priority = req.query.priority ? parseInt(req.query.priority) : null;
    
    // Get all store inventory
    storeInventoryDB.find({}, function (err, allStoreItems) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve store inventory.",
            });
        }
        
        // Filter items that need reordering
        const itemsNeedingReorder = allStoreItems.filter(item =>
            item.quantity <= item.minStock && item.reorderQuantity > 0
        );
        
        if (itemsNeedingReorder.length === 0) {
            return res.json({
                suggestions: [],
                message: "No items need reordering across any stores."
            });
        }
        
        // Get product details
        const inventoryDbPath = path.join(
            appData,
            appName,
            "server",
            "databases",
            "inventory.db",
        );
        
        const inventoryDB = new Datastore({
            filename: inventoryDbPath,
            autoload: true,
        });
        
        const productIds = itemsNeedingReorder.map(item => item.productId);
        
        inventoryDB.find({ _id: { $in: productIds } }, function(err, products) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve product details.",
                });
            }
            
            // Create reorder suggestions
            const suggestions = itemsNeedingReorder.map(storeItem => {
                const product = products.find(p => p._id === storeItem.productId);
                
                return {
                    _id: Math.floor(Date.now() / 1000) + Math.random(),
                    storeId: storeItem.storeId,
                    productId: storeItem.productId,
                    productName: product ? product.name : 'Unknown Product',
                    currentStock: storeItem.quantity,
                    minStock: storeItem.minStock,
                    maxStock: storeItem.maxStock,
                    reorderQuantity: storeItem.reorderQuantity,
                    suggestedQuantity: calculateSuggestedQuantity(storeItem, product),
                    suggestionType: suggestionType || 'STOCK_LEVEL',
                    priority: calculatePriority(storeItem, product),
                    estimatedUnitPrice: product ? product.price : 0,
                    estimatedTotalValue: 0, // Will be calculated below
                    suggestedDeliveryDate: calculateSuggestedDeliveryDate(),
                    createdAt: new Date(),
                    status: 'PENDING'
                };
            });
            
            // Calculate total values and apply filters
            let filteredSuggestions = suggestions.map(suggestion => {
                suggestion.estimatedTotalValue = suggestion.suggestedQuantity * suggestion.estimatedUnitPrice;
                return suggestion;
            });
            
            if (priority !== null) {
                filteredSuggestions = filteredSuggestions.filter(s => s.priority >= priority);
            }
            
            // Sort by priority (high to low)
            filteredSuggestions.sort((a, b) => b.priority - a.priority);
            
            // Group by store for summary
            const storeGroups = {};
            filteredSuggestions.forEach(suggestion => {
                if (!storeGroups[suggestion.storeId]) {
                    storeGroups[suggestion.storeId] = {
                        storeId: suggestion.storeId,
                        suggestions: [],
                        totalEstimatedValue: 0
                    };
                }
                storeGroups[suggestion.storeId].suggestions.push(suggestion);
                storeGroups[suggestion.storeId].totalEstimatedValue += suggestion.estimatedTotalValue;
            });
            
            res.json({
                suggestions: filteredSuggestions,
                storeGroups: Object.values(storeGroups),
                summary: {
                    totalItems: filteredSuggestions.length,
                    totalStores: Object.keys(storeGroups).length,
                    highPriority: filteredSuggestions.filter(s => s.priority >= 8).length,
                    mediumPriority: filteredSuggestions.filter(s => s.priority >= 5 && s.priority < 8).length,
                    lowPriority: filteredSuggestions.filter(s => s.priority < 5).length,
                    totalEstimatedValue: filteredSuggestions.reduce((sum, s) => sum + s.estimatedTotalValue, 0)
                }
            });
        });
    });
});

/**
 * POST endpoint: Create consolidated purchase order for multiple stores.
 *
 * @param {Object} req request object with consolidation data in body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/consolidated-purchase-order", function (req, res) {
    if (!req.body.suggestions || !Array.isArray(req.body.suggestions) || req.body.suggestions.length === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Suggestions array is required.",
        });
    }
    
    if (!req.body.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }
    
    const Datastore = require("@seald-io/nedb");
    const async = require("async");
    
    // Group suggestions by product to consolidate quantities
    const productGroups = {};
    req.body.suggestions.forEach(suggestion => {
        const productId = suggestion.productId;
        if (!productGroups[productId]) {
            productGroups[productId] = {
                productId: productId,
                productName: suggestion.productName,
                totalQuantity: 0,
                stores: []
            };
        }
        productGroups[productId].totalQuantity += suggestion.suggestedQuantity;
        productGroups[productId].stores.push({
            storeId: suggestion.storeId,
            quantity: suggestion.suggestedQuantity,
            currentStock: suggestion.currentStock
        });
    });
    
    // Get product details
    const inventoryDbPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "inventory.db",
    );
    
    const inventoryDB = new Datastore({
        filename: inventoryDbPath,
        autoload: true,
    });
    
    const productIds = Object.keys(productGroups).map(id => parseInt(id));
    
    inventoryDB.find({ _id: { $in: productIds } }, function(err, products) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve product details.",
            });
        }
        
        // Create purchase order items
        const items = Object.values(productGroups).map(group => {
            const product = products.find(p => p._id === group.productId);
            return {
                productId: group.productId,
                quantity: group.totalQuantity,
                unitPrice: product ? product.price : 0,
                gstRate: product ? product.gstRate || 0 : 0,
                discountAmount: 0,
                stores: group.stores
            };
        });
        
        // Create purchase order
        const purchaseOrdersDbPath = path.join(
            appData,
            appName,
            "server",
            "databases",
            "purchase-orders.db",
        );
        
        const purchaseOrdersDB = new Datastore({
            filename: purchaseOrdersDbPath,
            autoload: true,
        });
        
        // Generate unique order number
        const orderNumber = generateConsolidatedOrderNumber();
        
        // Calculate totals
        let subtotal = 0;
        let totalGst = 0;
        
        items.forEach(function(item) {
            const itemTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
            const itemGst = itemTotal * (parseFloat(item.gstRate || 0) / 100);
            subtotal += itemTotal;
            totalGst += itemGst;
        });
        
        const totalAmount = subtotal + totalGst;
        
        const newPurchaseOrder = {
            _id: Math.floor(Date.now() / 1000),
            orderNumber: orderNumber,
            supplierId: parseInt(req.body.supplierId),
            orderDate: new Date().toISOString().split('T')[0],
            expectedDeliveryDate: req.body.expectedDeliveryDate || null,
            status: 'PENDING',
            subtotal: parseFloat(subtotal.toFixed(2)),
            gstAmount: parseFloat(totalGst.toFixed(2)),
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            discountAmount: 0,
            notes: `CONSOLIDATED ORDER FOR MULTIPLE STORES - ${items.length} products, ${Object.keys(productGroups).length} stores`,
            createdBy: 'MULTI_STORE_AUTOMATION',
            storeIds: [...new Set(req.body.suggestions.map(s => s.storeId))],
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        purchaseOrdersDB.insert(newPurchaseOrder, function (err, purchaseOrder) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to create consolidated purchase order.",
                });
            }
            
            // Create purchase order items
            createConsolidatedPurchaseOrderItems(purchaseOrder._id, items, function(err, items) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to create purchase order items.",
                    });
                }
                
                res.status(201).json({
                    message: "Consolidated purchase order created successfully.",
                    purchaseOrder: {
                        ...purchaseOrder,
                        items: items
                    },
                    consolidation: {
                        totalProducts: items.length,
                        totalStores: Object.keys(productGroups).length,
                        productGroups: Object.values(productGroups)
                    }
                });
            });
        });
    });
});

/**
 * GET endpoint: Get inventory distribution for a product across all stores.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/product/:productId/distribution", function (req, res) {
    if (!req.params.productId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product ID is required.",
        });
    }

    const productId = parseInt(req.params.productId);
    
    storeInventoryDB.find(
        {
            productId: productId,
        },
        function (err, docs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (docs.length === 0) {
                return res.json({
                    productId: productId,
                    stores: [],
                    summary: {
                        totalStores: 0,
                        totalQuantity: 0,
                        averageQuantity: 0,
                        lowStockStores: 0
                    }
                });
            }
            
            const totalQuantity = docs.reduce((sum, item) => sum + item.quantity, 0);
            const averageQuantity = totalQuantity / docs.length;
            const lowStockStores = docs.filter(item => item.quantity <= item.minStock).length;
            
            res.json({
                productId: productId,
                stores: docs.map(item => ({
                    storeId: item.storeId,
                    quantity: item.quantity,
                    minStock: item.minStock,
                    maxStock: item.maxStock,
                    reorderQuantity: item.reorderQuantity,
                    needsReorder: item.quantity <= item.minStock,
                    stockLevel: calculateStockLevel(item.quantity, item.minStock, item.maxStock)
                })),
                summary: {
                    totalStores: docs.length,
                    totalQuantity: totalQuantity,
                    averageQuantity: parseFloat(averageQuantity.toFixed(2)),
                    lowStockStores: lowStockStores,
                    stockStatus: lowStockStores > 0 ? 'CRITICAL' : (lowStockStores > docs.length * 0.3 ? 'WARNING' : 'HEALTHY')
                }
            });
        }
    );
});

/**
 * Helper function to calculate suggested quantity
 *
 * @param {Object} storeItem store inventory item
 * @param {Object} product product details
 * @returns {number} suggested quantity
 */
function calculateSuggestedQuantity(storeItem, product) {
    // If reorder quantity is set, use it
    if (storeItem.reorderQuantity > 0) {
        return storeItem.reorderQuantity;
    }
    
    // Otherwise, calculate based on max stock
    if (storeItem.maxStock > 0) {
        return storeItem.maxStock - storeItem.quantity;
    }
    
    // Default to min stock * 2
    return storeItem.minStock * 2 || 10;
}

/**
 * Helper function to calculate priority
 *
 * @param {Object} storeItem store inventory item
 * @param {Object} product product details
 * @returns {number} priority score (1-10)
 */
function calculatePriority(storeItem, product) {
    let priority = 5; // Base priority
    
    // Stock level factor
    if (storeItem.quantity === 0) {
        priority += 3; // Out of stock
    } else if (storeItem.quantity < storeItem.minStock / 2) {
        priority += 2; // Very low stock
    } else if (storeItem.quantity < storeItem.minStock) {
        priority += 1; // Low stock
    }
    
    // Product value factor (higher value = higher priority)
    if (product && product.price) {
        if (product.price > 1000) {
            priority += 1;
        } else if (product.price > 500) {
            priority += 0.5;
        }
    }
    
    return Math.min(10, Math.max(1, priority));
}

/**
 * Helper function to calculate suggested delivery date
 *
 * @returns {string} suggested delivery date
 */
function calculateSuggestedDeliveryDate() {
    const date = new Date();
    date.setDate(date.getDate() + 7); // Default 7 days
    return date.toISOString().split('T')[0];
}

/**
 * Helper function to calculate stock level
 *
 * @param {number} quantity current quantity
 * @param {number} minStock minimum stock
 * @param {number} maxStock maximum stock
 * @returns {string} stock level (LOW, MEDIUM, HIGH)
 */
function calculateStockLevel(quantity, minStock, maxStock) {
    if (quantity <= minStock) {
        return 'LOW';
    } else if (maxStock > 0 && quantity >= maxStock) {
        return 'HIGH';
    } else {
        return 'MEDIUM';
    }
}

/**
 * Helper function to generate consolidated order number
 *
 * @returns {string} unique order number
 */
function generateConsolidatedOrderNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = date.getTime();
    
    return `CPO${year}${month}${day}${time.toString().slice(-6)}`;
}

/**
 * Helper function to create consolidated purchase order items
 *
 * @param {number} orderId purchase order ID
 * @param {Array} items array of items
 * @param {function} callback callback function
 * @returns {void}
 */
function createConsolidatedPurchaseOrderItems(orderId, items, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const itemsDbPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "purchase-order-items.db",
    );
    
    const itemsDB = new Datastore({
        filename: itemsDbPath,
        autoload: true,
    });
    
    const createdItems = [];
    
    items.forEach(function(itemData) {
        const itemTotal = parseFloat(itemData.unitPrice) * parseInt(itemData.quantity);
        const itemGst = itemTotal * (parseFloat(itemData.gstRate || 0) / 100);
        const totalPrice = itemTotal + itemGst - (parseFloat(itemData.discountAmount) || 0);
        
        const newItem = {
            _id: Math.floor(Date.now() / 1000) + Math.random(),
            purchaseOrderId: orderId,
            productId: parseInt(itemData.productId),
            batchNumber: null,
            quantity: parseInt(itemData.quantity),
            unitPrice: parseFloat(itemData.unitPrice),
            gstRate: parseFloat(itemData.gstRate) || 0,
            discountPercent: 0,
            discountAmount: parseFloat(itemData.discountAmount) || 0,
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            receivedQuantity: 0,
            stores: itemData.stores || [],
            createdAt: new Date()
        };
        
        createdItems.push(newItem);
    });
    
    // Insert all items
    itemsDB.insert(createdItems, function(err, items) {
        if (err) {
            return callback(err);
        }
        
        callback(null, items);
    });
}