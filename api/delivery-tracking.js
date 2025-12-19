const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;

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

const driversDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "drivers.db"
);

const driverLocationDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "driver-locations.db"
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

let driversDB = new Datastore({
    filename: driversDbPath,
    autoload: true,
});

let driverLocationDB = new Datastore({
    filename: driverLocationDbPath,
    autoload: true,
});

/**
 * GET endpoint: Get welcome message for the Delivery Tracking API.
 */
router.get("/", function (req, res) {
    res.send("Delivery Tracking API");
});

/**
 * GET endpoint: Get tracking information for a delivery order
 */
router.get("/order/:orderId", function (req, res) {
    const orderId = req.params.orderId;
    
    // Get delivery order
    deliveryOrdersDB.findOne({ _id: orderId }, function (err, deliveryOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!deliveryOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery order not found.",
            });
        }
        
        // Get status history
        deliveryStatusUpdatesDB.find({ delivery_order_id: orderId })
            .sort({ update_time: 1 })
            .exec(function (err, statusHistory) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get driver information if assigned
                if (deliveryOrder.driver_id) {
                    driversDB.findOne({ _id: deliveryOrder.driver_id }, function (err, driver) {
                        if (err) {
                            console.error(err);
                        }
                        
                        // Get driver location
                        driverLocationDB.findOne({ driver_id: deliveryOrder.driver_id }, function (err, driverLocation) {
                            if (err) {
                                console.error(err);
                            }
                            
                            const trackingInfo = {
                                delivery_order: deliveryOrder,
                                driver: driver || null,
                                driver_location: driverLocation || null,
                                status_history: statusHistory,
                                estimated_arrival_time: calculateETA(deliveryOrder, statusHistory),
                                tracking_url: generateTrackingURL(orderId)
                            };
                            
                            res.json(trackingInfo);
                        });
                    });
                } else {
                    const trackingInfo = {
                        delivery_order: deliveryOrder,
                        driver: null,
                        driver_location: null,
                        status_history: statusHistory,
                        estimated_arrival_time: calculateETA(deliveryOrder, statusHistory),
                        tracking_url: generateTrackingURL(orderId)
                    };
                    
                    res.json(trackingInfo);
                }
            });
    });
});

/**
 * GET endpoint: Get tracking information by transaction ID
 */
router.get("/transaction/:transactionId", function (req, res) {
    const transactionId = req.params.transactionId;
    
    deliveryOrdersDB.findOne({ transaction_id: transactionId }, function (err, deliveryOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!deliveryOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery order not found for this transaction.",
            });
        }
        
        // Redirect to order tracking
        res.redirect(`/api/delivery/tracking/order/${deliveryOrder._id}`);
    });
});

/**
 * POST endpoint: Update delivery status
 */
router.post("/status-update", function (req, res) {
    const { delivery_order_id, status, location_lat, location_lng, notes, photo_url, signature_url, updated_by } = req.body;
    
    if (!delivery_order_id || !status) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Delivery order ID and status are required.",
        });
    }
    
    // Validate status
    const validStatuses = ["PENDING", "ASSIGNED", "PICKED", "IN_TRANSIT", "DELIVERED", "CANCELLED", "FAILED"];
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid status value.",
        });
    }
    
    // Check if delivery order exists
    deliveryOrdersDB.findOne({ _id: delivery_order_id }, function (err, deliveryOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!deliveryOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery order not found.",
            });
        }
        
        // Update delivery order status
        const updateData = {
            delivery_status: status,
            updated_at: new Date()
        };
        
        if (status === "DELIVERED") {
            updateData.actual_delivery_time = new Date();
        }
        
        deliveryOrdersDB.update(
            { _id: delivery_order_id },
            { $set: updateData },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Create status update record
                const statusUpdate = {
                    _id: "STATUS-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
                    delivery_order_id: delivery_order_id,
                    status: status,
                    location_lat: location_lat || null,
                    location_lng: location_lng || null,
                    notes: notes || null,
                    photo_url: photo_url || null,
                    signature_url: signature_url || null,
                    updated_by: updated_by || null,
                    update_time: new Date()
                };
                
                deliveryStatusUpdatesDB.insert(statusUpdate, function (err, statusUpdateRecord) {
                    if (err) {
                        console.error("Failed to create status update:", err);
                    }
                    
                    res.status(201).json({
                        delivery_order_id: delivery_order_id,
                        status: status,
                        status_update: statusUpdateRecord,
                        message: "Status updated successfully"
                    });
                });
            }
        );
    });
});

