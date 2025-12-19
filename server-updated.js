const http = require("http");
const express = require("express");
const server = http.createServer(express);
const bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");
const pkg = require("./package.json");
const {app} = require('electron');
process.env.APPDATA = app.getPath('appData');
process.env.APPNAME = pkg.name;
const PORT = process.env.PORT || 0;
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
});

console.log("Server started");

express.use(bodyParser.json());
express.use(bodyParser.urlencoded({ extended: false }));
express.use(limiter);

express.all("/*", function (req, res, next) {
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

express.get("/", function (req, res) {
    res.send("POS Server Online.");
});

express.use("/api/inventory", require("./api/inventory"));
express.use("/api/customers", require("./api/customers"));
express.use("/api/categories", require("./api/categories"));
express.use("/api/settings", require("./api/settings"));
express.use("/api/users", require("./api/users"));
express.use("/api", require("./api/transactions"));
express.use("/api/gst-config", require("./api/gst-config"));
express.use("/api/e-invoice", require("./api/e-invoice"));
express.use("/api/eway-bill", require("./api/eway-bill"));
express.use("/api/transporters", require("./api/transporters"));
// New inventory management APIs
express.use("/api/batches", require("./api/batches"));
express.use("/api/suppliers", require("./api/suppliers"));
express.use("/api/purchase-orders", require("./api/purchase-orders"));
express.use("/api/purchase-order-items", require("./api/purchase-order-items"));
express.use("/api/stock-adjustments", require("./api/stock-adjustments"));
express.use("/api/reorder-suggestions", require("./api/reorder-suggestions"));
// Multi-store management APIs
express.use("/api/stores", require("./api/stores"));
express.use("/api/store-inventory", require("./api/store-inventory"));
express.use("/api/transfers", require("./api/transfers"));
express.use("/api/store-permissions", require("./api/store-permissions"));
// Accounts payable/receivable APIs
express.use("/api/supplier-accounts", require("./api/supplier-accounts"));
express.use("/api/customer-accounts", require("./api/customer-accounts"));
express.use("/api/payments", require("./api/payments"));
express.use("/api/payment-terms", require("./api/payment-terms"));
express.use("/api/supplier-invoices", require("./api/supplier-invoices"));
express.use("/api/customer-invoices", require("./api/customer-invoices"));
// Analytics and Reports APIs
express.use("/api/analytics", require("./api/analytics"));
express.use("/api/reports", require("./api/reports"));
express.use("/api/dashboard", require("./api/dashboard"));
// Loyalty and Promotions APIs
express.use("/api/loyalty", require("./api/loyalty"));
express.use("/api/promotions", require("./api/promotions"));
express.use("/api/rewards", require("./api/rewards"));
express.use("/api/loyalty-analytics", require("./api/loyalty-analytics"));
// Invoice sharing APIs
express.use("/api/communication", require("./api/communication"));
express.use("/api/templates", require("./api/templates"));
express.use("/api/notification-queue", require("./api/notification-queue"));
express.use("/api/customer-preferences", require("./api/customer-preferences"));
express.use("/api/invoice-sharing", require("./api/invoice-sharing"));

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