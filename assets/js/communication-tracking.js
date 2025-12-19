/**
 * Communication Tracking Module for PharmaSpot
 * Tracks delivery status of shared invoices
 */

$(document).ready(function() {
    // Initialize communication tracking functionality
    initializeCommunicationTracking();
});

/**
 * Initialize communication tracking functionality
 */
function initializeCommunicationTracking() {
    // Check if we're on the communication tracking page
    if (window.location.pathname.includes('communication-tracking')) {
        createTrackingInterface();
        bindTrackingEvents();
        loadCommunications();
    }
}

/**
 * Create communication tracking interface
 */
function createTrackingInterface() {
    const interfaceHtml = `
        <div class="row">
            <div class="col-md-12">
                <div class="panel panel-default">
                    <div class="panel-heading">
                        <h3 class="panel-title">Communication Tracking</h3>
                    </div>
                    <div class="panel-body">
                        <div class="row">
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Filter by Type:</label>
                                    <select class="form-control" id="communicationTypeFilter">
                                        <option value="">All Types</option>
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="sms">SMS</option>
                                        <option value="email">Email</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Filter by Status:</label>
                                    <select class="form-control" id="communicationStatusFilter">
                                        <option value="">All Status</option>
                                        <option value="pending">Pending</option>
                                        <option value="sent">Sent</option>
                                        <option value="delivered">Delivered</option>
                                        <option value="read">Read</option>
                                        <option value="failed">Failed</option>
                                    </select>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>Filter by Customer:</label>
                                    <input type="text" class="form-control" id="customerFilter" placeholder="Enter customer name">
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="form-group">
                                    <label>&nbsp;</label>
                                    <button type="button" class="btn btn-primary btn-block" id="applyTrackingFiltersBtn">
                                        <i class="fa fa-filter"></i> Apply Filters
                                    </button>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row" style="margin-top: 15px;">
                            <div class="col-md-12">
                                <div class="table-responsive">
                                    <table class="table table-striped table-hover" id="communicationsTable">
                                        <thead>
                                            <tr>
                                                <th>Type</th>
                                                <th>Customer</th>
                                                <th>Recipient</th>
                                                <th>Status</th>
                                                <th>Sent At</th>
                                                <th>Delivered At</th>
                                                <th>Retry Count</th>
                                                <th>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td colspan="8" class="text-center">Loading communications...</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row" style="margin-top: 15px;">
                            <div class="col-md-12">
                                <nav aria-label="Communication pagination">
                                    <ul class="pagination" id="communicationPagination"></ul>
                                </nav>
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
 * Create communication details modal
 */
function createCommunicationDetailsModal() {
    if ($('#communicationDetailsModal').length > 0) {
        return; // Modal already exists
    }
    
    const modalHtml = `
        <div class="modal fade" id="communicationDetailsModal" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-lg" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal">&times;</button>
                        <h4 class="modal-title">Communication Details</h4>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-6">
                                <h5>Basic Information</h5>
                                <table class="table table-bordered">
                                    <tr>
                                        <td><strong>Type:</strong></td>
                                        <td id="detailType"></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Customer:</strong></td>
                                        <td id="detailCustomer"></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Recipient:</strong></td>
                                        <td id="detailRecipient"></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Status:</strong></td>
                                        <td id="detailStatus"></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Transaction ID:</strong></td>
                                        <td id="detailTransactionId"></td>
                                    </tr>
                                </table>
                            </div>
                            <div class="col-md-6">
                                <h5>Timestamp Information</h5>
                                <table class="table table-bordered">
                                    <tr>
                                        <td><strong>Created At:</strong></td>
                                        <td id="detailCreatedAt"></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Sent At:</strong></td>
                                        <td id="detailSentAt"></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Delivered At:</strong></td>
                                        <td id="detailDeliveredAt"></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Read At:</strong></td>
                                        <td id="detailReadAt"></td>
                                    </tr>
                                    <tr>
                                        <td><strong>Last Attempt:</strong></td>
                                        <td id="detailLastAttemptAt"></td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                        
                        <div class="row" style="margin-top: 15px;">
                            <div class="col-md-12">
                                <h5>Message Content</h5>
                                <div class="well">
                                    <p id="detailMessage"></p>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row" id="errorRow" style="display: none;">
                            <div class="col-md-12">
                                <h5>Error Information</h5>
                                <div class="alert alert-danger">
                                    <strong>Error Message:</strong> <span id="detailErrorMessage"></span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-warning" id="retryCommunicationBtn" style="display: none;">
                            <i class="fa fa-refresh"></i> Retry
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $('body').append(modalHtml);
}

