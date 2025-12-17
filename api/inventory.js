const app = require("express")();
const server = require("http").Server(app);
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const sanitizeFilename = require('sanitize-filename');
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const {filterFile} = require('../assets/js/utils');
const validFileTypes = [
    "image/jpg",
    "image/jpeg",
    "image/png",
    "image/webp"];
const maxFileSize = 2097152 //2MB = 2*1024*1024
const validator = require("validator");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "inventory.db",
);

const storage = multer.diskStorage({
    destination: path.join(appData, appName, "uploads"),
    filename: function (req, file, callback) {
        callback(null, Date.now()+path.extname(file.originalname));
    },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: maxFileSize },
  fileFilter: filterFile,
}).single("imagename");


app.use(bodyParser.json());

module.exports = app;

let inventoryDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

inventoryDB.ensureIndex({ fieldName: "_id", unique: true });

// Initialize store inventory database
const storeInventoryDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "store-inventory.db",
);

const storeInventoryDB = new Datastore({
    filename: storeInventoryDBPath,
    autoload: true,
});

storeInventoryDB.ensureIndex({ fieldName: ["storeId", "productId"], unique: true });

// Initialize stores database
const storesDBPath = path.join(
    process.env.APPDATA,
    process.env.APPNAME,
    "server",
    "databases",
    "stores.db",
);

const storesDB = new Datastore({
    filename: storesDBPath,
    autoload: true,
});

// Global variable to track current store context
let currentStoreId = null;

/**
 * Helper function to get current store ID from context or default store
 * @returns {number} store ID
 */
function getCurrentStoreId() {
    if (currentStoreId) {
        return currentStoreId;
    }
    
    // Get main store as default
    try {
        const mainStore = storesDB.findOne({ isMainStore: true, isActive: true });
        return mainStore ? mainStore._id : 1; // Fallback to store ID 1
    } catch (err) {
        console.error("Error getting main store:", err);
        return 1; // Fallback to store ID 1
    }
}

/**
 * Helper function to set current store context
 * @param {number} storeId store ID
 */
function setCurrentStoreId(storeId) {
    currentStoreId = parseInt(storeId);
}

/**
 * Helper function to get store-specific inventory for a product
 * @param {number} productId product ID
 * @param {number} storeId store ID (optional)
 * @param {function} callback callback function
 */
function getStoreInventory(productId, storeId, callback) {
    const targetStoreId = storeId || getCurrentStoreId();
    
    storeInventoryDB.findOne({
        productId: productId,
        storeId: targetStoreId
    }, function(err, storeInventory) {
        if (err) {
            return callback(err);
        }
        callback(null, storeInventory);
    });
}

/**
 * Helper function to update store inventory quantity
 * @param {number} productId product ID
 * @param {number} quantity new quantity
 * @param {number} storeId store ID (optional)
 * @param {function} callback callback function
 */
function updateStoreInventory(productId, quantity, storeId, callback) {
    const targetStoreId = storeId || getCurrentStoreId();
    
    storeInventoryDB.findOne({
        productId: productId,
        storeId: targetStoreId
    }, function(err, storeInventory) {
        if (err) {
            return callback(err);
        }
        
        if (storeInventory) {
            // Update existing record
            storeInventoryDB.update(
                { _id: storeInventory._id },
                {
                    $set: {
                        quantity: quantity,
                        lastUpdated: new Date()
                    }
                },
                {},
                callback
            );
        } else {
            // Create new record
            const newStoreInventory = {
                _id: Math.floor(Date.now() / 1000) + Math.random(),
                productId: productId,
                storeId: targetStoreId,
                quantity: quantity,
                minStock: 0,
                maxStock: 0,
                reorderQuantity: 0,
                createdAt: new Date(),
                lastUpdated: new Date(),
                updatedBy: "system"
            };
            
            storeInventoryDB.insert(newStoreInventory, callback);
        }
    });
}