/**
 * GET endpoint: Get real-time driver location for tracking
 */
router.get("/driver-location/:orderId", function (req, res) {
    const orderId = req.params.orderId;
    
    deliveryOrdersDB.findOne({ _id: orderId }, function (err, deliveryOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!deliveryOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery order not found.",
            });
        }
        
        if (!deliveryOrder.driver_id) {
            return res.status(404).json({
                error: "Not Found",
                message: "No driver assigned to this delivery order.",
            });
        }
        
        driverLocationDB.findOne({ driver_id: deliveryOrder.driver_id }, function (err, driverLocation) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!driverLocation) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Driver location not available.",
                });
            }
            
            res.json({
                driver_id: deliveryOrder.driver_id,
                latitude: driverLocation.latitude,
                longitude: driverLocation.longitude,
                last_location_update: driverLocation.last_location_update,
                delivery_status: deliveryOrder.delivery_status
            });
        });
    });
});

/**
 * GET endpoint: Get estimated arrival time for a delivery order
 */
router.get("/eta/:orderId", function (req, res) {
    const orderId = req.params.orderId;
    
    deliveryOrdersDB.findOne({ _id: orderId }, function (err, deliveryOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!deliveryOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery order not found.",
            });
        }
        
        deliveryStatusUpdatesDB.find({ delivery_order_id: orderId })
            .sort({ update_time: 1 })
            .exec(function (err, statusHistory) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                const eta = calculateETA(deliveryOrder, statusHistory);
                
                res.json({
                    delivery_order_id: orderId,
                    estimated_arrival_time: eta,
                    delivery_status: deliveryOrder.delivery_status,
                    current_location: getCurrentLocation(statusHistory)
                });
            });
    });
});

/**
 * GET endpoint: Get customer tracking page data
 */
router.get("/customer/:trackingCode", function (req, res) {
    const trackingCode = req.params.trackingCode;
    
    // Find delivery order by tracking code (using order ID as tracking code for simplicity)
    deliveryOrdersDB.findOne({ _id: trackingCode }, function (err, deliveryOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!deliveryOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Tracking code not found.",
            });
        }
        
        deliveryStatusUpdatesDB.find({ delivery_order_id: trackingCode })
            .sort({ update_time: 1 })
            .exec(function (err, statusHistory) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get customer information
                const customersDbPath = path.join(
                    appData,
                    appName,
                    "server",
                    "databases",
                    "customers.db"
                );
                
                const customersDB = new Datastore({
                    filename: customersDbPath,
                    autoload: true,
                });
                
                customersDB.findOne({ _id: deliveryOrder.customer_id }, function (err, customer) {
                    if (err) {
                        console.error(err);
                    }
                    
                    const customerTrackingData = {
                        tracking_code: trackingCode,
                        customer_name: customer ? customer.name : "Customer",
                        delivery_address: deliveryOrder.delivery_address,
                        delivery_status: deliveryOrder.delivery_status,
                        estimated_arrival_time: calculateETA(deliveryOrder, statusHistory),
                        status_history: statusHistory.filter(update => 
                            ["PENDING", "ASSIGNED", "PICKED", "IN_TRANSIT", "DELIVERED"].includes(update.status)
                        ),
                        delivery_instructions: deliveryOrder.delivery_instructions,
                        estimated_delivery_time: deliveryOrder.estimated_delivery_time
                    };
                    
                    res.json(customerTrackingData);
                });
            });
    });
});

/**
 * POST endpoint: Generate tracking link and send to customer
 */
