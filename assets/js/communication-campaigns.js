/**
 * Communication Campaigns Management JavaScript
 */

// Global variables
let currentCampaignId = null;

// Initialize page
$(document).ready(function () {
    loadCampaigns();
    loadTemplates();
    updateCampaignStats();
    setupEventListeners();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Campaign form submission
    $('#campaign-form').on('submit', function (e) {
        e.preventDefault();
        saveCampaign();
    });

    // Filter change events
    $('#filter-status, #filter-type, #filter-date-range').on('change', filterCampaigns);

    // Search functionality
    $('#search-campaign').on('keyup', function () {
        const searchTerm = $(this).val().toLowerCase();
        filterCampaignsBySearch(searchTerm);
    });

    // Target segment change
    $('#target-segment').on('change', function () {
        const segment = $(this).val();
        if (segment === 'custom') {
            // Show custom target selection UI
            $('#custom-target-section').show();
        } else {
            $('#custom-target-section').hide();
        }
    });
}

/**
 * Load campaigns
 */
function loadCampaigns() {
    $.ajax({
        url: './api/communication-campaigns/all',
        method: 'GET',
        success: function (data) {
            window.campaigns = data.campaigns || [];
            populateCampaignsTable();
            updateCampaignStats();
        },
        error: function (xhr, status, error) {
            console.error('Error loading campaigns:', error);
            showNotification('Error loading campaigns', 'error');
        }
    });
}

/**
 * Load templates
 */
function loadTemplates() {
    $.ajax({
        url: './api/communication-templates/all',
        method: 'GET',
        data: { approvalStatus: 'APPROVED' },
        success: function (data) {
            window.templates = data.templates || [];
            populateTemplateSelect();
        },
        error: function (xhr, status, error) {
            console.error('Error loading templates:', error);
        }
    });
}

/**
 * Populate template select
 */
function populateTemplateSelect() {
    const templateSelect = $('#campaign-template');
    templateSelect.empty();
    templateSelect.append('<option value="">Select Template</option>');

    if (window.templates && window.templates.length > 0) {
        window.templates.forEach(function (template) {
            templateSelect.append(`<option value="${template._id}">${template.name} (${template.type})</option>`);
        });
    }
}

/**
 * Populate campaigns table
 */
function populateCampaignsTable() {
    const tbody = $('#campaigns-table-body');
    tbody.empty();

    if (!window.campaigns || window.campaigns.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center">No campaigns found</td></tr>');
        return;
    }

    window.campaigns.forEach(function (campaign) {
        const statusClass = getStatusClass(campaign.status);
        const statusText = formatStatus(campaign.status);
        const progress = campaign.performance ?
            Math.round((campaign.performance.sentCount / campaign.performance.totalRecipients) * 100) : 0;

        tbody.append(`
            <tr>
                <td>${campaign.name}</td>
                <td><span class="badge badge-info">${campaign.type}</span></td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>${formatDate(campaign.schedule.startDate)}</td>
                <td>${formatDate(campaign.createdAt)}</td>
                <td>
                    <div class="progress">
                        <div class="progress-bar" role="progressbar" style="width: ${progress}%">
                            ${progress}%
                        </div>
                    </div>
                </td>
                <td>
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-primary" onclick="viewCampaign('${campaign._id}')">
                            <i class="ti-eye"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-info" onclick="editCampaign('${campaign._id}')">
                            <i class="ti-pencil"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-success" onclick="startCampaign('${campaign._id}')" 
                                ${campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED' ? 'disabled' : ''}>
                            <i class="ti-play"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-warning" onclick="pauseCampaign('${campaign._id}')" 
                                ${campaign.status !== 'RUNNING' ? 'disabled' : ''}>
                            <i class="ti-pause"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="cancelCampaign('${campaign._id}')" 
                                ${['COMPLETED', 'CANCELLED'].includes(campaign.status) ? 'disabled' : ''}>
                            <i class="ti-close"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `);
    });
}

/**
 * Update campaign statistics
 */
function updateCampaignStats() {
    let total = window.campaigns ? window.campaigns.length : 0;
    let running = 0;
    let paused = 0;
    let completed = 0;

    if (window.campaigns) {
        window.campaigns.forEach(campaign => {
            switch (campaign.status) {
                case 'RUNNING':
                    running++;
                    break;
                case 'PAUSED':
                    paused++;
                    break;
                case 'COMPLETED':
                    completed++;
                    break;
            }
        });
    }

    $('#total-campaigns').text(total);
    $('#running-campaigns').text(running);
    $('#paused-campaigns').text(paused);
    $('#completed-campaigns').text(completed);
}

/**
 * Show campaign modal
 */
function showCampaignModal(campaignId = null) {
    currentCampaignId = campaignId;

    // Reset form
    $('#campaign-form')[0].reset();

    if (campaignId) {
        // Load campaign data for editing
        const campaign = window.campaigns.find(c => c._id === campaignId);
        if (campaign) {
            $('#campaign-name').val(campaign.name);
            $('#campaign-description').val(campaign.description || '');
            $('#campaign-type').val(campaign.type);
            $('#campaign-priority').val(campaign.priority || 2);
            $('#campaign-schedule').val(campaign.schedule.type);
            $('#campaign-start-date').val(campaign.schedule.startDate);
            $('#campaign-end-date').val(campaign.schedule.endDate || '');

            if (campaign.templateId) {
                $('#campaign-template').val(campaign.templateId);
            }
        }
    }

    $('#campaign-modal').modal('show');
}

/**
 * Save campaign
 */
function saveCampaign() {
    const name = $('#campaign-name').val().trim();
    const description = $('#campaign-description').val().trim();
    const type = $('#campaign-type').val();
    const priority = $('#campaign-priority').val();
    const scheduleType = $('#campaign-schedule').val();
    const startDate = $('#campaign-start-date').val();
    const endDate = $('#campaign-end-date').val();
    const templateId = $('#campaign-template').val();
    const targetSegment = $('#target-segment').val();
    const targetChannel = $('#target-channel').val();

    if (!name || !type || !startDate) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }

    const campaignData = {
        name: name,
        description: description,
        type: type,
        priority: parseInt(priority),
        templateId: templateId,
        schedule: {
            type: scheduleType,
            startDate: startDate,
            endDate: endDate || null
        },
        targeting: {
            segment: targetSegment,
            channel: targetChannel
        },
        createdBy: 'current_user' // In a real implementation, this would come from authentication
    };

    const url = currentCampaignId ?
        `/api/communication-campaigns/campaign/${currentCampaignId}` :
        '/api/communication-campaigns/campaign';

    const method = currentCampaignId ? 'PUT' : 'POST';

    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(campaignData),
        success: function (response) {
            if (response.success) {
                showNotification(`Campaign ${currentCampaignId ? 'updated' : 'created'} successfully`, 'success');
                $('#campaign-modal').modal('hide');
                loadCampaigns();
            } else {
                showNotification(`Error ${currentCampaignId ? 'updating' : 'creating'} campaign`, 'error');
            }
        },
        error: function (xhr, status, error) {
            console.error(`Error ${currentCampaignId ? 'updating' : 'creating'} campaign:`, error);
            showNotification(`Error ${currentCampaignId ? 'updating' : 'creating'} campaign`, 'error');
        }
    });
}

