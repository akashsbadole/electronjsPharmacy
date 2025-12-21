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
    "stores.db",
);

const dbUtils = require('./db-utils');
const dbManager = require('./db-manager');

router.use(bodyParser.json());

module.exports = router;

// Initialize database asynchronously
let storesDB;

// Initialize the database when the module loads
(async function() {
    try {
        storesDB = await dbManager.getDatabase("stores.db");
        storesDB.ensureIndex({ fieldName: "_id", unique: true });
        console.log("Stores database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize stores database:", error);
    }
})();

/**
 * GET endpoint: Get the welcome message for the Stores API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Stores API");
});

/**
 * GET endpoint: Get all stores.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
    storesDB.find({ isActive: true }, function (err, docs) {
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
 * GET endpoint: Get a specific store by ID.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:storeId", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }

    storesDB.findOne(
        {
            _id: parseInt(req.params.storeId),
            isActive: true
        },
        function (err, store) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!store) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Store not found.",
                });
            }
            
            res.send(store);
        }
    );
});

/**
 * POST endpoint: Create a new store.
 *
 * @param {Object} req request object with store data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/create", function (req, res) {
    // Validate required fields
    if (!req.body.name || !req.body.code) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store name and code are required fields.",
        });
    }

    // Check if store code already exists
    storesDB.findOne({ code: req.body.code }, function (err, existingStore) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (existingStore) {
            return res.status(409).json({
                error: "Conflict",
                message: "Store code already exists.",
            });
        }

        const newStore = {
            _id: Math.floor(Date.now() / 1000),
            name: validator.escape(req.body.name),
            code: validator.escape(req.body.code),
            address: req.body.address ? validator.escape(req.body.address) : "",
            phone: req.body.phone ? validator.escape(req.body.phone) : "",
            email: req.body.email ? validator.escape(req.body.email) : "",
            manager: req.body.manager ? validator.escape(req.body.manager) : "",
            isActive: true,
            isMainStore: req.body.isMainStore === true || req.body.isMainStore === "true",
            createdAt: new Date(),
            updatedAt: new Date()
        };

        storesDB.insert(newStore, function (err, store) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.status(201).send(store);
        });
    });
});

/**
 * PUT endpoint: Update an existing store.
 *
 * @param {Object} req request object with store data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:storeId", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }

    const storeId = parseInt(req.params.storeId);

    // Check if store exists
    storesDB.findOne({ _id: storeId, isActive: true }, function (err, store) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }

        // If updating code, check if it's already used by another store
        if (req.body.code && req.body.code !== store.code) {
            storesDB.findOne({ code: req.body.code, _id: { $ne: storeId } }, function (err, existingStore) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                if (existingStore) {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "Store code already exists.",
                    });
                }

                updateStore();
            });
        } else {
            updateStore();
        }

        function updateStore() {
            const updatedStore = {
                name: req.body.name ? validator.escape(req.body.name) : store.name,
                code: req.body.code ? validator.escape(req.body.code) : store.code,
                address: req.body.address !== undefined ? validator.escape(req.body.address) : store.address,
                phone: req.body.phone !== undefined ? validator.escape(req.body.phone) : store.phone,
                email: req.body.email !== undefined ? validator.escape(req.body.email) : store.email,
                manager: req.body.manager !== undefined ? validator.escape(req.body.manager) : store.manager,
                isMainStore: req.body.isMainStore !== undefined ? 
                    (req.body.isMainStore === true || req.body.isMainStore === "true") : 
                    store.isMainStore,
                updatedAt: new Date()
            };

            storesDB.update(
                { _id: storeId },
                { $set: updatedStore },
                {},
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.json({ message: "Store updated successfully." });
                }
            );
        }
    });
});

/**
 * DELETE endpoint: Deactivate a store (soft delete).
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:storeId", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }

    const storeId = parseInt(req.params.storeId);

    // Check if store exists
    storesDB.findOne({ _id: storeId, isActive: true }, function (err, store) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }

        // Don't allow deactivation of main store
        if (store.isMainStore) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot deactivate the main store.",
            });
        }

        // Soft delete by setting isActive to false
        storesDB.update(
            { _id: storeId },
            { $set: { isActive: false, updatedAt: new Date() } },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({ message: "Store deactivated successfully." });
            }
        );
    });
});

/**
 * GET endpoint: Get the main store.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/main", function (req, res) {
    storesDB.findOne({ isMainStore: true, isActive: true }, function (err, store) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Main store not found.",
            });
        }
        
        res.send(store);
    });
});

/**
 * POST endpoint: Set a store as the main store.
 *
 * @param {Object} req request object with store ID in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/set-main", function (req, res) {
    if (!req.body.storeId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID is required.",
        });
    }

    const storeId = parseInt(req.body.storeId);

    // Check if store exists
    storesDB.findOne({ _id: storeId, isActive: true }, function (err, store) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }

        // First, unset all stores from being main
        storesDB.update(
            { isMainStore: true },
            { $set: { isMainStore: false, updatedAt: new Date() } },
            { multi: true },
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Then set the new main store
                storesDB.update(
                    { _id: storeId },
                    { $set: { isMainStore: true, updatedAt: new Date() } },
                    {},
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        res.json({ message: "Main store updated successfully." });
                    }
                );
            }
        );
    });
});