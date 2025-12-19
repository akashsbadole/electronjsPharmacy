$(document).ready(function() {
    // Get stock count ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    stockCountId = urlParams.get('id');
    
    if (!stockCountId) {
        showError('Stock count ID not provided. Redirecting to stock count management...');
        setTimeout(() => {
            window.location.href = 'stock-count-management.html';
        }, 2000);
        return;
    }
    
    // Initialize
    loadStockCountInfo();
    loadCountItems();
    loadCategories();
    loadLocations();
    
    // Event handlers
    $('#scanModeBtn').click(toggleScanMode);
    $('#batchModeBtn').click(toggleBatchMode);
    $('#manualModeBtn').click(toggleManualMode);
    $('#importBtn').click(showImportModal);
    $('#exportBtn').click(exportCountData);
    $('#applyFiltersBtn').click(applyFilters);
    $('#scanBarcodeBtn').click(scanBarcode);
    $('#barcodeInput').keypress(function(e) {
        if (e.which === 13) {
            scanBarcode();
        }
    });
    $('#addBatchCountBtn').click(addBatchCount);
    $('#saveProgressBtn').click(saveProgress);
    $('#completeCountBtn').click(completeCount);
    $('#backToListBtn').click(() => {
        window.location.href = 'stock-count-management.html';
    });
    $('#saveItemBtn').click(saveItemEdit);
    $('#processImportBtn').click(processImport);
    
    // Auto-refresh every 30 seconds
    setInterval(loadCountItems, 30000);
    
    // Initialize search functionality
    $('#itemSearch').on('input', debounce(searchItems, 300));
    $('#batchItemSearch').on('input', debounce(searchBatchItems, 300));
});

let stockCountId;
let currentPage = 1;
let currentFilters = {};
let currentMode = 'manual'; // manual, scan, batch
let editingItemId = null;

function loadStockCountInfo() {
    $.ajax({
        url: `/api/stock-counts/${stockCountId}`,
        method: 'GET',
        success: function(count) {
            $('#countName').text(count.countName);
            $('#countType').html(getTypeBadge(count.countType));
            $('#countStatus').html(getStatusBadge(count.countStatus));
            $('#storeName').text(count.storeName || 'Unknown');
            $('#supervisorName').text(count.supervisorName || 'Not assigned');
            $('#scheduledDate').text(formatDate(count.scheduledDate));
            
            // Update progress
            updateProgress(count);
            
            // Check if count is still active
            if (count.countStatus !== 'ACTIVE') {
                disableCounting();
                showWarning(`This stock count is ${count.countStatus.toLowerCase()}. Editing is disabled.`);
            }
        },
        error: function(xhr, status, error) {
            console.error('Error loading stock count info:', error);
            showError('Failed to load stock count information.');
        }
    });
}

function loadCountItems() {
    const params = {
        page: currentPage,
        limit: 20,
        ...currentFilters
    };
    
    $.ajax({
        url: `/api/stock-count-items/session/${stockCountId}`,
        method: 'GET',
        data: params,
        success: function(response) {
            displayCountItems(response.items);
            updatePagination(response.pagination);
            updateProgress(response.statistics);
        },
        error: function(xhr, status, error) {
            console.error('Error loading count items:', error);
            showError('Failed to load count items.');
        }
    });
}

