const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const moment = require("moment");
const dbUtils = require("./db-utils");

// Initialize databases
const transactionsDB = new Datastore({ filename: dbUtils.getDatabasePath("transactions.db"), autoload: true });
const inventoryDB = new Datastore({ filename: dbUtils.getDatabasePath("inventory.db"), autoload: true });
const customersDB = new Datastore({ filename: dbUtils.getDatabasePath("customers.db"), autoload: true });
const batchesDB = new Datastore({ filename: dbUtils.getDatabasePath("batches.db"), autoload: true });
const storeInventoryDB = new Datastore({ filename: dbUtils.getDatabasePath("store-inventory.db"), autoload: true });

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get welcome message for Dashboard API.
 */
router.get("/", function (req, res) {
    res.send("Dashboard API");
});

/**
 * GET endpoint: Get executive dashboard KPIs
 * Query parameters: period (today, week, month, year), storeId
 */
router.get("/kpi", function (req, res) {
    const period = req.query.period || 'month';
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

    const now = moment();
    let startDate, endDate;

    switch (period) {
        case 'today':
            startDate = now.clone().startOf('day');
            endDate = now.clone().endOf('day');
            break;
        case 'week':
            startDate = now.clone().startOf('week');
            endDate = now.clone().endOf('week');
            break;
        case 'month':
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            break;
        case 'year':
            startDate = now.clone().startOf('year');
            endDate = now.clone().endOf('year');
            break;
        default:
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
    }

    let query = {
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        status: 1 // Paid transactions only
    };

    if (storeId) {
        query.storeId = storeId;
    }

    // Get transactions for the period
    transactionsDB.find(query).exec(function (err, transactions) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Get previous period data for comparison
        const previousStartDate = startDate.clone().subtract(1, period === 'today' ? 'day' : period === 'week' ? 'week' : period === 'month' ? 'month' : 'year');
        const previousEndDate = endDate.clone().subtract(1, period === 'today' ? 'day' : period === 'week' ? 'week' : period === 'month' ? 'month' : 'year');

        let previousQuery = {
            date: { $gte: previousStartDate.toDate(), $lte: previousEndDate.toDate() },
            status: 1
        };

        if (storeId) {
            previousQuery.storeId = storeId;
        }

        transactionsDB.find(previousQuery).exec(function (err, previousTransactions) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Calculate KPIs
            const kpiData = calculateKPIs(transactions, previousTransactions, period);

            // Get inventory KPIs
            getInventoryKPIs(storeId, function(inventoryKPIs) {
                // Get customer KPIs
                getCustomerKPIs(transactions, function(customerKPIs) {
                    // Combine all KPIs
                    const dashboardData = {
                        period: period,
                        dateRange: {
                            start: startDate.format('YYYY-MM-DD'),
                            end: endDate.format('YYYY-MM-DD')
                        },
                        sales: kpiData.sales,
                        inventory: inventoryKPIs,
                        customers: customerKPIs,
                        generatedAt: new Date()
                    };

                    res.json(dashboardData);
                });
            });
        });
    });
});

/**
 * Helper function to calculate sales KPIs
 */
