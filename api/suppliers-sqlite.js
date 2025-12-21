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
            WHERE type='table' AND name='suppliers'
        `);
        
        if (!tableExists) {
            console.log("Suppliers table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS suppliers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(200) NOT NULL,
                    contact_person VARCHAR(100),
                    phone VARCHAR(15),
                    email VARCHAR(100),
                    gst_number VARCHAR(15),
                    pan_number VARCHAR(10),
                    drug_license_number VARCHAR(20),
                    address TEXT,
                    city VARCHAR(50),
                    state VARCHAR(50),
                    pincode VARCHAR(6),
                    payment_terms VARCHAR(100),
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Create indexes for better performance
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_suppliers_gst_number ON suppliers(gst_number)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_suppliers_pan_number ON suppliers(pan_number)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active)');
        }
        
        // Check if supplier_accounts table exists
        const supplierAccountsTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='supplier_accounts'
        `);
        
        if (!supplierAccountsTableExists) {
            console.log("Supplier accounts table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS supplier_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_id INTEGER NOT NULL,
                    credit_limit DECIMAL(12,2) DEFAULT 0.00,
                    balance DECIMAL(12,2) DEFAULT 0.00,
                    payment_term_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                    UNIQUE(supplier_id)
                )
            `);
        }
        
        dbInitialized = true;
        console.log("Suppliers SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize suppliers SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in suppliers module:", err);
});

/**
 * GET endpoint: Get welcome message for Suppliers API.
 */
router.get("/", function (req, res) {
    res.send("Suppliers API (SQLite)");
});

/**
 * GET endpoint: Retrieve suppliers with pagination.
 */
router.get("/", async function (req, res) {
    try {
        await initializeDatabase();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // Build query based on filters
        let whereClause = "WHERE 1=1";
        let params = [];
        
        if (req.query.isActive !== undefined) {
            whereClause += " AND s.is_active = ?";
            params.push(req.query.isActive === 'true' ? 1 : 0);
        }
        
        // Get suppliers with account information
        const suppliers = await sqliteDBManager.all(`
            SELECT s.*, 
                   sa.credit_limit, sa.balance, sa.payment_term_id
            FROM suppliers s
            LEFT JOIN supplier_accounts sa ON s.id = sa.supplier_id
            ${whereClause}
            ORDER BY s.name
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        // Get total count for pagination
        const countResult = await sqliteDBManager.get(`
            SELECT COUNT(*) as total
            FROM suppliers s
            ${whereClause}
        `, params);
        
        res.json({
            suppliers: suppliers,
            pagination: {
                total: countResult.total,
                page: page,
                limit: limit,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        console.error("Error getting suppliers:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Add new supplier.
 */
router.post("/", async function (req, res) {
    try {
        await initializeDatabase();
        
        // Validate required fields
        if (!req.body.name) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Supplier name is a required field.",
            });
        }
        
        // Check if supplier with same name already exists
        const existingSupplier = await sqliteDBManager.get(`
            SELECT id FROM suppliers WHERE name = ?
        `, [validator.escape(req.body.name)]);
        
        if (existingSupplier) {
            return res.status(409).json({
                error: "Conflict",
                message: "A supplier with this name already exists.",
            });
        }
        
        // Check GST number uniqueness if provided
        if (req.body.gstNumber) {
            const existingGst = await sqliteDBManager.get(`
                SELECT id FROM suppliers WHERE gst_number = ?
            `, [validator.escape(req.body.gstNumber)]);
            
            if (existingGst) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "A supplier with this GST number already exists.",
                });
            }
        }
        
        // Create new supplier
        const result = await sqliteDBManager.run(`
            INSERT INTO suppliers (
                name, contact_person, phone, email, gst_number, pan_number,
                drug_license_number, address, city, state, pincode,
                payment_terms, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            validator.escape(req.body.name),
            req.body.contactPerson ? validator.escape(req.body.contactPerson) : null,
            req.body.phone ? validator.escape(req.body.phone) : null,
            req.body.email ? validator.escape(req.body.email) : null,
            req.body.gstNumber ? validator.escape(req.body.gstNumber) : null,
            req.body.panNumber ? validator.escape(req.body.panNumber) : null,
            req.body.drugLicenseNumber ? validator.escape(req.body.drugLicenseNumber) : null,
            req.body.address ? validator.escape(req.body.address) : null,
            req.body.city ? validator.escape(req.body.city) : null,
            req.body.state ? validator.escape(req.body.state) : null,
            req.body.pincode ? validator.escape(req.body.pincode) : null,
            req.body.paymentTerms ? validator.escape(req.body.paymentTerms) : null,
            req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : 1,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        const supplierId = result.lastID;
        
        // Create supplier account if credit limit is provided
        if (req.body.creditLimit !== undefined) {
            await sqliteDBManager.run(`
                INSERT INTO supplier_accounts (
                    supplier_id, credit_limit, balance, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?)
            `, [
                supplierId,
                parseFloat(req.body.creditLimit) || 0,
                0,
                new Date().toISOString(),
                new Date().toISOString()
            ]);
        }
        
        // Return created supplier
        const createdSupplier = await sqliteDBManager.get(`
            SELECT s.*, 
                   sa.credit_limit, sa.balance, sa.payment_term_id
            FROM suppliers s
            LEFT JOIN supplier_accounts sa ON s.id = sa.supplier_id
            WHERE s.id = ?
        `, [supplierId]);
        
        res.status(201).json(createdSupplier);
    } catch (error) {
        console.error("Error creating supplier:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get specific supplier by ID.
 */
router.get("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const supplierId = parseInt(req.params.id);
        
        const supplier = await sqliteDBManager.get(`
            SELECT s.*, 
                   sa.credit_limit, sa.balance, sa.payment_term_id
            FROM suppliers s
            LEFT JOIN supplier_accounts sa ON s.id = sa.supplier_id
            WHERE s.id = ?
        `, [supplierId]);
        
        if (!supplier) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier not found.",
            });
        }
        
        res.json(supplier);
    } catch (error) {
        console.error("Error getting supplier:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update supplier.
 */
router.put("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const supplierId = parseInt(req.params.id);
        
        // Check if supplier exists
        const existingSupplier = await sqliteDBManager.get(`
            SELECT id FROM suppliers WHERE id = ?
        `, [supplierId]);
        
        if (!existingSupplier) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier not found.",
            });
        }
        
        // Check for duplicate name if it's being changed
        if (req.body.name) {
            const duplicateSupplier = await sqliteDBManager.get(`
                SELECT id FROM suppliers WHERE name = ? AND id != ?
            `, [validator.escape(req.body.name), supplierId]);
            
            if (duplicateSupplier) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "A supplier with this name already exists.",
                });
            }
        }
        
        // Check GST number uniqueness if it's being changed
        if (req.body.gstNumber) {
            const duplicateGst = await sqliteDBManager.get(`
                SELECT id FROM suppliers WHERE gst_number = ? AND id != ?
            `, [validator.escape(req.body.gstNumber), supplierId]);
            
            if (duplicateGst) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "A supplier with this GST number already exists.",
                });
            }
        }
        
        // Update supplier
        await sqliteDBManager.run(`
            UPDATE suppliers SET
                name = ?, contact_person = ?, phone = ?, email = ?,
                gst_number = ?, pan_number = ?, drug_license_number = ?,
                address = ?, city = ?, state = ?, pincode = ?,
                payment_terms = ?, is_active = ?, updated_at = ?
            WHERE id = ?
        `, [
            req.body.name ? validator.escape(req.body.name) : null,
            req.body.contactPerson !== undefined ? validator.escape(req.body.contactPerson) : null,
            req.body.phone !== undefined ? validator.escape(req.body.phone) : null,
            req.body.email !== undefined ? validator.escape(req.body.email) : null,
            req.body.gstNumber !== undefined ? validator.escape(req.body.gstNumber) : null,
            req.body.panNumber !== undefined ? validator.escape(req.body.panNumber) : null,
            req.body.drugLicenseNumber !== undefined ? validator.escape(req.body.drugLicenseNumber) : null,
            req.body.address !== undefined ? validator.escape(req.body.address) : null,
            req.body.city !== undefined ? validator.escape(req.body.city) : null,
            req.body.state !== undefined ? validator.escape(req.body.state) : null,
            req.body.pincode !== undefined ? validator.escape(req.body.pincode) : null,
            req.body.paymentTerms !== undefined ? validator.escape(req.body.paymentTerms) : null,
            req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : null,
            new Date().toISOString(),
            supplierId
        ]);
        
        // Update supplier account if credit limit is provided
        if (req.body.creditLimit !== undefined) {
            await sqliteDBManager.run(`
                INSERT OR REPLACE INTO supplier_accounts (
                    supplier_id, credit_limit, balance, updated_at
                ) VALUES (?, ?, ?, ?)
            `, [
                supplierId,
                parseFloat(req.body.creditLimit) || 0,
                0, // Reset balance when updating credit limit
                new Date().toISOString()
            ]);
        }
        
        // Return updated supplier
        const updatedSupplier = await sqliteDBManager.get(`
            SELECT s.*, 
                   sa.credit_limit, sa.balance, sa.payment_term_id
            FROM suppliers s
            LEFT JOIN supplier_accounts sa ON s.id = sa.supplier_id
            WHERE s.id = ?
        `, [supplierId]);
        
        res.json(updatedSupplier);
    } catch (error) {
        console.error("Error updating supplier:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete supplier.
 */
router.delete("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const supplierId = parseInt(req.params.id);
        
        // Check if supplier exists
        const supplier = await sqliteDBManager.get(`
            SELECT id FROM suppliers WHERE id = ?
        `, [supplierId]);
        
        if (!supplier) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier not found.",
            });
        }
        
        // Check if supplier has associated batches or purchase orders
        const batchCount = await sqliteDBManager.get(`
            SELECT COUNT(*) as count FROM product_batches WHERE supplier_id = ?
        `, [supplierId]);
        
        if (batchCount.count > 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete supplier with associated batches. Remove or reassign batches first.",
            });
        }
        
        // Check if purchase orders table exists and has records
        const purchaseOrdersTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='purchase_orders'
        `);
        
        if (purchaseOrdersTableExists) {
            const purchaseOrderCount = await sqliteDBManager.get(`
                SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ?
            `, [supplierId]);
            
            if (purchaseOrderCount.count > 0) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Cannot delete supplier with associated purchase orders. Remove or reassign orders first.",
                });
            }
        }
        
        // Delete supplier account first
        await sqliteDBManager.run(`
            DELETE FROM supplier_accounts WHERE supplier_id = ?
        `, [supplierId]);
        
        // Delete supplier
        await sqliteDBManager.run(`
            DELETE FROM suppliers WHERE id = ?
        `, [supplierId]);
        
        res.json({ message: "Supplier deleted successfully." });
    } catch (error) {
        console.error("Error deleting supplier:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Search suppliers.
 */
router.get("/search/:query", async function (req, res) {
    try {
        await initializeDatabase();
        const query = req.params.query;
        
        const suppliers = await sqliteDBManager.all(`
            SELECT s.*, 
                   sa.credit_limit, sa.balance, sa.payment_term_id
            FROM suppliers s
            LEFT JOIN supplier_accounts sa ON s.id = sa.supplier_id
            WHERE s.name LIKE ? OR s.contact_person LIKE ? OR s.phone LIKE ? 
               OR s.email LIKE ? OR s.gst_number LIKE ?
            ORDER BY s.name
        `, [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`]);
        
        res.json(suppliers);
    } catch (error) {
        console.error("Error searching suppliers:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get active suppliers only.
 */
router.get("/active", async function (req, res) {
    try {
        await initializeDatabase();
        
        const suppliers = await sqliteDBManager.all(`
            SELECT s.*, 
                   sa.credit_limit, sa.balance, sa.payment_term_id
            FROM suppliers s
            LEFT JOIN supplier_accounts sa ON s.id = sa.supplier_id
            WHERE s.is_active = 1
            ORDER BY s.name
        `);
        
        res.json(suppliers);
    } catch (error) {
        console.error("Error getting active suppliers:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Bulk import suppliers.
 */
router.post("/bulk", async function (req, res) {
    try {
        await initializeDatabase();
        
        if (!req.body.suppliers || !Array.isArray(req.body.suppliers)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Suppliers array is required.",
            });
        }
        
        const suppliers = req.body.suppliers;
        const results = {
            success: 0,
            failed: 0,
            errors: []
        };
        
        // Process suppliers one by one to handle duplicates
        for (const supplierData of suppliers) {
            try {
                // Validate required fields
                if (!supplierData.name) {
                    results.failed++;
                    results.errors.push({
                        name: supplierData.name || 'Unknown',
                        error: "Name is required"
                    });
                    continue;
                }
                
                // Check for duplicates
                const existingSupplier = await sqliteDBManager.get(`
                    SELECT id FROM suppliers WHERE name = ?
                `, [validator.escape(supplierData.name)]);
                
                if (existingSupplier) {
                    results.failed++;
                    results.errors.push({
                        name: supplierData.name,
                        error: "Supplier already exists"
                    });
                    continue;
                }
                
                // Create new supplier
                const result = await sqliteDBManager.run(`
                    INSERT INTO suppliers (
                        name, contact_person, phone, email, gst_number, pan_number,
                        drug_license_number, address, city, state, pincode,
                        payment_terms, is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    validator.escape(supplierData.name),
                    supplierData.contactPerson ? validator.escape(supplierData.contactPerson) : null,
                    supplierData.phone ? validator.escape(supplierData.phone) : null,
                    supplierData.email ? validator.escape(supplierData.email) : null,
                    supplierData.gstNumber ? validator.escape(supplierData.gstNumber) : null,
                    supplierData.panNumber ? validator.escape(supplierData.panNumber) : null,
                    supplierData.drugLicenseNumber ? validator.escape(supplierData.drugLicenseNumber) : null,
                    supplierData.address ? validator.escape(supplierData.address) : null,
                    supplierData.city ? validator.escape(supplierData.city) : null,
                    supplierData.state ? validator.escape(supplierData.state) : null,
                    supplierData.pincode ? validator.escape(supplierData.pincode) : null,
                    supplierData.paymentTerms ? validator.escape(supplierData.paymentTerms) : null,
                    supplierData.isActive !== undefined ? (supplierData.isActive ? 1 : 0) : 1,
                    new Date().toISOString(),
                    new Date().toISOString()
                ]);
                
                // Create supplier account if credit limit is provided
                if (supplierData.creditLimit !== undefined) {
                    await sqliteDBManager.run(`
                        INSERT INTO supplier_accounts (
                            supplier_id, credit_limit, balance, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?)
                    `, [
                        result.lastID,
                        parseFloat(supplierData.creditLimit) || 0,
                        0,
                        new Date().toISOString(),
                        new Date().toISOString()
                    ]);
                }
                
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    name: supplierData.name,
                    error: "Failed to insert: " + error.message
                });
            }
        }
        
        res.status(201).json(results);
    } catch (error) {
        console.error("Error in bulk import:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get all suppliers with account information.
 */
router.get("/with-accounts", async function (req, res) {
    try {
        await initializeDatabase();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // Build query based on filters
        let whereClause = "WHERE 1=1";
        let params = [];
        
        if (req.query.isActive !== undefined) {
            whereClause += " AND s.is_active = ?";
            params.push(req.query.isActive === 'true' ? 1 : 0);
        }
        
        const suppliers = await sqliteDBManager.all(`
            SELECT s.*, 
                   sa.credit_limit, sa.balance, sa.payment_term_id
            FROM suppliers s
            LEFT JOIN supplier_accounts sa ON s.id = sa.supplier_id
            ${whereClause}
            ORDER BY s.name
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        const countResult = await sqliteDBManager.get(`
            SELECT COUNT(*) as total
            FROM suppliers s
            ${whereClause}
        `, params);
        
        res.json({
            suppliers: suppliers,
            pagination: {
                total: countResult.total,
                page: page,
                limit: limit,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        console.error("Error getting suppliers with accounts:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create or update supplier account.
 */
router.post("/:id/account", async function (req, res) {
    try {
        await initializeDatabase();
        const supplierId = parseInt(req.params.id);
        
        // Check if supplier exists
        const supplier = await sqliteDBManager.get(`
            SELECT id FROM suppliers WHERE id = ?
        `, [supplierId]);
        
        if (!supplier) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier not found.",
            });
        }
        
        // Check if account already exists
        const existingAccount = await sqliteDBManager.get(`
            SELECT id FROM supplier_accounts WHERE supplier_id = ?
        `, [supplierId]);
        
        if (existingAccount) {
            // Update existing account
            await sqliteDBManager.run(`
                UPDATE supplier_accounts SET
                    credit_limit = ?, payment_term_id = ?, updated_at = ?
                WHERE supplier_id = ?
            `, [
                req.body.creditLimit !== undefined ? parseFloat(req.body.creditLimit) : null,
                req.body.paymentTermId !== undefined ? req.body.paymentTermId : null,
                new Date().toISOString(),
                supplierId
            ]);
            
            // Return updated account
            const updatedAccount = await sqliteDBManager.get(`
                SELECT * FROM supplier_accounts WHERE supplier_id = ?
            `, [supplierId]);
            
            res.json(updatedAccount);
        } else {
            // Create new account
            const result = await sqliteDBManager.run(`
                INSERT INTO supplier_accounts (
                    supplier_id, credit_limit, balance, payment_term_id,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                supplierId,
                parseFloat(req.body.creditLimit) || 0,
                0,
                req.body.paymentTermId || null,
                new Date().toISOString(),
                new Date().toISOString()
            ]);
            
            // Return created account
            const createdAccount = await sqliteDBManager.get(`
                SELECT * FROM supplier_accounts WHERE id = ?
            `, [result.lastID]);
            
            res.status(201).json(createdAccount);
        }
    } catch (error) {
        console.error("Error creating/updating supplier account:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});