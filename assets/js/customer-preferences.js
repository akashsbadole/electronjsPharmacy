/**
 * Customer Preferences Management Module for PharmaSpot
 * Handles customer communication preferences
 */

$(document).ready(function() {
    // Initialize customer preferences functionality
    initializeCustomerPreferences();
});

/**
 * Initialize customer preferences functionality
 */
function initializeCustomerPreferences() {
    // Check if we're on the customer management page
    if (window.location.pathname.includes('customer-management')) {
        addPreferencesButtonToCustomerList();
        createPreferencesModal();
        bindPreferencesEvents();
    }
}

/**
 * Add preferences button to customer list
 */
function addPreferencesButtonToCustomerList() {
    // Add preferences button to each customer row
    $('.customer-row').each(function() {
        const customerId = $(this).data('customer-id');
        
        if ($(`#preferencesBtn-${customerId}`).length === 0) {
            const preferencesBtn = `
                <button type="button" class="btn btn-sm btn-info" id="preferencesBtn-${customerId}" data-customer-id="${customerId}">
                    <i class="fa fa-cog"></i> Preferences
                </button>
            `;
            
            $(this).find('.action-buttons').append(preferencesBtn);
        }
    });
}

/**
 * Create preferences modal
 */
function createPreferencesModal() {
    if ($('#customerPreferencesModal').length > 0) {
        return; // Modal already exists
    }
    
    const modalHtml = `
        <div class="modal fade" id="customerPreferencesModal" tabindex="-1" role="dialog">
            <div class="modal-dialog modal-lg" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal">&times;</button>
                        <h4 class="modal-title">Customer Communication Preferences</h4>
                    </div>
                    <div class="modal-body">
                        <div class="row">
                            <div class="col-md-12">
                                <h5>Customer Information</h5>
                                <div class="form-group">
                                    <label>Customer Name:</label>
                                    <input type="text" class="form-control" id="prefCustomerName" readonly>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-12">
                                <h5>Communication Preferences</h5>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-4">
                                <div class="panel panel-default">
                                    <div class="panel-heading">
                                        <h6>WhatsApp</h6>
                                    </div>
                                    <div class="panel-body">
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="whatsappEnabled"> 
                                                    Enabled
                                                </label>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label>Phone Number:</label>
                                            <input type="text" class="form-control" id="whatsappPhone" placeholder="Enter WhatsApp number">
                                        </div>
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="whatsappConsent"> 
                                                    Customer has consented to receive WhatsApp messages
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="panel panel-default">
                                    <div class="panel-heading">
                                        <h6>SMS</h6>
                                    </div>
                                    <div class="panel-body">
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="smsEnabled"> 
                                                    Enabled
                                                </label>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label>Phone Number:</label>
                                            <input type="text" class="form-control" id="smsPhone" placeholder="Enter SMS number">
                                        </div>
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="smsConsent"> 
                                                    Customer has consented to receive SMS messages
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-4">
                                <div class="panel panel-default">
                                    <div class="panel-heading">
                                        <h6>Email</h6>
                                    </div>
                                    <div class="panel-body">
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="emailEnabled"> 
                                                    Enabled
                                                </label>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <label>Email Address:</label>
                                            <input type="email" class="form-control" id="emailAddress" placeholder="Enter email address">
                                        </div>
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="emailConsent"> 
                                                    Customer has consented to receive emails
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-12">
                                <h5>Notification Preferences</h5>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-6">
                                <div class="form-group">
                                    <label>Invoice Delivery Method:</label>
                                    <select class="form-control" id="invoiceDelivery">
                                        <option value="email">Email</option>
                                        <option value="whatsapp">WhatsApp</option>
                                        <option value="sms">SMS</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <div class="row">
                            <div class="col-md-12">
                                <div class="row">
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="promotionalMessages"> 
                                                    Promotional Messages
                                                </label>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="orderUpdates"> 
                                                    Order Updates
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="paymentReminders"> 
                                                    Payment Reminders
                                                </label>
                                            </div>
                                        </div>
                                        <div class="form-group">
                                            <div class="checkbox">
                                                <label>
                                                    <input type="checkbox" id="loyaltyUpdates"> 
                                                    Loyalty Updates
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" data-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="savePreferencesBtn">
                            <i class="fa fa-save"></i> Save Preferences
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    $('body').append(modalHtml);
}

/**
 * Bind events for preferences functionality
 */
function bindPreferencesEvents() {
    // Open preferences modal
    $(document).on('click', '[id^="preferencesBtn-"]', function() {
        const customerId = $(this).data('customer-id');
        openPreferencesModal(customerId);
    });
    
    // Save preferences
    $(document).on('click', '#savePreferencesBtn', function() {
        saveCustomerPreferences();
    });
    
    // Handle consent changes
    $(document).on('change', '#whatsappConsent', function() {
        if ($(this).is(':checked')) {
            const consentDate = new Date().toLocaleDateString();
            $(this).data('consent-date', consentDate);
        }
    });
    
    $(document).on('change', '#smsConsent', function() {
        if ($(this).is(':checked')) {
            const consentDate = new Date().toLocaleDateString();
            $(this).data('consent-date', consentDate);
        }
    });
    
    $(document).on('change', '#emailConsent', function() {
        if ($(this).is(':checked')) {
            const consentDate = new Date().toLocaleDateString();
            $(this).data('consent-date', consentDate);
        }
    });
}

/**
 * Open preferences modal for a customer
 */
function openPreferencesModal(customerId) {
    // Load customer data
    $.ajax({
        url: `/api/customers/customer/${customerId}`,
        type: 'GET',
        success: function(customer) {
            $('#prefCustomerName').val(customer.name || '');
        },
        error: function() {
            Notiflix.Report.failure('Error', 'Failed to load customer data');
        }
    });
    
    // Load customer preferences
    $.ajax({
        url: `/api/customer-preferences/customer/${customerId}`,
        type: 'GET',
        success: function(preferences) {
            populatePreferencesForm(preferences);
            $('#customerPreferencesModal').modal('show');
        },
        error: function() {
            Notiflix.Report.failure('Error', 'Failed to load customer preferences');
        }
    });
}

/**
 * Populate preferences form with data
 */
function populatePreferencesForm(preferences) {
    // WhatsApp preferences
    $('#whatsappEnabled').prop('checked', preferences.whatsapp && preferences.whatsapp.enabled);
    $('#whatsappPhone').val(preferences.whatsapp && preferences.whatsapp.phoneNumber ? preferences.whatsapp.phoneNumber : '');
    $('#whatsappConsent').prop('checked', preferences.whatsapp && preferences.whatsapp.consent);
    
    // SMS preferences
    $('#smsEnabled').prop('checked', preferences.sms && preferences.sms.enabled);
    $('#smsPhone').val(preferences.sms && preferences.sms.phoneNumber ? preferences.sms.phoneNumber : '');
    $('#smsConsent').prop('checked', preferences.sms && preferences.sms.consent);
    
    // Email preferences
    $('#emailEnabled').prop('checked', preferences.email && preferences.email.enabled);
    $('#emailAddress').val(preferences.email && preferences.email.emailAddress ? preferences.email.emailAddress : '');
    $('#emailConsent').prop('checked', preferences.email && preferences.email.consent);
    
    // Notification preferences
    if (preferences.preferences) {
        $('#invoiceDelivery').val(preferences.preferences.invoiceDelivery || 'email');
        $('#promotionalMessages').prop('checked', preferences.preferences.promotionalMessages || false);
        $('#orderUpdates').prop('checked', preferences.preferences.orderUpdates !== false);
        $('#paymentReminders').prop('checked', preferences.preferences.paymentReminders !== false);
        $('#loyaltyUpdates').prop('checked', preferences.preferences.loyaltyUpdates !== false);
    }
}

/**
 * Save customer preferences
 */
function saveCustomerPreferences() {
    const customerId = $('#prefCustomerName').data('customer-id');
    
    if (!customerId) {
        Notiflix.Report.warning('Error', 'No customer selected');
        return;
    }
    
    const preferences = {
        whatsapp: {
            enabled: $('#whatsappEnabled').is(':checked'),
            phoneNumber: $('#whatsappPhone').val(),
            consent: $('#whatsappConsent').is(':checked')
        },
        sms: {
            enabled: $('#smsEnabled').is(':checked'),
            phoneNumber: $('#smsPhone').val(),
            consent: $('#smsConsent').is(':checked')
        },
        email: {
            enabled: $('#emailEnabled').is(':checked'),
            emailAddress: $('#emailAddress').val(),
            consent: $('#emailConsent').is(':checked')
        },
        preferences: {
            invoiceDelivery: $('#invoiceDelivery').val(),
            promotionalMessages: $('#promotionalMessages').is(':checked'),
            orderUpdates: $('#orderUpdates').is(':checked'),
            paymentReminders: $('#paymentReminders').is(':checked'),
            loyaltyUpdates: $('#loyaltyUpdates').is(':checked')
        }
    };
    
    Notiflix.Loading.Standard('Saving preferences...');
    
    $.ajax({
        url: `/api/customer-preferences/customer/${customerId}`,
        type: 'POST',
        data: preferences,
        success: function(response) {
            Notiflix.Loading.Remove();
            Notiflix.Report.success('Success', 'Customer preferences saved successfully');
            $('#customerPreferencesModal').modal('hide');
        },
        error: function(xhr) {
            Notiflix.Loading.Remove();
            const error = xhr.responseJSON ? xhr.responseJSON.message : 'Failed to save preferences';
            Notiflix.Report.failure('Error', error);
        }
    });
}