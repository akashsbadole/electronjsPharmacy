$(document).ready(function() {
    // Initialize delivery management
    initDeliveryManagement();
});

function initDeliveryManagement() {
    // Load delivery orders on tab show
    $('a[href="#deliveryOrdersTab"]').on('shown.bs.tab', function(e) {
        loadDeliveryOrders();
    });
    
    // Load drivers on tab show
    $('a[href="#driversTab"]').on('shown.bs.tab', function(e) {
        loadDrivers();
    });
    
    // Load routes on tab show
    $('a[href="#routesTab"]').on('shown.bs.tab', function(e) {
        loadRoutes();
    });
    
    // Initialize tracking map on tab show
    $('a[href="#trackingTab"]').on('shown.bs.tab', function(e) {
        initTrackingMap();
    });
    
    // Initialize route planning map on tab show
    $('a[href="#routesTab"]').on('shown.bs.tab', function(e) {
        initRoutePlanningMap();
    });
    
    // Delivery order search
    $('#deliveryOrderSearch').on('keyup', function() {
        const searchTerm = $(this).val().toLowerCase();
        $('#deliveryOrdersTable tbody tr').filter(function() {
            $(this).toggle($(this).text().toLowerCase().indexOf(searchTerm) > -1);
        });
    });
    
    // Driver search
    $('#driverSearch').on('keyup', function() {
        const searchTerm = $(this).val().toLowerCase();
        $('#driversTable tbody tr').filter(function() {
            $(this).toggle($(this).text().toLowerCase().indexOf(searchTerm) > -1);
        });
    });
    
    // Route search
    $('#routeSearch').on('keyup', function() {
        const searchTerm = $(this).val().toLowerCase();
        $('#routesTable tbody tr').filter(function() {
            $(this).toggle($(this).text().toLowerCase().indexOf(searchTerm) > -1);
        });
    });
    
    // Initialize tooltips
    $('[data-toggle="tooltip"]').tooltip();
}

