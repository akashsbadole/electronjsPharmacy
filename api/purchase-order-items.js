const app = require("express")();
const server = require("http").Server(app);
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const validator = require("validator");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "purchase-order-items.db",
);

app.use(bodyParser.json());

module.exports = app;

let purchaseOrderItemsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

purchaseOrderItemsDB.ensureIndex({ fieldName: "_id", unique: true });
purchaseOrderItemsDB.ensureIndex({ fieldName: "purchaseOrderId" });
purchaseOrderItemsDB.ensureIndex({ fieldName: "productId" });

/**
 * GET endpoint: Get welcome message for Purchase Order Items API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Purchase Order Items API");
});

/**
 * GET endpoint: Retrieve purchase order items.
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
    let query = {};
    if (req.query.purchaseOrderId) {
        query.purchaseOrderId = parseInt(req.query.purchaseOrderId);
    }
    if (req.query.productId) {
        query.productId = parseInt(req.query.productId);
    }
    
    purchaseOrderItemsDB.find(query)
        .sort({ createdAt: 1 })
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
            purchaseOrderItemsDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    items: docs,
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
 * POST endpoint: Add items to purchase order.
 *
 * @param {Object} req request object with purchase order item data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.purchaseOrderId || !req.body.productId || !req.body.quantity || !req.body.unitPrice) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order ID, product ID, quantity, and unit price are required fields.",
        });
    }
    
    // Check if purchase order exists and is in a state that allows adding items
    const Datastore = require("@seald-io/nedb");
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
    
    purchaseOrdersDB.findOne({ _id: parseInt(req.body.purchaseOrderId) }, function (err, purchaseOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!purchaseOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order not found.",
            });
        }
        
        if (purchaseOrder.status === 'RECEIVED' || purchaseOrder.status === 'CANCELLED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot add items to a purchase order that has been received or cancelled.",
            });
        }
        
        // Check if product exists
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
        
        inventoryDB.findOne({ _id: parseInt(req.body.productId) }, function (err, product) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!product) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Product not found.",
                });
            }
            
            // Calculate item totals
            const itemTotal = parseFloat(req.body.unitPrice) * parseInt(req.body.quantity);
            const itemGst = itemTotal * (parseFloat(req.body.gstRate || 0) / 100);
            const discountAmount = (itemTotal * (parseFloat(req.body.discountPercent || 0) / 100));
            const totalPrice = itemTotal + itemGst - discountAmount;
            
            const newItem = {
                _id: Math.floor(Date.now() / 1000),
                purchaseOrderId: parseInt(req.body.purchaseOrderId),
                productId: parseInt(req.body.productId),
                batchNumber: req.body.batchNumber ? validator.escape(req.body.batchNumber) : null,
                quantity: parseInt(req.body.quantity),
                unitPrice: parseFloat(req.body.unitPrice),
                gstRate: parseFloat(req.body.gstRate) || 0,
                discountPercent: parseFloat(req.body.discountPercent) || 0,
                discountAmount: parseFloat(discountAmount.toFixed(2)),
                totalPrice: parseFloat(totalPrice.toFixed(2)),
                receivedQuantity: 0,
                createdAt: new Date()
            };
            
            purchaseOrderItemsDB.insert(newItem, function (err, item) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Update purchase order totals
                updatePurchaseOrderTotals(parseInt(req.body.purchaseOrderId), function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to update purchase order totals.",
                        });
                    }
                    
                    res.status(201).json(item);
                });
            });
        });
    });
});

/**
 * PUT endpoint: Update purchase order item.
 *
 * @param {Object} req request object with updated purchase order item data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order item ID is required.",
        });
    }
    
    const itemId = parseInt(req.params.id);
    
    // Check if item exists
    purchaseOrderItemsDB.findOne({ _id: itemId }, function (err, existingItem) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingItem) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order item not found.",
            });
        }
        
        // Check if purchase order allows updates
        const Datastore = require("@seald-io/nedb");
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
        
        purchaseOrdersDB.findOne({ _id: existingItem.purchaseOrderId }, function (err, purchaseOrder) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (purchaseOrder.status === 'RECEIVED' || purchaseOrder.status === 'CANCELLED') {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Cannot update items in a purchase order that has been received or cancelled.",
                });
            }
            
            // Validate quantity if provided
            if (req.body.quantity !== undefined && req.body.quantity < existingItem.receivedQuantity) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Cannot set quantity less than already received quantity.",
                });
            }
            
            // Calculate new totals
            const quantity = req.body.quantity !== undefined ? parseInt(req.body.quantity) : existingItem.quantity;
            const unitPrice = req.body.unitPrice !== undefined ? parseFloat(req.body.unitPrice) : existingItem.unitPrice;
            const gstRate = req.body.gstRate !== undefined ? parseFloat(req.body.gstRate) : existingItem.gstRate;
            const discountPercent = req.body.discountPercent !== undefined ? parseFloat(req.body.discountPercent) : existingItem.discountPercent;
            
            const itemTotal = unitPrice * quantity;
            const itemGst = itemTotal * (gstRate / 100);
            const discountAmount = (itemTotal * (discountPercent / 100));
            const totalPrice = itemTotal + itemGst - discountAmount;
            
            const updatedItem = {
                productId: req.body.productId !== undefined ? parseInt(req.body.productId) : existingItem.productId,
                batchNumber: req.body.batchNumber !== undefined ? validator.escape(req.body.batchNumber) : existingItem.batchNumber,
                quantity: quantity,
                unitPrice: unitPrice,
                gstRate: gstRate,
                discountPercent: discountPercent,
                discountAmount: parseFloat(discountAmount.toFixed(2)),
                totalPrice: parseFloat(totalPrice.toFixed(2)),
                updatedAt: new Date()
            };
            
            purchaseOrderItemsDB.update({ _id: itemId }, { $set: updatedItem }, {}, function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Update purchase order totals
                updatePurchaseOrderTotals(existingItem.purchaseOrderId, function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to update purchase order totals.",
                        });
                    }
                    
                    res.json({ ...updatedItem, _id: itemId });
                });
            });
        });
    });
});

/**
 * DELETE endpoint: Delete purchase order item.
 *
 * @param {Object} req request object with purchase order item ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order item ID is required.",
        });
    }
    
    const itemId = parseInt(req.params.id);
    
    // Check if item exists
    purchaseOrderItemsDB.findOne({ _id: itemId }, function (err, existingItem) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingItem) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order item not found.",
            });
        }
        
        // Check if purchase order allows deletion
        const Datastore = require("@seald-io/nedb");
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
        
        purchaseOrdersDB.findOne({ _id: existingItem.purchaseOrderId }, function (err, purchaseOrder) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (purchaseOrder.status === 'RECEIVED' || purchaseOrder.status === 'CANCELLED') {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Cannot delete items from a purchase order that has been received or cancelled.",
                });
            }
            
            if (existingItem.receivedQuantity > 0) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Cannot delete an item that has already been received.",
                });
            }
            
            // Delete the item
            purchaseOrderItemsDB.remove({ _id: itemId }, function (err, numRemoved) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Update purchase order totals
                updatePurchaseOrderTotals(existingItem.purchaseOrderId, function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to update purchase order totals.",
                        });
                    }
                    
                    res.json({ message: "Purchase order item deleted successfully." });
                });
            });
        });
    });
});

/**
 * GET endpoint: Get items for a purchase order.
 *
 * @param {Object} req request object with purchase order ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/order/:orderId", function (req, res) {
    if (!req.params.orderId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order ID is required.",
        });
    }
    
    const orderId = parseInt(req.params.orderId);
    
    purchaseOrderItemsDB.find({ purchaseOrderId: orderId })
        .sort({ createdAt: 1 })
        .exec(function (err, items) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(items);
        });
});

/**
 * Helper function to update purchase order totals
 *
 * @param {number} orderId purchase order ID
 * @param {function} callback callback function
 * @returns {void}
 */
function updatePurchaseOrderTotals(orderId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get all items for the purchase order
    purchaseOrderItemsDB.find({ purchaseOrderId: orderId }, function (err, items) {
        if (err) {
            return callback(err);
        }
        
        let subtotal = 0;
        let totalGst = 0;
        let totalDiscount = 0;
        
        items.forEach(function(item) {
            const itemTotal = item.unitPrice * item.quantity;
            const itemGst = itemTotal * (item.gstRate / 100);
            
            subtotal += itemTotal;
            totalGst += itemGst;
            totalDiscount += item.discountAmount;
        });
        
        const totalAmount = subtotal + totalGst - totalDiscount;
        
        // Update purchase order with new totals
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
        
        purchaseOrdersDB.update(
            { _id: orderId },
            { 
                $set: {
                    subtotal: parseFloat(subtotal.toFixed(2)),
                    gstAmount: parseFloat(totalGst.toFixed(2)),
                    totalAmount: parseFloat(totalAmount.toFixed(2)),
                    updatedAt: new Date()
                }
            },
            {},
            function(err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                
                callback(null);
            }
        );
    });
}

module.exports.updatePurchaseOrderTotals = updatePurchaseOrderTotals;