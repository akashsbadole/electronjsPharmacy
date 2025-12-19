# Report Builder User Interface Design

## Overview

This document defines the user interface design for the PharmaSoft custom report builder. The design focuses on simplicity and ease of use while providing comprehensive functionality for report selection, configuration, and filtering. The UI follows the existing PharmaSoft design patterns and Bootstrap framework.

## Design Principles

1. **Simplicity First**: Easy-to-use interface for non-technical users
2. **Consistency**: Follows existing PharmaSoft UI patterns
3. **Progressive Disclosure**: Show complexity only when needed
4. **Responsive Design**: Works on desktop and tablet devices
5. **Performance**: Fast loading and smooth interactions

## Main Interface Components

### 1. Report Builder Dashboard

#### 1.1 Dashboard Layout
```html
<!-- Main Report Builder Dashboard -->
<div class="content-wrapper">
  <!-- Content Header -->
  <div class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1 class="m-0">Report Builder</h1>
        </div>
        <div class="col-sm-6">
          <ol class="breadcrumb float-sm-right">
            <li class="breadcrumb-item"><a href="#">Home</a></li>
            <li class="breadcrumb-item active">Reports</li>
          </ol>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <section class="content">
    <div class="container-fluid">
      
      <!-- Quick Actions -->
      <div class="row mb-3">
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <div class="row">
                <div class="col-md-3">
                  <button class="btn btn-primary btn-block" onclick="showQuickReport()">
                    <i class="fas fa-plus"></i> Quick Report
                  </button>
                </div>
                <div class="col-md-3">
                  <button class="btn btn-success btn-block" onclick="showTemplateGallery()">
                    <i class="fas fa-th-large"></i> Template Gallery
                  </button>
                </div>
                <div class="col-md-3">
                  <button class="btn btn-info btn-block" onclick="showMyReports()">
                    <i class="fas fa-folder"></i> My Reports
                  </button>
                </div>
                <div class="col-md-3">
                  <button class="btn btn-warning btn-block" onclick="showScheduledReports()">
                    <i class="fas fa-clock"></i> Scheduled
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Reports -->
      <div class="row">
        <div class="col-md-8">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Recent Reports</h3>
              <div class="card-tools">
                <button type="button" class="btn btn-tool" data-card-widget="collapse">
                  <i class="fas fa-minus"></i>
                </button>
              </div>
            </div>
            <div class="card-body">
              <div class="table-responsive">
                <table class="table table-bordered table-striped">
                  <thead>
                    <tr>
                      <th>Report Name</th>
                      <th>Type</th>
                      <th>Generated</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="recent-reports-tbody">
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Popular Templates</h3>
            </div>
            <div class="card-body">
              <div id="popular-templates">
                <!-- Populated dynamically -->
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </section>
</div>
```

#### 1.2 Dashboard JavaScript
```javascript
// Report Builder Dashboard Controller
class ReportBuilderDashboard {
  constructor() {
    this.initializeEventListeners();
    this.loadRecentReports();
    this.loadPopularTemplates();
  }

  initializeEventListeners() {
    // Quick report button
    document.getElementById('quick-report-btn').addEventListener('click', () => {
      this.showQuickReportModal();
    });

    // Template gallery button
    document.getElementById('template-gallery-btn').addEventListener('click', () => {
      this.showTemplateGallery();
    });

    // My reports button
    document.getElementById('my-reports-btn').addEventListener('click', () => {
      this.showMyReports();
    });

    // Scheduled reports button
    document.getElementById('scheduled-reports-btn').addEventListener('click', () => {
      this.showScheduledReports();
    });
  }

  async loadRecentReports() {
    try {
      const response = await fetch('/api/reports-builder/executions?limit=10');
      const result = await response.json();
      
      if (result.success) {
        this.renderRecentReports(result.data);
      }
    } catch (error) {
      console.error('Error loading recent reports:', error);
      this.showError('Failed to load recent reports');
    }
  }

  renderRecentReports(reports) {
    const tbody = document.getElementById('recent-reports-tbody');
    
    if (reports.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="text-center">No recent reports found</td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = reports.map(report => `
      <tr>
        <td>${report.configurationName || 'Untitled Report'}</td>
        <td><span class="badge badge-info">${report.templateName}</span></td>
        <td>${this.formatDate(report.executedAt)}</td>
        <td>${this.getStatusBadge(report.executionStatus)}</td>
        <td>
          <div class="btn-group btn-group-sm">
            <button class="btn btn-outline-primary" onclick="viewReport('${report._id}')">
              <i class="fas fa-eye"></i>
            </button>
            <button class="btn btn-outline-success" onclick="downloadReport('${report._id}')" 
                    ${report.executionStatus !== 'completed' ? 'disabled' : ''}>
              <i class="fas fa-download"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  async loadPopularTemplates() {
    try {
      const response = await fetch('/api/reports-builder/templates?limit=5&sortBy=usageCount');
      const result = await response.json();
      
      if (result.success) {
        this.renderPopularTemplates(result.data);
      }
    } catch (error) {
      console.error('Error loading popular templates:', error);
    }
  }

  renderPopularTemplates(templates) {
    const container = document.getElementById('popular-templates');
    
    container.innerHTML = templates.map(template => `
      <div class="mb-3">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <h6 class="mb-1">
              <i class="${template.icon} mr-2"></i>${template.name}
            </h6>
            <small class="text-muted">${template.description}</small>
          </div>
          <button class="btn btn-sm btn-outline-primary" onclick="useTemplate('${template._id}')">
            Use
          </button>
        </div>
      </div>
    `).join('');
  }

  formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
  }

  getStatusBadge(status) {
    const badges = {
      'completed': '<span class="badge badge-success">Completed</span>',
      'running': '<span class="badge badge-info">Running</span>',
      'failed': '<span class="badge badge-danger">Failed</span>',
      'pending': '<span class="badge badge-warning">Pending</span>'
    };
    return badges[status] || '<span class="badge badge-secondary">Unknown</span>';
  }

  showError(message) {
    // Show error notification
    toastr.error(message);
  }
}

