const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const {filterFile} = require('../assets/js/utils');
const validator = require("validator");
const dbUtils = require('./db-utils');
const sqliteDBManager = require('./sqlite-db-manager');

const validFileTypes = [
    "image/jpg",
    "image/jpeg",
    "image/png",
    "image/webp"
];
const maxFileSize = 2097152; // 2MB = 2*1024*1024

const storage = multer.diskStorage({
    destination: dbUtils.getUploadsDir(),
    filename: function (req, file, callback) {
        callback(null, Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: maxFileSize },
    fileFilter: filterFile,
}).single("imagename");

router.use(bodyParser.json());
module.exports = router;

// Global variable to track current store context
let currentStoreId = null;
let dbInitialized = false;

/**
 * Initialize database connection
 */
async function initializeDatabase() {
    if (dbInitialized) return;
    
    try {
        // Ensure SQLite database is initialized
        const db = sqliteDBManager.getDatabase();
        if (!db) {
            await sqliteDBManager.initialize();
        }
        
        // Verify tables exist and have data
        const tableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='products'
        `);
        
        if (!tableExists) {
            console.log("Products table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS products (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id INTEGER NOT NULL,
                    sku VARCHAR(50) UNIQUE,
                    barcode VARCHAR(50),
                    name VARCHAR(200) NOT NULL,
                    generic_name VARCHAR(200),
                    manufacturer VARCHAR(100),
                    category_id INTEGER,
                    description TEXT,
                    hsn_code VARCHAR(8),
                    schedule_category VARCHAR(20),
                    is_prescription_required BOOLEAN DEFAULT 0,
                    is_narcotic BOOLEAN DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    image_url VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sync_version INTEGER DEFAULT 1
                )
            `);
        }
        
        // Check if store_inventory table exists
        const storeInventoryTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='store_inventory'
        `);
        
        if (!storeInventoryTableExists) {
            console.log("Store inventory table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS store_inventory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    store_id INTEGER NOT NULL,
                    quantity INTEGER DEFAULT 0,
                    min_stock INTEGER DEFAULT 0,
                    max_stock INTEGER DEFAULT 0,
                    reorder_quantity INTEGER DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_by VARCHAR(50) DEFAULT 'system',
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (store_id) REFERENCES stores(id),
                    UNIQUE(product_id, store_id)
                )
            `);
        }
        
        // Check if product_pricing table exists
        const productPricingTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='product_pricing'
        `);
        
        if (!productPricingTableExists) {
            console.log("Product pricing table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS product_pricing (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    store_id INTEGER NOT NULL,
                    purchase_price DECIMAL(12,2) DEFAULT 0.00,
                    selling_price DECIMAL(12,2) DEFAULT 0.00,
                    mrp DECIMAL(12,2) DEFAULT 0.00,
                    gst_rate DECIMAL(5,2) DEFAULT 0.00,
                    effective_date DATE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (store_id) REFERENCES stores(id),
                    UNIQUE(product_id, store_id, effective_date)
                )
            `);
        }
        
        // Check if product_batches table exists
        const productBatchesTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='product_batches'
        `);
        
        if (!productBatchesTableExists) {
            console.log("Product batches table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS product_batches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    product_id INTEGER NOT NULL,
                    batch_number VARCHAR(50) NOT NULL,
                    manufacture_date DATE,
                    expiry_date DATE,
                    initial_quantity INTEGER DEFAULT 0,
                    current_quantity INTEGER DEFAULT 0,
                    cost_price DECIMAL(12,2) DEFAULT 0.00,
                    supplier_id INTEGER,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `);
        }
        
        dbInitialized = true;
        console.log("Inventory SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize inventory SQLite database:", error);
        throw error;
    }
}

// Initialize database immediately
initializeDatabase().catch(err => {
    console.error("Database initialization failed in inventory module:", err);
});

/**
 * Get current store ID from context or default store
 * @returns {number} store ID
 */
