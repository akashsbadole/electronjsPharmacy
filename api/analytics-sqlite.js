const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const moment = require("moment");
const sqliteDBManager = require("./sqlite-db-manager");

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get the welcome message for the Analytics API.
 */
router.get("/", function (req, res) {
    res.send("Analytics API (SQLite)");
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
            groupBy = "%Y-%m-%d %H:00";
            break;
        case 'weekly':
            startDate = now.clone().startOf('week');
            endDate = now.clone().endOf('week');
            groupBy = "%Y-%m-%d";
            break;
        case 'monthly':
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            groupBy = "%Y-%m-%d";
            break;
        case 'yearly':
            startDate = now.clone().startOf('year');
            endDate = now.clone().endOf('year');
            groupBy = "%Y-%m";
            break;
        default:
            startDate = now.clone().startOf('month');
            endDate = now.clone().endOf('month');
            groupBy = "%Y-%m-%d";
    }

    return { startDate: startDate.toDate(), endDate: endDate.toDate(), groupBy };
}

/**
 * GET endpoint: Get sales analytics for different time periods
 * Query parameters: period (daily, weekly, monthly, yearly), storeId
 */
router.get("/sales/trends", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const period = req.query.period || 'monthly';
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
        const { startDate, endDate, groupBy } = getDateRange(period);

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [startDate.toISOString(), endDate.toISOString()];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(storeId);
        }

        // Get sales data grouped by date/hour
        const salesQuery = `
            SELECT 
                strftime('${groupBy}', t.transaction_date) as date_key,
                SUM(t.total_amount) as sales,
                COUNT(t.id) as transactions,
                SUM(ti.quantity) as items
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            ${whereClause}
            GROUP BY date_key
            ORDER BY date_key
        `;

        const salesData = await db.all(salesQuery, params);

        // Calculate summary
        const summaryQuery = `
            SELECT 
                SUM(t.total_amount) as totalSales,
                COUNT(t.id) as totalTransactions,
                SUM(ti.quantity) as totalItems
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            ${whereClause}
        `;

        const summary = await db.get(summaryQuery, params);

        const averageTransactionValue = summary.totalTransactions > 0 ? 
            summary.totalSales / summary.totalTransactions : 0;

        res.json({
            period: period,
            summary: {
                totalSales: summary.totalSales || 0,
                totalTransactions: summary.totalTransactions || 0,
                totalItems: summary.totalItems || 0,
                averageTransactionValue: averageTransactionValue
            },
            chartData: salesData
        });
    } catch (error) {
        console.error('Error in sales trends analytics:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get top selling products
 * Query parameters: period (daily, weekly, monthly, yearly), limit, storeId
 */
router.get("/sales/top-products", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const period = req.query.period || 'monthly';
        const limit = parseInt(req.query.limit) || 10;
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
        const { startDate, endDate } = getDateRange(period);

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [startDate.toISOString(), endDate.toISOString()];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(storeId);
        }

        const topProductsQuery = `
            SELECT 
                p.id as productId,
                p.name as name,
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

        res.json({
            period: period,
            topProducts: topProducts
        });
    } catch (error) {
        console.error('Error in top products analytics:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get inventory analytics including stock movement and expiry analysis
 */
router.get("/inventory/analysis", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;

        let storeClause = "";
        let params = [];

        if (storeId) {
            storeClause = "WHERE si.store_id = ?";
            params.push(storeId);
        }

        // Get stock analysis
        const stockQuery = `
            SELECT 
                COUNT(DISTINCT p.id) as totalProducts,
                SUM(si.quantity * pp.selling_price) as totalStockValue,
                SUM(CASE WHEN si.quantity <= 0 THEN 1 ELSE 0 END) as outOfStockItems,
                SUM(CASE WHEN si.quantity > 0 AND si.quantity <= si.min_stock THEN 1 ELSE 0 END) as lowStockItems
            FROM products p
            LEFT JOIN store_inventory si ON p.id = si.product_id
            LEFT JOIN product_pricing pp ON p.id = pp.product_id AND pp.is_active = 1
            ${storeClause}
        `;

        const stockAnalysis = await db.get(stockQuery, params);

        // Get low stock items
        const lowStockQuery = `
            SELECT 
                p.id as productId,
                p.name,
                si.quantity as currentQuantity,
                si.min_stock as minStock
            FROM products p
            JOIN store_inventory si ON p.id = si.product_id
            ${storeClause} AND si.quantity > 0 AND si.quantity <= si.min_stock
        `;

        const lowStockItems = await db.all(lowStockQuery, params);

        // Get out of stock items
        const outOfStockQuery = `
            SELECT 
                p.id as productId,
                p.name,
                si.quantity as currentQuantity
            FROM products p
            JOIN store_inventory si ON p.id = si.product_id
            ${storeClause} AND si.quantity <= 0
        `;

        const outOfStockItems = await db.all(outOfStockQuery, params);

        // Get expiry analysis
        const now = new Date();
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(now.getDate() + 30);

        const expiryQuery = `
            SELECT 
                p.id as productId,
                p.name as productName,
                pb.id as batchId,
                pb.batch_number as batchNumber,
                pb.expiry_date as expiryDate,
                pb.current_quantity as quantity,
                (pb.current_quantity * pp.selling_price) as value,
                CASE 
                    WHEN pb.expiry_date < ? THEN 'expired'
                    WHEN pb.expiry_date <= ? THEN 'expiringSoon'
                    ELSE 'valid'
                END as status
            FROM product_batches pb
            JOIN products p ON pb.product_id = p.id
            LEFT JOIN product_pricing pp ON p.id = pp.product_id AND pp.is_active = 1
            WHERE pb.is_active = 1
            AND (pb.expiry_date < ? OR pb.expiry_date <= ?)
            ${storeId ? 'AND pb.store_id = ?' : ''}
        `;

        const expiryParams = [now, thirtyDaysFromNow, now, thirtyDaysFromNow];
        if (storeId) {
            expiryParams.push(storeId);
        }

        const expiryData = await db.all(expiryQuery, expiryParams);

        const expiredItems = expiryData.filter(item => item.status === 'expired');
        const expiringSoonItems = expiryData.filter(item => item.status === 'expiringSoon');

        const totalExpiryValue = expiryData.reduce((sum, item) => sum + (item.value || 0), 0);

        res.json({
            stockAnalysis: {
                totalProducts: stockAnalysis.totalProducts || 0,
                totalStockValue: stockAnalysis.totalStockValue || 0,
                lowStockItems: lowStockItems.length,
                outOfStockItems: outOfStockItems.length,
                lowStockItemsList: lowStockItems,
                outOfStockItemsList: outOfStockItems
            },
            expiryAnalysis: {
                expired: expiredItems,
                expiringSoon: expiringSoonItems,
                totalValue: totalExpiryValue
            }
        });
    } catch (error) {
        console.error('Error in inventory analysis:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get customer analytics including purchase patterns and top customers
 */
router.get("/customers/analysis", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const period = req.query.period || 'monthly';
        const limit = parseInt(req.query.limit) || 10;
        const { startDate, endDate } = getDateRange(period);

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [startDate.toISOString(), endDate.toISOString()];

        // Get customer statistics
        const customerStatsQuery = `
            SELECT 
                COALESCE(c.id, 'walk-in') as customerId,
                COUNT(t.id) as transactionCount,
                SUM(t.total_amount) as totalSpent,
                MIN(t.transaction_date) as firstTransaction,
                MAX(t.transaction_date) as lastTransaction
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            ${whereClause}
            GROUP BY COALESCE(c.id, 'walk-in')
        `;

        const customerStats = await db.all(customerStatsQuery, params);

        // Get total customers and new vs returning
        const thirtyDaysAgo = moment().subtract(30, 'days').toDate();
        const customerAnalysisQuery = `
            SELECT 
                COUNT(DISTINCT COALESCE(c.id, 'walk-in')) as totalCustomers,
                SUM(CASE WHEN MIN(t.transaction_date) >= ? THEN 1 ELSE 0 END) as newCustomers,
                SUM(CASE WHEN MIN(t.transaction_date) < ? AND COUNT(t.id) > 1 THEN 1 ELSE 0 END) as returningCustomers
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            ${whereClause}
            GROUP BY COALESCE(c.id, 'walk-in')
        `;

        const customerAnalysis = await db.get(customerAnalysisQuery, [thirtyDaysAgo, thirtyDaysAgo]);

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
            GROUP BY COALESCE(c.id, 'walk-in')
            ORDER BY totalSpent DESC
            LIMIT ?
        `;

        const topCustomersParams = [...params, limit];
        const topCustomers = await db.all(topCustomersQuery, topCustomersParams);

        // Get purchase patterns (day-wise and hour-wise)
        const dayWiseQuery = `
            SELECT 
                strftime('%A', t.transaction_date) as dayOfWeek,
                COUNT(t.id) as count,
                SUM(t.total_amount) as revenue
            FROM transactions t
            ${whereClause}
            GROUP BY strftime('%A', t.transaction_date)
        `;

        const dayWiseSales = await db.all(dayWiseQuery, params);

        const hourWiseQuery = `
            SELECT 
                strftime('%H', t.transaction_date) as hour,
                COUNT(t.id) as count,
                SUM(t.total_amount) as revenue
            FROM transactions t
            ${whereClause}
            GROUP BY strftime('%H', t.transaction_date)
        `;

        const hourWiseSales = await db.all(hourWiseQuery, params);

        // Calculate average transaction value
        const avgTransactionQuery = `
            SELECT AVG(t.total_amount) as averageTransactionValue
            FROM transactions t
            ${whereClause}
        `;

        const avgTransaction = await db.get(avgTransactionQuery, params);

        // Find peak purchase day and hour
        const peakDay = dayWiseSales.reduce((max, day) => 
            day.count > (max?.count || 0) ? day : max, null);
        const peakHour = hourWiseSales.reduce((max, hour) => 
            hour.count > (max?.count || 0) ? hour : max, null);

        res.json({
            period: period,
            customerAnalysis: {
                totalCustomers: customerAnalysis?.totalCustomers || 0,
                newCustomers: customerAnalysis?.newCustomers || 0,
                returningCustomers: customerAnalysis?.returningCustomers || 0,
                topCustomers: topCustomers,
                purchasePatterns: {
                    averageTransactionValue: avgTransaction?.averageTransactionValue || 0,
                    mostFrequentPurchaseTime: peakHour ? `${peakHour.hour}:00` : null,
                    peakPurchaseDay: peakDay?.dayOfWeek || null
                }
            },
            dayWiseSales: dayWiseSales.reduce((acc, day) => {
                acc[day.dayOfWeek] = { count: day.count, revenue: day.revenue };
                return acc;
            }, {}),
            hourWiseSales: hourWiseSales.reduce((acc, hour) => {
                acc[hour.hour] = { count: hour.count, revenue: hour.revenue };
                return acc;
            }, {})
        });
    } catch (error) {
        console.error('Error in customer analysis:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get financial analytics including profit & loss trends
 */
router.get("/financial/analysis", async function (req, res) {
    try {
        const db = await sqliteDBManager.initialize();
        const period = req.query.period || 'monthly';
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : null;
        const { startDate, endDate } = getDateRange(period);

        let whereClause = `WHERE t.transaction_date >= ? AND t.transaction_date <= ? AND t.transaction_status = 'COMPLETED'`;
        let params = [startDate.toISOString(), endDate.toISOString()];

        if (storeId) {
            whereClause += ` AND t.store_id = ?`;
            params.push(storeId);
        }

        // Get financial data
        const financialQuery = `
            SELECT 
                SUM(t.total_amount) as totalRevenue,
                SUM(t.tax_amount) as totalTax,
                SUM(ti.total_price) as grossSales,
                SUM(ti.cost_price * ti.quantity) as totalCost
            FROM transactions t
            LEFT JOIN transaction_items ti ON t.id = ti.transaction_id
            ${whereClause}
        `;

        const financialData = await db.get(financialQuery, params);

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
        const totalRevenue = financialData.totalRevenue || 0;
        const totalCost = financialData.totalCost || 0;
        const grossProfit = totalRevenue - totalCost;
        const netProfit = grossProfit; // Simplified - would include expenses in real implementation
        const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

        // Calculate profit by day
        const profitByDay = {};
        dailyBreakdown.forEach(day => {
            profitByDay[day.dateKey] = (day.revenue || 0) - (day.cost || 0);
        });

        res.json({
            period: period,
            financialData: {
                totalRevenue: totalRevenue,
                totalCost: totalCost,
                grossProfit: grossProfit,
                netProfit: netProfit,
                profitMargin: profitMargin,
                revenueByDay: dailyBreakdown.reduce((acc, day) => {
                    acc[day.dateKey] = day.revenue || 0;
                    return acc;
                }, {}),
                profitByDay: profitByDay,
                topRevenueCategories: {} // Would need category joins for this
            }
        });
    } catch (error) {
        console.error('Error in financial analysis:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});