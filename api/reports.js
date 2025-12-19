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
 * GET endpoint: Get welcome message for Reports API.
 */
router.get("/", function (req, res) {
    res.send("Reports API");
});

/**
 * POST endpoint: Generate sales report
 * Request body: { startDate, endDate, storeId, reportType }
 */
router.post("/sales", function (req, res) {
    const { startDate, endDate, storeId, reportType } = req.body;

    if (!startDate || !endDate) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Start date and end date are required.",
        });
    }

    let query = {
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: 1 // Paid transactions only
    };

    if (storeId) {
        query.storeId = parseInt(storeId);
    }

    transactionsDB.find(query).exec(function (err, transactions) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const reportData = {
            reportType: 'Sales Report',
            period: `${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`,
            generatedAt: new Date(),
            summary: {
                totalSales: 0,
                totalTransactions: 0,
                totalItems: 0,
                averageTransactionValue: 0,
                totalTax: 0,
                totalDiscount: 0
            },
            transactions: [],
            topProducts: [],
            paymentMethods: {},
            hourlyBreakdown: {}
        };

        const productSales = {};
        const paymentMethods = {};
        const hourlyBreakdown = {};

        transactions.forEach(transaction => {
            const transactionData = {
                id: transaction._id,
                date: transaction.date,
                invoiceNumber: transaction.invoiceNumber || transaction._id,
                customer: transaction.customer || 'Walk-in',
                items: transaction.items || [],
                subtotal: transaction.subtotal || 0,
                tax: transaction.taxAmount || 0,
                discount: transaction.discountAmount || 0,
                total: transaction.total || 0,
                paymentMethod: transaction.paymentMethod || 'Cash',
                cashier: transaction.user_id || 'Unknown'
            };

            reportData.transactions.push(transactionData);

            // Update summary
            reportData.summary.totalSales += parseFloat(transaction.total) || 0;
            reportData.summary.totalTransactions += 1;
            reportData.summary.totalTax += parseFloat(transaction.taxAmount) || 0;
            reportData.summary.totalDiscount += parseFloat(transaction.discountAmount) || 0;

            // Track payment methods
            const method = transaction.paymentMethod || 'Cash';
            paymentMethods[method] = (paymentMethods[method] || 0) + parseFloat(transaction.total) || 0;

            // Track hourly breakdown
            const hour = moment(transaction.date).format('HH:00');
            hourlyBreakdown[hour] = (hourlyBreakdown[hour] || 0) + parseFloat(transaction.total) || 0;

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
                    reportData.summary.totalItems += parseInt(item.quantity || 0);
                });
            }
        });

        // Calculate average transaction value
        reportData.summary.averageTransactionValue = reportData.summary.totalTransactions > 0 ? 
            reportData.summary.totalSales / reportData.summary.totalTransactions : 0;

        // Get top products
        reportData.topProducts = Object.values(productSales)
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10);

        reportData.paymentMethods = paymentMethods;
        reportData.hourlyBreakdown = hourlyBreakdown;

        res.json(reportData);
    });
});

/**
 * POST endpoint: Generate inventory report
 * Request body: { storeId, reportType }
 */
router.post("/inventory", function (req, res) {
    const { storeId, reportType } = req.body;

    // Get current inventory
    let inventoryQuery = {};
    if (storeId) {
        storeInventoryDB.find({ storeId: parseInt(storeId) }, function (err, storeInventories) {
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

                generateInventoryReport(products, storeInventories, storeId, res);
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

            generateInventoryReport(products, [], storeId, res);
        });
    }
});

/**
 * Helper function to generate inventory report
 */
