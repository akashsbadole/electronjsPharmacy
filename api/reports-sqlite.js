const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const moment = require("moment");
const sqliteDBManager = require("./sqlite-db-manager");

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get welcome message for Reports API.
 */
router.get("/", function (req, res) {
    res.send("Reports API (SQLite)");
});

/**
 * POST endpoint: Generate sales report
 * Request body: { startDate, endDate, storeId, reportType }
 */
router.post("/sales", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const { startDate, endDate, storeId, reportType } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Start date and end date are required.",
            });
        }

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [new Date(startDate).toISOString(), new Date(endDate).toISOString()];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(parseInt(storeId));
        }

        // Get transactions for the report
        const transactionsQuery = `
            SELECT 
                t.id,
                t.transaction_date as date,
                t.transaction_number as invoiceNumber,
                COALESCE(c.name, 'Walk-in') as customer,
                t.subtotal,
                t.tax_amount as tax,
                t.discount_amount as discount,
                t.total_amount as total,
                t.payment_method as paymentMethod,
                u.full_name as cashier
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            ${whereClause}
            ORDER BY t.transaction_date DESC
        `;

        const transactions = await db.all(transactionsQuery, params);

        // Get summary data
        const summaryQuery = `
            SELECT 
                SUM(t.total_amount) as totalSales,
                COUNT(t.id) as totalTransactions,
                SUM(t.tax_amount) as totalTax,
                SUM(t.discount_amount) as totalDiscount
            FROM transactions t
            ${whereClause}
        `;

        const summary = await db.get(summaryQuery, params);

        // Get top products
        const topProductsQuery = `
            SELECT 
                p.id as productId,
                p.name,
                SUM(ti.quantity) as quantity,
                SUM(ti.total_price) as revenue
            FROM transactions t
            JOIN transaction_items ti ON t.id = ti.transaction_id
            JOIN products p ON ti.product_id = p.id
            ${whereClause}
            GROUP BY p.id, p.name
            ORDER BY revenue DESC
            LIMIT 10
        `;

        const topProducts = await db.all(topProductsQuery, params);

        // Get payment methods breakdown
        const paymentMethodsQuery = `
            SELECT 
                t.payment_method as method,
                SUM(t.total_amount) as total
            FROM transactions t
            ${whereClause}
            GROUP BY t.payment_method
        `;

        const paymentMethods = await db.all(paymentMethodsQuery, params);

        // Get hourly breakdown
        const hourlyBreakdownQuery = `
            SELECT 
                strftime('%H:00', t.transaction_date) as hour,
                SUM(t.total_amount) as total
            FROM transactions t
            ${whereClause}
            GROUP BY strftime('%H:00', t.transaction_date)
            ORDER BY hour
        `;

        const hourlyBreakdown = await db.all(hourlyBreakdownQuery, params);

        // Get total items count
        const totalItemsQuery = `
            SELECT SUM(ti.quantity) as totalItems
            FROM transactions t
            JOIN transaction_items ti ON t.id = ti.transaction_id
            ${whereClause}
        `;

        const totalItemsResult = await db.get(totalItemsQuery, params);

        // Format payment methods and hourly breakdown
        const paymentMethodsFormatted = paymentMethods.reduce((acc, method) => {
            acc[method.method] = method.total;
            return acc;
        }, {});

        const hourlyBreakdownFormatted = hourlyBreakdown.reduce((acc, hour) => {
            acc[hour.hour] = hour.total;
            return acc;
        }, {});

        const reportData = {
            reportType: 'Sales Report',
            period: `${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`,
            generatedAt: new Date(),
            summary: {
                totalSales: summary.totalSales || 0,
                totalTransactions: summary.totalTransactions || 0,
                totalItems: totalItemsResult.totalItems || 0,
                averageTransactionValue: summary.totalTransactions > 0 ? 
                    (summary.totalSales || 0) / summary.totalTransactions : 0,
                totalTax: summary.totalTax || 0,
                totalDiscount: summary.totalDiscount || 0
            },
            transactions: transactions,
            topProducts: topProducts,
            paymentMethods: paymentMethodsFormatted,
            hourlyBreakdown: hourlyBreakdownFormatted
        };

        res.json(reportData);
    } catch (error) {
        console.error('Error generating sales report:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Generate inventory report
 * Request body: { storeId, reportType }
 */
router.post("/inventory", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const { storeId, reportType } = req.body;

        let storeClause = "";
        let params = [];

        if (storeId) {
            storeClause = "AND si.store_id = ?";
            params.push(parseInt(storeId));
        }

        // Get current inventory
        const inventoryQuery = `
            SELECT 
                p.id as productId,
                p.name,
                p.barcode,
                cat.name as category,
                pp.selling_price as price,
                si.quantity as currentQuantity,
                si.min_stock as minStock,
                (si.quantity * pp.selling_price) as stockValue,
                CASE 
                    WHEN si.quantity <= 0 THEN 'Out of Stock'
                    WHEN si.quantity <= si.min_stock THEN 'Low Stock'
                    ELSE 'In Stock'
                END as status
            FROM products p
            LEFT JOIN categories cat ON p.category_id = cat.id
            LEFT JOIN store_inventory si ON p.id = si.product_id
            LEFT JOIN product_pricing pp ON p.id = pp.product_id AND pp.is_active = 1
            WHERE p.is_active = 1 ${storeClause}
        `;

        const products = await db.all(inventoryQuery, params);

        // Get summary
        const summaryQuery = `
            SELECT 
                COUNT(DISTINCT p.id) as totalProducts,
                SUM(si.quantity * pp.selling_price) as totalStockValue,
                SUM(CASE WHEN si.quantity <= 0 THEN 1 ELSE 0 END) as outOfStockItems,
                SUM(CASE WHEN si.quantity > 0 AND si.quantity <= si.min_stock THEN 1 ELSE 0 END) as lowStockItems
            FROM products p
            LEFT JOIN store_inventory si ON p.id = si.product_id
            LEFT JOIN product_pricing pp ON p.id = pp.product_id AND pp.is_active = 1
            WHERE p.is_active = 1 ${storeClause}
        `;

        const summary = await db.get(summaryQuery, params);

        // Get expiry information
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        const expiryQuery = `
            SELECT 
                p.id as productId,
                p.name,
                pb.id as batchId,
                pb.batch_number as batchNumber,
                pb.expiry_date as expiryDate,
                pb.current_quantity as batchQuantity,
                pp.selling_price as price,
                (pb.current_quantity * pp.selling_price) as batchValue,
                CASE 
                    WHEN pb.expiry_date < ? THEN 'expired'
                    WHEN pb.expiry_date <= ? THEN 'expiringSoon'
                    ELSE 'valid'
                END as expiryStatus
            FROM product_batches pb
            JOIN products p ON pb.product_id = p.id
            LEFT JOIN product_pricing pp ON p.id = pp.product_id AND pp.is_active = 1
            WHERE pb.is_active = 1
            AND (pb.expiry_date < ? OR pb.expiry_date <= ?)
            ${storeId ? 'AND pb.store_id = ?' : ''}
        `;

        const expiryParams = [now, thirtyDaysFromNow, now, thirtyDaysFromNow];
        if (storeId) {
            expiryParams.push(parseInt(storeId));
        }

        const expiryData = await db.all(expiryQuery, expiryParams);

        const expiredItems = expiryData.filter(item => item.expiryStatus === 'expired');
        const expiringSoonItems = expiryData.filter(item => item.expiryStatus === 'expiringSoon');

        const lowStockItems = products.filter(p => p.status === 'Low Stock');
        const outOfStockItems = products.filter(p => p.status === 'Out of Stock');

        const reportData = {
            reportType: 'Inventory Report',
            generatedAt: new Date(),
            storeId: storeId || 'All Stores',
            summary: {
                totalProducts: summary.totalProducts || 0,
                totalStockValue: summary.totalStockValue || 0,
                lowStockItems: summary.lowStockItems || 0,
                outOfStockItems: summary.outOfStockItems || 0,
                expiredItems: expiredItems.length,
                expiringSoonItems: expiringSoonItems.length
            },
            products: products,
            lowStockItems: lowStockItems,
            outOfStockItems: outOfStockItems,
            expiredItems: expiredItems,
            expiringSoonItems: expiringSoonItems
        };

        res.json(reportData);
    } catch (error) {
        console.error('Error generating inventory report:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Generate customer report
 * Request body: { startDate, endDate, customerId, reportType }
 */
router.post("/customers", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const { startDate, endDate, customerId, reportType } = req.body;

        let whereClause = `WHERE t.transaction_status = 'COMPLETED'`;
        let params = [];

        if (startDate && endDate) {
            whereClause += ` AND t.transaction_date >= ? AND t.transaction_date <= ?`;
            params.push(new Date(startDate).toISOString(), new Date(endDate).toISOString());
        }

        if (customerId) {
            whereClause += ` AND t.customer_id = ?`;
            params.push(customerId);
        }

        // Get customer statistics
        const customerStatsQuery = `
            SELECT 
                COALESCE(c.id, 'walk-in') as customerId,
                c.name,
                COUNT(t.id) as transactionCount,
                SUM(t.total_amount) as totalSpent,
                MIN(t.transaction_date) as firstTransaction,
                MAX(t.transaction_date) as lastTransaction,
                AVG(t.total_amount) as averageTransactionValue
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            ${whereClause}
            GROUP BY COALESCE(c.id, 'walk-in'), c.name
        `;

        const customerDetails = await db.all(customerStatsQuery, params);

        // Get summary
        const summaryQuery = `
            SELECT 
                COUNT(DISTINCT COALESCE(c.id, 'walk-in')) as totalCustomers,
                SUM(t.total_amount) as totalRevenue,
                COUNT(t.id) as totalTransactions
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            ${whereClause}
        `;

        const summary = await db.get(summaryQuery, params);

        // Calculate new vs returning customers
        const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
        const newReturningQuery = `
            SELECT 
                SUM(CASE WHEN MIN(t.transaction_date) >= ? THEN 1 ELSE 0 END) as newCustomers,
                SUM(CASE WHEN MIN(t.transaction_date) < ? AND COUNT(t.id) > 1 THEN 1 ELSE 0 END) as returningCustomers
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            ${whereClause}
            GROUP BY COALESCE(c.id, 'walk-in')
        `;

        const newReturningParams = [thirtyDaysAgo, thirtyDaysAgo, ...params];
        const newReturningResult = await db.get(newReturningQuery, newReturningParams);

        // Get top customers
        const topCustomersQuery = `
            SELECT 
                COALESCE(c.id, 'walk-in') as customerId,
                c.name,
                COUNT(t.id) as transactionCount,
                SUM(t.total_amount) as totalSpent,
                AVG(t.total_amount) as averageTransactionValue
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            ${whereClause}
            GROUP BY COALESCE(c.id, 'walk-in'), c.name
            ORDER BY totalSpent DESC
            LIMIT 10
        `;

        const topCustomers = await db.all(topCustomersQuery, params);

        const reportData = {
            reportType: 'Customer Report',
            period: startDate && endDate ? 
                `${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}` : 
                'All Time',
            generatedAt: new Date(),
            summary: {
                totalCustomers: summary.totalCustomers || 0,
                totalRevenue: summary.totalRevenue || 0,
                totalTransactions: summary.totalTransactions || 0,
                averageTransactionValue: summary.totalTransactions > 0 ? 
                    (summary.totalRevenue || 0) / summary.totalTransactions : 0,
                newCustomers: newReturningResult?.newCustomers || 0,
                returningCustomers: newReturningResult?.returningCustomers || 0
            },
            customerDetails: customerDetails,
            topCustomers: topCustomers
        };

        res.json(reportData);
    } catch (error) {
        console.error('Error generating customer report:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Generate financial report (Profit & Loss)
 * Request body: { startDate, endDate, storeId, reportType }
 */
router.post("/financial", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const { startDate, endDate, storeId, reportType } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Start date and end date are required.",
            });
        }

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [new Date(startDate).toISOString(), new Date(endDate).toISOString()];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(parseInt(storeId));
        }

        // Get revenue data
        const revenueQuery = `
            SELECT 
                SUM(t.total_amount) as totalSales,
                SUM(t.tax_amount) as totalTax
            FROM transactions t
            ${whereClause}
        `;

        const revenue = await db.get(revenueQuery, params);

        // Get cost of goods sold
        const cogsQuery = `
            SELECT 
                SUM(ti.cost_price * ti.quantity) as totalCost,
                cat.name as category,
                SUM(ti.cost_price * ti.quantity) as categoryCost
            FROM transactions t
            JOIN transaction_items ti ON t.id = ti.transaction_id
            JOIN products p ON ti.product_id = p.id
            LEFT JOIN categories cat ON p.category_id = cat.id
            ${whereClause}
            GROUP BY cat.name
        `;

        const cogsData = await db.all(cogsQuery, params);

        const totalCost = cogsData.reduce((sum, item) => sum + (item.categoryCost || 0), 0);
        const costByCategory = cogsData.reduce((acc, item) => {
            const category = item.category || 'Uncategorized';
            acc[category] = (acc[category] || 0) + (item.categoryCost || 0);
            return acc;
        }, {});

        // Get daily breakdown
        const dailyQuery = `
            SELECT 
                DATE(t.transaction_date) as dateKey,
                SUM(t.total_amount) as revenue,
                SUM(ti.cost_price * ti.quantity) as cost
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            ${whereClause}
            GROUP BY DATE(t.transaction_date)
            ORDER BY dateKey
        `;

        const dailyBreakdown = await db.all(dailyQuery, params);

        // Calculate profit metrics
        const totalSales = revenue.totalSales || 0;
        const totalTax = revenue.totalTax || 0;
        const netRevenue = totalSales - totalTax;
        const grossProfit = netRevenue - totalCost;
        const netProfit = grossProfit; // Simplified - would include expenses in real implementation
        const profitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

        // Format daily breakdown
        const dailyBreakdownFormatted = {};
        dailyBreakdown.forEach(day => {
            dailyBreakdownFormatted[day.dateKey] = {
                revenue: day.revenue || 0,
                cost: day.cost || 0,
                profit: (day.revenue || 0) - (day.cost || 0)
            };
        });

        const reportData = {
            reportType: 'Financial Report (Profit & Loss)',
            period: `${moment(startDate).format('YYYY-MM-DD')} to ${moment(endDate).format('YYYY-MM-DD')}`,
            generatedAt: new Date(),
            revenue: {
                totalSales: totalSales,
                totalTax: totalTax,
                netRevenue: netRevenue
            },
            costOfGoodsSold: {
                totalCost: totalCost,
                byCategory: costByCategory
            },
            grossProfit: grossProfit,
            expenses: {
                totalExpenses: 0, // Would need expense tracking implementation
                categories: {} // Would need expense tracking implementation
            },
            netProfit: netProfit,
            profitMargin: profitMargin,
            dailyBreakdown: dailyBreakdownFormatted
        };

        res.json(reportData);
    } catch (error) {
        console.error('Error generating financial report:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Generate custom report with flexible parameters
 * Request body: { reportConfig, filters }
 */
router.post("/custom", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const { reportConfig, filters } = req.body;

        if (!reportConfig) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Report configuration is required.",
            });
        }

        // Build query based on filters
        let whereClause = `WHERE t.transaction_status = 'COMPLETED'`;
        let params = [];

        if (filters.startDate && filters.endDate) {
            whereClause += ` AND t.transaction_date >= ? AND t.transaction_date <= ?`;
            params.push(new Date(filters.startDate).toISOString(), new Date(filters.endDate).toISOString());
        }

        if (filters.storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(parseInt(filters.storeId));
        }

        if (filters.customerId) {
            whereClause += ` AND t.customer_id = ?`;
            params.push(filters.customerId);
        }

        // Build SELECT clause based on report configuration
        let selectFields = [];
        reportConfig.fields.forEach(field => {
            switch (field.key) {
                case 'date':
                    selectFields.push(`strftime('${field.format || '%Y-%m-%d'}', t.transaction_date) as ${field.key}`);
                    break;
                case 'customer':
                    selectFields.push(`COALESCE(c.name, 'Walk-in') as ${field.key}`);
                    break;
                case 'total':
                    selectFields.push(`t.total_amount as ${field.key}`);
                    break;
                case 'items':
                    selectFields.push(`(SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.id) as ${field.key}`);
                    break;
                case 'paymentMethod':
                    selectFields.push(`t.payment_method as ${field.key}`);
                    break;
                case 'cashier':
                    selectFields.push(`u.full_name as ${field.key}`);
                    break;
                default:
                    selectFields.push(`t.${field.key} as ${field.key}`);
            }
        });

        const customQuery = `
            SELECT ${selectFields.join(', ')}
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            ${whereClause}
        `;

        let data = await db.all(customQuery, params);

        // Apply sorting if specified
        if (reportConfig.sortBy) {
            const sortField = reportConfig.sortBy;
            const sortOrder = reportConfig.sortOrder || 'asc';
            
            data.sort((a, b) => {
                const aVal = a[sortField] || '';
                const bVal = b[sortField] || '';
                
                if (sortOrder === 'desc') {
                    return bVal > aVal ? 1 : -1;
                } else {
                    return aVal > bVal ? 1 : -1;
                }
            });
        }

        // Apply limit if specified
        if (reportConfig.limit) {
            data = data.slice(0, reportConfig.limit);
        }

        const reportData = {
            reportType: reportConfig.name || 'Custom Report',
            generatedAt: new Date(),
            configuration: reportConfig,
            filters: filters,
            data: data
        };

        res.json(reportData);
    } catch (error) {
        console.error('Error generating custom report:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});