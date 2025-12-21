const http = require("http");
const app = require("express")();
const server = http.createServer(app);
const bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");
const pkg = require("./package.json");

// Import database initializer
const dbInitializer = require('./api/db-initializer');
const sqliteDBManager = require('./api/sqlite-db-manager');
const unifiedDBManager = require('./api/unified-db-manager');
const { getConfig } = require('./api/db-config');

// Defer Electron app initialization until after app is ready
let electronApp;

// Set up environment variables when Electron app is available
function setupElectronEnvironment() {
    if (!electronApp) {
        try {
            electronApp = require('electron').app;
        } catch (e) {
            // Electron app not available yet
            return;
        }
    }

    if (electronApp && !process.env.APPDATA) {
        process.env.APPDATA = electronApp.getPath('appData');
        process.env.APPNAME = pkg.name;
    }
}

const PORT = process.env.PORT || 3000;
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
});

console.log("Server starting...");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(limiter);

app.all("/*", function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
    res.header(
        "Access-Control-Allow-Headers",
        "Content-type,Accept,X-Access-Token,X-Key",
    );
    if (req.method == "OPTIONS") {
        res.status(200).end();
    } else {
        next();
    }
});

app.get("/", function (req, res) {
    res.send("POS Server Online.");
});

/**
 * Database health check endpoint
 */