function getCurrentStoreId() {
    return currentStoreId || 1; // Default to store ID 1
}

/**
 * Set current store context
 * @param {number} storeId store ID
 */
function setCurrentStoreId(storeId) {
    currentStoreId = parseInt(storeId);
}

/**
 * Helper function to get store-specific inventory for a product
 * @param {number} productId product ID
 * @param {number} storeId store ID (optional)
 * @returns {Promise<Object>} store inventory record
 */
async function getStoreInventory(productId, storeId = null) {
    const targetStoreId = storeId || getCurrentStoreId();
    
    try {
        const result = await sqliteDBManager.get(`
            SELECT * FROM store_inventory
            WHERE product_id = ? AND store_id = ?
        `, [productId, targetStoreId]);
        
        return result;
    } catch (error) {
        console.error("Error getting store inventory:", error);
        throw error;
    }
}

/**
 * Helper function to update store inventory quantity
 * @param {number} productId product ID
 * @param {number} quantity new quantity
 * @param {number} storeId store ID (optional)
 * @returns {Promise<void>}
 */
async function updateStoreInventory(productId, quantity, storeId = null) {
    const targetStoreId = storeId || getCurrentStoreId();
    
    try {
        // Check if store inventory record exists
        const existing = await getStoreInventory(productId, targetStoreId);
        
        if (existing) {
            // Update existing record
            await sqliteDBManager.run(`
                UPDATE store_inventory
                SET quantity = ?, last_updated = CURRENT_TIMESTAMP
                WHERE product_id = ? AND store_id = ?
            `, [quantity, productId, targetStoreId]);
        } else {
            // Create new record
            await sqliteDBManager.run(`
                INSERT INTO store_inventory (
                    product_id, store_id, quantity, min_stock, max_stock,
                    reorder_quantity, last_updated, updated_by
                ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'system')
            `, [productId, targetStoreId, quantity, 0, 0, 0]);
        }
    } catch (error) {
        console.error("Error updating store inventory:", error);
        throw error;
    }
}

/**
 * GET endpoint: Get the welcome message for the Inventory API.
 */
router.get("/", function (req, res) {
    res.send("Inventory API (SQLite)");
});

/**
 * GET endpoint: Get product details by product ID.
 */
