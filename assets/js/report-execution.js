/**
 * Report Execution JavaScript module for PharmaSpot
 * Handles report execution and results display functionality
 */

$(document).ready(function() {
    // Initialize report execution when execution modal is shown
    $('#reportExecutionModal').on('shown.bs.modal', function() {
        // Set default date range
        const today = new Date();
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
        $('#executionStartDate').val(lastMonth.toISOString().split('T')[0]);
        $('#executionEndDate').val(today.toISOString().split('T')[0]);
    });
    
    // Handle filter changes in execution modal
    $('#executionStartDate, #executionEndDate').on('change', function() {
        validateExecutionDates();
    });
    
    // Handle export format change
    $('#executionFormat').on('change', function() {
        const format = $(this).val();
        updateExportOptions(format);
    });
    
    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
});

/**
 * Execute report with provided parameters
 */
function executeReport(reportId) {
    // Show report execution modal
    $('#reportExecutionModal').modal('show');
    
    // Load report configuration
    $.ajax({
        url: `/api/custom-reports/reports/${reportId}`,
        method: 'GET',
        success: function(report) {
            // Set up execution form
            $('#executionReportName').text(report.name);
            $('#executionReportDescription').text(report.description);
            $('#executionReportId').val(reportId);
            
            // Show filter options based on report configuration
            setupExecutionFilters(report);
            
            // Set default date range
            const today = new Date();
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
            $('#executionStartDate').val(lastMonth.toISOString().split('T')[0]);
            $('#executionEndDate').val(today.toISOString().split('T')[0]);
        },
        error: function(xhr, status, error) {
            console.error('Error loading report:', error);
            showNotification('Error loading report configuration', 'error');
            $('#reportExecutionModal').modal('hide');
        }
    });
}

/**
 * Set up execution filters based on report configuration
 */
function setupExecutionFilters(report) {
    const filtersContainer = $('#executionFilters');
    filtersContainer.empty();
    
    if (!report.filters || Object.keys(report.filters).length === 0) {
        return;
    }
    
    let filterHtml = '<div class="row">';
    
    // Date range filter
    if (report.filters.dateRange) {
        filterHtml += `
            <div class="col-md-6">
                <div class="form-group">
                    <label for="executionStartDate">Start Date</label>
                    <input type="date" id="executionStartDate" class="form-control">
                </div>
            </div>
            <div class="col-md-6">
                <div class="form-group">
                    <label for="executionEndDate">End Date</label>
                    <input type="date" id="executionEndDate" class="form-control">
                </div>
            </div>
        `;
    }
    
    // Customer filter
    if (report.filters.customer) {
        filterHtml += `
            <div class="col-md-6">
                <div class="form-group">
                    <label for="executionCustomer">Customer</label>
                    <select id="executionCustomer" class="form-control">
                        <option value="">All Customers</option>
                    </select>
                </div>
            </div>
        `;
    }
    
    // Store filter
    if (report.filters.store) {
        filterHtml += `
            <div class="col-md-6">
                <div class="form-group">
                    <label for="executionStore">Store</label>
                    <select id="executionStore" class="form-control">
                        <option value="">All Stores</option>
                    </select>
                </div>
            </div>
        `;
    }
    
    // Category filter
    if (report.filters.category) {
        filterHtml += `
            <div class="col-md-6">
                <div class="form-group">
                    <label for="executionCategory">Category</label>
                    <select id="executionCategory" class="form-control">
                        <option value="">All Categories</option>
                    </select>
                </div>
            </div>
        `;
    }
    
    // Status filter
    if (report.filters.status) {
        filterHtml += `
            <div class="col-md-6">
                <div class="form-group">
                    <label for="executionStatus">Status</label>
                    <select id="executionStatus" class="form-control">
                        <option value="">All Statuses</option>
                        <option value="1">Paid</option>
                        <option value="0">Unpaid</option>
                    </select>
                </div>
            </div>
        `;
    }
    
    filterHtml += '</div>';
    filtersContainer.html(filterHtml);
    
    // Load filter options if needed
    if (report.filters.customer) {
        loadCustomerOptions();
    }
    if (report.filters.store) {
        loadStoreOptions();
    }
    if (report.filters.category) {
        loadCategoryOptions();
    }
}

