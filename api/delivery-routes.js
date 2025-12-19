const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;

// Database paths
const deliveryRoutesDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "delivery-routes.db"
);

const routeWaypointsDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "route-waypoints.db"
);

router.use(bodyParser.json());

module.exports = router;

// Initialize databases
let deliveryRoutesDB = new Datastore({
    filename: deliveryRoutesDbPath,
    autoload: true,
});

let routeWaypointsDB = new Datastore({
    filename: routeWaypointsDbPath,
    autoload: true,
});

// Ensure indexes
deliveryRoutesDB.ensureIndex({ fieldName: "_id", unique: true });
deliveryRoutesDB.ensureIndex({ fieldName: "driver_id" });
deliveryRoutesDB.ensureIndex({ fieldName: "store_id" });
deliveryRoutesDB.ensureIndex({ fieldName: "route_date" });
deliveryRoutesDB.ensureIndex({ fieldName: "route_status" });

routeWaypointsDB.ensureIndex({ fieldName: "_id", unique: true });
routeWaypointsDB.ensureIndex({ fieldName: "route_id" });
routeWaypointsDB.ensureIndex({ fieldName: "delivery_order_id" });

/**
 * GET endpoint: Get welcome message for the Delivery Routes API.
 */
router.get("/", function (req, res) {
    res.send("Delivery Routes API");
});

/**
 * GET endpoint: Get all delivery routes with optional filtering
 */
router.get("/all", function (req, res) {
    const query = {};
    
    // Add filters if provided
    if (req.query.driver_id) {
        query.driver_id = req.query.driver_id;
    }
    
    if (req.query.store_id) {
        query.store_id = parseInt(req.query.store_id);
    }
    
    if (req.query.route_status) {
        query.route_status = req.query.route_status;
    }
    
    // Date range filter
    if (req.query.start_date && req.query.end_date) {
        query.route_date = {
            $gte: new Date(req.query.start_date),
            $lte: new Date(req.query.end_date)
        };
    }
    
    deliveryRoutesDB.find(query).sort({ route_date: -1, created_at: -1 }).exec(function (err, docs) {
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
 * GET endpoint: Get a specific delivery route by ID
 */
router.get("/:id", function (req, res) {
    const routeId = req.params.id;
    
    deliveryRoutesDB.findOne({ _id: routeId }, function (err, route) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!route) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery route not found.",
            });
        }
        
        // Get waypoints for this route
        routeWaypointsDB.find({ route_id: routeId })
            .sort({ waypoint_order: 1 })
            .exec(function (err, waypoints) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                const routeWithWaypoints = {
                    ...route,
                    waypoints: waypoints
                };
                
                res.send(routeWithWaypoints);
            });
    });
});

/**
 * POST endpoint: Create a new delivery route
 */
router.post("/new", function (req, res) {
    const newRoute = req.body;
    
    // Validate required fields
    if (!newRoute.store_id || !newRoute.route_name || !newRoute.route_date) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID, route name, and route date are required.",
        });
    }
    
    // Set default values
    newRoute.route_status = newRoute.route_status || "PLANNED";
    newRoute.total_orders = newRoute.total_orders || 0;
    newRoute.estimated_duration_minutes = newRoute.estimated_duration_minutes || 0;
    newRoute.actual_duration_minutes = newRoute.actual_duration_minutes || 0;
    newRoute.total_distance_km = newRoute.total_distance_km || 0;
    newRoute.created_at = new Date();
    newRoute.updated_at = new Date();
    newRoute.sync_version = 1;
    
    // Generate unique ID
    newRoute._id = "ROUTE-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    
    deliveryRoutesDB.insert(newRoute, function (err, route) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.status(201).send(route);
    });
});

/**
 * PUT endpoint: Update a delivery route
 */
router.put("/:id", function (req, res) {
    const routeId = req.params.id;
    const updatedRoute = req.body;
    
    // Don't allow updating certain fields
    delete updatedRoute._id;
    delete updatedRoute.created_at;
    
    // Update timestamp and version
    updatedRoute.updated_at = new Date();
    updatedRoute.sync_version = (updatedRoute.sync_version || 1) + 1;
    
    deliveryRoutesDB.update(
        { _id: routeId },
        { $set: updatedRoute },
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
                    message: "Delivery route not found.",
                });
            }
            
            res.sendStatus(200);
        }
    );
});

/**
 * DELETE endpoint: Delete a delivery route
 */
router.delete("/:id", function (req, res) {
    const routeId = req.params.id;
    
    // Check if route has active deliveries
    routeWaypointsDB.findOne({ route_id: routeId }, function (err, waypoint) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (waypoint) {
            return res.status(409).json({
                error: "Conflict",
                message: "Cannot delete route with assigned delivery orders.",
            });
        }
        
        // Delete route
        deliveryRoutesDB.remove({ _id: routeId }, {}, function (err, numRemoved) {
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
                    message: "Delivery route not found.",
                });
            }
            
            res.sendStatus(200);
        });
    });
});