// Initialize dashboard when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.reportDashboard = new ReportBuilderDashboard();
});
```

### 2. Template Gallery

#### 2.1 Template Gallery Layout
```html
<!-- Template Gallery Modal -->
<div class="modal fade" id="templateGalleryModal" tabindex="-1" role="dialog">
  <div class="modal-dialog modal-xl" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Report Templates</h5>
        <button type="button" class="close" data-dismiss="modal">
          <span>&times;</span>
        </button>
      </div>
      <div class="modal-body">
        
        <!-- Category Filter -->
        <div class="row mb-3">
          <div class="col-12">
            <div class="btn-group w-100" role="group">
              <button type="button" class="btn btn-outline-primary active" data-category="all">
                All Templates
              </button>
              <button type="button" class="btn btn-outline-primary" data-category="sales">
                <i class="fas fa-shopping-cart mr-1"></i> Sales
              </button>
              <button type="button" class="btn btn-outline-primary" data-category="inventory">
                <i class="fas fa-warehouse mr-1"></i> Inventory
              </button>
              <button type="button" class="btn btn-outline-primary" data-category="customers">
                <i class="fas fa-users mr-1"></i> Customers
              </button>
              <button type="button" class="btn btn-outline-primary" data-category="financial">
                <i class="fas fa-money-bill mr-1"></i> Financial
              </button>
            </div>
          </div>
        </div>

        <!-- Search Bar -->
        <div class="row mb-3">
          <div class="col-12">
            <div class="input-group">
              <input type="text" class="form-control" id="template-search" 
                     placeholder="Search templates...">
              <div class="input-group-append">
                <button class="btn btn-outline-secondary" type="button">
                  <i class="fas fa-search"></i>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Templates Grid -->
        <div class="row" id="templates-grid">
          <!-- Populated dynamically -->
        </div>

      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      </div>
    </div>
  </div>
</div>
```

#### 2.2 Template Gallery JavaScript
```javascript
// Template Gallery Controller
class TemplateGallery {
  constructor() {
    this.templates = [];
    this.filteredTemplates = [];
    this.currentCategory = 'all';
    this.searchTerm = '';
    
    this.initializeEventListeners();
    this.loadTemplates();
  }

  initializeEventListeners() {
    // Category filter buttons
    document.querySelectorAll('[data-category]').forEach(button => {
      button.addEventListener('click', (e) => {
        this.filterByCategory(e.target.dataset.category);
        this.updateActiveButton(e.target);
      });
    });

    // Search input
    document.getElementById('template-search').addEventListener('input', (e) => {
      this.searchTerm = e.target.value.toLowerCase();
      this.filterTemplates();
    });
  }