/**
 * GET endpoint: Get the welcome message for the Inventory API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Inventory API");
});

/**
 * GET endpoint: Get product details by product ID.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/product/:productId", function (req, res) {
    if (!req.params.productId) {
        res.status(500).send("ID field is required.");
    } else {
        const productId = parseInt(req.params.productId);
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
        
        inventoryDB.findOne(
            {
                _id: productId,
            },
            function (err, product) {
                if (err) {
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
                
                // Get store-specific inventory
                getStoreInventory(productId, storeId, function(err, storeInventory) {
                    if (err) {
                        console.error("Error getting store inventory:", err);
                    }
                    
                    // Add store-specific quantity to product
                    if (storeInventory) {
                        product.storeQuantity = storeInventory.quantity;
                        product.minStock = storeInventory.minStock || product.minStock;
                        product.maxStock = storeInventory.maxStock || product.maxStock;
                        product.reorderQuantity = storeInventory.reorderQuantity || product.reorderQuantity;
                    } else {
                        product.storeQuantity = product.quantity || 0;
                    }
                    
                    res.send(product);
                });
            },
        );
    }
});

/**
 * GET endpoint: Get details of all products.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/products", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
    
    inventoryDB.find({}, function (err, products) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        // Get store inventory for all products
        const productIds = products.map(function(product) {
            return product._id;
        });
        
        storeInventoryDB.find({
            productId: { $in: productIds },
            storeId: storeId
        }, function(err, storeInventories) {
            if (err) {
                console.error("Error getting store inventories:", err);
            }
            
            // Merge store inventory data with products
            const productsWithStoreData = products.map(function(product) {
                const storeInventory = storeInventories.find(function(si) {
                    return si.productId === product._id;
                });
                
                if (storeInventory) {
                    product.storeQuantity = storeInventory.quantity;
                    product.minStock = storeInventory.minStock || product.minStock;
                    product.maxStock = storeInventory.maxStock || product.maxStock;
                    product.reorderQuantity = storeInventory.reorderQuantity || product.reorderQuantity;
                } else {
                    product.storeQuantity = product.quantity || 0;
                }
                
                return product;
            });
            
            res.send(productsWithStoreData);
        });
    });
});

/**
 * POST endpoint: Create or update a product.
 *
 * @param {Object} req request object with product data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/product", function (req, res) {
    upload(req, res, function (err) {

        if (err) {
            if (err instanceof multer.MulterError) {
                console.error('Upload Error:', err);
                return res.status(400).json({
                    error: 'Upload Error',
                    message: err.message,
                });
            } else {
                console.error('Unknown Error:', err);
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: err.message,
                });
            }
        }

    let image = "";

    if (validator.escape(req.body.img) !== "") {
        image = sanitizeFilename(req.body.img);
    }

    if (req.file) {
        image = sanitizeFilename(req.file.filename);
    }


    if (validator.escape(req.body.remove) === "1") {
            try {
                let imgPath = path.join(
                appData,
                appName,
                "uploads",
                image,
                );

                if (!req.file) {
                fs.unlinkSync(imgPath);
                image = "";
                }
                
            } catch (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

        }

    let Product = {
        _id: parseInt(validator.escape(req.body.id)),
        barcode: parseInt(validator.escape(req.body.barcode)),
        expirationDate: validator.escape(req.body.expirationDate),
        price: validator.escape(req.body.price),
        category: validator.escape(req.body.category),
        quantity:
            validator.escape(req.body.quantity) == ""
                ? 0
                : validator.escape(req.body.quantity),
        name: validator.escape(req.body.name),
        stock: req.body.stock === "on" ? 0 : 1,
        minStock: validator.escape(req.body.minStock),
        img: image,
    };

    const storeId = req.body.storeId ? parseInt(req.body.storeId) : getCurrentStoreId();
    
    if (validator.escape(req.body.id) === "") {
        Product._id = Math.floor(Date.now() / 1000);
        inventoryDB.insert(Product, function (err, product) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                // Create store inventory record for new product
                updateStoreInventory(product._id, parseInt(Product.quantity) || 0, storeId, function(err) {
                    if (err) {
                        console.error("Error creating store inventory:", err);
                    }
                });
                
                res.sendStatus(200);
            }
        });
    } else {
        inventoryDB.update(
            {
                _id: parseInt(validator.escape(req.body.id)),
            },
            Product,
            {},
            function (err, numReplaced, product) {
                if (err) {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                } else {
                    // Update store inventory record
                    updateStoreInventory(parseInt(validator.escape(req.body.id)), parseInt(Product.quantity) || 0, storeId, function(err) {
                        if (err) {
                            console.error("Error updating store inventory:", err);
                        }
                    });
                    
                    res.sendStatus(200);
                }
            },
        );
    }
    });
});

/**
 * DELETE endpoint: Delete a product by product ID.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/product/:productId", function (req, res) {
    inventoryDB.remove(
        {
            _id: parseInt(req.params.productId),
        },
        function (err, numRemoved) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                res.sendStatus(200);
            }
        },
    );
});

/**
 * POST endpoint: Find a product by SKU code.
 *
 * @param {Object} req request object with SKU code in the body.
 * @param {Object} res response object.
 * @returns {void}
 */

