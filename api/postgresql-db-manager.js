const { Pool } = require('pg');
const path = require('path');

/**
 * PostgreSQL Database Manager
 * Provides connection pooling, transaction support, and proper error handling
 * Compatible with the SQLite manager interface for easy switching
 */
class PostgreSQLDatabaseManager {
    constructor() {
        this.pool = null;
        this.isInitialized = false;
        this.initPromise = null;
        this.config = null;
    }

    /**
     * Initialize the PostgreSQL database connection pool
     * @param {Object} config - PostgreSQL connection configuration
     * @returns {Promise<Pool>}
     */
    async initialize(config = null) {
        if (this.isInitialized) {
            return this.pool;
        }

        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._initializeDatabase(config);
        return this.initPromise;
    }

    /**
     * Internal method to initialize the database
     * @param {Object} customConfig - Custom database configuration
     * @returns {Promise<Pool>}
     * @private
     */
    async _initializeDatabase(customConfig) {
        try {
            // Default configuration - can be overridden
            this.config = customConfig || {
                host: process.env.PG_HOST || 'localhost',
                port: parseInt(process.env.PG_PORT) || 5432,
                database: process.env.PG_DATABASE || 'pharmasoft',
                user: process.env.PG_USER || 'postgres',
                password: process.env.PG_PASSWORD || '',
                max: 20,                    // Maximum pool size
                idleTimeoutMillis: 30000,   // Close idle clients after 30 seconds
                connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection not established
            };

            console.log(`Initializing PostgreSQL database at: ${this.config.host}:${this.config.port}/${this.config.database}`);

            // Create connection pool
            this.pool = new Pool(this.config);

            // Test connection
            const client = await this.pool.connect();
            console.log('Connected to PostgreSQL database successfully');
            client.release();

            // Create tables
            await this._createTables();

            this.isInitialized = true;
            console.log('PostgreSQL database initialized successfully');

            return this.pool;
        } catch (error) {
            console.error('Failed to initialize PostgreSQL database:', error);
            this.initPromise = null;
            throw error;
        }
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
                id SERIAL PRIMARY KEY,
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
                is_active BOOLEAN DEFAULT TRUE,
                is_central BOOLEAN DEFAULT FALSE,
                parent_store_id INTEGER REFERENCES stores(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Categories table
            `CREATE TABLE IF NOT EXISTS categories (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                parent_category_id INTEGER REFERENCES categories(id),
                name VARCHAR(100) NOT NULL,
                description TEXT,
                hsn_code VARCHAR(8),
                image_url VARCHAR(255),
                display_order INTEGER DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(store_id, name)
            )`,

            // Products table
            `CREATE TABLE IF NOT EXISTS products (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                sku VARCHAR(50) UNIQUE,
                barcode VARCHAR(50),
                name VARCHAR(200) NOT NULL,
                generic_name VARCHAR(200),
                manufacturer VARCHAR(100),
                category_id INTEGER REFERENCES categories(id),
                description TEXT,
                hsn_code VARCHAR(8),
                schedule_category VARCHAR(20),
                is_prescription_required BOOLEAN DEFAULT FALSE,
                is_narcotic BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                image_url VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1,
                UNIQUE(store_id, sku)
            )`,

            // Product pricing table
            `CREATE TABLE IF NOT EXISTS product_pricing (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id),
                store_id INTEGER NOT NULL REFERENCES stores(id),
                purchase_price DECIMAL(10,2) NOT NULL,
                selling_price DECIMAL(10,2) NOT NULL,
                mrp DECIMAL(10,2),
                gst_rate DECIMAL(5,2) DEFAULT 0.00,
                effective_date DATE NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(product_id, store_id, effective_date)
            )`,

            // Product batches table
            `CREATE TABLE IF NOT EXISTS product_batches (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id),
                store_id INTEGER NOT NULL REFERENCES stores(id),
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
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(product_id, store_id, batch_number)
            )`,

            // Store inventory table
            `CREATE TABLE IF NOT EXISTS store_inventory (
                id SERIAL PRIMARY KEY,
                product_id INTEGER NOT NULL REFERENCES products(id),
                store_id INTEGER NOT NULL REFERENCES stores(id),
                quantity INTEGER DEFAULT 0,
                min_stock INTEGER DEFAULT 0,
                max_stock INTEGER DEFAULT 0,
                reorder_quantity INTEGER DEFAULT 0,
                last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by VARCHAR(50),
                UNIQUE(product_id, store_id)
            )`,

            // Customers table
            `CREATE TABLE IF NOT EXISTS customers (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
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
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1,
                UNIQUE(store_id, phone)
            )`,

            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                username VARCHAR(50) UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(100) NOT NULL,
                email VARCHAR(100),
                phone VARCHAR(15),
                role VARCHAR(20) DEFAULT 'STAFF',
                permissions TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                last_login TIMESTAMP,
                login_attempts INTEGER DEFAULT 0,
                locked_until TIMESTAMP,
                password_changed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1
            )`,

            // Transactions table
            `CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                transaction_number VARCHAR(50) UNIQUE,
                customer_id INTEGER REFERENCES customers(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
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
                transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1
            )`,

            // Transaction items table
            `CREATE TABLE IF NOT EXISTS transaction_items (
                id SERIAL PRIMARY KEY,
                transaction_id INTEGER NOT NULL REFERENCES transactions(id),
                product_id INTEGER NOT NULL REFERENCES products(id),
                batch_id INTEGER REFERENCES product_batches(id),
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
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // Settings table
            `CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                setting_key VARCHAR(50) NOT NULL,
                setting_value TEXT,
                setting_type VARCHAR(20) DEFAULT 'STRING',
                is_encrypted BOOLEAN DEFAULT FALSE,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1,
                UNIQUE(store_id, setting_key)
            )`,

            // Suppliers table
            `CREATE TABLE IF NOT EXISTS suppliers (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                supplier_code VARCHAR(20) UNIQUE,
                name VARCHAR(100) NOT NULL,
                contact_person VARCHAR(100),
                phone VARCHAR(15),
                email VARCHAR(100),
                address TEXT,
                city VARCHAR(50),
                state VARCHAR(50),
                pincode VARCHAR(6),
                gst_number VARCHAR(15),
                drug_license_number VARCHAR(20),
                payment_terms INTEGER DEFAULT 30,
                credit_limit DECIMAL(12,2) DEFAULT 0.00,
                current_balance DECIMAL(12,2) DEFAULT 0.00,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1
            )`,

            // Purchase orders table
            `CREATE TABLE IF NOT EXISTS purchase_orders (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                po_number VARCHAR(50) UNIQUE NOT NULL,
                supplier_id INTEGER NOT NULL REFERENCES suppliers(id),
                order_date DATE NOT NULL,
                expected_delivery_date DATE,
                status VARCHAR(20) DEFAULT 'DRAFT',
                subtotal DECIMAL(12,2) DEFAULT 0.00,
                tax_amount DECIMAL(12,2) DEFAULT 0.00,
                discount_amount DECIMAL(12,2) DEFAULT 0.00,
                total_amount DECIMAL(12,2) DEFAULT 0.00,
                notes TEXT,
                created_by INTEGER REFERENCES users(id),
                approved_by INTEGER REFERENCES users(id),
                approved_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                sync_version INTEGER DEFAULT 1
            )`,

            // GST configuration table
            `CREATE TABLE IF NOT EXISTS gst_config (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                gst_number VARCHAR(15) NOT NULL,
                legal_name VARCHAR(200),
                trade_name VARCHAR(200),
                address TEXT,
                state_code VARCHAR(2),
                is_composition BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(store_id)
            )`,

            // E-Invoice table
            `CREATE TABLE IF NOT EXISTS e_invoices (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                transaction_id INTEGER REFERENCES transactions(id),
                irn VARCHAR(100) UNIQUE,
                ack_number VARCHAR(50),
                ack_date TIMESTAMP,
                signed_invoice TEXT,
                signed_qr_code TEXT,
                status VARCHAR(20) DEFAULT 'PENDING',
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )`,

            // E-Way Bill table
            `CREATE TABLE IF NOT EXISTS eway_bills (
                id SERIAL PRIMARY KEY,
                store_id INTEGER NOT NULL REFERENCES stores(id),
                transaction_id INTEGER REFERENCES transactions(id),
                eway_bill_number VARCHAR(20) UNIQUE,
                eway_bill_date TIMESTAMP,
                valid_upto TIMESTAMP,
                transporter_id VARCHAR(15),
                transporter_name VARCHAR(100),
                vehicle_number VARCHAR(20),
                transport_mode VARCHAR(20),
                distance INTEGER,
                status VARCHAR(20) DEFAULT 'PENDING',
                error_message TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
            'CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(setting_key)',
            'CREATE INDEX IF NOT EXISTS idx_suppliers_store ON suppliers(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_purchase_orders_store ON purchase_orders(store_id)',
            'CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id)'
        ];

        const client = await this.pool.connect();
        try {
            // Execute all table creation statements
            for (const sql of tables) {
                await client.query(sql);
            }

            // Execute all index creation statements
            for (const sql of indexes) {
                await client.query(sql);
            }

            // Insert default store if none exists
            await this._insertDefaultStore(client);
        } finally {
            client.release();
        }
    }


    /**
     * Insert default store if none exists
     * @param {Client} client - PostgreSQL client
     * @returns {Promise<void>}
     * @private
     */
    async _insertDefaultStore(client) {
        const result = await client.query('SELECT COUNT(*) as count FROM stores');

        if (parseInt(result.rows[0].count) === 0) {
            await client.query(`
                INSERT INTO stores (store_code, store_name, store_type, is_active, is_central)
                VALUES ($1, $2, $3, $4, $5)
            `, ['MAIN', 'Main Store', 'RETAIL', true, true]);
            console.log('Default store created');
        }
    }

    /**
     * Get the database pool instance
     * @returns {Pool}
     */
    getDatabase() {
        if (!this.isInitialized) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.pool;
    }

    /**
     * Execute a query and return results (compatible with SQLite interface)
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>}
     */
    async all(sql, params = []) {
        // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
        const pgSql = this._convertPlaceholders(sql);
        const result = await this.pool.query(pgSql, params);
        return result.rows;
    }

    /**
     * Execute a query and return the first result (compatible with SQLite interface)
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object|null>}
     */
    async get(sql, params = []) {
        const pgSql = this._convertPlaceholders(sql);
        const result = await this.pool.query(pgSql, params);
        return result.rows[0] || null;
    }

    /**
     * Execute a statement and return the result info (compatible with SQLite interface)
     * @param {string} sql - SQL statement
     * @param {Array} params - Statement parameters
     * @returns {Promise<Object>}
     */
    async run(sql, params = []) {
        const pgSql = this._convertPlaceholders(sql);

        // Handle INSERT with RETURNING for lastID
        let modifiedSql = pgSql;
        if (sql.trim().toUpperCase().startsWith('INSERT') && !pgSql.includes('RETURNING')) {
            modifiedSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
        }

        const result = await this.pool.query(modifiedSql, params);

        return {
            lastID: result.rows[0]?.id || null,
            changes: result.rowCount
        };
    }

    /**
     * Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
     * @param {string} sql - SQL with ? placeholders
     * @returns {string} - SQL with $n placeholders
     * @private
     */
    _convertPlaceholders(sql) {
        let index = 0;
        return sql.replace(/\?/g, () => `$${++index}`);
    }

    /**
     * Begin a transaction
     * @returns {Promise<Client>}
     */
    async beginTransaction() {
        const client = await this.pool.connect();
        await client.query('BEGIN');
        return client;
    }

    /**
     * Commit a transaction
     * @param {Client} client - PostgreSQL client
     * @returns {Promise<void>}
     */
    async commit(client) {
        await client.query('COMMIT');
        client.release();
    }

    /**
     * Rollback a transaction
     * @param {Client} client - PostgreSQL client
     * @returns {Promise<void>}
     */
    async rollback(client) {
        await client.query('ROLLBACK');
        client.release();
    }

    /**
     * Execute multiple statements in a transaction (compatible with SQLite interface)
     * @param {Function} callback - Function that receives the transaction context
     * @returns {Promise<any>}
     */
    async transaction(callback) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Create a transaction context with query methods
            const txContext = {
                all: async (sql, params = []) => {
                    const pgSql = this._convertPlaceholders(sql);
                    const result = await client.query(pgSql, params);
                    return result.rows;
                },
                get: async (sql, params = []) => {
                    const pgSql = this._convertPlaceholders(sql);
                    const result = await client.query(pgSql, params);
                    return result.rows[0] || null;
                },
                run: async (sql, params = []) => {
                    const pgSql = this._convertPlaceholders(sql);
                    let modifiedSql = pgSql;
                    if (sql.trim().toUpperCase().startsWith('INSERT') && !pgSql.includes('RETURNING')) {
                        modifiedSql = pgSql.replace(/;?\s*$/, ' RETURNING id');
                    }
                    const result = await client.query(modifiedSql, params);
                    return {
                        lastID: result.rows[0]?.id || null,
                        changes: result.rowCount
                    };
                }
            };

            const result = await callback(txContext);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Close the database connection pool
     * @returns {Promise<void>}
     */
    async close() {
        if (this.pool) {
            await this.pool.end();
            console.log('PostgreSQL connection pool closed');
            this.pool = null;
            this.isInitialized = false;
            this.initPromise = null;
        }
    }

    /**
     * Check database health
     * @returns {Promise<Object>}
     */
    async healthCheck() {
        try {
            const result = await this.pool.query('SELECT NOW() as time, current_database() as database');
            return {
                isHealthy: true,
                database: result.rows[0].database,
                serverTime: result.rows[0].time,
                poolSize: this.pool.totalCount,
                idleConnections: this.pool.idleCount,
                waitingClients: this.pool.waitingCount
            };
        } catch (error) {
            return {
                isHealthy: false,
                error: error.message
            };
        }
    }
}

// Create singleton instance
const postgresDBManager = new PostgreSQLDatabaseManager();

module.exports = postgresDBManager;
