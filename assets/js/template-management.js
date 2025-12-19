/**
 * Template Management Module for PharmaSpot
 * Handles communication templates for WhatsApp, SMS, and Email
 */

$(document).ready(function() {
    // Initialize template management functionality
    initializeTemplateManagement();
});

/**
 * Initialize template management functionality
 */
function initializeTemplateManagement() {
    // Check if we're on the template management page
    if (window.location.pathname.includes('template-management')) {
        createTemplateManagementInterface();
        bindTemplateEvents();
        loadTemplates();
    }
}

/**
 * Create template management interface
 */
function createTemplateManagementInterface() {
    const interfaceHtml = `
        <div class="row">
            <div class="col-md-12">
                <div class="panel panel-default">
                    <div class="panel-heading">
                        <h3 class="panel-title">Communication Templates</h3>
                        <div class="panel-actions">
                            <button type="button" class="btn btn-success btn-sm" id="addTemplateBtn">
                                <i class="fa fa-plus"></i> Add Template
                            </button>
                            <button type="button" class="btn btn-info btn-sm" id="initializeDefaultsBtn">
                                <i class="fa fa-refresh"></i> Initialize Defaults
                            </button>
                        </div>
                    </div>
                    <div class="panel-body">
                        <div class="row">
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Filter by Type:</label>
                                    <select class="form-control" id="templateTypeFilter">
                                        <option value="">All Types</option>
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="sms">SMS</option>
                                        <option value="email">Email</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>Filter by Status:</label>
                                    <select class="form-control" id="templateStatusFilter">
                                        <option value="">All Status</option>
                                        <option value="active">Active</option>
                                        <option value="inactive">Inactive</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="form-group">
                                    <label>&nbsp;</label>
                                    <button type="button" class="btn btn-primary btn-block" id="applyFiltersBtn">
                                        <i class="fa fa-filter"></i> Apply Filters
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row" style="margin-top: 15px;">
                            <div class="col-md-12">
                                <div class="table-responsive">
                                    <table class="table table-striped table-hover" id="templatesTable">
                                        <thead>
                                            <tr>
                                                <th>Name</th>
                                                <th>Type</th>
                                                <th>Subject</th>
                                                <th>Status</th>
                                                <th>Default</th>
                                                <th>Created</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td colspan="7" class="text-center">Loading templates...</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add to page content area
    $('.page-content').html(interfaceHtml);
}

/**
 * Create template modal
 */
function createTemplateModal() {
    if ($('#templateModal').length > 0) {
        return; // Modal already exists
    }
    
    const modalHtml = `
        <div class="modal fade" id="templateModal" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-lg" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal">&times;</button>
                        <h4 class="modal-title" id="templateModalTitle">Add Template</h4>
                    </div>
                    <div class="modal-body">
                        <form id="templateForm">
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <label>Template Name <span class="required">*</span></label>
                                        <input type="text" class="form-control" id="templateName" required>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <label>Type <span class="required">*</span></label>
                                        <select class="form-control" id="templateType" required>
                                            <option value="">Select Type</option>
                                            <option value="whatsapp">WhatsApp</option>
                                            <option value="sms">SMS</option>
                                            <option value="email">Email</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-12">
                                    <div class="form-group">
                                        <label>Subject <span class="required">*</span></label>
                                        <input type="text" class="form-control" id="templateSubject" required>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-12">
                                    <div class="form-group">
                                        <label>Content <span class="required">*</span></label>
                                        <textarea class="form-control" id="templateContent" rows="8" required></textarea>
                                        <small class="help-block">
                                            Available variables: {{storeName}}, {{customerName}}, {{invoiceNumber}}, {{amount}}, {{date}}, {{paymentStatus}}, {{items}}, {{storeAddress}}, {{storePhone}}
                                        </small>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <div class="checkbox">
                                            <label>
                                                <input type="checkbox" id="templateActive"> 
                                                Active
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="form-group">
                                        <div class="checkbox">
                                            <label>
                                                <input type="checkbox" id="templateDefault"> 
                                                Set as Default
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div class="row">
                                <div class="col-md-12">
                                    <div class="form-group">
                                        <label>Description:</label>
                                        <textarea class="form-control" id="templateDescription" rows="3"></textarea>
                                    </div>
                                </div>
                            </div>
                            
                            <input type="hidden" id="templateId">
                        </form>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="saveTemplateBtn">
                            <i class="fa fa-save"></i> Save Template
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $('body').append(modalHtml);
}

/**
 * Bind events for template management
 */
