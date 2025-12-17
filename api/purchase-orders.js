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
    "purchase-orders.db",
);

app.use(bodyParser.json());

module.exports = app;

let purchaseOrdersDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

purchaseOrdersDB.ensureIndex({ fieldName: "_id", unique: true });
purchaseOrdersDB.ensureIndex({ fieldName: "orderNumber" });
purchaseOrdersDB.ensureIndex({ fieldName: "supplierId" });
purchaseOrdersDB.ensureIndex({ fieldName: "status" });

/**
 * GET endpoint: Get welcome message for Purchase Orders API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Purchase Orders API");
});

/**
 * GET endpoint: Retrieve purchase orders with pagination.
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
    if (req.query.supplierId) {
        query.supplierId = parseInt(req.query.supplierId);
    }
    if (req.query.status) {
        query.status = validator.escape(req.query.status);
    }
    if (req.query.startDate && req.query.endDate) {
        query.orderDate = {
            $gte: validator.escape(req.query.startDate),
            $lte: validator.escape(req.query.endDate)
        };
    }
    
    purchaseOrdersDB.find(query)
        .sort({ orderDate: -1 })
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
            purchaseOrdersDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    purchaseOrders: docs,
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
 * POST endpoint: Create new purchase order.
 *
 * @param {Object} req request object with purchase order data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.supplierId || !req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID and items array are required fields.",
        });
    }
    
    // Validate items
    for (let i = 0; i < req.body.items.length; i++) {
        const item = req.body.items[i];
        if (!item.productId || !item.quantity || !item.unitPrice) {
            return res.status(400).json({
                error: "Bad Request",
                message: `Item ${i + 1} is missing required fields (productId, quantity, unitPrice).`,
            });
        }
    }
    
    // Check if supplier exists
    const Datastore = require("@seald-io/nedb");
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
    
    suppliersDB.findOne({ _id: parseInt(req.body.supplierId) }, function (err, supplier) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!supplier) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier not found.",
            });
        }
        
        // Generate unique order number
        const orderNumber = generateOrderNumber();
        
        // Calculate totals
        let subtotal = 0;
        let totalGst = 0;
        
        req.body.items.forEach(function(item) {
            const itemTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
            const itemGst = itemTotal * (parseFloat(item.gstRate || 0) / 100);
            subtotal += itemTotal;
            totalGst += itemGst;
        });
        
        const discountAmount = parseFloat(req.body.discountAmount) || 0;
        const totalAmount = subtotal + totalGst - discountAmount;
        
        const newPurchaseOrder = {
            _id: Math.floor(Date.now() / 1000),
            orderNumber: orderNumber,
            supplierId: parseInt(req.body.supplierId),
            orderDate: req.body.orderDate || new Date().toISOString().split('T')[0],
            expectedDeliveryDate: req.body.expectedDeliveryDate || null,
            status: 'PENDING',
            subtotal: parseFloat(subtotal.toFixed(2)),
            gstAmount: parseFloat(totalGst.toFixed(2)),
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            discountAmount: parseFloat(discountAmount.toFixed(2)),
            notes: req.body.notes ? validator.escape(req.body.notes) : null,
            createdBy: req.body.createdBy ? parseInt(req.body.createdBy) : null,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        purchaseOrdersDB.insert(newPurchaseOrder, function (err, purchaseOrder) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Create purchase order items
            createPurchaseOrderItems(purchaseOrder._id, req.body.items, function(err, items) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to create purchase order items.",
                    });
                }
                
                res.status(201).json({
                    ...purchaseOrder,
                    items: items
                });
            });
        });
    });
});

/**
 * GET endpoint: Get specific purchase order by ID.
 *
 * @param {Object} req request object with purchase order ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order ID is required.",
        });
    }
    
    const orderId = parseInt(req.params.id);
    
    purchaseOrdersDB.findOne({ _id: orderId }, function (err, purchaseOrder) {
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
        
        // Get purchase order items
        getPurchaseOrderItems(orderId, function(err, items) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve purchase order items.",
                });
            }
            
            res.json({
                ...purchaseOrder,
                items: items
            });
        });
    });
});

/**
 * PUT endpoint: Update purchase order.
 *
 * @param {Object} req request object with updated purchase order data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order ID is required.",
        });
    }
    
    const orderId = parseInt(req.params.id);
    
    // Check if purchase order exists
    purchaseOrdersDB.findOne({ _id: orderId }, function (err, existingOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order not found.",
            });
        }
        
        // Cannot update received or cancelled orders
        if (existingOrder.status === 'RECEIVED' || existingOrder.status === 'CANCELLED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot update a purchase order that has been received or cancelled.",
            });
        }
        
        // Validate items if provided
        if (req.body.items && Array.isArray(req.body.items)) {
            for (let i = 0; i < req.body.items.length; i++) {
                const item = req.body.items[i];
                if (!item.productId || !item.quantity || !item.unitPrice) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: `Item ${i + 1} is missing required fields (productId, quantity, unitPrice).`,
                    });
                }
            }
        }
        
        // Calculate totals if items are provided
        let subtotal = existingOrder.subtotal;
        let totalGst = existingOrder.gstAmount;
        let totalAmount = existingOrder.totalAmount;
        
        if (req.body.items && Array.isArray(req.body.items)) {
            subtotal = 0;
            totalGst = 0;
            
            req.body.items.forEach(function(item) {
                const itemTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
                const itemGst = itemTotal * (parseFloat(item.gstRate || 0) / 100);
                subtotal += itemTotal;
                totalGst += itemGst;
            });
            
            const discountAmount = parseFloat(req.body.discountAmount) || existingOrder.discountAmount;
            totalAmount = subtotal + totalGst - discountAmount;
        }
        
        const updatedOrder = {
            supplierId: req.body.supplierId !== undefined ? parseInt(req.body.supplierId) : existingOrder.supplierId,
            orderDate: req.body.orderDate !== undefined ? validator.escape(req.body.orderDate) : existingOrder.orderDate,
            expectedDeliveryDate: req.body.expectedDeliveryDate !== undefined ? validator.escape(req.body.expectedDeliveryDate) : existingOrder.expectedDeliveryDate,
            status: req.body.status !== undefined ? validator.escape(req.body.status) : existingOrder.status,
            subtotal: parseFloat(subtotal.toFixed(2)),
            gstAmount: parseFloat(totalGst.toFixed(2)),
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            discountAmount: req.body.discountAmount !== undefined ? parseFloat(req.body.discountAmount) : existingOrder.discountAmount,
            notes: req.body.notes !== undefined ? validator.escape(req.body.notes) : existingOrder.notes,
            updatedAt: new Date()
        };
        
        purchaseOrdersDB.update({ _id: orderId }, { $set: updatedOrder }, {}, function (err, numReplaced) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Update items if provided
            if (req.body.items && Array.isArray(req.body.items)) {
                // Remove existing items
                deletePurchaseOrderItems(orderId, function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to update purchase order items.",
                        });
                    }
                    
                    // Create new items
                    createPurchaseOrderItems(orderId, req.body.items, function(err, items) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "Failed to create purchase order items.",
                            });
                        }
                        
                        res.json({
                            ...updatedOrder,
                            _id: orderId,
                            items: items
                        });
                    });
                });
            } else {
                getPurchaseOrderItems(orderId, function(err, items) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to retrieve purchase order items.",
                        });
                    }
                    
                    res.json({
                        ...updatedOrder,
                        _id: orderId,
                        items: items
                    });
                });
            }
        });
    });
});

/**
 * DELETE endpoint: Delete purchase order.
 *
 * @param {Object} req request object with purchase order ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order ID is required.",
        });
    }
    
    const orderId = parseInt(req.params.id);
    
    // Check if purchase order exists
    purchaseOrdersDB.findOne({ _id: orderId }, function (err, purchaseOrder) {
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
        
        // Cannot delete received orders
        if (purchaseOrder.status === 'RECEIVED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete a purchase order that has been received. Cancel it instead.",
            });
        }
        
        // Delete purchase order items first
        deletePurchaseOrderItems(orderId, function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to delete purchase order items.",
                });
            }
            
            // Delete purchase order
            purchaseOrdersDB.remove({ _id: orderId }, function (err, numRemoved) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({ message: "Purchase order deleted successfully." });
            });
        });
    });
});

/**
 * POST endpoint: Mark purchase order as received.
 *
 * @param {Object} req request object with purchase order ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/:id/receive", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order ID is required.",
        });
    }
    
    const orderId = parseInt(req.params.id);
    
    // Check if purchase order exists
    purchaseOrdersDB.findOne({ _id: orderId }, function (err, purchaseOrder) {
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
        
        if (purchaseOrder.status === 'RECEIVED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Purchase order has already been received.",
            });
        }
        
        if (purchaseOrder.status === 'CANCELLED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot receive a cancelled purchase order.",
            });
        }
        
        // Update status to received
        purchaseOrdersDB.update(
            { _id: orderId },
            { 
                $set: {
                    status: 'RECEIVED',
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
                
                // Update inventory with received items
               updateInventoryWithReceivedItems(orderId, function(err) {
                   if (err) {
                       console.error(err);
                       return res.status(500).json({
                           error: "Internal Server Error",
                           message: "Failed to update inventory with received items.",
                       });
                   }
                   
                   // Create supplier invoice
                   createSupplierInvoice(purchaseOrder, function(err) {
                       if (err) {
                           console.error(err);
                           // Don't fail the operation if invoice creation fails, just log it
                           console.error("Failed to create supplier invoice:", err);
                       }
                       
                       res.json({ message: "Purchase order marked as received successfully." });
                   });
               });
            }
        );
    });
});

/**
 * POST endpoint: Cancel purchase order.
 *
 * @param {Object} req request object with purchase order ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/:id/cancel", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Purchase order ID is required.",
        });
    }
    
    const orderId = parseInt(req.params.id);
    
    // Check if purchase order exists
    purchaseOrdersDB.findOne({ _id: orderId }, function (err, purchaseOrder) {
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
        
        if (purchaseOrder.status === 'CANCELLED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Purchase order has already been cancelled.",
            });
        }
        
        if (purchaseOrder.status === 'RECEIVED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot cancel a purchase order that has been received.",
            });
        }
        
        // Update status to cancelled
        purchaseOrdersDB.update(
            { _id: orderId },
            { 
                $set: {
                    status: 'CANCELLED',
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
                
                res.json({ message: "Purchase order cancelled successfully." });
            }
        );
    });
});

/**
 * GET endpoint: Get orders by status.
 *
 * @param {Object} req request object with status as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/status/:status", function (req, res) {
    if (!req.params.status) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Status is required.",
        });
    }
    
    const status = validator.escape(req.params.status);
    
    purchaseOrdersDB.find({ status: status })
        .sort({ orderDate: -1 })
        .exec(function (err, orders) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(orders);
        });
});

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
    
    return `PO${year}${month}${day}${time.toString().slice(-6)}`;
}

/**
 * Helper function to create purchase order items
 *
 * @param {number} orderId purchase order ID
 * @param {Array} items array of items
 * @param {function} callback callback function
 * @returns {void}
 */
