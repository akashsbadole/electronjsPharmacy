const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const appName = process.env.APPNAME || "PharmaSoft";
const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');

// Database paths
const deliveryOrdersDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "delivery-orders.db"
);

const deliveryStatusUpdatesDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "delivery-status-updates.db"
);

router.use(bodyParser.json());

module.exports = router;

// Initialize databases
let deliveryOrdersDB = new Datastore({
    filename: deliveryOrdersDbPath,
    autoload: true,
});

let deliveryStatusUpdatesDB = new Datastore({
    filename: deliveryStatusUpdatesDbPath,
    autoload: true,
});

// Ensure indexes
deliveryOrdersDB.ensureIndex({ fieldName: "_id", unique: true });
deliveryOrdersDB.ensureIndex({ fieldName: "transaction_id", unique: true });
deliveryOrdersDB.ensureIndex({ fieldName: "customer_id" });
deliveryOrdersDB.ensureIndex({ fieldName: "delivery_status" });
deliveryOrdersDB.ensureIndex({ fieldName: "driver_id" });
deliveryOrdersDB.ensureIndex({ fieldName: "store_id" });

deliveryStatusUpdatesDB.ensureIndex({ fieldName: "_id", unique: true });
deliveryStatusUpdatesDB.ensureIndex({ fieldName: "delivery_order_id" });

/**
 * GET endpoint: Get the welcome message for the Delivery Orders API.
 */
router.get("/", function (req, res) {
    res.send("Delivery Orders API");
});

/**
 * GET endpoint: Get all delivery orders with optional filtering
 */
router.get("/all", function (req, res) {
    const query = {};
    
    // Add filters if provided
    if (req.query.status) {
        query.delivery_status = req.query.status;
    }
    
    if (req.query.driver_id) {
        query.driver_id = parseInt(req.query.driver_id);
    }
    
    if (req.query.store_id) {
        query.store_id = parseInt(req.query.store_id);
    }
    
    if (req.query.customer_id) {
        query.customer_id = req.query.customer_id;
    }
    
    // Date range filter
    if (req.query.start_date && req.query.end_date) {
        query.created_at = {
            $gte: new Date(req.query.start_date),
            $lte: new Date(req.query.end_date)
        };
    }
    
    deliveryOrdersDB.find(query).sort({ created_at: -1 }).exec(function (err, docs) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        res.send(docs);
    });
});

/**
 * GET endpoint: Get a specific delivery order by ID
 */
router.get("/:id", function (req, res) {
    deliveryOrdersDB.findOne({ _id: req.params.id }, function (err, doc) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!doc) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery order not found.",
            });
        }
        
        res.send(doc);
    });
});

/**
 * GET endpoint: Get delivery order by transaction ID
 */
router.get("/transaction/:transactionId", function (req, res) {
    deliveryOrdersDB.findOne({ transaction_id: req.params.transactionId }, function (err, doc) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!doc) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery order not found for this transaction.",
            });
        }
        
        res.send(doc);
    });
});

/**
 * POST endpoint: Create a new delivery order
 */
router.post("/new", function (req, res) {
    const newDeliveryOrder = req.body;
    
    // Validate required fields
    if (!newDeliveryOrder.transaction_id || !newDeliveryOrder.customer_id || !newDeliveryOrder.store_id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transaction ID, customer ID, and store ID are required.",
        });
    }
    
    if (!newDeliveryOrder.delivery_address) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Delivery address is required.",
        });
    }
    
    // Check if delivery order already exists for this transaction
    deliveryOrdersDB.findOne({ transaction_id: newDeliveryOrder.transaction_id }, function (err, existingOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (existingOrder) {
            return res.status(409).json({
                error: "Conflict",
                message: "Delivery order already exists for this transaction.",
            });
        }
        
        // Set default values
        newDeliveryOrder.delivery_status = newDeliveryOrder.delivery_status || "PENDING";
        newDeliveryOrder.priority_level = newDeliveryOrder.priority_level || 1;
        newDeliveryOrder.delivery_charge = newDeliveryOrder.delivery_charge || 0.00;
        newDeliveryOrder.distance_km = newDeliveryOrder.distance_km || 0;
        newDeliveryOrder.created_at = new Date();
        newDeliveryOrder.updated_at = new Date();
        newDeliveryOrder.sync_version = 1;
        
        // Generate unique ID
        newDeliveryOrder._id = "DEL-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
        
        deliveryOrdersDB.insert(newDeliveryOrder, function (err, deliveryOrder) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Create initial status update
            const statusUpdate = {
                _id: "STATUS-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
                delivery_order_id: deliveryOrder._id,
                status: "PENDING",
                notes: "Delivery order created",
                update_time: new Date(),
                updated_by: null
            };
            
            deliveryStatusUpdatesDB.insert(statusUpdate, function (err) {
                if (err) {
                    console.error("Failed to create status update:", err);
                }
            });
            
            res.status(201).send(deliveryOrder);
        });
    });
});

/**
 * PUT endpoint: Update a delivery order
 */
