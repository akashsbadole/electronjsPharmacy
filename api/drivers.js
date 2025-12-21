const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const appName = process.env.APPNAME || "PharmaSoft";
const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');

// Database paths
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
let driversDB = new Datastore({
    filename: driversDbPath,
    autoload: true,
});

let driverLocationDB = new Datastore({
    filename: driverLocationDbPath,
    autoload: true,
});

// Ensure indexes
driversDB.ensureIndex({ fieldName: "_id", unique: true });
driversDB.ensureIndex({ fieldName: "phone", unique: true });
driversDB.ensureIndex({ fieldName: "store_id" });
driversDB.ensureIndex({ fieldName: "is_available" });

driverLocationDB.ensureIndex({ fieldName: "_id", unique: true });
driverLocationDB.ensureIndex({ fieldName: "driver_id" });

/**
 * GET endpoint: Get the welcome message for the Drivers API.
 */
router.get("/", function (req, res) {
    res.send("Drivers API");
});

/**
 * GET endpoint: Get all drivers with optional filtering
 */
router.get("/all", function (req, res) {
    const query = {};
    
    // Add filters if provided
    if (req.query.is_available !== undefined) {
        query.is_available = req.query.is_available === 'true';
    }
    
    if (req.query.store_id) {
        query.store_id = parseInt(req.query.store_id);
    }
    
    if (req.query.vehicle_type) {
        query.vehicle_type = req.query.vehicle_type;
    }
    
    driversDB.find(query).sort({ name: 1 }).exec(function (err, docs) {
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
 * GET endpoint: Get a specific driver by ID
 */
router.get("/:id", function (req, res) {
    driversDB.findOne({ _id: req.params.id }, function (err, doc) {
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
                message: "Driver not found.",
            });
        }
        
        res.send(doc);
    });
});

/**
 * POST endpoint: Register a new driver
 */
router.post("/new", function (req, res) {
    const newDriver = req.body;
    
    // Validate required fields
    if (!newDriver.name || !newDriver.phone || !newDriver.store_id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name, phone, and store ID are required.",
        });
    }
    
    // Check if phone number already exists
    driversDB.findOne({ phone: newDriver.phone }, function (err, existingDriver) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (existingDriver) {
            return res.status(409).json({
                error: "Conflict",
                message: "A driver with this phone number already exists.",
            });
        }
        
        // Set default values
        newDriver.is_available = newDriver.is_available !== undefined ? newDriver.is_available : true;
        newDriver.performance_rating = newDriver.performance_rating || 5.0;
        newDriver.total_deliveries = newDriver.total_deliveries || 0;
        newDriver.successful_deliveries = newDriver.successful_deliveries || 0;
        newDriver.vehicle_capacity = newDriver.vehicle_capacity || 10;
        newDriver.created_at = new Date();
        newDriver.updated_at = new Date();
        newDriver.sync_version = 1;
        
        // Generate unique ID
        newDriver._id = "DRV-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
        
        driversDB.insert(newDriver, function (err, driver) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.status(201).send(driver);
        });
    });
});

/**
 * PUT endpoint: Update driver information
 */
router.put("/:id", function (req, res) {
    const driverId = req.params.id;
    const updatedDriver = req.body;
    
    // Don't allow updating certain fields
    delete updatedDriver._id;
    delete updatedDriver.created_at;
    
    // Update timestamp and version
    updatedDriver.updated_at = new Date();
    updatedDriver.sync_version = (updatedDriver.sync_version || 1) + 1;
    
    driversDB.update(
        { _id: driverId },
        { $set: updatedDriver },
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
                    message: "Driver not found.",
                });
            }
            
            res.sendStatus(200);
        }
    );
});

/**
 * DELETE endpoint: Delete a driver
 */
router.delete("/:id", function (req, res) {
    const driverId = req.params.id;
    
    // Check if driver has active deliveries
    const deliveryOrdersDbPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "delivery-orders.db"
    );
    
    const deliveryOrdersDB = new Datastore({
        filename: deliveryOrdersDbPath,
        autoload: true,
    });
    
    deliveryOrdersDB.findOne({ 
        driver_id: driverId, 
        delivery_status: { $in: ["ASSIGNED", "PICKED", "IN_TRANSIT"] }
    }, function (err, activeDelivery) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (activeDelivery) {
            return res.status(409).json({
                error: "Conflict",
                message: "Cannot delete driver with active deliveries.",
            });
        }
        
        // Delete driver
        driversDB.remove({ _id: driverId }, {}, function (err, numRemoved) {
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
                    message: "Driver not found.",
                });
            }
            
            // Also delete location history
            driverLocationDB.remove({ driver_id: driverId }, { multi: true }, function (err) {
                if (err) {
                    console.error("Failed to delete driver location history:", err);
                }
            });
            
            res.sendStatus(200);
        });
    });
});

/**
 * GET endpoint: Get driver's current location
 */
router.get("/:id/location", function (req, res) {
    const driverId = req.params.id;
    
    driverLocationDB.findOne({ driver_id: driverId }, function (err, location) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!location) {
            return res.status(404).json({
                error: "Not Found",
                message: "Driver location not found.",
            });
        }
        
        res.send(location);
    });
});

