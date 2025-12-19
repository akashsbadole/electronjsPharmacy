/**
 * Analytics & Reports Integration JavaScript for PharmaSpot
 * Main integration file that coordinates all analytics and reports functionality
 */

$(document).ready(function() {
    // Initialize analytics and reports when modal is shown
    $('#analyticsReportsModal').on('shown.bs.modal', function() {
        // Load initial dashboard data
        loadDashboardKPIs();
        loadSalesChart();
        loadTopProductsChart();
        loadRecentTransactions();
    });
    
    // Initialize aging reports
    $('#agingReportsModal').on('shown.bs.modal', function() {
        loadPayablesAging();
        loadReceivablesAging();
    });
    
    // Handle tab changes in analytics modal
    $('a[data-toggle="tab"]').on('shown.bs.tab', function(e) {
        const target = $(e.target).attr('href');
        
        if (target === '#dashboardTab') {
            loadDashboardKPIs();
            loadSalesChart();
            loadTopProductsChart();
            loadRecentTransactions();
        } else if (target === '#salesAnalyticsTab') {
            loadSalesAnalytics();
        } else if (target === '#inventoryAnalyticsTab') {
            loadInventoryAnalytics();
        } else if (target === '#customerAnalyticsTab') {
            loadCustomerAnalytics();
        } else if (target === '#reportsTab') {
            // Reports tab initialization is handled by reports.js
        }
    });
});

/**
 * Load payables aging data
 */
function loadPayablesAging() {
    $.ajax({
        url: '/api/accounts/payable-aging',
        method: 'GET',
        success: function(response) {
            renderPayablesAgingTable(response.data || []);
        },
        error: function(xhr, status, error) {
            console.error('Error loading payables aging:', error);
            showNotification('Error loading payables aging report', 'error');
        }
    });
}

/**
 * Load receivables aging data
 */
function loadReceivablesAging() {
    $.ajax({
        url: '/api/accounts/receivable-aging',
        method: 'GET',
        success: function(response) {
            renderReceivablesAgingTable(response.data || []);
        },
        error: function(xhr, status, error) {
            console.error('Error loading receivables aging:', error);
            showNotification('Error loading receivables aging report', 'error');
        }
    });
}

/**
 * Render payables aging table
 */
function renderPayablesAgingTable(data) {
    const tbody = $('#payablesAgingBody');
    tbody.empty();
    
    if (data.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center">No payables aging data available</td></tr>');
        return;
    }
    
    data.forEach(item => {
        const total = (item.current || 0) + (item.days1to30 || 0) + (item.days31to60 || 0) + 
                   (item.days61to90 || 0) + (item.daysOver90 || 0);
        
        const row = `
            <tr>
                <td>${item.supplierName || 'Unknown'}</td>
                <td>${formatCurrency(item.current || 0)}</td>
                <td>${formatCurrency(item.days1to30 || 0)}</td>
                <td>${formatCurrency(item.days31to60 || 0)}</td>
                <td>${formatCurrency(item.days61to90 || 0)}</td>
                <td>${formatCurrency(item.daysOver90 || 0)}</td>
                <td><strong>${formatCurrency(total)}</strong></td>
            </tr>
        `;
        tbody.append(row);
    });
}

/**
 * Render receivables aging table
 */