function createPurchaseOrderItems(orderId, items, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const itemsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "purchase-order-items.db",
    );
    
    const itemsDB = new Datastore({
        filename: itemsDbPath,
        autoload: true,
    });
    
    const createdItems = [];
    
    async.eachSeries(items, function(itemData, callback) {
        const itemTotal = parseFloat(itemData.unitPrice) * parseInt(itemData.quantity);
        const itemGst = itemTotal * (parseFloat(itemData.gstRate || 0) / 100);
        const totalPrice = itemTotal + itemGst - (parseFloat(itemData.discountAmount) || 0);
        
        const newItem = {
            _id: Math.floor(Date.now() / 1000) + Math.random(),
            purchaseOrderId: orderId,
            productId: parseInt(itemData.productId),
            batchNumber: itemData.batchNumber ? validator.escape(itemData.batchNumber) : null,
            quantity: parseInt(itemData.quantity),
            unitPrice: parseFloat(itemData.unitPrice),
            gstRate: parseFloat(itemData.gstRate) || 0,
            discountPercent: parseFloat(itemData.discountPercent) || 0,
            discountAmount: parseFloat(itemData.discountAmount) || 0,
            totalPrice: parseFloat(totalPrice.toFixed(2)),
            receivedQuantity: 0,
            createdAt: new Date()
        };
        
        itemsDB.insert(newItem, function(err, item) {
            if (err) {
                return callback(err);
            }
            
            createdItems.push(item);
            callback();
        });
    }, function(err) {
        if (err) {
            return callback(err);
        }
        
        callback(null, createdItems);
    });
}

