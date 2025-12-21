const Datastore = require('@seald-io/nedb');
const sqliteDBManager = require('./api/sqlite-db-manager');
const dbUtils = require('./api/db-utils');
const path = require('path');
const fs = require('fs');

/**
 * Migration script to migrate data from NeDB to SQLite
 * This script handles the transformation of data from the old NeDB format
 * to the new SQLite relational schema
 */

class NeDBToSQLiteMigrator {
    constructor() {
        this.nedbPath = dbUtils.getDatabaseDir();
        this.migrationLog = [];
        this.errors = [];
    }

    /**
     * Log migration progress
     * @param {string} message - Log message
     * @param {string} level - Log level (INFO, WARN, ERROR)
     */
    log(message, level = 'INFO') {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] [${level}] ${message}`;
        console.log(logEntry);
        this.migrationLog.push({ timestamp, level, message });
    }

    /**
     * Log error
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    logError(message, error) {
        this.log(message, 'ERROR');
        this.errors.push({ message, error: error.message, stack: error.stack });
    }

    /**
     * Initialize NeDB database
     * @param {string} filename - NeDB filename
     * @returns {Promise<Datastore>}
     */
    async initNeDB(filename) {
        return new Promise((resolve, reject) => {
            const dbPath = path.join(this.nedbPath, filename);
            const db = new Datastore({ filename: dbPath, autoload: true });
            
            // Wait for database to load
            db.loadDatabase(err => {
                if (err) {
                    reject(err);
                } else {
                    resolve(db);
                }
            });
        });
    }

    /**
     * Check if NeDB file exists
     * @param {string} filename - NeDB filename
     * @returns {boolean}
     */
    nedbFileExists(filename) {
        const dbPath = path.join(this.nedbPath, filename);
        return fs.existsSync(dbPath);
    }

    /**
     * Migrate stores data
     */
    async migrateStores() {
        this.log('Starting stores migration...');
        
        if (!this.nedbFileExists('stores.db')) {
            this.log('No stores.db file found, skipping stores migration', 'WARN');
            return;
        }

        try {
            const storesDB = await this.initNeDB('stores.db');
            const stores = await this.findAll(storesDB);
            
            if (stores.length === 0) {
                this.log('No stores found in NeDB', 'WARN');
                return;
            }

            for (const store of stores) {
                await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO stores (
                        id, store_code, store_name, store_type, address_line1,
                        address_line2, city, state, country, pincode,
                        phone, email, gst_number, drug_license_number,
                        store_timings, is_active, is_central, parent_store_id,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    store._id,
                    store.storeCode || `STORE${store._id}`,
                    store.name || 'Default Store',
                    store.storeType || 'RETAIL',
                    store.address_line1 || null,
                    store.address_line2 || null,
                    store.city || null,
                    store.state || null,
                    store.country || 'India',
                    store.pincode || null,
                    store.phone || null,
                    store.email || null,
                    store.gst_number || null,
                    store.drug_license_number || null,
                    JSON.stringify(store.store_timings || {}),
                    store.is_active !== undefined ? (store.is_active ? 1 : 0) : 1,
                    store.is_central !== undefined ? (store.is_central ? 1 : 0) : 0,
                    store.parent_store_id || null,
                    store.createdAt || new Date().toISOString(),
                    store.updatedAt || new Date().toISOString()
                ]);
            }
            
            this.log(`Migrated ${stores.length} stores`);
        } catch (error) {
            this.logError('Failed to migrate stores', error);
        }
    }

    /**
     * Migrate categories data
     */
    async migrateCategories() {
        this.log('Starting categories migration...');
        
        if (!this.nedbFileExists('categories.db')) {
            this.log('No categories.db file found, skipping categories migration', 'WARN');
            return;
        }

        try {
            const categoriesDB = await this.initNeDB('categories.db');
            const categories = await this.findAll(categoriesDB);
            
            if (categories.length === 0) {
                this.log('No categories found in NeDB', 'WARN');
                return;
            }

            const sqliteDB = sqliteDBManager.getDatabase();
            
            for (const category of categories) {
                await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO categories (
                        id, store_id, parent_category_id, name, description,
                        hsn_code, image_url, display_order, is_active,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    category._id,
                    category.store_id || 1,
                    category.parent_category_id || null,
                    category.name,
                    category.description || null,
                    category.hsn_code || null,
                    category.image_url || null,
                    category.display_order || 0,
                    category.is_active !== undefined ? (category.is_active ? 1 : 0) : 1,
                    category.createdAt || new Date().toISOString(),
                    category.updatedAt || new Date().toISOString()
                ]);
            }
            
            this.log(`Migrated ${categories.length} categories`);
        } catch (error) {
            this.logError('Failed to migrate categories', error);
        }
    }

    /**
     * Migrate products data
     */
    async migrateProducts() {
        this.log('Starting products migration...');
        
        if (!this.nedbFileExists('inventory.db')) {
            this.log('No inventory.db file found, skipping products migration', 'WARN');
            return;
        }

        try {
            const inventoryDB = await this.initNeDB('inventory.db');
            const products = await this.findAll(inventoryDB);
            
            if (products.length === 0) {
                this.log('No products found in NeDB', 'WARN');
                return;
            }

            for (const product of products) {
                await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO products (
                        id, store_id, sku, barcode, name, generic_name,
                        manufacturer, category_id, description, hsn_code,
                        schedule_category, is_prescription_required, is_narcotic,
                        image_url, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    product._id,
                    product.store_id || 1,
                    product.sku || null,
                    product.barcode || null,
                    product.name,
                    product.generic_name || null,
                    product.manufacturer || null,
                    product.category || null,
                    product.description || null,
                    product.hsn_code || null,
                    product.schedule_category || null,
                    product.is_prescription_required !== undefined ? (product.is_prescription_required ? 1 : 0) : 0,
                    product.is_narcotic !== undefined ? (product.is_narcotic ? 1 : 0) : 0,
                    product.img || null,
                    product.createdAt || new Date().toISOString(),
                    product.updatedAt || new Date().toISOString()
                ]);
                
                // Create product pricing record
                await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO product_pricing (
                        product_id, store_id, purchase_price, selling_price,
                        mrp, gst_rate, effective_date, is_active,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_DATE, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    product._id,
                    product.store_id || 1,
                    product.purchase_price || 0,
                    product.price || 0,
                    product.mrp || 0,
                    product.gst_rate || 0
                ]);
                
                // Create store inventory record
                await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO store_inventory (
                        product_id, store_id, quantity, min_stock,
                        max_stock, reorder_quantity, last_updated, updated_by
                    ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'migration')
                `, [
                    product._id,
                    product.store_id || 1,
                    product.quantity || 0,
                    product.minStock || 0,
                    product.maxStock || 0,
                    product.reorder_quantity || 0
                ]);
            }
            
            this.log(`Migrated ${products.length} products`);
        } catch (error) {
            this.logError('Failed to migrate products', error);
        }
    }

    /**
     * Migrate customers data
     */
    async migrateCustomers() {
        this.log('Starting customers migration...');
        
        if (!this.nedbFileExists('customers.db')) {
            this.log('No customers.db file found, skipping customers migration', 'WARN');
            return;
        }

        try {
            const customersDB = await this.initNeDB('customers.db');
            const customers = await this.findAll(customersDB);
            
            if (customers.length === 0) {
                this.log('No customers found in NeDB', 'WARN');
                return;
            }

            for (const customer of customers) {
                await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO customers (
                        id, store_id, customer_code, name, phone,
                        email, address, city, state, pincode,
                        gst_number, date_of_birth, anniversary_date,
                        customer_type, credit_limit, current_balance,
                        is_active, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    customer._id,
                    customer.store_id || 1,
                    customer.customer_code || null,
                    customer.name,
                    customer.phone || null,
                    customer.email || null,
                    customer.address || null,
                    customer.city || null,
                    customer.state || null,
                    customer.pincode || null,
                    customer.gst_number || null,
                    customer.date_of_birth || null,
                    customer.anniversary_date || null,
                    customer.customer_type || 'REGULAR',
                    customer.credit_limit || 0,
                    customer.current_balance || 0,
                    customer.is_active !== undefined ? (customer.is_active ? 1 : 0) : 1,
                    customer.createdAt || new Date().toISOString(),
                    customer.updatedAt || new Date().toISOString()
                ]);
            }
            
            this.log(`Migrated ${customers.length} customers`);
        } catch (error) {
            this.logError('Failed to migrate customers', error);
        }
    }

    /**
     * Migrate users data
     */
    async migrateUsers() {
        this.log('Starting users migration...');
        
        if (!this.nedbFileExists('users.db')) {
            this.log('No users.db file found, skipping users migration', 'WARN');
            return;
        }

        try {
            const usersDB = await this.initNeDB('users.db');
            const users = await this.findAll(usersDB);
            
            if (users.length === 0) {
                this.log('No users found in NeDB', 'WARN');
                return;
            }

            for (const user of users) {
                await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO users (
                        id, store_id, username, password_hash, full_name,
                        email, phone, role, permissions, is_active,
                        last_login, login_attempts, locked_until,
                        password_changed_at, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    user._id,
                    user.store_id || 1,
                    user.username,
                    user.password,
                    user.fullname || user.full_name || user.name,
                    user.email || null,
                    user.phone || null,
                    user.role || 'STAFF',
                    JSON.stringify(user.permissions || {}),
                    user.status !== undefined ? (user.status === 'active' ? 1 : 0) : 1,
                    user.last_login || null,
                    user.login_attempts || 0,
                    user.locked_until || null,
                    user.password_changed_at || null,
                    user.createdAt || new Date().toISOString(),
                    user.updatedAt || new Date().toISOString()
                ]);
            }
            
            this.log(`Migrated ${users.length} users`);
        } catch (error) {
            this.logError('Failed to migrate users', error);
        }
    }

    /**
     * Migrate transactions data
     */
    async migrateTransactions() {
        this.log('Starting transactions migration...');
        
        if (!this.nedbFileExists('transactions.db')) {
            this.log('No transactions.db file found, skipping transactions migration', 'WARN');
            return;
        }

        try {
            const transactionsDB = await this.initNeDB('transactions.db');
            const transactions = await this.findAll(transactionsDB);
            
            if (transactions.length === 0) {
                this.log('No transactions found in NeDB', 'WARN');
                return;
            }

            for (const transaction of transactions) {
                // Insert main transaction
                const result = await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO transactions (
                        id, store_id, transaction_number, customer_id,
                        user_id, till_id, transaction_type, transaction_status,
                        subtotal, discount_amount, tax_amount, total_amount,
                        paid_amount, balance_amount, payment_method,
                        payment_details, notes, reference_number,
                        transaction_date, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    transaction._id,
                    transaction.store_id || 1,
                    transaction.transaction_number || `TXN${transaction._id}`,
                    transaction.customer || null,
                    transaction.user_id || null,
                    transaction.till || null,
                    transaction.transaction_type || 'SALE',
                    transaction.status || 'COMPLETED',
                    transaction.subtotal || transaction.total || 0,
                    transaction.discount_amount || 0,
                    transaction.tax_amount || 0,
                    transaction.total || 0,
                    transaction.paid || 0,
                    (transaction.total || 0) - (transaction.paid || 0),
                    transaction.payment_method || null,
                    JSON.stringify(transaction.payment_details || {}),
                    transaction.notes || null,
                    transaction.ref_number || null,
                    transaction.date || new Date().toISOString(),
                    transaction.createdAt || new Date().toISOString(),
                    transaction.updatedAt || new Date().toISOString()
                ]);
                
                // Insert transaction items if they exist
                if (transaction.items && Array.isArray(transaction.items)) {
                    for (const item of transaction.items) {
                        await sqliteDBManager.run(`
                            INSERT OR REPLACE INTO transaction_items (
                                transaction_id, product_id, batch_id, quantity,
                                unit_price, discount_percent, discount_amount,
                                tax_rate, tax_amount, total_price, cost_price,
                                notes, created_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        `, [
                            transaction._id,
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
            }
            
            this.log(`Migrated ${transactions.length} transactions`);
        } catch (error) {
            this.logError('Failed to migrate transactions', error);
        }
    }

    /**
     * Migrate settings data
     */
    async migrateSettings() {
        this.log('Starting settings migration...');
        
        if (!this.nedbFileExists('settings.db')) {
            this.log('No settings.db file found, skipping settings migration', 'WARN');
            return;
        }

        try {
            const settingsDB = await this.initNeDB('settings.db');
            const settings = await this.findAll(settingsDB);
            
            if (settings.length === 0) {
                this.log('No settings found in NeDB', 'WARN');
                return;
            }

            for (const setting of settings) {
                await sqliteDBManager.run(`
                    INSERT OR REPLACE INTO settings (
                        id, store_id, setting_key, setting_value,
                        setting_type, is_encrypted, description,
                        created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    setting._id,
                    setting.store_id || 1,
                    setting.app || 'general',
                    JSON.stringify(setting),
                    'JSON',
                    0,
                    `Migrated from NeDB: ${setting.app}`,
                    setting.createdAt || new Date().toISOString(),
                    setting.updatedAt || new Date().toISOString()
                ]);
            }
            
            this.log(`Migrated ${settings.length} settings`);
        } catch (error) {
            this.logError('Failed to migrate settings', error);
        }
    }

    /**
     * Find all documents in NeDB
     * @param {Datastore} db - NeDB instance
     * @returns {Promise<Array>}
     */
    async findAll(db) {
        return new Promise((resolve, reject) => {
            db.find({}, (err, docs) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(docs || []);
                }
            });
        });
    }

    /**
     * Run complete migration
     */
    async runMigration() {
        this.log('Starting NeDB to SQLite migration...');
        
        try {
            // Initialize SQLite database
            await sqliteDBManager.initialize();
            this.log('SQLite database initialized');
            
            // Run migrations in order
            await this.migrateStores();
            await this.migrateCategories();
            await this.migrateProducts();
            await this.migrateCustomers();
            await this.migrateUsers();
            await this.migrateTransactions();
            await this.migrateSettings();
            
            this.log('Migration completed successfully');
            
            // Generate migration report
            await this.generateMigrationReport();
            
        } catch (error) {
            this.logError('Migration failed', error);
            throw error;
        }
    }

    /**
     * Generate migration report
     */
    async generateMigrationReport() {
        const reportPath = path.join(process.cwd(), 'migration-report.json');
        
        const report = {
            timestamp: new Date().toISOString(),
            status: this.errors.length > 0 ? 'COMPLETED_WITH_ERRORS' : 'COMPLETED',
            summary: {
                totalLogs: this.migrationLog.length,
                errors: this.errors.length,
                warnings: this.migrationLog.filter(log => log.level === 'WARN').length
            },
            logs: this.migrationLog,
            errors: this.errors
        };
        
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        this.log(`Migration report generated: ${reportPath}`);
    }
}

// Run migration if this script is executed directly
if (require.main === module) {
    const migrator = new NeDBToSQLiteMigrator();
    
    migrator.runMigration()
        .then(() => {
            console.log('Migration completed successfully');
            process.exit(0);
        })
        .catch(error => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}

module.exports = NeDBToSQLiteMigrator;