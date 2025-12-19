/**
 * Analytics JavaScript module for PharmaSpot
 * Handles all analytics functionality including charts and data visualization
 */

$(document).ready(function() {
    // Initialize analytics when the analytics tab is shown
    $('a[href="#salesAnalyticsTab"]').on('shown.bs.tab', function() {
        loadSalesAnalytics();
    });
    
    $('a[href="#inventoryAnalyticsTab"]').on('shown.bs.tab', function() {
        loadInventoryAnalytics();
    });
    
    $('a[href="#customerAnalyticsTab"]').on('shown.bs.tab', function() {
        loadCustomerAnalytics();
    });
});

/**
 * Load sales analytics data and render charts
 */
function loadSalesAnalytics() {
    const period = $('#salesPeriod').val();
    
    $.ajax({
        url: '/api/analytics/sales/trends',
        method: 'GET',
        data: { period: period },
        success: function(response) {
            renderSalesTrendChart(response.chartData, response.summary);
        },
        error: function(xhr, status, error) {
            console.error('Error loading sales analytics:', error);
            showNotification('Error loading sales analytics', 'error');
        }
    });
    
    // Load top products
    $.ajax({
        url: '/api/analytics/sales/top-products',
        method: 'GET',
        data: { period: period, limit: 10 },
        success: function(response) {
            renderTopProductsTable(response.topProducts);
        },
        error: function(xhr, status, error) {
            console.error('Error loading top products:', error);
        }
    });
}

/**
 * Load inventory analytics data
 */
function loadInventoryAnalytics() {
    $.ajax({
        url: '/api/analytics/inventory/analysis',
        method: 'GET',
        success: function(response) {
            renderStockSummary(response.stockAnalysis);
            renderExpiryAnalysis(response.expiryAnalysis);
            renderLowStockTable(response.stockAnalysis.lowStock);
        },
        error: function(xhr, status, error) {
            console.error('Error loading inventory analytics:', error);
            showNotification('Error loading inventory analytics', 'error');
        }
    });
}

/**
 * Load customer analytics data
 */
function loadCustomerAnalytics() {
    const period = $('#customerPeriod').val();
    
    $.ajax({
        url: '/api/analytics/customers/analysis',
        method: 'GET',
        data: { period: period, limit: 10 },
        success: function(response) {
            renderCustomerSummary(response.customerAnalysis);
            renderTopCustomersTable(response.customerAnalysis.topCustomers);
        },
        error: function(xhr, status, error) {
            console.error('Error loading customer analytics:', error);
            showNotification('Error loading customer analytics', 'error');
        }
    });
}

/**
 * Render sales trend chart
 */