  async loadTemplates() {
    try {
      const response = await fetch('/api/reports-builder/templates');
      const result = await response.json();
      
      if (result.success) {
        this.templates = result.data;
        this.filteredTemplates = this.templates;
        this.renderTemplates();
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      this.showError('Failed to load templates');
    }
  }

  filterByCategory(category) {
    this.currentCategory = category;
    this.filterTemplates();
  }

  filterTemplates() {
    this.filteredTemplates = this.templates.filter(template => {
      const matchesCategory = this.currentCategory === 'all' || template.category === this.currentCategory;
      const matchesSearch = this.searchTerm === '' || 
                           template.name.toLowerCase().includes(this.searchTerm) ||
                           template.description.toLowerCase().includes(this.searchTerm);
      
      return matchesCategory && matchesSearch;
    });
    
    this.renderTemplates();
  }

  renderTemplates() {
    const grid = document.getElementById('templates-grid');
    
    if (this.filteredTemplates.length === 0) {
      grid.innerHTML = `
        <div class="col-12 text-center py-5">
          <i class="fas fa-search fa-3x text-muted mb-3"></i>
          <h5 class="text-muted">No templates found</h5>
          <p class="text-muted">Try adjusting your search or filter criteria</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.filteredTemplates.map(template => `
      <div class="col-md-6 col-lg-4 mb-3">
        <div class="card template-card h-100" data-template-id="${template._id}">
          <div class="card-body">
            <div class="d-flex align-items-center mb-2">
              <i class="${template.icon} fa-2x text-primary mr-3"></i>
              <div>
                <h6 class="card-title mb-0">${template.name}</h6>
                <small class="text-muted">${template.category}</small>
              </div>
            </div>
            <p class="card-text text-muted small">${template.description}</p>
            <div class="d-flex justify-content-between align-items-center">
              <small class="text-muted">
                <i class="fas fa-chart-bar mr-1"></i> ${template.columns.length} columns
              </small>
              <small class="text-muted">
                <i class="fas fa-fire mr-1"></i> ${template.usageCount || 0} uses
              </small>
            </div>
          </div>
          <div class="card-footer bg-transparent">
            <div class="btn-group btn-group-sm w-100">
              <button class="btn btn-outline-primary" onclick="previewTemplate('${template._id}')">
                <i class="fas fa-eye mr-1"></i> Preview
              </button>
              <button class="btn btn-primary" onclick="useTemplate('${template._id}')">
                <i class="fas fa-plus mr-1"></i> Use
              </button>
            </div>
          </div>
        </div>
      </div>
    `).join('');
  }

  updateActiveButton(activeButton) {
    document.querySelectorAll('[data-category]').forEach(button => {
      button.classList.remove('active');
    });
    activeButton.classList.add('active');
  }

  async previewTemplate(templateId) {
    try {
      const response = await fetch(`/api/reports-builder/templates/${templateId}`);
      const result = await response.json();
      
      if (result.success) {
        this.showPreviewModal(result.data);
      }
    } catch (error) {
      console.error('Error loading template preview:', error);
      this.showError('Failed to load template preview');
    }
  }

  showPreviewModal(template) {
    // Create and show preview modal
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog modal-lg" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">
              <i class="${template.icon} mr-2"></i>${template.name}
            </h5>
            <button type="button" class="close" data-dismiss="modal">
              <span>&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <p>${template.description}</p>
            
            <h6>Available Columns:</h6>
            <div class="row">
              ${template.columns.map(col => `
                <div class="col-md-6 mb-2">
                  <small class="text-muted">
                    <strong>${col.label}:</strong> ${col.type}
                  </small>
                </div>
              `).join('')}
            </div>
            
            <h6 class="mt-3">Available Filters:</h6>
            <div class="row">
              ${template.availableFilters.map(filter => `
                <div class="col-md-6 mb-2">
                  <small class="text-muted">
                    <strong>${filter.label}:</strong> ${filter.type}
                    ${filter.required ? '<span class="text-danger">*</span>' : ''}
                  </small>
                </div>
              `).join('')}
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary" onclick="useTemplate('${template._id}')" 
                    data-dismiss="modal">Use This Template</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    $(modal).modal('show');
    
    // Clean up after modal is hidden
    $(modal).on('hidden.bs.modal', () => {
      document.body.removeChild(modal);
    });
  }

  showError(message) {
    toastr.error(message);
  }
}

// Global functions for template actions
window.previewTemplate = (templateId) => {
  window.templateGallery.previewTemplate(templateId);
};

window.useTemplate = (templateId) => {
  $('#templateGalleryModal').modal('hide');
  window.reportConfiguration.showConfigurationModal(templateId);
};
```

### 3. Report Configuration Interface

#### 3.1 Configuration Modal Layout
```html
<!-- Report Configuration Modal -->
<div class="modal fade" id="reportConfigurationModal" tabindex="-1" role="dialog">
  <div class="modal-dialog modal-xl" role="document">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">Configure Report</h5>
        <button type="button" class="close" data-dismiss="modal">
          <span>&times;</span>
        </button>
      </div>
      <div class="modal-body">
        
        <!-- Configuration Steps -->
        <div class="wizard">
          <div class="wizard-inner">
            <div class="connecting-line"></div>
            <ul class="nav nav-tabs" role="tablist">
              <li role="presentation" class="active">
                <a href="#step1" data-toggle="tab" aria-controls="step1" role="tab">
                  <span class="round-tab">1</span>
                  <span class="hidden-xs">Filters</span>
                </a>
              </li>
              <li role="presentation">
                <a href="#step2" data-toggle="tab" aria-controls="step2" role="tab">
                  <span class="round-tab">2</span>
                  <span class="hidden-xs">Columns</span>
                </a>
              </li>
              <li role="presentation">
                <a href="#step3" data-toggle="tab" aria-controls="step3" role="tab">
                  <span class="round-tab">3</span>
                  <span class="hidden-xs">Sort & Group</span>
                </a>
              </li>
              <li role="presentation">
                <a href="#step4" data-toggle="tab" aria-controls="step4" role="tab">
                  <span class="round-tab">4</span>
                  <span class="hidden-xs">Preview</span>
                </a>
              </li>
            </ul>
          </div>
          
          <!-- Tab Content -->
          <div class="tab-content">
            
            <!-- Step 1: Filters -->
            <div class="tab-pane active" role="tabpanel" id="step1">
              <div class="row">
                <div class="col-12">
                  <h5>Configure Filters</h5>
                  <p class="text-muted">Select the criteria to filter your report data</p>
                </div>
              </div>
              
              <div class="row" id="filters-container">
                <!-- Populated dynamically based on template -->
              </div>
            </div>
            
            <!-- Step 2: Columns -->
            <div class="tab-pane" role="tabpanel" id="step2">
              <div class="row">
                <div class="col-12">
                  <h5>Select Columns</h5>
                  <p class="text-muted">Choose which columns to include in your report</p>
                </div>
              </div>
              
              <div class="row">
                <div class="col-md-6">
                  <h6>Available Columns</h6>
                  <div class="list-group" id="available-columns">
                    <!-- Populated dynamically -->
                  </div>
                </div>
                <div class="col-md-6">
                  <h6>Selected Columns</h6>
                  <div class="list-group" id="selected-columns">
                    <!-- Populated dynamically -->
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Step 3: Sort & Group -->
            <div class="tab-pane" role="tabpanel" id="step3">
              <div class="row">
                <div class="col-12">
                  <h5>Sort and Group Options</h5>
                  <p class="text-muted">Configure how your data should be organized</p>
                </div>
              </div>
              
              <div class="row">
                <div class="col-md-6">
                  <div class="form-group">
                    <label for="sort-column">Sort By</label>
                    <select class="form-control" id="sort-column">
                      <!-- Populated dynamically -->
                    </select>
                  </div>
                  
                  <div class="form-group">
                    <label for="sort-order">Sort Order</label>
                    <select class="form-control" id="sort-order">
                      <option value="asc">Ascending</option>
                      <option value="desc">Descending</option>
                    </select>
                  </div>
                </div>
                
                <div class="col-md-6">
                  <div class="form-group">
                    <label for="group-column">Group By (Optional)</label>
                    <select class="form-control" id="group-column">
                      <option value="">No Grouping</option>
                      <!-- Populated dynamically -->
                    </select>
                  </div>
                  
                  <div class="form-group">
                    <label for="page-size">Page Size</label>
                    <select class="form-control" id="page-size">
                      <option value="25">25 rows</option>
                      <option value="50">50 rows</option>
                      <option value="100">100 rows</option>
                      <option value="0">All rows</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Step 4: Preview -->
            <div class="tab-pane" role="tabpanel" id="step4">
              <div class="row">
                <div class="col-12">
                  <h5>Report Preview</h5>
                  <p class="text-muted">Review your configuration before generating the report</p>
                </div>
              </div>
              
              <div class="row mb-3">
                <div class="col-12">
                  <div class="d-flex justify-content-between">
                    <button type="button" class="btn btn-outline-primary" onclick="refreshPreview()">
                      <i class="fas fa-sync-alt mr-1"></i> Refresh Preview
                    </button>
                    <div class="btn-group">
                      <button type="button" class="btn btn-success" onclick="generateReport()">
                        <i class="fas fa-play mr-1"></i> Generate Report
                      </button>
                      <button type="button" class="btn btn-info" onclick="saveConfiguration()">
                        <i class="fas fa-save mr-1"></i> Save Configuration
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="row">
                <div class="col-12">
                  <div class="table-responsive">
                    <table class="table table-bordered table-striped" id="preview-table">
                      <thead>
                        <!-- Populated dynamically -->
                      </thead>
                      <tbody>
                        <!-- Populated dynamically -->
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
      </div>
      <div class="modal-footer">
        <div class="wizard-buttons">
          <button type="button" class="btn btn-secondary" onclick="previousStep()" id="prev-btn" disabled>
            <i class="fas fa-arrow-left mr-1"></i> Previous
          </button>
          <button type="button" class="btn btn-primary" onclick="nextStep()" id="next-btn">
            Next <i class="fas fa-arrow-right ml-1"></i>
          </button>
        </div>
        <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
      </div>
    </div>
  </div>
</div>
```

#### 3.2 Configuration JavaScript
```javascript
// Report Configuration Controller
class ReportConfiguration {
  constructor() {
    this.currentTemplate = null;
    this.currentStep = 1;
    this.configuration = {
      templateId: null,
      filters: {},
      columns: [],
      sortBy: null,
      sortOrder: 'asc',
      groupBy: null,
      pageSize: 25
    };
    
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Wizard navigation
    document.querySelectorAll('[data-toggle="tab"]').forEach(tab => {
      tab.addEventListener('shown.bs.tab', (e) => {
        this.updateStepButtons(e.target);
      });
    });

    // Next/Previous buttons
    document.getElementById('next-btn').addEventListener('click', () => {
      this.nextStep();
    });

    document.getElementById('prev-btn').addEventListener('click', () => {
      this.previousStep();
    });
  }

  async showConfigurationModal(templateId) {
    try {
      const response = await fetch(`/api/reports-builder/templates/${templateId}`);
      const result = await response.json();
      
      if (result.success) {
        this.currentTemplate = result.data;
        this.configuration.templateId = templateId;
        this.resetConfiguration();
        this.renderFilters();
        this.renderColumns();
        
        $('#reportConfigurationModal').modal('show');
      }
    } catch (error) {
      console.error('Error loading template:', error);
      this.showError('Failed to load template');
    }
  }

  resetConfiguration() {
    this.configuration = {
      templateId: this.currentTemplate._id,
      filters: { ...this.currentTemplate.defaultFilters },
      columns: this.currentTemplate.columns.filter(col => col.visible !== false).map(col => col.key),
      sortBy: this.currentTemplate.defaultSort?.field || null,
      sortOrder: this.currentTemplate.defaultSort?.order || 'asc',
      groupBy: null,
      pageSize: 25
    };
    
    this.currentStep = 1;
    this.resetWizard();
  }

  renderFilters() {
    const container = document.getElementById('filters-container');
    
    container.innerHTML = this.currentTemplate.availableFilters.map(filter => {
      const value = this.configuration.filters[filter.key] || '';
      
      switch (filter.type) {
        case 'date-range':
          return this.renderDateRangeFilter(filter, value);
        case 'select':
          return this.renderSelectFilter(filter, value);
        case 'text':
          return this.renderTextFilter(filter, value);
        case 'number':
          return this.renderNumberFilter(filter, value);
        default:
          return '';
      }
    }).join('');
  }

  renderDateRangeFilter(filter, value) {
    return `
      <div class="col-md-6 mb-3">
        <label class="form-label">${filter.label} ${filter.required ? '<span class="text-danger">*</span>' : ''}</label>
        <div class="input-group">
          <input type="date" class="form-control" id="filter-${filter.key}-start" 
                 value="${value.start || ''}" ${filter.required ? 'required' : ''}>
          <div class="input-group-prepend input-group-append">
            <span class="input-group-text">to</span>
          </div>
          <input type="date" class="form-control" id="filter-${filter.key}-end" 
                 value="${value.end || ''}" ${filter.required ? 'required' : ''}>
        </div>
      </div>
    `;
  }

  renderSelectFilter(filter, value) {
    return `
      <div class="col-md-6 mb-3">
        <label class="form-label">${filter.label} ${filter.required ? '<span class="text-danger">*</span>' : ''}</label>
        <select class="form-control" id="filter-${filter.key}" ${filter.required ? 'required' : ''}>
          <option value="">Select ${filter.label}</option>
          ${filter.options.map(option => `
            <option value="${option.value}" ${value === option.value ? 'selected' : ''}>
              ${option.label}
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  renderTextFilter(filter, value) {
    return `
      <div class="col-md-6 mb-3">
        <label class="form-label">${filter.label} ${filter.required ? '<span class="text-danger">*</span>' : ''}</label>
        <input type="text" class="form-control" id="filter-${filter.key}" 
               value="${value || ''}" ${filter.required ? 'required' : ''}>
      </div>
    `;
  }

  renderNumberFilter(filter, value) {
    return `
      <div class="col-md-6 mb-3">
        <label class="form-label">${filter.label} ${filter.required ? '<span class="text-danger">*</span>' : ''}</label>
        <input type="number" class="form-control" id="filter-${filter.key}" 
               value="${value || ''}" ${filter.required ? 'required' : ''}>
      </div>
    `;
  }

  renderColumns() {
    const availableContainer = document.getElementById('available-columns');
    const selectedContainer = document.getElementById('selected-columns');
    
    // Separate available and selected columns
    const available = this.currentTemplate.columns.filter(col => !this.configuration.columns.includes(col.key));
    const selected = this.currentTemplate.columns.filter(col => this.configuration.columns.includes(col.key));
    
    // Render available columns
    availableContainer.innerHTML = available.map(col => `
      <div class="list-group-item list-group-item-action" draggable="true" data-column="${col.key}">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${col.label}</strong>
            <br><small class="text-muted">${col.type}</small>
          </div>
          <button class="btn btn-sm btn-outline-primary" onclick="addColumn('${col.key}')">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    `).join('');
    
    // Render selected columns
    selectedContainer.innerHTML = selected.map((col, index) => `
      <div class="list-group-item list-group-item-action" draggable="true" data-column="${col.key}">
        <div class="d-flex justify-content-between align-items-center">
          <div>
            <strong>${col.label}</strong>
            <br><small class="text-muted">${col.type}</small>
          </div>
          <div>
            <button class="btn btn-sm btn-outline-secondary" onclick="moveColumnUp('${col.key}')" ${index === 0 ? 'disabled' : ''}>
              <i class="fas fa-arrow-up"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="moveColumnDown('${col.key}')" ${index === selected.length - 1 ? 'disabled' : ''}>
              <i class="fas fa-arrow-down"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="removeColumn('${col.key}')">
              <i class="fas fa-times"></i>
            </button>
          </div>
        </div>
      </div>
    `).join('');
    
    // Populate sort and group dropdowns
    this.populateSortGroupDropdowns();
  }

  populateSortGroupDropdowns() {
    const sortColumn = document.getElementById('sort-column');
    const groupColumn = document.getElementById('group-column');
    
    const options = this.currentTemplate.columns.map(col => `
      <option value="${col.key}" ${this.configuration.sortBy === col.key ? 'selected' : ''}>
        ${col.label}
      </option>
    `).join('');
    
    sortColumn.innerHTML = options;
    groupColumn.innerHTML = '<option value="">No Grouping</option>' + options;
  }

  updateStepButtons(activeTab) {
    const step = parseInt(activeTab.getAttribute('href').replace('#step', ''));
    this.currentStep = step;
    
    // Update button states
    document.getElementById('prev-btn').disabled = step === 1;
    document.getElementById('next-btn').style.display = step === 4 ? 'none' : 'inline-block';
    
    // Load preview data if on step 4
    if (step === 4) {
      this.loadPreview();
    }
  }

  nextStep() {
    if (this.currentStep < 4) {
      // Validate current step
      if (this.validateCurrentStep()) {
        this.saveCurrentStep();
        $(`a[href="#step${this.currentStep + 1}"]`).tab('show');
      }
    }
  }

  previousStep() {
    if (this.currentStep > 1) {
      $(`a[href="#step${this.currentStep - 1}"]`).tab('show');
    }
  }

  validateCurrentStep() {
    switch (this.currentStep) {
      case 1:
        return this.validateFilters();
      case 2:
        return this.validateColumns();
      case 3:
        return this.validateSortGroup();
      default:
        return true;
    }
  }

  validateFilters() {
    let isValid = true;
    
    this.currentTemplate.availableFilters.forEach(filter => {
      if (filter.required) {
        const element = document.getElementById(`filter-${filter.key}`);
        if (element && !element.value) {
          element.classList.add('is-invalid');
          isValid = false;
        } else if (element) {
          element.classList.remove('is-invalid');
        }
      }
    });
    
    if (!isValid) {
      this.showError('Please fill in all required filters');
    }
    
    return isValid;
  }

  validateColumns() {
    if (this.configuration.columns.length === 0) {
      this.showError('Please select at least one column');
      return false;
    }
    return true;
  }

  validateSortGroup() {
    // Sort and group are optional, so always valid
    return true;
  }

  saveCurrentStep() {
    switch (this.currentStep) {
      case 1:
        this.saveFilters();
        break;
      case 2:
        this.saveColumns();
        break;
      case 3:
        this.saveSortGroup();
        break;
    }
  }

  saveFilters() {
    this.currentTemplate.availableFilters.forEach(filter => {
      const element = document.getElementById(`filter-${filter.key}`);
      if (element) {
        if (filter.type === 'date-range') {
          const startElement = document.getElementById(`filter-${filter.key}-start`);
          const endElement = document.getElementById(`filter-${filter.key}-end`);
          
          if (startElement && endElement) {
            this.configuration.filters[filter.key] = {
              start: startElement.value,
              end: endElement.value
            };
          }
        } else {
          this.configuration.filters[filter.key] = element.value;
        }
      }
    });
  }

  saveColumns() {
    // Columns are already managed through the configuration object
  }

  saveSortGroup() {
    this.configuration.sortBy = document.getElementById('sort-column').value;
    this.configuration.sortOrder = document.getElementById('sort-order').value;
    this.configuration.groupBy = document.getElementById('group-column').value;
    this.configuration.pageSize = parseInt(document.getElementById('page-size').value);
  }

  async loadPreview() {
    try {
      const response = await fetch('/api/reports-builder/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          templateId: this.configuration.templateId,
          filters: this.configuration.filters,
          limit: 10
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        this.renderPreview(result.data);
      } else {
        this.showError(result.error.message);
      }
    } catch (error) {
      console.error('Error loading preview:', error);
      this.showError('Failed to load preview');
    }
  }

  renderPreview(data) {
    const table = document.getElementById('preview-table');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    
    // Render headers
    thead.innerHTML = `
      <tr>
        ${data.columns.map(col => `<th>${col.label}</th>`).join('')}
      </tr>
    `;
    
    // Render data
    if (data.data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${data.columns.length}" class="text-center">No data found</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = data.data.map(row => `
        <tr>
          ${data.columns.map(col => `<td>${this.formatCellValue(row[col.key], col.type)}</td>`).join('')}
        </tr>
      `).join('');
    }
  }

  formatCellValue(value, type) {
    if (value === null || value === undefined) return '';
    
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR'
        }).format(value);
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'percentage':
        return `${value}%`;
      default:
        return value;
    }
  }

  async generateReport() {
    try {
      const response = await fetch('/api/reports-builder/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(this.configuration)
      });
      
      const result = await response.json();
      
      if (result.success) {
        $('#reportConfigurationModal').modal('hide');
        this.showReportGenerationModal(result.data.executionId);
      } else {
        this.showError(result.error.message);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      this.showError('Failed to generate report');
    }
  }

  showReportGenerationModal(executionId) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Generating Report</h5>
          </div>
          <div class="modal-body text-center">
            <div class="spinner-border text-primary mb-3" role="status">
              <span class="sr-only">Loading...</span>
            </div>
            <p>Your report is being generated. Please wait...</p>
            <div class="progress">
              <div class="progress-bar progress-bar-striped progress-bar-animated" 
                   role="progressbar" style="width: 100%"></div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary" onclick="viewReport('${executionId}')" disabled id="view-report-btn">
              View Report
            </button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    $(modal).modal('show');
    
    // Poll for completion
    this.pollReportStatus(executionId, modal);
    
    // Clean up after modal is hidden
    $(modal).on('hidden.bs.modal', () => {
      document.body.removeChild(modal);
    });
  }

  async pollReportStatus(executionId, modal) {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/reports-builder/generate/${executionId}/status`);
        const result = await response.json();
        
        if (result.success) {
          const { status } = result.data;
          
          if (status === 'completed') {
            // Update modal
            modal.querySelector('.modal-body').innerHTML = `
              <div class="text-center">
                <i class="fas fa-check-circle fa-4x text-success mb-3"></i>
                <h5>Report Generated Successfully!</h5>
                <p>Your report is ready to view.</p>
              </div>
            `;
            
            // Enable view button
            document.getElementById('view-report-btn').disabled = false;
            document.getElementById('view-report-btn').onclick = () => {
              $(modal).modal('hide');
              window.location.href = `/reports/view/${executionId}`;
            };
          } else if (status === 'failed') {
            // Show error
            modal.querySelector('.modal-body').innerHTML = `
              <div class="text-center">
                <i class="fas fa-exclamation-triangle fa-4x text-danger mb-3"></i>
                <h5>Report Generation Failed</h5>
                <p>There was an error generating your report.</p>
              </div>
            `;
          } else {
            // Continue polling
            setTimeout(checkStatus, 2000);
          }
        }
      } catch (error) {
        console.error('Error checking report status:', error);
        setTimeout(checkStatus, 2000);
      }
    };
    
    setTimeout(checkStatus, 2000);
  }

  resetWizard() {
    // Reset to first step
    $('a[href="#step1"]').tab('show');
    document.getElementById('prev-btn').disabled = true;
    document.getElementById('next-btn').style.display = 'inline-block';
  }

  showError(message) {
    toastr.error(message);
  }
}

// Global functions for column management
window.addColumn = (columnKey) => {
  window.reportConfiguration.configuration.columns.push(columnKey);
  window.reportConfiguration.renderColumns();
};

window.removeColumn = (columnKey) => {
  const index = window.reportConfiguration.configuration.columns.indexOf(columnKey);
  if (index > -1) {
    window.reportConfiguration.configuration.columns.splice(index, 1);
  }
  window.reportConfiguration.renderColumns();
};

window.moveColumnUp = (columnKey) => {
  const columns = window.reportConfiguration.configuration.columns;
  const index = columns.indexOf(columnKey);
  if (index > 0) {
    [columns[index], columns[index - 1]] = [columns[index - 1], columns[index]];
    window.reportConfiguration.renderColumns();
  }
};

window.moveColumnDown = (columnKey) => {
  const columns = window.reportConfiguration.configuration.columns;
  const index = columns.indexOf(columnKey);
  if (index < columns.length - 1) {
    [columns[index], columns[index + 1]] = [columns[index + 1], columns[index]];
    window.reportConfiguration.renderColumns();
  }
};

window.refreshPreview = () => {
  window.reportConfiguration.loadPreview();
};

window.generateReport = () => {
  window.reportConfiguration.generateReport();
};

window.saveConfiguration = () => {
  // Implement save configuration functionality
  toastr.success('Configuration saved successfully');
};

// Initialize controllers when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.reportConfiguration = new ReportConfiguration();
  window.templateGallery = new TemplateGallery();
});
```

### 4. Report Results Interface

#### 4.1 Results View Layout
```html
<!-- Report Results View -->
<div class="content-wrapper">
  <!-- Content Header -->
  <div class="content-header">
    <div class="container-fluid">
      <div class="row mb-2">
        <div class="col-sm-6">
          <h1 class="m-0">Report Results</h1>
        </div>
        <div class="col-sm-6">
          <ol class="breadcrumb float-sm-right">
            <li class="breadcrumb-item"><a href="#">Home</a></li>
            <li class="breadcrumb-item"><a href="#">Reports</a></li>
            <li class="breadcrumb-item active">Results</li>
          </ol>
        </div>
      </div>
    </div>
  </div>

  <!-- Main Content -->
  <section class="content">
    <div class="container-fluid">
      
      <!-- Report Actions -->
      <div class="row mb-3">
        <div class="col-12">
          <div class="card">
            <div class="card-body">
              <div class="row align-items-center">
                <div class="col-md-6">
                  <h5 class="mb-0" id="report-title">Report Results</h5>
                  <small class="text-muted" id="report-subtitle">Generated on <span id="report-date"></span></small>
                </div>
                <div class="col-md-6 text-right">
                  <div class="btn-group">
                    <button class="btn btn-outline-secondary" onclick="refreshReport()">
                      <i class="fas fa-sync-alt"></i> Refresh
                    </button>
                    <button class="btn btn-outline-primary" onclick="showFilters()">
                      <i class="fas fa-filter"></i> Filters
                    </button>
                    <div class="btn-group">
                      <button type="button" class="btn btn-outline-success dropdown-toggle" 
                              data-toggle="dropdown">
                        <i class="fas fa-download"></i> Export
                      </button>
                      <div class="dropdown-menu">
                        <a class="dropdown-item" href="#" onclick="exportReport('pdf')">
                          <i class="fas fa-file-pdf mr-2"></i> PDF
                        </a>
                        <a class="dropdown-item" href="#" onclick="exportReport('excel')">
                          <i class="fas fa-file-excel mr-2"></i> Excel
                        </a>
                        <a class="dropdown-item" href="#" onclick="exportReport('csv')">
                          <i class="fas fa-file-csv mr-2"></i> CSV
                        </a>
                      </div>
                    </div>
                    <button class="btn btn-primary" onclick="shareReport()">
                      <i class="fas fa-share"></i> Share
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Report Summary Cards -->
      <div class="row mb-3" id="summary-cards">
        <!-- Populated dynamically -->
      </div>

      <!-- Charts Section -->
      <div class="row mb-3" id="charts-section">
        <!-- Populated dynamically -->
      </div>

      <!-- Data Table -->
      <div class="row">
        <div class="col-12">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Report Data</h3>
              <div class="card-tools">
                <div class="btn-group">
                  <button type="button" class="btn btn-tool" onclick="toggleColumnSelector()">
                    <i class="fas fa-columns"></i>
                  </button>
                  <button type="button" class="btn btn-tool" data-card-widget="collapse">
                    <i class="fas fa-minus"></i>
                  </button>
                </div>
              </div>
            </div>
            <div class="card-body">
              
              <!-- Column Selector (Hidden by default) -->
              <div class="row mb-3" id="column-selector" style="display: none;">
                <div class="col-12">
                  <div class="alert alert-info">
                    <h6>Select columns to display:</h6>
                    <div id="column-checkboxes">
                      <!-- Populated dynamically -->
                    </div>
                  </div>
                </div>
              </div>

              <!-- Table with Pagination -->
              <div class="table-responsive">
                <table class="table table-bordered table-striped" id="results-table">
                  <thead>
                    <!-- Populated dynamically -->
                  </thead>
                  <tbody>
                    <!-- Populated dynamically -->
                  </tbody>
                </table>
              </div>

              <!-- Pagination -->
              <div class="row">
                <div class="col-sm-12 col-md-5">
                  <div class="dataTables_info" id="table-info">
                    Showing <span id="start-record">1</span> to <span id="end-record">25</span> 
                    of <span id="total-records">0</span> entries
                  </div>
                </div>
                <div class="col-sm-12 col-md-7">
                  <div class="dataTables_paginate paging_simple_numbers" id="table-pagination">
                    <ul class="pagination">
                      <!-- Populated dynamically -->
                    </ul>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

    </div>
  </section>