function calculateKPIs(currentTransactions, previousTransactions, period) {
    const currentSales = {
        totalRevenue: 0,
        totalTransactions: currentTransactions.length,
        totalItems: 0,
        averageTransactionValue: 0,
        topProducts: [],
        paymentMethods: {}
    };

    const previousSales = {
        totalRevenue: 0,
        totalTransactions: previousTransactions.length,
        totalItems: 0,
        averageTransactionValue: 0
    };

    const productSales = {};
    const paymentMethods = {};

    // Calculate current period metrics
    currentTransactions.forEach(transaction => {
        const revenue = parseFloat(transaction.total) || 0;
        currentSales.totalRevenue += revenue;

        // Track payment methods
        const method = transaction.paymentMethod || 'Cash';
        paymentMethods[method] = (paymentMethods[method] || 0) + revenue;

        // Track product sales
        if (transaction.items && Array.isArray(transaction.items)) {
            transaction.items.forEach(item => {
                const productId = item.id;
                if (!productSales[productId]) {
                    productSales[productId] = {
                        productId: productId,
                        name: item.name || 'Unknown Product',
                        quantity: 0,
                        revenue: 0
                    };
                }
                productSales[productId].quantity += parseInt(item.quantity || 0);
                productSales[productId].revenue += parseFloat(item.price || 0) * parseInt(item.quantity || 0);
                currentSales.totalItems += parseInt(item.quantity || 0);
            });
        }
    });

    // Calculate previous period metrics
    previousTransactions.forEach(transaction => {
        const revenue = parseFloat(transaction.total) || 0;
        previousSales.totalRevenue += revenue;

        if (transaction.items && Array.isArray(transaction.items)) {
            transaction.items.forEach(item => {
                previousSales.totalItems += parseInt(item.quantity || 0);
            });
        }
    });

    // Calculate averages
    currentSales.averageTransactionValue = currentSales.totalTransactions > 0 ? 
        currentSales.totalRevenue / currentSales.totalTransactions : 0;
    previousSales.averageTransactionValue = previousSales.totalTransactions > 0 ? 
        previousSales.totalRevenue / previousSales.totalTransactions : 0;

    // Get top products
    currentSales.topProducts = Object.values(productSales)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);

    currentSales.paymentMethods = paymentMethods;

    // Calculate growth percentages
    const revenueGrowth = previousSales.totalRevenue > 0 ? 
        ((currentSales.totalRevenue - previousSales.totalRevenue) / previousSales.totalRevenue) * 100 : 0;
    const transactionGrowth = previousSales.totalTransactions > 0 ? 
        ((currentSales.totalTransactions - previousSales.totalTransactions) / previousSales.totalTransactions) * 100 : 0;
    const averageValueGrowth = previousSales.averageTransactionValue > 0 ? 
        ((currentSales.averageTransactionValue - previousSales.averageTransactionValue) / previousSales.averageTransactionValue) * 100 : 0;

    return {
        current: currentSales,
        previous: previousSales,
        growth: {
            revenue: revenueGrowth,
            transactions: transactionGrowth,
            averageTransactionValue: averageValueGrowth
        }
    };
}

/**
 * Helper function to get inventory KPIs
 */
function getInventoryKPIs(storeId, callback) {
    let inventoryQuery = {};
    
    if (storeId) {
        storeInventoryDB.find({ storeId: storeId }, function (err, storeInventories) {
            if (err) {
                return callback({});
            }

            const productIds = storeInventories.map(si => si.productId);
            inventoryDB.find({ _id: { $in: productIds } }, function (err, products) {
                if (err) {
                    return callback({});
                }

                calculateInventoryMetrics(products, storeInventories, callback);
            });
        });
    } else {
        inventoryDB.find({}, function (err, products) {
            if (err) {
                return callback({});
            }

            calculateInventoryMetrics(products, [], callback);
        });
    }
}

/**
 * Helper function to calculate inventory metrics
 */
function calculateInventoryMetrics(products, storeInventories, callback) {
    batchesDB.find({ isActive: true }, function (err, batches) {
        if (err) {
            return callback({});
        }

        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        const inventoryKPIs = {
            totalProducts: products.length,
            totalStockValue: 0,
            lowStockItems: 0,
            outOfStockItems: 0,
            expiredItems: 0,
            expiringSoonItems: 0,
            stockTurnover: 0
        };

        products.forEach(product => {
            const storeInventory = storeInventories.find(si => si.productId === product._id);
            const currentQuantity = storeInventory ? storeInventory.quantity : (product.quantity || 0);
            const minStock = storeInventory ? storeInventory.minStock : (product.minStock || 0);
            const price = parseFloat(product.price) || 0;

            inventoryKPIs.totalStockValue += currentQuantity * price;

            if (currentQuantity <= 0) {
                inventoryKPIs.outOfStockItems += 1;
            } else if (currentQuantity <= minStock) {
                inventoryKPIs.lowStockItems += 1;
            }

            // Check expiry for batches
            const productBatches = batches.filter(batch => batch.productId === product._id);
            productBatches.forEach(batch => {
                const expiryDate = new Date(batch.expiryDate);
                
                if (expiryDate < now) {
                    inventoryKPIs.expiredItems += 1;
                } else if (expiryDate <= thirtyDaysFromNow) {
                    inventoryKPIs.expiringSoonItems += 1;
                }
            });
        });

        callback(inventoryKPIs);
    });
}

