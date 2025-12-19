const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const validator = require("validator");
const async = require("async");

const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "transfers.db",
);

router.use(bodyParser.json());

module.exports = router;

let transfersDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

transfersDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Transfers API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Transfers API");
});

/**
 * GET endpoint: Get all transfer requests.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
    transfersDB.find({}, function (err, docs) {
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
 * GET endpoint: Get transfers by status.
 *
 * @param {Object} req request object with status as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/status/:status", function (req, res) {
    if (!req.params.status) {
        return res.status(400).send("Status is required.");
    }

    const status = validator.escape(req.params.status);
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid status. Valid statuses are: " + validStatuses.join(", "),
        });
    }

    transfersDB.find({ status: status }, function (err, docs) {
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
 * GET endpoint: Get transfers for a specific store.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/store/:storeId", function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }

    const storeId = parseInt(req.params.storeId);
    
    transfersDB.find({
        $or: [
            { fromStoreId: storeId },
            { toStoreId: storeId }
        ]
    }, function (err, docs) {
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
 * GET endpoint: Get a specific transfer by ID.
 *
 * @param {Object} req request object with transfer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:transferId", function (req, res) {
    if (!req.params.transferId) {
        return res.status(400).send("Transfer ID is required.");
    }

    transfersDB.findOne(
        {
            _id: parseInt(req.params.transferId),
        },
        function (err, transfer) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!transfer) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Transfer not found.",
                });
            }
            
            res.send(transfer);
        }
    );
});

/**
 * POST endpoint: Create a new transfer request.
 *
 * @param {Object} req request object with transfer data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/create", function (req, res) {
    // Validate required fields
    if (!req.body.fromStoreId || !req.body.toStoreId || !req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "From store ID, to store ID, and items array are required fields.",
        });
    }

    if (req.body.fromStoreId === req.body.toStoreId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Source and destination stores cannot be the same.",
        });
    }

    // Validate items
    for (let i = 0; i < req.body.items.length; i++) {
        const item = req.body.items[i];
        if (!item.productId || !item.quantity || item.quantity <= 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Each item must have a valid product ID and positive quantity.",
            });
        }
    }

    // Check if stores exist
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

    async.parallel([
        function(callback) {
            storesDB.findOne({ _id: parseInt(req.body.fromStoreId), isActive: true }, callback);
        },
        function(callback) {
            storesDB.findOne({ _id: parseInt(req.body.toStoreId), isActive: true }, callback);
        }
    ], function(err, results) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const fromStore = results[0];
        const toStore = results[1];

        if (!fromStore) {
            return res.status(404).json({
                error: "Not Found",
                message: "Source store not found.",
            });
        }

        if (!toStore) {
            return res.status(404).json({
                error: "Not Found",
                message: "Destination store not found.",
            });
        }

        // Check if items have sufficient inventory in source store
        const storeInventoryDBPath = path.join(
            appData,
            appName,
            "server",
            "databases",
            "store-inventory.db",
        );
        
        const storeInventoryDB = new Datastore({
            filename: storeInventoryDBPath,
            autoload: true,
        });

        let inventoryChecks = [];
        req.body.items.forEach(function(item) {
            inventoryChecks.push(function(callback) {
                storeInventoryDB.findOne({
                    storeId: parseInt(req.body.fromStoreId),
                    productId: parseInt(item.productId)
                }, callback);
            });
        });

        async.parallel(inventoryChecks, function(err, inventoryResults) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Check inventory availability
            for (let i = 0; i < inventoryResults.length; i++) {
                const inventory = inventoryResults[i];
                const requestedQuantity = parseInt(req.body.items[i].quantity);
                
                if (!inventory || inventory.quantity < requestedQuantity) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Insufficient inventory for product ID " + req.body.items[i].productId,
                    });
                }
            }

            // Create transfer request
            const newTransfer = {
                _id: Math.floor(Date.now() / 1000),
                fromStoreId: parseInt(req.body.fromStoreId),
                toStoreId: parseInt(req.body.toStoreId),
                items: req.body.items.map(function(item) {
                    return {
                        productId: parseInt(item.productId),
                        quantity: parseInt(item.quantity),
                        notes: item.notes ? validator.escape(item.notes) : ""
                    };
                }),
                requestedBy: req.body.requestedBy ? validator.escape(req.body.requestedBy) : "system",
                status: 'PENDING',
                priority: req.body.priority ? validator.escape(req.body.priority) : 'NORMAL',
                notes: req.body.notes ? validator.escape(req.body.notes) : "",
                createdAt: new Date(),
                updatedAt: new Date()
            };

            transfersDB.insert(newTransfer, function (err, transfer) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.status(201).send(transfer);
            });
        });
    });
});

/**
 * PUT endpoint: Update transfer status.
 *
 * @param {Object} req request object with transfer ID and new status in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:transferId/status", function (req, res) {
    if (!req.params.transferId) {
        return res.status(400).send("Transfer ID is required.");
    }

    if (!req.body.status) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Status is required.",
        });
    }

    const transferId = parseInt(req.params.transferId);
    const status = validator.escape(req.body.status);
    const validStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED'];
    
    if (!validStatuses.includes(status)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid status. Valid statuses are: " + validStatuses.join(", "),
        });
    }

    // Check if transfer exists
    transfersDB.findOne({ _id: transferId }, function (err, transfer) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!transfer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Transfer not found.",
            });
        }

        // Validate status transitions
        const validTransitions = {
            'PENDING': ['APPROVED', 'REJECTED', 'CANCELLED'],
            'APPROVED': ['IN_TRANSIT', 'CANCELLED'],
            'IN_TRANSIT': ['COMPLETED', 'CANCELLED'],
            'COMPLETED': [],
            'REJECTED': [],
            'CANCELLED': []
        };

        if (!validTransitions[transfer.status].includes(status)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid status transition from " + transfer.status + " to " + status,
            });
        }

        // If completing the transfer, update inventory
        if (status === 'COMPLETED') {
            updateInventoryForTransfer(transfer, function(err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to update inventory: " + err.message,
                    });
                }

                updateTransferStatus();
            });
        } else {
            updateTransferStatus();
        }

        function updateTransferStatus() {
            const updateData = {
                status: status,
                updatedAt: new Date()
            };

            if (req.body.notes) {
                updateData.notes = validator.escape(req.body.notes);
            }

            if (req.body.updatedBy) {
                updateData.updatedBy = validator.escape(req.body.updatedBy);
            }

            transfersDB.update(
                { _id: transferId },
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
                    
                    res.json({ message: "Transfer status updated successfully." });
                }
            );
        }
    });
});

/**
 * Helper function to update inventory for a completed transfer
 *
 * @param {Object} transfer transfer object
 * @param {function} callback callback function
 * @returns {void}
 */