/**
 * POST endpoint: Add waypoint to a route
 */
router.post("/:id/waypoints", function (req, res) {
    const routeId = req.params.id;
    const newWaypoint = req.body;
    
    // Validate required fields
    if (!newWaypoint.delivery_order_id || newWaypoint.waypoint_order === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Delivery order ID and waypoint order are required.",
        });
    }
    
    // Check if route exists
    deliveryRoutesDB.findOne({ _id: routeId }, function (err, route) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!route) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery route not found.",
            });
        }
        
        // Check if waypoint order already exists
        routeWaypointsDB.findOne({ 
            route_id: routeId, 
            waypoint_order: newWaypoint.waypoint_order 
        }, function (err, existingWaypoint) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (existingWaypoint) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Waypoint order already exists for this route.",
                });
            }
            
            // Set default values
            newWaypoint.route_id = routeId;
            newWaypoint.status = newWaypoint.status || "PENDING";
            newWaypoint.created_at = new Date();
            newWaypoint.updated_at = new Date();
            
            // Generate unique ID
            newWaypoint._id = "WP-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
            
            routeWaypointsDB.insert(newWaypoint, function (err, waypoint) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Update route total orders count
                routeWaypointsDB.count({ route_id: routeId }, function (err, count) {
                    if (!err) {
                        deliveryRoutesDB.update(
                            { _id: routeId },
                            { $set: { total_orders: count, updated_at: new Date() } },
                            {}
                        );
                    }
                });
                
                res.status(201).send(waypoint);
            });
        });
    });
});

/**
 * PUT endpoint: Update waypoint
 */
router.put("/:routeId/waypoints/:waypointId", function (req, res) {
    const routeId = req.params.routeId;
    const waypointId = req.params.waypointId;
    const updatedWaypoint = req.body;
    
    // Don't allow updating certain fields
    delete updatedWaypoint._id;
    delete updatedWaypoint.route_id;
    delete updatedWaypoint.created_at;
    
    // Update timestamp
    updatedWaypoint.updated_at = new Date();
    
    routeWaypointsDB.update(
        { _id: waypointId, route_id: routeId },
        { $set: updatedWaypoint },
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
                    message: "Waypoint not found.",
                });
            }
            
            res.sendStatus(200);
        }
    );
});

/**
 * DELETE endpoint: Remove waypoint from route
 */
router.delete("/:routeId/waypoints/:waypointId", function (req, res) {
    const routeId = req.params.routeId;
    const waypointId = req.params.waypointId;
    
    routeWaypointsDB.remove({ _id: waypointId, route_id: routeId }, {}, function (err, numRemoved) {
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
                message: "Waypoint not found.",
            });
        }
        
        // Update route total orders count
        routeWaypointsDB.count({ route_id: routeId }, function (err, count) {
            if (!err) {
                deliveryRoutesDB.update(
                    { _id: routeId },
                    { $set: { total_orders: count, updated_at: new Date() } },
                    {}
                );
            }
        });
        
        res.sendStatus(200);
    });
});

/**
 * POST endpoint: Optimize route using simple distance-based algorithm
 */
router.post("/:id/optimize", function (req, res) {
    const routeId = req.params.id;
    
    // Get route and waypoints
    deliveryRoutesDB.findOne({ _id: routeId }, function (err, route) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!route) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery route not found.",
            });
        }
        
        routeWaypointsDB.find({ route_id: routeId })
            .sort({ waypoint_order: 1 })
            .exec(function (err, waypoints) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (waypoints.length < 2) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Route optimization requires at least 2 waypoints.",
                    });
                }
                
                // Simple distance-based optimization (nearest neighbor algorithm)
                const optimizedWaypoints = optimizeRoute(waypoints);
                
                // Update waypoint orders
                const updatePromises = optimizedWaypoints.map((waypoint, index) => {
                    return new Promise((resolve, reject) => {
                        routeWaypointsDB.update(
                            { _id: waypoint._id },
                            { $set: { waypoint_order: index + 1, updated_at: new Date() } },
                            {},
                            function (err) {
                                if (err) reject(err);
                                else resolve();
                            }
                        );
                    });
                });
                
                Promise.all(updatePromises)
                    .then(() => {
                        // Calculate total distance and estimated duration
                        const totalDistance = calculateTotalDistance(optimizedWaypoints);
                        const estimatedDuration = Math.round(totalDistance * 3); // Rough estimate: 3 minutes per km
                        
                        // Update route with optimization results
                        deliveryRoutesDB.update(
                            { _id: routeId },
                            { 
                                $set: { 
                                    total_distance_km: parseFloat(totalDistance.toFixed(2)),
                                    estimated_duration_minutes: estimatedDuration,
                                    updated_at: new Date()
                                }
                            },
                            {},
                            function (err) {
                                if (err) {
                                    console.error(err);
                                    return res.status(500).json({
                                        error: "Internal Server Error",
                                        message: "An unexpected error occurred.",
                                    });
                                }
                                
                                res.json({
                                    route_id: routeId,
                                    optimized_waypoints: optimizedWaypoints,
                                    total_distance_km: parseFloat(totalDistance.toFixed(2)),
                                    estimated_duration_minutes: estimatedDuration
                                });
                            }
                        );
                    })
                    .catch(err => {
                        console.error(err);
                        res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to optimize route.",
                        });
                    });
            });
    });
});