/**
 * Helper function to get customer KPIs
 */
function getCustomerKPIs(transactions, callback) {
    const customerKPIs = {
        totalCustomers: 0,
        newCustomers: 0,
        returningCustomers: 0,
        averageTransactionValue: 0
    };

    const customerStats = {};
    const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
    let totalRevenue = 0;

    transactions.forEach(transaction => {
        const customerId = transaction.customer || 'walk-in';
        
        if (!customerStats[customerId]) {
            customerStats[customerId] = {
                transactionCount: 0,
                totalSpent: 0,
                firstTransaction: transaction.date
            };
            customerKPIs.totalCustomers += 1;
        }

        customerStats[customerId].transactionCount += 1;
        customerStats[customerId].totalSpent += parseFloat(transaction.total) || 0;
        totalRevenue += parseFloat(transaction.total) || 0;
    });

    // Calculate new vs returning customers
    Object.values(customerStats).forEach(customer => {
        if (customer.firstTransaction >= thirtyDaysAgo) {
            customerKPIs.newCustomers += 1;
        } else if (customer.transactionCount > 1) {
            customerKPIs.returningCustomers += 1;
        }
    });

    customerKPIs.averageTransactionValue = transactions.length > 0 ? totalRevenue / transactions.length : 0;

    callback(customerKPIs);
}

/**
 * GET endpoint: Get sales chart data for dashboard
 * Query parameters: period (today, week, month, year), storeId
 */
router.get("/sales-chart", function (req, res) {
    const period = req.query.period || 'month';
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

    const now = moment();
    let startDate, endDate, groupBy;

    switch (period) {
        case 'today':
            startDate = now.clone().startOf('day');
            endDate = now.clone().endOf('day');
            groupBy = 'hour';
            break;
        case 'week':
            startDate = now.clone().startOf('week');
            endDate = now.clone().endOf('week');
            groupBy = 'day';
            break;
        case 'month':
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            groupBy = 'day';
            break;
        case 'year':
            startDate = now.clone().startOf('year');
            endDate = now.clone().endOf('year');
            groupBy = 'month';
            break;
        default:
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            groupBy = 'day';
    }

    let query = {
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        status: 1 // Paid transactions only
    };

    if (storeId) {
        query.storeId = storeId;
    }

    transactionsDB.find(query).exec(function (err, transactions) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const chartData = {};
        const labels = [];

        // Initialize chart data based on period
        if (groupBy === 'hour') {
            for (let i = 0; i < 24; i++) {
                const hour = i.toString().padStart(2, '0');
                labels.push(`${hour}:00`);
                chartData[hour] = 0;
            }
        } else if (groupBy === 'day') {
            const days = endDate.diff(startDate, 'days') + 1;
            for (let i = 0; i < days; i++) {
                const date = startDate.clone().add(i, 'days');
                const dateKey = date.format('YYYY-MM-DD');
                labels.push(date.format('MMM DD'));
                chartData[dateKey] = 0;
            }
        } else if (groupBy === 'month') {
            for (let i = 0; i < 12; i++) {
                const date = startDate.clone().add(i, 'months');
                const dateKey = date.format('YYYY-MM');
                labels.push(date.format('MMM'));
                chartData[dateKey] = 0;
            }
        }

        // Aggregate sales data
        transactions.forEach(transaction => {
            let key;
            const transactionDate = moment(transaction.date);

            if (groupBy === 'hour') {
                key = transactionDate.format('HH');
            } else if (groupBy === 'day') {
                key = transactionDate.format('YYYY-MM-DD');
            } else if (groupBy === 'month') {
                key = transactionDate.format('YYYY-MM');
            }

            if (chartData.hasOwnProperty(key)) {
                chartData[key] += parseFloat(transaction.total) || 0;
            }
        });

        const data = Object.keys(chartData).map(key => chartData[key]);

        res.json({
            period: period,
            groupBy: groupBy,
            labels: labels,
            data: data
        });
    });
});

/**
 * GET endpoint: Get top products chart data
 * Query parameters: period (today, week, month, year), limit, storeId
 */
