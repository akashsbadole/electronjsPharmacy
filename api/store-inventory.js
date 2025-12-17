const app = require("express")();
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

app.use(bodyParser.json());

module.exports = app;

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
app.get("/", function (req, res) {
    res.send("Store Inventory API");
});

/**
 * GET endpoint: Get all inventory for a specific store.
 *
 * @param {Object} req request object with store ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/store/:storeId", function (req, res) {
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
app.get("/product/:productId", function (req, res) {
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
app.get("/store/:storeId/product/:productId", function (req, res) {
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
app.post("/update", function (req, res) {
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
app.post("/adjust", function (req, res) {
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
app.get("/store/:storeId/low-stock", function (req, res) {
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
app.get("/summary", function (req, res) {
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
app.post("/initialize-store", function (req, res) {
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