/**
 * GET endpoint: Get routes for a specific driver
 */
router.get("/driver/:driverId", function (req, res) {
    const driverId = req.params.driverId;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    deliveryRoutesDB.find({
        driver_id: driverId,
        route_date: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ route_date: -1 }).exec(function (err, routes) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.send(routes);
    });
});

/**
 * GET endpoint: Get route statistics
 */
router.get("/stats/summary", function (req, res) {
    const storeId = req.query.store_id ? parseInt(req.query.store_id) : null;
    const startDate = req.query.start_date ? new Date(req.query.start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
    const endDate = req.query.end_date ? new Date(req.query.end_date) : new Date();
    
    const query = {
        route_date: { $gte: startDate, $lte: endDate }
    };
    
    if (storeId) {
        query.store_id = storeId;
    }
    
    deliveryRoutesDB.find(query, function (err, routes) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const stats = {
            total_routes: routes.length,
            planned_routes: routes.filter(r => r.route_status === "PLANNED").length,
            active_routes: routes.filter(r => r.route_status === "ACTIVE").length,
            completed_routes: routes.filter(r => r.route_status === "COMPLETED").length,
            total_orders: routes.reduce((sum, r) => sum + (r.total_orders || 0), 0),
            total_distance_km: routes.reduce((sum, r) => sum + (r.total_distance_km || 0), 0),
            average_distance_per_route: 0,
            total_duration_minutes: routes.reduce((sum, r) => sum + (r.actual_duration_minutes || r.estimated_duration_minutes || 0), 0),
            average_duration_per_route: 0
        };
        
        if (routes.length > 0) {
            stats.average_distance_per_route = stats.total_distance_km / routes.length;
            stats.average_duration_per_route = stats.total_duration_minutes / routes.length;
        }
        
        res.json(stats);
    });
});

/**
 * POST endpoint: Optimize provided waypoints using simple distance-based algorithm
 */
router.post("/optimize-waypoints", function (req, res) {
    const waypoints = req.body.waypoints;
    
    if (!waypoints || waypoints.length < 2) {
        return res.status(400).json({
            error: "Bad Request",
            message: "At least 2 waypoints are required for optimization.",
        });
    }
    
    try {
        // Simple distance-based optimization (nearest neighbor algorithm)
        const optimizedWaypoints = optimizeRoute(waypoints);
        
        // Calculate total distance and estimated duration
        const totalDistance = calculateTotalDistance(optimizedWaypoints);
        const estimatedDuration = Math.round(totalDistance * 3); // Rough estimate: 3 minutes per km
        
        res.json({
            success: true,
            optimizedWaypoints: optimizedWaypoints,
            totalDistance: parseFloat(totalDistance.toFixed(2)),
            estimatedDuration: estimatedDuration
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to optimize waypoints.",
        });
    }
});

// Helper function to optimize route using nearest neighbor algorithm
function optimizeRoute(waypoints) {
    if (waypoints.length <= 1) return waypoints;
    
    const optimized = [];
    const unvisited = [...waypoints];
    
    // Start with the first waypoint (store location or first delivery)
    let current = unvisited.shift();
    optimized.push(current);
    
    while (unvisited.length > 0) {
        let nearestIndex = 0;
        let nearestDistance = calculateDistance(current, unvisited[0]);
        
        // Find nearest unvisited waypoint
        for (let i = 1; i < unvisited.length; i++) {
            const distance = calculateDistance(current, unvisited[i]);
            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestIndex = i;
            }
        }
        
        current = unvisited.splice(nearestIndex, 1)[0];
        optimized.push(current);
    }
    
    return optimized;
}

// Helper function to calculate distance between two waypoints
function calculateDistance(wp1, wp2) {
    if (!wp1.location_lat || !wp1.location_lng || !wp2.location_lat || !wp2.location_lng) {
        return Infinity;
    }
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = toRad(wp2.location_lat - wp1.location_lat);
    const dLon = toRad(wp2.location_lng - wp1.location_lng);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(wp1.location_lat)) * Math.cos(toRad(wp2.location_lat)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Helper function to calculate total route distance
function calculateTotalDistance(waypoints) {
    let totalDistance = 0;
    
    for (let i = 0; i < waypoints.length - 1; i++) {
        totalDistance += calculateDistance(waypoints[i], waypoints[i + 1]);
    }
    
    return totalDistance;
}

// Helper function to convert degrees to radians
function toRad(degrees) {
    return degrees * (Math.PI / 180);
}