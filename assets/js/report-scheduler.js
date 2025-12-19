/**
 * Report Scheduler JavaScript module for PharmaSpot
 * Handles scheduled report management functionality
 */

$(document).ready(function() {
    // Initialize scheduled reports when scheduled reports tab is shown
    $('a[href="#scheduledReportsTab"]').on('shown.bs.tab', function() {
        loadScheduledReports();
    });
    
    // Handle schedule type change
    $('#scheduleType').on('change', function() {
        const scheduleType = $(this).val();
        handleScheduleTypeChange(scheduleType);
    });
    
    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
});

/**
 * Load scheduled reports from API
 */
function loadScheduledReports() {
    $.ajax({
        url: '/api/report-scheduler/schedules',
        method: 'GET',
        success: function(response) {
            renderScheduledReports(response.schedules);
        },
        error: function(xhr, status, error) {
            console.error('Error loading scheduled reports:', error);
            showNotification('Error loading scheduled reports', 'error');
        }
    });
}

/**
 * Render scheduled reports list
 */
function renderScheduledReports(schedules) {
    const schedulesList = $('#scheduledReportsList');
    schedulesList.empty();
    
    if (schedules.length === 0) {
        schedulesList.html('<p class="text-muted">No scheduled reports found. Create your first scheduled report!</p>');
        return;
    }
    
    schedules.forEach(schedule => {
        const statusBadge = schedule.isActive ? 
            '<span class="badge badge-success">Active</span>' : 
            '<span class="badge badge-secondary">Inactive</span>';
        
        const nextRun = schedule.nextRun ? new Date(schedule.nextRun).toLocaleString() : 'N/A';
        const lastRun = schedule.lastRun ? new Date(schedule.lastRun).toLocaleString() : 'Never';
        
        const scheduleItem = `
            <div class="schedule-item ${!schedule.isActive ? 'inactive' : ''}">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h5>${schedule.reportName}</h5>
                        <p class="text-muted small">${schedule.scheduleType} schedule</p>
                        <div class="schedule-meta">
                            <small class="text-muted">
                                <i class="fa fa-clock-o"></i> Next run: ${nextRun}<br>
                                <i class="fa fa-history"></i> Last run: ${lastRun}<br>
                                <i class="fa fa-refresh"></i> Run count: ${schedule.runCount}<br>
                                <i class="fa fa-file-o"></i> Format: ${schedule.exportFormat.toUpperCase()}
                            </small>
                        </div>
                    </div>
                    <div class="schedule-actions">
                        <div class="btn-group">
                            <button type="button" class="btn btn-sm btn-primary" 
                                    onclick="runScheduledReport('${schedule._id}')" 
                                    data-toggle="tooltip" title="Run Now">
                                <i class="fa fa-play"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-info" 
                                    onclick="editScheduledReport('${schedule._id}')" 
                                    data-toggle="tooltip" title="Edit Schedule">
                                <i class="fa fa-edit"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-warning" 
                                    onclick="toggleScheduledReport('${schedule._id}')" 
                                    data-toggle="tooltip" title="${schedule.isActive ? 'Deactivate' : 'Activate'}">
                                <i class="fa fa-${schedule.isActive ? 'pause' : 'play'}"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-danger" 
                                    onclick="deleteScheduledReport('${schedule._id}')" 
                                    data-toggle="tooltip" title="Delete Schedule">
                                <i class="fa fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="mt-2">
                    ${statusBadge}
                    <small class="text-muted">Recipients: ${schedule.recipients.join(', ') || 'None'}</small>
                </div>
            </div>
        `;
        schedulesList.append(scheduleItem);
    });
    
    // Re-initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
}

/**
 * Handle schedule type change
 */
function handleScheduleTypeChange(scheduleType) {
    const customCronSection = $('#customCronSection');
    
    if (scheduleType === 'custom') {
        customCronSection.show();
    } else {
        customCronSection.hide();
    }
}

/**
 * Load available reports for schedule dropdown
 */
