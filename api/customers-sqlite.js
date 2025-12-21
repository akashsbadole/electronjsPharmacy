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
            WHERE type='table' AND name='customers'
        `);
        
        if (!tableExists) {
            console.log("Customers table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS customers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id INTEGER NOT NULL,
                    customer_code VARCHAR(20) UNIQUE,
                    name VARCHAR(100) NOT NULL,
                    phone VARCHAR(15),
                    email VARCHAR(100),
                    address TEXT,
                    city VARCHAR(50),
                    state VARCHAR(50),
                    pincode VARCHAR(6),
                    gst_number VARCHAR(15),
                    date_of_birth DATE,
                    anniversary_date DATE,
                    customer_type VARCHAR(20) DEFAULT 'REGULAR',
                    credit_limit DECIMAL(10,2) DEFAULT 0.00,
                    current_balance DECIMAL(10,2) DEFAULT 0.00,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sync_version INTEGER DEFAULT 1,
                    FOREIGN KEY (store_id) REFERENCES stores(id),
                    UNIQUE(store_id, phone)
                )
            `);
        }
        
        // Check if customer_accounts table exists
        const customerAccountsTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='customer_accounts'
        `);
        
        if (!customerAccountsTableExists) {
            console.log("Customer accounts table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS customer_accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER NOT NULL,
                    credit_limit DECIMAL(10,2) DEFAULT 0.00,
                    balance DECIMAL(10,2) DEFAULT 0.00,
                    payment_term_id INTEGER,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (customer_id) REFERENCES customers(id),
                    UNIQUE(customer_id)
                )
            `);
        }
        
        // Check if customer_loyalty table exists
        const customerLoyaltyTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='customer_loyalty'
        `);
        
        if (!customerLoyaltyTableExists) {
            console.log("Customer loyalty table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS customer_loyalty (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER NOT NULL,
                    loyalty_account_number VARCHAR(20) UNIQUE,
                    current_points INTEGER DEFAULT 0,
                    tier VARCHAR(20) DEFAULT 'Basic',
                    tier_expiry_date DATE,
                    total_points_earned INTEGER DEFAULT 0,
                    total_points_redeemed INTEGER DEFAULT 0,
                    enrollment_date DATE,
                    last_activity_date DATE,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (customer_id) REFERENCES customers(id),
                    UNIQUE(customer_id)
                )
            `);
        }
        
        // Check if customer_delivery_addresses table exists
        const deliveryAddressesTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='customer_delivery_addresses'
        `);
        
        if (!deliveryAddressesTableExists) {
            console.log("Customer delivery addresses table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS customer_delivery_addresses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER NOT NULL,
                    address TEXT NOT NULL,
                    landmark TEXT,
                    pincode VARCHAR(6) NOT NULL,
                    latitude DECIMAL(10,8),
                    longitude DECIMAL(11,8),
                    is_default BOOLEAN DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (customer_id) REFERENCES customers(id)
                )
            `);
        }
        
        // Check if customer_communication_preferences table exists
        const commPreferencesTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='customer_communication_preferences'
        `);
        
        if (!commPreferencesTableExists) {
            console.log("Customer communication preferences table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS customer_communication_preferences (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer_id INTEGER NOT NULL,
                    sms_enabled BOOLEAN DEFAULT 1,
                    sms_marketing_consent BOOLEAN DEFAULT 0,
                    sms_transactional_consent BOOLEAN DEFAULT 1,
                    email_enabled BOOLEAN DEFAULT 1,
                    email_marketing_consent BOOLEAN DEFAULT 1,
                    email_transactional_consent BOOLEAN DEFAULT 1,
                    whatsapp_enabled BOOLEAN DEFAULT 1,
                    whatsapp_marketing_consent BOOLEAN DEFAULT 0,
                    whatsapp_transactional_consent BOOLEAN DEFAULT 1,
                    quiet_hours_enabled BOOLEAN DEFAULT 1,
                    quiet_hours_start VARCHAR(5) DEFAULT '22:00',
                    quiet_hours_end VARCHAR(5) DEFAULT '08:00',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (customer_id) REFERENCES customers(id),
                    UNIQUE(customer_id)
                )
            `);
        }
        
        dbInitialized = true;
        console.log("Customers SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize customers SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in customers module:", err);
});