app.get("/api/health", async function (req, res) {
    try {
        const healthReport = await dbInitializer.getAllDatabaseHealth();
        const initializedDbs = dbInitializer.getInitializedDatabases();
        const unifiedHealth = await unifiedDBManager.healthCheck();

        res.json({
            status: "healthy",
            timestamp: new Date().toISOString(),
            activeDatabase: unifiedDBManager.getDBType(),
            databases: {
                initialized: initializedDbs,
                count: initializedDbs.length,
                health: healthReport,
                unified: unifiedHealth
            }
        });
    } catch (error) {
        console.error("Health check failed:", error);
        res.status(500).json({
            status: "unhealthy",
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

/**
 * Database health check endpoint for specific database
 */
app.get("/api/health/:dbName", async function (req, res) {
    try {
        const dbName = req.params.dbName;
        const health = await dbInitializer.getDatabaseHealth(dbName);

        res.json({
            database: dbName,
            status: health.isHealthy ? "healthy" : "unhealthy",
            timestamp: new Date().toISOString(),
            health: health
        });
    } catch (error) {
        console.error(`Health check failed for ${req.params.dbName}:`, error);
        res.status(500).json({
            database: req.params.dbName,
            status: "unhealthy",
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

/**
 * Sequentially initialize all API modules to prevent race conditions
 * @returns {Promise<void>}
 */
async function initializeApiModules() {
    const apiModules = [
        // Core SQLite API modules only
        { path: "/api/inventory", module: "./api/inventory-sqlite" },
        { path: "/api/categories", module: "./api/categories-sqlite" },
        { path: "/api/transactions", module: "./api/transactions-sqlite" },

        // New SQLite implementations for critical endpoints
        { path: "/api/settings", module: "./api/settings-sqlite" },
        { path: "/api/users", module: "./api/users-sqlite" },
        { path: "/api/customers", module: "./api/customers-sqlite" },
        { path: "/api/stores", module: "./api/stores-sqlite" },
        { path: "/api/gst-config", module: "./api/gst-config-sqlite" },
        { path: "/api/e-invoice", module: "./api/e-invoice-sqlite" },
        { path: "/api/eway-bill", module: "./api/eway-bill-sqlite" },
        { path: "/api/transporters", module: "./api/transporters" },
        // // New inventory management APIs
        { path: "/api/batches", module: "./api/batches-sqlite" },
        { path: "/api/suppliers", module: "./api/suppliers-sqlite" },
        { path: "/api/purchase-orders", module: "./api/purchase-orders-sqlite" },
        { path: "/api/purchase-order-items", module: "./api/purchase-order-items" },
        { path: "/api/stock-adjustments", module: "./api/stock-adjustments" },
        { path: "/api/reorder-suggestions", module: "./api/reorder-suggestions" },
        // // Multi-store management APIs
        { path: "/api/store-inventory", module: "./api/store-inventory" },
        { path: "/api/transfers", module: "./api/transfers" },
        { path: "/api/store-permissions", module: "./api/store-permissions" },
        // // Accounts payable/receivable APIs
        { path: "/api/supplier-accounts", module: "./api/supplier-accounts" },
        { path: "/api/customer-accounts", module: "./api/customer-accounts" },
        { path: "/api/payments", module: "./api/payments" },
        { path: "/api/payment-terms", module: "./api/payment-terms" },
        { path: "/api/supplier-invoices", module: "./api/supplier-invoices" },
        { path: "/api/customer-invoices", module: "./api/customer-invoices" },
        // // Analytics and Reports APIs
        { path: "/api/analytics", module: "./api/analytics-sqlite" },
        { path: "/api/reports", module: "./api/reports-sqlite" },
        { path: "/api/dashboard", module: "./api/dashboard-sqlite" },
        // // Loyalty and Promotions APIs
        { path: "/api/loyalty", module: "./api/loyalty" },
        { path: "/api/promotions", module: "./api/promotions" },
        { path: "/api/rewards", module: "./api/rewards" },
        { path: "/api/loyalty-analytics", module: "./api/loyalty-analytics" },
        // // Home Delivery Management APIs
        { path: "/api/delivery-orders", module: "./api/delivery-orders" },
        { path: "/api/drivers", module: "./api/drivers" },
        { path: "/api/delivery-routes", module: "./api/delivery-routes" },
        { path: "/api/delivery-tracking", module: "./api/delivery-tracking" },
        // // Stock Counting APIs
        { path: "/api/stock-counting", module: "./api/stock-counting" },
        { path: "/api/stock-count-items", module: "./api/stock-count-items" },
        { path: "/api/stock-variances", module: "./api/stock-variances" },
        { path: "/api/stock-count-approvals", module: "./api/stock-count-approvals" },
        // // Custom Reports APIs
        { path: "/api/custom-reports", module: "./api/custom-reports" },
        { path: "/api/report-templates", module: "./api/report-templates" },
        { path: "/api/report-execution", module: "./api/report-execution" },
        { path: "/api/report-scheduler", module: "./api/report-scheduler" },
        { path: "/api/report-export", module: "./api/report-export" },
        { path: "/api/report-cache", module: "./api/report-cache" },
        // // Customer Communication APIs
        { path: "/api/customer-communication", module: "./api/customer-communication" },
        { path: "/api/communication-templates", module: "./api/communication-templates" },
        { path: "/api/communication-campaigns", module: "./api/communication-campaigns" },
        { path: "/api/message-queue", module: "./api/message-queue" },
        { path: "/api/customer-communication-preferences", module: "./api/customer-communication-preferences" },
        // // Doctors and Prescriptions APIs
        { path: "/api/doctors", module: "./api/doctors" },
        { path: "/api/prescriptions", module: "./api/prescriptions" },
        { path: "/api/prescription-items", module: "./api/prescription-items" }
    ];

    console.log("Initializing API modules sequentially...");

    // Initialize modules one by one to prevent race conditions
    for (const api of apiModules) {
        try {
            console.log(`Loading API module: ${api.path}`);

            // Add a small delay between module initializations to reduce file system contention
            if (apiModules.indexOf(api) > 0) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            app.use(api.path, require(api.module));
            console.log(`API module loaded successfully: ${api.path}`);
        } catch (error) {
            console.error(`Failed to load API module ${api.path}:`, error);
            // Continue loading other modules even if one fails
        }
    }

    console.log("All API modules initialized");
}

/**
 * Initialize and start server
 */
async function startServer() {
    try {
        // Setup environment first
        setupElectronEnvironment();

        // Get database configuration
        const dbConfig = getConfig();
        console.log(`Database type configured: ${dbConfig.type}`);

        // Initialize unified database manager (supports both SQLite and PostgreSQL)
        console.log("Initializing database...");
        await unifiedDBManager.initialize(dbConfig);

        // Also initialize SQLite for backward compatibility with existing modules
        if (dbConfig.type === 'sqlite') {
            await sqliteDBManager.initialize();
        }

        console.log(`Database initialized: ${unifiedDBManager.getDBType()}`);

        // Initialize API modules sequentially
        await initializeApiModules();

        // Global error handler
        app.use((err, req, res, next) => {
            console.error("API Error:", err.stack);
            res.status(500).json({
                status: "error",
                message: "Internal Server Error",
                details: process.env.NODE_ENV === 'dev' ? err.message : undefined
            });
        });

        // Start the server
        server.listen(PORT, () => {
            process.env.PORT = server.address().port;
            console.log("Server started successfully");
            console.log("Listening on PORT", process.env.PORT);

            // Log database status after server starts
            setTimeout(async () => {
                try {
                    const healthReport = await dbInitializer.getAllDatabaseHealth();
                    console.log("Database health status after startup:", healthReport);
                } catch (error) {
                    console.error("Failed to get database health status:", error);
                }
            }, 5000); // Check after 5 seconds
        });

    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');

    try {
        await dbInitializer.closeAllDatabases();
        console.log('All databases closed');

        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');

    try {
        await dbInitializer.closeAllDatabases();
        console.log('All databases closed');

        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Start the server
startServer();

/**
 * Restarts the server process.
 */
function restartServer() {
    server.close(() => {
        // Remove cached modules so require() reloads them
        Object.keys(require.cache).forEach(key => {
            if (key.includes('api') || key.endsWith('server.js')) {
                delete require.cache[key];
            }
        });
        // Re-require server.js to restart everything
        require('./server');
    });
}

module.exports = { restartServer };