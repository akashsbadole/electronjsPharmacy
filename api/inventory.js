const express = require("express");
const router = express.Router();
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
const dbUtils = require('./db-utils');
const dbManager = require('./db-manager');
const dbPath = dbUtils.getDatabasePath("inventory.db");

const storage = multer.diskStorage({
    destination: dbUtils.getUploadsDir(),
    filename: function (req, file, callback) {
        callback(null, Date.now()+path.extname(file.originalname));
    },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: maxFileSize },
  fileFilter: filterFile,
}).single("imagename");


router.use(bodyParser.json());

module.exports = router;

// Database instances - will be initialized asynchronously
let inventoryDB, storeInventoryDB, storesDB;

/**
 * Initialize databases asynchronously
 */
async function initializeDatabases() {
    try {
        console.log("Initializing inventory API databases...");
        inventoryDB = await dbManager.getDatabase("inventory.db");
        storeInventoryDB = await dbManager.getDatabase("store-inventory.db");
        storesDB = await dbManager.getDatabase("stores.db");
        
        // Ensure indexes are created
        inventoryDB.ensureIndex({ fieldName: "_id", unique: true });
        storeInventoryDB.ensureIndex({ fieldName: ["storeId", "productId"], unique: true });
        
        // Set initial currentStoreId from main store
        storesDB.findOne({ isMainStore: true, isActive: true }, (err, mainStore) => {
            if (!err && mainStore) {
                currentStoreId = mainStore._id;
                console.log(`Initial currentStoreId set to main store: ${currentStoreId}`);
            } else {
                currentStoreId = 1; // Fallback
                console.log(`Initial currentStoreId set to fallback: ${currentStoreId}`);
            }
        });
        
        console.log("Inventory API databases initialized successfully");
    } catch (error) {
        console.error("Failed to initialize inventory API databases:", error);
        throw error;
    }
}


// Initialize databases immediately
initializeDatabases().catch(err => {
    console.error("Database initialization failed in inventory module:", err);
});

// Global variable to track current store context
let currentStoreId = null;

/**
 * Helper function to get current store ID from context or default store
 * @returns {number} store ID
 */
