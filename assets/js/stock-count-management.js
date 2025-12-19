$(document).ready(function() {
    // Initialize date pickers
    $('.datepicker').datepicker({
        format: 'dd/mm/yyyy',
        autoclose: true,
        todayHighlight: true
    });

    // Load initial data
    loadStockCounts();
    loadStores();
    loadUsers();
    loadCategories();
    loadSummaryStats();

    // Event handlers
    $('#createStockCountBtn').click(createStockCount);
    $('#stockCountListBtn').click(loadStockCounts);
    $('#varianceReviewBtn').click(showVarianceReview);
    $('#stockCountReportsBtn').click(showReports);
    $('#backToMainBtn').click(goBackToMain);
    $('#exportBtn').click(exportStockCounts);
    $('#applyFilterBtn').click(applyFilters);
    $('#clearFilterBtn').click(clearFilters);
    
    // Auto-refresh summary stats every 30 seconds
    setInterval(loadSummaryStats, 30000);
});

let currentPage = 1;
let currentFilters = {};

function loadStockCounts() {
    const params = {
        page: currentPage,
        limit: 10,
        ...currentFilters
    };

    $.ajax({
        url: '/api/stock-counts',
        method: 'GET',
        data: params,
        success: function(response) {
            displayStockCounts(response.stockCounts);
            updatePagination(response.pagination);
        },
        error: function(xhr, status, error) {
            console.error('Error loading stock counts:', error);
            showError('Failed to load stock counts. Please try again.');
        }
    });
}

