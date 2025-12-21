const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const sqliteDBManager = require('./sqlite-db-manager');
const inventorySQLite = require('./inventory-sqlite');

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
            WHERE type='table' AND name='transactions'
        `);
        
        if (!tableExists) {
            console.log("Transactions table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS transactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id INTEGER NOT NULL,
                    transaction_number VARCHAR(50) UNIQUE,
                    customer_id INTEGER,
                    user_id INTEGER NOT NULL,
                    till_id INTEGER,
                    transaction_type VARCHAR(20) DEFAULT 'SALE',
                    transaction_status VARCHAR(20) DEFAULT 'COMPLETED',
                    subtotal DECIMAL(12,2) NOT NULL,
                    discount_amount DECIMAL(12,2) DEFAULT 0.00,
                    tax_amount DECIMAL(12,2) DEFAULT 0.00,
                    total_amount DECIMAL(12,2) NOT NULL,
                    paid_amount DECIMAL(12,2) DEFAULT 0.00,
                    balance_amount DECIMAL(12,2) DEFAULT 0.00,
                    payment_method VARCHAR(20),
                    payment_details TEXT,
                    notes TEXT,
                    reference_number VARCHAR(50),
                    loyalty_points_earned INTEGER DEFAULT 0,
                    loyalty_points_redeemed INTEGER DEFAULT 0,
                    delivery_id INTEGER,
                    prescription_id INTEGER,
                    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sync_version INTEGER DEFAULT 1,
                    FOREIGN KEY (store_id) REFERENCES stores(id),
                    FOREIGN KEY (customer_id) REFERENCES customers(id),
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            `);
        }
        
        // Check if transaction_items table exists
        const transactionItemsTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='transaction_items'
        `);
        
        if (!transactionItemsTableExists) {
            console.log("Transaction items table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS transaction_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    transaction_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    batch_id INTEGER,
                    quantity INTEGER NOT NULL,
                    unit_price DECIMAL(12,2) NOT NULL,
                    discount_percent DECIMAL(5,2) DEFAULT 0.00,
                    discount_amount DECIMAL(12,2) DEFAULT 0.00,
                    tax_rate DECIMAL(5,2) DEFAULT 0.00,
                    tax_amount DECIMAL(12,2) DEFAULT 0.00,
                    total_price DECIMAL(12,2) NOT NULL,
                    cost_price DECIMAL(12,2) DEFAULT 0.00,
                    notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
                )
            `);
        }
        
        dbInitialized = true;
        console.log("Transactions SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize transactions SQLite database:", error);
        throw error;
    }
}

// Initialize database immediately
initializeDatabase().catch(err => {
    console.error("Database initialization failed in transactions module:", err);
});

/**
 * GET endpoint: Get welcome message for Transactions API.
 */
router.get("/", function (req, res) {
    res.send("Transactions API (SQLite)");
});

/**
 * GET endpoint: Get details of all transactions.
 */