function generateInventoryReport(products, storeInventories, storeId, res) {
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

        const reportData = {
            reportType: 'Inventory Report',
            generatedAt: new Date(),
            storeId: storeId || 'All Stores',
            summary: {
                totalProducts: products.length,
                totalStockValue: 0,
                lowStockItems: 0,
                outOfStockItems: 0,
                expiredItems: 0,
                expiringSoonItems: 0
            },
            products: [],
            lowStockItems: [],
            expiredItems: [],
            expiringSoonItems: []
        };

        products.forEach(product => {
            const storeInventory = storeInventories.find(si => si.productId === product._id);
            const currentQuantity = storeInventory ? storeInventory.quantity : (product.quantity || 0);
            const minStock = storeInventory ? storeInventory.minStock : (product.minStock || 0);
            const price = parseFloat(product.price) || 0;
            const stockValue = currentQuantity * price;

            const productData = {
                productId: product._id,
                name: product.name,
                barcode: product.barcode,
                category: product.category,
                price: price,
                currentQuantity: currentQuantity,
                minStock: minStock,
                stockValue: stockValue,
                status: currentQuantity > 0 ? (currentQuantity <= minStock ? 'Low Stock' : 'In Stock') : 'Out of Stock'
            };

            reportData.products.push(productData);
            reportData.summary.totalStockValue += stockValue;

            // Check stock status
            if (currentQuantity <= 0) {
                reportData.summary.outOfStockItems += 1;
                reportData.outOfStockItems.push(productData);
            } else if (currentQuantity <= minStock) {
                reportData.summary.lowStockItems += 1;
                reportData.lowStockItems.push(productData);
            }

            // Check expiry for batches
            const productBatches = batches.filter(batch => batch.productId === product._id);
            productBatches.forEach(batch => {
                const expiryDate = new Date(batch.expiryDate);
                
                if (expiryDate < now) {
                    reportData.summary.expiredItems += 1;
                    reportData.expiredItems.push({
                        ...productData,
                        batchId: batch._id,
                        batchNumber: batch.batchNumber,
                        expiryDate: batch.expiryDate,
                        batchQuantity: batch.currentQuantity
                    });
                } else if (expiryDate <= thirtyDaysFromNow) {
                    reportData.summary.expiringSoonItems += 1;
                    reportData.expiringSoonItems.push({
                        ...productData,
                        batchId: batch._id,
                        batchNumber: batch.batchNumber,
                        expiryDate: batch.expiryDate,
                        batchQuantity: batch.currentQuantity
                    });
                }
            });
        });

        res.json(reportData);
    });
}

/**
 * POST endpoint: Generate customer report
 * Request body: { startDate, endDate, customerId, reportType }
 */
router.post("/customers", function (req, res) {
    const { startDate, endDate, customerId, reportType } = req.body;

    let query = { status: 1 }; // Paid transactions only

    if (startDate && endDate) {
        query.date = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    if (customerId) {
        query.customer = customerId;
    }

    transactionsDB.find(query).exec(function (err, transactions) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const reportData = {
            reportType: 'Customer Report',
            period: startDate && endDate ? 
                `${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}` : 
                'All Time',
            generatedAt: new Date(),
            summary: {
                totalCustomers: 0,
                totalRevenue: 0,
                totalTransactions: 0,
                averageTransactionValue: 0,
                newCustomers: 0,
                returningCustomers: 0
            },
            customerDetails: [],
            topCustomers: []
        };

        const customerStats = {};
        const thirtyDaysAgo = moment().subtract(30, 'days').toDate();

        transactions.forEach(transaction => {
            const custId = transaction.customer || 'walk-in';
            
            if (!customerStats[custId]) {
                customerStats[custId] = {
                    customerId: custId,
                    transactionCount: 0,
                    totalSpent: 0,
                    firstTransaction: transaction.date,
                    lastTransaction: transaction.date,
                    averageTransactionValue: 0
                };
                reportData.summary.totalCustomers += 1;
            }

            customerStats[custId].transactionCount += 1;
            customerStats[custId].totalSpent += parseFloat(transaction.total) || 0;
            
            if (transaction.date < customerStats[custId].firstTransaction) {
                customerStats[custId].firstTransaction = transaction.date;
            }
            if (transaction.date > customerStats[custId].lastTransaction) {
                customerStats[custId].lastTransaction = transaction.date;
            }

            reportData.summary.totalRevenue += parseFloat(transaction.total) || 0;
            reportData.summary.totalTransactions += 1;
        });

        // Calculate customer statistics
        Object.values(customerStats).forEach(customer => {
            customer.averageTransactionValue = customer.transactionCount > 0 ? 
                customer.totalSpent / customer.transactionCount : 0;

            if (customer.firstTransaction >= thirtyDaysAgo) {
                reportData.summary.newCustomers += 1;
            } else if (customer.transactionCount > 1) {
                reportData.summary.returningCustomers += 1;
            }

            reportData.customerDetails.push(customer);
        });

        // Calculate average transaction value
        reportData.summary.averageTransactionValue = reportData.summary.totalTransactions > 0 ? 
            reportData.summary.totalRevenue / reportData.summary.totalTransactions : 0;

        // Get top customers
        reportData.topCustomers = Object.values(customerStats)
            .sort((a, b) => b.totalSpent - a.totalSpent)
            .slice(0, 10);

        res.json(reportData);
    });
});

/**
 * POST endpoint: Generate financial report (Profit & Loss)
 * Request body: { startDate, endDate, storeId, reportType }
 */