app.post("/product/sku", function (req, res) {
    let sku = validator.escape(req.body.skuCode);
    const storeId = req.body.storeId ? parseInt(req.body.storeId) : getCurrentStoreId();
    
    inventoryDB.findOne(
        {
            barcode: parseInt(sku),
        },
        function (err, product) {
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
            
            // Get store-specific inventory
            getStoreInventory(product._id, storeId, function(err, storeInventory) {
                if (err) {
                    console.error("Error getting store inventory:", err);
                }
                
                // Add store-specific quantity to product
                if (storeInventory) {
                    product.storeQuantity = storeInventory.quantity;
                } else {
                    product.storeQuantity = product.quantity || 0;
                }
                
                res.send(product);
            });
        },
    );
});

/**
 * GET endpoint: Get product with batch information.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/product/:productId/batches", function (req, res) {
    if (!req.params.productId) {
        return res.status(500).send("Product ID field is required.");
    } else {
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
        
        batchesDB.find({
            productId: parseInt(req.params.productId),
            isActive: true
        }).sort({ expiryDate: 1 }).exec(function (err, batches) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(batches);
        });
    }
});

/**
 * POST endpoint: Update product with reorder threshold management.
 *
 * @param {Object} req request object with reorder threshold data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/product/:productId/reorder", function (req, res) {
    if (!req.params.productId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product ID is required.",
        });
    }
    
    const productId = parseInt(req.params.productId);
    
    // Validate required fields
    if (req.body.minStock === undefined || req.body.maxStock === undefined || req.body.reorderQuantity === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Min stock, max stock and reorder quantity are required fields.",
        });
    }
    
    // Check if product exists
    inventoryDB.findOne({ _id: productId }, function (err, product) {
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
        
        // Update product with reorder settings
        inventoryDB.update(
            { _id: productId },
            {
                $set: {
                    minStock: parseInt(req.body.minStock),
                    maxStock: parseInt(req.body.maxStock),
                    reorderQuantity: parseInt(req.body.reorderQuantity),
                    rackLocation: req.body.rackLocation ? validator.escape(req.body.rackLocation) : product.rackLocation,
                    shelfLocation: req.body.shelfLocation ? validator.escape(req.body.shelfLocation) : product.shelfLocation,
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
                
                res.json({ message: "Product reorder settings updated successfully." });
            }
        );
    });
});

/**
 * GET endpoint: Get products with low stock levels.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/low-stock", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
    
    storeInventoryDB.find({ storeId: storeId }, function (err, storeInventories) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const lowStockItems = storeInventories.filter(function(item) {
            const currentQuantity = parseInt(item.quantity) || 0;
            const minStock = parseInt(item.minStock) || 0;
            return currentQuantity <= minStock;
        });
        
        // Get product details for low stock items
        const productIds = lowStockItems.map(function(item) {
            return item.productId;
        });
        
        if (productIds.length === 0) {
            return res.json([]);
        }
        
        inventoryDB.find({ _id: { $in: productIds } }, function(err, products) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Merge product details with store inventory
            const lowStockProducts = lowStockItems.map(function(item) {
                const product = products.find(function(p) {
                    return p._id === item.productId;
                });
                
                if (product) {
                    return {
                        ...product,
                        storeQuantity: item.quantity,
                        minStock: item.minStock,
                        maxStock: item.maxStock,
                        reorderQuantity: item.reorderQuantity
                    };
                }
                
                return item;
            });
            
            res.json(lowStockProducts);
        });
    });
});

/**
 * Decrement inventory quantities based on a list of products in a transaction.
 * Enhanced to support batch tracking.
 *
 * @param {Array} products - List of products in the transaction.
 * @param {Object} options - Options for batch tracking (optional).
 * @returns {void}
 */
