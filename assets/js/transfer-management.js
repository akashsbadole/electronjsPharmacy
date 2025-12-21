$(document).ready(function () {
    // Initialize transfer management
    initTransferManagement();

    function initTransferManagement() {
        setupTransferEventHandlers();
    }

    function setupTransferEventHandlers() {
        // Transfer form submission
        $('#createTransfer').on('submit', function (e) {
            e.preventDefault();
            createTransfer();
        });

        // Transfer modal show
        $('#transferStockModal').on('show.bs.modal', function () {
            loadProductsForTransfer();
            loadStoresForTransfer();
            loadRecentTransfers();
        });

        // Product change handler to update available quantity
        $('#transferProduct, #fromStore').on('change', function () {
            updateAvailableQuantity();
        });
    }

    function loadProductsForTransfer() {
        $.get('/api/inventory/all', function (data) {
            if (data.success) {
                const productSelect = $('#transferProduct');
                productSelect.empty();
                productSelect.append('<option value="">Select Product</option>');

                data.products.forEach(product => {
                    productSelect.append(`<option value="${product._id}">${product.name} (${product.barcode})</option>`);
                });
            }
        }).fail(function () {
            console.error('Failed to load products for transfer');
        });
    }

    function loadStoresForTransfer() {
        $.get('/api/stores/all', function (data) {
            if (data.success) {
                const fromStoreSelect = $('#fromStore');
                const toStoreSelect = $('#toStore');

                fromStoreSelect.empty();
                fromStoreSelect.append('<option value="">Select Source Store</option>');

                toStoreSelect.empty();
                toStoreSelect.append('<option value="">Select Destination Store</option>');

                data.stores.forEach(store => {
                    if (store.isActive) {
                        fromStoreSelect.append(`<option value="${store._id}">${store.name}</option>`);
                        toStoreSelect.append(`<option value="${store._id}">${store.name}</option>`);
                    }
                });

                // Set current store as default source
                const currentStoreId = getCurrentStoreId();
                fromStoreSelect.val(currentStoreId);
            }
        }).fail(function () {
            console.error('Failed to load stores for transfer');
        });
    }

    function updateAvailableQuantity() {
        const productId = $('#transferProduct').val();
        const fromStoreId = $('#fromStore').val();

        if (productId && fromStoreId) {
            $.get(`/api/store-inventory/product/${productId}/store/${fromStoreId}`, function (data) {
                if (data.success) {
                    const availableQty = data.inventory ? data.inventory.quantity : 0;
                    $('#transferQuantity').attr('max', availableQty);
                    $('#transferQuantity').after(`<small class="help-block">Available: ${availableQty}</small>`);
                    $('.help-block').not(':last').remove();
                }
            }).fail(function () {
                console.error('Failed to get available quantity');
            });
        }
    }

    function createTransfer() {
        const formData = {
            productId: $('#transferProduct').val(),
            fromStoreId: $('#fromStore').val(),
            toStoreId: $('#toStore').val(),
            quantity: parseInt($('#transferQuantity').val()),
            reason: $('#transferReason').val(),
            requestedBy: $('#loggedin-user').text().trim()
        };

        // Validate source and destination are different
        if (formData.fromStoreId === formData.toStoreId) {
            alert('Source and destination stores must be different');
            return;
        }

        $.ajax({
            url: './api/transfers/create',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(formData),
            success: function (response) {
                if (response.success) {
                    alert('Transfer request created successfully!');
                    $('#transferStockModal').modal('hide');
                    resetTransferForm();
                    loadRecentTransfers();
                } else {
                    alert('Error: ' + response.message);
                }
            },
            error: function () {
                alert('Error creating transfer');
            }
        });
    }

    function loadRecentTransfers() {
        $.get('/api/transfers/status/pending', function (data) {
            if (data.success) {
                const transferTableBody = $('#transfer_table_body');
                transferTableBody.empty();

                if (data.transfers.length === 0) {
                    transferTableBody.append('<tr><td colspan="7" class="text-center">No pending transfers</td></tr>');
                    return;
                }

                data.transfers.forEach(transfer => {
                    const statusBadge = getStatusBadge(transfer.status);
                    const row = `
                        <tr>
                            <td>${transfer.transferId}</td>
                            <td>${transfer.productName}</td>
                            <td>${transfer.fromStoreName}</td>
                            <td>${transfer.toStoreName}</td>
                            <td>${transfer.quantity}</td>
                            <td>${statusBadge}</td>
                            <td>${new Date(transfer.createdAt).toLocaleDateString()}</td>
                        </tr>
                    `;
                    transferTableBody.append(row);
                });
            }
        }).fail(function () {
            console.error('Failed to load recent transfers');
        });
    }

    function getStatusBadge(status) {
        switch (status) {
            case 'pending':
                return '<span class="badge badge-warning">Pending</span>';
            case 'approved':
                return '<span class="badge badge-info">Approved</span>';
            case 'completed':
                return '<span class="badge badge-success">Completed</span>';
            case 'rejected':
                return '<span class="badge badge-danger">Rejected</span>';
            default:
                return '<span class="badge badge-secondary">Unknown</span>';
        }
    }

    function resetTransferForm() {
        $('#createTransfer')[0].reset();
        $('.help-block').remove();
    }
});