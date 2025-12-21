/**
 * Custom Reports JavaScript module for PharmaSpot
 * Handles custom report creation, management, and execution
 */

$(document).ready(function () {
    // Initialize custom reports when custom reports tab is shown
    $('a[href="#customReportsTab"]').on('shown.bs.tab', function () {
        initializeCustomReports();
    });

    // Handle report builder wizard navigation
    $('.wizard-next').on('click', function () {
        nextWizardStep();
    });

    $('.wizard-prev').on('click', function () {
        prevWizardStep();
    });

    // Handle data source selection
    $('#dataSource').on('change', function () {
        loadDataSourceFields();
    });

    // Handle field selection
    $('#availableFields').on('change', 'input[type="checkbox"]', function () {
        updateSelectedFields();
    });

    // Handle template selection
    $('#reportTemplate').on('change', function () {
        loadTemplateConfiguration();
    });

    // Handle report type selection
    $('#reportType').on('change', function () {
        updateReportTypeOptions();
    });

    // Handle grouping enable/disable
    $('#enableGrouping').on('change', function () {
        const isChecked = $(this).is(':checked');
        $('#groupBySection').toggle(isChecked);

        if (isChecked) {
            populateGroupByOptions();
        }
    });

    // Handle schedule type change in modal
    $('#scheduleType').on('change', function () {
        const scheduleType = $(this).val();
        if (scheduleType === 'custom') {
            $('#customCronSection').show();
        } else {
            $('#customCronSection').hide();
        }
    });

    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
});

/**
 * Initialize custom reports module
 */
function initializeCustomReports() {
    loadReportTemplates();
    loadDataSourceOptions();
    loadExistingReports();
    resetWizard();
}

/**
 * Reset wizard to first step
 */
function resetWizard() {
    $('.wizard-step').hide();
    $('#step1-dataSource').show();
    $('.wizard-step-indicator').removeClass('active');
    $('#step1-indicator').addClass('active');
    $('.wizard-next').show();
    $('.wizard-prev').hide();
    $('.wizard-finish').hide();
}

/**
 * Navigate to next wizard step
 */
function nextWizardStep() {
    const currentStep = $('.wizard-step:visible').attr('id');

    // Validate current step before proceeding
    if (!validateCurrentStep(currentStep)) {
        return;
    }

    switch (currentStep) {
        case 'step1-dataSource':
            $('#step1-dataSource').hide();
            $('#step2-fields').show();
            $('#step1-indicator').removeClass('active').addClass('completed');
            $('#step2-indicator').addClass('active');
            $('.wizard-prev').show();
            break;
        case 'step2-fields':
            $('#step2-fields').hide();
            $('#step3-filters').show();
            $('#step2-indicator').removeClass('active').addClass('completed');
            $('#step3-indicator').addClass('active');
            break;
        case 'step3-filters':
            $('#step3-filters').hide();
            $('#step4-grouping').show();
            $('#step3-indicator').removeClass('active').addClass('completed');
            $('#step4-indicator').addClass('active');
            break;
        case 'step4-grouping':
            $('#step4-grouping').hide();
            $('#step5-configuration').show();
            $('#step4-indicator').removeClass('active').addClass('completed');
            $('#step5-indicator').addClass('active');
            $('.wizard-next').hide();
            $('.wizard-finish').show();

            // Populate configuration options
            populateConfigurationOptions();
            break;
    }
}

/**
 * Navigate to previous wizard step
 */