/**
 * Helper function to get purchase order items
 *
 * @param {number} orderId purchase order ID
 * @param {function} callback callback function
 * @returns {void}
 */
function getPurchaseOrderItems(orderId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const itemsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "purchase-order-items.db",
    );
    
    const itemsDB = new Datastore({
        filename: itemsDbPath,
        autoload: true,
    });
    
    itemsDB.find({ purchaseOrderId: orderId })
        .sort({ createdAt: 1 })
        .exec(function(err, items) {
            if (err) {
                return callback(err);
            }
            
            callback(null, items);
        });
}

/**
 * Helper function to delete purchase order items
 *
 * @param {number} orderId purchase order ID
 * @param {function} callback callback function
 * @returns {void}
 */
function deletePurchaseOrderItems(orderId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const itemsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "purchase-order-items.db",
    );
    
    const itemsDB = new Datastore({
        filename: itemsDbPath,
        autoload: true,
    });
    
    itemsDB.remove({ purchaseOrderId: orderId }, { multi: true }, function(err, numRemoved) {
        if (err) {
            return callback(err);
        }
        
        callback(null);
    });
}

/**
 * Helper function to update inventory with received items
 *
 * @param {number} orderId purchase order ID
 * @param {function} callback callback function
 * @returns {void}
 */
function updateInventoryWithReceivedItems(orderId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get purchase order items
    const itemsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "purchase-order-items.db",
    );
    
    const itemsDB = new Datastore({
        filename: itemsDbPath,
        autoload: true,
    });
    
    itemsDB.find({ purchaseOrderId: orderId }, function(err, items) {
        if (err) {
            return callback(err);
        }
        
        // Update inventory quantities for each item
        async.eachSeries(items, function(item, callback) {
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
            
            inventoryDB.findOne({ _id: item.productId }, function(err, product) {
                if (err) {
                    return callback(err);
                }
                
                if (!product) {
                    return callback(new Error("Product not found: " + item.productId));
                }
                
                const newQuantity = parseInt(product.quantity || 0) + parseInt(item.quantity);
                
                inventoryDB.update(
                    { _id: item.productId },
                    { $set: { quantity: newQuantity } },
                    {},
                    function(err, numReplaced) {
                        if (err) {
                            return callback(err);
                        }
                        
                        // Create or update batch if batch number is provided
                        if (item.batchNumber) {
                            updateOrCreateBatch(item, product, callback);
                        } else {
                            callback();
                        }
                    }
                );
            });
        }, function(err) {
            if (err) {
                return callback(err);
            }
            
            callback(null);
        });
    });
}

