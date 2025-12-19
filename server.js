const http = require("http");
const app = require("express")();
const server = http.createServer(app);
const bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");
const pkg = require("./package.json");

// Defer Electron app initialization until after app is ready
let electronApp;
try {
    electronApp = require('electron').app;
} catch (e) {
    // Electron app not available yet, will be set later
}

// Set up environment variables when Electron app is available
function setupElectronEnvironment() {
    if (electronApp && !process.env.APPDATA) {
        process.env.APPDATA = electronApp.getPath('appData');
        process.env.APPNAME = pkg.name;
    }
}

// Try to set up immediately if Electron is available
setupElectronEnvironment();

// Initialize database directories before loading any API modules
const dbUtils = require("./api/db-utils");
try {
    dbUtils.initializeDirectories();
    console.log("Database directories initialized successfully");
} catch (error) {
    console.error("Failed to initialize database directories:", error);
    process.exit(1);
}

const PORT = process.env.PORT || 0;
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
});

console.log("Server starting...");
require('fs').appendFileSync('debug.log', 'Server starting at ' + new Date().toISOString() + '\n');


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

app.use("/api/inventory", require("./api/inventory"));
app.use("/api/customers", require("./api/customers"));
app.use("/api/categories", require("./api/categories"));
app.use("/api/settings", require("./api/settings"));
app.use("/api/users", require("./api/users"));
app.use("/api", require("./api/transactions"));
app.use("/api/gst-config", require("./api/gst-config"));
app.use("/api/e-invoice", require("./api/e-invoice"));
app.use("/api/eway-bill", require("./api/eway-bill"));
app.use("/api/transporters", require("./api/transporters"));
// New inventory management APIs
app.use("/api/batches", require("./api/batches"));
app.use("/api/suppliers", require("./api/suppliers"));
app.use("/api/purchase-orders", require("./api/purchase-orders"));
app.use("/api/purchase-order-items", require("./api/purchase-order-items"));
app.use("/api/stock-adjustments", require("./api/stock-adjustments"));
app.use("/api/reorder-suggestions", require("./api/reorder-suggestions"));
// Multi-store management APIs
app.use("/api/stores", require("./api/stores"));
app.use("/api/store-inventory", require("./api/store-inventory"));
app.use("/api/transfers", require("./api/transfers"));
app.use("/api/store-permissions", require("./api/store-permissions"));
// Accounts payable/receivable APIs
app.use("/api/supplier-accounts", require("./api/supplier-accounts"));
app.use("/api/customer-accounts", require("./api/customer-accounts"));
app.use("/api/payments", require("./api/payments"));
app.use("/api/payment-terms", require("./api/payment-terms"));
app.use("/api/supplier-invoices", require("./api/supplier-invoices"));
app.use("/api/customer-invoices", require("./api/customer-invoices"));
// Analytics and Reports APIs
app.use("/api/analytics", require("./api/analytics"));
app.use("/api/reports", require("./api/reports"));
app.use("/api/dashboard", require("./api/dashboard"));
// Loyalty and Promotions APIs
app.use("/api/loyalty", require("./api/loyalty"));
app.use("/api/promotions", require("./api/promotions"));
app.use("/api/rewards", require("./api/rewards"));
app.use("/api/loyalty-analytics", require("./api/loyalty-analytics"));
// Home Delivery Management APIs
app.use("/api/delivery/orders", require("./api/delivery-orders"));
app.use("/api/delivery/drivers", require("./api/drivers"));
app.use("/api/delivery/routes", require("./api/delivery-routes"));
app.use("/api/delivery/tracking", require("./api/delivery-tracking"));
// Stock Counting APIs
app.use("/api/stock-counts", require("./api/stock-counting"));
app.use("/api/stock-count-items", require("./api/stock-count-items"));
app.use("/api/stock-variances", require("./api/stock-variances"));
app.use("/api/stock-count-approvals", require("./api/stock-count-approvals"));
// Custom Reports APIs
app.use("/api/custom-reports", require("./api/custom-reports"));
app.use("/api/report-templates", require("./api/report-templates"));
app.use("/api/report-execution", require("./api/report-execution"));
app.use("/api/report-scheduler", require("./api/report-scheduler"));
app.use("/api/report-export", require("./api/report-export"));
app.use("/api/report-cache", require("./api/report-cache"));
// Customer Communication APIs
app.use("/api/customer-communication", require("./api/customer-communication"));
app.use("/api/communication-templates", require("./api/communication-templates"));
app.use("/api/communication-campaigns", require("./api/communication-campaigns"));
app.use("/api/message-queue", require("./api/message-queue"));
app.use("/api/customer-communication-preferences", require("./api/customer-communication-preferences"));
require('fs').appendFileSync('debug.log', 'All routers loaded at ' + new Date().toISOString() + '\n');


// Global error handler
app.use((err, req, res, next) => {
    console.error("API Error:", err.stack);
    res.status(500).json({
        status: "error",
        message: "Internal Server Error",
        details: process.env.NODE_ENV === 'dev' ? err.message : undefined
    });
});
 
server.listen(PORT, () => {
    process.env.PORT = server.address().port;
    console.log("Listening on PORT", process.env.PORT);
});

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