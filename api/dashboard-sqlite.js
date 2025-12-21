const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const moment = require("moment");
const sqliteDBManager = require("./sqlite-db-manager");

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get welcome message for Dashboard API.
 */
router.get("/", function (req, res) {
    res.send("Dashboard API (SQLite)");
});

/**
 * GET endpoint: Get executive dashboard KPIs
 * Query parameters: period (today, week, month, year), storeId
 */
router.get("/kpi", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
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

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [startDate.toISOString(), endDate.toISOString()];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(storeId);
        }

        // Get current period data
        const currentPeriodQuery = `
            SELECT 
                SUM(t.total_amount) as totalRevenue,
                COUNT(t.id) as totalTransactions,
                SUM(ti.quantity) as totalItems
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            ${whereClause}
        `;

        const currentData = await db.get(currentPeriodQuery, params);

        // Get previous period data for comparison
        const previousStartDate = startDate.clone().subtract(1, period === 'today' ? 'day' : period === 'week' ? 'week' : period === 'month' ? 'month' : 'year');
        const previousEndDate = endDate.clone().subtract(1, period === 'today' ? 'day' : period === 'week' ? 'week' : period === 'month' ? 'month' : 'year');

        let previousWhereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let previousParams = [previousStartDate.toISOString(), previousEndDate.toISOString()];

        if (storeId) {
            previousWhereClause += ` AND t.store_id = ?`;
            previousParams.push(storeId);
        }

        const previousPeriodQuery = `
            SELECT 
                SUM(t.total_amount) as totalRevenue,
                COUNT(t.id) as totalTransactions,
                SUM(ti.quantity) as totalItems
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            ${previousWhereClause}
        `;

        const previousData = await db.get(previousPeriodQuery, previousParams);

        // Calculate growth percentages
        const revenueGrowth = previousData.totalRevenue > 0 ? 
            ((currentData.totalRevenue - previousData.totalRevenue) / previousData.totalRevenue) * 100 : 0;
        const transactionGrowth = previousData.totalTransactions > 0 ? 
            ((currentData.totalTransactions - previousData.totalTransactions) / previousData.totalTransactions) * 100 : 0;
        const averageValueGrowth = previousData.totalTransactions > 0 ? 
            (((currentData.totalRevenue / currentData.totalTransactions) - (previousData.totalRevenue / previousData.totalTransactions)) / 
            (previousData.totalRevenue / previousData.totalTransactions)) * 100 : 0;

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
            LIMIT 5
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

        // Get inventory KPIs
        let inventoryWhereClause = storeId ? "WHERE si.store_id = ?" : "";
        let inventoryParams = storeId ? [storeId] : [];

        const inventoryQuery = `
            SELECT 
                COUNT(DISTINCT p.id) as totalProducts,
                SUM(si.quantity * pp.selling_price) as totalStockValue,
                SUM(CASE WHEN si.quantity <= 0 THEN 1 ELSE 0 END) as outOfStockItems,
                SUM(CASE WHEN si.quantity > 0 AND si.quantity <= si.min_stock THEN 1 ELSE 0 END) as lowStockItems
            FROM products p
            LEFT JOIN store_inventory si ON p.id = si.product_id
            LEFT JOIN product_pricing pp ON p.id = pp.product_id AND pp.is_active = 1
            ${inventoryWhereClause}
        `;

        const inventoryKPIs = await db.get(inventoryQuery, inventoryParams);

        // Get customer KPIs
        const customerQuery = `
            SELECT 
                COUNT(DISTINCT COALESCE(c.id, 'walk-in')) as totalCustomers,
                SUM(CASE WHEN MIN(t.transaction_date) >= ? THEN 1 ELSE 0 END) as newCustomers,
                SUM(CASE WHEN MIN(t.transaction_date) < ? AND COUNT(t.id) > 1 THEN 1 ELSE 0 END) as returningCustomers
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            ${whereClause}
            GROUP BY COALESCE(c.id, 'walk-in')
        `;

        const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
        const customerParams = [thirtyDaysAgo, thirtyDaysAgo, ...params];
        const customerKPIs = await db.get(customerQuery, customerParams);

        const averageTransactionValue = currentData.totalTransactions > 0 ? 
            currentData.totalRevenue / currentData.totalTransactions : 0;

        const dashboardData = {
            period: period,
            dateRange: {
                start: startDate.format('YYYY-MM-DD'),
                end: endDate.format('YYYY-MM-DD')
            },
            sales: {
                current: {
                    totalRevenue: currentData.totalRevenue || 0,
                    totalTransactions: currentData.totalTransactions || 0,
                    totalItems: currentData.totalItems || 0,
                    averageTransactionValue: averageTransactionValue,
                    topProducts: topProducts,
                    paymentMethods: paymentMethods.reduce((acc, method) => {
                        acc[method.method] = method.total;
                        return acc;
                    }, {})
                },
                previous: {
                    totalRevenue: previousData.totalRevenue || 0,
                    totalTransactions: previousData.totalTransactions || 0,
                    totalItems: previousData.totalItems || 0,
                    averageTransactionValue: previousData.totalTransactions > 0 ? 
                        previousData.totalRevenue / previousData.totalTransactions : 0
                },
                growth: {
                    revenue: revenueGrowth,
                    transactions: transactionGrowth,
                    averageTransactionValue: averageValueGrowth
                }
            },
            inventory: {
                totalProducts: inventoryKPIs.totalProducts || 0,
                totalStockValue: inventoryKPIs.totalStockValue || 0,
                lowStockItems: inventoryKPIs.lowStockItems || 0,
                outOfStockItems: inventoryKPIs.outOfStockItems || 0
            },
            customers: {
                totalCustomers: customerKPIs?.totalCustomers || 0,
                newCustomers: customerKPIs?.newCustomers || 0,
                returningCustomers: customerKPIs?.returningCustomers || 0,
                averageTransactionValue: averageTransactionValue
            },
            generatedAt: new Date()
        };

        res.json(dashboardData);
    } catch (error) {
        console.error('Error getting dashboard KPIs:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get sales chart data for dashboard
 * Query parameters: period (today, week, month, year), storeId
 */
router.get("/sales-chart", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const period = req.query.period || 'month';
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

        const now = moment();
        let startDate, endDate, groupBy;

        switch (period) {
            case 'today':
                startDate = now.clone().startOf('day');
                endDate = now.clone().endOf('day');
                groupBy = "%H:00";
                break;
            case 'week':
                startDate = now.clone().startOf('week');
                endDate = now.clone().endOf('week');
                groupBy = "%Y-%m-%d";
                break;
            case 'month':
                startDate = now.clone().startOf('month');
                endDate = now.clone().endOf('month');
                groupBy = "%Y-%m-%d";
                break;
            case 'year':
                startDate = now.clone().startOf('year');
                endDate = now.clone().endOf('year');
                groupBy = "%Y-%m";
                break;
            default:
                startDate = now.clone().startOf('month');
                endDate = now.clone().endOf('month');
                groupBy = "%Y-%m-%d";
        }

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [startDate.toISOString(), endDate.toISOString()];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(storeId);
        }

        const salesQuery = `
            SELECT 
                strftime('${groupBy}', t.transaction_date) as date_key,
                SUM(t.total_amount) as total
            FROM transactions t
            ${whereClause}
            GROUP BY date_key
            ORDER BY date_key
        `;

        const salesData = await db.all(salesQuery, params);

        // Generate labels based on period
        const labels = [];
        const data = [];

        if (period === 'today') {
            for (let i = 0; i < 24; i++) {
                const hour = i.toString().padStart(2, '0');
                labels.push(`${hour}:00`);
                data.push(0);
            }
            
            salesData.forEach(item => {
                const hour = moment(item.date_key).format('HH');
                const index = parseInt(hour);
                if (index >= 0 && index < 24) {
                    data[index] = item.total || 0;
                }
            });
        } else if (period === 'week' || period === 'month') {
            const days = endDate.diff(startDate, 'days') + 1;
            for (let i = 0; i < days; i++) {
                const date = startDate.clone().add(i, 'days');
                labels.push(date.format('MMM DD'));
                data.push(0);
            }
            
            salesData.forEach(item => {
                const date = moment(item.date_key);
                const index = date.diff(startDate, 'days');
                if (index >= 0 && index < days) {
                    data[index] = item.total || 0;
                }
            });
        } else if (period === 'year') {
            for (let i = 0; i < 12; i++) {
                const date = startDate.clone().add(i, 'months');
                labels.push(date.format('MMM'));
                data.push(0);
            }
            
            salesData.forEach(item => {
                const date = moment(item.date_key);
                const index = date.diff(startDate, 'months');
                if (index >= 0 && index < 12) {
                    data[index] = item.total || 0;
                }
            });
        }

        res.json({
            period: period,
            groupBy: period === 'today' ? 'hour' : period === 'year' ? 'month' : 'day',
            labels: labels,
            data: data
        });
    } catch (error) {
        console.error('Error getting sales chart data:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get top products chart data
 * Query parameters: period (today, week, month, year), limit, storeId
 */
router.get("/top-products-chart", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
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

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [startDate.toISOString(), endDate.toISOString()];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(storeId);
        }

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
            LIMIT ?
        `;

        params.push(limit);
        const topProducts = await db.all(topProductsQuery, params);

        const labels = topProducts.map(p => p.name);
        const data = topProducts.map(p => p.revenue);

        res.json({
            period: period,
            labels: labels,
            data: data,
            products: topProducts
        });
    } catch (error) {
        console.error('Error getting top products chart data:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get recent transactions for dashboard
 * Query parameters: limit, storeId
 */
router.get("/recent-transactions", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const limit = parseInt(req.query.limit) || 10;
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

        let whereClause = `WHERE t.transaction_status = 'COMPLETED'`;
        let params = [];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(storeId);
        }

        const recentTransactionsQuery = `
            SELECT 
                t.id,
                t.transaction_date as date,
                t.transaction_number as invoiceNumber,
                COALESCE(c.name, 'Walk-in') as customer,
                t.total_amount as total,
                t.payment_method as paymentMethod,
                u.full_name as cashier,
                (SELECT COUNT(*) FROM transaction_items ti WHERE ti.transaction_id = t.id) as itemCount
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN users u ON t.user_id = u.id
            ${whereClause}
            ORDER BY t.transaction_date DESC
            LIMIT ?
        `;

        params.push(limit);
        const recentTransactions = await db.all(recentTransactionsQuery, params);

        res.json(recentTransactions);
    } catch (error) {
        console.error('Error getting recent transactions:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get low stock alerts for dashboard
 * Query parameters: storeId
 */
router.get("/low-stock-alerts", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

        let whereClause = "WHERE p.is_active = 1";
        let params = [];

        if (storeId) {
            whereClause += " AND si.store_id = ?";
            params.push(storeId);
        }

        const lowStockQuery = `
            SELECT 
                p.id as productId,
                p.name,
                si.quantity as currentQuantity,
                si.min_stock as minStock,
                CASE 
                    WHEN si.quantity <= 0 THEN 'Out of Stock'
                    WHEN si.quantity <= si.min_stock THEN 'Low Stock'
                    ELSE 'In Stock'
                END as status
            FROM products p
            LEFT JOIN store_inventory si ON p.id = si.product_id
            ${whereClause}
            HAVING status IN ('Low Stock', 'Out of Stock')
            ORDER BY si.quantity ASC
            LIMIT 10
        `;

        const lowStockItems = await db.all(lowStockQuery, params);

        res.json({
            totalAlerts: lowStockItems.length,
            alerts: lowStockItems
        });
    } catch (error) {
        console.error('Error getting low stock alerts:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});