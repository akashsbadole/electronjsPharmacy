$(document).ready(function() {
    const api = "api/";
    let customersList = [];
    let paymentTermsList = [];

    // Load customers when page loads
    loadCustomers();
    loadPaymentTerms();

    // Load customers function
    function loadCustomers() {
        $.get(api + "customers/with-accounts", function(data) {
            customersList = data.customers;
            // We'll add customer management UI to the existing customer modal
            enhanceCustomerModal();
        });
    }

    // Load payment terms function
    function loadPaymentTerms() {
        $.get(api + "payment-terms", function(data) {
            paymentTermsList = data.paymentTerms;
        });
    }

    // Enhance existing customer modal with account management
    function enhanceCustomerModal() {
        // Check if we've already enhanced the modal
        if ($('#customerManagementSection').length > 0) return;
        
        const managementSection = `
            <hr>
            <div id="customerManagementSection">
                <h5>Customer Account Management</h5>
                <div class="row">
                    <div class="col-md-12">
                        <button type="button" class="btn btn-success btn-sm" onclick="showCustomerPaymentInterface()">
                            <i class="glyphicon glyphicon-usd"></i> Collect Payment
                        </button>
                        <button type="button" class="btn btn-info btn-sm" onclick="showCustomerAccountStatement()">
                            <i class="glyphicon glyphicon-list-alt"></i> Account Statement
                        </button>
                    </div>
                </div>
                <hr>
                <table class="table table-bordered table-condensed">
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Balance</th>
                            <th>Credit Limit</th>
                            <th>Available Credit</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody id="customerAccountsTable">
                        <!-- Customer accounts will be populated here -->
                    </tbody>
                </table>
            </div>
        `;
        
        $('#customerModal .modal-body').append(managementSection);
        renderCustomerAccounts();
    }

    // Render customer accounts table
    function renderCustomerAccounts() {
        $('#customerAccountsTable').empty();
        
        customersList.forEach(function(customer) {
            const balance = customer.account ? customer.account.balance : 0;
            const creditLimit = customer.account ? customer.account.creditLimit : 0;
            const availableCredit = creditLimit - balance;
            
            const row = `
                <tr>
                    <td>${customer.name}</td>
                    <td class="${balance > 0 ? 'text-danger' : 'text-success'}">${balance.toFixed(2)}</td>
                    <td>${creditLimit.toFixed(2)}</td>
                    <td class="${availableCredit < 0 ? 'text-danger' : 'text-success'}">${availableCredit.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-xs btn-success" onclick="collectCustomerPayment('${customer._id}')">
                            <i class="glyphicon glyphicon-usd"></i>
                        </button>
                        <button class="btn btn-xs btn-info" onclick="viewCustomerStatement('${customer._id}')">
                            <i class="glyphicon glyphicon-list-alt"></i>
                        </button>
                    </td>
                </tr>
            `;
            $('#customerAccountsTable').append(row);
        });
    }

    // Show customer payment interface
    window.showCustomerPaymentInterface = function() {
        // This will be handled by the collectCustomerPayment function
        notiflix.Notify.info('Please select a customer from the table below to collect payment.');
    };

    // Collect payment from customer
    window.collectCustomerPayment = function(customerId) {
        const customer = customersList.find(c => c._id === customerId);
        
        if (!customer) return;
        
        $('#paymentCustomerId').val(customerId);
        $('#paymentCustomerName').text(customer.name);
        $('#paymentCustomerBalance').text((customer.account ? customer.account.balance : 0).toFixed(2));
        $('#paymentCustomerCreditLimit').text((customer.account ? customer.account.creditLimit : 0).toFixed(2));
        $('#customerPaymentDate').val(new Date().toISOString().split('T')[0]);
        
        // Load outstanding invoices
        loadCustomerInvoices(customerId);
        
        $('#customerPaymentModal').modal('show');
    };

    // Load customer invoices for payment allocation
    function loadCustomerInvoices(customerId) {
        $.get(api + "customer-invoices/customer/" + customerId, function(data) {
            const outstandingInvoices = data.invoices.filter(inv => inv.balance > 0);
            
            if (outstandingInvoices.length > 0) {
                $('#customerInvoiceAllocationSection').show();
                renderCustomerInvoiceAllocation(outstandingInvoices);
            } else {
                $('#customerInvoiceAllocationSection').hide();
            }
        });
    }

    // Render customer invoice allocation checkboxes
    function renderCustomerInvoiceAllocation(invoices) {
        $('#customerInvoiceAllocationList').empty();
        
        invoices.forEach(function(invoice) {
            const dueDate = new Date(invoice.dueDate);
            const isOverdue = dueDate < new Date();
            
            const invoiceRow = `
                <div class="checkbox">
                    <label>
                        <input type="checkbox" name="customerInvoiceAllocation" value="${invoice._id}" data-balance="${invoice.balance}" class="customer-invoice-checkbox">
                        Invoice #${invoice.invoiceNumber} - Balance: ${invoice.balance.toFixed(2)}
                        ${isOverdue ? '<span class="text-danger">(Overdue)</span>' : ''}
                    </label>
                </div>
            `;
            $('#customerInvoiceAllocationList').append(invoiceRow);
        });
    }

    // Handle customer invoice allocation checkbox changes
    $(document).on('change', '.customer-invoice-checkbox', function() {
        let totalAllocation = 0;
        $('.customer-invoice-checkbox:checked').each(function() {
            totalAllocation += parseFloat($(this).data('balance'));
        });
        
        const paymentAmount = parseFloat($('#customerPaymentAmount').val()) || 0;
        
        if (totalAllocation > paymentAmount) {
            notiflix.Notify.warning('Total allocation exceeds payment amount!');
            $(this).prop('checked', false);
        }
    });

    // Process customer payment
    $('#processCustomerPayment').on('submit', function(e) {
        e.preventDefault();
        
        const paymentData = {
            paymentType: 'RECEIVABLE',
            customerId: $('#paymentCustomerId').val(),
            amount: parseFloat($('#customerPaymentAmount').val()),
            paymentDate: $('#customerPaymentDate').val(),
            paymentMethod: $('#customerPaymentMethod').val(),
            reference: $('#customerPaymentReference').val(),
            notes: $('#customerPaymentNotes').val()
        };

        // Get invoice allocations
        const allocations = [];
        if ($('#customerAllocateToInvoices').is(':checked')) {
            $('.customer-invoice-checkbox:checked').each(function() {
                allocations.push({
                    invoiceId: $(this).val(),
                    invoiceType: 'CUSTOMER',
                    amount: parseFloat($(this).data('balance'))
                });
            });
        }

        paymentData.allocations = allocations;

        $.ajax({
            url: api + "payments",
            type: "POST",
            data: paymentData,
            success: function() {
                notiflix.Notify.success('Payment collected successfully!');
                $('#customerPaymentModal').modal('hide');
                $('#processCustomerPayment')[0].reset();
                loadCustomers();
            },
            error: function() {
                notiflix.Notify.failure('Failed to process payment!');
            }
        });
    });

    // View customer statement
    window.viewCustomerStatement = function(customerId) {
        const customer = customersList.find(c => c._id === customerId);
        
        if (!customer) return;
        
        $.get(api + "customer-accounts/customer/" + customerId + "/statement", function(data) {
            const statement = data.statement;
            
            let statementHtml = `
                <h5>Account Statement for ${customer.name}</h5>
                <table class="table table-bordered table-condensed">
                    <thead>
                        <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Debit</th>
                            <th>Credit</th>
                            <th>Balance</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            statement.transactions.forEach(function(transaction) {
                statementHtml += `
                    <tr>
                        <td>${new Date(transaction.date).toLocaleDateString()}</td>
                        <td>${transaction.type}</td>
                        <td>${transaction.description}</td>
                        <td>${transaction.debit ? transaction.debit.toFixed(2) : ''}</td>
                        <td>${transaction.credit ? transaction.credit.toFixed(2) : ''}</td>
                        <td>${transaction.balance.toFixed(2)}</td>
                    </tr>
                `;
            });
            
            statementHtml += `
                    </tbody>
                </table>
                <div class="row">
                    <div class="col-md-12">
                        <strong>Current Balance: ${statement.currentBalance.toFixed(2)}</strong>
                    </div>
                </div>
            `;
            
            notiflix.Report.info('Customer Account Statement', statementHtml, 'Close');
        });
    };

    // Show customer account statement
    window.showCustomerAccountStatement = function() {
        notiflix.Notify.info('Please select a customer from the table below to view their statement.');
    };
});