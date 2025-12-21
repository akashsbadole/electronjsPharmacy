/**
 * Database Configuration
 * Configure which database to use and connection settings
 */

const dbConfig = {
    // Database type: 'sqlite' or 'postgresql'
    // Can be overridden by DB_TYPE environment variable
    type: process.env.DB_TYPE || 'sqlite',

    // SQLite configuration
    sqlite: {
        // Path to SQLite database file (optional, uses default if not specified)
        // path: './data/pharmasoft.db'
    },

    // PostgreSQL configuration
    postgresql: {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT) || 5432,
        database: process.env.PG_DATABASE || 'pharmasoft',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',

        // Connection pool settings
        max: 20,                        // Maximum pool size
        idleTimeoutMillis: 30000,       // Close idle clients after 30 seconds
        connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection not established

        // SSL configuration (for production)
        ssl: process.env.PG_SSL === 'true' ? {
            rejectUnauthorized: false
        } : false
    }
};

/**
 * Get database configuration based on environment
 * @returns {Object}
 */
function getConfig() {
    const env = process.env.NODE_ENV || 'development';

    // You can add environment-specific overrides here
    if (env === 'production') {
        // Production might prefer PostgreSQL
        return {
            ...dbConfig,
            type: process.env.DB_TYPE || 'postgresql'
        };
    }

    if (env === 'test') {
        // Tests might use in-memory SQLite
        return {
            ...dbConfig,
            type: 'sqlite',
            sqlite: {
                path: ':memory:'
            }
        };
    }

    return dbConfig;
}

/**
 * Validate PostgreSQL configuration
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validatePostgresConfig() {
    const errors = [];
    const config = dbConfig.postgresql;

    if (!config.host) errors.push('PG_HOST is required');
    if (!config.database) errors.push('PG_DATABASE is required');
    if (!config.user) errors.push('PG_USER is required');

    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    dbConfig,
    getConfig,
    validatePostgresConfig
};