// Delivery Order Management
function loadDeliveryOrders() {
    $.ajax({
        url: '/api/delivery/orders',
        type: 'GET',
        success: function(response) {
            if (response.success) {
                renderDeliveryOrders(response.orders);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to load delivery orders', 'OK');
        }
    });
}

function renderDeliveryOrders(orders) {
    const tbody = $('#deliveryOrdersBody');
    tbody.empty();
    
    if (orders.length === 0) {
        tbody.append('<tr><td colspan="6" class="text-center">No delivery orders found</td></tr>');
        return;
    }
    
    orders.forEach(function(order) {
        const statusBadge = getStatusBadge(order.status);
        const priorityBadge = getPriorityBadge(order.priority);
        
        const row = `
            <tr>
                <td>${order.orderNumber}</td>
                <td>${order.customerName}</td>
                <td>${order.deliveryAddress.address}, ${order.deliveryAddress.city}</td>
                <td>${statusBadge}</td>
                <td>${priorityBadge}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewDeliveryOrder('${order._id}')" title="View">
                        <i class="glyphicon glyphicon-eye-open"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editDeliveryOrder('${order._id}')" title="Edit">
                        <i class="glyphicon glyphicon-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-success" onclick="assignDriver('${order._id}')" title="Assign Driver">
                        <i class="glyphicon glyphicon-user"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function getStatusBadge(status) {
    const badges = {
        'pending': '<span class="label label-warning">Pending</span>',
        'assigned': '<span class="label label-info">Assigned</span>',
        'in_progress': '<span class="label label-primary">In Progress</span>',
        'delivered': '<span class="label label-success">Delivered</span>',
        'cancelled': '<span class="label label-danger">Cancelled</span>'
    };
    return badges[status] || '<span class="label label-default">Unknown</span>';
}

function getPriorityBadge(priority) {
    const badges = {
        'standard': '<span class="label label-default">Standard</span>',
        'express': '<span class="label label-warning">Express</span>',
        'urgent': '<span class="label label-danger">Urgent</span>'
    };
    return badges[priority] || '<span class="label label-default">Standard</span>';
}

function viewDeliveryOrder(orderId) {
    $.ajax({
        url: `/api/delivery/orders/${orderId}`,
        type: 'GET',
        success: function(response) {
            if (response.success) {
                showDeliveryOrderDetails(response.order);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to load delivery order details', 'OK');
        }
    });
}

function showDeliveryOrderDetails(order) {
    const details = `
        <div class="row">
            <div class="col-md-6">
                <strong>Order Number:</strong> ${order.orderNumber}<br>
                <strong>Customer:</strong> ${order.customerName}<br>
                <strong>Phone:</strong> ${order.customerPhone}<br>
                <strong>Status:</strong> ${getStatusBadge(order.status)}<br>
                <strong>Priority:</strong> ${getPriorityBadge(order.priority)}
            </div>
            <div class="col-md-6">
                <strong>Delivery Address:</strong><br>
                ${order.deliveryAddress.address}<br>
                ${order.deliveryAddress.city}, ${order.deliveryAddress.state} ${order.deliveryAddress.postalCode}<br><br>
                <strong>Delivery Notes:</strong> ${order.deliveryNotes || 'None'}<br>
                <strong>Estimated Delivery:</strong> ${new Date(order.estimatedDelivery).toLocaleString()}
            </div>
        </div>
        <hr>
        <h4>Order Items</h4>
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>Product</th>
                    <th>Quantity</th>
                    <th>Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                ${order.items.map(item => `
                    <tr>
                        <td>${item.name}</td>
                        <td>${item.quantity}</td>
                        <td>${item.price.toFixed(2)}</td>
                        <td>${(item.quantity * item.price).toFixed(2)}</td>
                    </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr>
                    <th colspan="3">Total:</th>
                    <th>${order.total.toFixed(2)}</th>
                </tr>
            </tfoot>
        </table>
    `;
    
    notiflix.Report.info('Delivery Order Details', details, 'Close');
}

// Driver Management
function loadDrivers() {
    $.ajax({
        url: '/api/delivery/drivers',
        type: 'GET',
        success: function(response) {
            if (response.success) {
                renderDrivers(response.drivers);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to load drivers', 'OK');
        }
    });
}

function renderDrivers(drivers) {
    const tbody = $('#driversBody');
    tbody.empty();
    
    if (drivers.length === 0) {
        tbody.append('<tr><td colspan="5" class="text-center">No drivers found</td></tr>');
        return;
    }
    
    drivers.forEach(function(driver) {
        const statusBadge = driver.isAvailable ? 
            '<span class="label label-success">Available</span>' : 
            '<span class="label label-danger">Unavailable</span>';
        
        const row = `
            <tr>
                <td>${driver.name}</td>
                <td>${driver.phone}</td>
                <td>${driver.vehicleType} - ${driver.vehicleNumber}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewDriver('${driver._id}')" title="View">
                        <i class="glyphicon glyphicon-eye-open"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editDriver('${driver._id}')" title="Edit">
                        <i class="glyphicon glyphicon-edit"></i>
                    </button>
                    <button class="btn btn-sm ${driver.isAvailable ? 'btn-warning' : 'btn-success'}" 
                            onclick="toggleDriverAvailability('${driver._id}')" 
                            title="${driver.isAvailable ? 'Set Unavailable' : 'Set Available'}">
                        <i class="glyphicon glyphicon-${driver.isAvailable ? 'pause' : 'play'}"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function viewDriver(driverId) {
    $.ajax({
        url: `/api/delivery/drivers/${driverId}`,
        type: 'GET',
        success: function(response) {
            if (response.success) {
                showDriverDetails(response.driver);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to load driver details', 'OK');
        }
    });
}

function showDriverDetails(driver) {
    const details = `
        <div class="row">
            <div class="col-md-6">
                <strong>Name:</strong> ${driver.name}<br>
                <strong>Phone:</strong> ${driver.phone}<br>
                <strong>Email:</strong> ${driver.email || 'Not provided'}<br>
                <strong>Status:</strong> ${driver.isAvailable ? 
                    '<span class="label label-success">Available</span>' : 
                    '<span class="label label-danger">Unavailable</span>'}
            </div>
            <div class="col-md-6">
                <strong>Vehicle Type:</strong> ${driver.vehicleType}<br>
                <strong>Vehicle Number:</strong> ${driver.vehicleNumber}<br>
                <strong>License Number:</strong> ${driver.licenseNumber}<br>
                <strong>Total Deliveries:</strong> ${driver.stats.totalDeliveries || 0}<br>
                <strong>Success Rate:</strong> ${driver.stats.successRate || 100}%
            </div>
        </div>
    `;
    
    notiflix.Report.info('Driver Details', details, 'Close');
}

function toggleDriverAvailability(driverId) {
    $.ajax({
        url: `/api/delivery/drivers/${driverId}/toggle-availability`,
        type: 'PUT',
        success: function(response) {
            if (response.success) {
                notiflix.Report.success('Success', 'Driver availability updated', 'OK');
                loadDrivers();
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to update driver availability', 'OK');
        }
    });
}

// Route Management
function loadRoutes() {
    $.ajax({
        url: '/api/delivery/routes',
        type: 'GET',
        success: function(response) {
            if (response.success) {
                renderRoutes(response.routes);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to load routes', 'OK');
        }
    });
}

function renderRoutes(routes) {
    const tbody = $('#routesBody');
    tbody.empty();
    
    if (routes.length === 0) {
        tbody.append('<tr><td colspan="5" class="text-center">No routes found</td></tr>');
        return;
    }
    
    routes.forEach(function(route) {
        const statusBadge = getStatusBadge(route.status);
        
        const row = `
            <tr>
                <td>${route.name}</td>
                <td>${route.driver ? route.driver.name : 'Unassigned'}</td>
                <td>${route.orders.length}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewRoute('${route._id}')" title="View">
                        <i class="glyphicon glyphicon-eye-open"></i>
                    </button>
                    <button class="btn btn-sm btn-warning" onclick="editRoute('${route._id}')" title="Edit">
                        <i class="glyphicon glyphicon-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="optimizeRoute('${route._id}')" title="Optimize">
                        <i class="glyphicon glyphicon-refresh"></i>
                    </button>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

function viewRoute(routeId) {
    $.ajax({
        url: `/api/delivery/routes/${routeId}`,
        type: 'GET',
        success: function(response) {
            if (response.success) {
                showRouteDetails(response.route);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to load route details', 'OK');
        }
    });
}

function showRouteDetails(route) {
    const details = `
        <div class="row">
            <div class="col-md-6">
                <strong>Route Name:</strong> ${route.name}<br>
                <strong>Driver:</strong> ${route.driver ? route.driver.name : 'Unassigned'}<br>
                <strong>Status:</strong> ${getStatusBadge(route.status)}<br>
                <strong>Total Orders:</strong> ${route.orders.length}<br>
                <strong>Estimated Distance:</strong> ${route.estimatedDistance || 'N/A'} km<br>
                <strong>Estimated Time:</strong> ${route.estimatedTime || 'N/A'} mins
            </div>
            <div class="col-md-6">
                <strong>Created:</strong> ${new Date(route.createdAt).toLocaleString()}<br>
                <strong>Updated:</strong> ${new Date(route.updatedAt).toLocaleString()}<br>
                <strong>Start Time:</strong> ${route.startTime ? new Date(route.startTime).toLocaleString() : 'Not started'}<br>
                <strong>End Time:</strong> ${route.endTime ? new Date(route.endTime).toLocaleString() : 'Not completed'}
            </div>
        </div>
        <hr>
        <h4>Delivery Orders</h4>
        <table class="table table-striped">
            <thead>
                <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Address</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                ${route.orders.map(order => `
                    <tr>
                        <td>${order.orderNumber}</td>
                        <td>${order.customerName}</td>
                        <td>${order.deliveryAddress.address}</td>
                        <td>${getStatusBadge(order.status)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    
    notiflix.Report.info('Route Details', details, 'Close');
}

function optimizeRoute(routeId) {
    notiflix.Confirm.show(
        'Optimize Route',
        'Do you want to optimize this route for better efficiency?',
        'Yes', 'No',
        function() {
            $.ajax({
                url: `/api/delivery/routes/${routeId}/optimize`,
                type: 'POST',
                success: function(response) {
                    if (response.success) {
                        notiflix.Report.success('Success', 'Route optimized successfully', 'OK');
                        loadRoutes();
                    } else {
                        notiflix.Report.failure('Error', response.message, 'OK');
                    }
                },
                error: function(xhr, status, error) {
                    notiflix.Report.failure('Error', 'Failed to optimize route', 'OK');
                }
            });
        }
    );
}

// Tracking
let trackingMap = null;

function initTrackingMap() {
    if (trackingMap) {
        return; // Already initialized
    }
    
    // Initialize the map
    trackingMap = L.map('trackingMap').setView([20.5937, 78.9629], 5); // Center on India
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(trackingMap);
}

function trackDelivery() {
    const orderId = $('#trackingOrderId').val().trim();
    
    if (!orderId) {
        notiflix.Report.warning('Warning', 'Please enter a delivery order ID', 'OK');
        return;
    }
    
    $.ajax({
        url: `/api/delivery/tracking/${orderId}`,
        type: 'GET',
        success: function(response) {
            if (response.success) {
                showTrackingResults(response.tracking);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to track delivery', 'OK');
        }
    });
}

function showTrackingResults(tracking) {
    $('#trackingResults').show();
    
    // Clear existing markers
    if (trackingMap) {
        trackingMap.eachLayer(function(layer) {
            if (layer instanceof L.Marker) {
                trackingMap.removeLayer(layer);
            }
        });
    }
    
    // Add markers for delivery locations
    if (tracking.currentLocation) {
        const driverMarker = L.marker([tracking.currentLocation.lat, tracking.currentLocation.lng])
            .addTo(trackingMap)
            .bindPopup('Driver Current Location');
        
        // Center map on driver location
        trackingMap.setView([tracking.currentLocation.lat, tracking.currentLocation.lng], 13);
    }
    
    if (tracking.deliveryLocation) {
        const deliveryMarker = L.marker([tracking.deliveryLocation.lat, tracking.deliveryLocation.lng])
            .addTo(trackingMap)
            .bindPopup('Delivery Address');
    }
    
    // Draw route if available
    if (tracking.route && tracking.route.length > 0) {
        const routeCoordinates = tracking.route.map(point => [point.lat, point.lng]);
        const routeLine = L.polyline(routeCoordinates, {color: 'blue', weight: 4, opacity: 0.7})
            .addTo(trackingMap);
    }
    
    // Update delivery details
    const details = `
        <div class="row">
            <div class="col-md-6">
                <strong>Order Number:</strong> ${tracking.orderNumber}<br>
                <strong>Customer:</strong> ${tracking.customerName}<br>
                <strong>Driver:</strong> ${tracking.driverName}<br>
                <strong>Status:</strong> ${getStatusBadge(tracking.status)}<br>
                <strong>Estimated Arrival:</strong> ${tracking.eta ? new Date(tracking.eta).toLocaleString() : 'N/A'}
            </div>
            <div class="col-md-6">
                <strong>Progress:</strong> ${tracking.progress || 0}%<br>
                <strong>Distance Remaining:</strong> ${tracking.distanceRemaining || 'N/A'} km<br>
                <strong>Last Updated:</strong> ${new Date(tracking.lastUpdated).toLocaleString()}<br>
                <strong>Delivery Address:</strong> ${tracking.deliveryAddress}
            </div>
        </div>
        <hr>
        <h4>Status History</h4>
        <div class="timeline">
            ${tracking.statusHistory.map(status => `
                <div class="timeline-item">
                    <div class="timeline-marker ${status.status}"></div>
                    <div class="timeline-content">
                        <strong>${formatStatus(status.status)}</strong>
                        <span class="pull-right">${new Date(status.timestamp).toLocaleString()}</span>
                        <br>
                        ${status.notes || ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    
    $('#deliveryDetails').html(details);
}

function formatStatus(status) {
    const formatted = {
        'pending': 'Order Pending',
        'assigned': 'Driver Assigned',
        'picked_up': 'Order Picked Up',
        'in_transit': 'In Transit',
        'delivered': 'Delivered',
        'cancelled': 'Cancelled'
    };
    return formatted[status] || status;
}

// POS Integration
function loadCustomerDeliveryAddresses(customerId) {
    $.ajax({
        url: `/api/customers/${customerId}/delivery-addresses`,
        type: 'GET',
        success: function(response) {
            if (response.success) {
                populateDeliveryAddresses(response.addresses);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to load delivery addresses', 'OK');
        }
    });
}

function populateDeliveryAddresses(addresses) {
    const select = $('#deliveryAddress');
    select.empty();
    select.append('<option value="">Select delivery address</option>');
    
    addresses.forEach(function(address) {
        const option = `<option value="${address._id}">${address.address}, ${address.city}</option>`;
        select.append(option);
    });
}

// Process delivery order from POS
$('#processDelivery').on('click', function() {
    const customerData = JSON.parse($("#customer").val());
    const selectedAddressId = $('#deliveryAddress').val();
    const priority = $('#deliveryPriority').val();
    const notes = $('#deliveryNotes').val();
    
    if (!selectedAddressId) {
        notiflix.Report.warning('Warning', 'Please select a delivery address', 'OK');
        return;
    }
    
    // Create delivery order
    const deliveryData = {
        customerId: customerData.id,
        customerName: customerData.name,
        customerPhone: customerData.phone,
        deliveryAddressId: selectedAddressId,
        priority: priority,
        deliveryNotes: notes,
        items: cart,
        total: parseFloat($("#gross_price").text())
    };
    
    $.ajax({
        url: '/api/delivery/orders',
        type: 'POST',
        data: deliveryData,
        success: function(response) {
            if (response.success) {
                notiflix.Report.success('Success', 'Delivery order created successfully', 'OK');
                $('#deliveryModal').modal('hide');
                
                // Process payment for the delivery order
                processDeliveryPayment(response.order);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to create delivery order', 'OK');
        }
    });
});

function processDeliveryPayment(deliveryOrder) {
    // Calculate total with delivery fee
    const subtotal = parseFloat($("#gross_price").text());
    const deliveryFee = deliveryOrder.deliveryFee || 0;
    const totalAmount = subtotal + deliveryFee;
    
    // Update payment modal with delivery fee
    $('#payablePrice').val(totalAmount.toFixed(2));
    $('#paymentText').val(totalAmount.toFixed(2));
    
    // Show payment modal
    $('#paymentModel').modal('show');
    
    // Store delivery order ID for payment processing
    $('#paymentModel').data('deliveryOrderId', deliveryOrder._id);
}

// Override payment confirmation to handle delivery orders
$('#confirmPayment').off('click').on('click', function() {
    const deliveryOrderId = $('#paymentModel').data('deliveryOrderId');
    
    if (deliveryOrderId) {
        // This is a delivery order, update its status to paid
        $.ajax({
            url: `/api/delivery/orders/${deliveryOrderId}/payment`,
            type: 'POST',
            data: {
                amount: $('#payment').val(),
                method: $('.list-group-item.active').data('payment-method'),
                paymentInfo: $('#paymentInfo').val()
            },
            success: function(response) {
                if (response.success) {
                    notiflix.Report.success('Success', 'Payment processed successfully', 'OK');
                    $('#paymentModel').modal('hide');
                    $('#paymentModel').removeData('deliveryOrderId');
                    
                    // Clear cart and reset POS
                    cancelOrder();
                } else {
                    notiflix.Report.failure('Error', response.message, 'OK');
                }
            },
            error: function(xhr, status, error) {
                notiflix.Report.failure('Error', 'Failed to process payment', 'OK');
            }
        });
    } else {
        // Regular transaction payment (existing logic)
        // ... existing payment processing code ...
    }
});

// Toggle new address form
$('#deliveryAddress').on('change', function() {
    if ($(this).val() === 'new') {
        $('#newAddressForm').show();
    } else {
        $('#newAddressForm').hide();
    }
});

// Add new delivery address
$('#addNewAddressBtn').on('click', function() {
    const customerData = JSON.parse($("#customer").val());
    const addressData = {
        address: $('#newAddress').val(),
        city: $('#newCity').val(),
        state: $('#newState').val(),
        postalCode: $('#newPostalCode').val(),
        isDefault: $('#isDefaultAddress').is(':checked')
    };
    
    $.ajax({
        url: `/api/customers/${customerData.id}/delivery-address`,
        type: 'POST',
        data: addressData,
        success: function(response) {
            if (response.success) {
                notiflix.Report.success('Success', 'Delivery address added successfully', 'OK');
                $('#newAddressForm').hide();
                loadCustomerDeliveryAddresses(customerData.id);
                
                // Clear form
                $('#newAddress, #newCity, #newState, #newPostalCode').val('');
                $('#isDefaultAddress').prop('checked', false);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to add delivery address', 'OK');
        }
    });
});

// Route Planning
let routePlanningMap = null;
let routeMarkers = [];
let routePolyline = null;

function initRoutePlanningMap() {
    if (routePlanningMap) {
        return; // Already initialized
    }
    
    // Initialize map
    routePlanningMap = L.map('routePlanningMap').setView([20.5937, 78.9629], 12); // Center on India with higher zoom
    
    // Add OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(routePlanningMap);
    
    // Add click event to add waypoints
    routePlanningMap.on('click', function(e) {
        addRouteWaypoint(e.latlng);
    });
}

function addRouteWaypoint(latlng) {
    const waypointNumber = routeMarkers.length + 1;
    
    // Create custom icon for waypoint
    const waypointIcon = L.divIcon({
        html: `<div style="background-color: #5bc0de; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">${waypointNumber}</div>`,
        iconSize: [30, 30],
        className: 'route-waypoint-marker'
    });
    
    // Add marker to map
    const marker = L.marker(latlng, { icon: waypointIcon })
        .addTo(routePlanningMap)
        .bindPopup(`Waypoint ${waypointNumber}<br>Lat: ${latlng.lat.toFixed(6)}<br>Lng: ${latlng.lng.toFixed(6)}`);
    
    routeMarkers.push(marker);
    
    // Update route line if we have at least 2 points
    if (routeMarkers.length >= 2) {
        updateRoutePolyline();
    }
}

function updateRoutePolyline() {
    // Remove existing polyline
    if (routePolyline) {
        routePlanningMap.removeLayer(routePolyline);
    }
    
    // Get coordinates from markers
    const coordinates = routeMarkers.map(marker => {
        const latlng = marker.getLatLng();
        return [latlng.lat, latlng.lng];
    });
    
    // Create new polyline
    routePolyline = L.polyline(coordinates, {
        color: '#5bc0de',
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10'
    }).addTo(routePlanningMap);
}

function clearRouteMap() {
    // Remove all markers
    routeMarkers.forEach(marker => {
        routePlanningMap.removeLayer(marker);
    });
    routeMarkers = [];
    
    // Remove polyline
    if (routePolyline) {
        routePlanningMap.removeLayer(routePolyline);
        routePolyline = null;
    }
}

function visualizeRouteOnMap(route) {
    // Clear existing route
    clearRouteMap();
    
    if (!route.waypoints || route.waypoints.length === 0) {
        return;
    }
    
    // Add waypoints to map
    route.waypoints.forEach((waypoint, index) => {
        if (waypoint.location_lat && waypoint.location_lng) {
            const waypointIcon = L.divIcon({
                html: `<div style="background-color: #5bc0de; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">${index + 1}</div>`,
                iconSize: [30, 30],
                className: 'route-waypoint-marker'
            });
            
            const marker = L.marker([waypoint.location_lat, waypoint.location_lng], { icon: waypointIcon })
                .addTo(routePlanningMap)
                .bindPopup(`
                    <strong>Waypoint ${index + 1}</strong><br>
                    ${waypoint.customer_name || 'Delivery Point'}<br>
                    ${waypoint.address || 'Address'}<br>
                    Order: ${waypoint.order_number || 'N/A'}
                `);
            
            routeMarkers.push(marker);
        }
    });
    
    // Draw route line
    updateRoutePolyline();
    
    // Fit map to show all waypoints
    if (routeMarkers.length > 0) {
        const group = new L.featureGroup(routeMarkers);
        routePlanningMap.fitBounds(group.getBounds().pad(0.1));
    }
}

function showRoutePlanningModal(routeId) {
    // Create modal if it doesn't exist
    if (!$('#routePlanningModal').length) {
        const modalHtml = `
            <div id="routePlanningModal" class="modal fade bs-example-modal-lg" tabindex="-1" role="dialog" aria-hidden="true">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <button type="button" class="close" data-dismiss="modal" aria-hidden="true">×</button>
                            <h4 class="modal-title">Route Planning & Visualization</h4>
                        </div>
                        <div class="modal-body">
                            <div class="row">
                                <div class="col-md-8">
                                    <div id="routePlanningMap" style="height: 500px; width: 100%; border: 1px solid #ccc; border-radius: 5px;"></div>
                                </div>
                                <div class="col-md-4">
                                    <div class="panel panel-default">
                                        <div class="panel-heading">
                                            <h4>Route Information</h4>
                                        </div>
                                        <div class="panel-body" id="routePlanningInfo">
                                            <p>Click on the map to add waypoints for manual route planning, or load an existing route to visualize it.</p>
                                            <hr>
                                            <button type="button" class="btn btn-warning btn-sm" onclick="clearRouteMap()">
                                                <i class="glyphicon glyphicon-trash"></i> Clear Route
                                            </button>
                                            <button type="button" class="btn btn-info btn-sm" onclick="optimizeManualRoute()">
                                                <i class="glyphicon glyphicon-refresh"></i> Optimize Route
                                            </button>
                                            <hr>
                                            <div id="routeStats" style="display: none;">
                                                <h5>Route Statistics</h5>
                                                <p><strong>Total Distance:</strong> <span id="routeDistance">0</span> km</p>
                                                <p><strong>Estimated Time:</strong> <span id="routeTime">0</span> minutes</p>
                                                <p><strong>Waypoints:</strong> <span id="routeWaypoints">0</span></p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
                            <button type="button" class="btn btn-primary" onclick="saveManualRoute()">Save Route</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        $('body').append(modalHtml);
    }
    
    // Initialize map when modal is shown
    $('#routePlanningModal').on('shown.bs.modal', function() {
        setTimeout(function() {
            initRoutePlanningMap();
            
            // Load route data if routeId is provided
            if (routeId) {
                loadRouteForPlanning(routeId);
            }
        }, 200);
    });
    
    // Show modal
    $('#routePlanningModal').modal('show');
}

function loadRouteForPlanning(routeId) {
    $.ajax({
        url: `/api/delivery/routes/${routeId}`,
        type: 'GET',
        success: function(response) {
            if (response.success) {
                visualizeRouteOnMap(response.route);
                updateRoutePlanningInfo(response.route);
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to load route for planning', 'OK');
        }
    });
}

function updateRoutePlanningInfo(route) {
    const info = `
        <h5>${route.name}</h5>
        <p><strong>Driver:</strong> ${route.driver ? route.driver.name : 'Unassigned'}</p>
        <p><strong>Status:</strong> ${getStatusBadge(route.status)}</p>
        <p><strong>Total Orders:</strong> ${route.total_orders || 0}</p>
        <p><strong>Estimated Distance:</strong> ${route.total_distance_km || 0} km</p>
        <p><strong>Estimated Duration:</strong> ${route.estimated_duration_minutes || 0} minutes</p>
        <p><strong>Created:</strong> ${new Date(route.created_at).toLocaleString()}</p>
    `;
    
    $('#routePlanningInfo').html(info);
    
    // Show route stats
    $('#routeStats').show();
    $('#routeDistance').text(route.total_distance_km || 0);
    $('#routeTime').text(route.estimated_duration_minutes || 0);
    $('#routeWaypoints').text(route.waypoints ? route.waypoints.length : 0);
}

function optimizeManualRoute() {
    if (routeMarkers.length < 2) {
        notiflix.Report.warning('Warning', 'Please add at least 2 waypoints to optimize the route', 'OK');
        return;
    }
    
    // Create waypoints array from markers
    const waypoints = routeMarkers.map((marker, index) => {
        const latlng = marker.getLatLng();
        return {
            _id: `wp-${index}`,
            location_lat: latlng.lat,
            location_lng: latlng.lng,
            waypoint_order: index + 1
        };
    });
    
    notiflix.Confirm.show(
        'Optimize Route',
        'Do you want to optimize this route using the nearest neighbor algorithm?',
        'Yes', 'No',
        function() {
            $.ajax({
                url: '/api/delivery/routes/optimize-waypoints',
                type: 'POST',
                data: { waypoints: waypoints },
                success: function(response) {
                    if (response.success) {
                        // Clear and redraw optimized route
                        clearRouteMap();
                        
                        // Add optimized waypoints to map
                        response.optimizedWaypoints.forEach((waypoint, index) => {
                            if (waypoint.location_lat && waypoint.location_lng) {
                                const waypointIcon = L.divIcon({
                                    html: `<div style="background-color: #5cb85c; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px;">${index + 1}</div>`,
                                    iconSize: [30, 30],
                                    className: 'route-waypoint-marker optimized'
                                });
                                
                                const marker = L.marker([waypoint.location_lat, waypoint.location_lng], { icon: waypointIcon })
                                    .addTo(routePlanningMap)
                                    .bindPopup(`Optimized Waypoint ${index + 1}<br>Lat: ${waypoint.location_lat.toFixed(6)}<br>Lng: ${waypoint.location_lng.toFixed(6)}`);
                                
                                routeMarkers.push(marker);
                            }
                        });
                        
                        // Update route line
                        updateRoutePolyline();
                        
                        // Update stats
                        $('#routeDistance').text(response.totalDistance.toFixed(2));
                        $('#routeTime').text(response.estimatedDuration);
                        
                        notiflix.Report.success('Success', 'Route optimized successfully', 'OK');
                    } else {
                        notiflix.Report.failure('Error', response.message, 'OK');
                    }
                },
                error: function(xhr, status, error) {
                    notiflix.Report.failure('Error', 'Failed to optimize route', 'OK');
                }
            });
        }
    );
}

function saveManualRoute() {
    if (routeMarkers.length < 2) {
        notiflix.Report.warning('Warning', 'Please add at least 2 waypoints to create a route', 'OK');
        return;
    }
    
    // Create route data
    const routeData = {
        name: prompt('Enter route name:') || 'New Route',
        waypoints: routeMarkers.map((marker, index) => {
            const latlng = marker.getLatLng();
            return {
                location_lat: latlng.lat,
                location_lng: latlng.lng,
                waypoint_order: index + 1
            };
        })
    };
    
    $.ajax({
        url: '/api/delivery/routes/new',
        type: 'POST',
        data: routeData,
        success: function(response) {
            if (response.success) {
                notiflix.Report.success('Success', 'Route created successfully', 'OK');
                $('#routePlanningModal').modal('hide');
                loadRoutes(); // Refresh routes list
            } else {
                notiflix.Report.failure('Error', response.message, 'OK');
            }
        },
        error: function(xhr, status, error) {
            notiflix.Report.failure('Error', 'Failed to create route', 'OK');
        }
    });
}