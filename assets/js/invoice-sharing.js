/**
 * Invoice Sharing Module for PharmaSpot POS
 * Handles sharing invoices via WhatsApp, SMS, and Email
 */

$(document).ready(function() {
    // Initialize invoice sharing functionality
    initializeInvoiceSharing();
});

/**
 * Initialize invoice sharing functionality
 */
function initializeInvoiceSharing() {
    // Add share button to transaction completion interface if not already present
    if ($('#invoiceShareButton').length === 0) {
        addShareButtonToInterface();
    }
    
    // Initialize share modal if not already present
    if ($('#invoiceShareModal').length === 0) {
        createShareModal();
    }
    
    // Bind events
    bindShareEvents();
}

/**
 * Add share button to transaction completion interface
 */
function addShareButtonToInterface() {
    const shareButtonHtml = `
        <div class="row" style="margin-top: 15px;">
            <div class="col-md-12">
                <button type="button" class="btn btn-info btn-lg" id="invoiceShareButton">
                    <i class="fa fa-share-alt"></i> Share Invoice
                </button>
            </div>
        </div>
    `;
    
    // Add to transaction completion area (after payment buttons)
    $('.payment-buttons').after(shareButtonHtml);
}

/**
 * Create share modal dialog
 */
function createShareModal() {
    const modalHtml = `
        <div class="modal fade" id="invoiceShareModal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal">&times;</button>
                        <h4 class="modal-title">Share Invoice</h4>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-12">
                                <div class="form-group">
                                    <label>Customer:</label>
                                    <input type="text" class="form-control" id="shareCustomerName" readonly>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-12">
                                <div class="form-group">
                                    <label>Share Method:</label>
                                    <select class="form-control" id="shareMethod">
                                        <option value="">Select Method</option>
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="sms">SMS</option>
                                        <option value="email">Email</option>
                                        <option value="preferred">Use Customer's Preferred Method</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row" id="recipientRow" style="display: none;">
                            <div class="col-md-12">
                                <div class="form-group">
                                    <label id="recipientLabel">Recipient:</label>
                                    <input type="text" class="form-control" id="shareRecipient" placeholder="Enter recipient">
                                </div>
                            </div>
                        </div>
                        
                        <div class="row" id="templateRow" style="display: none;">
                            <div class="col-md-12">
                                <div class="form-group">
                                    <label>Template:</label>
                                    <select class="form-control" id="shareTemplate">
                                        <option value="">Use Default Template</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-12">
                                <div class="form-group">
                                    <label>Message Preview:</label>
                                    <textarea class="form-control" id="messagePreview" rows="4" readonly></textarea>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="sendShareButton">
                            <i class="fa fa-send"></i> Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $('body').append(modalHtml);
}

/**
 * Bind events for share functionality
 */
function bindShareEvents() {
    // Open share modal
    $(document).on('click', '#invoiceShareButton', function() {
        openShareModal();
    });
    
    // Handle method change
    $(document).on('change', '#shareMethod', function() {
        const method = $(this).val();
        handleMethodChange(method);
    });
    
    // Handle template change
    $(document).on('change', '#shareTemplate', function() {
        const templateId = $(this).val();
        updateMessagePreview(templateId);
    });
    
    // Send share
    $(document).on('click', '#sendShareButton', function() {
        sendInvoiceShare();
    });
}

/**
 * Open share modal with current transaction data
 */
function openShareModal() {
    // Get current transaction data
    const transaction = getCurrentTransaction();
    
    if (!transaction) {
        Notiflix.Report.warning('No transaction found', 'Please complete a transaction first.');
        return;
    }
    
    if (!transaction.customer || transaction.customer === '0') {
        Notiflix.Report.warning('No customer found', 'Please select a customer for this transaction.');
        return;
    }
    
    // Load customer data
    loadCustomerData(transaction.customer);
    
    // Show modal
    $('#invoiceShareModal').modal('show');
}

/**
 * Handle method change in share modal
 */
function handleMethodChange(method) {
    // Reset rows
    $('#recipientRow').hide();
    $('#templateRow').hide();
    $('#messagePreview').val('');
    
    if (!method) {
        return;
    }
    
    if (method === 'preferred') {
        // For preferred method, we don't need recipient input
        loadCustomerPreferences();
    } else {
        // Show recipient row for specific methods
        $('#recipientRow').show();
        
        // Update recipient label and placeholder based on method
        let label = 'Recipient:';
        let placeholder = 'Enter recipient';
        
        switch (method) {
            case 'whatsapp':
                label = 'WhatsApp Number:';
                placeholder = 'Enter WhatsApp number';
                break;
            case 'sms':
                label = 'SMS Number:';
                placeholder = 'Enter SMS number';
                break;
            case 'email':
                label = 'Email Address:';
                placeholder = 'Enter email address';
                break;
        }
        
        $('#recipientLabel').text(label);
        $('#shareRecipient').attr('placeholder', placeholder);
        
        // Load templates for this method
        loadTemplates(method);
    }
}

/**
 * Load customer data
 */
function loadCustomerData(customerId) {
    $.ajax({
        url: `/api/customers/customer/${customerId}`,
        type: 'GET',
        success: function(customer) {
            $('#shareCustomerName').val(customer.name || '');
        },
        error: function() {
            Notiflix.Report.failure('Error', 'Failed to load customer data');
        }
    });
}

/**
 * Load customer preferences
 */
function loadCustomerPreferences() {
    const transaction = getCurrentTransaction();
    
    if (!transaction || !transaction.customer || transaction.customer === '0') {
        return;
    }
    
    $.ajax({
        url: `/api/customer-preferences/customer/${transaction.customer}/invoice-preference`,
        type: 'GET',
        success: function(preference) {
            if (preference.method) {
                // Update method selection
                $('#shareMethod').val(preference.method);
                
                // Handle method change to load appropriate data
                handleMethodChange(preference.method);
                
                // Pre-fill recipient if available
                if (preference.recipient) {
                    $('#shareRecipient').val(preference.recipient);
                }
                
                // Show consent status
                if (!preference.consent) {
                    Notiflix.Report.warning('Consent Required', `Customer has not consented to receive communications via ${preference.method}.`);
                    $('#sendShareButton').prop('disabled', true);
                } else {
                    $('#sendShareButton').prop('disabled', false);
                }
            }
        },
        error: function() {
            Notiflix.Report.failure('Error', 'Failed to load customer preferences');
        }
    });
}

/**
 * Load templates for a specific method
 */
function loadTemplates(method) {
    if (!method) {
        return;
    }
    
    $('#templateRow').show();
    $('#shareTemplate').html('<option value="">Use Default Template</option>');
    
    $.ajax({
        url: `/api/templates/all?type=${method}`,
        type: 'GET',
        success: function(response) {
            if (response.templates && response.templates.length > 0) {
                response.templates.forEach(template => {
                    $('#shareTemplate').append(`<option value="${template._id}">${template.name}</option>`);
                });
            }
        },
        error: function() {
            Notiflix.Report.failure('Error', 'Failed to load templates');
        }
    });
}

/**
 * Update message preview
 */
function updateMessagePreview(templateId) {
    if (!templateId) {
        // Load default message based on method
        const method = $('#shareMethod').val();
        loadDefaultPreview(method);
        return;
    }
    
    const transaction = getCurrentTransaction();
    const customer = getCurrentCustomer();
    
    if (!transaction || !customer) {
        return;
    }
    
    // Process template
    $.ajax({
        url: `/api/templates/${templateId}/process`,
        type: 'POST',
        data: {
            data: {
                storeName: getCurrentStoreName(),
                customerName: customer.name,
                invoiceNumber: transaction._id,
                amount: `₹${parseFloat(transaction.total || 0).toFixed(2)}`,
                date: new Date(transaction.date || transaction.createdAt).toLocaleDateString(),
                paymentStatus: transaction.paid >= transaction.total ? 'Paid' : 'Pending'
            }
        },
        success: function(response) {
            $('#messagePreview').val(response.processedContent);
        },
        error: function() {
            Notiflix.Report.failure('Error', 'Failed to process template');
        }
    });
}

/**
 * Load default message preview
 */
function loadDefaultPreview(method) {
    const transaction = getCurrentTransaction();
    const customer = getCurrentCustomer();
    
    if (!transaction || !customer) {
        return;
    }
    
    let defaultMessage = '';
    
    switch (method) {
        case 'whatsapp':
            defaultMessage = `Dear ${customer.name},\n\nThank you for your purchase at ${getCurrentStoreName()}. Your invoice #${transaction._id} for ₹${parseFloat(transaction.total || 0).toFixed(2)} has been generated.\n\nThank you for shopping with us!`;
            break;
        case 'sms':
            defaultMessage = `Dear ${customer.name}, Thank you for shopping at ${getCurrentStoreName()}. Invoice #${transaction._id} for ₹${parseFloat(transaction.total || 0).toFixed(2)} has been generated. Payment status: ${transaction.paid >= transaction.total ? 'Paid' : 'Pending'}.`;
            break;
        case 'email':
            defaultMessage = `Dear ${customer.name},\n\nThank you for your purchase at ${getCurrentStoreName()}. Please find your invoice #${transaction._id} attached to this email.\n\nInvoice Details:\n- Amount: ₹${parseFloat(transaction.total || 0).toFixed(2)}\n- Date: ${new Date(transaction.date || transaction.createdAt).toLocaleDateString()}\n- Payment Status: ${transaction.paid >= transaction.total ? 'Paid' : 'Pending'}\n\nThank you for shopping with us!\n\n${getCurrentStoreName()}`;
            break;
    }
    
    $('#messagePreview').val(defaultMessage);
}

