$(document).ready(function () {
    // Get stock count ID from URL (if viewing specific count)
    const urlParams = new URLSearchParams(window.location.search);
    stockCountId = urlParams.get('id');

    // Initialize
    loadStockCounts();
    loadCategories();
    loadVariances();
    loadVarianceSummary();

    // Event handlers
    $('#applyFiltersBtn').click(applyFilters);
    $('#initializeApprovalBtn').click(initializeApproval);
    $('#bulkApproveBtn').click(bulkApproveAll);
    $('#bulkApproveSelectedBtn').click(bulkApproveSelected);
    $('#bulkRejectSelectedBtn').click(bulkRejectSelected);
    $('#createAdjustmentsBtn').click(createAdjustments);
    $('#exportVariancesBtn').click(exportVariances);
    $('#backToListBtn').click(() => {
        if (stockCountId) {
            window.location.href = 'stock-count-management.html';
        } else {
            window.location.href = 'stock-count-management.html';
        }
    });

    // Select all checkbox
    $('#selectAllCheckbox').change(function () {
        const isChecked = $(this).prop('checked');
        $('.variance-checkbox').prop('checked', isChecked);
        updateBulkActionButtons();
    });

    // Approval/Rejection modal buttons
    $('#confirmApprovalBtn').click(confirmApproval);
    $('#confirmRejectionBtn').click(confirmRejection);

    // Auto-refresh summary every 30 seconds
    setInterval(loadVarianceSummary, 30000);
});

let stockCountId = null;
let currentPage = 1;
let currentFilters = {};
let currentVarianceId = null;
let selectedVarianceIds = [];

function loadStockCounts() {
    $.ajax({
        url: './api/stock-counts',
        method: 'GET',
        data: { limit: 1000, status: 'COMPLETED' },
        success: function (response) {
            const stockCountSelect = $('#stockCountFilter');

            stockCountSelect.empty();
            stockCountSelect.append('<option value="">All Counts</option>');

            response.stockCounts.forEach(count => {
                stockCountSelect.append(`<option value="${count._id}" ${count._id === stockCountId ? 'selected' : ''}>
                    ${count.countName} - ${formatDate(count.completedAt)}
                </option>`);
            });

            // If specific stock count is selected, load its details
            if (stockCountId) {
                loadStockCountDetails(stockCountId);
            }
        },
        error: function (xhr, status, error) {
            console.error('Error loading stock counts:', error);
        }
    });
}

function loadStockCountDetails(countId) {
    $.ajax({
        url: `/api/stock-counts/${countId}`,
        method: 'GET',
        success: function (count) {
            $('#stockCountInfo').show();
            $('#countName').text(count.countName);
            $('#countType').html(getTypeBadge(count.countType));
            $('#countStatus').html(getStatusBadge(count.countStatus));
            $('#storeName').text(count.storeName || 'Unknown');
            $('#supervisorName').text(count.supervisorName || 'Not assigned');
            $('#completedDate').text(formatDate(count.completedAt));

            // Update filters to show only this count
            $('#stockCountFilter').val(countId);
        },
        error: function (xhr, status, error) {
            console.error('Error loading stock count details:', error);
        }
    });
}

function loadVariances() {
    const params = {
        page: currentPage,
        limit: 20,
        ...currentFilters
    };

    // If specific stock count is selected, add it to params
    if (stockCountId) {
        params.sessionId = stockCountId;
    }

    $.ajax({
        url: './api/stock-variances',
        method: 'GET',
        data: params,
        success: function (response) {
            displayVariances(response.variances);
            updatePagination(response.pagination);
        },
        error: function (xhr, status, error) {
            console.error('Error loading variances:', error);
            showError('Failed to load variances.');
        }
    });
}