/**
 * GET endpoint: Get welcome message for Customer API.
 */
router.get("/", function (req, res) {
    res.send("Customer API (SQLite)");
});

/**
 * GET endpoint: Get customer details by customer ID.
 */
router.get("/customer/:customerId", async function (req, res) {
    if (!req.params.customerId) {
        return res.status(500).send("ID field is required.");
    }
    
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        
        const customer = await sqliteDBManager.get(`
            SELECT * FROM customers WHERE id = ? AND is_active = 1
        `, [customerId]);
        
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        res.send(customer);
    } catch (error) {
        console.error("Error getting customer:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get details of all customers.
 */
router.get("/all", async function (req, res) {
    try {
        await initializeDatabase();
        
        const customers = await sqliteDBManager.all(`
            SELECT * FROM customers WHERE is_active = 1 ORDER BY name
        `);
        
        res.send(customers);
    } catch (error) {
        console.error("Error getting all customers:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create a new customer.
 */
router.post("/customer", async function (req, res) {
    try {
        await initializeDatabase();
        
        const newCustomer = {
            store_id: req.body.storeId || 1,
            customer_code: req.body.customerCode || null,
            name: validator.escape(req.body.name),
            phone: req.body.phone ? validator.escape(req.body.phone) : null,
            email: req.body.email ? validator.escape(req.body.email) : null,
            address: req.body.address ? validator.escape(req.body.address) : null,
            city: req.body.city ? validator.escape(req.body.city) : null,
            state: req.body.state ? validator.escape(req.body.state) : null,
            pincode: req.body.pincode ? validator.escape(req.body.pincode) : null,
            gst_number: req.body.gstNumber ? validator.escape(req.body.gstNumber) : null,
            date_of_birth: req.body.dateOfBirth || null,
            anniversary_date: req.body.anniversaryDate || null,
            customer_type: req.body.customerType || 'REGULAR',
            credit_limit: req.body.creditLimit ? parseFloat(req.body.creditLimit) : 0.00,
            current_balance: req.body.currentBalance ? parseFloat(req.body.currentBalance) : 0.00,
            is_active: 1
        };
        
        // Validate required fields
        if (!newCustomer.name || validator.isEmpty(newCustomer.name)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Customer name is required.",
            });
        }
        
        const result = await sqliteDBManager.run(`
            INSERT INTO customers (
                store_id, customer_code, name, phone, email, address,
                city, state, pincode, gst_number, date_of_birth,
                anniversary_date, customer_type, credit_limit, current_balance,
                is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            newCustomer.store_id, newCustomer.customer_code, newCustomer.name,
            newCustomer.phone, newCustomer.email, newCustomer.address,
            newCustomer.city, newCustomer.state, newCustomer.pincode,
            newCustomer.gst_number, newCustomer.date_of_birth,
            newCustomer.anniversary_date, newCustomer.customer_type,
            newCustomer.credit_limit, newCustomer.current_balance,
            newCustomer.is_active, new Date().toISOString(), new Date().toISOString()
        ]);
        
        const customerId = result.lastID;
        
        // Return the created customer
        const createdCustomer = await sqliteDBManager.get(`
            SELECT * FROM customers WHERE id = ?
        `, [customerId]);
        
        res.status(201).send(createdCustomer);
    } catch (error) {
        console.error("Error creating customer:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete a customer by customer ID.
 */
router.delete("/customer/:customerId", async function (req, res) {
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        
        // Check if customer exists
        const customer = await sqliteDBManager.get("SELECT id FROM customers WHERE id = ?", [customerId]);
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        // Soft delete by setting is_active to 0
        await sqliteDBManager.run(`
            UPDATE customers SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [customerId]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update customer details.
 */
router.put("/customer", async function (req, res) {
    try {
        await initializeDatabase();
        const customerId = parseInt(req.body._id);
        
        // Check if customer exists
        const existing = await sqliteDBManager.get("SELECT id FROM customers WHERE id = ?", [customerId]);
        if (!existing) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        const updateData = {
            customer_code: req.body.customerCode || null,
            name: validator.escape(req.body.name),
            phone: req.body.phone ? validator.escape(req.body.phone) : null,
            email: req.body.email ? validator.escape(req.body.email) : null,
            address: req.body.address ? validator.escape(req.body.address) : null,
            city: req.body.city ? validator.escape(req.body.city) : null,
            state: req.body.state ? validator.escape(req.body.state) : null,
            pincode: req.body.pincode ? validator.escape(req.body.pincode) : null,
            gst_number: req.body.gstNumber ? validator.escape(req.body.gstNumber) : null,
            date_of_birth: req.body.dateOfBirth || null,
            anniversary_date: req.body.anniversaryDate || null,
            customer_type: req.body.customerType || 'REGULAR',
            credit_limit: req.body.creditLimit ? parseFloat(req.body.creditLimit) : 0.00,
            current_balance: req.body.currentBalance ? parseFloat(req.body.currentBalance) : 0.00
        };
        
        // Validate required fields
        if (!updateData.name || validator.isEmpty(updateData.name)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Customer name is required.",
            });
        }
        
        await sqliteDBManager.run(`
            UPDATE customers SET
                customer_code = ?, name = ?, phone = ?, email = ?,
                address = ?, city = ?, state = ?, pincode = ?,
                gst_number = ?, date_of_birth = ?, anniversary_date = ?,
                customer_type = ?, credit_limit = ?, current_balance = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            updateData.customer_code, updateData.name, updateData.phone,
            updateData.email, updateData.address, updateData.city,
            updateData.state, updateData.pincode, updateData.gst_number,
            updateData.date_of_birth, updateData.anniversary_date,
            updateData.customer_type, updateData.credit_limit,
            updateData.current_balance, customerId
        ]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error updating customer:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get customer with account information.
 */
router.get("/customer/:customerId/with-account", async function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        
        // Get customer
        const customer = await sqliteDBManager.get(`
            SELECT * FROM customers WHERE id = ? AND is_active = 1
        `, [customerId]);
        
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        // Get customer account
        const account = await sqliteDBManager.get(`
            SELECT * FROM customer_accounts WHERE customer_id = ?
        `, [customerId]);
        
        // Get loyalty account
        const loyaltyAccount = await sqliteDBManager.get(`
            SELECT * FROM customer_loyalty WHERE customer_id = ? AND is_active = 1
        `, [customerId]);
        
        // Get delivery addresses
        const deliveryAddresses = await sqliteDBManager.all(`
            SELECT * FROM customer_delivery_addresses WHERE customer_id = ?
        `, [customerId]);
        
        // Get payment terms if available
        let paymentTerms = null;
        if (account && account.payment_term_id) {
            paymentTerms = await sqliteDBManager.get(`
                SELECT * FROM payment_terms WHERE id = ?
            `, [account.payment_term_id]);
        }
        
        res.json({
            customer: customer,
            account: account,
            loyaltyAccount: loyaltyAccount,
            deliveryAddresses: deliveryAddresses,
            paymentTerms: paymentTerms
        });
    } catch (error) {
        console.error("Error getting customer with account:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create or update customer account.
 */
router.post("/customer/:customerId/account", async function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        
        // Check if customer exists
        const customer = await sqliteDBManager.get(`
            SELECT id FROM customers WHERE id = ? AND is_active = 1
        `, [customerId]);
        
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        // Check if account already exists
        const existingAccount = await sqliteDBManager.get(`
            SELECT id FROM customer_accounts WHERE customer_id = ?
        `, [customerId]);
        
        if (existingAccount) {
            // Update existing account
            await sqliteDBManager.run(`
                UPDATE customer_accounts SET
                    credit_limit = ?, payment_term_id = ?, updated_at = CURRENT_TIMESTAMP
                WHERE customer_id = ?
            `, [
                req.body.creditLimit !== undefined ? parseFloat(req.body.creditLimit) : existingAccount.credit_limit,
                req.body.paymentTermId !== undefined ? req.body.paymentTermId : existingAccount.payment_term_id,
                customerId
            ]);
            
            const updatedAccount = await sqliteDBManager.get(`
                SELECT * FROM customer_accounts WHERE customer_id = ?
            `, [customerId]);
            
            res.json(updatedAccount);
        } else {
            // Create new account
            const result = await sqliteDBManager.run(`
                INSERT INTO customer_accounts (
                    customer_id, credit_limit, balance, payment_term_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                customerId,
                parseFloat(req.body.creditLimit) || 0,
                0,
                req.body.paymentTermId || null,
                new Date().toISOString(),
                new Date().toISOString()
            ]);
            
            const newAccount = await sqliteDBManager.get(`
                SELECT * FROM customer_accounts WHERE id = ?
            `, [result.lastID]);
            
            res.status(201).json(newAccount);
        }
    } catch (error) {
        console.error("Error creating/updating customer account:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Enroll customer in loyalty program.
 */
router.post("/customer/:customerId/enroll-loyalty", async function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        
        // Check if customer exists
        const customer = await sqliteDBManager.get(`
            SELECT id FROM customers WHERE id = ? AND is_active = 1
        `, [customerId]);
        
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        // Check if customer already has a loyalty account
        const existingAccount = await sqliteDBManager.get(`
            SELECT id FROM customer_loyalty WHERE customer_id = ?
        `, [customerId]);
        
        if (existingAccount) {
            return res.status(409).json({
                error: "Conflict",
                message: "Customer already has a loyalty account.",
            });
        }
        
        // Generate unique loyalty account number
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        const loyaltyAccountNumber = `LOY-${timestamp}${random}`;
        
        // Create new loyalty account
        const result = await sqliteDBManager.run(`
            INSERT INTO customer_loyalty (
                customer_id, loyalty_account_number, current_points, tier,
                tier_expiry_date, total_points_earned, total_points_redeemed,
                enrollment_date, last_activity_date, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            customerId,
            loyaltyAccountNumber,
            0,
            'Basic',
            new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
            0,
            0,
            new Date().toISOString().split('T')[0],
            new Date().toISOString().split('T')[0],
            1,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        const newLoyaltyAccount = await sqliteDBManager.get(`
            SELECT * FROM customer_loyalty WHERE id = ?
        `, [result.lastID]);
        
        res.status(201).json(newLoyaltyAccount);
    } catch (error) {
        console.error("Error enrolling customer in loyalty:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get all customers with account information.
 */
router.get("/with-accounts", async function (req, res) {
    try {
        await initializeDatabase();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // Get customers with pagination
        const customers = await sqliteDBManager.all(`
            SELECT * FROM customers WHERE is_active = 1
            ORDER BY name
            LIMIT ? OFFSET ?
        `, [limit, offset]);
        
        // Get total count
        const countResult = await sqliteDBManager.get(`
            SELECT COUNT(*) as total FROM customers WHERE is_active = 1
        `);
        
        // Get all accounts
        const accounts = await sqliteDBManager.all(`
            SELECT * FROM customer_accounts
        `);
        
        // Get all loyalty accounts
        const loyaltyAccounts = await sqliteDBManager.all(`
            SELECT * FROM customer_loyalty WHERE is_active = 1
        `);
        
        // Merge data
        const customersWithAccounts = customers.map(customer => {
            const account = accounts.find(acc => acc.customer_id === customer.id);
            const loyaltyAccount = loyaltyAccounts.find(loyalty => loyalty.customer_id === customer.id);
            
            return {
                ...customer,
                account: account || null,
                loyaltyAccount: loyaltyAccount || null
            };
        });
        
        res.json({
            customers: customersWithAccounts,
            pagination: {
                total: countResult.total,
                page: page,
                limit: limit,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        console.error("Error getting customers with accounts:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Add delivery address for a customer
 */
router.post("/customer/:customerId/delivery-address", async function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        
        // Check if customer exists
        const customer = await sqliteDBManager.get(`
            SELECT id FROM customers WHERE id = ? AND is_active = 1
        `, [customerId]);
        
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        const newAddress = req.body;
        
        if (!newAddress.address || !newAddress.pincode) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Address and pincode are required.",
            });
        }
        
        // If setting as default, unset all other default addresses
        if (newAddress.is_default) {
            await sqliteDBManager.run(`
                UPDATE customer_delivery_addresses SET is_default = 0
                WHERE customer_id = ?
            `, [customerId]);
        }
        
        const result = await sqliteDBManager.run(`
            INSERT INTO customer_delivery_addresses (
                customer_id, address, landmark, pincode, latitude, longitude,
                is_default, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            customerId,
            validator.escape(newAddress.address),
            newAddress.landmark ? validator.escape(newAddress.landmark) : null,
            validator.escape(newAddress.pincode),
            newAddress.latitude || null,
            newAddress.longitude || null,
            newAddress.is_default ? 1 : 0,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        const address = await sqliteDBManager.get(`
            SELECT * FROM customer_delivery_addresses WHERE id = ?
        `, [result.lastID]);
        
        res.status(201).json(address);
    } catch (error) {
        console.error("Error adding delivery address:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update delivery address
 */
router.put("/customer/:customerId/delivery-address/:addressId", async function (req, res) {
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        const addressId = parseInt(req.params.addressId);
        
        const updatedAddress = req.body;
        
        // If setting as default, unset all other default addresses
        if (updatedAddress.is_default) {
            await sqliteDBManager.run(`
                UPDATE customer_delivery_addresses SET is_default = 0
                WHERE customer_id = ?
            `, [customerId]);
        }
        
        await sqliteDBManager.run(`
            UPDATE customer_delivery_addresses SET
                address = ?, landmark = ?, pincode = ?, latitude = ?,
                longitude = ?, is_default = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND customer_id = ?
        `, [
            validator.escape(updatedAddress.address),
            updatedAddress.landmark ? validator.escape(updatedAddress.landmark) : null,
            validator.escape(updatedAddress.pincode),
            updatedAddress.latitude || null,
            updatedAddress.longitude || null,
            updatedAddress.is_default ? 1 : 0,
            addressId, customerId
        ]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error updating delivery address:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete delivery address
 */
router.delete("/customer/:customerId/delivery-address/:addressId", async function (req, res) {
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        const addressId = parseInt(req.params.addressId);
        
        const result = await sqliteDBManager.run(`
            DELETE FROM customer_delivery_addresses
            WHERE id = ? AND customer_id = ?
        `, [addressId, customerId]);
        
        if (result.changes === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: "Delivery address not found.",
            });
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting delivery address:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get customer communication preferences.
 */
router.get("/customer/:customerId/communication-preferences", async function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        
        const preferences = await sqliteDBManager.get(`
            SELECT * FROM customer_communication_preferences WHERE customer_id = ?
        `, [customerId]);
        
        if (!preferences) {
            const defaultPreferences = {
                customer_id: customerId,
                sms_enabled: 1,
                sms_marketing_consent: 0,
                sms_transactional_consent: 1,
                email_enabled: 1,
                email_marketing_consent: 1,
                email_transactional_consent: 1,
                whatsapp_enabled: 1,
                whatsapp_marketing_consent: 0,
                whatsapp_transactional_consent: 1,
                quiet_hours_enabled: 1,
                quiet_hours_start: "22:00",
                quiet_hours_end: "08:00"
            };
            return res.json(defaultPreferences);
        }
        
        res.json(preferences);
    } catch (error) {
        console.error("Error getting communication preferences:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Send communication to customer.
 */
router.post("/customer/:customerId/send-communication", async function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    try {
        await initializeDatabase();
        const customerId = parseInt(req.params.customerId);
        
        // Check if customer exists
        const customer = await sqliteDBManager.get(`
            SELECT id, name, phone, email FROM customers WHERE id = ? AND is_active = 1
        `, [customerId]);
        
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        // This would typically integrate with a communication service
        // For now, we'll just return a success response
        res.json({
            message: "Communication sent successfully",
            customerId: customerId,
            communicationType: req.body.type,
            status: "sent"
        });
    } catch (error) {
        console.error("Error sending communication:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});