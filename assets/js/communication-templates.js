/**
 * Communication Templates Management JavaScript
 */

// Global variables
let currentTemplateId = null;

// Initialize page
$(document).ready(function () {
    loadTemplates();
    setupEventListeners();
});

/**
 * Set up event listeners
 */
function setupEventListeners() {
    // Template form submission
    $('#template-form').on('submit', function (e) {
        e.preventDefault();
        saveTemplate();
    });

    // Filter change events
    $('#filter-type, #filter-category, #filter-status, #filter-language').on('change', filterTemplates);

    // Search functionality
    $('#search-template').on('keyup', function () {
        const searchTerm = $(this).val().toLowerCase();
        filterTemplatesBySearch(searchTerm);
    });
}

/**
 * Load templates
 */
function loadTemplates() {
    $.ajax({
        url: './api/communication-templates/all',
        method: 'GET',
        success: function (data) {
            window.templates = data.templates || [];
            populateTemplatesTable();
        },
        error: function (_, __, error) {
            console.error('Error loading templates:', error);
            showNotification('Error loading templates', 'error');
        }
    });
}

/**
 * Populate templates table
 */
function populateTemplatesTable() {
    const tbody = $('#templates-table-body');
    tbody.empty();

    if (!window.templates || window.templates.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center">No templates found</td></tr>');
        return;
    }

    window.templates.forEach(function (template) {
        const statusClass = getStatusClass(template.approvalStatus);
        const statusText = formatApprovalStatus(template.approvalStatus);

        tbody.append(`
            <tr>
                <td>${template.name}</td>
                <td><span class="badge badge-info">${template.type}</span></td>
                <td>${template.category}</td>
                <td>${template.language || 'en'}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>${formatDate(template.createdAt)}</td>
                <td>
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-primary" onclick="viewTemplate('${template._id}')">
                            <i class="ti-eye"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-info" onclick="editTemplate('${template._id}')">
                            <i class="ti-pencil"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-success" onclick="approveTemplate('${template._id}')" 
                                ${template.approvalStatus === 'APPROVED' ? 'disabled' : ''}>
                            <i class="ti-check"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="deleteTemplate('${template._id}')">
                            <i class="ti-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `);
    });
}

/**
 * Show template modal
 */
function showTemplateModal(templateId = null) {
    currentTemplateId = templateId;

    // Reset form
    $('#template-form')[0].reset();

    if (templateId) {
        // Load template data for editing
        const template = window.templates.find(t => t._id === templateId);
        if (template) {
            $('#template-name').val(template.name);
            $('#template-type').val(template.type);
            $('#template-category').val(template.category);
            $('#template-language').val(template.language || 'en');

            // Set content based on type
            if (template.type === 'EMAIL' && template.content.email) {
                $('#template-content').val(template.content.email.htmlBody || '');
            } else if (template.content[template.type.toLowerCase()]) {
                $('#template-content').val(template.content[template.type.toLowerCase()] || '');
            } else {
                $('#template-content').val(template.content.text || '');
            }

            // Set variables
            if (template.variables && template.variables.length > 0) {
                $('#template-variables').val(template.variables.map(v => v.name).join(', '));
            }
        }
    }

    $('#template-modal').modal('show');
}

/**
 * Save template
 */
function saveTemplate() {
    const name = $('#template-name').val().trim();
    const type = $('#template-type').val();
    const category = $('#template-category').val();
    const language = $('#template-language').val();
    const content = $('#template-content').val().trim();
    const variables = $('#template-variables').val().trim();

    if (!name || !type || !category || !content) {
        showNotification('Please fill in all required fields', 'warning');
        return;
    }

    const templateData = {
        name: name,
        type: type,
        category: category,
        language: language,
        content: {},
        variables: variables ? variables.split(',').map(v => v.trim()).filter(v => v) : []
    };

    // Set content based on type
    if (type === 'EMAIL') {
        templateData.content.email = {
            subject: name,
            htmlBody: content,
            textBody: content.replace(/<[^>]*>/g, '') // Strip HTML for text version
        };
    } else {
        templateData.content[type.toLowerCase()] = content;
    }

    const url = currentTemplateId ?
        `/api/communication-templates/template/${currentTemplateId}` :
        '/api/communication-templates/template';

    const method = currentTemplateId ? 'PUT' : 'POST';

    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify(templateData),
        success: function (response) {
            if (response.success) {
                showNotification(`Template ${currentTemplateId ? 'updated' : 'created'} successfully`, 'success');
                $('#template-modal').modal('hide');
                loadTemplates();
            } else {
                showNotification(`Error ${currentTemplateId ? 'updating' : 'creating'} template`, 'error');
            }
        },
        error: function (_, __, error) {
            console.error(`Error ${currentTemplateId ? 'updating' : 'creating'} template:`, error);
            showNotification(`Error ${currentTemplateId ? 'updating' : 'creating'} template`, 'error');
        }
    });
}

/**
 * View template
 */