/**
 * Helper function to update or create batch
 *
 * @param {Object} item purchase order item
 * @param {Object} product product object
 * @param {function} callback callback function
 * @returns {void}
 */
function updateOrCreateBatch(item, product, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
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
    
    // Check if batch already exists
    batchesDB.findOne({
        productId: item.productId,
        batchNumber: item.batchNumber
    }, function(err, existingBatch) {
        if (err) {
            return callback(err);
        }
        
        if (existingBatch) {
            // Update existing batch quantity
            const newQuantity = existingBatch.currentQuantity + item.quantity;
            batchesDB.update(
                { _id: existingBatch._id },
                { $set: { currentQuantity: newQuantity } },
                {},
                function(err, numReplaced) {
                    if (err) {
                        return callback(err);
                    }
                    
                    callback();
                }
            );
        } else {
            // Create new batch
            const newBatch = {
                _id: Math.floor(Date.now() / 1000) + Math.random(),
                productId: item.productId,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate || null,
                manufacturingDate: item.manufacturingDate || null,
                initialQuantity: item.quantity,
                currentQuantity: item.quantity,
                costPrice: item.unitPrice,
                sellingPrice: product.price || item.unitPrice,
                supplierId: null,
                rackLocation: null,
                shelfLocation: null,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            batchesDB.insert(newBatch, function(err, batch) {
                if (err) {
                    return callback(err);
                }
                
                callback();
            });
        }
    });
}

/**
 * Helper function to create supplier invoice
 *
 * @param {Object} purchaseOrder purchase order object
 * @param {function} callback callback function
 * @returns {void}
 */
function createSupplierInvoice(purchaseOrder, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Get purchase order items
    const itemsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "purchase-order-items.db",
    );
    
    const itemsDB = new Datastore({
        filename: itemsDbPath,
        autoload: true,
    });
    
    itemsDB.find({ purchaseOrderId: purchaseOrder._id }, function(err, items) {
        if (err) {
            return callback(err);
        }
        
        // Create supplier invoice
        const supplierInvoicesDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "supplier-invoices.db",
        );
        
        const supplierInvoicesDB = new Datastore({
            filename: supplierInvoicesDbPath,
            autoload: true,
        });
        
        // Generate unique invoice number
        const invoiceNumber = generateInvoiceNumber('SUPPLIER');
        
        // Calculate due date based on payment terms
        let dueDate = new Date();
        const supplierAccountsDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "supplier-accounts.db",
        );
        
        const supplierAccountsDB = new Datastore({
            filename: supplierAccountsDbPath,
            autoload: true,
        });
        
        supplierAccountsDB.findOne({ supplierId: purchaseOrder.supplierId }, function(err, account) {
            if (err) {
                return callback(err);
            }
            
            if (account && account.paymentTermId) {
                // Get payment terms
                const paymentTermsDbPath = path.join(
                    process.env.APPDATA,
                    process.env.APPNAME,
                    "server",
                    "databases",
                    "payment-terms.db",
                );
                
                const paymentTermsDB = new Datastore({
                    filename: paymentTermsDbPath,
                    autoload: true,
                });
                
                paymentTermsDB.findOne({ _id: account.paymentTermId }, function(err, paymentTerm) {
                    if (!err && paymentTerm) {
                        dueDate.setDate(dueDate.getDate() + paymentTerm.days);
                    }
                    
                    createInvoice();
                });
            } else {
                // Default 30 days
                dueDate.setDate(dueDate.getDate() + 30);
                createInvoice();
            }
            
            function createInvoice() {
                const newInvoice = {
                    _id: Math.floor(Date.now() / 1000),
                    invoiceNumber: invoiceNumber,
                    purchaseOrderId: purchaseOrder._id,
                    supplierId: purchaseOrder.supplierId,
                    invoiceDate: new Date().toISOString().split('T')[0],
                    dueDate: dueDate.toISOString().split('T')[0],
                    subtotal: purchaseOrder.subtotal,
                    gstAmount: purchaseOrder.gstAmount,
                    totalAmount: purchaseOrder.totalAmount,
                    discountAmount: purchaseOrder.discountAmount,
                    balanceAmount: purchaseOrder.totalAmount,
                    status: 'PENDING',
                    notes: purchaseOrder.notes,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                
                supplierInvoicesDB.insert(newInvoice, function (err, invoice) {
                    if (err) {
                        return callback(err);
                    }
                    
                    // Create invoice items
                    createSupplierInvoiceItems(invoice._id, items, function(err) {
                        if (err) {
                            return callback(err);
                        }
                        
                        // Update supplier account balance
                        updateSupplierAccountBalance(purchaseOrder.supplierId, purchaseOrder.totalAmount, function(err) {
                            if (err) {
                                console.error("Failed to update supplier account balance:", err);
                            }
                            
                            callback(null);
                        });
                    });
                });
            }
        });
    });
}

