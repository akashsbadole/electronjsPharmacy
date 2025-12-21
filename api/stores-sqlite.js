const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const validator = require("validator");
const sqliteDBManager = require('./sqlite-db-manager');

router.use(bodyParser.json());
module.exports = router;

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
        
        // Verify tables exist
        const tableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='stores'
        `);
        
        if (!tableExists) {
            console.log("Stores table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS stores (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_code VARCHAR(10) UNIQUE NOT NULL,
                    store_name VARCHAR(100) NOT NULL,
                    store_type VARCHAR(20) DEFAULT 'RETAIL',
                    address_line1 VARCHAR(200),
                    address_line2 VARCHAR(200),
                    city VARCHAR(50),
                    state VARCHAR(50),
                    country VARCHAR(50) DEFAULT 'India',
                    pincode VARCHAR(6),
                    phone VARCHAR(15),
                    email VARCHAR(100),
                    gst_number VARCHAR(15),
                    drug_license_number VARCHAR(20),
                    store_timings TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    is_central BOOLEAN DEFAULT 0,
                    parent_store_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (parent_store_id) REFERENCES stores(id)
                )
            `);
        }
        
        dbInitialized = true;
        console.log("Stores SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize stores SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in stores module:", err);
});

/**
 * GET endpoint: Get welcome message for Stores API.
 */
router.get("/", function (req, res) {
    res.send("Stores API (SQLite)");
});

/**
 * GET endpoint: Get all stores.
 */
