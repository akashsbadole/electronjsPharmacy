const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const dbUtils = require('./db-utils');

/**
 * SQLite Database Manager to replace NeDB with proper SQL database
 * Provides connection pooling, transaction support, and proper error handling
 */
class SQLiteDatabaseManager {
    constructor() {
        this.db = null;
        this.dbPath = null;
        this.isInitialized = false;
        this.initPromise = null;
    }

    /**
     * Initialize the SQLite database
     * @param {string} dbPath - Optional custom database path
     * @returns {Promise<sqlite3.Database>}
     */
    async initialize(dbPath = null) {
        if (this.isInitialized) {
            return this.db;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._initializeDatabase(dbPath);
        return this.initPromise;
    }

    /**
     * Internal method to initialize the database
     * @param {string} customPath - Custom database path
     * @returns {Promise<sqlite3.Database>}
     * @private
     */
    async _initializeDatabase(customPath) {
        try {
            // Set database path
            this.dbPath = customPath || path.join(dbUtils.getDatabaseDir(), 'pharmasoft.db');
            
            // Ensure directory exists
            await dbUtils.ensureDirectoryExistsWithRetryAsync(path.dirname(this.dbPath));
            
            console.log(`Initializing SQLite database at: ${this.dbPath}`);
            
            // Create database connection with proper settings
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err.message);
                    throw err;
                } else {
                    console.log('Connected to SQLite database successfully');
                }
            });

            // Configure database for better performance and reliability
            await this._configureDatabase();
            
            // Create tables
            await this._createTables();
            
            // Add transaction method to database instance
            this._addTransactionMethod();
            
            this.isInitialized = true;
            console.log('SQLite database initialized successfully');
            
            return this.db;
        } catch (error) {
            console.error('Failed to initialize SQLite database:', error);
            this.initPromise = null;
            throw error;
        }
    }

    /**
     * Configure database settings for optimal performance
     * @returns {Promise<void>}
     * @private
     */
    async _configureDatabase() {
        return new Promise((resolve, reject) => {
            const settings = [
                'PRAGMA foreign_keys = ON',           // Enable foreign key constraints
                'PRAGMA journal_mode = WAL',          // Use Write-Ahead Logging for better concurrency
                'PRAGMA synchronous = NORMAL',         // Balance between safety and performance
                'PRAGMA cache_size = 10000',         // Increase cache size
                'PRAGMA temp_store = MEMORY',         // Store temporary tables in memory
                'PRAGMA mmap_size = 268435456',     // Enable memory-mapped I/O (256MB)
                'PRAGMA busy_timeout = 30000'        // Set busy timeout to 30 seconds
            ];

            let completed = 0;
            const total = settings.length;

            settings.forEach(sql => {
                this.db.run(sql, (err) => {
                    if (err) {
                        console.error(`Error setting pragma ${sql}:`, err.message);
                        reject(err);
                        return;
                    }
                    
                    completed++;
                    if (completed === total) {
                        resolve();
                    }
                });
            });
        });
    }

    /**
     * Create all necessary tables for the application
     * @returns {Promise<void>}
     * @private
     */
    async _createTables() {
        const tables = [
            // Stores table
            `CREATE TABLE IF NOT EXISTS stores (
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
            )`,

            // Categories table
            `CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                parent_category_id INTEGER,
                name VARCHAR(100) NOT NULL,
                description TEXT,
                hsn_code VARCHAR(8),
                image_url VARCHAR(255),
                display_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (store_id) REFERENCES stores(id),
                FOREIGN KEY (parent_category_id) REFERENCES categories(id),
                UNIQUE(store_id, name)
            )`,

            // Products table
            `CREATE TABLE IF NOT EXISTS products (
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
                sync_version INTEGER DEFAULT 1,
                FOREIGN KEY (store_id) REFERENCES stores(id),
                FOREIGN KEY (category_id) REFERENCES categories(id),
                UNIQUE(store_id, sku)
            )`,

            // Product pricing table
            `CREATE TABLE IF NOT EXISTS product_pricing (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                store_id INTEGER NOT NULL,
                purchase_price DECIMAL(10,2) NOT NULL,
                selling_price DECIMAL(10,2) NOT NULL,
                mrp DECIMAL(10,2),
                gst_rate DECIMAL(5,2) DEFAULT 0.00,
                effective_date DATE NOT NULL,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (store_id) REFERENCES stores(id),
                UNIQUE(product_id, store_id, effective_date)
            )`,

            // Product batches table
            `CREATE TABLE IF NOT EXISTS product_batches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                store_id INTEGER NOT NULL,
                batch_number VARCHAR(50) NOT NULL,
                expiry_date DATE NOT NULL,
                manufacturing_date DATE,
                initial_quantity INTEGER NOT NULL,
                current_quantity INTEGER NOT NULL,
                cost_price DECIMAL(10,2) NOT NULL,
                selling_price DECIMAL(10,2) NOT NULL,
                supplier_id INTEGER,
                rack_location VARCHAR(50),
                shelf_location VARCHAR(50),
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (store_id) REFERENCES stores(id),
                UNIQUE(product_id, store_id, batch_number)
            )`,

            // Store inventory table
            `CREATE TABLE IF NOT EXISTS store_inventory (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                store_id INTEGER NOT NULL,
                quantity INTEGER DEFAULT 0,
                min_stock INTEGER DEFAULT 0,
                max_stock INTEGER DEFAULT 0,
                reorder_quantity INTEGER DEFAULT 0,
                last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_by VARCHAR(50),
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (store_id) REFERENCES stores(id),
                UNIQUE(product_id, store_id)
            )`,

            // Customers table
            `CREATE TABLE IF NOT EXISTS customers (
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
            )`,

            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                username VARCHAR(50) UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                phone VARCHAR(15),
                role VARCHAR(20) DEFAULT 'STAFF',
                permissions TEXT,
                is_active BOOLEAN DEFAULT 1,
                last_login DATETIME,
                login_attempts INTEGER DEFAULT 0,
                locked_until DATETIME,
                password_changed_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1,
                FOREIGN KEY (store_id) REFERENCES stores(id)
            )`,

            // Transactions table
            `CREATE TABLE IF NOT EXISTS transactions (
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
            )`,

            // Transaction items table
            `CREATE TABLE IF NOT EXISTS transaction_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                batch_id INTEGER,
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                discount_percent DECIMAL(5,2) DEFAULT 0.00,
                discount_amount DECIMAL(8,2) DEFAULT 0.00,
                tax_rate DECIMAL(5,2) DEFAULT 0.00,
                tax_amount DECIMAL(8,2) DEFAULT 0.00,
                total_price DECIMAL(12,2) NOT NULL,
                cost_price DECIMAL(10,2),
                returned_quantity INTEGER DEFAULT 0,
                notes TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (transaction_id) REFERENCES transactions(id),
                FOREIGN KEY (product_id) REFERENCES products(id),
                FOREIGN KEY (batch_id) REFERENCES product_batches(id)
            )`,

            // Settings table
            `CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                store_id INTEGER NOT NULL,
                setting_key VARCHAR(50) NOT NULL,
                setting_value TEXT,
                setting_type VARCHAR(20) DEFAULT 'STRING',
                is_encrypted BOOLEAN DEFAULT 0,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1,
                FOREIGN KEY (store_id) REFERENCES stores(id),
                UNIQUE(store_id, setting_key)
            )`
        ];

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)',
            'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)',
            'CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)',
            'CREATE INDEX IF NOT EXISTS idx_product_pricing_product_store ON product_pricing(product_id, store_id)',
            'CREATE INDEX IF NOT EXISTS idx_product_batches_product_store ON product_batches(product_id, store_id)',
            'CREATE INDEX IF NOT EXISTS idx_product_batches_expiry ON product_batches(expiry_date)',
            'CREATE INDEX IF NOT EXISTS idx_store_inventory_product_store ON store_inventory(product_id, store_id)',
            'CREATE INDEX IF NOT EXISTS idx_customers_store ON customers(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)',
            'CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_store ON transactions(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date)',
            'CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id)',
            'CREATE INDEX IF NOT EXISTS idx_transaction_items_product ON transaction_items(product_id)',
            'CREATE INDEX IF NOT EXISTS idx_settings_store ON settings(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(setting_key)'
        ];

        // Execute all table creation statements
        for (const sql of tables) {
            await this._executeSQL(sql);
        }

        // Execute all index creation statements
        for (const sql of indexes) {
            await this._executeSQL(sql);
        }

        // Insert default store if none exists
        await this._insertDefaultStore();
    }

    /**
     * Execute SQL statement and return a promise
     * @param {string} sql - SQL statement to execute
     * @param {Array} params - Parameters for the SQL statement
     * @returns {Promise}
     * @private
     */
    _executeSQL(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    console.error(`SQL Error: ${sql}`, err.message);
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    /**
     * Insert default store if none exists
     * @returns {Promise<void>}
     * @private
     */
    async _insertDefaultStore() {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT COUNT(*) as count FROM stores', (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (row.count === 0) {
                    const insertSQL = `
                        INSERT INTO stores (
                            store_code, store_name, store_type, is_active, is_central, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                    this.db.run(insertSQL, [
                        'MAIN', 'Main Store', 'RETAIL', 1, 1, 
                        new Date().toISOString(), new Date().toISOString()
                    ], function(err) {
                        if (err) {
                            reject(err);
                        } else {
                            console.log('Default store created with ID:', this.lastID);
                            resolve();
                        }
                    });
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Get the database instance
     * @returns {sqlite3.Database}
     */
    getDatabase() {
        if (!this.isInitialized) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.db;
    }

    /**
     * Execute a query and return results
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>}
     */
    async all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    /**
     * Execute a query and return the first result
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object|null>}
     */
    async get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row || null);
                }
            });
        });
    }

    /**
     * Execute a statement and return the result info
     * @param {string} sql - SQL statement
     * @param {Array} params - Statement parameters
     * @returns {Promise<Object>}
     */
    async run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        lastID: this.lastID,
                        changes: this.changes
                    });
                }
            });
        });
    }

    /**
     * Begin a transaction
     * @returns {Promise<void>}
     */
    async beginTransaction() {
        await this.run('BEGIN TRANSACTION');
    }

    /**
     * Commit a transaction
     * @returns {Promise<void>}
     */
    async commit() {
        await this.run('COMMIT');
    }

    /**
     * Rollback a transaction
     * @returns {Promise<void>}
     */
    async rollback() {
        await this.run('ROLLBACK');
    }

    /**
     * Execute multiple statements in a transaction
     * @param {Function} callback - Function that receives the db instance
     * @returns {Promise<any>}
     */
    async transaction(callback) {
        await this.beginTransaction();
        try {
            const result = await callback(this);
            await this.commit();
            return result;
        } catch (error) {
            await this.rollback();
            throw error;
        }
    }

    /**
     * Add transaction method to database instance for compatibility
     */
    _addTransactionMethod() {
        const self = this;
        
        // Add transaction method to database instance
        this.db.transaction = async function(callback) {
            return await self.transaction(callback);
        };
    }

    /**
     * Close the database connection
     * @returns {Promise<void>}
     */
    async close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        console.log('Database connection closed');
                        this.db = null;
                        this.isInitialized = false;
                        this.initPromise = null;
                        resolve();
                    }
                });
            } else {
                resolve();
            }
        });
    }
}

// Create singleton instance
const sqliteDBManager = new SQLiteDatabaseManager();

module.exports = sqliteDBManager;