/**
 * Helper function to create supplier invoice items
 *
 * @param {number} invoiceId invoice ID
 * @param {Array} items array of items
 * @param {function} callback callback function
 * @returns {void}
 */
function createSupplierInvoiceItems(invoiceId, items, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const itemsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "supplier-invoice-items.db",
    );
    
    const itemsDB = new Datastore({
        filename: itemsDbPath,
        autoload: true,
    });
    
    const createdItems = [];
    
    items.forEach(function(item) {
        const newItem = {
            _id: Math.floor(Date.now() / 1000) + Math.random(),
            supplierInvoiceId: invoiceId,
            productId: item.productId,
            description: item.description || null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            gstRate: item.gstRate || 0,
            discountAmount: item.discountAmount || 0,
            totalPrice: item.totalPrice,
            createdAt: new Date()
        };
        
        createdItems.push(newItem);
    });
    
    // Insert all items
    itemsDB.insert(createdItems, function(err, items) {
        if (err) {
            return callback(err);
        }
        
        callback(null);
    });
}

/**
 * Helper function to update supplier account balance
 *
 * @param {number} supplierId supplier ID
 * @param {number} amount amount to add to balance
 * @param {function} callback callback function
 * @returns {void}
 */
function updateSupplierAccountBalance(supplierId, amount, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const supplierAccountsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "supplier-accounts.db",
    );
    
    const supplierAccountsDB = new Datastore({
        filename: supplierAccountsDbPath,
        autoload: true,
    });
    
    // Check if account exists
    supplierAccountsDB.findOne({ supplierId: supplierId }, function(err, account) {
        if (err) {
            return callback(err);
        }
        
        if (account) {
            // Update existing account
            supplierAccountsDB.update(
                { supplierId: supplierId },
                {
                    $inc: { balance: amount },
                    $set: { updatedAt: new Date() }
                },
                {},
                function(err, numReplaced) {
                    if (err) {
                        return callback(err);
                    }
                    
                    callback(null);
                }
            );
        } else {
            // Create new account
            const newAccount = {
                _id: Math.floor(Date.now() / 1000),
                supplierId: supplierId,
                creditLimit: 0,
                balance: amount,
                paymentTermId: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            supplierAccountsDB.insert(newAccount, function(err, account) {
                if (err) {
                    return callback(err);
                }
                
                callback(null);
            });
        }
    });
}

/**
 * Helper function to generate unique invoice number
 *
 * @param {string} type invoice type (SUPPLIER/CUSTOMER)
 * @returns {string} unique invoice number
 */
function generateInvoiceNumber(type) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = date.getTime();
    
    const prefix = type === 'SUPPLIER' ? 'SINV' : 'CINV';
    return `${prefix}${year}${month}${day}${time.toString().slice(-6)}`;
}

module.exports.generateOrderNumber = generateOrderNumber;