function bindTemplateEvents() {
    // Create template modal if not exists
    if ($('#templateModal').length === 0) {
        createTemplateModal();
    }
    
    // Add template button
    $(document).on('click', '#addTemplateBtn', function() {
        openTemplateModal();
    });
    
    // Initialize defaults button
    $(document).on('click', '#initializeDefaultsBtn', function() {
        initializeDefaultTemplates();
    });
    
    // Apply filters button
    $(document).on('click', '#applyFiltersBtn', function() {
        loadTemplates();
    });
    
    // Save template button
    $(document).on('click', '#saveTemplateBtn', function() {
        saveTemplate();
    });
    
    // Edit template buttons
    $(document).on('click', '.edit-template-btn', function() {
        const templateId = $(this).data('template-id');
        editTemplate(templateId);
    });
    
    // Delete template buttons
    $(document).on('click', '.delete-template-btn', function() {
        const templateId = $(this).data('template-id');
        deleteTemplate(templateId);
    });
    
    // Toggle default template buttons
    $(document).on('click', '.toggle-default-btn', function() {
        const templateId = $(this).data('template-id');
        const isDefault = $(this).data('is-default');
        toggleDefaultTemplate(templateId, !isDefault);
    });
}

/**
 * Load templates with current filters
 */
function loadTemplates() {
    const typeFilter = $('#templateTypeFilter').val();
    const statusFilter = $('#templateStatusFilter').val();
    
    let url = '/api/templates/all';
    const params = [];
    
    if (typeFilter) {
        params.push(`type=${typeFilter}`);
    }
    
    if (statusFilter) {
        params.push(statusFilter === 'active' ? 'isActive=true' : 'isActive=false');
    }
    
    if (params.length > 0) {
        url += '?' + params.join('&');
    }
    
    Notiflix.Loading.Standard('Loading templates...');
    
    $.ajax({
        url: url,
        type: 'GET',
        success: function(response) {
            Notiflix.Loading.Remove();
            renderTemplatesTable(response.templates || []);
        },
        error: function() {
            Notiflix.Loading.Remove();
            Notiflix.Report.failure('Error', 'Failed to load templates');
        }
    });
}

/**
 * Render templates table
 */