router.put("/:id", function (req, res) {
    const orderId = req.params.id;
    const updatedOrder = req.body;
    
    // Don't allow updating certain fields
    delete updatedOrder._id;
    delete updatedOrder.transaction_id;
    delete updatedOrder.created_at;
    
    // Update timestamp and version
    updatedOrder.updated_at = new Date();
    updatedOrder.sync_version = (updatedOrder.sync_version || 1) + 1;
    
    deliveryOrdersDB.update(
        { _id: orderId },
        { $set: updatedOrder },
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
                    message: "Delivery order not found.",
                });
            }
            
            // Create status update if status changed
            if (updatedOrder.delivery_status) {
                const statusUpdate = {
                    _id: "STATUS-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
                    delivery_order_id: orderId,
                    status: updatedOrder.delivery_status,
                    notes: updatedOrder.status_notes || "Status updated",
                    update_time: new Date(),
                    updated_by: updatedOrder.driver_id || null
                };
                
                deliveryStatusUpdatesDB.insert(statusUpdate, function (err) {
                    if (err) {
                        console.error("Failed to create status update:", err);
                    }
                });
            }
            
            res.sendStatus(200);
        }
    );
});

/**
 * DELETE endpoint: Cancel a delivery order
 */
router.delete("/:id", function (req, res) {
    const orderId = req.params.id;
    
    deliveryOrdersDB.update(
        { _id: orderId },
        { 
            $set: { 
                delivery_status: "CANCELLED",
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
                    message: "Delivery order not found.",
                });
            }
            
            // Create status update
            const statusUpdate = {
                _id: "STATUS-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
                delivery_order_id: orderId,
                status: "CANCELLED",
                notes: "Delivery order cancelled",
                update_time: new Date(),
                updated_by: null
            };
            
            deliveryStatusUpdatesDB.insert(statusUpdate, function (err) {
                if (err) {
                    console.error("Failed to create status update:", err);
                }
            });
            
            res.sendStatus(200);
        }
    );
});

/**
 * GET endpoint: Get status history for a delivery order
 */
router.get("/:id/status-history", function (req, res) {
    const orderId = req.params.id;
    
    deliveryStatusUpdatesDB.find({ delivery_order_id: orderId })
        .sort({ update_time: 1 })
        .exec(function (err, docs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.send(docs);
        });
});

/**
 * POST endpoint: Calculate delivery fee based on distance and other factors
 */
router.post("/calculate-fee", function (req, res) {
    const { distance_km, priority_level, store_id } = req.body;
    
    if (!distance_km || distance_km <= 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Valid distance in kilometers is required.",
        });
    }
    
    // Base fee calculation
    let baseFee = 25; // Base delivery fee
    let distanceFee = distance_km * 5; // ₹5 per km
    let priorityFee = 0;
    
    // Priority surcharge
    if (priority_level === 2) { // Urgent
        priorityFee = 50;
    } else if (priority_level === 3) { // Emergency
        priorityFee = 100;
    }
    
    const totalFee = baseFee + distanceFee + priorityFee;
    
    res.json({
        base_fee: baseFee,
        distance_fee: distanceFee,
        priority_fee: priorityFee,
        total_fee: parseFloat(totalFee.toFixed(2)),
        distance_km: distance_km,
        priority_level: priority_level || 1
    });
});

/**
 * GET endpoint: Get delivery statistics
 */
router.get("/stats/summary", function (req, res) {
    const storeId = req.query.store_id ? parseInt(req.query.store_id) : null;
    const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();
    
    const query = {
        created_at: { $gte: startDate, $lte: endDate }
    };
    
    if (storeId) {
        query.store_id = storeId;
    }
    
    deliveryOrdersDB.find(query, function (err, orders) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const stats = {
            total_orders: orders.length,
            pending_orders: orders.filter(o => o.delivery_status === "PENDING").length,
            assigned_orders: orders.filter(o => o.delivery_status === "ASSIGNED").length,
            picked_orders: orders.filter(o => o.delivery_status === "PICKED").length,
            in_transit_orders: orders.filter(o => o.delivery_status === "IN_TRANSIT").length,
            delivered_orders: orders.filter(o => o.delivery_status === "DELIVERED").length,
            cancelled_orders: orders.filter(o => o.delivery_status === "CANCELLED").length,
            failed_orders: orders.filter(o => o.delivery_status === "FAILED").length,
            total_revenue: orders.reduce((sum, o) => sum + (o.delivery_charge || 0), 0),
            average_delivery_time: 0, // Would need more complex calculation
            on_time_delivery_rate: 0 // Would need delivery time vs estimated time comparison
        };
        
        // Calculate on-time delivery rate
        const completedOrders = orders.filter(o => o.delivery_status === "DELIVERED");
        if (completedOrders.length > 0) {
            const onTimeOrders = completedOrders.filter(o => {
                if (!o.actual_delivery_time || !o.estimated_delivery_time) return true;
                return new Date(o.actual_delivery_time) <= new Date(o.estimated_delivery_time);
            });
            stats.on_time_delivery_rate = (onTimeOrders.length / completedOrders.length) * 100;
        }
        
        res.json(stats);
    });
});