/**
 * View campaign
 */
function viewCampaign(campaignId) {
    const campaign = window.campaigns.find(c => c._id === campaignId);
    if (!campaign) return;

    const performance = campaign.performance || {};
    const progress = performance.totalRecipients ?
        Math.round((performance.sentCount / performance.totalRecipients) * 100) : 0;

    const detailsHtml = `
        <div class="campaign-details">
            <h4>${campaign.name}</h4>
            <div class="border p-3">
                <div class="row">
                    <div class="col-md-6">
                        <p><strong>Type:</strong> <span class="badge badge-info">${campaign.type}</span></p>
                        <p><strong>Status:</strong> <span class="badge ${getStatusClass(campaign.status)}">${formatStatus(campaign.status)}</span></p>
                        <p><strong>Priority:</strong> ${campaign.priority || 2}</p>
                        <p><strong>Description:</strong> ${campaign.description || 'N/A'}</p>
                    </div>
                    <div class="col-md-6">
                        <p><strong>Schedule Type:</strong> ${campaign.schedule.type}</p>
                        <p><strong>Start Date:</strong> ${formatDateTime(campaign.schedule.startDate)}</p>
                        <p><strong>End Date:</strong> ${campaign.schedule.endDate ? formatDateTime(campaign.schedule.endDate) : 'N/A'}</p>
                        <p><strong>Created:</strong> ${formatDateTime(campaign.createdAt)}</p>
                    </div>
                </div>
                <div class="row mt-3">
                    <div class="col-md-12">
                        <p><strong>Targeting:</strong></p>
                        <ul>
                            <li>Segment: ${campaign.targeting.segment}</li>
                            <li>Channel: ${campaign.targeting.channel}</li>
                        </ul>
                    </div>
                </div>
                <div class="row mt-3">
                    <div class="col-md-12">
                        <p><strong>Performance:</strong></p>
                        <div class="row">
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body text-center">
                                        <h5>${performance.totalRecipients || 0}</h5>
                                        <small>Total Recipients</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body text-center">
                                        <h5>${performance.sentCount || 0}</h5>
                                        <small>Sent</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body text-center">
                                        <h5>${performance.deliveredCount || 0}</h5>
                                        <small>Delivered</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card">
                                    <div class="card-body text-center">
                                        <h5>${performance.readCount || 0}</h5>
                                        <small>Read</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="progress mt-3">
                            <div class="progress-bar" role="progressbar" style="width: ${progress}%">
                                ${progress}% Complete
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    $('#campaign-details-content').html(detailsHtml);
    $('#campaign-details-section').show();
}

/**
 * Edit campaign
 */
function editCampaign(campaignId) {
    showCampaignModal(campaignId);
}

/**
 * Start campaign
 */
function startCampaign(campaignId) {
    if (!confirm('Are you sure you want to start this campaign?')) {
        return;
    }

    $.ajax({
        url: `/api/communication-campaigns/campaign/${campaignId}/start`,
        method: 'POST',
        success: function (response) {
            if (response.success) {
                showNotification('Campaign started successfully', 'success');
                loadCampaigns();
            } else {
                showNotification('Error starting campaign', 'error');
            }
        },
        error: function (xhr, status, error) {
            console.error('Error starting campaign:', error);
            showNotification('Error starting campaign', 'error');
        }
    });
}

/**
 * Pause campaign
 */
function pauseCampaign(campaignId) {
    if (!confirm('Are you sure you want to pause this campaign?')) {
        return;
    }

    $.ajax({
        url: `/api/communication-campaigns/campaign/${campaignId}/pause`,
        method: 'POST',
        success: function (response) {
            if (response.success) {
                showNotification('Campaign paused successfully', 'success');
                loadCampaigns();
            } else {
                showNotification('Error pausing campaign', 'error');
            }
        },
        error: function (xhr, status, error) {
            console.error('Error pausing campaign:', error);
            showNotification('Error pausing campaign', 'error');
        }
    });
}

/**
 * Cancel campaign
 */
function cancelCampaign(campaignId) {
    if (!confirm('Are you sure you want to cancel this campaign? This action cannot be undone.')) {
        return;
    }

    $.ajax({
        url: `/api/communication-campaigns/campaign/${campaignId}/cancel`,
        method: 'POST',
        success: function (response) {
            if (response.success) {
                showNotification('Campaign cancelled successfully', 'success');
                loadCampaigns();
            } else {
                showNotification('Error cancelling campaign', 'error');
            }
        },
        error: function (xhr, status, error) {
            console.error('Error cancelling campaign:', error);
            showNotification('Error cancelling campaign', 'error');
        }
    });
}

/**
 * Filter campaigns
 */
function filterCampaigns() {
    const status = $('#filter-status').val();
    const type = $('#filter-type').val();
    const dateRange = $('#filter-date-range').val();

    $.ajax({
        url: './api/communication-campaigns/all',
        method: 'GET',
        data: {
            status: status,
            type: type
        },
        success: function (data) {
            let filteredCampaigns = data.campaigns || [];

            // Apply client-side filtering for date range
            if (dateRange) {
                const now = new Date();
                let filterDate;

                switch (dateRange) {
                    case 'today':
                        filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                        break;
                    case 'week':
                        filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
                        break;
                    case 'month':
                        filterDate = new Date(now.getFullYear(), now.getMonth(), 1);
                        break;
                    case 'quarter':
                        filterDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                        break;
                }

                if (filterDate) {
                    filteredCampaigns = filteredCampaigns.filter(campaign => {
                        const campaignDate = new Date(campaign.createdAt);
                        return campaignDate >= filterDate;
                    });
                }
            }

            window.campaigns = filteredCampaigns;
            populateCampaignsTable();
        },
        error: function (xhr, status, error) {
            console.error('Error filtering campaigns:', error);
            showNotification('Error filtering campaigns', 'error');
        }
    });
}

/**
 * Filter campaigns by search
 */
function filterCampaignsBySearch(searchTerm) {
    const filteredCampaigns = window.campaigns.filter(campaign => {
        return campaign.name.toLowerCase().includes(searchTerm) ||
            campaign.description.toLowerCase().includes(searchTerm) ||
            campaign.type.toLowerCase().includes(searchTerm);
    });

    const tbody = $('#campaigns-table-body');
    tbody.empty();

    if (filteredCampaigns.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center">No campaigns found matching your search</td></tr>');
        return;
    }

    filteredCampaigns.forEach(function (campaign) {
        const statusClass = getStatusClass(campaign.status);
        const statusText = formatStatus(campaign.status);
        const progress = campaign.performance ?
            Math.round((campaign.performance.sentCount / campaign.performance.totalRecipients) * 100) : 0;

        tbody.append(`
            <tr>
                <td>${campaign.name}</td>
                <td><span class="badge badge-info">${campaign.type}</span></td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>${formatDate(campaign.schedule.startDate)}</td>
                <td>${formatDate(campaign.createdAt)}</td>
                <td>
                    <div class="progress">
                        <div class="progress-bar" role="progressbar" style="width: ${progress}%">
                            ${progress}%
                        </div>
                    </div>
                </td>
                <td>
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-primary" onclick="viewCampaign('${campaign._id}')">
                            <i class="ti-eye"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-info" onclick="editCampaign('${campaign._id}')">
                            <i class="ti-pencil"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-success" onclick="startCampaign('${campaign._id}')" 
                                ${campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED' ? 'disabled' : ''}>
                            <i class="ti-play"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-warning" onclick="pauseCampaign('${campaign._id}')" 
                                ${campaign.status !== 'RUNNING' ? 'disabled' : ''}>
                            <i class="ti-pause"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="cancelCampaign('${campaign._id}')" 
                                ${['COMPLETED', 'CANCELLED'].includes(campaign.status) ? 'disabled' : ''}>
                            <i class="ti-close"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `);
    });
}

/**
 * Get status class
 */
function getStatusClass(status) {
    switch (status) {
        case 'DRAFT':
            return 'badge-secondary';
        case 'SCHEDULED':
            return 'badge-info';
        case 'RUNNING':
            return 'badge-primary';
        case 'PAUSED':
            return 'badge-warning';
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
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    return date.toLocaleDateString();
}

/**
 * Format date and time
 */
function formatDateTime(dateString) {
    if (!dateString) return 'N/A';

    const date = new Date(dateString);
    return date.toLocaleString();
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
    setTimeout(function () {
        $('.alert').fadeOut();
    }, 5000);
}