/**
 * Send invoice share
 */
function sendInvoiceShare() {
    const transaction = getCurrentTransaction();
    const method = $('#shareMethod').val();
    const recipient = $('#shareRecipient').val();
    const templateId = $('#shareTemplate').val();
    
    if (!transaction) {
        Notiflix.Report.warning('No transaction found', 'Please complete a transaction first.');
        return;
    }
    
    if (!method) {
        Notiflix.Report.warning('Method required', 'Please select a sharing method.');
        return;
    }
    
    if (method !== 'preferred' && !recipient) {
        Notiflix.Report.warning('Recipient required', 'Please enter a recipient.');
        return;
    }
    
    // Show loading
    Notiflix.Loading.Standard('Sending invoice...');
    
    const requestData = {
        customerId: transaction.customer,
        method: method,
        templateId: templateId || null
    };
    
    if (method !== 'preferred') {
        requestData.recipient = recipient;
    }
    
    $.ajax({
        url: `/api/invoice-sharing/share/${transaction._id}`,
        type: 'POST',
        data: requestData,
        success: function(response) {
            Notiflix.Loading.Remove();
            Notiflix.Report.success('Success', `Invoice shared successfully via ${response.method}`);
            
            // Close modal
            $('#invoiceShareModal').modal('hide');
            
            // Reset form
            resetShareForm();
        },
        error: function(xhr) {
            Notiflix.Loading.Remove();
            const error = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to share invoice';
            Notiflix.Report.failure('Error', error);
        }
    });
}