function loadAvailableReports() {
    $.ajax({
        url: '/api/custom-reports/reports',
        method: 'GET',
        success: function(response) {
            const reportSelect = $('#scheduleReport');
            reportSelect.empty();
            reportSelect.append('<option value="">Select Report</option>');
            
            response.reports.forEach(report => {
                reportSelect.append(`<option value="${report._id}">${report.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading reports:', error);
            showNotification('Error loading reports', 'error');
        }
    });
}

/**
 * Save scheduled report
 */
function saveScheduledReport() {
    const reportId = $('#scheduleReport').val();
    const reportName = $('#scheduleReportName').val();
    const scheduleType = $('#scheduleType').val();
    const customCronExpression = $('#customCronExpression').val();
    const recipients = $('#scheduleRecipients').val();
    const exportFormat = $('#scheduleExportFormat').val();
    
    if (!reportId || !reportName || !scheduleType) {
        showNotification('Please fill in all required fields', 'error');
        return;
    }
    
    // Validate recipients
    const recipientList = recipients ? recipients.split(',').map(r => r.trim()).filter(r => r) : [];
    const invalidEmails = recipientList.filter(email => !isValidEmail(email));
    
    if (invalidEmails.length > 0) {
        showNotification('Invalid email addresses: ' + invalidEmails.join(', '), 'error');
        return;
    }
    
    // Validate cron expression if custom
    let cronExpression = customCronExpression;
    if (scheduleType === 'custom') {
        if (!cronExpression) {
            showNotification('Cron expression is required for custom schedule', 'error');
            return;
        }
        // Basic validation - in production, you'd use a proper cron validator
        const cronParts = cronExpression.split(' ');
        if (cronParts.length !== 5) {
            showNotification('Invalid cron expression format', 'error');
            return;
        }
    }
    
    const scheduleData = {
        reportId: reportId,
        reportName: reportName,
        scheduleType: scheduleType,
        cronExpression: cronExpression,
        recipients: recipientList,
        exportFormat: exportFormat,
        createdBy: 'current_user' // This should come from authentication
    };
    
    const saveBtn = $('#saveScheduledReportBtn');
    const originalText = saveBtn.html();
    saveBtn.html('<i class="fa fa-spinner fa-spin"></i> Saving...').prop('disabled', true);
    
    $.ajax({
        url: '/api/report-scheduler/schedules',
        method: 'POST',
        data: JSON.stringify(scheduleData),
        contentType: 'application/json',
        success: function(response) {
            showNotification('Scheduled report created successfully', 'success');
            $('#scheduleReportModal').modal('hide');
            loadScheduledReports();
            saveBtn.html(originalText).prop('disabled', false);
        },
        error: function(xhr, status, error) {
            console.error('Error saving scheduled report:', error);
            showNotification('Error saving scheduled report: ' + (xhr.responseJSON?.message || error), 'error');
            saveBtn.html(originalText).prop('disabled', false);
        }
    });
}

/**
 * Run scheduled report manually
 */
function runScheduledReport(scheduleId) {
    if (!confirm('Are you sure you want to run this scheduled report now?')) {
        return;
    }
    
    $.ajax({
        url: `/api/report-scheduler/schedules/${scheduleId}/run`,
        method: 'POST',
        success: function(response) {
            showNotification('Report executed successfully', 'success');
            loadScheduledReports();
        },
        error: function(xhr, status, error) {
            console.error('Error running scheduled report:', error);
            showNotification('Error running scheduled report: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Toggle scheduled report active status
 */
function toggleScheduledReport(scheduleId) {
    $.ajax({
        url: `/api/report-scheduler/schedules/${scheduleId}/toggle`,
        method: 'POST',
        success: function(response) {
            showNotification(response.message, 'success');
            loadScheduledReports();
        },
        error: function(xhr, status, error) {
            console.error('Error toggling scheduled report:', error);
            showNotification('Error toggling scheduled report: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Edit scheduled report
 */
function editScheduledReport(scheduleId) {
    $.ajax({
        url: `/api/report-scheduler/schedules/${scheduleId}`,
        method: 'GET',
        success: function(schedule) {
            // Populate form with schedule data
            $('#scheduleReport').val(schedule.reportId);
            $('#scheduleReportName').val(schedule.reportName);
            $('#scheduleType').val(schedule.scheduleType);
            $('#scheduleRecipients').val(schedule.recipients.join(', '));
            $('#scheduleExportFormat').val(schedule.exportFormat);
            
            if (schedule.scheduleType === 'custom') {
                $('#customCronExpression').val(schedule.cronExpression);
                $('#customCronSection').show();
            } else {
                $('#customCronSection').hide();
            }
            
            // Show modal
            $('#scheduleReportModal').modal('show');
        },
        error: function(xhr, status, error) {
            console.error('Error loading scheduled report:', error);
            showNotification('Error loading scheduled report', 'error');
        }
    });
}

/**
 * Delete scheduled report
 */
function deleteScheduledReport(scheduleId) {
    if (!confirm('Are you sure you want to delete this scheduled report?')) {
        return;
    }
    
    $.ajax({
        url: `/api/report-scheduler/schedules/${scheduleId}`,
        method: 'DELETE',
        success: function(response) {
            showNotification('Scheduled report deleted successfully', 'success');
            loadScheduledReports();
        },
        error: function(xhr, status, error) {
            console.error('Error deleting scheduled report:', error);
            showNotification('Error deleting scheduled report: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Validate email address
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Show schedule execution history
 */
function showScheduleHistory(scheduleId) {
    $.ajax({
        url: `/api/report-scheduler/schedules/${scheduleId}/history`,
        method: 'GET',
        success: function(response) {
            // This would show a modal with execution history
            console.log('Schedule history:', response);
            showNotification('Schedule history functionality to be implemented', 'info');
        },
        error: function(xhr, status, error) {
            console.error('Error loading schedule history:', error);
            showNotification('Error loading schedule history', 'error');
        }
    });
}

/**
 * Export functions for global use
 */
window.loadScheduledReports = loadScheduledReports;
window.saveScheduledReport = saveScheduledReport;
window.runScheduledReport = runScheduledReport;
window.toggleScheduledReport = toggleScheduledReport;
window.editScheduledReport = editScheduledReport;
window.deleteScheduledReport = deleteScheduledReport;
window.showScheduleHistory = showScheduleHistory;