router.get("/all", async function (req, res) {
    try {
        await initializeDatabase();
        
        const transactions = await sqliteDBManager.all(`
            SELECT t.*, c.name as customer_name, u.full_name as user_name
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            ORDER BY t.transaction_date DESC
        `);
        
        res.send(transactions);
    } catch (error) {
        console.error("Error getting all transactions:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get on-hold transactions.
 */
router.get("/on-hold", async function (req, res) {
    try {
        await initializeDatabase();
        
        const transactions = await sqliteDBManager.all(`
            SELECT t.*, c.name as customer_name, u.full_name as user_name
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.reference_number != '' AND t.transaction_status = 'PENDING'
            ORDER BY t.transaction_date DESC
        `);
        
        res.send(transactions);
    } catch (error) {
        console.error("Error getting on-hold transactions:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get customer orders with a status of 0 and an empty reference number.
 */
router.get("/customer-orders", async function (req, res) {
    try {
        await initializeDatabase();
        
        const transactions = await sqliteDBManager.all(`
            SELECT t.*, c.name as customer_name, u.full_name as user_name
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.customer_id != 0 AND t.transaction_status = 'PENDING' AND t.reference_number = ''
            ORDER BY t.transaction_date DESC
        `);
        
        res.send(transactions);
    } catch (error) {
        console.error("Error getting customer orders:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get transactions based on date, user, and till parameters.
 */
router.get("/by-date", async function (req, res) {
    try {
        await initializeDatabase();
        
        let startDate = new Date(req.query.start);
        let endDate = new Date(req.query.end);
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : inventorySQLite.getCurrentStoreId();
 
        let query = `
            SELECT t.*, c.name as customer_name, u.full_name as user_name
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = ?
        `;
        let params = [startDate.toISOString(), endDate.toISOString(), req.query.status];
 
        // Add store filter if specified
        if (storeId) {
            query += " AND t.store_id = ?";
            params.push(storeId);
        }
 
        if (req.query.user != 0 && req.query.till == 0) {
            query += " AND t.user_id = ?";
            params.push(parseInt(req.query.user));
        }
 
        if (req.query.user == 0 && req.query.till != 0) {
            query += " AND t.till_id = ?";
            params.push(parseInt(req.query.till));
        }
 
        if (req.query.user != 0 && req.query.till != 0) {
            query += " AND t.user_id = ? AND t.till_id = ?";
            params.push(parseInt(req.query.user), parseInt(req.query.till));
        }
 
        query += " ORDER BY t.transaction_date DESC";
 
        const transactions = await sqliteDBManager.all(query, params);
        res.send(transactions);
    } catch (error) {
        console.error("Error getting transactions by date:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create a new transaction.
 */
router.post("/new", async function (req, res) {
    try {
        await initializeDatabase();
        
        let newTransaction = req.body;
        
        // Get current store ID from inventory module
        const currentStoreId = inventorySQLite.getCurrentStoreId();
        
        // Generate transaction number if not provided
        if (!newTransaction.transaction_number) {
            const timestamp = Date.now();
            newTransaction.transaction_number = `TXN${timestamp}`;
        }
        
        // Add store information to transaction
        newTransaction.store_id = currentStoreId;
        newTransaction.store_name = req.body.storeName || "";
        
        // Ensure user_id is provided (required field)
        if (!newTransaction.user_id) {
            newTransaction.user_id = 1; // Default to admin user if not provided
        }
        
        // Check if users table exists, create if not
        const usersTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='users'
        `);
        
        if (!usersTableExists) {
            console.log("Users table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id INTEGER DEFAULT 1,
                    username VARCHAR(50) UNIQUE,
                    full_name VARCHAR(100),
                    email VARCHAR(100),
                    password_hash VARCHAR(255),
                    role VARCHAR(20) DEFAULT 'user',
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }
        
        // Check if user exists, create default user if not
        const userExists = await sqliteDBManager.get("SELECT id FROM users WHERE id = ?", [newTransaction.user_id]);
        if (!userExists) {
            console.log("Creating default user for transaction...");
            await sqliteDBManager.run(`
                INSERT INTO users (id, store_id, full_name, email, password_hash, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `, [
                newTransaction.user_id,
                1, // Default store ID
                'Default User',
                'admin@example.com',
                'default_password_hash', // Default password hash
                1,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            ]);
        }

        // Start transaction for data integrity
        await sqliteDBManager.transaction(async (trx) => {
            // Insert main transaction
            const result = await trx.run(`
                INSERT INTO transactions (
                    store_id, transaction_number, customer_id, user_id, till_id,
                    transaction_type, transaction_status, subtotal, discount_amount,
                    tax_amount, total_amount, paid_amount, balance_amount,
                    payment_method, payment_details, notes, reference_number,
                    loyalty_points_earned, loyalty_points_redeemed,
                    transaction_date, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                newTransaction.store_id,
                newTransaction.transaction_number,
                newTransaction.customer || null,
                newTransaction.user_id,
                newTransaction.till || null,
                newTransaction.transaction_type || 'SALE',
                newTransaction.transaction_status || 'COMPLETED',
                newTransaction.subtotal || 0,
                newTransaction.discount_amount || 0,
                newTransaction.tax_amount || 0,
                newTransaction.total_amount || 0,
                newTransaction.paid_amount || 0,
                newTransaction.balance_amount || 0,
                newTransaction.payment_method || null,
                JSON.stringify(newTransaction.payment_details || {}),
                newTransaction.notes || null,
                newTransaction.reference_number || null,
                newTransaction.loyalty_points_earned || 0,
                newTransaction.loyalty_points_redeemed || 0,
                newTransaction.transaction_date || new Date().toISOString(),
                new Date().toISOString(),
                new Date().toISOString()
            ]);
            
            const transactionId = result.lastID;
            
            // Insert transaction items
            if (newTransaction.items && Array.isArray(newTransaction.items)) {
                for (const item of newTransaction.items) {
                    await trx.run(`
                        INSERT INTO transaction_items (
                            transaction_id, product_id, batch_id, quantity,
                            unit_price, discount_percent, discount_amount,
                            tax_rate, tax_amount, total_price, cost_price,
                            notes, created_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        transactionId,
                        item.id,
                        item.batch_id || null,
                        item.quantity,
                        item.price,
                        item.discount_percent || 0,
                        item.discount_amount || 0,
                        item.tax_rate || 0,
                        item.tax_amount || 0,
                        item.total || (item.price * item.quantity),
                        item.cost_price || 0,
                        item.notes || null,
                        new Date().toISOString()
                    ]);
                }
            }
            
            // Decrement inventory if paid
            if (newTransaction.paid >= newTransaction.total_amount && newTransaction.items) {
                await inventorySQLite.decrementInventory(newTransaction.items, { storeId: currentStoreId });
            }
            
            // Award loyalty points if customer is enrolled
            if (newTransaction.customer && newTransaction.customer !== "0") {
                await awardLoyaltyPoints(transactionId, newTransaction);
            }
            
            // Create customer invoice for credit sales
            if (newTransaction.paid < newTransaction.total_amount) {
                await createCustomerInvoice(transactionId, newTransaction);
            }
            
            return transactionId;
        });
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error creating transaction:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update an existing transaction.
 */
router.put("/new", async function (req, res) {
    try {
        await initializeDatabase();
        
        const transactionId = req.body._id;
        
        await sqliteDBManager.run(`
            UPDATE transactions SET
                customer_id = ?, user_id = ?, till_id = ?,
                transaction_type = ?, transaction_status = ?, subtotal = ?,
                discount_amount = ?, tax_amount = ?, total_amount = ?,
                paid_amount = ?, balance_amount = ?, payment_method = ?,
                payment_details = ?, notes = ?, reference_number = ?,
                updated_at = ?
            WHERE id = ?
        `, [
            req.body.customer || null,
            req.body.user_id,
            req.body.till || null,
            req.body.transaction_type || 'SALE',
            req.body.transaction_status || 'COMPLETED',
            req.body.subtotal || 0,
            req.body.discount_amount || 0,
            req.body.tax_amount || 0,
            req.body.total_amount || 0,
            req.body.paid_amount || 0,
            req.body.balance_amount || 0,
            req.body.payment_method || null,
            JSON.stringify(req.body.payment_details || {}),
            req.body.notes || null,
            req.body.reference_number || null,
            new Date().toISOString(),
            transactionId
        ]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error updating transaction:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Delete a transaction.
 */
router.post("/delete", async function (req, res) {
    try {
        await initializeDatabase();
        
        const transactionId = req.body.orderId;
        
        // Delete transaction items first (foreign key constraints should handle this)
        await sqliteDBManager.run("DELETE FROM transactions WHERE id = ?", [transactionId]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting transaction:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get details of a specific transaction by transaction ID.
 */
router.get("/:transactionId", async function (req, res) {
    try {
        await initializeDatabase();
        
        // Get transaction details
        const transaction = await sqliteDBManager.get(`
            SELECT t.*, c.name as customer_name, u.full_name as user_name
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        `, [req.params.transactionId]);
        
        if (!transaction) {
            return res.status(404).json({
                error: "Not Found",
                message: "Transaction not found.",
            });
        }
        
        // Get transaction items
        const items = await sqliteDBManager.all(`
            SELECT ti.*, p.name as product_name, p.sku, p.barcode
            FROM transaction_items ti
            LEFT JOIN products p ON ti.product_id = p.id
            WHERE ti.transaction_id = ?
        `, [req.params.transactionId]);
        
        transaction.items = items;
        res.send(transaction);
    } catch (error) {
        console.error("Error getting transaction:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Calculate GST for a transaction.
 */
router.post("/calculate-gst", async function (req, res) {
    // Validate required fields
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Items array is required and cannot be empty.",
        });
    }

    if (!req.body.customer_state) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer state is required.",
        });
    }

    try {
        await initializeDatabase();
 
        // Get active GST configuration
        const config = await sqliteDBManager.get("SELECT * FROM gst_configurations WHERE is_active = 1 LIMIT 1");

        if (!config) {
            return res.status(404).json({
                error: "Not Found",
                message: "No active GST configuration found.",
            });
        }

        // Check if it's an inter-state or intra-state transaction
        const customerState = req.body.customer_state;
        const isInterState = config.state_code !== customerState;
        
        let subtotal = 0;
        let totalCGST = 0;
        let totalSGST = 0;
        let totalIGST = 0;
        let totalCESS = 0;
        
        // Process each item
        const itemsWithGST = req.body.items.map(function (item) {
            const itemAmount = parseFloat(item.price) * parseInt(item.quantity);
            let cgstAmount = 0;
            let sgstAmount = 0;
            let igstAmount = 0;
            let cessAmount = 0;
            let itemGST = 0;
            
            let cgstRate = config.cgst_rate;
            let sgstRate = config.sgst_rate;
            let igstRate = config.igst_rate;
            let cessRate = config.cess_rate;
            
            if (isInterState) {
                igstAmount = (itemAmount * igstRate) / 100;
                itemGST = igstAmount;
            } else {
                cgstAmount = (itemAmount * cgstRate) / 100;
                sgstAmount = (itemAmount * sgstRate) / 100;
                itemGST = cgstAmount + sgstAmount;
            }
            
            cessAmount = (itemAmount * cessRate) / 100;
            itemGST += cessAmount;
            
            subtotal += itemAmount;
            totalCGST += cgstAmount;
            totalSGST += sgstAmount;
            totalIGST += igstAmount;
            totalCESS += cessAmount;
            
            return {
                ...item,
                item_amount: parseFloat(itemAmount.toFixed(2)),
                cgst_rate: cgstRate,
                sgst_rate: sgstRate,
                igst_rate: igstRate,
                cess_rate: cessRate,
                cgst_amount: parseFloat(cgstAmount.toFixed(2)),
                sgst_amount: parseFloat(sgstAmount.toFixed(2)),
                igst_amount: parseFloat(igstAmount.toFixed(2)),
                cess_amount: parseFloat(cessAmount.toFixed(2)),
                item_gst: parseFloat(itemGST.toFixed(2)),
                item_total: parseFloat((itemAmount + itemGST).toFixed(2))
            };
        });
        
        const totalGST = totalCGST + totalSGST + totalIGST + totalCESS;
        const totalAmount = subtotal + totalGST;
        
        res.send({
            items: itemsWithGST,
            subtotal: parseFloat(subtotal.toFixed(2)),
            cgst_rate: config.cgst_rate,
            sgst_rate: config.sgst_rate,
            igst_rate: config.igst_rate,
            cess_rate: config.cess_rate,
            total_cgst: parseFloat(totalCGST.toFixed(2)),
            total_sgst: parseFloat(totalSGST.toFixed(2)),
            total_igst: parseFloat(totalIGST.toFixed(2)),
            total_cess: parseFloat(totalCESS.toFixed(2)),
            total_gst: parseFloat(totalGST.toFixed(2)),
            total_amount: parseFloat(totalAmount.toFixed(2)),
            is_inter_state: isInterState
        });
    } catch (error) {
        console.error("Error calculating GST:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "Failed to calculate GST.",
        });
    }
});

/**
 * Helper function to award loyalty points for a transaction
 */
async function awardLoyaltyPoints(transactionId, transaction) {
    if (!transaction.customer || transaction.customer === "0") {
        return;
    }
    
    try {
        
        // Check if customer has loyalty account
        const loyaltyAccount = await sqliteDBManager.get(`
            SELECT * FROM customer_loyalty 
            WHERE customer_id = ? AND is_active = 1
        `, [transaction.customer]);
        
        if (!loyaltyAccount) {
            return; // Customer not enrolled in loyalty program
        }
        
        // Calculate points to award (1% of transaction amount)
        const transactionAmount = transaction.subtotal || transaction.total_amount;
        let pointsToAward = Math.floor(transactionAmount * 0.01);
        
        if (pointsToAward <= 0) {
            return;
        }
        
        // Update loyalty account
        await sqliteDBManager.run(`
            UPDATE customer_loyalty SET
                current_points = current_points + ?,
                total_points_earned = total_points_earned + ?,
                last_activity_date = CURRENT_DATE,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [pointsToAward, pointsToAward, loyaltyAccount.id]);
        
        // Create loyalty transaction record
        await sqliteDBManager.run(`
            INSERT INTO loyalty_transactions (
                customer_loyalty_id, transaction_id, transaction_type,
                points, description, reference_id, created_at
            ) VALUES (?, ?, 'EARN', ?, ?, ?, ?)
        `, [
            loyaltyAccount.id,
            transactionId,
            pointsToAward,
            `Purchase points earned - Transaction #${transactionId}`,
            transactionId.toString(),
            new Date().toISOString()
        ]);
    } catch (error) {
        console.error("Error awarding loyalty points:", error);
        // Don't fail the whole transaction for loyalty points
    }
}

/**
 * Helper function to create customer invoice for credit sales
 */
async function createCustomerInvoice(transactionId, transaction) {
    try {
        
        // Generate invoice number
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const time = date.getTime();
        const invoiceNumber = `CINV${year}${month}${day}${time.toString().slice(-6)}`;
        
        // Calculate due date (30 days from now)
        let dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30);
        
        // Create invoice
        const result = await sqliteDBManager.run(`
            INSERT INTO customer_invoices (
                invoice_number, transaction_id, customer_id,
                invoice_date, due_date, subtotal, gst_amount,
                total_amount, discount_amount, balance_amount,
                status, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            invoiceNumber,
            transactionId,
            transaction.customer,
            new Date().toISOString().split('T')[0],
            dueDate.toISOString().split('T')[0],
            transaction.subtotal || transaction.total_amount,
            transaction.tax_amount || 0,
            transaction.total_amount,
            transaction.discount_amount || 0,
            transaction.total_amount - transaction.paid_amount,
            'PENDING',
            transaction.notes || null,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        const invoiceId = result.lastID;
        
        // Create invoice items
        if (transaction.items && Array.isArray(transaction.items)) {
            for (const item of transaction.items) {
                await sqliteDBManager.run(`
                    INSERT INTO customer_invoice_items (
                        customer_invoice_id, product_id, description,
                        quantity, unit_price, gst_rate, discount_amount,
                        total_price, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    invoiceId,
                    item.id,
                    item.name || null,
                    item.quantity,
                    item.price,
                    item.gstRate || 0,
                    item.discountAmount || 0,
                    item.total || (item.price * item.quantity),
                    new Date().toISOString()
                ]);
            }
        }
        
        // Update customer account balance
        await sqliteDBManager.run(`
            INSERT OR REPLACE INTO customer_accounts (
                customer_id, balance, updated_at
            ) VALUES (
                ?, 
                COALESCE((SELECT balance FROM customer_accounts WHERE customer_id = ?), 0) + ?,
                CURRENT_TIMESTAMP
            )
        `, [transaction.customer, transaction.customer, transaction.total_amount - transaction.paid_amount]);
        
    } catch (error) {
        console.error("Error creating customer invoice:", error);
        // Don't fail the whole transaction for invoice creation
    }
}