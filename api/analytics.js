const app = require("express")();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const moment = require("moment");

const appName = process.env.APPNAME;
const appData = process.env.APPDATA;

// Database paths
const transactionsDbPath = path.join(appData, appName, "server", "databases", "transactions.db");
const inventoryDbPath = path.join(appData, appName, "server", "databases", "inventory.db");
const customersDbPath = path.join(appData, appName, "server", "databases", "customers.db");
const batchesDbPath = path.join(appData, appName, "server", "databases", "batches.db");
const storeInventoryDbPath = path.join(appData, appName, "server", "databases", "store-inventory.db");

// Initialize databases
const transactionsDB = new Datastore({ filename: transactionsDbPath, autoload: true });
const inventoryDB = new Datastore({ filename: inventoryDbPath, autoload: true });
const customersDB = new Datastore({ filename: customersDbPath, autoload: true });
const batchesDB = new Datastore({ filename: batchesDbPath, autoload: true });
const storeInventoryDB = new Datastore({ filename: storeInventoryDbPath, autoload: true });

app.use(bodyParser.json());

module.exports = app;

/**
 * GET endpoint: Get the welcome message for the Analytics API.
 */
app.get("/", function (req, res) {
    res.send("Analytics API");
});

/**
 * Helper function to get date range based on period
 */
function getDateRange(period) {
    const now = moment();
    let startDate, endDate, groupBy;

    switch (period) {
        case 'daily':
            startDate = now.clone().startOf('day');
            endDate = now.clone().endOf('day');
            groupBy = { $dateToString: { format: "%Y-%m-%d %H:00", date: "$date" } };
            break;
        case 'weekly':
            startDate = now.clone().startOf('week');
            endDate = now.clone().endOf('week');
            groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$date" } };
            break;
        case 'monthly':
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$date" } };
            break;
        case 'yearly':
            startDate = now.clone().startOf('year');
            endDate = now.clone().endOf('year');
            groupBy = { $dateToString: { format: "%Y-%m", date: "$date" } };
            break;
        default:
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            groupBy = { $dateToString: { format: "%Y-%m-%d", date: "$date" } };
    }

    return { startDate: startDate.toDate(), endDate: endDate.toDate(), groupBy };
}

/**
 * GET endpoint: Get sales analytics for different time periods
 * Query parameters: period (daily, weekly, monthly, yearly), storeId
 */
app.get("/sales/trends", function (req, res) {
    const period = req.query.period || 'monthly';
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const { startDate, endDate, groupBy } = getDateRange(period);

    let query = {
        date: { $gte: startDate, $lte: endDate },
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

        // Group transactions by date and calculate totals
        const salesData = {};
        let totalSales = 0;
        let totalTransactions = 0;
        let totalItems = 0;

        transactions.forEach(transaction => {
            const dateKey = moment(transaction.date).format(period === 'yearly' ? 'YYYY-MM' : 'YYYY-MM-DD');
            const hourKey = moment(transaction.date).format('HH');
            const key = period === 'daily' ? `${dateKey} ${hourKey}:00` : dateKey;

            if (!salesData[key]) {
                salesData[key] = {
                    date: key,
                    sales: 0,
                    transactions: 0,
                    items: 0
                };
            }

            salesData[key].sales += parseFloat(transaction.total) || 0;
            salesData[key].transactions += 1;
            totalSales += parseFloat(transaction.total) || 0;
            totalTransactions += 1;

            if (transaction.items && Array.isArray(transaction.items)) {
                const itemCount = transaction.items.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
                salesData[key].items += itemCount;
                totalItems += itemCount;
            }
        });

        // Convert to array and sort by date
        const chartData = Object.values(salesData).sort((a, b) => a.date.localeCompare(b.date));

        res.json({
            period: period,
            summary: {
                totalSales: totalSales,
                totalTransactions: totalTransactions,
                totalItems: totalItems,
                averageTransactionValue: totalTransactions > 0 ? totalSales / totalTransactions : 0
            },
            chartData: chartData
        });
    });
});

/**
 * GET endpoint: Get top selling products
 * Query parameters: period (daily, weekly, monthly, yearly), limit, storeId
 */
app.get("/sales/top-products", function (req, res) {
    const period = req.query.period || 'monthly';
    const limit = parseInt(req.query.limit) || 10;
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const { startDate, endDate } = getDateRange(period);

    let query = {
        date: { $gte: startDate, $lte: endDate },
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

        res.json({
            period: period,
            topProducts: topProducts
        });
    });
});

