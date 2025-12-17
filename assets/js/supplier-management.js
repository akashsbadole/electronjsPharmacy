$(document).ready(function() {
    const api = "api/";
    let suppliersList = [];
    let paymentTermsList = [];

    // Load suppliers when modal is shown
    $('#Suppliers').on('show.bs.modal', function() {
        loadSuppliers();
        loadPaymentTerms();
    });

    // Load suppliers function
    function loadSuppliers() {
        $.get(api + "suppliers/with-accounts", function(data) {
            suppliersList = data.suppliers;
            renderSuppliers(suppliersList);
        });
    }

    // Load payment terms function
    function loadPaymentTerms() {
        $.get(api + "payment-terms", function(data) {
            paymentTermsList = data.paymentTerms;
            renderPaymentTerms(paymentTermsList);
        });
    }

    // Render payment terms in select dropdown
    function renderPaymentTerms(paymentTerms) {
        $('#supplierPaymentTerms').empty();
        $('#supplierPaymentTerms').append('<option value="">Select Payment Terms</option>');
        
        paymentTerms.forEach(function(term) {
            $('#supplierPaymentTerms').append(`<option value="${term._id}">${term.name} (${term.days} days)</option>`);
        });
    }

    // Render suppliers in table
    function renderSuppliers(suppliers) {
        $('#supplier_table_body').empty();
        
        suppliers.forEach(function(supplier) {
            const balance = supplier.account ? supplier.account.balance : 0;
            const creditLimit = supplier.account ? supplier.account.creditLimit : 0;
            
            const row = `
                <tr>
                    <td>${supplier.name}</td>
                    <td>${supplier.contactPerson || '-'}</td>
                    <td>${supplier.phone || '-'}</td>
                    <td class="${balance > 0 ? 'text-danger' : 'text-success'}">${balance.toFixed(2)}</td>
                    <td>${creditLimit.toFixed(2)}</td>
                    <td>
                        <button class="btn btn-sm btn-info" onclick="viewSupplierDetails(${supplier._id})">
                            <i class="glyphicon glyphicon-eye-open"></i>
                        </button>
                        <button class="btn btn-sm btn-success" onclick="makePayment(${supplier._id})">
                            <i class="glyphicon glyphicon-usd"></i> Pay
                        </button>
                        <button class="btn btn-sm btn-warning" onclick="editSupplier(${supplier._id})">
                            <i class="glyphicon glyphicon-edit"></i>
                        </button>
                    </td>
                </tr>
            `;
            $('#supplier_table_body').append(row);
        });
    }

    // Search suppliers
    $('#supplierSearchInput').on('keyup', function() {
        const searchTerm = $(this).val().toLowerCase();
        
        const filteredSuppliers = suppliersList.filter(function(supplier) {
            return supplier.name.toLowerCase().includes(searchTerm) ||
                   (supplier.contactPerson && supplier.contactPerson.toLowerCase().includes(searchTerm)) ||
                   (supplier.phone && supplier.phone.toLowerCase().includes(searchTerm));
        });
        
        renderSuppliers(filteredSuppliers);
    });

    // Save supplier form submission
    $('#saveSupplier').on('submit', function(e) {
        e.preventDefault();
        
        const formData = {
            name: $('#supplierName').val(),
            contactPerson: $('#supplierContactPerson').val(),
            phone: $('#supplierPhone').val(),
            email: $('#supplierEmail').val(),
            address: $('#supplierAddress').val(),
            paymentTerms: $('#supplierPaymentTerms').val()
        };

        $.ajax({
            url: api + "suppliers",
            type: "POST",
            data: formData,
            success: function(response) {
                // Create supplier account
                const accountData = {
                    creditLimit: parseFloat($('#supplierCreditLimit').val()) || 0,
                    paymentTermId: $('#supplierPaymentTerms').val()
                };

                $.ajax({
                    url: api + "suppliers/" + response._id + "/account",
                    type: "POST",
                    data: accountData,
                    success: function() {
                        notiflix.Notify.success('Supplier created successfully!');
                        $('#newSupplierModal').modal('hide');
                        $('#saveSupplier')[0].reset();
                        loadSuppliers();
                    },
                    error: function() {
                        notiflix.Notify.failure('Failed to create supplier account!');
                    }
                });
            },
            error: function() {
                notiflix.Notify.failure('Failed to create supplier!');
            }
        });
    });

    // Make payment to supplier
    window.makePayment = function(supplierId) {
        const supplier = suppliersList.find(s => s._id === supplierId);
        
        if (!supplier) return;
        
        $('#paymentSupplierId').val(supplierId);
        $('#paymentSupplierName').text(supplier.name);
        $('#paymentSupplierBalance').text((supplier.account ? supplier.account.balance : 0).toFixed(2));
        $('#paymentSupplierCreditLimit').text((supplier.account ? supplier.account.creditLimit : 0).toFixed(2));
        $('#paymentDate').val(new Date().toISOString().split('T')[0]);
        
        // Load outstanding invoices
        loadSupplierInvoices(supplierId);
        
        $('#supplierPaymentModal').modal('show');
    };

    // Load supplier invoices for payment allocation
    function loadSupplierInvoices(supplierId) {
        $.get(api + "supplier-invoices/supplier/" + supplierId, function(data) {
            const outstandingInvoices = data.invoices.filter(inv => inv.balance > 0);
            
            if (outstandingInvoices.length > 0) {
                $('#invoiceAllocationSection').show();
                renderInvoiceAllocation(outstandingInvoices);
            } else {
                $('#invoiceAllocationSection').hide();
            }
        });
    }

    // Render invoice allocation checkboxes
    function renderInvoiceAllocation(invoices) {
        $('#invoiceAllocationList').empty();
        
        invoices.forEach(function(invoice) {
            const dueDate = new Date(invoice.dueDate);
            const isOverdue = dueDate < new Date();
            
            const invoiceRow = `
                <div class="checkbox">
                    <label>
                        <input type="checkbox" name="invoiceAllocation" value="${invoice._id}" data-balance="${invoice.balance}" class="invoice-checkbox">
                        Invoice #${invoice.invoiceNumber} - Balance: ${invoice.balance.toFixed(2)}
                        ${isOverdue ? '<span class="text-danger">(Overdue)</span>' : ''}
                    </label>
                </div>
            `;
            $('#invoiceAllocationList').append(invoiceRow);
        });
    }

    // Handle invoice allocation checkbox changes
    $(document).on('change', '.invoice-checkbox', function() {
        let totalAllocation = 0;
        $('.invoice-checkbox:checked').each(function() {
            totalAllocation += parseFloat($(this).data('balance'));
        });
        
        const paymentAmount = parseFloat($('#paymentAmount').val()) || 0;
        
        if (totalAllocation > paymentAmount) {
            notiflix.Notify.warning('Total allocation exceeds payment amount!');
            $(this).prop('checked', false);
        }
    });

    // Process supplier payment
    $('#processSupplierPayment').on('submit', function(e) {
        e.preventDefault();
        
        const paymentData = {
            paymentType: 'PAYABLE',
            supplierId: $('#paymentSupplierId').val(),
            amount: parseFloat($('#paymentAmount').val()),
            paymentDate: $('#paymentDate').val(),
            paymentMethod: $('#paymentMethod').val(),
            reference: $('#paymentReference').val(),
            notes: $('#paymentNotes').val()
        };

        // Get invoice allocations
        const allocations = [];
        if ($('#allocateToInvoices').is(':checked')) {
            $('.invoice-checkbox:checked').each(function() {
                allocations.push({
                    invoiceId: $(this).val(),
                    invoiceType: 'SUPPLIER',
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
                notiflix.Notify.success('Payment processed successfully!');
                $('#supplierPaymentModal').modal('hide');
                $('#processSupplierPayment')[0].reset();
                loadSuppliers();
            },
            error: function() {
                notiflix.Notify.failure('Failed to process payment!');
            }
        });
    });

    // View supplier details
    window.viewSupplierDetails = function(supplierId) {
        $.get(api + "suppliers/supplier/" + supplierId + "/with-account", function(data) {
            const supplier = data.supplier;
            const account = data.account;
            
            const details = `
                <strong>Name:</strong> ${supplier.name}<br>
                <strong>Contact Person:</strong> ${supplier.contactPerson || '-'}<br>
                <strong>Phone:</strong> ${supplier.phone || '-'}<br>
                <strong>Email:</strong> ${supplier.email || '-'}<br>
                <strong>Address:</strong> ${supplier.address || '-'}<br>
                <strong>Current Balance:</strong> ${account ? account.balance.toFixed(2) : '0.00'}<br>
                <strong>Credit Limit:</strong> ${account ? account.creditLimit.toFixed(2) : '0.00'}<br>
                <strong>Available Credit:</strong> ${account ? (account.creditLimit - account.balance).toFixed(2) : '0.00'}
            `;
            
            notiflix.Report.info('Supplier Details', details, 'Close');
        });
    };

    // Edit supplier (placeholder function)
    window.editSupplier = function(supplierId) {
        notiflix.Notify.info('Edit supplier functionality will be implemented in future updates.');
    };
});