/**
 * Bind events for communication tracking
 */
function bindTrackingEvents() {
    // Create details modal if not exists
    if ($('#communicationDetailsModal').length === 0) {
        createCommunicationDetailsModal();
    }
    
    // Apply filters button
    $(document).on('click', '#applyTrackingFiltersBtn', function() {
        loadCommunications();
    });
    
    // View details buttons
    $(document).on('click', '.view-communication-btn', function() {
        const communicationId = $(this).data('communication-id');
        viewCommunicationDetails(communicationId);
    });
    
    // Retry communication buttons
    $(document).on('click', '#retryCommunicationBtn', function() {
        const communicationId = $(this).data('communication-id');
        retryCommunication(communicationId);
    });
    
    // Pagination links
    $(document).on('click', '.pagination-link', function() {
        const page = $(this).data('page');
        loadCommunications(page);
    });
}

/**
 * Load communications with current filters
 */
function loadCommunications(page = 1) {
    const typeFilter = $('#communicationTypeFilter').val();
    const statusFilter = $('#communicationStatusFilter').val();
    const customerFilter = $('#customerFilter').val();
    
    let url = '/api/communication/all';
    const params = [`page=${page}`, `limit=10`];
    
    if (typeFilter) {
        params.push(`type=${typeFilter}`);
    }
    
    if (statusFilter) {
        params.push(`status=${statusFilter}`);
    }
    
    if (customerFilter) {
        params.push(`customer=${encodeURIComponent(customerFilter)}`);
    }
    
    url += '?' + params.join('&');
    
    Notiflix.Loading.Standard('Loading communications...');
    
    $.ajax({
        url: url,
        type: 'GET',
        success: function(response) {
            Notiflix.Loading.Remove();
            renderCommunicationsTable(response.communications || []);
            renderPagination(response.pagination || {});
        },
        error: function() {
            Notiflix.Loading.Remove();
            Notiflix.Report.failure('Error', 'Failed to load communications');
        }
    });
}

/**
 * Render communications table
 */
function renderCommunicationsTable(communications) {
    const tbody = $('#communicationsTable tbody');
    tbody.empty();
    
    if (communications.length === 0) {
        tbody.append(`
            <tr>
                <td colspan="8" class="text-center">No communications found</td>
            </tr>
        `);
        return;
    }
    
    communications.forEach(communication => {
        const row = `
            <tr>
                <td><span class="label label-${communication.type}">${communication.type.toUpperCase()}</span></td>
                <td>${communication.customerName || 'N/A'}</td>
                <td>${communication.recipient}</td>
                <td>
                    <span class="label label-${getStatusClass(communication.status)}">
                        ${communication.status.charAt(0).toUpperCase() + communication.status.slice(1)}
                    </span>
                </td>
                <td>${communication.sentAt ? new Date(communication.sentAt).toLocaleString() : '-'}</td>
                <td>${communication.deliveredAt ? new Date(communication.deliveredAt).toLocaleString() : '-'}</td>
                <td>${communication.retryCount || 0}</td>
                <td>
                    <div class="btn-group">
                        <button type="button" class="btn btn-sm btn-info view-communication-btn" data-communication-id="${communication._id}">
                            <i class="fa fa-eye"></i> View
                        </button>
                        ${communication.status === 'failed' ? `
                            <button type="button" class="btn btn-sm btn-warning" data-communication-id="${communication._id}">
                                <i class="fa fa-refresh"></i> Retry
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
        tbody.append(row);
    });
}

/**
 * Get status class for styling
 */
function getStatusClass(status) {
    switch (status) {
        case 'pending':
            return 'warning';
        case 'sent':
            return 'info';
        case 'delivered':
            return 'success';
        case 'read':
            return 'primary';
        case 'failed':
            return 'danger';
        default:
            return 'default';
    }
}

/**
 * Render pagination
 */