/**
 * GET endpoint: Get inventory analytics including stock movement and expiry analysis
 */
app.get("/inventory/analysis", function (req, res) {
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

    // Get current inventory
    let inventoryQuery = {};
    if (storeId) {
        // For store-specific inventory, we need to get store inventory data
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

                analyzeInventory(products, storeInventories, res);
            });
        });
    } else {
        // Get all inventory
        inventoryDB.find({}, function (err, products) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            analyzeInventory(products, [], res);
        });
    }
});

/**
 * Helper function to analyze inventory
 */
function analyzeInventory(products, storeInventories, res) {
    // Get batch information for expiry analysis
    batchesDB.find({ isActive: true }, function (err, batches) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        const expiryAnalysis = {
            expired: [],
            expiringSoon: [],
            totalValue: 0
        };

        const stockAnalysis = {
            totalProducts: products.length,
            lowStock: [],
            outOfStock: [],
            totalStockValue: 0
        };

        // Analyze each product
        products.forEach(product => {
            const storeInventory = storeInventories.find(si => si.productId === product._id);
            const currentQuantity = storeInventory ? storeInventory.quantity : (product.quantity || 0);
            const minStock = storeInventory ? storeInventory.minStock : (product.minStock || 0);
            const price = parseFloat(product.price) || 0;

            // Stock analysis
            const stockValue = currentQuantity * price;
            stockAnalysis.totalStockValue += stockValue;

            if (currentQuantity <= 0) {
                stockAnalysis.outOfStock.push({
                    productId: product._id,
                    name: product.name,
                    currentQuantity: currentQuantity
                });
            } else if (currentQuantity <= minStock) {
                stockAnalysis.lowStock.push({
                    productId: product._id,
                    name: product.name,
                    currentQuantity: currentQuantity,
                    minStock: minStock
                });
            }

            // Expiry analysis for batches
            const productBatches = batches.filter(batch => batch.productId === product._id);
            productBatches.forEach(batch => {
                const expiryDate = new Date(batch.expiryDate);
                const batchValue = (batch.currentQuantity || 0) * price;
                expiryAnalysis.totalValue += batchValue;

                if (expiryDate < now) {
                    expiryAnalysis.expired.push({
                        productId: product._id,
                        productName: product.name,
                        batchId: batch._id,
                        batchNumber: batch.batchNumber,
                        expiryDate: batch.expiryDate,
                        quantity: batch.currentQuantity,
                        value: batchValue
                    });
                } else if (expiryDate <= thirtyDaysFromNow) {
                    expiryAnalysis.expiringSoon.push({
                        productId: product._id,
                        productName: product.name,
                        batchId: batch._id,
                        batchNumber: batch.batchNumber,
                        expiryDate: batch.expiryDate,
                        quantity: batch.currentQuantity,
                        value: batchValue
                    });
                }
            });
        });

        res.json({
            stockAnalysis: stockAnalysis,
            expiryAnalysis: expiryAnalysis
        });
    }
}

/**
 * GET endpoint: Get customer analytics including purchase patterns and top customers
 */