/**
 * POST endpoint: Update driver's location
 */
router.post("/:id/location", function (req, res) {
    const driverId = req.params.id;
    const { latitude, longitude } = req.body;
    
    if (!latitude || !longitude) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Latitude and longitude are required.",
        });
    }
    
    // Check if driver exists
    driversDB.findOne({ _id: driverId }, function (err, driver) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!driver) {
            return res.status(404).json({
                error: "Not Found",
                message: "Driver not found.",
            });
        }
        
        const locationData = {
            driver_id: driverId,
            latitude: parseFloat(latitude),
            longitude: parseFloat(longitude),
            last_location_update: new Date()
        };
        
        // Update or insert location
        driverLocationDB.update(
            { driver_id: driverId },
            { $set: locationData },
            { upsert: true },
            function (err, numReplaced, upsert) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Also update driver's current location in drivers table
                driversDB.update(
                    { _id: driverId },
                    { 
                        $set: { 
                            current_location_lat: parseFloat(latitude),
                            current_location_lng: parseFloat(longitude),
                            last_location_update: new Date(),
                            updated_at: new Date()
                        }
                    },
                    {},
                    function (err) {
                        if (err) {
                            console.error("Failed to update driver location:", err);
                        }
                    }
                );
                
                res.status(201).send(locationData);
            }
        );
    });
});

/**
 * GET endpoint: Get available drivers for a specific store
 */
router.get("/available/store/:storeId", function (req, res) {
    const storeId = req.params.storeId;
    
    driversDB.find({ 
        store_id: parseInt(storeId), 
        is_available: true 
    }, function (err, drivers) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.send(drivers);
    });
});

/**
 * GET endpoint: Get driver performance statistics
 */
router.get("/:id/performance", function (req, res) {
    const driverId = req.params.id;
    
    driversDB.findOne({ _id: driverId }, function (err, driver) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!driver) {
            return res.status(404).json({
                error: "Not Found",
                message: "Driver not found.",
            });
        }
        
        // Get delivery statistics
        const deliveryOrdersDbPath = path.join(
            appData,
            appName,
            "server",
            "databases",
            "delivery-orders.db"
        );
        
        const deliveryOrdersDB = new Datastore({
            filename: deliveryOrdersDbPath,
            autoload: true,
        });
        
        const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
        const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();
        
        deliveryOrdersDB.find({
            driver_id: driverId,
            created_at: { $gte: startDate, $lte: endDate }
        }, function (err, deliveries) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            const stats = {
                driver_id: driverId,
                driver_name: driver.name,
                total_deliveries: deliveries.length,
                successful_deliveries: deliveries.filter(d => d.delivery_status === "DELIVERED").length,
                failed_deliveries: deliveries.filter(d => d.delivery_status === "FAILED").length,
                cancelled_deliveries: deliveries.filter(d => d.delivery_status === "CANCELLED").length,
                current_deliveries: deliveries.filter(d => ["ASSIGNED", "PICKED", "IN_TRANSIT"].includes(d.delivery_status)).length,
                total_revenue: deliveries.reduce((sum, d) => sum + (d.delivery_charge || 0), 0),
                average_rating: driver.performance_rating,
                success_rate: deliveries.length > 0 ? (deliveries.filter(d => d.delivery_status === "DELIVERED").length / deliveries.length) * 100 : 0
            };
            
            res.json(stats);
        });
    });
});

/**
 * POST endpoint: Update driver availability
 */
router.post("/:id/availability", function (req, res) {
    const driverId = req.params.id;
    const { is_available } = req.body;
    
    if (is_available === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Availability status is required.",
        });
    }
    
    driversDB.update(
        { _id: driverId },
        { 
            $set: { 
                is_available: is_available,
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
                    message: "Driver not found.",
                });
            }
            
            res.json({ driver_id: driverId, is_available: is_available });
        }
    );
});

/**
 * GET endpoint: Get driver statistics summary
 */
router.get("/stats/summary", function (req, res) {
    const storeId = req.query.store_id ? parseInt(req.query.store_id) : null;
    
    const query = {};
    if (storeId) {
        query.store_id = storeId;
    }
    
    driversDB.find(query, function (err, drivers) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const stats = {
            total_drivers: drivers.length,
            available_drivers: drivers.filter(d => d.is_available).length,
            unavailable_drivers: drivers.filter(d => !d.is_available).length,
            average_rating: drivers.length > 0 ? drivers.reduce((sum, d) => sum + d.performance_rating, 0) / drivers.length : 0,
            total_deliveries: drivers.reduce((sum, d) => sum + d.total_deliveries, 0),
            successful_deliveries: drivers.reduce((sum, d) => sum + d.successful_deliveries, 0),
            vehicle_types: {}
        };
        
        // Count vehicle types
        drivers.forEach(driver => {
            if (driver.vehicle_type) {
                stats.vehicle_types[driver.vehicle_type] = (stats.vehicle_types[driver.vehicle_type] || 0) + 1;
            }
        });
        
        res.json(stats);
    });
});