function renderPagination(pagination) {
    const paginationContainer = $('#communicationPagination');
    paginationContainer.empty();
    
    if (!pagination.pages || pagination.pages <= 1) {
        return;
    }
    
    let paginationHtml = '';
    
    // Previous button
    if (pagination.page > 1) {
        paginationHtml += `
            <li class="page-item">
                <a class="page-link pagination-link" data-page="${pagination.page - 1}" href="#">
                    <i class="fa fa-chevron-left"></i> Previous
                </a>
            </li>
        `;
    }
    
    // Page numbers
    const startPage = Math.max(1, pagination.page - 2);
    const endPage = Math.min(pagination.pages, pagination.page + 2);
    
    for (let i = startPage; i <= endPage; i++) {
        const activeClass = i === pagination.page ? 'active' : '';
        paginationHtml += `
            <li class="page-item ${activeClass}">
                <a class="page-link pagination-link" data-page="${i}" href="#">${i}</a>
            </li>
        `;
    }
    
    // Next button
    if (pagination.page < pagination.pages) {
        paginationHtml += `
            <li class="page-item">
                <a class="page-link pagination-link" data-page="${pagination.page + 1}" href="#">
                    Next <i class="fa fa-chevron-right"></i>
                </a>
            </li>
        `;
    }
    
    paginationContainer.html(paginationHtml);
}

/**
 * View communication details
 */
function viewCommunicationDetails(communicationId) {
    Notiflix.Loading.Standard('Loading communication details...');
    
    $.ajax({
        url: `/api/communication/${communicationId}`,
        type: 'GET',
        success: function(communication) {
            Notiflix.Loading.Remove();
            populateCommunicationDetails(communication);
            $('#communicationDetailsModal').modal('show');
        },
        error: function() {
            Notiflix.Loading.Remove();
            Notiflix.Report.failure('Error', 'Failed to load communication details');
        }
    });
}

/**
 * Populate communication details modal
 */
function populateCommunicationDetails(communication) {
    $('#detailType').text(communication.type.toUpperCase());
    $('#detailCustomer').text(communication.customerName || 'N/A');
    $('#detailRecipient').text(communication.recipient);
    $('#detailStatus').text(communication.status.charAt(0).toUpperCase() + communication.status.slice(1));
    $('#detailTransactionId').text(communication.transactionId || 'N/A');
    $('#detailCreatedAt').text(communication.createdAt ? new Date(communication.createdAt).toLocaleString() : 'N/A');
    $('#detailSentAt').text(communication.sentAt ? new Date(communication.sentAt).toLocaleString() : 'N/A');
    $('#detailDeliveredAt').text(communication.deliveredAt ? new Date(communication.deliveredAt).toLocaleString() : 'N/A');
    $('#detailReadAt').text(communication.readAt ? new Date(communication.readAt).toLocaleString() : 'N/A');
    $('#detailLastAttemptAt').text(communication.lastAttemptAt ? new Date(communication.lastAttemptAt).toLocaleString() : 'N/A');
    $('#detailMessage').text(communication.message || 'N/A');
    
    // Show/hide error information
    if (communication.errorMessage) {
        $('#errorRow').show();
        $('#detailErrorMessage').text(communication.errorMessage);
        $('#retryCommunicationBtn').show().data('communication-id', communication._id);
    } else {
        $('#errorRow').hide();
        $('#retryCommunicationBtn').hide();
    }
}

/**
 * Retry failed communication
 */
function retryCommunication(communicationId) {
    Notiflix.Confirm.show(
        'Retry Communication',
        'Are you sure you want to retry this communication?',
        'Yes, retry',
        'Cancel',
        function() {
            Notiflix.Loading.Standard('Retrying communication...');
            
            $.ajax({
                url: `/api/notification-queue/process`,
                type: 'POST',
                success: function(response) {
                    Notiflix.Loading.Remove();
                    Notiflix.Report.success('Success', response.message);
                    $('#communicationDetailsModal').modal('hide');
                    loadCommunications(); // Reload communications
                },
                error: function(xhr) {
                    Notiflix.Loading.Remove();
                    const error = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to retry communication';
                    Notiflix.Report.failure('Error', error);
                }
            });
        },
        function() {
            // User cancelled
        }
    );
}