app.decrementInventory = function (products, options = {}) {
    const useBatchTracking = options.useBatchTracking !== false; // Default to true
    const storeId = options.storeId || getCurrentStoreId();
    
    async.eachSeries(products, function (transactionProduct, callback) {
        inventoryDB.findOne(
            {
                _id: parseInt(transactionProduct.id),
            },
            function (err, product) {
                if (!product) {
                    return callback();
                }
                
                // Update store inventory
                getStoreInventory(product._id, storeId, function(err, storeInventory) {
                    if (err) {
                        return callback(err);
                    }
                    
                    if (!storeInventory) {
                        return callback(new Error("Store inventory not found for product " + product._id));
                    }
                    
                    const newStoreQuantity = storeInventory.quantity - parseInt(transactionProduct.quantity);
                    
                    if (newStoreQuantity < 0) {
                        return callback(new Error("Insufficient inventory in store for product " + product._id));
                    }
                    
                    // Update store inventory
                    updateStoreInventory(product._id, newStoreQuantity, storeId, function(err) {
                        if (err) {
                            return callback(err);
                        }
                        
                        // Also update main inventory for backward compatibility
                        let updatedMainQuantity = parseInt(product.quantity) - parseInt(transactionProduct.quantity);
                        
                        inventoryDB.update(
                            {
                                _id: parseInt(product._id),
                            },
                            {
                                $set: {
                                    quantity: updatedMainQuantity,
                                },
                            },
                            {},
                            function(err) {
                                if (err) {
                                    return callback(err);
                                }
                                
                                // If batch tracking is enabled, update batch quantities
                                if (useBatchTracking && transactionProduct.batchId) {
                                    updateBatchQuantity(transactionProduct.batchId, -parseInt(transactionProduct.quantity), callback);
                                } else {
                                    callback();
                                }
                            }
                        );
                    });
                });
            },
        );
    });
};

/**
 * Helper function to update batch quantity
 *
 * @param {number} batchId batch ID
 * @param {number} adjustmentQuantity quantity to adjust (negative for decrement)
 * @param {function} callback callback function
 * @returns {void}
 */
function updateBatchQuantity(batchId, adjustmentQuantity, callback) {
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
    
    batchesDB.findOne({ _id: batchId }, function (err, batch) {
        if (err) {
            return callback(err);
        }
        
        if (!batch) {
            return callback(new Error("Batch not found"));
        }
        
        const newQuantity = batch.currentQuantity + adjustmentQuantity;
        
        if (newQuantity < 0) {
            return callback(new Error("Insufficient batch quantity"));
        }
        
        batchesDB.update(
            { _id: batchId },
            { $set: { currentQuantity: newQuantity } },
            {},
            function (err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                
                callback(null);
            }
        );
    });
}

/**
 * Helper function to get product with batch information
 *
 * @param {number} productId product ID
 * @param {function} callback callback function
 * @returns {void}
 */
function getProductWithBatches(productId, callback) {
    inventoryDB.findOne({ _id: productId }, function (err, product) {
        if (err) {
            return callback(err);
        }
        
        if (!product) {
            return callback(new Error("Product not found"));
        }
        
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
        
        batchesDB.find({
            productId: productId,
            isActive: true
        }).sort({ expiryDate: 1 }).exec(function (err, batches) {
            if (err) {
                return callback(err);
            }
            
            callback(null, {
                ...product,
                batches: batches
            });
        });
    });
}

// Add new endpoint to set current store context
app.post("/set-store", function (req, res) {
    if (!req.body.storeId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID is required.",
        });
    }
    
    const storeId = parseInt(req.body.storeId);
    
    // Verify store exists
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
        
        setCurrentStoreId(storeId);
        res.json({
            message: "Store context updated successfully.",
            storeId: storeId,
            storeName: store.name
        });
    });
});

// Add endpoint to get current store context
app.get("/current-store", function (req, res) {
    const storeId = getCurrentStoreId();
    
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
                message: "Current store not found.",
            });
        }
        
        res.json(store);
    });
});

module.exports.updateBatchQuantity = updateBatchQuantity;
module.exports.getProductWithBatches = getProductWithBatches;
module.exports.setCurrentStoreId = setCurrentStoreId;
module.exports.getCurrentStoreId = getCurrentStoreId;