app.get("/customers/analysis", function (req, res) {
    const period = req.query.period || 'monthly';
    const limit = parseInt(req.query.limit) || 10;
    const { startDate, endDate } = getDateRange(period);

    let query = {
        date: { $gte: startDate, $lte: endDate },
        status: 1 // Paid transactions only
    };

    transactionsDB.find(query).exec(function (err, transactions) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const customerAnalysis = {
            totalCustomers: 0,
            newCustomers: 0,
            returningCustomers: 0,
            topCustomers: [],
            purchasePatterns: {
                averageTransactionValue: 0,
                mostFrequentPurchaseTime: null,
                peakPurchaseDay: null
            }
        };

        const customerStats = {};
        const dayWiseSales = {};
        const hourWiseSales = {};
        let totalRevenue = 0;
        let transactionCount = 0;

        transactions.forEach(transaction => {
            const customerId = transaction.customer || 'walk-in';
            const transactionDate = moment(transaction.date);
            const dayOfWeek = transactionDate.format('dddd');
            const hour = transactionDate.format('HH');

            // Track day and hour patterns
            if (!dayWiseSales[dayOfWeek]) {
                dayWiseSales[dayOfWeek] = { count: 0, revenue: 0 };
            }
            if (!hourWiseSales[hour]) {
                hourWiseSales[hour] = { count: 0, revenue: 0 };
            }

            dayWiseSales[dayOfWeek].count += 1;
            dayWiseSales[dayOfWeek].revenue += parseFloat(transaction.total) || 0;
            hourWiseSales[hour].count += 1;
            hourWiseSales[hour].revenue += parseFloat(transaction.total) || 0;

            // Customer statistics
            if (!customerStats[customerId]) {
                customerStats[customerId] = {
                    customerId: customerId,
                    transactionCount: 0,
                    totalSpent: 0,
                    firstTransaction: transaction.date,
                    lastTransaction: transaction.date
                };
                customerAnalysis.totalCustomers += 1;
            }

            customerStats[customerId].transactionCount += 1;
            customerStats[customerId].totalSpent += parseFloat(transaction.total) || 0;
            
            if (transaction.date < customerStats[customerId].firstTransaction) {
                customerStats[customerId].firstTransaction = transaction.date;
            }
            if (transaction.date > customerStats[customerId].lastTransaction) {
                customerStats[customerId].lastTransaction = transaction.date;
            }

            totalRevenue += parseFloat(transaction.total) || 0;
            transactionCount += 1;
        });

        // Calculate new vs returning customers
        const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
        Object.values(customerStats).forEach(customer => {
            if (customer.firstTransaction >= thirtyDaysAgo) {
                customerAnalysis.newCustomers += 1;
            } else if (customer.transactionCount > 1) {
                customerAnalysis.returningCustomers += 1;
            }
        });

        // Get top customers by total spent
        customerAnalysis.topCustomers = Object.values(customerStats)
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, limit);

        // Calculate purchase patterns
        customerAnalysis.purchasePatterns.averageTransactionValue = transactionCount > 0 ? totalRevenue / transactionCount : 0;

        // Find peak purchase day
        const peakDay = Object.entries(dayWiseSales)
            .sort(([,a], [,b]) => b.count - a.count)[0];
        if (peakDay) {
            customerAnalysis.purchasePatterns.peakPurchaseDay = peakDay[0];
        }

        // Find most frequent purchase time
        const peakHour = Object.entries(hourWiseSales)
            .sort(([,a], [,b]) => b.count - a.count)[0];
        if (peakHour) {
            customerAnalysis.purchasePatterns.mostFrequentPurchaseTime = `${peakHour[0]}:00`;
        }

        res.json({
            period: period,
            customerAnalysis: customerAnalysis,
            dayWiseSales: dayWiseSales,
            hourWiseSales: hourWiseSales
        });
    });
});

/**
 * GET endpoint: Get financial analytics including profit & loss trends
 */
app.get("/financial/analysis", function (req, res) {
    const period = req.query.period || 'monthly';
    const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
    const { startDate, endDate } = getDateRange(period);

    let query = {
        date: { $gte: startDate, $lte: endDate },
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

        const financialData = {
            totalRevenue: 0,
            totalCost: 0,
            grossProfit: 0,
            netProfit: 0,
            profitMargin: 0,
            revenueByDay: {},
            profitByDay: {},
            topRevenueCategories: {},
            expenses: 0 // This would need to be implemented with expense tracking
        };

        transactions.forEach(transaction => {
            const dateKey = moment(transaction.date).format('YYYY-MM-DD');
            const revenue = parseFloat(transaction.total) || 0;
            
            financialData.totalRevenue += revenue;

            if (!financialData.revenueByDay[dateKey]) {
                financialData.revenueByDay[dateKey] = 0;
                financialData.profitByDay[dateKey] = 0;
            }
            financialData.revenueByDay[dateKey] += revenue;

            // Calculate cost of goods sold (COGS) - this is a simplified calculation
            let costOfGoods = 0;
            if (transaction.items && Array.isArray(transaction.items)) {
                transaction.items.forEach(item => {
                    // Assuming 70% of price is cost (this should be replaced with actual cost data)
                    const itemCost = parseFloat(item.price || 0) * parseInt(item.quantity || 0) * 0.7;
                    costOfGoods += itemCost;
                });
            }

            financialData.totalCost += costOfGoods;
            financialData.profitByDay[dateKey] += (revenue - costOfGoods);
        });

        financialData.grossProfit = financialData.totalRevenue - financialData.totalCost;
        financialData.netProfit = financialData.grossProfit - financialData.expenses;
        financialData.profitMargin = financialData.totalRevenue > 0 ? 
            (financialData.grossProfit / financialData.totalRevenue) * 100 : 0;

        res.json({
            period: period,
            financialData: financialData
        });
    });
});