function getCurrentStoreId() {
    return currentStoreId || 1; // Use cached value or fallback
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
router.get("/", function (req, res) {
    res.send("Inventory API");
});

/**
 * GET endpoint: Get product details by product ID.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/product/:productId", function (req, res) {
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
router.get("/products", function (req, res) {
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
router.post("/product", function (req, res) {
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
                process.env.APPDATA,
                process.env.APPNAME,
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
router.delete("/product/:productId", function (req, res) {
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

router.post("/product/sku", function (req, res) {
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
router.get("/product/:productId/batches", async function (req, res) {
    if (!req.params.productId) {
        return res.status(500).send("Product ID field is required.");
    }
    
    try {
        const batchesDB = await dbManager.getDatabase("batches.db");
        
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
    } catch (error) {
        console.error("Error accessing batches database:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to access batches database.",
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
router.post("/product/:productId/reorder", function (req, res) {
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
router.get("/low-stock", function (req, res) {
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
router.decrementInventory = function (products, options = {}) {
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
async function updateBatchQuantity(batchId, adjustmentQuantity, callback) {
    try {
        const batchesDB = await dbManager.getDatabase("batches.db");
        
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
    } catch (error) {
        callback(error);
    }
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
router.post("/set-store", function (req, res) {
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
router.get("/current-store", function (req, res) {
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

/**
 * GET endpoint: Get products for stock counting.
 *
 * @param {Object} req request object with stock count parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/stock-count/:sessionId", async function (req, res) {
    if (!req.params.sessionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Session ID is required.",
        });
    }
    
    try {
        const sessionId = parseInt(req.params.sessionId);
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
        
        const stockCountingDB = await dbManager.getDatabase("stock-counting.db");
        
        stockCountingDB.findOne({ _id: sessionId }, function (err, stockCount) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!stockCount) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Stock count session not found.",
                });
            }
            
            // Build query based on count scope
            let query = {};
            
            // Apply scope filters if specified
            if (stockCount.countScope && Object.keys(stockCount.countScope).length > 0) {
                const scope = stockCount.countScope;
                
                if (scope.categories && scope.categories.length > 0) {
                    query.category = { $in: scope.categories };
                }
                
                if (scope.valueRange) {
                    query.quantity = {
                        $gte: scope.valueRange.min || 0,
                        $lte: scope.valueRange.max || Number.MAX_SAFE_INTEGER
                    };
                }
                
                if (scope.suppliers && scope.suppliers.length > 0) {
                    // This would require joining with batches - for now, return all and filter later
                }
            }
            
            inventoryDB.find(query, function (err, products) {
                if (err) {
                    console.error(err);
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
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to load store inventory.",
                        });
                    }
                    
                    // Merge store inventory data with products
                    const productsWithStoreData = products.map(function(product) {
                        const storeInventory = storeInventories.find(function(si) {
                            return si.productId === product._id;
                        });
                        
                        const result = {
                            ...product,
                            storeQuantity: storeInventory ? storeInventory.quantity : product.quantity || 0,
                            minStock: storeInventory ? storeInventory.minStock : product.minStock,
                            maxStock: storeInventory ? storeInventory.maxStock : product.maxStock,
                            reorderQuantity: storeInventory ? storeInventory.reorderQuantity : product.reorderQuantity,
                            locationRack: storeInventory ? storeInventory.rackLocation : product.rackLocation,
                            locationShelf: storeInventory ? storeInventory.shelfLocation : product.shelfLocation
                        };
                        
                        // Apply supplier filter if specified in scope
                        if (stockCount.countScope && stockCount.countScope.suppliers &&
                            stockCount.countScope.suppliers.length > 0) {
                            const batchesDB = dbManager.getDatabase("batches.db");
                            
                            batchesDB.find({
                                productId: product._id,
                                supplierId: { $in: stockCount.countScope.suppliers }
                            }, function(err, batches) {
                                if (err || batches.length === 0) {
                                    result.includeInCount = false;
                                } else {
                                    result.includeInCount = true;
                                    result.batches = batches;
                                }
                            });
                        } else {
                            result.includeInCount = true;
                        }
                        
                        return result;
                    });
                    
                    // Filter products that should be included in count
                    const filteredProducts = productsWithStoreData.filter(p => p.includeInCount !== false);
                    
                    res.json({
                        products: filteredProducts,
                        sessionId: sessionId,
                        storeId: storeId,
                        countType: stockCount.countType,
                        countScope: stockCount.countScope
                    });
                });
            });
        });
    } catch (error) {
        console.error("Error in stock-count endpoint:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to process stock count request.",
        });
    }
});

/**
 * GET endpoint: Get low stock items for stock counting prioritization.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/low-stock-priority", function (req, res) {
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
            return res.json({
                lowStockItems: [],
                message: "No low stock items found."
            });
        }
        
        inventoryDB.find({ _id: { $in: productIds } }, function(err, products) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Merge product details with store inventory and prioritize
            const prioritizedItems = lowStockItems.map(function(item) {
                const product = products.find(function(p) {
                    return p._id === item.productId;
                });
                
                if (!product) return null;
                
                const currentQuantity = parseInt(item.quantity) || 0;
                const minStock = parseInt(item.minStock) || 0;
                const stockDeficit = minStock - currentQuantity;
                const priorityScore = stockDeficit * (product.price || 1); // Higher value for high-value, out-of-stock items
                
                return {
                    ...product,
                    storeQuantity: item.quantity,
                    minStock: item.minStock,
                    stockDeficit: stockDeficit,
                    priorityScore: priorityScore,
                    priority: priorityScore > 1000 ? 'HIGH' : priorityScore > 100 ? 'MEDIUM' : 'LOW'
                };
            }).filter(item => item !== null).sort((a, b) => b.priorityScore - a.priorityScore);
            
            res.json({
                lowStockItems: prioritizedItems,
                totalItems: prioritizedItems.length
            });
        });
    });
});

/**
 * GET endpoint: Get expiring items for stock counting focus.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/expiring-items", async function (req, res) {
    try {
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
        const days = parseInt(req.query.days) || 30; // Default to 30 days
        
        const today = new Date();
        const expiryDate = new Date();
        expiryDate.setDate(today.getDate() + days);
        
        const batchesDB = await dbManager.getDatabase("batches.db");
        
        batchesDB.find({
            expiryDate: {
                $gte: today.toISOString().split('T')[0],
                $lte: expiryDate.toISOString().split('T')[0]
            },
            currentQuantity: { $gt: 0 },
            isActive: true
        }).sort({ expiryDate: 1 }).exec(function (err, batches) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (batches.length === 0) {
                return res.json({
                    expiringItems: [],
                    message: `No items expiring within ${days} days.`
                });
            }
            
            // Get product details for expiring batches
            const productIds = batches.map(batch => batch.productId);
            
            inventoryDB.find({ _id: { $in: productIds } }, function(err, products) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get store inventory quantities
                storeInventoryDB.find({
                    productId: { $in: productIds },
                    storeId: storeId
                }, function(err, storeInventories) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to load store inventory.",
                        });
                    }
                    
                    // Merge product and store inventory data with batches
                    const expiringItems = batches.map(batch => {
                        const product = products.find(p => p._id === batch.productId);
                        const storeInventory = storeInventories.find(si => si.productId === batch.productId);
                        
                        if (!product) return null;
                        
                        const daysUntilExpiry = Math.ceil((new Date(batch.expiryDate) - today) / (1000 * 60 * 60 * 24));
                        const urgencyLevel = daysUntilExpiry <= 7 ? 'CRITICAL' :
                                         daysUntilExpiry <= 15 ? 'HIGH' : 'MEDIUM';
                        
                        return {
                            product: product,
                            batch: batch,
                            storeQuantity: storeInventory ? storeInventory.quantity : 0,
                            daysUntilExpiry: daysUntilExpiry,
                            urgencyLevel: urgencyLevel,
                            totalValue: batch.currentQuantity * (product.price || 0)
                        };
                    }).filter(item => item !== null).sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
                    
                    res.json({
                        expiringItems: expiringItems,
                        totalItems: expiringItems.length,
                        totalValue: expiringItems.reduce((sum, item) => sum + item.totalValue, 0),
                        daysThreshold: days
                    });
                });
            });
        });
    } catch (error) {
        console.error("Error in expiring-items endpoint:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to get expiring items.",
        });
    }
});

/**
 * POST endpoint: Update inventory from approved stock count.
 *
 * @param {Object} req request object with stock count update data.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/update-from-stock-count", async function (req, res) {
    try {
        if (!req.body.sessionId || !req.body.items) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Session ID and items array are required.",
            });
        }
        
        const sessionId = parseInt(req.body.sessionId);
        const items = req.body.items;
        const storeId = req.body.storeId ? parseInt(req.body.storeId) : getCurrentStoreId();
        
        const stockCountingDB = await dbManager.getDatabase("stock-counting.db");
        
        stockCountingDB.findOne({ _id: sessionId }, function (err, stockCount) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!stockCount) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Stock count session not found.",
                });
            }
            
            if (stockCount.countStatus !== 'COMPLETED') {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Inventory can only be updated from completed stock counts.",
                });
            }
            
            // Process each item update
            const updatePromises = items.map(itemData => {
                return new Promise((resolve, reject) => {
                    const productId = parseInt(itemData.productId);
                    const newQuantity = parseInt(itemData.countedQuantity);
                    
                    // Update store inventory
                    updateStoreInventory(productId, newQuantity, storeId, function(err) {
                        if (err) {
                            return reject(err);
                        }
                        
                        // Also update main inventory for backward compatibility
                        inventoryDB.update(
                            { _id: productId },
                            { $set: { quantity: newQuantity, lastStockCount: new Date() } },
                            {},
                            function(err) {
                                if (err) {
                                    return reject(err);
                                }
                                
                                // Update batch quantity if specified
                                if (itemData.batchId) {
                                    updateBatchQuantity(itemData.batchId, newQuantity, function(err) {
                                        if (err) {
                                            return reject(err);
                                        }
                                        resolve({ productId, newQuantity, batchId: itemData.batchId });
                                    });
                                } else {
                                    resolve({ productId, newQuantity });
                                }
                            }
                        );
                    });
                });
            });
            
            Promise.all(updatePromises)
                .then(results => {
                    res.json({
                        message: "Inventory updated successfully from stock count.",
                        updatedItems: results,
                        sessionId: sessionId
                    });
                })
                .catch(err => {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to update inventory from stock count.",
                    });
                });
        });
    } catch (error) {
        console.error("Error in update-from-stock-count endpoint:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to update inventory from stock count.",
        });
    }
});

/**
 * GET endpoint: Check and trigger reorder alerts for products.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/check-reorder-triggers", async function (req, res) {
    try {
        const storeId = req.body.storeId ? parseInt(req.body.storeId) : getCurrentStoreId();
        const productId = req.body.productId ? parseInt(req.body.productId) : null;
        
        const reorderTriggersDB = await dbManager.getDatabase("reorder-triggers.db");
        
        // Build query for triggers
        let triggerQuery = { isActive: true };
        if (storeId) {
            triggerQuery.storeId = storeId;
        }
        if (productId) {
            triggerQuery.productId = productId;
        }
        
        reorderTriggersDB.find(triggerQuery, function (err, triggers) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            const triggeredItems = [];
            
            // Check each trigger condition
            async.eachSeries(triggers, function (trigger, callback) {
                checkTriggerCondition(trigger, function(err, shouldTrigger, data) {
                    if (err) {
                        console.error(err);
                        return callback();
                    }
                    
                    if (shouldTrigger) {
                        // Update trigger with last triggered info
                        reorderTriggersDB.update(
                            { _id: trigger._id },
                            {
                                $set: {
                                    lastTriggered: new Date(),
                                    triggerCount: (trigger.triggerCount || 0) + 1
                                }
                            },
                            {},
                            function(err) {
                                if (err) {
                                    console.error(err);
                                }
                            }
                        );
                        
                        // Create reorder suggestion
                        createReorderSuggestionFromTrigger(trigger, data, function(err, suggestion) {
                            if (err) {
                                console.error(err);
                            } else if (suggestion) {
                                triggeredItems.push({
                                    trigger: trigger,
                                    suggestion: suggestion,
                                    triggeredAt: new Date(),
                                    data: data
                                });
                            }
                            callback();
                        });
                    } else {
                        callback();
                    }
                });
            }, function (err) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred while checking triggers.",
                    });
                }
                
                res.json({
                    message: "Reorder trigger check completed.",
                    totalTriggers: triggers.length,
                    triggeredItems: triggeredItems,
                    triggeredCount: triggeredItems.length
                });
            });
        });
    } catch (error) {
        console.error("Error in check-reorder-triggers endpoint:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to check reorder triggers.",
        });
    }
});

/**
 * GET endpoint: Get products with active reorder triggers.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/with-triggers", async function (req, res) {
    try {
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
        
        // Get all products
        inventoryDB.find({}, function (err, products) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            dbManager.getDatabase("reorder-triggers.db").then(reorderTriggersDB => {
                // Build query for triggers
                let triggerQuery = { isActive: true };
                if (storeId) {
                    triggerQuery.storeId = storeId;
                }
                
                reorderTriggersDB.find(triggerQuery, function (err, triggers) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    // Map triggers to products
                    const productsWithTriggers = products.map(function(product) {
                        const productTriggers = triggers.filter(t => t.productId === product._id);
                        
                        return {
                            ...product,
                            triggers: productTriggers,
                            hasActiveTriggers: productTriggers.length > 0
                        };
                    });
                    
                    res.json({
                        products: productsWithTriggers,
                        totalProducts: products.length,
                        productsWithTriggers: productsWithTriggers.filter(p => p.hasActiveTriggers).length,
                        totalActiveTriggers: triggers.length
                    });
                });
            }).catch(error => {
                console.error("Error accessing reorder-triggers database:", error);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to access reorder triggers database.",
                });
            });
        });
    } catch (error) {
        console.error("Error in with-triggers endpoint:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to get products with triggers.",
        });
    }
});

/**
 * GET endpoint: Get reorder alerts for a specific product.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/product/:productId/reorder-alerts", async function (req, res) {
    try {
        if (!req.params.productId) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Product ID is required.",
            });
        }
        
        const productId = parseInt(req.params.productId);
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
        
        // Get product details
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
            
            // Get store-specific inventory
            getStoreInventory(productId, storeId, function(err, storeInventory) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                const currentQuantity = storeInventory ? parseInt(storeInventory.quantity) || 0 : parseInt(product.quantity) || 0;
                const minStock = storeInventory ? parseInt(storeInventory.minStock) || 0 : parseInt(product.minStock) || 0;
                
                dbManager.getDatabase("reorder-triggers.db").then(reorderTriggersDB => {
                    let triggerQuery = { productId: productId, isActive: true };
                    if (storeId) {
                        triggerQuery.storeId = storeId;
                    }
                    
                    reorderTriggersDB.find(triggerQuery, function (err, triggers) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        // Check each trigger condition
                        const activeAlerts = [];
                        
                        async.eachSeries(triggers, function (trigger, callback) {
                            checkTriggerCondition(trigger, function(err, shouldTrigger, data) {
                                if (err) {
                                    console.error(err);
                                    return callback();
                                }
                                
                                if (shouldTrigger) {
                                    activeAlerts.push({
                                        trigger: trigger,
                                        alertType: trigger.triggerType,
                                        severity: getAlertSeverity(currentQuantity, minStock, trigger),
                                        message: getAlertMessage(currentQuantity, minStock, trigger, data),
                                        triggeredAt: new Date(),
                                        data: data
                                    });
                                }
                                
                                callback();
                            });
                        }, function (err) {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({
                                    error: "Internal Server Error",
                                    message: "An unexpected error occurred while checking triggers.",
                                });
                            }
                            
                            res.json({
                                product: {
                                    ...product,
                                    currentQuantity: currentQuantity,
                                    minStock: minStock,
                                    stockStatus: getStockStatus(currentQuantity, minStock)
                                },
                                triggers: triggers,
                                activeAlerts: activeAlerts,
                                totalActiveAlerts: activeAlerts.length
                            });
                        });
                    });
                }).catch(error => {
                    console.error("Error accessing reorder-triggers database:", error);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to access reorder triggers database.",
                    });
                });
            });
        });
    } catch (error) {
        console.error("Error in product/:productId/reorder-alerts endpoint:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to get reorder alerts for product.",
        });
    }
});

/**
 * POST endpoint: Set up automatic reorder monitoring for a product.
 *
 * @param {Object} req request object with product ID and monitoring settings.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/product/:productId/setup-monitoring", async function (req, res) {
    try {
        if (!req.params.productId) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Product ID is required.",
            });
        }
        
        const productId = parseInt(req.params.productId);
        const storeId = req.body.storeId ? parseInt(req.body.storeId) : getCurrentStoreId();
        
        // Validate required fields
        if (req.body.minStock === undefined || req.body.maxStock === undefined) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Min stock and max stock levels are required.",
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
            
            // Create or update stock level trigger
            dbManager.getDatabase("reorder-triggers.db").then(reorderTriggersDB => {
                // Check if trigger already exists
                let triggerQuery = {
                    productId: productId,
                    triggerType: 'STOCK_LEVEL'
                };
                if (storeId) {
                    triggerQuery.storeId = storeId;
                }
                
                reorderTriggersDB.findOne(triggerQuery, function (err, existingTrigger) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    const triggerData = {
                        minStockLevel: parseInt(req.body.minStock),
                        maxStockLevel: parseInt(req.body.maxStock),
                        autoCreatePO: req.body.autoCreatePO === true,
                        notificationEmail: req.body.notificationEmail ? validator.escape(req.body.notificationEmail) : null
                    };
                    
                    if (existingTrigger) {
                        // Update existing trigger
                        reorderTriggersDB.update(
                            { _id: existingTrigger._id },
                            {
                                $set: {
                                    conditions: triggerData,
                                    isActive: req.body.isActive !== undefined ? req.body.isActive : true,
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
                                
                                res.json({
                                    message: "Reorder monitoring updated successfully.",
                                    trigger: {
                                        ...existingTrigger,
                                        ...triggerData,
                                        isActive: req.body.isActive !== undefined ? req.body.isActive : true
                                    }
                                });
                            }
                        );
                    } else {
                        // Create new trigger
                        const newTrigger = {
                            _id: Math.floor(Date.now() / 1000),
                            productId: productId,
                            productName: product.name,
                            storeId: storeId,
                            triggerType: 'STOCK_LEVEL',
                            frequency: 'REAL_TIME',
                            conditions: triggerData,
                            isActive: req.body.isActive !== undefined ? req.body.isActive : true,
                            lastTriggered: null,
                            triggerCount: 0,
                            createdBy: req.body.createdBy ? parseInt(req.body.createdBy) : null,
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        
                        reorderTriggersDB.insert(newTrigger, function (err, trigger) {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({
                                    error: "Internal Server Error",
                                    message: "An unexpected error occurred.",
                                });
                            }
                            
                            res.status(201).json({
                                message: "Reorder monitoring set up successfully.",
                                trigger: trigger
                            });
                        });
                    }
                });
            }).catch(error => {
                console.error("Error accessing reorder-triggers database:", error);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to access reorder triggers database.",
                });
            });
        });
    } catch (error) {
        console.error("Error in setup-monitoring endpoint:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to set up reorder monitoring.",
        });
    }
});

/**
 * Helper function to check trigger condition (imported from reorder-triggers)
 *
 * @param {Object} trigger trigger object
 * @param {function} callback callback function
 * @returns {void}
 */
function checkTriggerCondition(trigger, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    if (trigger.triggerType === 'STOCK_LEVEL') {
        // Check stock level
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
        
        if (trigger.storeId) {
            // Check store inventory
            const storeInventoryDbPath = path.join(
                process.env.APPDATA,
                process.env.APPNAME,
                "server",
                "databases",
                "store-inventory.db",
            );
            
            const storeInventoryDB = new Datastore({
                filename: storeInventoryDbPath,
                autoload: true,
            });
            
            storeInventoryDB.findOne({
                productId: trigger.productId,
                storeId: trigger.storeId
            }, function(err, storeInventory) {
                if (err) {
                    return callback(err);
                }
                
                const currentQuantity = storeInventory ? parseInt(storeInventory.quantity) || 0 : 0;
                const shouldTrigger = currentQuantity <= trigger.conditions.minStockLevel;
                
                callback(null, shouldTrigger, {
                    currentQuantity: currentQuantity,
                    threshold: trigger.conditions.minStockLevel
                });
            });
        } else {
            // Check main inventory
            inventoryDB.findOne({ _id: trigger.productId }, function(err, product) {
                if (err) {
                    return callback(err);
                }
                
                const currentQuantity = product ? parseInt(product.quantity) || 0 : 0;
                const shouldTrigger = currentQuantity <= trigger.conditions.minStockLevel;
                
                callback(null, shouldTrigger, {
                    currentQuantity: currentQuantity,
                    threshold: trigger.conditions.minStockLevel
                });
            });
        }
    } else {
        // Other trigger types would be implemented here
        callback(null, false, {});
    }
}

/**
 * Helper function to create reorder suggestion from trigger
 *
 * @param {Object} trigger trigger object
 * @param {Object} data trigger data
 * @param {function} callback callback function
 * @returns {void}
 */
function createReorderSuggestionFromTrigger(trigger, data, callback) {
    const reorderSuggestions = require("./reorder-suggestions");
    
    // Get product details
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
    
    inventoryDB.findOne({ _id: trigger.productId }, function(err, product) {
        if (err) {
            return callback(err);
        }
        
        if (!product) {
            return callback(new Error("Product not found"));
        }
        
        // Calculate suggested quantity based on trigger data
        let suggestedQuantity = 0;
        let priority = 'MEDIUM';
        
        if (trigger.triggerType === 'STOCK_LEVEL') {
            const currentQuantity = data.currentQuantity || 0;
            const minStock = trigger.conditions.minStockLevel || 0;
            
            if (currentQuantity === 0) {
                priority = 'CRITICAL';
                suggestedQuantity = minStock * 2;
            } else if (currentQuantity <= minStock * 0.5) {
                priority = 'HIGH';
                suggestedQuantity = (minStock * 1.5) - currentQuantity;
            } else {
                priority = 'MEDIUM';
                suggestedQuantity = minStock - currentQuantity;
            }
        }
        
        // Get preferred supplier
        getPreferredSupplier(trigger.productId, function(err, supplier) {
            if (err) {
                console.error(err);
                return callback(err);
            }
            
            // Create reorder suggestion
            const reorderSuggestionsDbPath = path.join(
                process.env.APPDATA,
                process.env.APPNAME,
                "server",
                "databases",
                "reorder-suggestions.db",
            );
            
            const reorderSuggestionsDB = new Datastore({
                filename: reorderSuggestionsDbPath,
                autoload: true,
            });
            
            const newSuggestion = {
                _id: Math.floor(Date.now() / 1000) + Math.random(),
                productId: trigger.productId,
                productName: product.name,
                currentQuantity: data.currentQuantity || 0,
                minStock: trigger.conditions.minStockLevel || 0,
                suggestedQuantity: suggestedQuantity,
                priority: priority,
                suggestionType: 'STOCK_LEVEL',
                supplierId: supplier ? supplier._id : null,
                supplierName: supplier ? supplier.name : null,
                lastPurchasePrice: product.price || 0,
                estimatedCost: (product.price || 0) * suggestedQuantity,
                storeId: trigger.storeId,
                isDismissed: false,
                dismissedAt: null,
                dismissalReason: null,
                triggerId: trigger._id,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            reorderSuggestionsDB.insert(newSuggestion, function (err, suggestion) {
                if (err) {
                    return callback(err);
                }
                
                callback(null, suggestion);
            });
        });
    });
}

/**
 * Helper function to get preferred supplier for a product (imported from reorder-suggestions)
 *
 * @param {number} productId product ID
 * @param {function} callback callback function
 * @returns {void}
 */
function getPreferredSupplier(productId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Check batches for supplier information
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
    
    batchesDB.findOne({ productId: productId, supplierId: { $ne: null } }, function (err, batch) {
        if (err) {
            return callback(err);
        }
        
        if (batch && batch.supplierId) {
            // Get supplier details
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
            
            suppliersDB.findOne({ _id: batch.supplierId }, function (err, supplier) {
                if (err) {
                    return callback(err);
                }
                
                callback(null, supplier);
            });
        } else {
            callback(null, null);
        }
    });
}

/**
 * Helper function to get alert severity
 *
 * @param {number} currentQuantity current quantity
 * @param {number} minStock minimum stock level
 * @param {Object} trigger trigger object
 * @returns {string} alert severity
 */
function getAlertSeverity(currentQuantity, minStock, trigger) {
    if (currentQuantity === 0) {
        return 'CRITICAL';
    } else if (currentQuantity <= minStock * 0.3) {
        return 'HIGH';
    } else if (currentQuantity <= minStock * 0.7) {
        return 'MEDIUM';
    } else {
        return 'LOW';
    }
}

/**
 * Helper function to get alert message
 *
 * @param {number} currentQuantity current quantity
 * @param {number} minStock minimum stock level
 * @param {Object} trigger trigger object
 * @param {Object} data trigger data
 * @returns {string} alert message
 */
function getAlertMessage(currentQuantity, minStock, trigger, data) {
    if (trigger.triggerType === 'STOCK_LEVEL') {
        if (currentQuantity === 0) {
            return `Product is out of stock. Immediate reorder required.`;
        } else if (currentQuantity <= minStock * 0.3) {
            return `Stock level critically low (${currentQuantity}/${minStock}). Urgent reorder recommended.`;
        } else if (currentQuantity <= minStock * 0.7) {
            return `Stock level low (${currentQuantity}/${minStock}). Reorder recommended.`;
        } else {
            return `Stock level approaching minimum (${currentQuantity}/${minStock}). Monitor closely.`;
        }
    } else {
        return `Reorder trigger activated for ${trigger.triggerType}.`;
    }
}

/**
 * Helper function to get stock status
 *
 * @param {number} currentQuantity current quantity
 * @param {number} minStock minimum stock level
 * @returns {string} stock status
 */
function getStockStatus(currentQuantity, minStock) {
    if (currentQuantity === 0) {
        return 'OUT_OF_STOCK';
    } else if (currentQuantity <= minStock * 0.5) {
        return 'CRITICAL';
    } else if (currentQuantity <= minStock * 0.8) {
        return 'LOW';
    } else if (currentQuantity <= minStock) {
        return 'MINIMUM';
    } else {
        return 'ADEQUATE';
    }
}

module.exports.updateBatchQuantity = updateBatchQuantity;
module.exports.getProductWithBatches = getProductWithBatches;
module.exports.setCurrentStoreId = setCurrentStoreId;
module.exports.getCurrentStoreId = getCurrentStoreId;