router.get("/all", async function (req, res) {
    try {
        await initializeDatabase();
        
        const stores = await sqliteDBManager.all(`
            SELECT * FROM stores WHERE is_active = 1 ORDER BY store_name
        `);
        
        res.send(stores);
    } catch (error) {
        console.error("Error getting all stores:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get a specific store by ID.
 */
router.get("/:storeId", async function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }
    
    try {
        await initializeDatabase();
        const storeId = parseInt(req.params.storeId);
        
        const store = await sqliteDBManager.get(`
            SELECT * FROM stores WHERE id = ? AND is_active = 1
        `, [storeId]);
        
        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }
        
        res.send(store);
    } catch (error) {
        console.error("Error getting store:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create a new store.
 */
router.post("/create", async function (req, res) {
    try {
        await initializeDatabase();
        
        // Validate required fields
        if (!req.body.name || validator.isEmpty(req.body.name.trim())) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Store name is required.",
            });
        }
        
        if (!req.body.code || validator.isEmpty(req.body.code.trim())) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Store code is required.",
            });
        }
        
        const storeCode = validator.escape(req.body.code.trim());
        const storeName = validator.escape(req.body.name.trim());
        
        // Check if store code already exists
        const existingStore = await sqliteDBManager.get(`
            SELECT id FROM stores WHERE store_code = ?
        `, [storeCode]);
        
        if (existingStore) {
            return res.status(409).json({
                error: "Conflict",
                message: "Store code already exists.",
            });
        }
        
        const newStore = {
            store_code: storeCode,
            store_name: storeName,
            store_type: req.body.storeType ? validator.escape(req.body.storeType) : 'RETAIL',
            address_line1: req.body.address ? validator.escape(req.body.address) : null,
            address_line2: req.body.address2 ? validator.escape(req.body.address2) : null,
            city: req.body.city ? validator.escape(req.body.city) : null,
            state: req.body.state ? validator.escape(req.body.state) : null,
            country: req.body.country ? validator.escape(req.body.country) : 'India',
            pincode: req.body.pincode ? validator.escape(req.body.pincode) : null,
            phone: req.body.phone ? validator.escape(req.body.phone) : null,
            email: req.body.email ? validator.escape(req.body.email) : null,
            gst_number: req.body.gstNumber ? validator.escape(req.body.gstNumber) : null,
            drug_license_number: req.body.drugLicenseNumber ? validator.escape(req.body.drugLicenseNumber) : null,
            store_timings: req.body.storeTimings ? validator.escape(req.body.storeTimings) : null,
            is_active: 1,
            is_central: req.body.isMainStore === true || req.body.isMainStore === "true" ? 1 : 0,
            parent_store_id: req.body.parentStoreId ? parseInt(req.body.parentStoreId) : null
        };
        
        const result = await sqliteDBManager.run(`
            INSERT INTO stores (
                store_code, store_name, store_type, address_line1, address_line2,
                city, state, country, pincode, phone, email, gst_number,
                drug_license_number, store_timings, is_active, is_central,
                parent_store_id, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            newStore.store_code, newStore.store_name, newStore.store_type,
            newStore.address_line1, newStore.address_line2, newStore.city,
            newStore.state, newStore.country, newStore.pincode, newStore.phone,
            newStore.email, newStore.gst_number, newStore.drug_license_number,
            newStore.store_timings, newStore.is_active, newStore.is_central,
            newStore.parent_store_id, new Date().toISOString(), new Date().toISOString()
        ]);
        
        const storeId = result.lastID;
        
        // Return the created store
        const createdStore = await sqliteDBManager.get(`
            SELECT * FROM stores WHERE id = ?
        `, [storeId]);
        
        res.status(201).send(createdStore);
    } catch (error) {
        console.error("Error creating store:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update an existing store.
 */
router.put("/:storeId", async function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }
    
    try {
        await initializeDatabase();
        const storeId = parseInt(req.params.storeId);
        
        // Check if store exists
        const existingStore = await sqliteDBManager.get(`
            SELECT id, store_code, is_central FROM stores WHERE id = ? AND is_active = 1
        `, [storeId]);
        
        if (!existingStore) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }
        
        // If updating code, check if it's already used by another store
        if (req.body.code && req.body.code !== existingStore.store_code) {
            const codeExists = await sqliteDBManager.get(`
                SELECT id FROM stores WHERE store_code = ? AND id != ?
            `, [validator.escape(req.body.code), storeId]);
            
            if (codeExists) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Store code already exists.",
                });
            }
        }
        
        const updateData = {
            store_code: req.body.code ? validator.escape(req.body.code) : existingStore.store_code,
            store_name: req.body.name ? validator.escape(req.body.name) : existingStore.store_name,
            store_type: req.body.storeType ? validator.escape(req.body.storeType) : existingStore.store_type,
            address_line1: req.body.address !== undefined ? validator.escape(req.body.address) : existingStore.address_line1,
            address_line2: req.body.address2 !== undefined ? validator.escape(req.body.address2) : existingStore.address_line2,
            city: req.body.city !== undefined ? validator.escape(req.body.city) : existingStore.city,
            state: req.body.state !== undefined ? validator.escape(req.body.state) : existingStore.state,
            country: req.body.country !== undefined ? validator.escape(req.body.country) : existingStore.country,
            pincode: req.body.pincode !== undefined ? validator.escape(req.body.pincode) : existingStore.pincode,
            phone: req.body.phone !== undefined ? validator.escape(req.body.phone) : existingStore.phone,
            email: req.body.email !== undefined ? validator.escape(req.body.email) : existingStore.email,
            gst_number: req.body.gstNumber !== undefined ? validator.escape(req.body.gstNumber) : existingStore.gst_number,
            drug_license_number: req.body.drugLicenseNumber !== undefined ? validator.escape(req.body.drugLicenseNumber) : existingStore.drug_license_number,
            store_timings: req.body.storeTimings !== undefined ? validator.escape(req.body.storeTimings) : existingStore.store_timings,
            is_central: req.body.isMainStore !== undefined ? 
                (req.body.isMainStore === true || req.body.isMainStore === "true" ? 1 : 0) : 
                existingStore.is_central,
            parent_store_id: req.body.parentStoreId !== undefined ? 
                (req.body.parentStoreId ? parseInt(req.body.parentStoreId) : null) : 
                existingStore.parent_store_id
        };
        
        await sqliteDBManager.run(`
            UPDATE stores SET
                store_code = ?, store_name = ?, store_type = ?, address_line1 = ?,
                address_line2 = ?, city = ?, state = ?, country = ?, pincode = ?,
                phone = ?, email = ?, gst_number = ?, drug_license_number = ?,
                store_timings = ?, is_central = ?, parent_store_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            updateData.store_code, updateData.store_name, updateData.store_type,
            updateData.address_line1, updateData.address_line2, updateData.city,
            updateData.state, updateData.country, updateData.pincode,
            updateData.phone, updateData.email, updateData.gst_number,
            updateData.drug_license_number, updateData.store_timings,
            updateData.is_central, updateData.parent_store_id, storeId
        ]);
        
        res.json({ message: "Store updated successfully." });
    } catch (error) {
        console.error("Error updating store:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Deactivate a store (soft delete).
 */
router.delete("/:storeId", async function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }
    
    try {
        await initializeDatabase();
        const storeId = parseInt(req.params.storeId);
        
        // Check if store exists
        const store = await sqliteDBManager.get(`
            SELECT id, is_central FROM stores WHERE id = ? AND is_active = 1
        `, [storeId]);
        
        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }
        
        // Don't allow deactivation of central store
        if (store.is_central) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot deactivate central store.",
            });
        }
        
        // Soft delete by setting is_active to 0
        await sqliteDBManager.run(`
            UPDATE stores SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [storeId]);
        
        res.json({ message: "Store deactivated successfully." });
    } catch (error) {
        console.error("Error deactivating store:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get central store.
 */
router.get("/central", async function (req, res) {
    try {
        await initializeDatabase();
        
        const store = await sqliteDBManager.get(`
            SELECT * FROM stores WHERE is_central = 1 AND is_active = 1
        `);
        
        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Central store not found.",
            });
        }
        
        res.send(store);
    } catch (error) {
        console.error("Error getting central store:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Set a store as central store.
 */
router.post("/set-central", async function (req, res) {
    if (!req.body.storeId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Store ID is required.",
        });
    }
    
    try {
        await initializeDatabase();
        const storeId = parseInt(req.body.storeId);
        
        // Check if store exists
        const store = await sqliteDBManager.get(`
            SELECT id FROM stores WHERE id = ? AND is_active = 1
        `, [storeId]);
        
        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }
        
        // Start transaction to ensure data consistency
        await sqliteDBManager.transaction(async (trx) => {
            // First, unset all stores from being central
            await trx.run(`
                UPDATE stores SET is_central = 0, updated_at = CURRENT_TIMESTAMP
            `);
            
            // Then set new central store
            await trx.run(`
                UPDATE stores SET is_central = 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [storeId]);
        });
        
        res.json({ message: "Central store updated successfully." });
    } catch (error) {
        console.error("Error setting central store:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get child stores of a parent store.
 */
router.get("/parent/:parentId", async function (req, res) {
    if (!req.params.parentId) {
        return res.status(400).send("Parent store ID is required.");
    }
    
    try {
        await initializeDatabase();
        const parentId = parseInt(req.params.parentId);
        
        const stores = await sqliteDBManager.all(`
            SELECT * FROM stores 
            WHERE parent_store_id = ? AND is_active = 1
            ORDER BY store_name
        `, [parentId]);
        
        res.send(stores);
    } catch (error) {
        console.error("Error getting child stores:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Search stores by name or code.
 */
router.get("/search/:query", async function (req, res) {
    try {
        await initializeDatabase();
        const query = req.params.query;
        
        const stores = await sqliteDBManager.all(`
            SELECT * FROM stores 
            WHERE is_active = 1 AND (
                store_name LIKE ? OR 
                store_code LIKE ? OR
                city LIKE ?
            )
            ORDER BY store_name
        `, [`%${query}%`, `%${query}%`, `%${query}%`]);
        
        res.send(stores);
    } catch (error) {
        console.error("Error searching stores:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get store statistics.
 */
router.get("/:storeId/stats", async function (req, res) {
    if (!req.params.storeId) {
        return res.status(400).send("Store ID is required.");
    }
    
    try {
        await initializeDatabase();
        const storeId = parseInt(req.params.storeId);
        
        // Check if store exists
        const store = await sqliteDBManager.get(`
            SELECT store_name FROM stores WHERE id = ? AND is_active = 1
        `, [storeId]);
        
        if (!store) {
            return res.status(404).json({
                error: "Not Found",
                message: "Store not found.",
            });
        }
        
        // Get product count
        const productCount = await sqliteDBManager.get(`
            SELECT COUNT(*) as count FROM products WHERE store_id = ?
        `, [storeId]);
        
        // Get transaction count for current month
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
        const transactionCount = await sqliteDBManager.get(`
            SELECT COUNT(*) as count FROM transactions 
            WHERE store_id = ? AND strftime('%Y-%m', transaction_date) = ?
        `, [storeId, currentMonth]);
        
        // Get customer count
        const customerCount = await sqliteDBManager.get(`
            SELECT COUNT(DISTINCT customer_id) as count FROM transactions 
            WHERE store_id = ? AND customer_id IS NOT NULL
        `, [storeId]);
        
        res.json({
            storeName: store.store_name,
            productCount: productCount.count,
            monthlyTransactionCount: transactionCount.count,
            customerCount: customerCount.count
        });
    } catch (error) {
        console.error("Error getting store stats:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});