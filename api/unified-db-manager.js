const sqliteDBManager = require('./sqlite-db-manager');
const postgresDBManager = require('./postgresql-db-manager');

/**
 * Unified Database Manager
 * Provides a single interface to work with either SQLite or PostgreSQL
 * Allows switching between databases based on configuration
 */
class UnifiedDatabaseManager {
    constructor() {
        this.activeDB = null;
        this.dbType = null;
        this.isInitialized = false;
        this.config = null;
    }

    /**
     * Initialize the database based on configuration
     * @param {Object} config - Database configuration
     * @param {string} config.type - 'sqlite' or 'postgresql'
     * @param {Object} config.sqlite - SQLite specific config (optional)
     * @param {Object} config.postgresql - PostgreSQL specific config (optional)
     * @returns {Promise<void>}
     */
    async initialize(config = null) {
        if (this.isInitialized) {
            return this.activeDB;
        }

        // Default to SQLite if no config provided
        this.config = config || {
            type: process.env.DB_TYPE || 'sqlite'
        };

        this.dbType = this.config.type.toLowerCase();

        console.log(`Initializing ${this.dbType} database...`);

        try {
            if (this.dbType === 'postgresql' || this.dbType === 'postgres') {
                this.activeDB = postgresDBManager;
                await this.activeDB.initialize(this.config.postgresql);
                this.dbType = 'postgresql';
            } else {
                // Default to SQLite
                this.activeDB = sqliteDBManager;
                await this.activeDB.initialize(this.config.sqlite?.path);
                this.dbType = 'sqlite';
            }

            this.isInitialized = true;
            console.log(`${this.dbType} database initialized successfully`);
            return this.activeDB;
        } catch (error) {
            console.error(`Failed to initialize ${this.dbType} database:`, error);
            throw error;
        }
    }

    /**
     * Get the active database type
     * @returns {string}
     */
    getDBType() {
        return this.dbType;
    }

    /**
     * Get the active database manager
     * @returns {Object}
     */
    getDatabase() {
        if (!this.isInitialized) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.activeDB;
    }

    /**
     * Execute a query and return results
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Array>}
     */
    async all(sql, params = []) {
        return this.activeDB.all(sql, params);
    }

    /**
     * Execute a query and return the first result
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters
     * @returns {Promise<Object|null>}
     */
    async get(sql, params = []) {
        return this.activeDB.get(sql, params);
    }

    /**
     * Execute a statement and return the result info
     * @param {string} sql - SQL statement
     * @param {Array} params - Statement parameters
     * @returns {Promise<Object>}
     */
    async run(sql, params = []) {
        return this.activeDB.run(sql, params);
    }

    /**
     * Execute multiple statements in a transaction
     * @param {Function} callback - Function that receives the db instance
     * @returns {Promise<any>}
     */
    async transaction(callback) {
        return this.activeDB.transaction(callback);
    }

    /**
     * Close the database connection
     * @returns {Promise<void>}
     */
    async close() {
        if (this.activeDB) {
            await this.activeDB.close();
            this.isInitialized = false;
            this.activeDB = null;
        }
    }

    /**
     * Check database health
     * @returns {Promise<Object>}
     */
    async healthCheck() {
        if (!this.isInitialized) {
            return { isHealthy: false, error: 'Database not initialized' };
        }

        if (this.dbType === 'postgresql') {
            return this.activeDB.healthCheck();
        }

        // SQLite health check
        try {
            await this.activeDB.get('SELECT 1');
            return {
                isHealthy: true,
                database: 'sqlite',
                path: this.activeDB.dbPath
            };
        } catch (error) {
            return {
                isHealthy: false,
                error: error.message
            };
        }
    }

    /**
     * Switch to a different database type
     * WARNING: This will close the current connection and open a new one
     * @param {string} newType - 'sqlite' or 'postgresql'
     * @param {Object} config - Database specific configuration
     * @returns {Promise<void>}
     */
    async switchDatabase(newType, config = null) {
        console.log(`Switching database from ${this.dbType} to ${newType}...`);

        // Close current connection
        await this.close();

        // Reinitialize with new type
        this.isInitialized = false;
        await this.initialize({
            type: newType,
            [newType]: config
        });
    }

    /**
     * Sync data between SQLite and PostgreSQL
     * Useful for migrating data or keeping offline/online databases in sync
     * @param {string} direction - 'sqlite-to-postgres' or 'postgres-to-sqlite'
     * @param {Array} tables - List of tables to sync (optional, syncs all if not provided)
     * @returns {Promise<Object>}
     */
    async syncData(direction, tables = null) {
        const allTables = tables || [
            'stores', 'categories', 'products', 'product_pricing',
            'product_batches', 'store_inventory', 'customers', 'users',
            'transactions', 'transaction_items', 'settings', 'suppliers',
            'purchase_orders', 'gst_config', 'e_invoices', 'eway_bills'
        ];

        const results = {
            direction,
            tables: {},
            totalRecords: 0,
            errors: []
        };

        let sourceDB, targetDB;

        try {
            if (direction === 'sqlite-to-postgres') {
                // Initialize both databases
                await sqliteDBManager.initialize();
                await postgresDBManager.initialize();
                sourceDB = sqliteDBManager;
                targetDB = postgresDBManager;
            } else if (direction === 'postgres-to-sqlite') {
                await postgresDBManager.initialize();
                await sqliteDBManager.initialize();
                sourceDB = postgresDBManager;
                targetDB = sqliteDBManager;
            } else {
                throw new Error('Invalid sync direction. Use "sqlite-to-postgres" or "postgres-to-sqlite"');
            }

            for (const table of allTables) {
                try {
                    console.log(`Syncing table: ${table}`);

                    // Get all records from source
                    const records = await sourceDB.all(`SELECT * FROM ${table}`);

                    if (records.length === 0) {
                        results.tables[table] = { synced: 0, skipped: true };
                        continue;
                    }

                    // Get column names from first record
                    const columns = Object.keys(records[0]).filter(col => col !== 'id');

                    let syncedCount = 0;

                    for (const record of records) {
                        try {
                            const values = columns.map(col => record[col]);
                            const placeholders = columns.map((_, i) => '?').join(', ');

                            // Use INSERT OR REPLACE for SQLite, ON CONFLICT for PostgreSQL
                            let insertSql;
                            if (direction === 'sqlite-to-postgres') {
                                const pgPlaceholders = columns.map((_, i) => `$${i + 1}`).join(', ');
                                insertSql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${pgPlaceholders}) ON CONFLICT DO NOTHING`;
                            } else {
                                insertSql = `INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
                            }

                            await targetDB.run(insertSql, values);
                            syncedCount++;
                        } catch (recordError) {
                            results.errors.push({
                                table,
                                recordId: record.id,
                                error: recordError.message
                            });
                        }
                    }

                    results.tables[table] = { synced: syncedCount, total: records.length };
                    results.totalRecords += syncedCount;

                } catch (tableError) {
                    results.errors.push({
                        table,
                        error: tableError.message
                    });
                }
            }

            console.log(`Sync completed. Total records synced: ${results.totalRecords}`);
            return results;

        } catch (error) {
            console.error('Sync failed:', error);
            throw error;
        }
    }
}

// Create singleton instance
const unifiedDBManager = new UnifiedDatabaseManager();

module.exports = unifiedDBManager;
