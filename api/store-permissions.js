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
    "store-permissions.db",
);

router.use(bodyParser.json());

module.exports = router;

let storePermissionsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

storePermissionsDB.ensureIndex({ fieldName: "_id", unique: true });
storePermissionsDB.ensureIndex({ fieldName: ["userId", "storeId"], unique: true });

/**
 * GET endpoint: Get the welcome message for the Store Permissions API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Store Permissions API");
});

/**
 * GET endpoint: Get all permissions for a specific user.
 *
 * @param {Object} req request object with user ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/user/:userId", function (req, res) {
    if (!req.params.userId) {
        return res.status(400).send("User ID is required.");
    }

    storePermissionsDB.find(
        {
            userId: parseInt(req.params.userId),
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
 * GET endpoint: Get all permissions for a specific store.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/store/:storeId", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }

    storePermissionsDB.find(
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
 * GET endpoint: Get specific permission for a user-store combination.
 *
 * @param {Object} req request object with user ID and store ID as parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/user/:userId/store/:storeId", function (req, res) {
    if (!req.params.userId || !req.params.storeId) {
        return res.status(400).send("User ID and Store ID are required.");
    }

    storePermissionsDB.findOne(
        {
            userId: parseInt(req.params.userId),
            storeId: parseInt(req.params.storeId),
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
 * POST endpoint: Create or update user permissions for a store.
 *
 * @param {Object} req request object with permission data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/update", function (req, res) {
    // Validate required fields
    if (!req.body.userId || !req.body.storeId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "User ID and Store ID are required fields.",
        });
    }

    const userId = parseInt(req.body.userId);
    const storeId = parseInt(req.body.storeId);

    // Check if user and store exist
    const usersDBPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "users.db",
    );
    
    const storesDBPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "stores.db",
    );
    
    const usersDB = new Datastore({
        filename: usersDBPath,
        autoload: true,
    });
    
    const storesDB = new Datastore({
        filename: storesDBPath,
        autoload: true,
    });

    // Check if permission record exists
    storePermissionsDB.findOne(
        {
            userId: userId,
            storeId: storeId,
        },
        function (err, existingPermission) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            const permissionData = {
                userId: userId,
                storeId: storeId,
                canViewInventory: req.body.canViewInventory === true || req.body.canViewInventory === "true",
                canManageInventory: req.body.canManageInventory === true || req.body.canManageInventory === "true",
                canViewTransactions: req.body.canViewTransactions === true || req.body.canViewTransactions === "true",
                canProcessTransactions: req.body.canProcessTransactions === true || req.body.canProcessTransactions === "true",
                canManageTransfers: req.body.canManageTransfers === true || req.body.canManageTransfers === "true",
                canApproveTransfers: req.body.canApproveTransfers === true || req.body.canApproveTransfers === "true",
                canViewReports: req.body.canViewReports === true || req.body.canViewReports === "true",
                canManageSettings: req.body.canManageSettings === true || req.body.canManageSettings === "true",
                isActive: req.body.isActive !== undefined ? 
                    (req.body.isActive === true || req.body.isActive === "true") : 
                    true,
                updatedBy: req.body.updatedBy ? validator.escape(req.body.updatedBy) : "system",
                updatedAt: new Date()
            };

            if (existingPermission) {
                // Update existing record
                storePermissionsDB.update(
                    { _id: existingPermission._id },
                    { $set: permissionData },
                    {},
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        res.json({ message: "User store permissions updated successfully." });
                    }
                );
            } else {
                // Create new record
                permissionData._id = Math.floor(Date.now() / 1000);
                permissionData.createdAt = new Date();
                
                storePermissionsDB.insert(permissionData, function (err, newPermission) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    res.status(201).send(newPermission);
                });
            }
        }
    );
});

/**
 * DELETE endpoint: Remove user permissions for a store.
 *
 * @param {Object} req request object with user ID and store ID as parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/user/:userId/store/:storeId", function (req, res) {
    if (!req.params.userId || !req.params.storeId) {
        return res.status(400).send("User ID and Store ID are required.");
    }

    const userId = parseInt(req.params.userId);
    const storeId = parseInt(req.params.storeId);

    storePermissionsDB.remove(
        {
            userId: userId,
            storeId: storeId,
        },
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
                    message: "Permission not found for this user-store combination.",
                });
            }
            
            res.json({ message: "User store permissions removed successfully." });
        }
    );
});

/**
 * GET endpoint: Check if a user has specific permission for a store.
 *
 * @param {Object} req request object with user ID, store ID, and permission as parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/user/:userId/store/:storeId/check/:permission", function (req, res) {
    if (!req.params.userId || !req.params.storeId || !req.params.permission) {
        return res.status(400).send("User ID, Store ID, and permission are required.");
    }

    const userId = parseInt(req.params.userId);
    const storeId = parseInt(req.params.storeId);
    const permission = validator.escape(req.params.permission);
    
    const validPermissions = [
        'canViewInventory', 'canManageInventory', 'canViewTransactions', 
        'canProcessTransactions', 'canManageTransfers', 'canApproveTransfers',
        'canViewReports', 'canManageSettings'
    ];
    
    if (!validPermissions.includes(permission)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid permission. Valid permissions are: " + validPermissions.join(", "),
        });
    }

    storePermissionsDB.findOne(
        {
            userId: userId,
            storeId: storeId,
            isActive: true
        },
        function (err, permissionRecord) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!permissionRecord) {
                return res.json({ hasPermission: false });
            }
            
            res.json({ 
                hasPermission: permissionRecord[permission] === true 
            });
        }
    );
});

/**
 * POST endpoint: Grant default permissions to a user for all stores.
 *
 * @param {Object} req request object with user ID in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/grant-default-permissions", function (req, res) {
    if (!req.body.userId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "User ID is required.",
        });
    }

    const userId = parseInt(req.body.userId);
    const defaultPermissions = req.body.defaultPermissions || {
        canViewInventory: true,
        canManageInventory: false,
        canViewTransactions: true,
        canProcessTransactions: true,
        canManageTransfers: false,
        canApproveTransfers: false,
        canViewReports: true,
        canManageSettings: false
    };

    // Get all active stores
    const storesDBPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "stores.db",
    );
    
    const storesDB = new Datastore({
        filename: storesDBPath,
        autoload: true,
    });

    storesDB.find({ isActive: true }, function (err, stores) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        let processedCount = 0;
        let errorCount = 0;

        // Create permission records for each store
        stores.forEach(function(store) {
            storePermissionsDB.findOne(
                {
                    userId: userId,
                    storeId: store._id,
                },
                function (err, existingPermission) {
                    if (err) {
                        console.error(err);
                        errorCount++;
                    } else if (!existingPermission) {
                        // Create new permission record for this store
                        const permissionData = {
                            _id: Math.floor(Date.now() / 1000) + Math.random(),
                            userId: userId,
                            storeId: store._id,
                            ...defaultPermissions,
                            isActive: true,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            updatedBy: "system"
                        };

                        storePermissionsDB.insert(permissionData, function (err, newPermission) {
                            if (err) {
                                console.error(err);
                                errorCount++;
                            }
                            
                            processedCount++;
                            
                            // Check if all stores have been processed
                            if (processedCount === stores.length) {
                                res.json({
                                    message: "Default permissions granted successfully.",
                                    totalStores: stores.length,
                                    successCount: stores.length - errorCount,
                                    errorCount: errorCount
                                });
                            }
                        });
                    } else {
                        processedCount++;
                        
                        // Check if all stores have been processed
                        if (processedCount === stores.length) {
                            res.json({
                                message: "Default permissions assignment completed.",
                                totalStores: stores.length,
                                successCount: stores.length - errorCount,
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
 * GET endpoint: Get all users with permissions for a specific store.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/store/:storeId/users", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }

    const storeId = parseInt(req.params.storeId);
    
    storePermissionsDB.find(
        {
            storeId: storeId,
            isActive: true
        },
        function (err, permissions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Get user details for each permission
            const usersDBPath = path.join(
                appData,
                appName,
                "server",
                "databases",
                "users.db",
            );
            
            const usersDB = new Datastore({
                filename: usersDBPath,
                autoload: true,
            });

            const userIds = permissions.map(function(permission) {
                return permission.userId;
            });

            usersDB.find({ _id: { $in: userIds } }, function (err, users) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Combine user data with permissions
                const result = permissions.map(function(permission) {
                    const user = users.find(function(u) {
                        return u._id === permission.userId;
                    });
                    
                    return {
                        userId: permission.userId,
                        username: user ? user.username : "Unknown",
                        fullname: user ? user.fullname : "Unknown User",
                        permissions: {
                            canViewInventory: permission.canViewInventory,
                            canManageInventory: permission.canManageInventory,
                            canViewTransactions: permission.canViewTransactions,
                            canProcessTransactions: permission.canProcessTransactions,
                            canManageTransfers: permission.canManageTransfers,
                            canApproveTransfers: permission.canApproveTransfers,
                            canViewReports: permission.canViewReports,
                            canManageSettings: permission.canManageSettings
                        }
                    };
                });

                res.send(result);
            });
        }
    );
});