function renderTemplatesTable(templates) {
    const tbody = $('#templatesTable tbody');
    tbody.empty();
    
    if (templates.length === 0) {
        tbody.append(`
            <tr>
                <td colspan="7" class="text-center">No templates found</td>
            </tr>
        `);
        return;
    }
    
    templates.forEach(template => {
        const row = `
            <tr>
                <td>${template.name}</td>
                <td><span class="label label-${template.type}">${template.type.toUpperCase()}</span></td>
                <td>${template.subject || 'N/A'}</td>
                <td>
                    <span class="label label-${template.isActive ? 'success' : 'danger'}">
                        ${template.isActive ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td>
                    ${template.isDefault ? '<i class="fa fa-star text-warning"></i> Default' : '-'}
                </td>
                <td>${new Date(template.createdAt).toLocaleDateString()}</td>
                <td>
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-info edit-template-btn" data-template-id="${template._id}">
                            <i class="fa fa-edit"></i>
                        </button>
                        <button type="button" class="btn btn-sm ${template.isDefault ? 'btn-warning' : 'btn-default'} toggle-default-btn" 
                                data-template-id="${template._id}" data-is-default="${template.isDefault}">
                            <i class="fa fa-star"></i> ${template.isDefault ? 'Remove Default' : 'Set Default'}
                        </button>
                        <button type="button" class="btn btn-sm btn-danger delete-template-btn" data-template-id="${template._id}">
                            <i class="fa fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

/**
 * Open template modal for adding new template
 */
function openTemplateModal() {
    $('#templateModalTitle').text('Add Template');
    $('#templateForm')[0].reset();
    $('#templateId').val('');
    $('#templateActive').prop('checked', true);
    $('#templateDefault').prop('checked', false);
    $('#templateModal').modal('show');
}

/**
 * Edit existing template
 */
function editTemplate(templateId) {
    Notiflix.Loading.Standard('Loading template...');
    
    $.ajax({
        url: `/api/templates/${templateId}`,
        type: 'GET',
        success: function(template) {
            Notiflix.Loading.Remove();
            $('#templateModalTitle').text('Edit Template');
            $('#templateId').val(template._id);
            $('#templateName').val(template.name);
            $('#templateType').val(template.type);
            $('#templateSubject').val(template.subject);
            $('#templateContent').val(template.content);
            $('#templateDescription').val(template.description || '');
            $('#templateActive').prop('checked', template.isActive);
            $('#templateDefault').prop('checked', template.isDefault);
            $('#templateModal').modal('show');
        },
        error: function() {
            Notiflix.Loading.Remove();
            Notiflix.Report.failure('Error', 'Failed to load template');
        }
    });
}

/**
 * Save template
 */
function saveTemplate() {
    const templateId = $('#templateId').val();
    const isEdit = templateId && templateId !== '';
    
    // Validate form
    if (!$('#templateForm')[0].checkValidity()) {
        Notiflix.Report.warning('Validation Error', 'Please fill in all required fields');
        return;
    }
    
    const templateData = {
        name: $('#templateName').val(),
        type: $('#templateType').val(),
        subject: $('#templateSubject').val(),
        content: $('#templateContent').val(),
        description: $('#templateDescription').val(),
        isActive: $('#templateActive').is(':checked'),
        isDefault: $('#templateDefault').is(':checked')
    };
    
    Notiflix.Loading.Standard(isEdit ? 'Updating template...' : 'Saving template...');
    
    const url = isEdit ? `/api/templates/${templateId}` : '/api/templates/new';
    const method = isEdit ? 'PUT' : 'POST';
    
    $.ajax({
        url: url,
        type: method,
        data: templateData,
        success: function(response) {
            Notiflix.Loading.Remove();
            Notiflix.Report.success('Success', `Template ${isEdit ? 'updated' : 'created'} successfully`);
            $('#templateModal').modal('hide');
            loadTemplates(); // Reload templates
        },
        error: function(xhr) {
            Notiflix.Loading.Remove();
            const error = xhr.responseJSON ? xhr.responseJSON.message : `Failed to ${isEdit ? 'update' : 'create'} template`;
            Notiflix.Report.failure('Error', error);
        }
    });
}

/**
 * Delete template
 */
function deleteTemplate(templateId) {
    Notiflix.Confirm.show(
        'Delete Template',
        'Are you sure you want to delete this template? This action cannot be undone.',
        'Yes, delete it',
        'Cancel',
        function() {
            Notiflix.Loading.Standard('Deleting template...');
            
            $.ajax({
                url: `/api/templates/${templateId}`,
                type: 'DELETE',
                success: function() {
                    Notiflix.Loading.Remove();
                    Notiflix.Report.success('Success', 'Template deleted successfully');
                    loadTemplates(); // Reload templates
                },
                error: function(xhr) {
                    Notiflix.Loading.Remove();
                    const error = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to delete template';
                    Notiflix.Report.failure('Error', error);
                }
            });
        },
        function() {
            // User cancelled
        }
    );
}

/**
 * Toggle default template
 */
function toggleDefaultTemplate(templateId, makeDefault) {
    Notiflix.Loading.Standard('Updating template...');
    
    // First, we need to get the current template to know its type
    $.ajax({
        url: `/api/templates/${templateId}`,
        type: 'GET',
        success: function(template) {
            // Update the template
            $.ajax({
                url: `/api/templates/${templateId}`,
                type: 'PUT',
                data: {
                    ...template,
                    isDefault: makeDefault
                },
                success: function() {
                    Notiflix.Loading.Remove();
                    Notiflix.Report.success('Success', `Template ${makeDefault ? 'set as' : 'removed as'} default`);
                    loadTemplates(); // Reload templates
                },
                error: function(xhr) {
                    Notiflix.Loading.Remove();
                    const error = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to update template';
                    Notiflix.Report.failure('Error', error);
                }
            });
        },
        error: function() {
            Notiflix.Loading.Remove();
            Notiflix.Report.failure('Error', 'Failed to load template');
        }
    });
}

/**
 * Initialize default templates
 */
function initializeDefaultTemplates() {
    Notiflix.Confirm.show(
        'Initialize Default Templates',
        'This will create default templates for WhatsApp, SMS, and Email if they don\'t exist. Continue?',
        'Yes, initialize',
        'Cancel',
        function() {
            Notiflix.Loading.Standard('Initializing default templates...');
            
            $.ajax({
                url: '/api/templates/initialize-defaults',
                type: 'POST',
                success: function(response) {
                    Notiflix.Loading.Remove();
                    Notiflix.Report.success('Success', response.message);
                    loadTemplates(); // Reload templates
                },
                error: function(xhr) {
                    Notiflix.Loading.Remove();
                    const error = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to initialize default templates';
                    Notiflix.Report.failure('Error', error);
                }
            });
        },
        function() {
            // User cancelled
        }
    );
}