</div>
```

#### 4.2 Results View JavaScript
```javascript
// Report Results Controller
class ReportResults {
  constructor() {
    this.executionId = null;
    this.reportData = null;
    this.currentPage = 1;
    this.pageSize = 25;
    this.totalRecords = 0;
    this.visibleColumns = [];
    
    this.initializeEventListeners();
    this.loadExecutionId();
  }

  initializeEventListeners() {
    // Page size change
    document.addEventListener('change', (e) => {
      if (e.target.id === 'page-size-select') {
        this.pageSize = parseInt(e.target.value);
        this.currentPage = 1;
        this.loadReportData();
      }
    });
  }

  loadExecutionId() {
    // Get execution ID from URL
    const pathParts = window.location.pathname.split('/');
    this.executionId = pathParts[pathParts.length - 1];
    
    if (this.executionId) {
      this.loadReportData();
    }
  }

  async loadReportData() {
    try {
      const response = await fetch(`/api/reports-builder/generate/${this.executionId}/results?page=${this.currentPage}&limit=${this.pageSize}`);
      const result = await response.json();
      
      if (result.success) {
        this.reportData = result.data;
        this.totalRecords = result.data.totalRecords;
        this.visibleColumns = result.data.columns.filter(col => col.visible !== false);
        
        this.renderReport();
      } else {
        this.showError(result.error.message);
      }
    } catch (error) {
      console.error('Error loading report data:', error);
      this.showError('Failed to load report data');
    }
  }