router.post("/send-tracking", function (req, res) {
    const { delivery_order_id, customer_phone, customer_email, message } = req.body;
    
    if (!delivery_order_id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Delivery order ID is required.",
        });
    }
    
    deliveryOrdersDB.findOne({ _id: delivery_order_id }, function (err, deliveryOrder) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!deliveryOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery order not found.",
            });
        }
        
        const trackingURL = generateTrackingURL(delivery_order_id);
        
        // In a real implementation, this would send SMS/email
        // For now, just return the tracking information
        res.json({
            delivery_order_id: delivery_order_id,
            tracking_url: trackingURL,
            message: "Tracking link generated successfully",
            customer_phone: customer_phone || deliveryOrder.delivery_phone,
            customer_email: customer_email || null
        });
    });
});

/**
 * GET endpoint: Get tracking analytics
 */
router.get("/analytics", function (req, res) {
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
        
        const analytics = {
            total_deliveries: orders.length,
            on_time_deliveries: 0,
            delayed_deliveries: 0,
            average_delivery_time: 0,
            delivery_status_breakdown: {},
            daily_delivery_counts: {},
            hourly_delivery_patterns: {}
        };
        
        // Calculate delivery metrics
        const completedDeliveries = orders.filter(o => o.delivery_status === "DELIVERED");
        
        completedDeliveries.forEach(order => {
            if (order.actual_delivery_time && order.estimated_delivery_time) {
                const actual = new Date(order.actual_delivery_time);
                const estimated = new Date(order.estimated_delivery_time);
                
                if (actual <= estimated) {
                    analytics.on_time_deliveries++;
                } else {
                    analytics.delayed_deliveries++;
                }
            }
            
            // Daily breakdown
            const day = new Date(order.created_at).toISOString().split('T')[0];
            analytics.daily_delivery_counts[day] = (analytics.daily_delivery_counts[day] || 0) + 1;
            
            // Hourly breakdown
            const hour = new Date(order.created_at).getHours();
            analytics.hourly_delivery_patterns[hour] = (analytics.hourly_delivery_patterns[hour] || 0) + 1;
        });
        
        // Status breakdown
        orders.forEach(order => {
            analytics.delivery_status_breakdown[order.delivery_status] = 
                (analytics.delivery_status_breakdown[order.delivery_status] || 0) + 1;
        });
        
        // Calculate on-time delivery rate
        if (completedDeliveries.length > 0) {
            analytics.on_time_delivery_rate = (analytics.on_time_deliveries / completedDeliveries.length) * 100;
        } else {
            analytics.on_time_delivery_rate = 0;
        }
        
        res.json(analytics);
    });
});

// Helper function to calculate estimated arrival time
function calculateETA(deliveryOrder, statusHistory) {
    if (deliveryOrder.estimated_delivery_time) {
        return new Date(deliveryOrder.estimated_delivery_time);
    }
    
    // Simple ETA calculation based on status
    const now = new Date();
    const lastUpdate = statusHistory.length > 0 ? 
        new Date(statusHistory[statusHistory.length - 1].update_time) : now;
    
    let eta = new Date(lastUpdate);
    
    switch (deliveryOrder.delivery_status) {
        case "PENDING":
            eta.setHours(eta.getHours() + 2); // 2 hours from now
            break;
        case "ASSIGNED":
            eta.setHours(eta.getHours() + 1.5); // 1.5 hours from now
            break;
        case "PICKED":
            eta.setHours(eta.getHours() + 1); // 1 hour from now
            break;
        case "IN_TRANSIT":
            eta.setMinutes(eta.getMinutes() + 30); // 30 minutes from now
            break;
        case "DELIVERED":
            return deliveryOrder.actual_delivery_time ? new Date(deliveryOrder.actual_delivery_time) : now;
        default:
            eta.setHours(eta.getHours() + 2);
    }
    
    return eta;
}

// Helper function to get current location from status history
function getCurrentLocation(statusHistory) {
    if (statusHistory.length === 0) return null;
    
    // Find the most recent status update with location
    for (let i = statusHistory.length - 1; i >= 0; i--) {
        const update = statusHistory[i];
        if (update.location_lat && update.location_lng) {
            return {
                latitude: update.location_lat,
                longitude: update.location_lng,
                timestamp: update.update_time
            };
        }
    }
    
    return null;
}

// Helper function to generate tracking URL
function generateTrackingURL(orderId) {
    // In a real implementation, this would be a proper URL
    return `https://pharmasoft.example.com/tracking/${orderId}`;
}