router.get("/product/:productId", async function (req, res) {
    if (!req.params.productId) {
        return res.status(500).send("ID field is required.");
    }
    
    try {
        await initializeDatabase();
        const productId = parseInt(req.params.productId);
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
        
        // Get product details
        const product = await sqliteDBManager.get(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.id = ?
        `, [productId]);
        
        if (!product) {
            return res.status(404).json({
                error: "Not Found",
                message: "Product not found.",
            });
        }
        
        // Get store-specific inventory
        const storeInventory = await getStoreInventory(productId, storeId);
        
        // Add store-specific quantity to product
        if (storeInventory) {
            product.storeQuantity = storeInventory.quantity;
            product.minStock = storeInventory.min_stock;
            product.maxStock = storeInventory.max_stock;
            product.reorderQuantity = storeInventory.reorder_quantity;
        } else {
            product.storeQuantity = 0;
        }
        
        res.send(product);
    } catch (error) {
        console.error("Error getting product:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get details of all products.
 */
router.get("/products", async function (req, res) {
    try {
        await initializeDatabase();
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
        
        // Get all products
        const products = await sqliteDBManager.all(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            ORDER BY p.name
        `);
        
        // Debug: Log products count
        console.log(`Found ${products ? products.length : 0} products`);
        
        // Get store inventory for all products
        const storeInventories = await sqliteDBManager.all(`
            SELECT * FROM store_inventory
            WHERE store_id = ?
        `, [storeId]);
        
        // Debug: Log store inventory count
        console.log(`Found ${storeInventories ? storeInventories.length : 0} store inventory records`);
        
        // Merge store inventory data with products
        const productsWithStoreData = (products || []).map(product => {
            const storeInventory = storeInventories.find(si => si.product_id === product.id);
            
            if (storeInventory) {
                product.storeQuantity = storeInventory.quantity;
                product.minStock = storeInventory.min_stock;
                product.maxStock = storeInventory.max_stock;
                product.reorderQuantity = storeInventory.reorder_quantity;
            } else {
                product.storeQuantity = 0;
            }
            
            return product;
        });
        
        // Ensure we always return an array
        res.json(productsWithStoreData || []);
    } catch (error) {
        console.error("Error getting products:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create or update a product.
 */
router.post("/product", async function (req, res) {
    upload(req, res, async function (err) {
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

        try {
            await initializeDatabase();
            const db = sqliteDBManager.getDatabase();
            const storeId = req.body.storeId ? parseInt(req.body.storeId) : getCurrentStoreId();
            
            // Validate required fields
            if (!req.body.name || validator.escape(req.body.name) === "") {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Product name is required.",
                });
            }
            
            let image = "";
            if (req.body.img && validator.escape(req.body.img) !== "") {
                image = validator.escape(req.body.img);
            }
            if (req.file) {
                image = req.file.filename;
            }

            if (req.body.remove && validator.escape(req.body.remove) === "1") {
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
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
            }

            const productData = {
                store_id: 1, // Default store
                sku: req.body.sku || null,
                barcode: req.body.barcode || null,
                name: req.body.name ? validator.escape(req.body.name) : '',
                generic_name: req.body.genericName || null,
                manufacturer: req.body.manufacturer || null,
                category_id: req.body.category ? parseInt(req.body.category) : null,
                description: req.body.description || null,
                hsn_code: req.body.hsnCode || null,
                schedule_category: req.body.scheduleCategory || null,
                is_prescription_required: req.body.isPrescriptionRequired === "on" ? 1 : 0,
                is_narcotic: req.body.isNarcotic === "on" ? 1 : 0,
                image_url: image
            };

            if (!req.body.id || validator.escape(req.body.id) === "") {
                // Create new product
                const result = await sqliteDBManager.run(`
                    INSERT INTO products (
                        store_id, sku, barcode, name, generic_name, manufacturer,
                        category_id, description, hsn_code, schedule_category,
                        is_prescription_required, is_narcotic, image_url
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    productData.store_id, productData.sku, productData.barcode,
                    productData.name, productData.generic_name, productData.manufacturer,
                    productData.category_id, productData.description, productData.hsn_code,
                    productData.schedule_category, productData.is_prescription_required,
                    productData.is_narcotic, productData.image_url
                ]);
                
                const productId = result.lastID;
                
                // Create store inventory record
                try {
                    await updateStoreInventory(
                        productId,
                        parseInt(req.body.quantity) || 0,
                        storeId
                    );
                } catch (inventoryError) {
                    console.error("Error creating store inventory:", inventoryError);
                    // Don't fail the product creation if inventory creation fails
                }
                
                // Create product pricing record
                try {
                    await sqliteDBManager.run(`
                        INSERT INTO product_pricing (
                            product_id, store_id, purchase_price, selling_price,
                            mrp, gst_rate, effective_date
                        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE)
                    `, [
                        productId, storeId,
                        req.body.purchasePrice || 0,
                        req.body.price || 0,
                        req.body.mrp || 0,
                        req.body.gstRate || 0
                    ]);
                } catch (pricingError) {
                    console.error("Error creating product pricing:", pricingError);
                    // Don't fail the product creation if pricing creation fails
                }
                
                // Return the created product with its ID
                const createdProduct = await sqliteDBManager.get(`
                    SELECT * FROM products WHERE id = ?
                `, [productId]);
                
                res.status(201).json(createdProduct);
            } else {
                // Update existing product
                const productId = parseInt(validator.escape(req.body.id));
                
                await sqliteDBManager.run(`
                    UPDATE products SET
                        sku = ?, barcode = ?, name = ?, generic_name = ?,
                        manufacturer = ?, category_id = ?, description = ?,
                        hsn_code = ?, schedule_category = ?,
                        is_prescription_required = ?, is_narcotic = ?, image_url = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [
                    productData.sku, productData.barcode, productData.name,
                    productData.generic_name, productData.manufacturer,
                    productData.category_id, productData.description,
                    productData.hsn_code, productData.schedule_category,
                    productData.is_prescription_required, productData.is_narcotic,
                    productData.image_url, productId
                ]);
                
                // Update store inventory record
                try {
                    await updateStoreInventory(
                        productId,
                        parseInt(req.body.quantity) || 0,
                        storeId
                    );
                } catch (inventoryError) {
                    console.error("Error updating store inventory:", inventoryError);
                    // Don't fail the product update if inventory update fails
                }
                
                // Update product pricing
                try {
                    await sqliteDBManager.run(`
                        UPDATE product_pricing SET
                            purchase_price = ?, selling_price = ?, mrp = ?,
                            gst_rate = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE product_id = ? AND store_id = ? AND effective_date = CURRENT_DATE
                    `, [
                        req.body.purchasePrice || 0,
                        req.body.price || 0,
                        req.body.mrp || 0,
                        req.body.gstRate || 0,
                        productId, storeId
                    ]);
                } catch (pricingError) {
                    console.error("Error updating product pricing:", pricingError);
                    // Don't fail the product update if pricing update fails
                }
                
                res.sendStatus(200);
            }
        } catch (error) {
            console.error("Error saving product:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
    });
});

/**
 * DELETE endpoint: Delete a product by product ID.
 */
router.delete("/product/:productId", async function (req, res) {
    try {
        await initializeDatabase();
        const productId = parseInt(req.params.productId);
        
        // Delete related records first (foreign key constraints should handle this)
        await sqliteDBManager.run("DELETE FROM products WHERE id = ?", [productId]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Find a product by SKU code.
 */
router.post("/product/sku", async function (req, res) {
    try {
        await initializeDatabase();
        const sku = validator.escape(req.body.skuCode);
        const storeId = req.body.storeId ? parseInt(req.body.storeId) : getCurrentStoreId();
        
        // Find product by barcode or SKU
        const product = await sqliteDBManager.get(`
            SELECT p.*, c.name as category_name
            FROM products p
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE p.barcode = ? OR p.sku = ?
        `, [sku, sku]);
        
        if (!product) {
            return res.status(404).json({
                error: "Not Found",
                message: "Product not found.",
            });
        }
        
        // Get store-specific inventory
        const storeInventory = await getStoreInventory(product.id, storeId);
        
        // Add store-specific quantity to product
        if (storeInventory) {
            product.storeQuantity = storeInventory.quantity;
        } else {
            product.storeQuantity = 0;
        }
        
        res.send(product);
    } catch (error) {
        console.error("Error finding product by SKU:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get product with batch information.
 */
router.get("/product/:productId/batches", async function (req, res) {
    if (!req.params.productId) {
        return res.status(500).send("Product ID field is required.");
    }
    
    try {
        await initializeDatabase();
        const productId = parseInt(req.params.productId);
        
        const batches = await sqliteDBManager.all(`
            SELECT * FROM product_batches
            WHERE product_id = ? AND is_active = 1
            ORDER BY expiry_date ASC
        `, [productId]);
        
        res.json(batches);
    } catch (error) {
        console.error("Error getting product batches:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Update product with reorder threshold management.
 */
router.post("/product/:productId/reorder", async function (req, res) {
    if (!req.params.productId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product ID is required.",
        });
    }
    
    try {
        await initializeDatabase();
        const productId = parseInt(req.params.productId);
        
        // Validate required fields
        if (req.body.minStock === undefined || req.body.maxStock === undefined || req.body.reorderQuantity === undefined) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Min stock, max stock and reorder quantity are required fields.",
            });
        }
        
        // Check if product exists
        const product = await sqliteDBManager.get("SELECT id FROM products WHERE id = ?", [productId]);
        if (!product) {
            return res.status(404).json({
                error: "Not Found",
                message: "Product not found.",
            });
        }
        
        // Update store inventory with reorder settings
        const storeId = req.body.storeId ? parseInt(req.body.storeId) : getCurrentStoreId();
        
        await sqliteDBManager.run(`
            UPDATE store_inventory SET
                min_stock = ?, max_stock = ?, reorder_quantity = ?,
                last_updated = CURRENT_TIMESTAMP
            WHERE product_id = ? AND store_id = ?
        `, [
            parseInt(req.body.minStock),
            parseInt(req.body.maxStock),
            parseInt(req.body.reorderQuantity),
            productId, storeId
        ]);
        
        res.json({ message: "Product reorder settings updated successfully." });
    } catch (error) {
        console.error("Error updating reorder settings:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get products with low stock levels.
 */
router.get("/low-stock", async function (req, res) {
    try {
        await initializeDatabase();
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : getCurrentStoreId();
        
        // Get low stock items
        const lowStockItems = await sqliteDBManager.all(`
            SELECT si.*, p.name, p.barcode, p.sku
            FROM store_inventory si
            JOIN products p ON si.product_id = p.id
            WHERE si.store_id = ? AND si.quantity <= si.min_stock
        `, [storeId]);
        
        res.json(lowStockItems);
    } catch (error) {
        console.error("Error getting low stock items:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * Decrement inventory quantities based on a list of products in a transaction.
 * Enhanced to support batch tracking.
 */
router.decrementInventory = async function (products, options = {}) {
    const useBatchTracking = options.useBatchTracking !== false; // Default to true
    const storeId = options.storeId || getCurrentStoreId();
    
    try {
        await initializeDatabase();
        
        // Process each product
        for (const transactionProduct of products) {
            const productId = parseInt(transactionProduct.id);
            const quantity = parseInt(transactionProduct.quantity);
            
            // Get current store inventory
            const storeInventory = await getStoreInventory(productId, storeId);
            
            if (!storeInventory) {
                throw new Error("Store inventory not found for product " + productId);
            }
            
            const newQuantity = storeInventory.quantity - quantity;
            
            if (newQuantity < 0) {
                throw new Error("Insufficient inventory in store for product " + productId);
            }
            
            // Update store inventory
            await updateStoreInventory(productId, newQuantity, storeId);
            
            // If batch tracking is enabled, update batch quantities
            if (useBatchTracking && transactionProduct.batchId) {
                await sqliteDBManager.run(`
                    UPDATE product_batches
                    SET current_quantity = current_quantity - ?
                    WHERE id = ?
                `, [quantity, transactionProduct.batchId]);
            }
        }
    } catch (error) {
        console.error("Error decrementing inventory:", error);
        throw error;
    }
};

// Add new endpoint to set current store context
router.post("/set-store", function (req, res) {
    if (!req.body.storeId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID is required.",
        });
    }
    
    const storeId = parseInt(req.body.storeId);
    setCurrentStoreId(storeId);
    
    res.json({
        message: "Store context updated successfully.",
        storeId: storeId
    });
});

// Add endpoint to get current store context
router.get("/current-store", function (req, res) {
    const storeId = getCurrentStoreId();
    
    res.json({
        storeId: storeId,
        message: "Current store context"
    });
});

// Export helper functions for use in other modules
module.exports.decrementInventory = router.decrementInventory;
module.exports.setCurrentStoreId = setCurrentStoreId;
module.exports.getCurrentStoreId = getCurrentStoreId;
module.exports.getStoreInventory = getStoreInventory;
module.exports.updateStoreInventory = updateStoreInventory;