function viewTemplate(templateId) {
    const template = window.templates.find(t => t._id === templateId);
    if (!template) return;

    let contentHtml = '';

    if (template.type === 'EMAIL' && template.content.email) {
        contentHtml = `
            <h5>Subject: ${template.content.email.subject}</h5>
            <div class="border p-3">
                <div>${template.content.email.htmlBody}</div>
            </div>
        `;
    } else {
        const content = template.content[template.type.toLowerCase()] || template.content.text || '';
        contentHtml = `
            <div class="border p-3">
                <div class="message-bubble">${content}</div>
            </div>
        `;
    }

    const variablesHtml = template.variables && template.variables.length > 0 ?
        `<p><strong>Variables:</strong> ${template.variables.map(v => `{{${v.name}}}`).join(', ')}</p>` : '';

    const templateHtml = `
        <div class="template-view">
            <h4>${template.name}</h4>
            <p><strong>Type:</strong> <span class="badge badge-info">${template.type}</span></p>
            <p><strong>Category:</strong> ${template.category}</p>
            <p><strong>Language:</strong> ${template.language || 'en'}</p>
            <p><strong>Status:</strong> <span class="badge ${getStatusClass(template.approvalStatus)}">${formatApprovalStatus(template.approvalStatus)}</span></p>
            ${variablesHtml}
            <h5>Content:</h5>
            ${contentHtml}
        </div>
    `;

    $('#template-preview-content').html(templateHtml);
    $('#template-preview-section').show();
}

/**
 * Edit template
 */
function editTemplate(templateId) {
    showTemplateModal(templateId);
}

/**
 * Approve template
 */
function approveTemplate(templateId) {
    if (!confirm('Are you sure you want to approve this template?')) {
        return;
    }

    $.ajax({
        url: `/api/communication-templates/template/${templateId}/approve`,
        method: 'POST',
        success: function (response) {
            if (response.success) {
                showNotification('Template approved successfully', 'success');
                loadTemplates();
            } else {
                showNotification('Error approving template', 'error');
            }
        },
        error: function (_, __, error) {
            console.error('Error approving template:', error);
            showNotification('Error approving template', 'error');
        }
    });
}

/**
 * Delete template
 */
function deleteTemplate(templateId) {
    if (!confirm('Are you sure you want to delete this template? This action cannot be undone.')) {
        return;
    }

    $.ajax({
        url: `/api/communication-templates/template/${templateId}`,
        method: 'DELETE',
        success: function (response) {
            if (response.success) {
                showNotification('Template deleted successfully', 'success');
                loadTemplates();
            } else {
                showNotification('Error deleting template', 'error');
            }
        },
        error: function (_, __, error) {
            console.error('Error deleting template:', error);
            showNotification('Error deleting template', 'error');
        }
    });
}

/**
 * Filter templates
 */
function filterTemplates() {
    const type = $('#filter-type').val();
    const category = $('#filter-category').val();
    const status = $('#filter-status').val();
    const language = $('#filter-language').val();

    $.ajax({
        url: './api/communication-templates/all',
        method: 'GET',
        data: {
            type: type,
            category: category,
            approvalStatus: status,
            language: language
        },
        success: function (data) {
            window.templates = data.templates || [];
            populateTemplatesTable();
        },
        error: function (_, __, error) {
            console.error('Error filtering templates:', error);
            showNotification('Error filtering templates', 'error');
        }
    });
}

/**
 * Filter templates by search
 */
function filterTemplatesBySearch(searchTerm) {
    const filteredTemplates = window.templates.filter(template => {
        return template.name.toLowerCase().includes(searchTerm) ||
            template.category.toLowerCase().includes(searchTerm) ||
            (template.content.text && template.content.text.toLowerCase().includes(searchTerm)) ||
            (template.content.email && template.content.email.htmlBody && template.content.email.htmlBody.toLowerCase().includes(searchTerm));
    });

    const tbody = $('#templates-table-body');
    tbody.empty();

    if (filteredTemplates.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center">No templates found matching your search</td></tr>');
        return;
    }

    filteredTemplates.forEach(function (template) {
        const statusClass = getStatusClass(template.approvalStatus);
        const statusText = formatApprovalStatus(template.approvalStatus);

        tbody.append(`
            <tr>
                <td>${template.name}</td>
                <td><span class="badge badge-info">${template.type}</span></td>
                <td>${template.category}</td>
                <td>${template.language || 'en'}</td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>${formatDate(template.createdAt)}</td>
                <td>
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-primary" onclick="viewTemplate('${template._id}')">
                            <i class="ti-eye"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-info" onclick="editTemplate('${template._id}')">
                            <i class="ti-pencil"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-success" onclick="approveTemplate('${template._id}')" 
                                ${template.approvalStatus === 'APPROVED' ? 'disabled' : ''}>
                            <i class="ti-check"></i>
                        </button>
                        <button type="button" class="btn btn-sm btn-danger" onclick="deleteTemplate('${template._id}')">
                            <i class="ti-trash"></i>
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
        case 'APPROVED':
            return 'badge-success';
        case 'PENDING_APPROVAL':
            return 'badge-warning';
        case 'REJECTED':
            return 'badge-danger';
        case 'DRAFT':
            return 'badge-secondary';
        default:
            return 'badge-secondary';
    }
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
    setTimeout(function () {
        $('.alert').fadeOut();
    }, 5000);
}