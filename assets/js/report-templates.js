/**
 * Report Templates JavaScript module for PharmaSpot
 * Handles report template management and gallery functionality
 */

$(document).ready(function() {
    // Initialize report templates when template gallery tab is shown
    $('a[href="#templateGalleryTab"]').on('shown.bs.tab', function() {
        loadReportTemplates();
    });
    
    // Handle template search
    $('#templateSearch').on('input', function() {
        const searchTerm = $(this).val().toLowerCase();
        filterTemplates(searchTerm);
    });
    
    // Handle category filter
    $('#templateCategoryFilter').on('change', function() {
        const category = $(this).val();
        filterTemplatesByCategory(category);
    });
    
    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
});

/**
 * Load report templates from API
 */
function loadReportTemplates() {
    $.ajax({
        url: '/api/report-templates/templates',
        method: 'GET',
        success: function(response) {
            // Store templates globally
            window.reportTemplates = response.templates;
            
            // Populate template gallery
            renderTemplateGallery(response.templates);
            
            // Populate category filter
            populateCategoryFilter(response.templates);
        },
        error: function(xhr, status, error) {
            console.error('Error loading report templates:', error);
            showNotification('Error loading report templates', 'error');
        }
    });
}

/**
 * Render template gallery
 */
function renderTemplateGallery(templates) {
    const galleryContainer = $('#templateGalleryContent');
    galleryContainer.empty();
    
    if (templates.length === 0) {
        galleryContainer.html('<p class="text-muted">No templates available</p>');
        return;
    }
    
    // Group templates by category
    const templatesByCategory = {};
    templates.forEach(template => {
        if (!templatesByCategory[template.category]) {
            templatesByCategory[template.category] = [];
        }
        templatesByCategory[template.category].push(template);
    });
    
    let galleryHtml = '';
    
    Object.keys(templatesByCategory).sort().forEach(category => {
        galleryHtml += `
            <div class="mb-4">
                <h4 class="mb-3">${category}</h4>
                <div class="row">
        `;
        
        templatesByCategory[category].forEach(template => {
            const isSystem = template.isSystem ? '<span class="badge badge-info">System</span>' : '';
            const chartIcon = template.chartConfig ? '<i class="fa fa-chart-bar text-success"></i>' : '';
            
            galleryHtml += `
                <div class="col-md-4 mb-3">
                    <div class="template-card" onclick="selectTemplateFromGallery('${template._id}')" data-template-id="${template._id}">
                        <div class="card-body">
                            <h5 class="card-title">
                                ${template.name}
                                ${isSystem}
                                <div class="pull-right">${chartIcon}</div>
                            </h5>
                            <p class="template-description">${template.description}</p>
                            <div class="template-meta">
                                <small class="text-muted">
                                    <i class="fa fa-database"></i> ${template.dataSource}<br>
                                    <i class="fa fa-list"></i> ${template.fields.length} fields<br>
                                    <i class="fa fa-calendar"></i> ${new Date(template.createdAt).toLocaleDateString()}
                                </small>
                            </div>
                            <div class="template-actions mt-2">
                                <button type="button" class="btn btn-sm btn-primary" onclick="createReportFromTemplate('${template._id}')">
                                    <i class="fa fa-plus"></i> Create Report
                                </button>
                                ${!template.isSystem ? `
                                <button type="button" class="btn btn-sm btn-info" onclick="editTemplate('${template._id}')" data-toggle="tooltip" title="Edit Template">
                                    <i class="fa fa-edit"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-danger" onclick="deleteTemplate('${template._id}')" data-toggle="tooltip" title="Delete Template">
                                    <i class="fa fa-trash"></i>
                                </button>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        galleryHtml += `
                </div>
            </div>
        `;
    });
    
    galleryContainer.html(galleryHtml);
    
    // Re-initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
}

/**
 * Populate category filter dropdown
 */
function populateCategoryFilter(templates) {
    const categories = [...new Set(templates.map(template => template.category))];
    const categoryFilter = $('#templateCategoryFilter');
    
    categoryFilter.empty();
    categoryFilter.append('<option value="">All Categories</option>');
    
    categories.sort().forEach(category => {
        categoryFilter.append(`<option value="${category}">${category}</option>`);
    });
}

/**
 * Filter templates by search term
 */
function filterTemplates(searchTerm) {
    $('.template-card').each(function() {
        const templateId = $(this).data('template-id');
        const template = window.reportTemplates.find(t => t._id === templateId);
        
        if (!template) return;
        
        const matchesSearch = !searchTerm || 
            template.name.toLowerCase().includes(searchTerm) ||
            template.description.toLowerCase().includes(searchTerm) ||
            template.category.toLowerCase().includes(searchTerm);
        
        $(this).toggle(matchesSearch);
    });
}

/**
 * Filter templates by category
 */
function filterTemplatesByCategory(category) {
    $('.template-card').each(function() {
        const templateId = $(this).data('template-id');
        const template = window.reportTemplates.find(t => t._id === templateId);
        
        if (!template) return;
        
        const matchesCategory = !category || template.category === category;
        $(this).toggle(matchesCategory);
    });
}

/**
 * Select template from gallery
 */
function selectTemplateFromGallery(templateId) {
    const template = window.reportTemplates.find(t => t._id === templateId);
    if (!template) {
        return;
    }
    
    // Highlight selected template
    $('.template-card').removeClass('selected');
    $(`.template-card[data-template-id="${templateId}"]`).addClass('selected');
    
    // Set template in dropdown
    $('#reportTemplate').val(templateId);
    
    // Load template configuration
    loadTemplateConfiguration(templateId);
    
    // Hide gallery and show wizard after a short delay
    setTimeout(() => {
        hideTemplateGallery();
    }, 500);
}

/**
 * Load template configuration
 */
function loadTemplateConfiguration(templateId) {
    $.ajax({
        url: `/api/report-templates/templates/${templateId}`,
        method: 'GET',
        success: function(template) {
            // Populate form with template data
            $('#reportName').val(template.name);
            $('#reportDescription').val(template.description);
            $('#dataSource').val(template.dataSource).trigger('change');
            
            // Wait for fields to load, then select template fields
            setTimeout(() => {
                template.fields.forEach(field => {
                    $(`#field_${field.key}`).prop('checked', true);
                });
                updateSelectedFields();
                
                // Set field formats
                template.fields.forEach(field => {
                    if (field.format) {
                        $(`.field-format[data-field="${field.key}"]`).val(field.format);
                    }
                });
            }, 500);
            
            // Set filters
            if (template.filters) {
                populateFilters(template.filters);
            }
            
            // Set grouping
            if (template.groupBy && template.groupBy.length > 0) {
                $('#enableGrouping').prop('checked', true);
                $('#groupBySection').show();
                template.groupBy.forEach(field => {
                    $(`#groupBy option[value="${field}"]`).prop('selected', true);
                });
            }
            
            // Set sorting
            if (template.sortBy) {
                $('#sortBy').val(template.sortBy.field);
                $('#sortDirection').val(template.sortBy.direction);
            }
            
            // Set chart configuration
            if (template.chartConfig) {
                $('#chartType').val(template.chartConfig.type);
                $('#chartXAxis').val(template.chartConfig.xAxis);
                $('#chartYAxis').val(template.chartConfig.yAxis);
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading template:', error);
            showNotification('Error loading template configuration', 'error');
        }
    });
}

/**
 * Populate filters from template
 */
function populateFilters(filters) {
    if (filters.dateRange) {
        $('#enableDateFilter').prop('checked', true);
    }
    if (filters.customer) {
        $('#enableCustomerFilter').prop('checked', true);
    }
    if (filters.store) {
        $('#enableStoreFilter').prop('checked', true);
    }
    if (filters.category) {
        $('#enableCategoryFilter').prop('checked', true);
    }
    if (filters.status) {
        $('#enableStatusFilter').prop('checked', true);
    }
}

/**
 * Create report from template
 */
function createReportFromTemplate(templateId) {
    const template = window.reportTemplates.find(t => t._id === templateId);
    if (!template) {
        return;
    }
    
    const reportName = prompt('Enter a name for the new report:', `${template.name} (Copy)`);
    if (!reportName) {
        return;
    }
    
    $.ajax({
        url: `/api/report-templates/templates/${templateId}/create-report`,
        method: 'POST',
        data: JSON.stringify({
            reportName: reportName,
            createdBy: 'current_user' // This should come from authentication
        }),
        contentType: 'application/json',
        success: function(response) {
            showNotification('Report created from template successfully', 'success');
            loadExistingReports();
            
            // Switch to "My Reports" tab
            $('a[href="#myReportsTab"]').tab('show');
        },
        error: function(xhr, status, error) {
            console.error('Error creating report from template:', error);
            showNotification('Error creating report: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Edit template
 */
function editTemplate(templateId) {
    // This would open a template editor modal
    showNotification('Template editing functionality to be implemented', 'info');
}

/**
 * Delete template
 */
function deleteTemplate(templateId) {
    const template = window.reportTemplates.find(t => t._id === templateId);
    if (!template) {
        return;
    }
    
    if (!confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
        return;
    }
    
    $.ajax({
        url: `/api/report-templates/templates/${templateId}`,
        method: 'DELETE',
        success: function(response) {
            showNotification('Template deleted successfully', 'success');
            loadReportTemplates();
        },
        error: function(xhr, status, error) {
            console.error('Error deleting template:', error);
            showNotification('Error deleting template: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Initialize system templates
 */
function initializeSystemTemplates() {
    $.ajax({
        url: '/api/report-templates/initialize-system-templates',
        method: 'POST',
        success: function(response) {
            showNotification(`System templates initialized: ${response.inserted} templates added`, 'success');
            if (response.errors && response.errors.length > 0) {
                console.warn('Template initialization errors:', response.errors);
            }
            loadReportTemplates();
        },
        error: function(xhr, status, error) {
            console.error('Error initializing system templates:', error);
            showNotification('Error initializing system templates: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Show template gallery
 */
function showTemplateGallery() {
    // Hide wizard and show gallery
    $('.wizard-container').hide();
    $('#templateGallery').show();
    
    if (!window.reportTemplates || window.reportTemplates.length === 0) {
        loadReportTemplates();
    } else {
        // Render existing templates
        renderTemplateGallery(window.reportTemplates);
    }
}

/**
 * Hide template gallery and show wizard
 */
function hideTemplateGallery() {
    $('#templateGallery').hide();
    $('.wizard-container').show();
}

/**
 * Export functions for global use
 */
window.loadReportTemplates = loadReportTemplates;
window.selectTemplateFromGallery = selectTemplateFromGallery;
window.createReportFromTemplate = createReportFromTemplate;
window.editTemplate = editTemplate;
window.deleteTemplate = deleteTemplate;
window.initializeSystemTemplates = initializeSystemTemplates;
window.showTemplateGallery = showTemplateGallery;
window.hideTemplateGallery = hideTemplateGallery;
window.filterTemplates = filterTemplates;

/**
 * Filter templates based on category and search
 */
function filterTemplates() {
    const category = $('#templateCategory').val().toLowerCase();
    const searchTerm = $('#templateSearch').val().toLowerCase();
    
    if (!window.reportTemplates || window.reportTemplates.length === 0) {
        return;
    }
    
    // Filter templates based on category and search term
    const filteredTemplates = window.reportTemplates.filter(template => {
        const matchesCategory = !category || template.category.toLowerCase() === category;
        const matchesSearch = !searchTerm ||
            template.name.toLowerCase().includes(searchTerm) ||
            template.description.toLowerCase().includes(searchTerm);
        
        return matchesCategory && matchesSearch;
    });
    
    // Re-render gallery with filtered templates
    renderTemplateGallery(filteredTemplates);
}

/**
 * Render template gallery with given templates
 */
function renderTemplateGallery(templates) {
    if (!templates || templates.length === 0) {
        $('#templateGalleryContent').html('<p class="text-muted">No templates found matching your criteria.</p>');
        return;
    }
    
    // Group templates by category
    const templatesByCategory = {};
    templates.forEach(template => {
        if (!templatesByCategory[template.category]) {
            templatesByCategory[template.category] = [];
        }
        templatesByCategory[template.category].push(template);
    });
    
    let galleryHtml = '';
    
    Object.keys(templatesByCategory).sort().forEach(category => {
        galleryHtml += `
            <div class="mb-4">
                <h4 class="mb-3">${category}</h4>
                <div class="row">
        `;
        
        templatesByCategory[category].forEach(template => {
            galleryHtml += `
                <div class="col-md-4 mb-3">
                    <div class="template-card" onclick="selectTemplateFromGallery('${template._id}')">
                        <div class="card-body">
                            <h5 class="card-title">${template.name}</h5>
                            <p class="template-description">${template.description}</p>
                            <div class="template-meta">
                                <small class="text-muted">
                                    <i class="fa fa-database"></i> ${template.dataSource}<br>
                                    <i class="fa fa-list"></i> ${template.fields.length} fields<br>
                                    <i class="fa fa-calendar"></i> ${new Date(template.createdAt).toLocaleDateString()}
                                </small>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        
        galleryHtml += `
                </div>
            </div>
        `;
    });
    
    $('#templateGalleryContent').html(galleryHtml);
}