router.post("/financial", function (req, res) {
    const { startDate, endDate, storeId, reportType } = req.body;

    if (!startDate || !endDate) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Start date and end date are required.",
        });
    }

    let query = {
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
        status: 1 // Paid transactions only
    };

    if (storeId) {
        query.storeId = parseInt(storeId);
    }

    transactionsDB.find(query).exec(function (err, transactions) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const reportData = {
            reportType: 'Financial Report (Profit & Loss)',
            period: `${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`,
            generatedAt: new Date(),
            revenue: {
                totalSales: 0,
                totalTax: 0,
                netRevenue: 0
            },
            costOfGoodsSold: {
                totalCost: 0,
                byCategory: {}
            },
            grossProfit: 0,
            expenses: {
                totalExpenses: 0,
                categories: {} // This would need expense tracking implementation
            },
            netProfit: 0,
            profitMargin: 0,
            dailyBreakdown: {}
        };

        transactions.forEach(transaction => {
            const dateKey = moment(transaction.date).format('YYYY-MM-DD');
            const revenue = parseFloat(transaction.total) || 0;
            const tax = parseFloat(transaction.taxAmount) || 0;
            
            reportData.revenue.totalSales += revenue;
            reportData.revenue.totalTax += tax;

            if (!reportData.dailyBreakdown[dateKey]) {
                reportData.dailyBreakdown[dateKey] = {
                    revenue: 0,
                    cost: 0,
                    profit: 0
                };
            }
            reportData.dailyBreakdown[dateKey].revenue += revenue;

            // Calculate cost of goods sold (COGS) - simplified calculation
            let costOfGoods = 0;
            if (transaction.items && Array.isArray(transaction.items)) {
                transaction.items.forEach(item => {
                    const itemCost = parseFloat(item.price || 0) * parseInt(item.quantity || 0) * 0.7; // Assuming 70% cost
                    costOfGoods += itemCost;
                    
                    // Track cost by category
                    const category = item.category || 'Uncategorized';
                    if (!reportData.costOfGoodsSold.byCategory[category]) {
                        reportData.costOfGoodsSold.byCategory[category] = 0;
                    }
                    reportData.costOfGoodsSold.byCategory[category] += itemCost;
                });
            }

            reportData.costOfGoodsSold.totalCost += costOfGoods;
            reportData.dailyBreakdown[dateKey].cost += costOfGoods;
            reportData.dailyBreakdown[dateKey].profit += (revenue - costOfGoods);
        });

        reportData.revenue.netRevenue = reportData.revenue.totalSales - reportData.revenue.totalTax;
        reportData.grossProfit = reportData.revenue.netRevenue - reportData.costOfGoodsSold.totalCost;
        reportData.netProfit = reportData.grossProfit - reportData.expenses.totalExpenses;
        reportData.profitMargin = reportData.revenue.netRevenue > 0 ? 
            (reportData.grossProfit / reportData.revenue.netRevenue) * 100 : 0;

        res.json(reportData);
    });
});

/**
 * POST endpoint: Generate custom report with flexible parameters
 * Request body: { reportConfig, filters }
 */
router.post("/custom", function (req, res) {
    const { reportConfig, filters } = req.body;

    if (!reportConfig) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Report configuration is required.",
        });
    }

    // Build query based on filters
    let query = { status: 1 }; // Paid transactions only

    if (filters.startDate && filters.endDate) {
        query.date = { $gte: new Date(filters.startDate), $lte: new Date(filters.endDate) };
    }

    if (filters.storeId) {
        query.storeId = parseInt(filters.storeId);
    }

    if (filters.customerId) {
        query.customer = filters.customerId;
    }

    transactionsDB.find(query).exec(function (err, transactions) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const reportData = {
            reportType: reportConfig.name || 'Custom Report',
            generatedAt: new Date(),
            configuration: reportConfig,
            filters: filters,
            data: []
        };

        // Process transactions based on report configuration
        transactions.forEach(transaction => {
            const rowData = {};

            reportConfig.fields.forEach(field => {
                switch (field.key) {
                    case 'date':
                        rowData[field.key] = moment(transaction.date).format(field.format || 'YYYY-MM-DD');
                        break;
                    case 'customer':
                        rowData[field.key] = transaction.customer || 'Walk-in';
                        break;
                    case 'total':
                        rowData[field.key] = parseFloat(transaction.total) || 0;
                        break;
                    case 'items':
                        rowData[field.key] = transaction.items ? transaction.items.length : 0;
                        break;
                    case 'paymentMethod':
                        rowData[field.key] = transaction.paymentMethod || 'Cash';
                        break;
                    case 'cashier':
                        rowData[field.key] = transaction.user_id || 'Unknown';
                        break;
                    default:
                        rowData[field.key] = transaction[field.key] || '';
                }
            });

            reportData.data.push(rowData);
        });

        // Apply sorting if specified
        if (reportConfig.sortBy) {
            const sortField = reportConfig.sortBy;
            const sortOrder = reportConfig.sortOrder || 'asc';
            
            reportData.data.sort((a, b) => {
                if (sortOrder === 'desc') {
                    return b[sortField] > a[sortField] ? 1 : -1;
                } else {
                    return a[sortField] > b[sortField] ? 1 : -1;
                }
            });
        }

        // Apply limit if specified
        if (reportConfig.limit) {
            reportData.data = reportData.data.slice(0, reportConfig.limit);
        }

        res.json(reportData);
    });
});