function renderSalesTrendChart(chartData, summary) {
    const ctx = document.getElementById('salesAnalyticsChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.salesAnalyticsChart) {
        window.salesAnalyticsChart.destroy();
    }
    
    const labels = chartData.map(item => item.date);
    const salesData = chartData.map(item => item.sales);
    const transactionsData = chartData.map(item => item.transactions);
    
    window.salesAnalyticsChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales',
                data: salesData,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                yAxisID: 'y',
                tension: 0.1
            }, {
                label: 'Transactions',
                data: transactionsData,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                yAxisID: 'y1',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Sales Amount'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Transactions'
                    },
                    grid: {
                        drawOnChartArea: false,
                    },
                },
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.dataset.label === 'Sales') {
                                label += new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(context.parsed.y);
                            } else {
                                label += context.parsed.y;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render top products table
 */
function renderTopProductsTable(topProducts) {
    const tbody = $('#topProductsBody');
    tbody.empty();
    
    if (topProducts.length === 0) {
        tbody.append('<tr><td colspan="3" class="text-center">No data available</td></tr>');
        return;
    }
    
    topProducts.forEach(product => {
        const row = `
            <tr>
                <td>${product.name}</td>
                <td>${product.quantity}</td>
                <td>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(product.revenue)}</td>
            </tr>
        `;
        tbody.append(row);
    });
}

/**
 * Render stock summary
 */
function renderStockSummary(stockAnalysis) {
    const summaryHtml = `
        <div class="row">
            <div class="col-md-3">
                <div class="stat-box">
                    <h4>${stockAnalysis.totalProducts}</h4>
                    <p>Total Products</p>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-box">
                    <h4>${stockAnalysis.lowStock.length}</h4>
                    <p>Low Stock Items</p>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-box">
                    <h4>${stockAnalysis.outOfStock.length}</h4>
                    <p>Out of Stock</p>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-box">
                    <h4>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(stockAnalysis.totalStockValue)}</h4>
                    <p>Total Stock Value</p>
                </div>
            </div>
        </div>
    `;
    $('#stockSummary').html(summaryHtml);
}

/**
 * Render expiry analysis
 */
function renderExpiryAnalysis(expiryAnalysis) {
    const expiryHtml = `
        <div class="row">
            <div class="col-md-4">
                <div class="alert alert-danger">
                    <h4>${expiryAnalysis.expired.length}</h4>
                    <p>Expired Items</p>
                </div>
            </div>
            <div class="col-md-4">
                <div class="alert alert-warning">
                    <h4>${expiryAnalysis.expiringSoon.length}</h4>
                    <p>Expiring Soon (30 days)</p>
                </div>
            </div>
            <div class="col-md-4">
                <div class="alert alert-info">
                    <h4>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(expiryAnalysis.totalValue)}</h4>
                    <p>Total Inventory Value</p>
                </div>
            </div>
        </div>
    `;
    $('#expiryAnalysis').html(expiryHtml);
}

/**
 * Render low stock table
 */
function renderLowStockTable(lowStockItems) {
    const tbody = $('#lowStockBody');
    tbody.empty();
    
    if (lowStockItems.length === 0) {
        tbody.append('<tr><td colspan="4" class="text-center">No low stock items</td></tr>');
        return;
    }
    
    lowStockItems.forEach(item => {
        const statusClass = item.currentQuantity <= 0 ? 'danger' : 'warning';
        const statusText = item.currentQuantity <= 0 ? 'Out of Stock' : 'Low Stock';
        
        const row = `
            <tr>
                <td>${item.name}</td>
                <td>${item.currentQuantity}</td>
                <td>${item.minStock}</td>
                <td><span class="label label-${statusClass}">${statusText}</span></td>
            </tr>
        `;
        tbody.append(row);
    });
}

/**
 * Render customer summary
 */
function renderCustomerSummary(customerAnalysis) {
    const summaryHtml = `
        <div class="row">
            <div class="col-md-3">
                <div class="stat-box">
                    <h4>${customerAnalysis.totalCustomers}</h4>
                    <p>Total Customers</p>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-box">
                    <h4>${customerAnalysis.newCustomers}</h4>
                    <p>New Customers</p>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-box">
                    <h4>${customerAnalysis.returningCustomers}</h4>
                    <p>Returning Customers</p>
                </div>
            </div>
            <div class="col-md-3">
                <div class="stat-box">
                    <h4>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(customerAnalysis.purchasePatterns.averageTransactionValue)}</h4>
                    <p>Avg Transaction Value</p>
                </div>
            </div>
        </div>
        <div class="row">
            <div class="col-md-6">
                <p><strong>Peak Purchase Day:</strong> ${customerAnalysis.purchasePatterns.peakPurchaseDay || 'N/A'}</p>
            </div>
            <div class="col-md-6">
                <p><strong>Peak Purchase Time:</strong> ${customerAnalysis.purchasePatterns.mostFrequentPurchaseTime || 'N/A'}</p>
            </div>
        </div>
    `;
    $('#customerSummary').html(summaryHtml);
}

/**
 * Render top customers table
 */
function renderTopCustomersTable(topCustomers) {
    const tbody = $('#topCustomersBody');
    tbody.empty();
    
    if (topCustomers.length === 0) {
        tbody.append('<tr><td colspan="4" class="text-center">No data available</td></tr>');
        return;
    }
    
    topCustomers.forEach(customer => {
        const avgTransaction = customer.transactionCount > 0 ? customer.totalSpent / customer.transactionCount : 0;
        const row = `
            <tr>
                <td>${customer.customerId}</td>
                <td>${customer.transactionCount}</td>
                <td>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(customer.totalSpent)}</td>
                <td>${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(avgTransaction)}</td>
            </tr>
        `;
        tbody.append(row);
    });
}

/**
 * Show notification message
 */
function showNotification(message, type = 'info') {
    // Create a simple notification (could be enhanced with a proper notification library)
    const alertClass = type === 'error' ? 'alert-danger' : 'alert-info';
    const notification = $(`
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            ${message}
            <button type="button" class="close" data-dismiss="alert" aria-label="Close">
                <span aria-hidden="true">&times;</span>
            </button>
        </div>
    `);
    
    $('body').prepend(notification);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        notification.alert('close');
    }, 5000);
}

/**
 * Format currency value
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

/**
 * Export functions for global use
 */
window.loadSalesAnalytics = loadSalesAnalytics;
window.loadInventoryAnalytics = loadInventoryAnalytics;
window.loadCustomerAnalytics = loadCustomerAnalytics;
window.showNotification = showNotification;
window.formatCurrency = formatCurrency;