function displayCountItems(items) {
    const tbody = $('#countItemsList');
    tbody.empty();
    
    if (items.length === 0) {
        tbody.append(`
            <tr>
                <td colspan="7" class="text-center">
                    <div class="alert alert-info">
                        <i class="fa fa-info-circle"></i> No items found matching the current criteria.
                    </div>
                </td>
            </tr>
        `);
        return;
    }
    
    items.forEach(item => {
        const varianceClass = item.variance === 0 ? '' : 
                              item.variance > 0 ? 'text-success' : 'text-danger';
        
        const row = `
            <tr>
                <td>
                    <div>
                        <strong>${item.productName}</strong>
                        <br>
                        <small class="text-muted">Code: ${item.productCode}</small>
                        ${item.barcode ? `<br><small class="text-muted">Barcode: ${item.barcode}</small>` : ''}
                    </div>
                </td>
                <td>${item.location || '-'}</td>
                <td>${item.expectedQuantity}</td>
                <td>
                    <input type="number" class="form-control counted-qty-input" 
                           data-item-id="${item._id}" 
                           value="${item.countedQuantity || 0}" 
                           min="0" 
                           ${item.isVerified ? 'disabled' : ''}>
                </td>
                <td class="${varianceClass}">
                    <strong>${item.variance > 0 ? '+' : ''}${item.variance}</strong>
                    ${item.isVerified ? '<i class="md md-check-circle text-success" title="Verified"></i>' : ''}
                </td>
                <td>
                    ${item.batchNumber || '-'}
                    ${item.expiryDate ? `<br><small class="text-muted">${formatDate(item.expiryDate)}</small>` : ''}
                </td>
                <td>
                    <div class="btn-group">
                        <button class="btn btn-sm btn-info" onclick="editItem('${item._id}')" title="Edit Item">
                            <i class="fa fa-edit"></i>
                        </button>
                        ${!item.isVerified ? 
                            `<button class="btn btn-sm btn-success" onclick="verifyItem('${item._id}')" title="Verify Count">
                                <i class="md md-check"></i>
                            </button>` : ''
                        }
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
    
    // Add change event listeners to quantity inputs
    $('.counted-qty-input').on('change', function() {
        const itemId = $(this).data('item-id');
        const countedQty = parseInt($(this).val()) || 0;
        updateCountedQuantity(itemId, countedQty);
    });
}

function updateCountedQuantity(itemId, countedQty) {
    $.ajax({
        url: `/api/stock-count-items/${itemId}`,
        method: 'PUT',
        data: { countedQuantity: countedQty },
        success: function(response) {
            showSuccess('Item quantity updated successfully!');
            loadCountItems(); // Refresh to show updated variance
        },
        error: function(xhr, status, error) {
            console.error('Error updating item quantity:', error);
            showError('Failed to update item quantity.');
        }
    });
}

function editItem(itemId) {
    editingItemId = itemId;
    
    $.ajax({
        url: `/api/stock-count-items/${itemId}`,
        method: 'GET',
        success: function(item) {
            $('#editItemName').val(item.productName);
            $('#editItemCode').val(item.productCode);
            $('#editExpectedQty').val(item.expectedQuantity);
            $('#editCountedQty').val(item.countedQuantity || 0);
            $('#editVariance').val(item.variance > 0 ? `+${item.variance}` : item.variance);
            $('#editBatchNumber').val(item.batchNumber || '');
            $('#editExpiryDate').val(formatDate(item.expiryDate));
            $('#editNotes').val(item.notes || '');
            
            $('#itemEditModal').modal('show');
        },
        error: function(xhr, status, error) {
            console.error('Error loading item details:', error);
            showError('Failed to load item details.');
        }
    });
}

function saveItemEdit() {
    const countedQty = parseInt($('#editCountedQty').val()) || 0;
    const notes = $('#editNotes').val();
    
    $.ajax({
        url: `/api/stock-count-items/${editingItemId}`,
        method: 'PUT',
        data: { 
            countedQuantity: countedQty,
            notes: notes
        },
        success: function(response) {
            showSuccess('Item updated successfully!');
            $('#itemEditModal').modal('hide');
            loadCountItems();
        },
        error: function(xhr, status, error) {
            console.error('Error saving item:', error);
            showError('Failed to save item.');
        }
    });
}

function verifyItem(itemId) {
    if (!confirm('Are you sure you want to verify this count? This will mark it as final and prevent further changes.')) {
        return;
    }
    
    $.ajax({
        url: `/api/stock-count-items/${itemId}/verify`,
        method: 'PUT',
        success: function(response) {
            showSuccess('Item verified successfully!');
            loadCountItems();
        },
        error: function(xhr, status, error) {
            console.error('Error verifying item:', error);
            showError('Failed to verify item.');
        }
    });
}

function toggleScanMode() {
    if (currentMode === 'scan') {
        showManualMode();
    } else {
        currentMode = 'scan';
        $('#manualMode').hide();
        $('#batchMode').hide();
        $('#scanMode').show();
        $('#scanModeBtn').addClass('btn-primary').removeClass('btn-default');
        $('#batchModeBtn').addClass('btn-default').removeClass('btn-primary');
        $('#barcodeInput').focus();
    }
}

function toggleBatchMode() {
    if (currentMode === 'batch') {
        showManualMode();
    } else {
        currentMode = 'batch';
        $('#manualMode').hide();
        $('#scanMode').hide();
        $('#batchMode').show();
        $('#batchModeBtn').addClass('btn-primary').removeClass('btn-default');
        $('#scanModeBtn').addClass('btn-default').removeClass('btn-primary');
        $('#batchItemSearch').focus();
    }
}

function showManualMode() {
    currentMode = 'manual';
    $('#scanMode').hide();
    $('#batchMode').hide();
    $('#manualMode').show();
    $('#scanModeBtn').addClass('btn-default').removeClass('btn-primary');
    $('#batchModeBtn').addClass('btn-default').removeClass('btn-primary');
}

function scanBarcode() {
    const barcode = $('#barcodeInput').val().trim();
    const quantity = parseInt($('#quantityInput').val()) || 1;
    
    if (!barcode) {
        showError('Please enter or scan a barcode.');
        return;
    }
    
    $.ajax({
        url: '/api/stock-count-items/scan',
        method: 'POST',
        data: {
            sessionId: stockCountId,
            barcode: barcode,
            quantity: quantity
        },
        success: function(response) {
            showSuccess(`Item scanned: ${response.item.productName}`);
            $('#barcodeInput').val('');
            $('#quantityInput').val(1);
            $('#barcodeInput').focus();
            
            // Add to recently scanned list
            addToScannedList(response.item, quantity);
            
            // Refresh count items if in manual mode
            if (currentMode === 'manual') {
                loadCountItems();
            }
        },
        error: function(xhr, status, error) {
            console.error('Error scanning barcode:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to scan barcode.');
        }
    });
}

function addToScannedList(item, quantity) {
    const tbody = $('#scannedItemsList');
    
    // Clear placeholder if exists
    if (tbody.find('td[colspan="5"]').length > 0) {
        tbody.empty();
    }
    
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    
    const row = `
        <tr>
            <td>${timeString}</td>
            <td>${item.productName}</td>
            <td>${item.barcode || item.productCode}</td>
            <td>${quantity}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeScannedItem(this)" title="Remove">
                    <i class="fa fa-trash"></i>
                </button>
            </td>
        </tr>
    `;
    
    // Add to top of list
    tbody.prepend(row);
    
    // Keep only last 10 items
    const rows = tbody.find('tr');
    if (rows.length > 10) {
        rows.slice(10).remove();
    }
}

function removeScannedItem(button) {
    $(button).closest('tr').remove();
    
    // Show placeholder if list is empty
    const tbody = $('#scannedItemsList');
    if (tbody.find('tr').length === 0) {
        tbody.html(`
            <tr>
                <td colspan="5" class="text-center text-muted">
                    No items scanned yet
                </td>
            </tr>
        `);
    }
}

function searchBatchItems() {
    const searchTerm = $('#batchItemSearch').val().trim();
    
    if (searchTerm.length < 2) {
        $('#batchItemResults').empty();
        return;
    }
    
    $.ajax({
        url: `/api/stock-count-items/session/${stockCountId}/scan-ready`,
        method: 'GET',
        data: { search: searchTerm },
        success: function(items) {
            displayBatchItemResults(items);
        },
        error: function(xhr, status, error) {
            console.error('Error searching items:', error);
        }
    });
}

function displayBatchItemResults(items) {
    const resultsDiv = $('#batchItemResults');
    resultsDiv.empty();
    
    if (items.length === 0) {
        resultsDiv.html('<div class="alert alert-warning">No items found</div>');
        return;
    }
    
    const list = $('<div class="list-group"></div>');
    
    items.forEach(item => {
        const itemDiv = `
            <div class="list-group-item batch-item" data-item-id="${item._id}">
                <h5 class="list-group-item-heading">${item.productName}</h5>
                <p class="list-group-item-text">
                    Code: ${item.productCode} | 
                    Location: ${item.location || '-'} | 
                    Expected: ${item.expectedQuantity}
                </p>
            </div>
        `;
        list.append(itemDiv);
    });
    
    resultsDiv.append(list);
    
    // Add click handlers
    $('.batch-item').click(function() {
        const itemId = $(this).data('item-id');
        selectBatchItem(itemId);
    });
}

function selectBatchItem(itemId) {
    $.ajax({
        url: `/api/stock-count-items/${itemId}`,
        method: 'GET',
        success: function(item) {
            $('#batchItemSearch').val(item.productName);
            $('#batchItemSearch').data('selected-item-id', itemId);
            $('#batchItemResults').empty();
            $('#batchQuantity').focus();
        },
        error: function(xhr, status, error) {
            console.error('Error loading item:', error);
        }
    });
}

function addBatchCount() {
    const itemId = $('#batchItemSearch').data('selected-item-id');
    const quantity = parseInt($('#batchQuantity').val()) || 0;
    const location = $('#batchLocation').val();
    
    if (!itemId) {
        showError('Please select an item first.');
        return;
    }
    
    if (quantity <= 0) {
        showError('Please enter a valid quantity.');
        return;
    }
    
    $.ajax({
        url: `/api/stock-count-items/${itemId}`,
        method: 'PUT',
        data: { 
            countedQuantity: quantity,
            location: location
        },
        success: function(response) {
            showSuccess('Batch count added successfully!');
            
            // Clear form
            $('#batchItemSearch').val('').removeData('selected-item-id');
            $('#batchQuantity').val('');
            $('#batchLocation').val('');
            $('#batchItemResults').empty();
            
            // Add to batch count list
            addToBatchCountList(response.item, quantity, location);
            
            // Refresh count items if in manual mode
            if (currentMode === 'manual') {
                loadCountItems();
            }
        },
        error: function(xhr, status, error) {
            console.error('Error adding batch count:', error);
            showError('Failed to add batch count.');
        }
    });
}

function addToBatchCountList(item, quantity, location) {
    const tbody = $('#batchCountList');
    
    // Clear placeholder if exists
    if (tbody.find('td[colspan="6"]').length > 0) {
        tbody.empty();
    }
    
    const variance = quantity - item.expectedQuantity;
    const varianceClass = variance === 0 ? '' : variance > 0 ? 'text-success' : 'text-danger';
    
    const row = `
        <tr>
            <td>${item.productName}</td>
            <td>${location || item.location || '-'}</td>
            <td>${item.expectedQuantity}</td>
            <td>${quantity}</td>
            <td class="${varianceClass}">${variance > 0 ? '+' : ''}${variance}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="removeBatchCount(this)" title="Remove">
                    <i class="fa fa-trash"></i>
                </button>
            </td>
        </tr>
    `;
    
    // Add to top of list
    tbody.prepend(row);
}

function removeBatchCount(button) {
    $(button).closest('tr').remove();
    
    // Show placeholder if list is empty
    const tbody = $('#batchCountList');
    if (tbody.find('tr').length === 0) {
        tbody.html(`
            <tr>
                <td colspan="6" class="text-center text-muted">
                    No batch counts added yet
                </td>
            </tr>
        `);
    }
}

function applyFilters() {
    currentFilters = {
        search: $('#itemSearch').val(),
        category: $('#categoryFilter').val(),
        location: $('#locationFilter').val(),
        variance: $('#varianceFilter').val()
    };
    
    currentPage = 1;
    loadCountItems();
}

function searchItems() {
    // Debounced search will call applyFilters
    applyFilters();
}

function updatePagination(pagination) {
    $('#startItem').text((pagination.page - 1) * pagination.limit + 1);
    $('#endItem').text(Math.min(pagination.page * pagination.limit, pagination.total));
    $('#totalItemsCount').text(pagination.total);
    
    const paginationDiv = $('#itemsPagination');
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
    loadCountItems();
}

function updateProgress(count) {
    const progressPercent = count.totalItems > 0 ? 
        Math.round((count.countedItems / count.totalItems) * 100) : 0;
    
    $('#progressBar').css('width', progressPercent + '%')
                     .attr('aria-valuenow', progressPercent)
                     .text(progressPercent + '%');
    $('#countedItems').text(count.countedItems);
    $('#totalItems').text(count.totalItems);
}

function saveProgress() {
    showSuccess('Progress saved automatically!');
}

function completeCount() {
    if (!confirm('Are you sure you want to complete this stock count? This will finalize the count and calculate variances.')) {
        return;
    }
    
    $.ajax({
        url: `/api/stock-counts/${stockCountId}/complete`,
        method: 'POST',
        success: function(response) {
            showSuccess('Stock count completed successfully!');
            
            // Redirect to variance review if there are variances
            if (response.statistics && response.statistics.varianceItems > 0) {
                setTimeout(() => {
                    window.location.href = `stock-count-variances.html?id=${stockCountId}`;
                }, 1500);
            } else {
                setTimeout(() => {
                    window.location.href = 'stock-count-management.html';
                }, 1500);
            }
        },
        error: function(xhr, status, error) {
            console.error('Error completing stock count:', error);
            showError(xhr.responseJSON ? xhr.responseJSON.message : 'Failed to complete stock count.');
        }
    });
}

function showImportModal() {
    $('#importModal').modal('show');
}

function processImport() {
    const fileInput = document.getElementById('importFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showError('Please select a file to import.');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('sessionId', stockCountId);
    
    $.ajax({
        url: '/api/stock-count-items/import',
        method: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            showSuccess(`Import completed! ${response.imported} items imported, ${response.errors} errors.`);
            $('#importModal').modal('hide');
            loadCountItems();
        },
        error: function(xhr, status, error) {
            console.error('Error importing file:', error);
            showError('Failed to import file. Please check the file format and try again.');
        }
    });
}

function exportCountData() {
    window.open(`/api/stock-count-items/session/${stockCountId}/export`, '_blank');
}

function loadCategories() {
    $.ajax({
        url: '/api/categories',
        method: 'GET',
        success: function(categories) {
            const categorySelect = $('#categoryFilter');
            
            categorySelect.empty();
            categorySelect.append('<option value="">All Categories</option>');
            
            categories.forEach(category => {
                categorySelect.append(`<option value="${category._id}">${category.name}</option>`);
            });
        },
        error: function(xhr, status, error) {
            console.error('Error loading categories:', error);
        }
    });
}

function loadLocations() {
    // This would typically come from a locations API
    // For now, using some common pharmacy locations
    const locations = [
        'Main Store',
        'Pharmacy Counter',
        'Storage Room A',
        'Storage Room B',
        'Refrigerator',
        'Controlled Substance Cabinet'
    ];
    
    const locationSelect = $('#locationFilter, #batchLocation');
    
    locationSelect.each(function() {
        const $this = $(this);
        $this.empty();
        $this.append('<option value="">All Locations</option>');
        
        locations.forEach(location => {
            $this.append(`<option value="${location}">${location}</option>`);
        });
    });
}

function disableCounting() {
    $('.counted-qty-input').prop('disabled', true);
    $('#scanModeBtn, #batchModeBtn, #importBtn').prop('disabled', true);
    $('#completeCountBtn').prop('disabled', true);
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

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    const date = new Date(dateString);
    return date.toLocaleDateString();
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

function showWarning(message) {
    $('.alert').remove();
    
    const alertHtml = `
        <div class="alert alert-warning alert-dismissible" style="position: fixed; top: 20px; right: 20px; z-index: 9999; min-width: 300px;">
            <button type="button" class="close" data-dismiss="alert" aria-hidden="true">&times;</button>
            <strong>Warning!</strong> ${message}
        </div>
    `;
    
    $('body').append(alertHtml);
    
    setTimeout(() => {
        $('.alert-warning').fadeOut();
    }, 8000);
}

function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}