$(document).ready(function() {
    // Initialize date pickers
    $('.datepicker').datepicker({
        format: 'dd/mm/yyyy',
        autoclose: true,
        todayHighlight: true
    });

    // Initialize
    loadStores();
    loadScheduledReports();
    loadRecentReports();
    initializeCharts();
    updateCharts();
    
    // Event handlers
    $('#reportType').change(updateAdditionalFilters);
    $('#dateRange').change(handleDateRangeChange);
    $('#generateReportBtn').click(generateReport);
    $('#resetFiltersBtn').click(resetFilters);
    $('#scheduleReportBtn').click(showScheduleModal);
    $('#saveScheduleBtn').click(saveSchedule);
    
    // Auto-refresh recent reports every 60 seconds
    setInterval(loadRecentReports, 60000);
});

let accuracyTrendChart = null;
let varianceDistributionChart = null;

function loadStores() {
    $.ajax({
        url: '/api/stores/all',
        method: 'GET',
        success: function(stores) {
            const storeSelect = $('#storeFilter');
            
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

function loadScheduledReports() {
    $.ajax({
        url: '/api/reports/scheduled',
        method: 'GET',
        success: function(reports) {
            displayScheduledReports(reports);
        },
        error: function(xhr, status, error) {
            console.error('Error loading scheduled reports:', error);
            $('#scheduledReportsList').html(`
                <tr>
                    <td colspan="6" class="text-center text-danger">
                        Error loading scheduled reports
                    </td>
                </tr>
            `);
        }
    });
}

function displayScheduledReports(reports) {
    const tbody = $('#scheduledReportsList');
    tbody.empty();
    
    if (reports.length === 0) {
        tbody.html(`
            <tr>
                <td colspan="6" class="text-center text-muted">
                    No scheduled reports found
                </td>
            </tr>
        `);
        return;
    }
    
    reports.forEach(report => {
        const statusBadge = report.isActive ? 
            '<span class="label label-success">Active</span>' : 
            '<span class="label label-default">Inactive</span>';
        
        const row = `
            <tr>
                <td>
                    <div>
                        <strong>${report.name}</strong>
                        <br>
                        <small class="text-muted">ID: ${report._id}</small>
                    </div>
                </td>
                <td>${getReportTypeLabel(report.reportType)}</td>
                <td>${getFrequencyLabel(report.frequency)}</td>
                <td>
                    <div>
                        ${report.recipients.slice(0, 2).join(', ')}
                        ${report.recipients.length > 2 ? `<br><small class="text-muted">+${report.recipients.length - 2} more</small>` : ''}
                    </div>
                </td>
                <td>${report.lastGenerated ? formatDate(report.lastGenerated) : 'Never'}</td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-info" onclick="editScheduledReport('${report._id}')" title="Edit">
                            <i class="fa fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-success" onclick="runScheduledReport('${report._id}')" title="Run Now">
                            <i class="md md-play-arrow"></i>
                        </button>
                        <button class="btn btn-sm btn-${report.isActive ? 'warning' : 'success'}" 
                                onclick="toggleScheduledReport('${report._id}')" 
                                title="${report.isActive ? 'Deactivate' : 'Activate'}">
                            <i class="md md-${report.isActive ? 'pause' : 'play-arrow'}"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteScheduledReport('${report._id}')" title="Delete">
                            <i class="fa fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function loadRecentReports() {
    $.ajax({
        url: '/api/reports/recent',
        method: 'GET',
        data: { limit: 10 },
        success: function(reports) {
            displayRecentReports(reports);
        },
        error: function(xhr, status, error) {
            console.error('Error loading recent reports:', error);
            $('#recentReportsList').html(`
                <tr>
                    <td colspan="7" class="text-center text-danger">
                        Error loading recent reports
                    </td>
                </tr>
            `);
        }
    });
}

function displayRecentReports(reports) {
    const tbody = $('#recentReportsList');
    tbody.empty();
    
    if (reports.length === 0) {
        tbody.html(`
            <tr>
                <td colspan="7" class="text-center text-muted">
                    No recent reports found
                </td>
            </tr>
        `);
        return;
    }
    
    reports.forEach(report => {
        const statusBadge = getStatusBadge(report.status);
        
        const row = `
            <tr>
                <td>
                    <div>
                        <strong>${report.name}</strong>
                        <br>
                        <small class="text-muted">${report.parameters ? JSON.stringify(report.parameters) : ''}</small>
                    </div>
                </td>
                <td>${getReportTypeLabel(report.reportType)}</td>
                <td>${report.generatedByName || 'System'}</td>
                <td>${formatDateTime(report.generatedAt)}</td>
                <td>
                    <span class="label label-default">${report.format.toUpperCase()}</span>
                </td>
                <td>${statusBadge}</td>
                <td>
                    <div class="btn-group">
                        ${report.status === 'COMPLETED' ? 
                            `<button class="btn btn-sm btn-success" onclick="downloadReport('${report._id}')" title="Download">
                                <i class="md md-file-download"></i>
                            </button>` : ''
                        }
                        <button class="btn btn-sm btn-info" onclick="viewReportDetails('${report._id}')" title="View Details">
                            <i class="fa fa-eye"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteReport('${report._id}')" title="Delete">
                            <i class="fa fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function updateAdditionalFilters() {
    const reportType = $('#reportType').val();
    const additionalFilters = $('#additionalFilters');
    const filterOptions = $('#filterOptions');
    
    if (!reportType) {
        additionalFilters.hide();
        return;
    }
    
    additionalFilters.show();
    filterOptions.empty();
    
    switch (reportType) {
        case 'variance-analysis':
            filterOptions.html(`
                <div class="row">
                    <div class="col-md-3">
                        <label>Variance Type</label>
                        <select class="form-control" id="varianceTypeFilter">
                            <option value="">All Types</option>
                            <option value="SURPLUS">Surplus</option>
                            <option value="SHORTAGE">Shortage</option>
                            <option value="EXPIRED">Expired</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label>Min Value</label>
                        <input type="number" class="form-control" id="minValueFilter" placeholder="0">
                    </div>
                    <div class="col-md-3">
                        <label>Max Value</label>
                        <input type="number" class="form-control" id="maxValueFilter" placeholder="10000">
                    </div>
                    <div class="col-md-3">
                        <label>Include Approved</label>
                        <select class="form-control" id="includeApprovedFilter">
                            <option value="all">All</option>
                            <option value="approved">Approved Only</option>
                            <option value="pending">Pending Only</option>
                        </select>
                    </div>
                </div>
            `);
            break;
            
        case 'counter-performance':
            filterOptions.html(`
                <div class="row">
                    <div class="col-md-4">
                        <label>Counter</label>
                        <select class="form-control" id="counterFilter">
                            <option value="">All Counters</option>
                        </select>
                    </div>
                    <div class="col-md-4">
                        <label>Min Accuracy %</label>
                        <input type="number" class="form-control" id="minAccuracyFilter" placeholder="0" min="0" max="100">
                    </div>
                    <div class="col-md-4">
                        <label>Include Inactive</label>
                        <select class="form-control" id="includeInactiveFilter">
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                        </select>
                    </div>
                </div>
            `);
            loadCounters();
            break;
            
        case 'expiry-analysis':
            filterOptions.html(`
                <div class="row">
                    <div class="col-md-3">
                        <label>Expiry Period</label>
                        <select class="form-control" id="expiryPeriodFilter">
                            <option value="30">Next 30 days</option>
                            <option value="60">Next 60 days</option>
                            <option value="90">Next 90 days</option>
                            <option value="180">Next 180 days</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label>Category</label>
                        <select class="form-control" id="categoryFilter">
                            <option value="">All Categories</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label>Include Expired</label>
                        <select class="form-control" id="includeExpiredFilter">
                            <option value="no">No</option>
                            <option value="yes">Yes</option>
                        </select>
                    </div>
                    <div class="col-md-3">
                        <label>Value Range</label>
                        <select class="form-control" id="valueRangeFilter">
                            <option value="">All Values</option>
                            <option value="low">Low (< ₹100)</option>
                            <option value="medium">Medium (₹100-1000)</option>
                            <option value="high">High (> ₹1000)</option>
                        </select>
                    </div>
                </div>
            `);
            loadCategories();
            break;
            
        default:
            filterOptions.html(`
                <div class="row">
                    <div class="col-md-12">
                        <p class="text-muted">No additional filters available for this report type.</p>
                    </div>
                </div>
            `);
    }
}

function handleDateRangeChange() {
    const dateRange = $('#dateRange').val();
    const customDateRange = $('#customDateRange');
    
    if (dateRange === 'custom') {
        customDateRange.show();
    } else {
        customDateRange.hide();
    }
}

function generateReport() {
    const reportType = $('#reportType').val();
    const dateRange = $('#dateRange').val();
    const storeId = $('#storeFilter').val();
    const format = $('#format').val();
    
    if (!reportType) {
        showError('Please select a report type.');
        return;
    }
    
    if (!dateRange) {
        showError('Please select a date range.');
        return;
    }
    
    // Build report parameters
    const parameters = {
        reportType: reportType,
        dateRange: dateRange,
        storeId: storeId,
        format: format
    };
    
    // Add custom date range if selected
    if (dateRange === 'custom') {
        const startDate = $('#startDate').val();
        const endDate = $('#endDate').val();
        
        if (!startDate || !endDate) {
            showError('Please select both start and end dates for custom range.');
            return;
        }
        
        parameters.startDate = startDate;
        parameters.endDate = endDate;
    }
    
    // Add additional filters based on report type
    addAdditionalFilters(parameters);
    
    // Generate report
    $.ajax({
        url: '/api/reports/generate',
        method: 'POST',
        data: parameters,
        success: function(response) {
            showSuccess('Report generation started! You will be notified when it\'s ready.');
            loadRecentReports();
        },
        error: function(xhr, status, error) {
            console.error('Error generating report:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to generate report.');
        }
    });
}

function addAdditionalFilters(parameters) {
    const reportType = $('#reportType').val();
    
    switch (reportType) {
        case 'variance-analysis':
            const varianceType = $('#varianceTypeFilter').val();
            const minValue = $('#minValueFilter').val();
            const maxValue = $('#maxValueFilter').val();
            const includeApproved = $('#includeApprovedFilter').val();
            
            if (varianceType) parameters.varianceType = varianceType;
            if (minValue) parameters.minValue = minValue;
            if (maxValue) parameters.maxValue = maxValue;
            if (includeApproved && includeApproved !== 'all') parameters.includeApproved = includeApproved;
            break;
            
        case 'counter-performance':
            const counter = $('#counterFilter').val();
            const minAccuracy = $('#minAccuracyFilter').val();
            const includeInactive = $('#includeInactiveFilter').val();
            
            if (counter) parameters.counterId = counter;
            if (minAccuracy) parameters.minAccuracy = minAccuracy;
            if (includeInactive === 'yes') parameters.includeInactive = true;
            break;
            
        case 'expiry-analysis':
            const expiryPeriod = $('#expiryPeriodFilter').val();
            const category = $('#categoryFilter').val();
            const includeExpired = $('#includeExpiredFilter').val();
            const valueRange = $('#valueRangeFilter').val();
            
            if (expiryPeriod) parameters.expiryPeriod = expiryPeriod;
            if (category) parameters.categoryId = category;
            if (includeExpired === 'yes') parameters.includeExpired = true;
            if (valueRange) parameters.valueRange = valueRange;
            break;
    }
}

function resetFilters() {
    $('#reportType, #dateRange, #storeFilter, #format').val('');
    $('#additionalFilters').hide();
    $('#customDateRange').hide();
    $('#startDate, #endDate').val('');
}

function showScheduleModal() {
    $('#scheduleReportModal').modal('show');
}

function saveSchedule() {
    const name = $('#scheduleReportName').val();
    const reportType = $('#scheduleReportType').val();
    const frequency = $('#scheduleFrequency').val();
    const format = $('#scheduleFormat').val();
    const recipients = $('#scheduleRecipients').val();
    const filters = $('#scheduleFilters').val();
    
    if (!name || !reportType || !frequency || !recipients) {
        showError('Please fill in all required fields.');
        return;
    }
    
    const schedule = {
        name: name,
        reportType: reportType,
        frequency: frequency,
        format: format,
        recipients: recipients.split(',').map(r => r.trim()),
        filters: filters ? JSON.parse(filters) : {}
    };
    
    $.ajax({
        url: '/api/reports/schedule',
        method: 'POST',
        data: schedule,
        success: function(response) {
            showSuccess('Report scheduled successfully!');
            $('#scheduleReportModal').modal('hide');
            resetScheduleForm();
            loadScheduledReports();
        },
        error: function(xhr, status, error) {
            console.error('Error scheduling report:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to schedule report.');
        }
    });
}

function resetScheduleForm() {
    $('#scheduleReportName, #scheduleReportType, #scheduleRecipients, #scheduleFilters').val('');
    $('#scheduleFrequency, #scheduleFormat').prop('selectedIndex', 0);
}

function downloadReport(reportId) {
    window.open(`/api/reports/${reportId}/download`, '_blank');
}

function viewReportDetails(reportId) {
    // Implementation for viewing report details
    console.log('View report details:', reportId);
}

function deleteReport(reportId) {
    if (!confirm('Are you sure you want to delete this report?')) {
        return;
    }
    
    $.ajax({
        url: `/api/reports/${reportId}`,
        method: 'DELETE',
        success: function(response) {
            showSuccess('Report deleted successfully!');
            loadRecentReports();
        },
        error: function(xhr, status, error) {
            console.error('Error deleting report:', error);
            showError('Failed to delete report.');
        }
    });
}

function editScheduledReport(reportId) {
    // Implementation for editing scheduled report
    console.log('Edit scheduled report:', reportId);
}

function runScheduledReport(reportId) {
    if (!confirm('Are you sure you want to run this scheduled report now?')) {
        return;
    }
    
    $.ajax({
        url: `/api/reports/scheduled/${reportId}/run`,
        method: 'POST',
        success: function(response) {
            showSuccess('Report execution started!');
            loadRecentReports();
        },
        error: function(xhr, status, error) {
            console.error('Error running scheduled report:', error);
            showError('Failed to run scheduled report.');
        }
    });
}

function toggleScheduledReport(reportId) {
    $.ajax({
        url: `/api/reports/scheduled/${reportId}/toggle`,
        method: 'PUT',
        success: function(response) {
            showSuccess(`Report ${response.isActive ? 'activated' : 'deactivated'} successfully!`);
            loadScheduledReports();
        },
        error: function(xhr, status, error) {
            console.error('Error toggling scheduled report:', error);
            showError('Failed to toggle scheduled report.');
        }
    });
}

function deleteScheduledReport(reportId) {
    if (!confirm('Are you sure you want to delete this scheduled report?')) {
        return;
    }
    
    $.ajax({
        url: `/api/reports/scheduled/${reportId}`,
        method: 'DELETE',
        success: function(response) {
            showSuccess('Scheduled report deleted successfully!');
            loadScheduledReports();
        },
        error: function(xhr, status, error) {
            console.error('Error deleting scheduled report:', error);
            showError('Failed to delete scheduled report.');
        }
    });
}

function loadCounters() {
    $.ajax({
        url: '/api/users/counters',
        method: 'GET',
        success: function(counters) {
            const counterSelect = $('#counterFilter');
            
            counters.forEach(counter => {
                counterSelect.append(`<option value="${counter._id}">${counter.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading counters:', error);
        }
    });
}

function loadCategories() {
    $.ajax({
        url: '/api/categories',
        method: 'GET',
        success: function(categories) {
            const categorySelect = $('#categoryFilter');
            
            categories.forEach(category => {
                categorySelect.append(`<option value="${category._id}">${category.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading categories:', error);
        }
    });
}

function initializeCharts() {
    // Accuracy Trend Chart
    const accuracyCtx = document.getElementById('accuracyTrendChart');
    if (accuracyCtx) {
        accuracyTrendChart = new Chart(accuracyCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Accuracy %',
                    data: [],
                    borderColor: '#5fbeaa',
                    backgroundColor: 'rgba(95, 190, 170, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: false,
                        min: 80,
                        max: 100
                    }
                }
            }
        });
    }
    
    // Variance Distribution Chart
    const varianceCtx = document.getElementById('varianceDistributionChart');
    if (varianceCtx) {
        varianceDistributionChart = new Chart(varianceCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: [],
                datasets: [{
                    data: [],
                    backgroundColor: [
                        '#5d9cec',
                        '#5fbeaa',
                        '#ffcc00',
                        '#f05050'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }
}

function updateCharts() {
    updateAccuracyTrendChart();
    updateVarianceDistributionChart();
}

function updateAccuracyTrendChart() {
    $.ajax({
        url: '/api/reports/analytics/accuracy-trend',
        method: 'GET',
        data: { period: 'month' },
        success: function(data) {
            if (accuracyTrendChart) {
                accuracyTrendChart.data.labels = data.labels;
                accuracyTrendChart.data.datasets[0].data = data.data;
                accuracyTrendChart.update();
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading accuracy trend:', error);
        }
    });
}

function updateVarianceDistributionChart() {
    $.ajax({
        url: '/api/reports/analytics/variance-distribution',
        method: 'GET',
        data: { period: 'month' },
        success: function(data) {
            if (varianceDistributionChart) {
                varianceDistributionChart.data.labels = data.labels;
                varianceDistributionChart.data.datasets[0].data = data.data;
                varianceDistributionChart.update();
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading variance distribution:', error);
        }
    });
}

// Utility functions
function getReportTypeLabel(type) {
    const labels = {
        'count-summary': 'Count Summary',
        'variance-analysis': 'Variance Analysis',
        'accuracy-report': 'Accuracy Report',
        'counter-performance': 'Counter Performance',
        'inventory-valuation': 'Inventory Valuation',
        'expiry-analysis': 'Expiry Analysis',
        'trend-analysis': 'Trend Analysis',
        'custom': 'Custom Report'
    };
    return labels[type] || type;
}

function getFrequencyLabel(frequency) {
    const labels = {
        'daily': 'Daily',
        'weekly': 'Weekly',
        'monthly': 'Monthly',
        'quarterly': 'Quarterly'
    };
    return labels[frequency] || frequency;
}

function getStatusBadge(status) {
    const badges = {
        'PENDING': '<span class="label label-warning">Pending</span>',
        'PROCESSING': '<span class="label label-info">Processing</span>',
        'COMPLETED': '<span class="label label-success">Completed</span>',
        'FAILED': '<span class="label label-danger">Failed</span>'
    };
    return badges[status] || '<span class="label label-default">Unknown</span>';
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function formatDateTime(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function showSuccess(message) {
    $('.alert').remove();
    
    const alertHtml = `
        <div class="alert alert-success alert-dismissible" style="position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
            <strong>Success!</strong> ${message}
        </div>
    `;
    
    $('body').append(alertHtml);
    
    setTimeout(() => {
        $('.alert-success').fadeOut();
    }, 5000);
}

function showError(message) {
    $('.alert').remove();
    
    const alertHtml = `
        <div class="alert alert-danger alert-dismissible" style="position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
            <strong>Error!</strong> ${message}
        </div>
    `;
    
    $('body').append(alertHtml);
    
    setTimeout(() => {
        $('.alert-danger').fadeOut();
    }, 10000);
}