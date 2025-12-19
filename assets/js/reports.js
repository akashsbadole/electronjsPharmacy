/**
 * Reports JavaScript module for PharmaSpot
 * Handles report generation, viewing, and downloading
 */

$(document).ready(function() {
    // Initialize reports when reports tab is shown
    $('a[href="#reportsTab"]').on('shown.bs.tab', function() {
        loadStoresForReports();
    });
    
    // Handle report type change
    $('#reportType').on('change', function() {
        updateReportFormFields();
    });
    
    // Handle date range changes
    $('#reportStartDate, #reportEndDate').on('change', function() {
        validateDateRange();
    });
});

/**
 * Load stores for report selection
 */
function loadStoresForReports() {
    $.ajax({
        url: '/api/stores',
        method: 'GET',
        success: function(stores) {
            const storeSelect = $('#reportStore');
            storeSelect.empty();
            storeSelect.append('<option value="">All Stores</option>');
            
            stores.forEach(store => {
                storeSelect.append(`<option value="${store._id}">${store.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading stores:', error);
        }
    });
}

/**
 * Update report form fields based on report type
 */
function updateReportFormFields() {
    const reportType = $('#reportType').val();
    const startDateField = $('#reportStartDate');
    const endDateField = $('#reportEndDate');
    
    // Show/hide date fields based on report type
    if (reportType === 'inventory') {
        startDateField.parent().parent().hide();
        endDateField.parent().parent().hide();
    } else {
        startDateField.parent().parent().show();
        endDateField.parent().parent().show();
    }
    
    // Set default date range for other reports
    if (reportType !== 'inventory') {
        const today = new Date();
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        
        startDateField.val(lastMonth.toISOString().split('T')[0]);
        endDateField.val(today.toISOString().split('T')[0]);
    }
}

/**
 * Validate date range
 */
function validateDateRange() {
    const startDate = new Date($('#reportStartDate').val());
    const endDate = new Date($('#reportEndDate').val());
    
    if (startDate && endDate && startDate > endDate) {
        showNotification('Start date cannot be after end date', 'error');
        $('#reportEndDate').val('');
    }
}

/**
 * Generate report
 */
function generateReport() {
    const reportType = $('#reportType').val();
    const storeId = $('#reportStore').val();
    const startDate = $('#reportStartDate').val();
    const endDate = $('#reportEndDate').val();
    
    // Validate required fields
    if (reportType !== 'inventory' && (!startDate || !endDate)) {
        showNotification('Please select start and end dates', 'error');
        return;
    }
    
    // Show loading state
    const generateBtn = $('button[onclick="generateReport()"]');
    const originalText = generateBtn.text();
    generateBtn.html('<i class="fa fa-spinner fa-spin"></i> Generating...').prop('disabled', true);
    
    // Determine API endpoint based on report type
    let apiUrl = '/api/reports/';
    let requestData = { storeId, reportType };
    
    switch (reportType) {
        case 'sales':
            apiUrl += 'sales';
            requestData.startDate = startDate;
            requestData.endDate = endDate;
            break;
        case 'inventory':
            apiUrl += 'inventory';
            break;
        case 'customers':
            apiUrl += 'customers';
            requestData.startDate = startDate;
            requestData.endDate = endDate;
            break;
        case 'financial':
            apiUrl += 'financial';
            requestData.startDate = startDate;
            requestData.endDate = endDate;
            break;
        default:
            showNotification('Invalid report type', 'error');
            generateBtn.text(originalText).prop('disabled', false);
            return;
    }
    
    $.ajax({
        url: apiUrl,
        method: 'POST',
        data: JSON.stringify(requestData),
        contentType: 'application/json',
        success: function(response) {
            displayReportResults(response);
            $('#downloadReportBtn').show();
            generateBtn.text(originalText).prop('disabled', false);
        },
        error: function(xhr, status, error) {
            console.error('Error generating report:', error);
            showNotification('Error generating report: ' + (xhr.responseJSON?.message || error), 'error');
            generateBtn.text(originalText).prop('disabled', false);
        }
    });
}

/**
 * Display report results
 */
function displayReportResults(reportData) {
    const reportResults = $('#reportResults');
    const reportContent = $('#reportContent');
    
    reportResults.show();
    
    // Generate report HTML based on report type
    let reportHtml = '';
    
    switch (reportData.reportType) {
        case 'Sales Report':
            reportHtml = generateSalesReportHtml(reportData);
            break;
        case 'Inventory Report':
            reportHtml = generateInventoryReportHtml(reportData);
            break;
        case 'Customer Report':
            reportHtml = generateCustomerReportHtml(reportData);
            break;
        case 'Financial Report (Profit & Loss)':
            reportHtml = generateFinancialReportHtml(reportData);
            break;
        default:
            reportHtml = '<p>Unknown report type</p>';
    }
    
    reportContent.html(reportHtml);
    
    // Store report data for download
    window.currentReportData = reportData;
}

/**
 * Generate sales report HTML
 */
function generateSalesReportHtml(reportData) {
    const summary = reportData.summary;
    
    return `
        <div class="report-header">
            <h3>${reportData.reportType}</h3>
            <p>Period: ${reportData.period}</p>
            <p>Generated: ${new Date(reportData.generatedAt).toLocaleString()}</p>
        </div>
        
        <div class="report-summary">
            <h4>Summary</h4>
            <div class="row">
                <div class="col-md-3">
                    <strong>Total Sales:</strong> ${formatCurrency(summary.totalSales)}
                </div>
                <div class="col-md-3">
                    <strong>Total Transactions:</strong> ${summary.totalTransactions}
                </div>
                <div class="col-md-3">
                    <strong>Total Items:</strong> ${summary.totalItems}
                </div>
                <div class="col-md-3">
                    <strong>Avg Transaction:</strong> ${formatCurrency(summary.averageTransactionValue)}
                </div>
            </div>
        </div>
        
        <div class="report-details">
            <h4>Payment Methods</h4>
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>Payment Method</th>
                            <th>Amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(reportData.paymentMethods).map(([method, amount]) => 
                            `<tr><td>${method}</td><td>${formatCurrency(amount)}</td></tr>`
                        ).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <div class="report-details">
            <h4>Top Products</h4>
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Quantity Sold</th>
                            <th>Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportData.topProducts.slice(0, 10).map(product => 
                            `<tr>
                                <td>${product.name}</td>
                                <td>${product.quantity}</td>
                                <td>${formatCurrency(product.revenue)}</td>
                            </tr>`
                        ).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Generate inventory report HTML
 */
function generateInventoryReportHtml(reportData) {
    const summary = reportData.summary;
    
    return `
        <div class="report-header">
            <h3>${reportData.reportType}</h3>
            <p>Store: ${reportData.storeId}</p>
            <p>Generated: ${new Date(reportData.generatedAt).toLocaleString()}</p>
        </div>
        
        <div class="report-summary">
            <h4>Summary</h4>
            <div class="row">
                <div class="col-md-3">
                    <strong>Total Products:</strong> ${summary.totalProducts}
                </div>
                <div class="col-md-3">
                    <strong>Total Stock Value:</strong> ${formatCurrency(summary.totalStockValue)}
                </div>
                <div class="col-md-3">
                    <strong>Low Stock Items:</strong> ${summary.lowStockItems}
                </div>
                <div class="col-md-3">
                    <strong>Out of Stock Items:</strong> ${summary.outOfStockItems}
                </div>
            </div>
        </div>
        
        ${summary.expiredItems.length > 0 ? `
        <div class="report-details">
            <h4>Expired Items</h4>
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Batch</th>
                            <th>Expiry Date</th>
                            <th>Quantity</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportData.expiredItems.map(item => 
                            `<tr>
                                <td>${item.productName}</td>
                                <td>${item.batchNumber}</td>
                                <td>${new Date(item.expiryDate).toLocaleDateString()}</td>
                                <td>${item.batchQuantity}</td>
                            </tr>`
                        ).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
        
        ${summary.expiringSoonItems.length > 0 ? `
        <div class="report-details">
            <h4>Items Expiring Soon (30 days)</h4>
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>Product</th>
                            <th>Batch</th>
                            <th>Expiry Date</th>
                            <th>Quantity</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportData.expiringSoonItems.map(item => 
                            `<tr>
                                <td>${item.productName}</td>
                                <td>${item.batchNumber}</td>
                                <td>${new Date(item.expiryDate).toLocaleDateString()}</td>
                                <td>${item.batchQuantity}</td>
                            </tr>`
                        ).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
    `;
}

/**
 * Generate customer report HTML
 */
function generateCustomerReportHtml(reportData) {
    const summary = reportData.summary;
    
    return `
        <div class="report-header">
            <h3>${reportData.reportType}</h3>
            <p>Period: ${reportData.period}</p>
            <p>Generated: ${new Date(reportData.generatedAt).toLocaleString()}</p>
        </div>
        
        <div class="report-summary">
            <h4>Summary</h4>
            <div class="row">
                <div class="col-md-3">
                    <strong>Total Customers:</strong> ${summary.totalCustomers}
                </div>
                <div class="col-md-3">
                    <strong>New Customers:</strong> ${summary.newCustomers}
                </div>
                <div class="col-md-3">
                    <strong>Returning Customers:</strong> ${summary.returningCustomers}
                </div>
                <div class="col-md-3">
                    <strong>Avg Transaction:</strong> ${formatCurrency(summary.averageTransactionValue)}
                </div>
            </div>
        </div>
        
        <div class="report-details">
            <h4>Top Customers</h4>
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Transactions</th>
                            <th>Total Spent</th>
                            <th>Avg Transaction</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportData.topCustomers.slice(0, 10).map(customer => 
                            `<tr>
                                <td>${customer.customerId}</td>
                                <td>${customer.transactionCount}</td>
                                <td>${formatCurrency(customer.totalSpent)}</td>
                                <td>${formatCurrency(customer.averageTransactionValue)}</td>
                            </tr>`
                        ).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Generate financial report HTML
 */
function generateFinancialReportHtml(reportData) {
    return `
        <div class="report-header">
            <h3>${reportData.reportType}</h3>
            <p>Period: ${reportData.period}</p>
            <p>Generated: ${new Date(reportData.generatedAt).toLocaleString()}</p>
        </div>
        
        <div class="report-summary">
            <h4>Financial Summary</h4>
            <div class="row">
                <div class="col-md-3">
                    <strong>Total Sales:</strong> ${formatCurrency(reportData.revenue.totalSales)}
                </div>
                <div class="col-md-3">
                    <strong>Net Revenue:</strong> ${formatCurrency(reportData.revenue.netRevenue)}
                </div>
                <div class="col-md-3">
                    <strong>Gross Profit:</strong> ${formatCurrency(reportData.grossProfit)}
                </div>
                <div class="col-md-3">
                    <strong>Net Profit:</strong> ${formatCurrency(reportData.netProfit)}
                </div>
            </div>
            <div class="row">
                <div class="col-md-3">
                    <strong>Profit Margin:</strong> ${reportData.profitMargin.toFixed(2)}%
                </div>
            </div>
        </div>
        
        <div class="report-details">
            <h4>Cost of Goods Sold by Category</h4>
            <div class="table-responsive">
                <table class="table table-striped">
                    <thead>
                        <tr>
                            <th>Category</th>
                            <th>Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.entries(reportData.costOfGoodsSold.byCategory).map(([category, cost]) => 
                            `<tr><td>${category}</td><td>${formatCurrency(cost)}</td></tr>`
                        ).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

/**
 * Download current report
 */
function downloadReport() {
    if (!window.currentReportData) {
        showNotification('No report data available for download', 'error');
        return;
    }
    
    const reportData = window.currentReportData;
    const reportType = reportData.reportType.replace(/\s+/g, '_').toLowerCase();
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${reportType}_report_${timestamp}.json`;
    
    // Create and download JSON file
    const dataStr = JSON.stringify(reportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    showNotification('Report downloaded successfully', 'success');
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
window.generateReport = generateReport;
window.downloadReport = downloadReport;
window.formatCurrency = formatCurrency;
window.showNotification = showNotification;