$(document).ready(function() {
    // Global variables
    let currentStoreId = null;
    let currentStoreName = 'Main Store';
    
    // Initialize store management
    initStoreManagement();
    
    function initStoreManagement() {
        loadStores();
        setupEventHandlers();
        
        // Set default store
        setCurrentStore(1, 'Main Store');
        
        // Update store display in products modal
        updateStoreDisplayInProducts();
    }
    
    function setupEventHandlers() {
        // Store form submission
        $('#saveStore').on('submit', function(e) {
            e.preventDefault();
            saveStore();
        });
        
        // Store selector button click
        $('#storeSelectorBtn').on('click', function() {
            loadStoresForSelector();
        });
        
        // Store management modal show
        $('#storeManagementModal').on('show.bs.modal', function() {
            loadStoresForManagement();
        });
    }
    
    function loadStores() {
        $.get('/api/stores/all', function(data) {
            if (data.success) {
                // If there are stores, set the main store as current
                const mainStore = data.stores.find(store => store.isMainStore);
                if (mainStore) {
                    setCurrentStore(mainStore._id, mainStore.name);
                } else if (data.stores.length > 0) {
                    setCurrentStore(data.stores[0]._id, data.stores[0].name);
                }
            }
        }).fail(function() {
            console.error('Failed to load stores');
        });
    }
    
    function loadStoresForSelector() {
        $.get('/api/stores/all', function(data) {
            if (data.success) {
                const storeList = $('#storeList');
                storeList.empty();
                
                data.stores.forEach(store => {
                    const storeItem = `
                        <a href="#" class="list-group-item store-item ${store._id === currentStoreId ? 'active' : ''}" 
                           data-store-id="${store._id}" data-store-name="${store.name}">
                            <h5 class="list-group-item-heading">${store.name}</h5>
                            <p class="list-group-item-text">${store.address || 'No address'}</p>
                            ${store.isMainStore ? '<span class="badge badge-primary">Main Store</span>' : ''}
                            ${!store.isActive ? '<span class="badge badge-warning">Inactive</span>' : ''}
                        </a>
                    `;
                    storeList.append(storeItem);
                });
                
                // Add click handlers for store selection
                $('.store-item').on('click', function(e) {
                    e.preventDefault();
                    const storeId = $(this).data('store-id');
                    const storeName = $(this).data('store-name');
                    setCurrentStore(storeId, storeName);
                    $('#storeSelectorModal').modal('hide');
                    
                    // Reload page to reflect store change
                    location.reload();
                });
            }
        }).fail(function() {
            console.error('Failed to load stores for selector');
        });
    }
    
    function loadStoresForManagement() {
        $.get('/api/stores/all', function(data) {
            if (data.success) {
                const storeTableBody = $('#store_table_body');
                storeTableBody.empty();
                
                data.stores.forEach(store => {
                    const statusBadge = store.isActive ? 
                        '<span class="badge badge-success">Active</span>' : 
                        '<span class="badge badge-warning">Inactive</span>';
                    
                    const mainStoreBadge = store.isMainStore ? 
                        '<span class="badge badge-primary">Main</span>' : '';
                    
                    const row = `
                        <tr>
                            <td>${store.name} ${mainStoreBadge}</td>
                            <td>${store.address || '-'}</td>
                            <td>${statusBadge}</td>
                            <td>
                                <button class="btn btn-sm btn-info edit-store" data-store-id="${store._id}">
                                    <i class="glyphicon glyphicon-edit"></i>
                                </button>
                                ${!store.isMainStore ? `
                                    <button class="btn btn-sm btn-danger delete-store" data-store-id="${store._id}">
                                        <i class="glyphicon glyphicon-trash"></i>
                                    </button>
                                ` : ''}
                            </td>
                        </tr>
                    `;
                    storeTableBody.append(row);
                });
                
                // Add click handlers for edit and delete
                $('.edit-store').on('click', function() {
                    const storeId = $(this).data('store-id');
                    editStore(storeId);
                });
                
                $('.delete-store').on('click', function() {
                    const storeId = $(this).data('store-id');
                    if (confirm('Are you sure you want to delete this store?')) {
                        deleteStore(storeId);
                    }
                });
            }
        }).fail(function() {
            console.error('Failed to load stores for management');
        });
    }
    
    function saveStore() {
        const formData = {
            id: $('#store_id').val(),
            name: $('#storeName').val(),
            address: $('#storeAddress').val(),
            phone: $('#storePhone').val(),
            email: $('#storeEmail').val(),
            isMainStore: $('#isMainStore').is(':checked'),
            isActive: $('#isActive').is(':checked')
        };
        
        const url = formData.id ? `/api/stores/${formData.id}` : '/api/stores/create';
        const method = formData.id ? 'PUT' : 'POST';
        
        $.ajax({
            url: url,
            method: method,
            contentType: 'application/json',
            data: JSON.stringify(formData),
            success: function(response) {
                if (response.success) {
                    alert('Store saved successfully!');
                    $('#storeManagementModal').modal('hide');
                    resetStoreForm();
                    loadStores();
                } else {
                    alert('Error: ' + response.message);
                }
            },
            error: function() {
                alert('Error saving store');
            }
        });
    }
    
    function editStore(storeId) {
        $.get(`/api/stores/${storeId}`, function(data) {
            if (data.success) {
                const store = data.store;
                $('#store_id').val(store._id);
                $('#storeName').val(store.name);
                $('#storeAddress').val(store.address || '');
                $('#storePhone').val(store.phone || '');
                $('#storeEmail').val(store.email || '');
                $('#isMainStore').prop('checked', store.isMainStore);
                $('#isActive').prop('checked', store.isActive);
                
                $('#storeManagementModal').modal('show');
            }
        }).fail(function() {
            alert('Error loading store data');
        });
    }
    
    function deleteStore(storeId) {
        $.ajax({
            url: `/api/stores/${storeId}`,
            method: 'DELETE',
            success: function(response) {
                if (response.success) {
                    alert('Store deleted successfully!');
                    loadStoresForManagement();
                } else {
                    alert('Error: ' + response.message);
                }
            },
            error: function() {
                alert('Error deleting store');
            }
        });
    }
    
    function resetStoreForm() {
        $('#store_id').val('');
        $('#storeName').val('');
        $('#storeAddress').val('');
        $('#storePhone').val('');
        $('#storeEmail').val('');
        $('#isMainStore').prop('checked', false);
        $('#isActive').prop('checked', true);
    }
    
    function setCurrentStore(storeId, storeName) {
        currentStoreId = storeId;
        currentStoreName = storeName;
        $('#currentStoreDisplay').text(storeName);
        
        // Store in session for persistence
        sessionStorage.setItem('currentStoreId', storeId);
        sessionStorage.setItem('currentStoreName', storeName);
    }
    
    // Load current store from session on page load
    function loadCurrentStoreFromSession() {
        const storedStoreId = sessionStorage.getItem('currentStoreId');
        const storedStoreName = sessionStorage.getItem('currentStoreName');
        
        if (storedStoreId && storedStoreName) {
            setCurrentStore(storedStoreId, storedStoreName);
        }
    }
    
    // Call this on page load
    loadCurrentStoreFromSession();
    
    // Update product list when products modal is shown
    $('#Products').on('show.bs.modal', function() {
        updateStoreDisplayInProducts();
        // Override product loading to show store-specific inventory
        loadProductsWithStoreInventory();
    });
});

