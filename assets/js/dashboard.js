/**
 * Dashboard JavaScript module for PharmaSpot
 * Handles executive dashboard functionality and KPI widgets
 */

$(document).ready(function() {
    // Initialize dashboard when dashboard tab is shown
    $('a[href="#dashboardTab"]').on('shown.bs.tab', function() {
        loadDashboardKPIs();
        loadSalesChart();
        loadTopProductsChart();
        loadRecentTransactions();
    });
    
    // Handle period change
    $('#dashboardPeriod').on('change', function() {
        loadDashboardKPIs();
        loadSalesChart();
        loadTopProductsChart();
    });
});

/**
 * Load dashboard KPIs
 */
function loadDashboardKPIs() {
    const period = $('#dashboardPeriod').val();
    
    $.ajax({
        url: '/api/dashboard/kpi',
        method: 'GET',
        data: { period: period },
        success: function(response) {
            renderKPIWidgets(response);
        },
        error: function(xhr, status, error) {
            console.error('Error loading dashboard KPIs:', error);
            showNotification('Error loading dashboard data', 'error');
        }
    });
}

/**
 * Load sales chart for dashboard
 */
function loadSalesChart() {
    const period = $('#dashboardPeriod').val();
    
    $.ajax({
        url: '/api/dashboard/sales-chart',
        method: 'GET',
        data: { period: period },
        success: function(response) {
            renderSalesChart(response.labels, response.data);
        },
        error: function(xhr, status, error) {
            console.error('Error loading sales chart:', error);
        }
    });
}

/**
 * Load top products chart for dashboard
 */
function loadTopProductsChart() {
    const period = $('#dashboardPeriod').val();
    
    $.ajax({
        url: '/api/dashboard/top-products-chart',
        method: 'GET',
        data: { period: period, limit: 5 },
        success: function(response) {
            renderTopProductsChart(response.labels, response.data);
        },
        error: function(xhr, status, error) {
            console.error('Error loading top products chart:', error);
        }
    });
}

/**
 * Load recent transactions for dashboard
 */
function loadRecentTransactions() {
    $.ajax({
        url: '/api/dashboard/recent-transactions',
        method: 'GET',
        data: { limit: 10 },
        success: function(response) {
            renderRecentTransactionsTable(response);
        },
        error: function(xhr, status, error) {
            console.error('Error loading recent transactions:', error);
        }
    });
}

/**
 * Render KPI widgets
 */
function renderKPIWidgets(dashboardData) {
    const sales = dashboardData.sales;
    const inventory = dashboardData.inventory;
    const customers = dashboardData.customers;
    const growth = sales.growth;
    
    const kpisHtml = `
        <div class="col-md-3">
            <div class="kpi-widget">
                <div class="kpi-value">${formatCurrency(sales.current.totalRevenue)}</div>
                <div class="kpi-label">Total Revenue</div>
                <div class="kpi-change ${growth.revenue >= 0 ? 'positive' : 'negative'}">
                    <i class="fa fa-arrow-${growth.revenue >= 0 ? 'up' : 'down'}"></i>
                    ${Math.abs(growth.revenue).toFixed(1)}%
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="kpi-widget">
                <div class="kpi-value">${sales.current.totalTransactions}</div>
                <div class="kpi-label">Transactions</div>
                <div class="kpi-change ${growth.transactions >= 0 ? 'positive' : 'negative'}">
                    <i class="fa fa-arrow-${growth.transactions >= 0 ? 'up' : 'down'}"></i>
                    ${Math.abs(growth.transactions).toFixed(1)}%
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="kpi-widget">
                <div class="kpi-value">${customers.totalCustomers}</div>
                <div class="kpi-label">Total Customers</div>
                <div class="kpi-change">
                    <i class="fa fa-users"></i>
                    ${customers.newCustomers} new
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="kpi-widget">
                <div class="kpi-value">${inventory.lowStockItems + inventory.outOfStockItems}</div>
                <div class="kpi-label">Stock Alerts</div>
                <div class="kpi-change ${inventory.lowStockItems > 0 || inventory.outOfStockItems > 0 ? 'negative' : 'positive'}">
                    <i class="fa fa-exclamation-triangle"></i>
                    ${inventory.outOfStockItems} out of stock
                </div>
            </div>
        </div>
    `;
    
    $('#dashboardKPIs').html(kpisHtml);
}

/**
 * Render sales chart
 */
function renderSalesChart(labels, data) {
    const ctx = document.getElementById('salesChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.dashboardSalesChart) {
        window.dashboardSalesChart.destroy();
    }
    
    window.dashboardSalesChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Sales',
                data: data,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return 'Sales: ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render top products chart
 */
function renderTopProductsChart(labels, data) {
    const ctx = document.getElementById('topProductsChart').getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.dashboardTopProductsChart) {
        window.dashboardTopProductsChart.destroy();
    }
    
    window.dashboardTopProductsChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#9966FF'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + formatCurrency(context.parsed);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render recent transactions table
 */
function renderRecentTransactionsTable(transactions) {
    const tbody = $('#recentTransactionsBody');
    tbody.empty();
    
    if (transactions.length === 0) {
        tbody.append('<tr><td colspan="5" class="text-center">No recent transactions</td></tr>');
        return;
    }
    
    transactions.forEach(transaction => {
        const date = new Date(transaction.date).toLocaleDateString();
        const paymentMethod = transaction.paymentMethod || 'Cash';
        const row = `
            <tr>
                <td>${date}</td>
                <td>${transaction.invoiceNumber}</td>
                <td>${transaction.customer}</td>
                <td>${formatCurrency(transaction.total)}</td>
                <td><span class="label label-info">${paymentMethod}</span></td>
            </tr>
        `;
        tbody.append(row);
    });
}

/**
 * Format currency value
 */
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
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
 * Export functions for global use
 */
window.loadDashboardKPIs = loadDashboardKPIs;
window.loadSalesChart = loadSalesChart;
window.loadTopProductsChart = loadTopProductsChart;
window.loadRecentTransactions = loadRecentTransactions;
window.formatCurrency = formatCurrency;
window.showNotification = showNotification;