/**
 * Reset share form
 */
function resetShareForm() {
    $('#shareMethod').val('');
    $('#shareRecipient').val('');
    $('#shareTemplate').val('<option value="">Use Default Template</option>');
    $('#messagePreview').val('');
    $('#recipientRow').hide();
    $('#templateRow').hide();
    $('#sendShareButton').prop('disabled', false);
}

/**
 * Get current transaction data
 */
function getCurrentTransaction() {
    // This should be implemented based on how the POS stores current transaction
    // For now, return a placeholder
    return window.currentTransaction || null;
}

/**
 * Get current customer data
 */
function getCurrentCustomer() {
    // This should be implemented based on how the POS stores current customer
    // For now, return a placeholder
    return window.currentCustomer || null;
}

/**
 * Get current store name
 */
function getCurrentStoreName() {
    // This should be implemented based on how the POS stores store info
    // For now, return a placeholder
    return window.currentStoreName || 'PharmaSpot';
}

/**
 * Initialize invoice sharing when transaction is completed
 */
window.onTransactionCompleted = function(transaction, customer) {
    // Store current transaction and customer for use in sharing
    window.currentTransaction = transaction;
    window.currentCustomer = customer;
    
    // Show share button if customer exists
    if (customer && customer._id !== '0') {
        $('#invoiceShareButton').show();
    } else {
        $('#invoiceShareButton').hide();
    }
};