function prevWizardStep() {
    const currentStep = $('.wizard-step:visible').attr('id');

    switch (currentStep) {
        case 'step2-fields':
            $('#step2-fields').hide();
            $('#step1-dataSource').show();
            $('#step2-indicator').removeClass('active');
            $('#step1-indicator').removeClass('completed').addClass('active');
            $('.wizard-prev').hide();
            break;
        case 'step3-filters':
            $('#step3-filters').hide();
            $('#step2-fields').show();
            $('#step3-indicator').removeClass('active');
            $('#step2-indicator').removeClass('completed').addClass('active');
            break;
        case 'step4-grouping':
            $('#step4-grouping').hide();
            $('#step3-filters').show();
            $('#step4-indicator').removeClass('active');
            $('#step3-indicator').removeClass('completed').addClass('active');
            break;
        case 'step5-configuration':
            $('#step5-configuration').hide();
            $('#step4-grouping').show();
            $('#step5-indicator').removeClass('active');
            $('#step4-indicator').removeClass('completed').addClass('active');
            $('.wizard-next').show();
            $('.wizard-finish').hide();
            break;
    }
}

/**
 * Validate current wizard step
 */
function validateCurrentStep(step) {
    switch (step) {
        case 'step1-dataSource':
            const dataSource = $('#dataSource').val();
            if (!dataSource) {
                showNotification('Please select a data source', 'error');
                return false;
            }
            break;
        case 'step2-fields':
            const selectedFields = $('#selectedFieldsList .field-item').length;
            if (selectedFields === 0) {
                showNotification('Please select at least one field', 'error');
                return false;
            }
            break;
    }
    return true;
}

/**
 * Load data source options
 */
function loadDataSourceOptions() {
    $.ajax({
        url: './api/report-execution/data-sources',
        method: 'GET',
        success: function (response) {
            const dataSourceSelect = $('#dataSource');
            dataSourceSelect.empty();
            dataSourceSelect.append('<option value="">Select Data Source</option>');

            response.dataSources.forEach(ds => {
                dataSourceSelect.append(`<option value="${ds.id}">${ds.name}</option>`);
            });

            // Store data sources for later use
            window.availableDataSources = response.dataSources;
        },
        error: function (xhr, status, error) {
            console.error('Error loading data sources:', error);
            showNotification('Error loading data sources', 'error');
        }
    });
}

/**
 * Load fields for selected data source
 */
function loadDataSourceFields() {
    const dataSourceId = $('#dataSource').val();

    if (!dataSourceId) {
        $('#availableFields').empty();
        return;
    }

    const dataSource = window.availableDataSources.find(ds => ds.id === dataSourceId);
    if (!dataSource) {
        return;
    }

    const availableFieldsContainer = $('#availableFields');
    availableFieldsContainer.empty();

    dataSource.fields.forEach(field => {
        const fieldHtml = `
            <div class="field-item">
                <div class="custom-control custom-checkbox">
                    <input type="checkbox" class="custom-control-input field-checkbox" 
                           id="field_${field.key}" value="${field.key}" 
                           data-field='${JSON.stringify(field).replace(/'/g, "'")}'>
                    <label class="custom-control-label" for="field_${field.key}">
                        <strong>${field.label}</strong>
                        <small class="text-muted">(${field.type})</small>
                    </label>
                </div>
                ${field.description ? `<small class="text-muted d-block ml-4">${field.description}</small>` : ''}
            </div>
        `;
        availableFieldsContainer.append(fieldHtml);
    });
}

/**
 * Update selected fields list
 */
function updateSelectedFields() {
    const selectedFieldsList = $('#selectedFieldsList');
    selectedFieldsList.empty();

    $('.field-checkbox:checked').each(function () {
        const fieldData = JSON.parse($(this).attr('data-field'));
        const fieldKey = $(this).val();

        const fieldItem = `
            <div class="field-item selected-field" data-field-key="${fieldKey}">
                <div class="d-flex justify-content-between align-items-center">
                    <div>
                        <strong>${fieldData.label}</strong>
                        <small class="text-muted">(${fieldData.type})</small>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-danger remove-field" 
                            onclick="removeField('${fieldKey}')">
                        <i class="fa fa-times"></i>
                    </button>
                </div>
                ${fieldData.type === 'date' || fieldData.type === 'currency' || fieldData.type === 'number' ? `
                <div class="mt-2">
                    <small class="text-muted">Format:</small>
                    <input type="text" class="form-control form-control-sm field-format" 
                           data-field="${fieldKey}" placeholder="e.g., YYYY-MM-DD, $#,##0.00">
                </div>
                ` : ''}
            </div>
        `;
        selectedFieldsList.append(fieldItem);
    });
}