function renderReceivablesAgingTable(data) {
    const tbody = $('#receivablesAgingBody');
    tbody.empty();
    
    if (data.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center">No receivables aging data available</td></tr>');
        return;
    }
    
    data.forEach(item => {
        const total = (item.current || 0) + (item.days1to30 || 0) + (item.days31to60 || 0) + 
                   (item.days61to90 || 0) + (item.daysOver90 || 0);
        
        const row = `
            <tr>
                <td>${item.customerName || 'Unknown'}</td>
                <td>${formatCurrency(item.current || 0)}</td>
                <td>${formatCurrency(item.days1to30 || 0)}</td>
                <td>${formatCurrency(item.days31to60 || 0)}</td>
                <td>${formatCurrency(item.days61to90 || 0)}</td>
                <td>${formatCurrency(item.daysOver90 || 0)}</td>
                <td><strong>${formatCurrency(total)}</strong></td>
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
    const alertClass = type === 'error' ? 'alert-danger' : type === 'success' ? 'alert-success' : 'alert-info';
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
window.loadPayablesAging = loadPayablesAging;
window.loadReceivablesAging = loadReceivablesAging;
window.formatCurrency = formatCurrency;
window.showNotification = showNotification;

// Add keyboard navigation for analytics modal
$(document).on('keydown', function(e) {
    if ($('#analyticsReportsModal').hasClass('in')) {
        // Handle keyboard shortcuts for analytics modal
        switch(e.which) {
            case 49: // 1 key
                $('a[href="#dashboardTab"]').tab('show');
                break;
            case 50: // 2 key
                $('a[href="#salesAnalyticsTab"]').tab('show');
                break;
            case 51: // 3 key
                $('a[href="#inventoryAnalyticsTab"]').tab('show');
                break;
            case 52: // 4 key
                $('a[href="#customerAnalyticsTab"]').tab('show');
                break;
            case 53: // 5 key
                $('a[href="#reportsTab"]').tab('show');
                break;
            case 27: // Escape key
                $('#analyticsReportsModal').modal('hide');
                break;
        }
    }
    
    if ($('#agingReportsModal').hasClass('in')) {
        // Handle keyboard shortcuts for aging modal
        switch(e.which) {
            case 49: // 1 key
                $('a[href="#payablesAging"]').tab('show');
                break;
            case 50: // 2 key
                $('a[href="#receivablesAging"]').tab('show');
                break;
            case 27: // Escape key
                $('#agingReportsModal').modal('hide');
                break;
        }
    }
});

// Add print functionality for reports
function printReport(reportId) {
    const reportContent = document.getElementById(reportId);
    if (!reportContent) {
        showNotification('Report content not found', 'error');
        return;
    }
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>PharmaSpot Report</title>
            <link href="assets/dist/css/bundle.min.css" rel="stylesheet" type="text/css" />
            <link href="assets/css/dashboard.css" rel="stylesheet" type="text/css" />
            <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .no-print { display: none; }
                @media print {
                    .page-break { page-break-before: always; }
                }
            </style>
        </head>
        <body>
            ${reportContent.innerHTML}
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
    
    showNotification('Report sent to printer', 'success');
}

// Export print function
window.printReport = printReport;

// Add export to CSV functionality
function exportToCSV(tableId, filename) {
    const table = document.getElementById(tableId);
    if (!table) {
        showNotification('Table not found', 'error');
        return;
    }
    
    let csv = [];
    const rows = table.querySelectorAll('tr');
    
    rows.forEach(row => {
        const rowData = [];
        const cells = row.querySelectorAll('td, th');
        
        cells.forEach(cell => {
            // Remove HTML tags and get text content
            const text = cell.textContent || cell.innerText || '';
            // Escape quotes and commas
            rowData.push('"' + text.replace(/"/g, '""') + '"');
        });
        
        csv.push(rowData.join(','));
    });
    
    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('Data exported to CSV', 'success');
}

// Export CSV function
window.exportToCSV = exportToCSV;

// Add data refresh functionality
function refreshAllAnalyticsData() {
    // Show loading state
    const tabs = ['#dashboardTab', '#salesAnalyticsTab', '#inventoryAnalyticsTab', '#customerAnalyticsTab'];
    
    tabs.forEach(tabId => {
        const tabContent = $(tabId);
        tabContent.find('.card-body').addClass('loading-overlay');
        tabContent.find('.card-body').append('<div class="loading-spinner"></div>');
    });
    
    // Refresh all data
    loadDashboardKPIs();
    loadSalesChart();
    loadTopProductsChart();
    loadRecentTransactions();
    loadSalesAnalytics();
    loadInventoryAnalytics();
    loadCustomerAnalytics();
    
    // Hide loading state after delay
    setTimeout(() => {
        tabs.forEach(tabId => {
            const tabContent = $(tabId);
            tabContent.find('.card-body').removeClass('loading-overlay');
            tabContent.find('.loading-spinner').remove();
        });
        showNotification('All analytics data refreshed', 'success');
    }, 2000);
}

// Export refresh function
window.refreshAllAnalyticsData = refreshAllAnalyticsData;

// Add real-time clock for dashboard
function updateDashboardClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const dateString = now.toLocaleDateString();
    
    // Update clock if element exists
    const clockElement = $('#dashboardClock');
    if (clockElement.length > 0) {
        clockElement.html(`<strong>${dateString}</strong><br>${timeString}`);
    }
}

// Update clock every second
setInterval(updateDashboardClock, 1000);

// Initialize clock when page loads
updateDashboardClock();