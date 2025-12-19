/**
 * Customer Communication Management JavaScript
 */

// Global variables
let currentSection = 'send-communication';
let customers = [];
let templates = [];
let campaigns = [];
let communicationHistory = [];
let customerPreferences = {};

// Initialize page
$(document).ready(function() {
    loadCustomers();
    loadTemplates();
    loadCampaigns();
    loadCommunicationHistory();
    loadAnalytics();
    
    // Set up event listeners
    setupEventListeners();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Template type change
    $('#type-select').on('change', function() {
        const type = $(this).val();
        loadTemplatesByType(type);
    });
    
    // Template selection
    $('#template-select').on('change', function() {
        const templateId = $(this).val();
        if (templateId) {
            loadTemplateContent(templateId);
        }
    });
}

/**
 * Show specific section
 */
function showSection(sectionId) {
    // Hide all sections
    $('.communication-section').hide();
    
    // Remove active class from all sidebar items
    $('.sidebar-list li').removeClass('active');
    
    // Show selected section
    $('#' + sectionId).show();
    
    // Add active class to selected sidebar item
    $('a[href="#' + sectionId + '"]').parent().addClass('active');
    
    currentSection = sectionId;
}

/**
 * Load customers
 */
function loadCustomers() {
    $.ajax({
        url: '/api/customers/all',
        method: 'GET',
        success: function(data) {
            customers = data.customers || data;
            
            // Populate customer selects
            const customerSelect = $('#customer-select, #preferences-customer-select, #history-customer-filter');
            customerSelect.empty();
            customerSelect.append('<option value="">Select Customer</option>');
            
            customers.forEach(function(customer) {
                customerSelect.append(`<option value="${customer._id}">${customer.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading customers:', error);
            showNotification('Error loading customers', 'error');
        }
    });
}

/**
 * Load templates
 */
function loadTemplates() {
    $.ajax({
        url: '/api/communication-templates/all',
        method: 'GET',
        success: function(data) {
            templates = data.templates || [];
            
            // Populate template select
            const templateSelect = $('#template-select');
            templateSelect.empty();
            templateSelect.append('<option value="">Select Template</option>');
            
            templates.forEach(function(template) {
                if (template.approvalStatus === 'APPROVED') {
                    templateSelect.append(`<option value="${template._id}">${template.name}</option>`);
                }
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading templates:', error);
            showNotification('Error loading templates', 'error');
        }
    });
}

/**
 * Load templates by type
 */
function loadTemplatesByType(type) {
    const templateSelect = $('#template-select');
    templateSelect.empty();
    templateSelect.append('<option value="">Select Template</option>');
    
    templates.forEach(function(template) {
        if (template.type === type && template.approvalStatus === 'APPROVED') {
            templateSelect.append(`<option value="${template._id}">${template.name}</option>`);
        }
    });
}

/**
 * Load template content
 */
function loadTemplateContent(templateId) {
    const template = templates.find(t => t._id === templateId);
    if (!template) return;
    
    // Set form values based on template
    $('#subject-input').val(template.content.email ? template.content.email.subject : '');
    $('#message-input').val(template.content.email ? template.content.email.htmlBody : '');
    $('#template-variables').val(template.variables ? template.variables.map(v => v.name).join(', ') : '');
}

/**
 * Load campaigns
 */
function loadCampaigns() {
    $.ajax({
        url: '/api/communication-campaigns/all',
        method: 'GET',
        success: function(data) {
            campaigns = data.campaigns || [];
            populateCampaignsTable();
        },
        error: function(xhr, status, error) {
            console.error('Error loading campaigns:', error);
            showNotification('Error loading campaigns', 'error');
        }
    });
}

/**
 * Populate campaigns table
 */
function populateCampaignsTable() {
    const tbody = $('#campaigns-table-body');
    tbody.empty();
    
    if (campaigns.length === 0) {
        tbody.append('<tr><td colspan="6" class="text-center">No campaigns found</td></tr>');
        return;
    }
    
    campaigns.forEach(function(campaign) {
        const statusClass = getStatusClass(campaign.status);
        const statusText = formatStatus(campaign.status);
        
        tbody.append(`
            <tr>
                <td>${campaign.name}</td>
                <td>${campaign.type}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>${formatDate(campaign.schedule.startDate)}</td>
                <td>${formatDate(campaign.createdAt)}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-info" onclick="viewCampaign('${campaign._id}')">View</button>
                    <button type="button" class="btn btn-sm btn-warning" onclick="pauseCampaign('${campaign._id}')" ${campaign.status !== 'RUNNING' ? 'disabled' : ''}>Pause</button>
                    <button type="button" class="btn btn-sm btn-success" onclick="resumeCampaign('${campaign._id}')" ${campaign.status !== 'PAUSED' ? 'disabled' : ''}>Resume</button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="cancelCampaign('${campaign._id}')" ${['RUNNING', 'PAUSED'].includes(campaign.status) ? 'disabled' : ''}>Cancel</button>
                </td>
            </tr>
        `);
    });
}

/**
 * Populate templates table
 */
function populateTemplatesTable() {
    const tbody = $('#templates-table-body');
    tbody.empty();
    
    if (templates.length === 0) {
        tbody.append('<tr><td colspan="6" class="text-center">No templates found</td></tr>');
        return;
    }
    
    templates.forEach(function(template) {
        const statusClass = getStatusClass(template.approvalStatus);
        const statusText = formatApprovalStatus(template.approvalStatus);
        
        tbody.append(`
            <tr>
                <td>${template.name}</td>
                <td>${template.type}</td>
                <td>${template.category}</td>
                <td>${template.language}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button type="button" class="btn btn-sm btn-primary" onclick="editTemplate('${template._id}')">Edit</button>
                    <button type="button" class="btn btn-sm btn-success" onclick="approveTemplate('${template._id}')" ${template.approvalStatus === 'APPROVED' ? 'disabled' : ''}>Approve</button>
                    <button type="button" class="btn btn-sm btn-danger" onclick="deleteTemplate('${template._id}')">Delete</button>
                </td>
            </tr>
        `);
    });
}

/**
 * Load communication history
 */
function loadCommunicationHistory() {
    $.ajax({
        url: '/api/customer-communication/analytics',
        method: 'GET',
        success: function(data) {
            // For now, we'll use analytics data as history
            updateAnalyticsDisplay(data);
        },
        error: function(xhr, status, error) {
            console.error('Error loading communication history:', error);
            showNotification('Error loading communication history', 'error');
        }
    });
}

/**
 * Load analytics
 */
function loadAnalytics() {
    $.ajax({
        url: '/api/customer-communication/analytics',
        method: 'GET',
        success: function(data) {
            updateAnalyticsDisplay(data);
        },
        error: function(xhr, status, error) {
            console.error('Error loading analytics:', error);
            showNotification('Error loading analytics', 'error');
        }
    });
}

/**
 * Update analytics display
 */
function updateAnalyticsDisplay(data) {
    $('#total-sent').text(data.summary.total);
    $('#total-delivered').text(data.summary.delivered);
    $('#total-read').text(data.summary.read);
    $('#total-failed').text(data.summary.failed);
    
    // Update channel chart
    updateChannelChart(data.byChannel);
    
    // Update type chart
    updateTypeChart(data.byType);
}

/**
 * Update channel chart
 */
function updateChannelChart(channelData) {
    const ctx = document.getElementById('channel-chart').getContext('2d');
    
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['SMS', 'Email', 'WhatsApp', 'In-App', 'Push'],
            datasets: [{
                data: [
                    channelData.sms || 0,
                    channelData.email || 0,
                    channelData.whatsapp || 0,
                    channelData.in_app || 0,
                    channelData.push || 0
                ],
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#25D366',
                    '#FFCE56',
                    '#4BC0C0'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * Update type chart
 */
function updateTypeChart(typeData) {
    const ctx = document.getElementById('type-chart').getContext('2d');
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeData),
            datasets: [{
                data: Object.values(typeData),
                backgroundColor: [
                    '#FF6384',
                    '#36A2EB',
                    '#FFCE56',
                    '#4BC0C0',
                    '#E74C3C',
                    '#3498DB'
                ]
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

/**
 * Send communication
 */
function sendCommunication() {
    const customerId = $('#customer-select').val();
    const channel = $('#channel-select').val();
    const type = $('#type-select').val();
    const subject = $('#subject-input').val();
    const content = $('#message-input').val();
    const priority = $('#priority-select').val();
    const scheduledAt = $('#schedule-datetime').val();
    
    if (!customerId || !channel || !type || !content) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }
    
    const communicationData = {
        customerId: customerId,
        channel: channel,
        type: type,
        subject: subject,
        content: content,
        priority: parseInt(priority),
        scheduledAt: scheduledAt || null
    };
    
    // Add personalization data if provided
    const customerName = $('#var-customer-name').val();
    const prescriptionNumber = $('#var-prescription-number').val();
    const pharmacyName = $('#var-pharmacy-name').val();
    
    if (customerName || prescriptionNumber || pharmacyName) {
        communicationData.personalizationData = {
            customerName: customerName,
            prescriptionNumber: prescriptionNumber,
            pharmacyName: pharmacyName
        };
    }
    
    $.ajax({
        url: '/api/customer-communication/send',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(communicationData),
        success: function(response) {
            if (response.success) {
                showNotification('Communication sent successfully', 'success');
                $('#communication-form')[0].reset();
                loadCommunicationHistory();
            } else {
                showNotification('Error sending communication', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error sending communication:', error);
            showNotification('Error sending communication', 'error');
        }
    });
}

/**
 * Preview communication
 */
function previewCommunication() {
    const customerId = $('#customer-select').val();
    const channel = $('#channel-select').val();
    const type = $('#type-select').val();
    const subject = $('#subject-input').val();
    const content = $('#message-input').val();
    
    if (!customerId || !channel || !type || !content) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }
    
    // Show preview modal (simplified for demo)
    alert(`Preview:\n\nChannel: ${channel}\nType: ${type}\nSubject: ${subject}\nContent: ${content}`);
}

/**
 * Load customer preferences
 */
function loadCustomerPreferences() {
    const customerId = $('#preferences-customer-select').val();
    if (!customerId) return;
    
    $.ajax({
        url: `/api/customer-communication-preferences/customer/${customerId}`,
        method: 'GET',
        success: function(preferences) {
            customerPreferences = preferences;
            displayCustomerPreferences(preferences);
        },
        error: function(xhr, status, error) {
            console.error('Error loading customer preferences:', error);
            showNotification('Error loading customer preferences', 'error');
        }
    });
}

/**
 * Display customer preferences
 */
function displayCustomerPreferences(preferences) {
    $('#preferences-form').show();
    
    // Set channel preferences
    $('#sms-enabled').prop('checked', preferences.channels && preferences.channels.sms && preferences.channels.sms.enabled);
    $('#sms-marketing').prop('checked', preferences.channels && preferences.channels.sms && preferences.channels.sms.consent && preferences.channels.sms.consent.marketing);
    $('#sms-transactional').prop('checked', preferences.channels && preferences.channels.sms && preferences.channels.sms.consent && preferences.channels.sms.consent.transactional);
    
    $('#email-enabled').prop('checked', preferences.channels && preferences.channels.email && preferences.channels.email.enabled);
    $('#email-marketing').prop('checked', preferences.channels && preferences.channels.email && preferences.channels.email.consent && preferences.channels.email.consent.marketing);
    $('#email-transactional').prop('checked', preferences.channels && preferences.channels.email && preferences.channels.email.consent && preferences.channels.email.consent.transactional);
    
    $('#whatsapp-enabled').prop('checked', preferences.channels && preferences.channels.whatsapp && preferences.channels.whatsapp.enabled);
    $('#whatsapp-marketing').prop('checked', preferences.channels && preferences.channels.whatsapp && preferences.channels.whatsapp.consent && preferences.channels.whatsapp.consent.marketing);
    $('#whatsapp-transactional').prop('checked', preferences.channels && preferences.channels.whatsapp && preferences.channels.whatsapp.consent && preferences.channels.whatsapp.consent.transactional);
    
    // Set global preferences
    $('#quiet-hours-enabled').prop('checked', preferences.global && preferences.global.quietHours && preferences.global.quietHours.enabled);
    $('#quiet-hours-start').val(preferences.global && preferences.global.quietHours ? preferences.global.quietHours.start : '22:00');
    $('#quiet-hours-end').val(preferences.global && preferences.global.quietHours ? preferences.global.quietHours.end : '08:00');
}

/**
 * Save customer preferences
 */
function saveCustomerPreferences() {
    const customerId = $('#preferences-customer-select').val();
    if (!customerId) {
        showNotification('Please select a customer', 'warning');
        return;
    }
    
    const preferences = {
        channels: {
            sms: {
                enabled: $('#sms-enabled').is(':checked'),
                consent: {
                    marketing: $('#sms-marketing').is(':checked'),
                    transactional: $('#sms-transactional').is(':checked')
                }
            },
            email: {
                enabled: $('#email-enabled').is(':checked'),
                consent: {
                    marketing: $('#email-marketing').is(':checked'),
                    transactional: $('#email-transactional').is(':checked')
                }
            },
            whatsapp: {
                enabled: $('#whatsapp-enabled').is(':checked'),
                consent: {
                    marketing: $('#whatsapp-marketing').is(':checked'),
                    transactional: $('#whatsapp-transactional').is(':checked')
                }
            }
        },
        global: {
            quietHours: {
                enabled: $('#quiet-hours-enabled').is(':checked'),
                start: $('#quiet-hours-start').val(),
                end: $('#quiet-hours-end').val()
            }
        }
    };
    
    $.ajax({
        url: `/api/customer-communication-preferences/customer/${customerId}`,
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(preferences),
        success: function(response) {
            if (response.success) {
                showNotification('Preferences saved successfully', 'success');
            } else {
                showNotification('Error saving preferences', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error saving preferences:', error);
            showNotification('Error saving preferences', 'error');
        }
    });
}

/**
 * Show template modal
 */
function showTemplateModal() {
    $('#template-modal').modal('show');
    $('#template-form')[0].reset();
}

/**
 * Save template
 */
function saveTemplate() {
    const name = $('#template-name').val();
    const type = $('#template-type').val();
    const category = $('#template-category').val();
    const language = $('#template-language').val();
    const content = $('#template-content').val();
    const variables = $('#template-variables').val();
    
    if (!name || !type || !category || !content) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }
    
    const templateData = {
        name: name,
        type: type,
        category: category,
        language: language,
        content: {
            [type.toLowerCase()]: type === 'EMAIL' ? {
                subject: name,
                htmlBody: content,
                textBody: content.replace(/<[^>]*>/g, '') // Strip HTML for text version
            } : content
        },
        variables: variables ? variables.split(',').map(v => v.trim()).filter(v => v) : []
    };
    
    $.ajax({
        url: '/api/communication-templates/template',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(templateData),
        success: function(response) {
            if (response.success) {
                showNotification('Template saved successfully', 'success');
                $('#template-modal').modal('hide');
                loadTemplates();
            } else {
                showNotification('Error saving template', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error saving template:', error);
            showNotification('Error saving template', 'error');
        }
    });
}

/**
 * Show campaign modal
 */
function showCampaignModal() {
    $('#campaign-modal').modal('show');
    $('#campaign-form')[0].reset();
}

/**
 * Save campaign
 */
function saveCampaign() {
    const name = $('#campaign-name').val();
    const description = $('#campaign-description').val();
    const type = $('#campaign-type').val();
    const priority = $('#campaign-priority').val();
    const schedule = $('#campaign-schedule').val();
    const startDate = $('#campaign-start-date').val();
    const endDate = $('#campaign-end-date').val();
    
    if (!name || !type || !startDate) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }
    
    const campaignData = {
        name: name,
        description: description,
        type: type,
        priority: parseInt(priority),
        schedule: {
            type: schedule,
            startDate: startDate,
            endDate: endDate
        },
        createdBy: 'current_user' // In a real implementation, this would come from authentication
    };
    
    $.ajax({
        url: '/api/communication-campaigns/campaign',
        method: 'POST',
        contentType: 'application/json',
        data: JSON.stringify(campaignData),
        success: function(response) {
            if (response.success) {
                showNotification('Campaign saved successfully', 'success');
                $('#campaign-modal').modal('hide');
                loadCampaigns();
            } else {
                showNotification('Error saving campaign', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error saving campaign:', error);
            showNotification('Error saving campaign', 'error');
        }
    });
}

/**
 * View campaign
 */
function viewCampaign(campaignId) {
    const campaign = campaigns.find(c => c._id === campaignId);
    if (!campaign) return;
    
    // Show campaign details (simplified for demo)
    alert(`Campaign Details:\n\nName: ${campaign.name}\nType: ${campaign.type}\nStatus: ${campaign.status}\nDescription: ${campaign.description}`);
}

/**
 * Pause campaign
 */
function pauseCampaign(campaignId) {
    $.ajax({
        url: `/api/communication-campaigns/campaign/${campaignId}/pause`,
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showNotification('Campaign paused successfully', 'success');
                loadCampaigns();
            } else {
                showNotification('Error pausing campaign', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error pausing campaign:', error);
            showNotification('Error pausing campaign', 'error');
        }
    });
}

/**
 * Resume campaign
 */
function resumeCampaign(campaignId) {
    $.ajax({
        url: `/api/communication-campaigns/campaign/${campaignId}/resume`,
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showNotification('Campaign resumed successfully', 'success');
                loadCampaigns();
            } else {
                showNotification('Error resuming campaign', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error resuming campaign:', error);
            showNotification('Error resuming campaign', 'error');
        }
    });
}

/**
 * Cancel campaign
 */
function cancelCampaign(campaignId) {
    if (!confirm('Are you sure you want to cancel this campaign?')) {
        return;
    }
    
    $.ajax({
        url: `/api/communication-campaigns/campaign/${campaignId}/cancel`,
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showNotification('Campaign cancelled successfully', 'success');
                loadCampaigns();
            } else {
                showNotification('Error cancelling campaign', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error cancelling campaign:', error);
            showNotification('Error cancelling campaign', 'error');
        }
    });
}

/**
 * Edit template
 */
function editTemplate(templateId) {
    const template = templates.find(t => t._id === templateId);
    if (!template) return;
    
    // Populate form with template data
    $('#template-name').val(template.name);
    $('#template-type').val(template.type);
    $('#template-category').val(template.category);
    $('#template-language').val(template.language);
    $('#template-content').val(template.content.email ? template.content.email.htmlBody : template.content.sms || '');
    $('#template-variables').val(template.variables ? template.variables.map(v => v.name).join(', ') : '');
    
    showTemplateModal();
}

/**
 * Approve template
 */
function approveTemplate(templateId) {
    $.ajax({
        url: `/api/communication-templates/template/${templateId}/approve`,
        method: 'POST',
        success: function(response) {
            if (response.success) {
                showNotification('Template approved successfully', 'success');
                loadTemplates();
            } else {
                showNotification('Error approving template', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error approving template:', error);
            showNotification('Error approving template', 'error');
        }
    });
}

/**
 * Delete template
 */
function deleteTemplate(templateId) {
    if (!confirm('Are you sure you want to delete this template?')) {
        return;
    }
    
    $.ajax({
        url: `/api/communication-templates/template/${templateId}`,
        method: 'DELETE',
        success: function(response) {
            if (response.success) {
                showNotification('Template deleted successfully', 'success');
                loadTemplates();
            } else {
                showNotification('Error deleting template', 'error');
            }
        },
        error: function(xhr, status, error) {
            console.error('Error deleting template:', error);
            showNotification('Error deleting template', 'error');
        }
    });
}

/**
 * Get status class
 */
function getStatusClass(status) {
    switch (status) {
        case 'APPROVED':
            return 'badge-success';
        case 'PENDING':
            return 'badge-warning';
        case 'REJECTED':
            return 'badge-danger';
        case 'RUNNING':
            return 'badge-primary';
        case 'PAUSED':
            return 'badge-secondary';
        case 'COMPLETED':
            return 'badge-success';
        case 'CANCELLED':
            return 'badge-danger';
        default:
            return 'badge-secondary';
    }
}

/**
 * Format status
 */
function formatStatus(status) {
    return status.replace(/_/g, ' ');
}

/**
 * Format approval status
 */
function formatApprovalStatus(status) {
    return status.replace(/_/g, ' ');
}

/**
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

/**
 * Show notification
 */
function showNotification(message, type) {
    const alertClass = type === 'success' ? 'alert-success' : 
                     type === 'error' ? 'alert-danger' : 'alert-warning';
    
    const notification = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            <button type="button" class="close" data-dismiss="alert">&times;</button>
            ${message}
        </div>
    `;
    
    // Add notification to top of page
    $('.page-wrapper').prepend(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(function() {
        $('.alert').fadeOut();
    }, 5000);
}