/**
 * Remove field from selection
 */
function removeField(fieldKey) {
    $(`#field_${fieldKey}`).prop('checked', false);
    updateSelectedFields();
}

/**
 * Load report templates
 */
function loadReportTemplates() {
    $.ajax({
        url: './api/report-templates/templates',
        method: 'GET',
        success: function (response) {
            const templateSelect = $('#reportTemplate');
            templateSelect.empty();
            templateSelect.append('<option value="">Create Custom Report</option>');

            // Store templates globally
            window.reportTemplates = response.templates;

            // Group templates by category
            const templatesByCategory = {};
            response.templates.forEach(template => {
                if (!templatesByCategory[template.category]) {
                    templatesByCategory[template.category] = [];
                }
                templatesByCategory[template.category].push(template);
            });

            Object.keys(templatesByCategory).sort().forEach(category => {
                const optgroup = `<optgroup label="${category}">`;
                templateSelect.append(optgroup);

                templatesByCategory[category].forEach(template => {
                    templateSelect.append(`<option value="${template._id}">${template.name}</option>`);
                });
            });
        },
        error: function (xhr, status, error) {
            console.error('Error loading report templates:', error);
            showNotification('Error loading report templates', 'error');
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
        $('#templateGalleryContent').html('<p class="text-muted">No templates available</p>');
        return;
    }

    // Group templates by category
    const templatesByCategory = {};
    window.reportTemplates.forEach(template => {
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

/**
 * Hide template gallery and show wizard
 */
function hideTemplateGallery() {
    $('#templateGallery').hide();
    $('.wizard-container').show();
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
    $(`.template-card:has([onclick*="${templateId}"])`).addClass('selected');

    // Set template in dropdown
    $('#reportTemplate').val(templateId);

    // Load template configuration
    loadTemplateConfiguration();

    // Hide gallery and show wizard after a short delay
    setTimeout(() => {
        hideTemplateGallery();
    }, 500);
}

/**
 * Create report from template
 */
function createReportFromTemplate(templateId) {
    const template = window.reportTemplates.find(t => t._id === templateId);
    if (!template) {
        return;
    }

    // Create a copy of the template as a new report
    const reportData = {
        name: `${template.name} (Copy)`,
        description: template.description,
        dataSource: template.dataSource,
        fields: template.fields,
        filters: template.filters || {},
        groupBy: template.groupBy || [],
        sortBy: template.sortBy || { field: '', direction: 'asc' },
        createdBy: 'current_user'
    };

    $.ajax({
        url: './api/custom-reports/reports',
        method: 'POST',
        data: JSON.stringify(reportData),
        contentType: 'application/json',
        success: function (response) {
            showNotification('Report created from template successfully', 'success');
            loadExistingReports();
            hideTemplateGallery();
        },
        error: function (xhr, status, error) {
            console.error('Error creating report from template:', error);
            showNotification('Error creating report: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Load template configuration
 */
function loadTemplateConfiguration() {
    const templateId = $('#reportTemplate').val();

    if (!templateId) {
        resetWizard();
        return;
    }

    $.ajax({
        url: `/api/report-templates/templates/${templateId}`,
        method: 'GET',
        success: function (template) {
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
        },
        error: function (xhr, status, error) {
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
}

/**
 * Load existing reports
 */
function loadExistingReports() {
    $.ajax({
        url: './api/custom-reports/reports',
        method: 'GET',
        success: function (response) {
            const reportsList = $('#existingReportsList');
            reportsList.empty();

            if (response.reports.length === 0) {
                reportsList.html('<p class="text-muted">No custom reports found. Create your first report!</p>');
                return;
            }

            response.reports.forEach(report => {
                const reportItem = `
                    <div class="card mb-2">
                        <div class="card-body">
                            <div class="d-flex justify-content-between align-items-start">
                                <div>
                                    <h6 class="card-title">${report.name}</h6>
                                    <p class="card-text text-muted small">${report.description}</p>
                                    <small class="text-muted">
                                        Data Source: ${report.dataSource} | 
                                        Created: ${new Date(report.createdAt).toLocaleDateString()}
                                    </small>
                                </div>
                                <div class="btn-group">
                                    <button type="button" class="btn btn-sm btn-primary" 
                                            onclick="executeReport('${report._id}')">
                                        <i class="fa fa-play"></i> Run
                                    </button>
                                    <button type="button" class="btn btn-sm btn-info" 
                                            onclick="editReport('${report._id}')">
                                        <i class="fa fa-edit"></i> Edit
                                    </button>
                                    <button type="button" class="btn btn-sm btn-danger" 
                                            onclick="deleteReport('${report._id}')">
                                        <i class="fa fa-trash"></i> Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
                reportsList.append(reportItem);
            });
        },
        error: function (xhr, status, error) {
            console.error('Error loading existing reports:', error);
            showNotification('Error loading existing reports', 'error');
        }
    });
}

/**
 * Populate group by options
 */
function populateGroupByOptions() {
    const groupBySelect = $('#groupBy');
    groupBySelect.empty();

    $('.field-checkbox:checked').each(function () {
        const fieldData = JSON.parse($(this).attr('data-field'));
        const fieldKey = $(this).val();

        // Only add text/date fields as grouping options
        if (fieldData.type === 'text' || fieldData.type === 'date') {
            groupBySelect.append(`<option value="${fieldKey}">${fieldData.label}</option>`);
        }
    });
}

/**
 * Populate configuration options
 */
function populateConfigurationOptions() {
    const sortBySelect = $('#sortBy');
    const chartXAxisSelect = $('#chartXAxis');
    const chartYAxisSelect = $('#chartYAxis');

    // Clear existing options
    sortBySelect.empty();
    chartXAxisSelect.empty();
    chartYAxisSelect.empty();

    // Populate with selected fields
    $('.field-checkbox:checked').each(function () {
        const fieldData = JSON.parse($(this).attr('data-field'));
        const fieldKey = $(this).val();

        sortBySelect.append(`<option value="${fieldKey}">${fieldData.label}</option>`);

        // For chart axes, add all fields
        chartXAxisSelect.append(`<option value="${fieldKey}">${fieldData.label}</option>`);
        chartYAxisSelect.append(`<option value="${fieldKey}">${fieldData.label}</option>`);
    });
}

/**
 * Update report type options
 */
function updateReportTypeOptions() {
    const reportType = $('#reportType').val();

    // Show/hide chart configuration based on report type
    if (reportType === 'chart') {
        $('.chart-configuration').show();
    } else {
        $('.chart-configuration').hide();
    }
}

/**
 * Save custom report
 */
function saveCustomReport() {
    const reportName = $('#reportName').val().trim();
    const reportDescription = $('#reportDescription').val().trim();
    const dataSource = $('#dataSource').val();

    if (!reportName || !dataSource) {
        showNotification('Report name and data source are required', 'error');
        return;
    }

    // Collect selected fields
    const selectedFields = [];
    $('.field-checkbox:checked').each(function () {
        const fieldData = JSON.parse($(this).attr('data-field'));
        const fieldKey = $(this).val();
        const format = $(`.field-format[data-field="${fieldKey}"]`).val();

        selectedFields.push({
            ...fieldData,
            format: format || undefined
        });
    });

    if (selectedFields.length === 0) {
        showNotification('Please select at least one field', 'error');
        return;
    }

    // Collect filters
    const filters = {
        dateRange: $('#enableDateFilter').is(':checked'),
        customer: $('#enableCustomerFilter').is(':checked'),
        store: $('#enableStoreFilter').is(':checked'),
        category: $('#enableCategoryFilter').is(':checked')
    };

    // Collect grouping
    const groupBy = [];
    if ($('#enableGrouping').is(':checked')) {
        $('#groupBy option:selected').each(function () {
            groupBy.push($(this).val());
        });
    }

    // Collect sorting
    const sortBy = {
        field: $('#sortBy').val(),
        direction: $('#sortDirection').val()
    };

    // Collect chart configuration
    const chartConfig = $('#chartType').val() ? {
        type: $('#chartType').val(),
        xAxis: $('#chartXAxis').val(),
        yAxis: $('#chartYAxis').val()
    } : null;

    const reportData = {
        name: reportName,
        description: reportDescription,
        dataSource: dataSource,
        fields: selectedFields,
        filters: filters,
        groupBy: groupBy,
        sortBy: sortBy,
        chartConfig: chartConfig,
        createdBy: 'current_user' // This should come from authentication
    };

    const saveBtn = $('.wizard-finish');
    const originalText = saveBtn.html();
    saveBtn.html('<i class="fa fa-spinner fa-spin"></i> Saving...').prop('disabled', true);

    $.ajax({
        url: './api/custom-reports/reports',
        method: 'POST',
        data: JSON.stringify(reportData),
        contentType: 'application/json',
        success: function (response) {
            showNotification('Report saved successfully', 'success');
            resetWizard();
            loadExistingReports();
            saveBtn.html(originalText).prop('disabled', false);
        },
        error: function (xhr, status, error) {
            console.error('Error saving report:', error);
            showNotification('Error saving report: ' + (xhr.responseJSON?.message || error), 'error');
            saveBtn.html(originalText).prop('disabled', false);
        }
    });
}

/**
 * Execute report
 */
function executeReport(reportId) {
    // Show report execution modal
    $('#reportExecutionModal').modal('show');

    // Load report configuration
    $.ajax({
        url: `/api/custom-reports/reports/${reportId}`,
        method: 'GET',
        success: function (report) {
            // Set up execution form
            $('#executionReportName').text(report.name);
            $('#executionReportId').val(reportId);

            // Show filter options based on report configuration
            if (report.filters.dateRange) {
                $('#dateFilterSection').show();
            } else {
                $('#dateFilterSection').hide();
            }

            // Set default date range
            const today = new Date();
            const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
            $('#executionStartDate').val(lastMonth.toISOString().split('T')[0]);
            $('#executionEndDate').val(today.toISOString().split('T')[0]);
        },
        error: function (xhr, status, error) {
            console.error('Error loading report:', error);
            showNotification('Error loading report configuration', 'error');
            $('#reportExecutionModal').modal('hide');
        }
    });
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

    const filters = {};
    if (startDate && endDate) {
        filters.dateRange = { start: startDate, end: endDate };
    }

    const executeBtn = $('#executeReportBtn');
    const originalText = executeBtn.html();
    executeBtn.html('<i class="fa fa-spinner fa-spin"></i> Executing...').prop('disabled', true);

    $.ajax({
        url: './api/report-execution/execute',
        method: 'POST',
        data: JSON.stringify({
            reportId: reportId,
            filters: filters,
            page: page,
            limit: limit
        }),
        contentType: 'application/json',
        success: function (response) {
            displayReportResults(response);
            $('#reportExecutionModal').modal('hide');
            $('#reportResultsModal').modal('show');
            executeBtn.html(originalText).prop('disabled', false);
        },
        error: function (xhr, status, error) {
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
 * Edit report
 */
function editReport(reportId) {
    // This would open the wizard with existing report data
    showNotification('Edit functionality to be implemented', 'info');
}

/**
 * Delete report
 */
function deleteReport(reportId) {
    if (!confirm('Are you sure you want to delete this report?')) {
        return;
    }

    $.ajax({
        url: `/api/custom-reports/reports/${reportId}`,
        method: 'DELETE',
        success: function (response) {
            showNotification('Report deleted successfully', 'success');
            loadExistingReports();
        },
        error: function (xhr, status, error) {
            console.error('Error deleting report:', error);
            showNotification('Error deleting report: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Export report data
 */
function exportReportData(format) {
    if (!window.currentReportResult || !window.currentReportResult.data) {
        showNotification('No data available for export', 'error');
        return;
    }

    const reportName = $('#resultsReportName').text() || 'report';
    const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const filename = `${reportName}_${timestamp}`;

    switch (format) {
        case 'csv':
            exportToCSV(window.currentReportResult.data, filename);
            break;
        case 'excel':
            exportToExcel(window.currentReportResult.data, filename);
            break;
        case 'pdf':
            exportToPDF(window.currentReportResult.data, filename);
            break;
        case 'json':
            exportToJSON(window.currentReportResult.data, filename);
            break;
        default:
            showNotification('Unsupported export format', 'error');
    }
}

/**
 * Export data to CSV
 */
function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }

    const headers = Object.keys(data[0]);
    let csvContent = headers.join(',') + '\n';

    data.forEach(row => {
        const values = headers.map(header => {
            const value = row[header];
            // Handle values with commas or quotes
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
        });
        csvContent += values.join(',') + '\n';
    });

    downloadFile(csvContent, `${filename}.csv`, 'text/csv');
}

/**
 * Export data to Excel
 */
function exportToExcel(data, filename) {
    if (!data || data.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }

    $.ajax({
        url: './api/report-export/excel',
        method: 'POST',
        data: JSON.stringify({ data: data }),
        contentType: 'application/json',
        xhrFields: {
            responseType: 'blob'
        },
        success: function (blob) {
            downloadFile(blob, `${filename}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        },
        error: function (xhr, status, error) {
            console.error('Error exporting to Excel:', error);
            showNotification('Error exporting to Excel: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Export data to PDF
 */
function exportToPDF(data, filename) {
    if (!data || data.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }

    $.ajax({
        url: './api/report-export/pdf',
        method: 'POST',
        data: JSON.stringify({ data: data }),
        contentType: 'application/json',
        xhrFields: {
            responseType: 'blob'
        },
        success: function (blob) {
            downloadFile(blob, `${filename}.pdf`, 'application/pdf');
        },
        error: function (xhr, status, error) {
            console.error('Error exporting to PDF:', error);
            showNotification('Error exporting to PDF: ' + (xhr.responseJSON?.message || error), 'error');
        }
    });
}

/**
 * Export data to JSON
 */
function exportToJSON(data, filename) {
    if (!data || data.length === 0) {
        showNotification('No data to export', 'error');
        return;
    }

    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, `${filename}.json`, 'application/json');
}

/**
 * Download file to user's computer
 */
function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
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
 * Update chart type
 */
function updateChartType() {
    const chartType = $('#chartTypeSelector').val();
    if (!window.currentReportResult || !window.currentReportResult.data) {
        return;
    }

    // Update chart with new type
    renderChart(window.currentReportResult.data, chartType);
}

/**
 * Render chart
 */
function renderChart(data, chartType) {
    const canvas = document.getElementById('reportChart');
    if (!canvas) {
        return;
    }

    // Destroy existing chart if it exists
    if (window.currentChart) {
        window.currentChart.destroy();
    }

    const ctx = canvas.getContext('2d');

    // Prepare chart data based on type
    let chartConfig = {
        type: chartType,
        data: prepareChartData(data, chartType),
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: $('#resultsReportName').text() || 'Report Chart'
                }
            }
        }
    };

    // Add specific options based on chart type
    if (chartType === 'pie' || chartType === 'doughnut') {
        chartConfig.options.plugins.legend.position = 'right';
    } else if (chartType === 'line' || chartType === 'bar') {
        chartConfig.options.scales = {
            y: {
                beginAtZero: true
            }
        };
    }

    window.currentChart = new Chart(ctx, chartConfig);
}

/**
 * Prepare chart data
 */
function prepareChartData(data, chartType) {
    if (!data || data.length === 0) {
        return { labels: [], datasets: [] };
    }

    // For simplicity, use first two columns for chart
    const keys = Object.keys(data[0]);
    const labelKey = keys[0];
    const valueKey = keys[1] || keys[0];

    if (chartType === 'pie' || chartType === 'doughnut') {
        // Aggregate data for pie/doughnut charts
        const aggregated = {};
        data.forEach(row => {
            const key = row[labelKey];
            aggregated[key] = (aggregated[key] || 0) + parseFloat(row[valueKey] || 0);
        });

        return {
            labels: Object.keys(aggregated),
            datasets: [{
                data: Object.values(aggregated),
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                    '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF9F40'
                ]
            }]
        };
    } else {
        // Line/bar chart data
        return {
            labels: data.map(row => row[labelKey]),
            datasets: [{
                label: valueKey,
                data: data.map(row => parseFloat(row[valueKey] || 0)),
                backgroundColor: chartType === 'bar' ? '#36A2EB' : 'transparent',
                borderColor: '#36A2EB',
                borderWidth: 2,
                fill: chartType === 'line' ? false : true
            }]
        };
    }
}

/**
 * Download chart
 */
function downloadChart() {
    const canvas = document.getElementById('reportChart');
    if (!canvas) {
        showNotification('No chart to download', 'error');
        return;
    }

    // Convert canvas to blob and download
    canvas.toBlob(function (blob) {
        const filename = `chart_${new Date().toISOString().slice(0, 10)}.png`;
        downloadFile(blob, filename, 'image/png');
    });
}

/**
 * Export functions for global use
 */
window.nextWizardStep = nextWizardStep;
window.prevWizardStep = prevWizardStep;
window.saveCustomReport = saveCustomReport;
window.executeReport = executeReport;
window.runReportExecution = runReportExecution;
window.editReport = editReport;
window.deleteReport = deleteReport;
window.removeField = removeField;
window.exportReportData = exportReportData;
window.refreshReportResults = refreshReportResults;
window.updateChartType = updateChartType;
window.downloadChart = downloadChart;
window.showTemplateGallery = showTemplateGallery;
window.hideTemplateGallery = hideTemplateGallery;
window.selectTemplateFromGallery = selectTemplateFromGallery;
window.createReportFromTemplate = createReportFromTemplate;
window.showNotification = showNotification;
window.switchView = switchView;

/**
 * Switch between different result views
 */
function switchView(viewType) {
    // Hide all views first
    $('#tabularResults').hide();
    $('#chartResults').hide();
    $('#summaryResults').hide();

    // Remove active class from all view buttons
    $('#tabularViewBtn').removeClass('active');
    $('#chartViewBtn').removeClass('active');
    $('#summaryViewBtn').removeClass('active');

    // Show selected view and activate button
    switch (viewType) {
        case 'tabular':
            $('#tabularResults').show();
            $('#tabularViewBtn').addClass('active');
            $('#chartOptionsGroup').hide();
            break;
        case 'chart':
            $('#chartResults').show();
            $('#chartViewBtn').addClass('active');
            $('#chartOptionsGroup').show();
            // If chart hasn't been rendered yet, render it
            if (!window.currentChart && window.currentReportResult && window.currentReportResult.data) {
                const chartType = $('#chartType').val() || 'bar';
                renderChart(window.currentReportResult.data, chartType);
            }
            break;
        case 'summary':
            $('#summaryResults').show();
            $('#summaryViewBtn').addClass('active');
            $('#chartOptionsGroup').hide();
            break;
    }
}