router.get("/top-products-chart", function (req, res) {
    const period = req.query.period || 'month';
    const limit = parseInt(req.query.limit) || 5;
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

    const now = moment();
    let startDate, endDate;

    switch (period) {
        case 'today':
            startDate = now.clone().startOf('day');
            endDate = now.clone().endOf('day');
            break;
        case 'week':
            startDate = now.clone().startOf('week');
            endDate = now.clone().endOf('week');
            break;
        case 'month':
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            break;
        case 'year':
            startDate = now.clone().startOf('year');
            endDate = now.clone().endOf('year');
            break;
        default:
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
    }

    let query = {
        date: { $gte: startDate.toDate(), $lte: endDate.toDate() },
        status: 1 // Paid transactions only
    };

    if (storeId) {
        query.storeId = storeId;
    }

    transactionsDB.find(query).exec(function (err, transactions) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const productSales = {};

        transactions.forEach(transaction => {
            if (transaction.items && Array.isArray(transaction.items)) {
                transaction.items.forEach(item => {
                    const productId = item.id;
                    if (!productSales[productId]) {
                        productSales[productId] = {
                            productId: productId,
                            name: item.name || 'Unknown Product',
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    productSales[productId].quantity += parseInt(item.quantity || 0);
                    productSales[productId].revenue += parseFloat(item.price || 0) * parseInt(item.quantity || 0);
                });
            }
        });

        // Sort by revenue and get top products
        const topProducts = Object.values(productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, limit);

        const labels = topProducts.map(p => p.name);
        const data = topProducts.map(p => p.revenue);

        res.json({
            period: period,
            labels: labels,
            data: data,
            products: topProducts
        });
    });
});

/**
 * GET endpoint: Get recent transactions for dashboard
 * Query parameters: limit, storeId
 */
router.get("/recent-transactions", function (req, res) {
    const limit = parseInt(req.query.limit) || 10;
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

    let query = { status: 1 }; // Paid transactions only

    if (storeId) {
        query.storeId = storeId;
    }

    transactionsDB.find(query)
        .sort({ date: -1 })
        .limit(limit)
        .exec(function (err, transactions) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            const recentTransactions = transactions.map(transaction => ({
                id: transaction._id,
                date: transaction.date,
                invoiceNumber: transaction.invoiceNumber || transaction._id,
                customer: transaction.customer || 'Walk-in',
                total: parseFloat(transaction.total) || 0,
                paymentMethod: transaction.paymentMethod || 'Cash',
                cashier: transaction.user_id || 'Unknown',
                itemCount: transaction.items ? transaction.items.length : 0
            }));

            res.json(recentTransactions);
        });
});

/**
 * GET endpoint: Get low stock alerts for dashboard
 * Query parameters: storeId
 */
router.get("/low-stock-alerts", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

    if (storeId) {
        storeInventoryDB.find({ storeId: storeId }, function (err, storeInventories) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            const productIds = storeInventories.map(si => si.productId);
            inventoryDB.find({ _id: { $in: productIds } }, function (err, products) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                getLowStockAlerts(products, storeInventories, res);
            });
        });
    } else {
        inventoryDB.find({}, function (err, products) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            getLowStockAlerts(products, [], res);
        });
    }
});

/**
 * Helper function to get low stock alerts
 */
function getLowStockAlerts(products, storeInventories, res) {
    const lowStockItems = [];

    products.forEach(product => {
        const storeInventory = storeInventories.find(si => si.productId === product._id);
        const currentQuantity = storeInventory ? storeInventory.quantity : (product.quantity || 0);
        const minStock = storeInventory ? storeInventory.minStock : (product.minStock || 0);

        if (currentQuantity <= minStock && currentQuantity > 0) {
            lowStockItems.push({
                productId: product._id,
                name: product.name,
                currentQuantity: currentQuantity,
                minStock: minStock,
                status: 'Low Stock'
            });
        } else if (currentQuantity <= 0) {
            lowStockItems.push({
                productId: product._id,
                name: product.name,
                currentQuantity: currentQuantity,
                minStock: minStock,
                status: 'Out of Stock'
            });
        }
    });

    res.json({
        totalAlerts: lowStockItems.length,
        alerts: lowStockItems.slice(0, 10) // Limit to 10 for dashboard
    });
}