/**
 * Load customer options for filter
 */
function loadCustomerOptions() {
    $.ajax({
        url: '/api/customers',
        method: 'GET',
        success: function(response) {
            const customerSelect = $('#executionCustomer');
            response.customers.forEach(customer => {
                customerSelect.append(`<option value="${customer._id}">${customer.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading customers:', error);
        }
    });
}

/**
 * Load store options for filter
 */
function loadStoreOptions() {
    $.ajax({
        url: '/api/stores',
        method: 'GET',
        success: function(response) {
            const storeSelect = $('#executionStore');
            response.stores.forEach(store => {
                storeSelect.append(`<option value="${store._id}">${store.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading stores:', error);
        }
    });
}

/**
 * Load category options for filter
 */
function loadCategoryOptions() {
    $.ajax({
        url: '/api/categories',
        method: 'GET',
        success: function(response) {
            const categorySelect = $('#executionCategory');
            response.categories.forEach(category => {
                categorySelect.append(`<option value="${category._id}">${category.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading categories:', error);
        }
    });
}

/**
 * Validate execution dates
 */
function validateExecutionDates() {
    const startDate = $('#executionStartDate').val();
    const endDate = $('#executionEndDate').val();
    
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        showNotification('Start date cannot be after end date', 'error');
        $('#executeReportBtn').prop('disabled', true);
    } else {
        $('#executeReportBtn').prop('disabled', false);
    }
}

/**
 * Run report execution
 */
function runReportExecution() {
    const reportId = $('#executionReportId').val();
    const startDate = $('#executionStartDate').val();
    const endDate = $('#executionEndDate').val();
    const page = $('#executionPage').val() || 1;
    const limit = $('#executionLimit').val() || 50;
    const exportFormat = $('#executionFormat').val() || 'json';
    
    // Build filters object
    const filters = {};
    if (startDate && endDate) {
        filters.dateRange = { start: startDate, end: endDate };
    }
    if ($('#executionCustomer').val()) {
        filters.customer = $('#executionCustomer').val();
    }
    if ($('#executionStore').val()) {
        filters.storeId = $('#executionStore').val();
    }
    if ($('#executionCategory').val()) {
        filters.category = $('#executionCategory').val();
    }
    if ($('#executionStatus').val() !== undefined && $('#executionStatus').val() !== '') {
        filters.status = $('#executionStatus').val();
    }
    
    const executeBtn = $('#executeReportBtn');
    const originalText = executeBtn.html();
    executeBtn.html('<i class="fa fa-spinner fa-spin"></i> Executing...').prop('disabled', true);
    
    $.ajax({
        url: '/api/report-execution/execute',
        method: 'POST',
        data: JSON.stringify({
            reportId: reportId,
            reportConfig: { /* Report config would be loaded from report */ },
            filters: filters,
            page: page,
            limit: limit,
            exportFormat: exportFormat
        }),
        contentType: 'application/json',
        success: function(response) {
            displayReportResults(response);
            $('#reportExecutionModal').modal('hide');
            $('#reportResultsModal').modal('show');
            executeBtn.html(originalText).prop('disabled', false);
        },
        error: function(xhr, status, error) {
            console.error('Error executing report:', error);
            showNotification('Error executing report: ' + (xhr.responseJSON?.message || error), 'error');
            executeBtn.html(originalText).prop('disabled', false);
        }
    });
}

/**
 * Display report results
 */
function displayReportResults(response) {
    // Store result for export
    window.currentReportResult = response.result;
    
    // Set report info in modal
    $('#resultsReportName').text(response.result.name || 'Custom Report');
    $('#resultsReportDescription').text(response.result.description || '');
    $('#executionTime').text(response.result.executionTime || 'N/A');
    $('#recordCount').text(response.result.totalRecords || response.result.data?.length || 0);
    $('#executionDate').text(new Date().toLocaleString());
    
    // Show appropriate view based on report type
    const reportType = response.result.type || 'tabular';
    
    // Hide all views first
    $('#tabularResults').hide();
    $('#chartResults').hide();
    $('#summaryResults').hide();
    
    switch (reportType) {
        case 'tabular':
            displayTabularResults(response.result.data);
            break;
        case 'chart':
            displayChartResults(response.result.data);
            break;
        case 'summary':
            displaySummaryResults(response.result);
            break;
        default:
            displayTabularResults(response.result.data);
    }
}

/**
 * Display tabular results
 */
function displayTabularResults(data) {
    if (!data || data.length === 0) {
        $('#resultsTableBody').html('<tr><td colspan="100%" class="text-center text-muted">No data found for the selected criteria.</td></tr>');
        $('#tabularResults').show();
        return;
    }
    
    // Build table headers
    const fields = Object.keys(data[0]);
    let headerHtml = '';
    fields.forEach(field => {
        headerHtml += `<th>${field}</th>`;
    });
    $('#resultsTableHeader').html(headerHtml);
    
    // Build table rows
    let bodyHtml = '';
    data.forEach(row => {
        bodyHtml += '<tr>';
        fields.forEach(field => {
            let value = row[field];
            if (value === null || value === undefined) {
                value = '';
            } else if (typeof value === 'number') {
                value = value.toLocaleString();
            }
            bodyHtml += `<td>${value}</td>`;
        });
        bodyHtml += '</tr>';
    });
    $('#resultsTableBody').html(bodyHtml);
    
    $('#tabularResults').show();
}

/**
 * Display chart results
 */
function displayChartResults(data) {
    if (!data || data.length === 0) {
        $('#chartResults').hide();
        $('#tabularResults').show();
        displayTabularResults(data);
        return;
    }
    
    // Default to bar chart
    const chartType = $('#chartTypeSelector').val() || 'bar';
    renderChart(data, chartType);
    $('#chartResults').show();
}

/**
 * Display summary results
 */
function displaySummaryResults(result) {
    if (!result.summary) {
        $('#summaryResults').hide();
        $('#tabularResults').show();
        displayTabularResults(result.data || []);
        return;
    }
    
    let summaryHtml = '<div class="row">';
    Object.keys(result.summary).forEach(key => {
        const value = result.summary[key];
        summaryHtml += `
            <div class="col-md-3">
                <div class="card">
                    <div class="card-body">
                        <h6 class="card-title">${key}</h6>
                        <p class="card-text">${typeof value === 'number' ? value.toLocaleString() : value}</p>
                    </div>
                </div>
            </div>
        `;
    });
    summaryHtml += '</div>';
    
    // Also show detailed data if available
    if (result.data && result.data.length > 0) {
        summaryHtml += `
            <div class="row mt-4">
                <div class="col-md-12">
                    <h5>Detailed Breakdown</h5>
                    <div class="table-responsive">
                        <table class="table table-striped">
                            <thead>
                                <tr>
        `;
        
        const fields = Object.keys(result.data[0]);
        fields.forEach(field => {
            summaryHtml += `<th>${field}</th>`;
        });
        
        summaryHtml += `
                                </tr>
                            </thead>
                            <tbody>
        `;
        
        result.data.forEach(row => {
            summaryHtml += '<tr>';
            fields.forEach(field => {
                summaryHtml += `<td>${row[field] || ''}</td>`;
            });
            summaryHtml += '</tr>';
        });
        
        summaryHtml += `
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
    }
    
    $('#summaryContent').html(summaryHtml);
    $('#summaryResults').show();
}

/**
 * Update export options based on format
 */
function updateExportOptions(format) {
    // This could be used to show/hide format-specific options
    console.log('Export format changed to:', format);
}

/**
 * Refresh report results
 */
function refreshReportResults() {
    const reportId = $('#executionReportId').val();
    if (reportId) {
        runReportExecution();
    }
}

/**
 * Export functions for global use
 */
window.executeReport = executeReport;
window.runReportExecution = runReportExecution;
window.displayReportResults = displayReportResults;
window.refreshReportResults = refreshReportResults;