function displayVariances(variances) {
    const tbody = $('#variancesList');
    tbody.empty();

    if (variances.length === 0) {
        tbody.append(`
            <tr>
                <td colspan="8" class="text-center">
                    <div class="alert alert-info">
                        <i class="fa fa-info-circle"></i> No variances found matching the current criteria.
                    </div>
                </td>
            </tr>
        `);
        return;
    }

    variances.forEach(variance => {
        const varianceClass = variance.varianceType === 'SURPLUS' ? 'text-success' :
            variance.varianceType === 'SHORTAGE' ? 'text-danger' : 'text-warning';

        const varianceIcon = variance.varianceType === 'SURPLUS' ? 'md-arrow-upward' :
            variance.varianceType === 'SHORTAGE' ? 'md-arrow-downward' : 'md-warning';

        const row = `
            <tr>
                <td>
                    <input type="checkbox" class="variance-checkbox" data-variance-id="${variance._id}" 
                           ${variance.approvalStatus === 'APPROVED' || variance.approvalStatus === 'REJECTED' ? 'disabled' : ''}>
                </td>
                <td>
                    <div>
                        <strong>${variance.productName}</strong>
                        <br>
                        <small class="text-muted">Code: ${variance.productCode}</small>
                        ${variance.barcode ? `<br><small class="text-muted">Barcode: ${variance.barcode}</small>` : ''}
                        ${variance.location ? `<br><small class="text-muted">Location: ${variance.location}</small>` : ''}
                    </div>
                </td>
                <td>
                    <div>
                        <strong>${variance.stockCountName}</strong>
                        <br>
                        <small class="text-muted">${formatDate(variance.countDate)}</small>
                    </div>
                </td>
                <td class="${varianceClass}">
                    <i class="md ${varianceIcon}"></i>
                    <strong>${variance.variance > 0 ? '+' : ''}${variance.variance}</strong>
                    <br>
                    <small>Expected: ${variance.expectedQuantity}, Counted: ${variance.countedQuantity}</small>
                </td>
                <td>
                    <strong>₹${variance.varianceValue.toFixed(2)}</strong>
                    <br>
                    <small class="text-muted">@ ₹${variance.unitPrice.toFixed(2)}/unit</small>
                </td>
                <td>
                    ${getVarianceTypeBadge(variance.varianceType)}
                </td>
                <td>
                    ${getApprovalStatusBadge(variance.approvalStatus)}
                    ${variance.approvalStatus === 'PENDING' ? '<br><small class="text-muted">Pending review</small>' : ''}
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-info" onclick="viewVarianceDetails('${variance._id}')" title="View Details">
                            <i class="fa fa-eye"></i>
                        </button>
                        ${variance.approvalStatus === 'PENDING' ?
                `<button class="btn btn-sm btn-success" onclick="approveVariance('${variance._id}')" title="Approve">
                                <i class="md md-check"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="rejectVariance('${variance._id}')" title="Reject">
                                <i class="md md-close"></i>
                            </button>` : ''
            }
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });

    // Add change event listeners to checkboxes
    $('.variance-checkbox').change(function () {
        updateBulkActionButtons();
    });
}

function updateBulkActionButtons() {
    selectedVarianceIds = [];

    $('.variance-checkbox:checked').each(function () {
        selectedVarianceIds.push($(this).data('variance-id'));
    });

    const hasSelection = selectedVarianceIds.length > 0;
    $('#bulkApproveSelectedBtn, #bulkRejectSelectedBtn').prop('disabled', !hasSelection);
}

function viewVarianceDetails(varianceId) {
    currentVarianceId = varianceId;

    $.ajax({
        url: `/api/stock-variances/${varianceId}`,
        method: 'GET',
        success: function (variance) {
            // Item Information
            $('#detailProductName').text(variance.productName);
            $('#detailProductCode').text(variance.productCode);
            $('#detailBarcode').text(variance.barcode || 'N/A');
            $('#detailCategory').text(variance.categoryName || 'N/A');
            $('#detailLocation').text(variance.location || 'N/A');
            $('#detailBatchNumber').text(variance.batchNumber || 'N/A');

            // Variance Information
            $('#detailExpectedQty').text(variance.expectedQuantity);
            $('#detailCountedQty').text(variance.countedQuantity);
            const varianceClass = variance.varianceType === 'SURPLUS' ? 'text-success' :
                variance.varianceType === 'SHORTAGE' ? 'text-danger' : 'text-warning';
            $('#detailVariance').html(`<span class="${varianceClass}">${variance.variance > 0 ? '+' : ''}${variance.variance}</span>`);
            $('#detailUnitPrice').text(`₹${variance.unitPrice.toFixed(2)}`);
            $('#detailVarianceValue').text(`₹${variance.varianceValue.toFixed(2)}`);
            $('#detailVarianceType').html(getVarianceTypeBadge(variance.varianceType));

            // Count Information
            $('#detailStockCount').text(variance.stockCountName);
            $('#detailCountedBy').text(variance.countedByName || 'N/A');
            $('#detailCountDate').text(formatDate(variance.countDate));
            $('#detailNotes').text(variance.notes || 'No notes');

            // Approval History
            loadApprovalHistory(varianceId);

            // Update action buttons based on status
            if (variance.approvalStatus === 'PENDING') {
                $('#approveVarianceBtn, #rejectVarianceBtn').show();
            } else {
                $('#approveVarianceBtn, #rejectVarianceBtn').hide();
            }

            $('#varianceDetailsModal').modal('show');
        },
        error: function (xhr, status, error) {
            console.error('Error loading variance details:', error);
            showError('Failed to load variance details.');
        }
    });
}

function loadApprovalHistory(varianceId) {
    $.ajax({
        url: `/api/stock-count-approvals/variance/${varianceId}`,
        method: 'GET',
        success: function (approvals) {
            const historyDiv = $('#approvalHistory');

            if (approvals.length === 0) {
                historyDiv.html('<p class="text-muted">No approval history available</p>');
                return;
            }

            let historyHtml = '<div class="timeline">';

            approvals.forEach(approval => {
                const statusClass = approval.status === 'APPROVED' ? 'success' :
                    approval.status === 'REJECTED' ? 'danger' : 'warning';

                historyHtml += `
                    <div class="timeline-item">
                        <div class="timeline-point timeline-point-${statusClass}"></div>
                        <div class="timeline-content">
                            <h5 class="timeline-title">${approval.status}</h5>
                            <p class="timeline-text">
                                <strong>${approval.approvedByName}</strong> - ${approval.approvalLevel}
                                <br>
                                ${approval.reason || 'No reason provided'}
                                <br>
                                <small class="text-muted">${formatDateTime(approval.approvedAt)}</small>
                            </p>
                        </div>
                    </div>
                `;
            });

            historyHtml += '</div>';
            historyDiv.html(historyHtml);
        },
        error: function (xhr, status, error) {
            console.error('Error loading approval history:', error);
            $('#approvalHistory').html('<p class="text-danger">Error loading approval history</p>');
        }
    });
}

function approveVariance(varianceId) {
    currentVarianceId = varianceId;
    $('#approvalModalTitle').text('Approve Variance');
    $('#approvalReason').val('');
    $('#adjustmentAction').val('auto');
    $('#approvalModal').modal('show');
}

function rejectVariance(varianceId) {
    currentVarianceId = varianceId;
    $('#rejectionReason').val('');
    $('#recountRequired').val('yes');
    $('#rejectionModal').modal('show');
}

function confirmApproval() {
    const reason = $('#approvalReason').val().trim();
    const adjustmentAction = $('#adjustmentAction').val();

    if (!reason) {
        showError('Please provide an approval reason.');
        return;
    }

    $.ajax({
        url: `/api/stock-variances/${currentVarianceId}/approve`,
        method: 'PUT',
        data: {
            reason: reason,
            adjustmentAction: adjustmentAction
        },
        success: function (response) {
            showSuccess('Variance approved successfully!');
            $('#approvalModal').modal('hide');
            loadVariances();
            loadVarianceSummary();

            // If viewing details modal, update it
            if ($('#varianceDetailsModal').is(':visible')) {
                viewVarianceDetails(currentVarianceId);
            }
        },
        error: function (xhr, status, error) {
            console.error('Error approving variance:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to approve variance.');
        }
    });
}

function confirmRejection() {
    const reason = $('#rejectionReason').val().trim();
    const recountRequired = $('#recountRequired').val();

    if (!reason) {
        showError('Please provide a rejection reason.');
        return;
    }

    $.ajax({
        url: `/api/stock-variances/${currentVarianceId}/reject`,
        method: 'PUT',
        data: {
            reason: reason,
            recountRequired: recountRequired === 'yes'
        },
        success: function (response) {
            showSuccess('Variance rejected successfully!');
            $('#rejectionModal').modal('hide');
            loadVariances();
            loadVarianceSummary();

            // If viewing details modal, update it
            if ($('#varianceDetailsModal').is(':visible')) {
                viewVarianceDetails(currentVarianceId);
            }
        },
        error: function (xhr, status, error) {
            console.error('Error rejecting variance:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to reject variance.');
        }
    });
}

function initializeApproval() {
    if (!stockCountId) {
        showError('No stock count selected for approval initialization.');
        return;
    }

    if (!confirm('Are you sure you want to initialize the approval workflow for this stock count? This will create approval records for all variances.')) {
        return;
    }

    $.ajax({
        url: `/api/stock-count-approvals/session/${stockCountId}/initialize`,
        method: 'POST',
        success: function (response) {
            showSuccess(`Approval workflow initialized! ${response.approvalsCreated} approval records created.`);
            loadVariances();
            loadVarianceSummary();
        },
        error: function (xhr, status, error) {
            console.error('Error initializing approval workflow:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to initialize approval workflow.');
        }
    });
}

function bulkApproveAll() {
    if (!stockCountId) {
        showError('No stock count selected for bulk approval.');
        return;
    }

    if (!confirm('Are you sure you want to approve all pending variances for this stock count? This action cannot be undone.')) {
        return;
    }

    $.ajax({
        url: `/api/stock-variances/session/${stockCountId}/bulk-approve`,
        method: 'POST',
        data: {
            reason: 'Bulk approval for all pending variances',
            adjustmentAction: 'auto'
        },
        success: function (response) {
            showSuccess(`Bulk approval completed! ${response.approvedCount} variances approved.`);
            loadVariances();
            loadVarianceSummary();
        },
        error: function (xhr, status, error) {
            console.error('Error in bulk approval:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to perform bulk approval.');
        }
    });
}

function bulkApproveSelected() {
    if (selectedVarianceIds.length === 0) {
        showError('No variances selected for approval.');
        return;
    }

    if (!confirm(`Are you sure you want to approve ${selectedVarianceIds.length} selected variances? This action cannot be undone.`)) {
        return;
    }

    $.ajax({
        url: './api/stock-variances/bulk-approve',
        method: 'POST',
        data: {
            varianceIds: selectedVarianceIds,
            reason: 'Bulk approval of selected variances',
            adjustmentAction: 'auto'
        },
        success: function (response) {
            showSuccess(`Bulk approval completed! ${response.approvedCount} variances approved.`);
            loadVariances();
            loadVarianceSummary();
            updateBulkActionButtons();
        },
        error: function (xhr, status, error) {
            console.error('Error in bulk approval:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to perform bulk approval.');
        }
    });
}

function bulkRejectSelected() {
    if (selectedVarianceIds.length === 0) {
        showError('No variances selected for rejection.');
        return;
    }

    const reason = prompt('Please provide a reason for rejecting these variances:');
    if (!reason) {
        return;
    }

    $.ajax({
        url: './api/stock-variances/bulk-reject',
        method: 'POST',
        data: {
            varianceIds: selectedVarianceIds,
            reason: reason,
            recountRequired: true
        },
        success: function (response) {
            showSuccess(`Bulk rejection completed! ${response.rejectedCount} variances rejected.`);
            loadVariances();
            loadVarianceSummary();
            updateBulkActionButtons();
        },
        error: function (xhr, status, error) {
            console.error('Error in bulk rejection:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to perform bulk rejection.');
        }
    });
}

function createAdjustments() {
    if (!stockCountId) {
        showError('No stock count selected for adjustment creation.');
        return;
    }

    if (!confirm('Are you sure you want to create stock adjustments for all approved variances? This will update inventory levels.')) {
        return;
    }

    $.ajax({
        url: `/api/stock-adjustments/bulk-from-variances`,
        method: 'POST',
        data: {
            sessionId: stockCountId
        },
        success: function (response) {
            showSuccess(`Adjustments created successfully! ${response.adjustmentsCreated} adjustments created.`);
            loadVarianceSummary();
        },
        error: function (xhr, status, error) {
            console.error('Error creating adjustments:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to create adjustments.');
        }
    });
}

function exportVariances() {
    const params = {
        ...currentFilters,
        export: true
    };

    if (stockCountId) {
        params.sessionId = stockCountId;
    }

    window.open(`/api/stock-variances?${$.param(params)}`, '_blank');
}

function applyFilters() {
    currentFilters = {
        sessionId: $('#stockCountFilter').val(),
        varianceType: $('#varianceTypeFilter').val(),
        approvalStatus: $('#approvalStatusFilter').val(),
        valueRange: $('#valueRangeFilter').val(),
        category: $('#categoryFilter').val()
    };

    currentPage = 1;
    loadVariances();
}

function loadVarianceSummary() {
    const params = {};

    if (stockCountId) {
        params.sessionId = stockCountId;
    }

    $.ajax({
        url: './api/stock-variances/summary',
        method: 'GET',
        data: params,
        success: function (summary) {
            $('#totalVariances').text(summary.totalVariances);
            $('#surplusItems').text(summary.surplusItems);
            $('#shortageItems').text(summary.shortageItems);
            $('#totalVarianceValue').text(summary.totalVarianceValue.toFixed(2));
            $('#pendingApprovals').text(summary.pendingApprovals);
            $('#highValueVariances').text(summary.highValueVariances);
            $('#approvedToday').text(summary.approvedToday);
            $('#adjustmentsCreated').text(summary.adjustmentsCreated);
        },
        error: function (xhr, status, error) {
            console.error('Error loading variance summary:', error);
        }
    });
}

function refreshSummary() {
    loadVarianceSummary();
}

function updatePagination(pagination) {
    $('#startVariance').text((pagination.page - 1) * pagination.limit + 1);
    $('#endVariance').text(Math.min(pagination.page * pagination.limit, pagination.total));
    $('#totalVariancesCount').text(pagination.total);

    const paginationDiv = $('#variancesPagination');
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
    loadVariances();
}

function loadCategories() {
    $.ajax({
        url: './api/categories',
        method: 'GET',
        success: function (categories) {
            const categorySelect = $('#categoryFilter');

            categorySelect.empty();
            categorySelect.append('<option value="">All Categories</option>');

            categories.forEach(category => {
                categorySelect.append(`<option value="${category._id}">${category.name}</option>`);
            });
        },
        error: function (xhr, status, error) {
            console.error('Error loading categories:', error);
        }
    });
}

// Utility functions
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

function getVarianceTypeBadge(type) {
    const badges = {
        'SURPLUS': '<span class="label label-success">Surplus</span>',
        'SHORTAGE': '<span class="label label-danger">Shortage</span>',
        'EXPIRED': '<span class="label label-warning">Expired</span>'
    };
    return badges[type] || '<span class="label label-default">Unknown</span>';
}

function getApprovalStatusBadge(status) {
    const badges = {
        'PENDING': '<span class="label label-warning">Pending</span>',
        'APPROVED': '<span class="label label-success">Approved</span>',
        'REJECTED': '<span class="label label-danger">Rejected</span>'
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