function displayStockCounts(stockCounts) {
    const tbody = $('#stock_count_list');
    tbody.empty();

    if (stockCounts.length === 0) {
        tbody.append(`
            <tr>
                <td colspan="9" class="text-center">
                    <div class="alert alert-info">
                        <i class="fa fa-info-circle"></i> No stock counts found matching the current criteria.
                    </div>
                </td>
            </tr>
        `);
        return;
    }

    stockCounts.forEach(count => {
        const progressPercent = count.totalItems > 0 ? 
            Math.round((count.countedItems / count.totalItems) * 100) : 0;
        
        const statusBadge = getStatusBadge(count.countStatus);
        const typeBadge = getTypeBadge(count.countType);
        
        const row = `
            <tr>
                <td>
                    <strong>${count.countName}</strong>
                    ${count.notes ? `<br><small class="text-muted">${count.notes}</small>` : ''}
                </td>
                <td>${typeBadge}</td>
                <td>${count.storeName || 'Unknown'}</td>
                <td>${statusBadge}</td>
                <td>${formatDate(count.scheduledDate)}</td>
                <td>
                    <div class="progress" style="height: 20px;">
                        <div class="progress-bar ${getProgressBarClass(progressPercent)}" 
                             style="width: ${progressPercent}%;" 
                             role="progressbar" 
                             aria-valuenow="${progressPercent}" 
                             aria-valuemin="0" 
                             aria-valuemax="100">
                            ${progressPercent}%
                        </div>
                    </div>
                    <small>${count.countedItems}/${count.totalItems} items</small>
                </td>
                <td>${count.totalItems}</td>
                <td>
                    ${count.varianceItems > 0 ? 
                        `<span class="label label-warning">${count.varianceItems}</span>` : 
                        '<span class="label label-success">0</span>'
                    }
                </td>
                <td>
                    <div class="btn-group">
                        ${getActionButtons(count)}
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function getStatusBadge(status) {
    const badges = {
        'PLANNED': '<span class="label label-info">Planned</span>',
        'ACTIVE': '<span class="label label-primary">Active</span>',
        'PAUSED': '<span class="label label-warning">Paused</span>',
        'COMPLETED': '<span class="label label-success">Completed</span>',
        'CANCELLED': '<span class="label label-danger">Cancelled</span>'
    };
    return badges[status] || '<span class="label label-default">Unknown</span>';
}

function getTypeBadge(type) {
    const badges = {
        'FULL': '<span class="label label-default">Full</span>',
        'PARTIAL': '<span class="label label-info">Partial</span>',
        'CYCLE': '<span class="label label-warning">Cycle</span>',
        'SPOT': '<span class="label label-primary">Spot</span>',
        'EXPIRY': '<span class="label label-danger">Expiry</span>'
    };
    return badges[type] || '<span class="label label-default">Unknown</span>';
}

function getProgressBarClass(percentage) {
    if (percentage >= 90) return 'progress-bar-success';
    if (percentage >= 70) return 'progress-bar-info';
    if (percentage >= 40) return 'progress-bar-warning';
    return 'progress-bar-danger';
}

function getActionButtons(count) {
    let buttons = '';
    
    // View button
    buttons += `<button class="btn btn-sm btn-info" onclick="viewStockCount(${count._id})" title="View Details">
                    <i class="fa fa-eye"></i>
                </button>`;
    
    // Edit button for planned counts
    if (count.countStatus === 'PLANNED') {
        buttons += `<button class="btn btn-sm btn-warning" onclick="editStockCount(${count._id})" title="Edit Count">
                        <i class="fa fa-edit"></i>
                    </button>`;
    }
    
    // Start button for planned counts
    if (count.countStatus === 'PLANNED') {
        buttons += `<button class="btn btn-sm btn-success" onclick="startStockCount(${count._id})" title="Start Count">
                        <i class="fa fa-play"></i>
                    </button>`;
    }
    
    // Count sheet button for active counts
    if (count.countStatus === 'ACTIVE') {
        buttons += `<button class="btn btn-sm btn-primary" onclick="openCountSheet(${count._id})" title="Open Count Sheet">
                        <i class="fa fa-clipboard"></i>
                    </button>`;
    }
    
    // Complete button for active counts
    if (count.countStatus === 'ACTIVE') {
        buttons += `<button class="btn btn-sm btn-success" onclick="completeStockCount(${count._id})" title="Complete Count">
                        <i class="fa fa-check"></i>
                    </button>`;
    }
    
    // Variance review button for completed counts
    if (count.countStatus === 'COMPLETED') {
        buttons += `<button class="btn btn-sm btn-warning" onclick="reviewVariances(${count._id})" title="Review Variances">
                        <i class="fa fa-exclamation-triangle"></i>
                    </button>`;
    }
    
    // Report button for completed counts
    if (count.countStatus === 'COMPLETED') {
        buttons += `<button class="btn btn-sm btn-primary" onclick="generateReport(${count._id})" title="Generate Report">
                        <i class="fa fa-file-pdf"></i>
                    </button>`;
    }
    
    // Cancel button for planned/active counts
    if (count.countStatus === 'PLANNED' || count.countStatus === 'ACTIVE') {
        buttons += `<button class="btn btn-sm btn-danger" onclick="cancelStockCount(${count._id})" title="Cancel Count">
                        <i class="fa fa-times"></i>
                    </button>`;
    }
    
    return buttons;
}

function createStockCount() {
    const formData = {
        countName: $('#countName').val(),
        countType: $('#countType').val(),
        storeId: $('#storeId').val(),
        scheduledDate: $('#scheduledDate').val(),
        supervisedBy: $('#supervisedBy').val(),
        assignedTo: $('#assignedTo').val() || [],
        notes: $('#notes').val(),
        countScope: getScopeConfiguration(),
        createdBy: getCurrentUserId()
    };

    // Validate required fields
    if (!formData.countName || !formData.countType || !formData.storeId || !formData.scheduledDate) {
        showError('Please fill in all required fields.');
        return;
    }

    $.ajax({
        url: '/api/stock-counts',
        method: 'POST',
        data: formData,
        success: function(response) {
            showSuccess('Stock count created successfully!');
            $('#newStockCountModal').modal('hide');
            resetCreateForm();
            loadStockCounts();
            loadSummaryStats();
        },
        error: function(xhr, status, error) {
            console.error('Error creating stock count:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to create stock count.');
        }
    });
}

function getScopeConfiguration() {
    const scope = {};
    
    // Category scope
    const selectedCategories = $('#categories').val();
    if (selectedCategories && selectedCategories.length > 0) {
        scope.categories = selectedCategories;
    }
    
    // Location scope
    const locations = $('#locations').val();
    if (locations) {
        scope.locations = locations.split(',').map(loc => loc.trim());
    }
    
    // Value range scope
    const minValue = parseFloat($('input[name="minValue"]').val()) || 0;
    const maxValue = parseFloat($('input[name="maxValue"]').val()) || 999999;
    if (minValue > 0 || maxValue < 999999) {
        scope.valueRange = { min: minValue, max: maxValue };
    }
    
    return scope;
}

function resetCreateForm() {
    $('#createStockCountForm')[0].reset();
    $('.datepicker').datepicker('update', new Date());
}

function loadStores() {
    $.ajax({
        url: '/api/stores/all',
        method: 'GET',
        success: function(stores) {
            const storeSelect = $('#storeId, #filterStore, #storeFilter');
            
            storeSelect.each(function() {
                const $this = $(this);
                $this.empty();
                $this.append('<option value="">Select store</option>');
                
                stores.forEach(store => {
                    $this.append(`<option value="${store._id}">${store.name}</option>`);
                });
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading stores:', error);
        }
    });
}

function loadUsers() {
    $.ajax({
        url: '/api/users',
        method: 'GET',
        success: function(users) {
            const supervisorSelect = $('#supervisedBy');
            const assignedSelect = $('#assignedTo');
            
            supervisorSelect.empty();
            supervisorSelect.append('<option value="">Select supervisor</option>');
            
            assignedSelect.empty();
            assignedSelect.append('<option value="">Select counters</option>');
            
            users.forEach(user => {
                supervisorSelect.append(`<option value="${user._id}">${user.name}</option>`);
                assignedSelect.append(`<option value="${user._id}">${user.name}</option>`);
            });
            
            // Initialize select2 for multiple selection
            assignedSelect.select2({
                placeholder: 'Select counters...',
                allowClear: true
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading users:', error);
        }
    });
}

function loadCategories() {
    $.ajax({
        url: '/api/categories',
        method: 'GET',
        success: function(categories) {
            const categorySelect = $('#categories');
            
            categorySelect.empty();
            categorySelect.append('<option value="">All Categories</option>');
            
            categories.forEach(category => {
                categorySelect.append(`<option value="${category._id}">${category.name}</option>`);
            });
            
            // Initialize select2 for multiple selection
            categorySelect.select2({
                placeholder: 'Select categories...',
                allowClear: true
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading categories:', error);
        }
    });
}

function loadSummaryStats() {
    $.ajax({
        url: '/api/stock-counts',
        method: 'GET',
        data: { 
            limit: 1000, // Get all counts for summary
            ...currentFilters 
        },
        success: function(response) {
            const counts = response.stockCounts;
            
            const activeCounts = counts.filter(c => c.countStatus === 'ACTIVE').length;
            const completedToday = counts.filter(c => {
                return c.countStatus === 'COMPLETED' && 
                       isToday(new Date(c.completedAt));
            }).length;
            const pendingApproval = counts.filter(c => c.countStatus === 'COMPLETED' && c.varianceItems > 0).length;
            const highVariances = counts.filter(c => c.totalVarianceValue > 1000).length;
            
            $('#activeCounts').text(activeCounts);
            $('#completedToday').text(completedToday);
            $('#pendingApproval').text(pendingApproval);
            $('#highVariances').text(highVariances);
        },
        error: function(xhr, status, error) {
            console.error('Error loading summary stats:', error);
        }
    });
}

function applyFilters() {
    currentFilters = {
        status: $('#filterStatus').val(),
        type: $('#filterType').val(),
        storeId: $('#filterStore').val(),
        startDate: $('#startDate').val(),
        endDate: $('#endDate').val()
    };
    
    currentPage = 1;
    loadStockCounts();
    $('#filterModal').modal('hide');
}

function clearFilters() {
    currentFilters = {};
    $('#filterStatus, #filterType, #filterStore, #startDate, #endDate').val('');
    currentPage = 1;
    loadStockCounts();
    $('#filterModal').modal('hide');
}

function updatePagination(pagination) {
    $('#startRecord').text((pagination.page - 1) * pagination.limit + 1);
    $('#endRecord').text(Math.min(pagination.page * pagination.limit, pagination.total));
    $('#totalRecords').text(pagination.total);
    
    const paginationDiv = $('#pagination');
    paginationDiv.empty();
    
    if (pagination.pages <= 1) return;
    
    let paginationHtml = '<div class="btn-group">';
    
    // Previous button
    if (pagination.page > 1) {
        paginationHtml += `<button class="btn btn-default" onclick="changePage(${pagination.page - 1})">
                                <i class="fa fa-chevron-left"></i>
                            </button>`;
    }
    
    // Page numbers
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === pagination.page ? 'btn-primary' : 'btn-default';
        paginationHtml += `<button class="btn ${activeClass}" onclick="changePage(${i})">${i}</button>`;
    }
    
    // Next button
    if (pagination.page < pagination.pages) {
        paginationHtml += `<button class="btn btn-default" onclick="changePage(${pagination.page + 1})">
                                <i class="fa fa-chevron-right"></i>
                            </button>`;
    }
    
    paginationHtml += '</div>';
    paginationDiv.html(paginationHtml);
}

function changePage(page) {
    currentPage = page;
    loadStockCounts();
}

function viewStockCount(countId) {
    // Navigate to count details page
    window.location.href = `stock-count-details.html?id=${countId}`;
}

function editStockCount(countId) {
    // Load count data into edit form
    $.ajax({
        url: `/api/stock-counts/${countId}`,
        method: 'GET',
        success: function(count) {
            $('#countName').val(count.countName);
            $('#countType').val(count.countType);
            $('#storeId').val(count.storeId);
            $('#scheduledDate').val(count.scheduledDate);
            $('#supervisedBy').val(count.supervisedBy);
            $('#notes').val(count.notes);
            
            // Load scope configuration
            if (count.countScope) {
                if (count.countScope.categories) {
                    $('#categories').val(count.countScope.categories).trigger('change');
                }
                if (count.countScope.locations) {
                    $('#locations').val(count.countScope.locations.join(', '));
                }
                if (count.countScope.valueRange) {
                    $('input[name="minValue"]').val(count.countScope.valueRange.min);
                    $('input[name="maxValue"]').val(count.countScope.valueRange.max);
                }
            }
            
            // Update form to edit mode
            $('#newStockCountModal .modal-title').text('Edit Stock Count');
            $('#createStockCountBtn').text('Update Stock Count');
            
            // Store count ID for update
            $('#createStockCountForm').attr('data-count-id', countId);
            
            $('#newStockCountModal').modal('show');
        },
        error: function(xhr, status, error) {
            console.error('Error loading stock count:', error);
            showError('Failed to load stock count details.');
        }
    });
}

function startStockCount(countId) {
    if (!confirm('Are you sure you want to start this stock count?')) {
        return;
    }
    
    $.ajax({
        url: `/api/stock-counts/${countId}/start`,
        method: 'POST',
        success: function(response) {
            showSuccess('Stock count started successfully!');
            loadStockCounts();
            loadSummaryStats();
        },
        error: function(xhr, status, error) {
            console.error('Error starting stock count:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to start stock count.');
        }
    });
}

function completeStockCount(countId) {
    if (!confirm('Are you sure you want to complete this stock count?')) {
        return;
    }
    
    $.ajax({
        url: `/api/stock-counts/${countId}/complete`,
        method: 'POST',
        success: function(response) {
            showSuccess('Stock count completed successfully!');
            loadStockCounts();
            loadSummaryStats();
            
            // Show variance summary
            if (response.statistics && response.statistics.varianceItems > 0) {
                setTimeout(() => {
                    reviewVariances(countId);
                }, 1000);
            }
        },
        error: function(xhr, status, error) {
            console.error('Error completing stock count:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to complete stock count.');
        }
    });
}

function cancelStockCount(countId) {
    if (!confirm('Are you sure you want to cancel this stock count? This action cannot be undone.')) {
        return;
    }
    
    $.ajax({
        url: `/api/stock-counts/${countId}`,
        method: 'DELETE',
        success: function(response) {
            showSuccess('Stock count cancelled successfully!');
            loadStockCounts();
            loadSummaryStats();
        },
        error: function(xhr, status, error) {
            console.error('Error cancelling stock count:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to cancel stock count.');
        }
    });
}

function openCountSheet(countId) {
    window.location.href = `stock-count-sheet.html?id=${countId}`;
}

function reviewVariances(countId) {
    window.location.href = `stock-count-variances.html?id=${countId}`;
}

function generateReport(countId) {
    window.open(`/api/stock-counts/${countId}/report`, '_blank');
}

function showVarianceReview() {
    window.location.href = 'stock-count-variances.html';
}

function showReports() {
    window.location.href = 'stock-count-reports.html';
}

function exportStockCounts() {
    const params = {
        ...currentFilters,
        export: true
    };
    
    window.open(`/api/stock-counts?${$.param(params)}`, '_blank');
}

function goBackToMain() {
    window.location.href = 'index.html';
}

// Utility functions
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleDateString();
}

function isToday(dateString) {
    if (!dateString) return false;
    
    const date = new Date(dateString);
    const today = new Date();
    
    return date.toDateString() === today.toDateString();
}

function getCurrentUserId() {
    // This should be implemented based on your authentication system
    // For now, return a placeholder
    return 1;
}

function showSuccess(message) {
    // Remove any existing alerts
    $('.alert').remove();
    
    const alertHtml = `
        <div class="alert alert-success alert-dismissible" style="position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
            <strong>Success!</strong> ${message}
        </div>
    `;
    
    $('body').append(alertHtml);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        $('.alert-success').fadeOut();
    }, 5000);
}

function showError(message) {
    // Remove any existing alerts
    $('.alert').remove();
    
    const alertHtml = `
        <div class="alert alert-danger alert-dismissible" style="position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
            <strong>Error!</strong> ${message}
        </div>
    `;
    
    $('body').append(alertHtml);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        $('.alert-danger').fadeOut();
    }, 10000);
}