function updateInventoryForTransfer(transfer, callback) {
    const storeInventoryDBPath = path.join(
        appData,
        appName,
        "server",
        "databases",
        "store-inventory.db",
    );
    
    const storeInventoryDB = new Datastore({
        filename: storeInventoryDBPath,
        autoload: true,
    });

    let inventoryUpdates = [];
    
    // Prepare inventory updates for each item
    transfer.items.forEach(function(item) {
        // Decrement from source store
        inventoryUpdates.push(function(callback) {
            storeInventoryDB.findOne({
                storeId: transfer.fromStoreId,
                productId: item.productId
            }, function(err, inventory) {
                if (err) return callback(err);
                
                if (!inventory) {
                    return callback(new Error("Inventory not found for product " + item.productId + " in store " + transfer.fromStoreId));
                }
                
                const newQuantity = inventory.quantity - item.quantity;
                if (newQuantity < 0) {
                    return callback(new Error("Insufficient inventory for product " + item.productId));
                }
                
                storeInventoryDB.update(
                    { _id: inventory._id },
                    { $set: { quantity: newQuantity, lastUpdated: new Date() } },
                    {},
                    callback
                );
            });
        });
        
        // Increment to destination store
        inventoryUpdates.push(function(callback) {
            storeInventoryDB.findOne({
                storeId: transfer.toStoreId,
                productId: item.productId
            }, function(err, inventory) {
                if (err) return callback(err);
                
                if (inventory) {
                    // Update existing inventory
                    const newQuantity = inventory.quantity + item.quantity;
                    storeInventoryDB.update(
                        { _id: inventory._id },
                        { $set: { quantity: newQuantity, lastUpdated: new Date() } },
                        {},
                        callback
                    );
                } else {
                    // Create new inventory record
                    const newInventory = {
                        _id: Math.floor(Date.now() / 1000) + Math.random(),
                        storeId: transfer.toStoreId,
                        productId: item.productId,
                        quantity: item.quantity,
                        minStock: 0,
                        maxStock: 0,
                        reorderQuantity: 0,
                        createdAt: new Date(),
                        lastUpdated: new Date(),
                        updatedBy: "transfer_" + transfer._id
                    };
                    
                    storeInventoryDB.insert(newInventory, callback);
                }
            });
        });
    });
    
    async.series(inventoryUpdates, callback);
}

/**
 * GET endpoint: Get transfer history for a specific product.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/product/:productId/history", function (req, res) {
    if (!req.params.productId) {
        return res.status(400).send("Product ID is required.");
    }

    const productId = parseInt(req.params.productId);
    
    transfersDB.find({
        "items.productId": productId
    }, function (err, docs) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        // Filter and format the results to only include relevant items
        const transferHistory = docs.map(function(transfer) {
            const relevantItems = transfer.items.filter(function(item) {
                return item.productId === productId;
            });
            
            return {
                transferId: transfer._id,
                fromStoreId: transfer.fromStoreId,
                toStoreId: transfer.toStoreId,
                items: relevantItems,
                status: transfer.status,
                createdAt: transfer.createdAt,
                updatedAt: transfer.updatedAt
            };
        });
        
        res.send(transferHistory);
    });
});

module.exports.updateInventoryForTransfer = updateInventoryForTransfer;