function updateStoreDisplayInProducts() {
    const currentStoreName = getCurrentStoreName();
    $('#currentStoreInProducts').text(currentStoreName);
}

function loadProductsWithStoreInventory() {
    const currentStoreId = getCurrentStoreId();
    
    // Load products with store-specific inventory
    $.get('/api/inventory/all', function(data) {
        if (data.success) {
            const productTableBody = $('#product_list');
            productTableBody.empty();
            
            data.products.forEach(product => {
                // Get store-specific inventory for this product
                $.get(`/api/store-inventory/product/${product._id}/store/${currentStoreId}`, function(storeData) {
                    const storeQuantity = storeData.success && storeData.inventory ? storeData.inventory.quantity : 0;
                    
                    const row = `
                        <tr>
                            <td>${product.barcode}</td>
                            <td><img src="${product.image || 'assets/images/default.jpg'}" width="30" height="30"></td>
                            <td>${product.name}</td>
                            <td>${product.price}</td>
                            <td>${product.quantity}</td>
                            <td><span class="label label-info">${storeQuantity}</span></td>
                            <td>${product.expirationDate || '-'}</td>
                            <td>${product.category || '-'}</td>
                            <td>
                                <button class="btn btn-sm btn-info edit-product" data-product-id="${product._id}">
                                    <i class="glyphicon glyphicon-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-danger delete-product" data-product-id="${product._id}">
                                    <i class="glyphicon glyphicon-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                    productTableBody.append(row);
                }).fail(function() {
                    // If store inventory fails, still show product with 0 store quantity
                    const row = `
                        <tr>
                            <td>${product.barcode}</td>
                            <td><img src="${product.image || 'assets/images/default.jpg'}" width="30" height="30"></td>
                            <td>${product.name}</td>
                            <td>${product.price}</td>
                            <td>${product.quantity}</td>
                            <td><span class="label label-warning">0</span></td>
                            <td>${product.expirationDate || '-'}</td>
                            <td>${product.category || '-'}</td>
                            <td>
                                <button class="btn btn-sm btn-info edit-product" data-product-id="${product._id}">
                                    <i class="glyphicon glyphicon-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-danger delete-product" data-product-id="${product._id}">
                                    <i class="glyphicon glyphicon-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                    productTableBody.append(row);
                });
            });
        }
    }).fail(function() {
        console.error('Failed to load products');
    });
}

// Global function to get current store ID
function getCurrentStoreId() {
    return sessionStorage.getItem('currentStoreId') || 1;
}

// Global function to get current store name
function getCurrentStoreName() {
    return sessionStorage.getItem('currentStoreName') || 'Main Store';
}