  renderReport() {
    this.renderReportHeader();
    this.renderSummaryCards();
    this.renderCharts();
    this.renderTable();
    this.renderPagination();
  }

  renderReportHeader() {
    document.getElementById('report-title').textContent = this.reportData.configurationName || 'Report Results';
    document.getElementById('report-date').textContent = new Date().toLocaleDateString();
  }

  renderSummaryCards() {
    const container = document.getElementById('summary-cards');
    
    if (!this.reportData.summaries || this.reportData.summaries.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    container.innerHTML = this.reportData.summaries.map(summary => `
      <div class="col-lg-3 col-6">
        <div class="small-box bg-${this.getCardColor(summary.key)}">
          <div class="inner">
            <h3>${this.formatSummaryValue(summary.value, summary.type)}</h3>
            <p>${summary.label}</p>
          </div>
          <div class="icon">
            <i class="fas ${this.getSummaryIcon(summary.key)}"></i>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderCharts() {
    const container = document.getElementById('charts-section');
    
    if (!this.reportData.charts || this.reportData.charts.length === 0) {
      container.style.display = 'none';
      return;
    }
    
    container.innerHTML = this.reportData.charts.map((chart, index) => `
      <div class="col-md-6">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${chart.title}</h3>
          </div>
          <div class="card-body">
            <canvas id="chart-${index}" style="height: 300px;"></canvas>
          </div>
        </div>
      </div>
    `).join('');
    
    // Render charts using Chart.js or similar library
    setTimeout(() => {
      this.reportData.charts.forEach((chart, index) => {
        this.renderChart(`chart-${index}`, chart);
      });
    }, 100);
  }

  renderTable() {
    const table = document.getElementById('results-table');
    const thead = table.querySelector('thead');
    const tbody = table.querySelector('tbody');
    
    // Render headers
    thead.innerHTML = `
      <tr>
        ${this.visibleColumns.map(col => `
          <th>
            ${col.label}
            ${this.renderSortIcons(col.key)}
          </th>
        `).join('')}
      </tr>
    `;
    
    // Render data
    if (this.reportData.data.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${this.visibleColumns.length}" class="text-center">No data found</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = this.reportData.data.map(row => `
        <tr>
          ${this.visibleColumns.map(col => `
            <td>${this.formatCellValue(row[col.key], col.type)}</td>
          `).join('')}
        </tr>
      `).join('');
    }
    
    // Update table info
    const startRecord = (this.currentPage - 1) * this.pageSize + 1;
    const endRecord = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    
    document.getElementById('start-record').textContent = startRecord;
    document.getElementById('end-record').textContent = endRecord;
    document.getElementById('total-records').textContent = this.totalRecords;
    
    // Render column selector
    this.renderColumnSelector();
  }

  renderColumnSelector() {
    const container = document.getElementById('column-checkboxes');
    const allColumns = this.reportData.columns;
    
    container.innerHTML = allColumns.map(col => `
      <div class="form-check form-check-inline">
        <input class="form-check-input" type="checkbox" id="col-${col.key}" 
               value="${col.key}" ${this.visibleColumns.includes(col) ? 'checked' : ''}
               onchange="toggleColumn('${col.key}')">
        <label class="form-check-label" for="col-${col.key}">${col.label}</label>
      </div>
    `).join('');
  }

  renderPagination() {
    const container = document.getElementById('table-pagination');
    const totalPages = Math.ceil(this.totalRecords / this.pageSize);
    
    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
      <li class="paginate_button page-item ${this.currentPage === 1 ? 'disabled' : ''}">
        <a href="#" class="page-link" onclick="changePage(${this.currentPage - 1})">Previous</a>
      </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, this.currentPage - 2);
    const endPage = Math.min(totalPages, this.currentPage + 2);
    
    if (startPage > 1) {
      paginationHTML += `
        <li class="paginate_button page-item">
          <a href="#" class="page-link" onclick="changePage(1)">1</a>
        </li>
      `;
      
      if (startPage > 2) {
        paginationHTML += `
          <li class="paginate_button page-item disabled">
            <span class="page-link">...</span>
          </li>
        `;
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `
        <li class="paginate_button page-item ${i === this.currentPage ? 'active' : ''}">
          <a href="#" class="page-link" onclick="changePage(${i})">${i}</a>
        </li>
      `;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHTML += `
          <li class="paginate_button page-item disabled">
            <span class="page-link">...</span>
          </li>
        `;
      }
      
      paginationHTML += `
        <li class="paginate_button page-item">
          <a href="#" class="page-link" onclick="changePage(${totalPages})">${totalPages}</a>
        </li>
      `;
    }
    
    // Next button
    paginationHTML += `
      <li class="paginate_button page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
        <a href="#" class="page-link" onclick="changePage(${this.currentPage + 1})">Next</a>
      </li>
    `;
    
    container.innerHTML = `<ul class="pagination">${paginationHTML}</ul>`;
  }

  renderChart(canvasId, chartConfig) {
    // Implementation depends on charting library (Chart.js, etc.)
    // This is a placeholder for chart rendering
    console.log(`Rendering chart ${canvasId}:`, chartConfig);
  }

  renderSortIcons(columnKey) {
    const currentSort = this.reportData.sortBy;
    const currentOrder = this.reportData.sortOrder;
    
    let icons = '';
    
    if (currentSort === columnKey) {
      if (currentOrder === 'asc') {
        icons = '<i class="fas fa-sort-up text-primary"></i>';
      } else {
        icons = '<i class="fas fa-sort-down text-primary"></i>';
      }
    } else {
      icons = '<i class="fas fa-sort text-muted"></i>';
    }
    
    return `
      <span class="float-right" style="cursor: pointer;" onclick="sortBy('${columnKey}')">
        ${icons}
      </span>
    `;
  }

  formatSummaryValue(value, type) {
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR'
        }).format(value);
      case 'percentage':
        return `${value}%`;
      case 'number':
        return new Intl.NumberFormat('en-IN').format(value);
      default:
        return value;
    }
  }

  formatCellValue(value, type) {
    if (value === null || value === undefined) return '';
    
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR'
        }).format(value);
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'percentage':
        return `${value}%`;
      default:
        return value;
    }
  }

  getCardColor(summaryKey) {
    const colors = {
      'totalSales': 'primary',
      'totalProfit': 'success',
      'totalItems': 'info',
      'totalCustomers': 'warning'
    };
    return colors[summaryKey] || 'secondary';
  }

  getSummaryIcon(summaryKey) {
    const icons = {
      'totalSales': 'fa-shopping-cart',
      'totalProfit': 'fa-chart-line',
      'totalItems': 'fa-box',
      'totalCustomers': 'fa-users'
    };
    return icons[summaryKey] || 'fa-chart-bar';
  }

  async exportReport(format) {
    try {
      window.open(`/api/reports-builder/generate/${this.executionId}/download?format=${format}`, '_blank');
    } catch (error) {
      console.error('Error exporting report:', error);
      this.showError('Failed to export report');
    }
  }

  async refreshReport() {
    this.loadReportData();
  }

  showFilters() {
    // Show filters modal or panel
    this.showFiltersModal();
  }

  showFiltersModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
      <div class="modal-dialog" role="document">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Report Filters</h5>
            <button type="button" class="close" data-dismiss="modal">
              <span>&times;</span>
            </button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-6">
                <div class="form-group">
                  <label for="page-size-select">Page Size</label>
                  <select class="form-control" id="page-size-select">
                    <option value="25" ${this.pageSize === 25 ? 'selected' : ''}>25 rows</option>
                    <option value="50" ${this.pageSize === 50 ? 'selected' : ''}>50 rows</option>
                    <option value="100" ${this.pageSize === 100 ? 'selected' : ''}>100 rows</option>
                    <option value="0" ${this.pageSize === 0 ? 'selected' : ''}>All rows</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary" onclick="applyFilters()" data-dismiss="modal">Apply</button>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    $(modal).modal('show');
    
    // Clean up after modal is hidden
    $(modal).on('hidden.bs.modal', () => {
      document.body.removeChild(modal);
    });
  }

  shareReport() {
    // Implement share functionality
    toastr.info('Share functionality coming soon');
  }

  showError(message) {
    toastr.error(message);
  }
}

// Global functions for report interactions
window.changePage = (page) => {
  if (window.reportResults) {
    window.reportResults.currentPage = page;
    window.reportResults.loadReportData();
  }
};

window.sortBy = (columnKey) => {
  if (window.reportResults) {
    const currentSort = window.reportResults.reportData.sortBy;
    const currentOrder = window.reportResults.reportData.sortOrder;
    
    let newOrder = 'asc';
    if (currentSort === columnKey && currentOrder === 'asc') {
      newOrder = 'desc';
    }
    
    // Update report data with new sort
    window.reportResults.reportData.sortBy = columnKey;
    window.reportResults.reportData.sortOrder = newOrder;
    
    // Reload data
    window.reportResults.loadReportData();
  }
};

window.toggleColumn = (columnKey) => {
  if (window.reportResults) {
    const index = window.reportResults.visibleColumns.findIndex(col => col.key === columnKey);
    
    if (index > -1) {
      window.reportResults.visibleColumns.splice(index, 1);
    } else {
      const column = window.reportResults.reportData.columns.find(col => col.key === columnKey);
      if (column) {
        window.reportResults.visibleColumns.push(column);
      }
    }
    
    window.reportResults.renderTable();
  }
};

window.toggleColumnSelector = () => {
  const selector = document.getElementById('column-selector');
  selector.style.display = selector.style.display === 'none' ? 'block' : 'none';
};

window.exportReport = (format) => {
  if (window.reportResults) {
    window.reportResults.exportReport(format);
  }
};

window.refreshReport = () => {
  if (window.reportResults) {
    window.reportResults.refreshReport();
  }
};

window.showFilters = () => {
  if (window.reportResults) {
    window.reportResults.showFilters();
  }
};

window.shareReport = () => {
  if (window.reportResults) {
    window.reportResults.shareReport();
  }
};

window.applyFilters = () => {
  if (window.reportResults) {
    window.reportResults.loadReportData();
  }
};

// Initialize results controller when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.reportResults = new ReportResults();
});
```

## CSS Styles

### 1. Custom CSS for Report Builder
```css
/* Report Builder Custom Styles */

/* Template Cards */
.template-card {
  transition: transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
}

.template-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

/* Wizard Styles */
.wizard {
  margin-top: 20px;
}

.wizard .nav-tabs {
  position: relative;
  margin-bottom: 0;
  border-bottom-color: transparent;
}

.wizard .nav-tabs > li {
  position: relative;
}

.wizard .connecting-line {
  height: 2px;
  background: #ddd;
  position: absolute;
  width: 80%;
  margin: 0 auto;
  left: 0;
  right: 0;
  top: 35px;
  z-index: 1;
}

.wizard .round-tab {
  width: 30px;
  height: 30px;
  line-height: 30px;
  display: inline-block;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #ddd;
  z-index: 2;
  position: absolute;
  left: 0;
  text-align: center;
  font-size: 12px;
}

.wizard .nav-tabs > li.active .round-tab {
  background: #007bff;
  border: 2px solid #007bff;
  color: #fff;
}

.wizard .nav-tabs > li.active a {
  color: #007bff;
}

/* Column Drag and Drop */
.list-group-item {
  cursor: move;
}

.list-group-item.dragging {
  opacity: 0.5;
}

.list-group-item.drag-over {
  background-color: #f0f0f0;
}

/* Summary Cards */
.small-box > .inner > h3 {
  font-size: 2.5rem;
  font-weight: bold;
}

/* Chart Containers */
.chart-container {
  position: relative;
  height: 300px;
}

/* Table Styles */
.table th {
  white-space: nowrap;
}

.table td {
  vertical-align: middle;
}

/* Loading States */
.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

/* Responsive Adjustments */
@media (max-width: 768px) {
  .wizard .nav-tabs > li a {
    padding: 10px 5px;
    font-size: 12px;
  }
  
  .wizard .round-tab {
    width: 25px;
    height: 25px;
    line-height: 25px;
    font-size: 10px;
  }
  
  .template-card .card-body {
    padding: 1rem;
  }
}

/* Animation Classes */
.fade-in {
  animation: fadeIn 0.3s ease-in;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.slide-up {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(20px);
  }
  to { 
    opacity: 1;
    transform: translateY(0);
  }
}
```

## Conclusion

This UI design provides a comprehensive and user-friendly interface for the PharmaSoft custom report builder. The design emphasizes:

1. **Ease of Use**: Step-by-step wizard for report configuration
2. **Visual Appeal**: Modern, clean interface with consistent styling
3. **Functionality**: Complete coverage of all report builder features
4. **Responsiveness**: Works well on desktop and tablet devices
5. **Performance**: Efficient data loading and rendering
6. **Accessibility**: Proper semantic HTML and ARIA labels

The interface follows existing PharmaSoft patterns while providing enhanced functionality for report generation and management.