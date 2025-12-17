$(document).ready(function() {
    const api = "api/";

    // Load aging reports when modal is shown
    $('#agingReportsModal').on('show.bs.modal', function() {
        loadPayablesAging();
        loadReceivablesAging();
    });

    // Load payables aging report
    window.loadPayablesAging = function() {
        $.get(api + "supplier-accounts/aging-report", function(data) {
            renderPayablesAging(data.agingReport);
        });
    };

    // Load receivables aging report
    window.loadReceivablesAging = function() {
        $.get(api + "customer-accounts/aging-report", function(data) {
            renderReceivablesAging(data.agingReport);
        });
    };

    // Render payables aging report
    function renderPayablesAging(agingReport) {
        $('#payablesAgingBody').empty();
        
        let totalCurrent = 0;
        let total30Days = 0;
        let total60Days = 0;
        let total90Days = 0;
        let totalOver90Days = 0;
        let grandTotal = 0;
        
        agingReport.categories.forEach(function(category) {
            category.items.forEach(function(item) {
                const row = `
                    <tr>
                        <td>${item.supplierName || 'Unknown Supplier'}</td>
                        <td>${category.name === 'Current' ? item.amount.toFixed(2) : ''}</td>
                        <td>${category.name === '1-30 Days' ? item.amount.toFixed(2) : ''}</td>
                        <td>${category.name === '31-60 Days' ? item.amount.toFixed(2) : ''}</td>
                        <td>${category.name === '61-90 Days' ? item.amount.toFixed(2) : ''}</td>
                        <td>${category.name === '> 90 Days' ? item.amount.toFixed(2) : ''}</td>
                        <td><strong>${item.totalAmount.toFixed(2)}</strong></td>
                    </tr>
                `;
                $('#payablesAgingBody').append(row);
            });
            
            // Update totals
            if (category.name === 'Current') totalCurrent += category.totalAmount;
            if (category.name === '1-30 Days') total30Days += category.totalAmount;
            if (category.name === '31-60 Days') total60Days += category.totalAmount;
            if (category.name === '61-90 Days') total90Days += category.totalAmount;
            if (category.name === '> 90 Days') totalOver90Days += category.totalAmount;
            grandTotal += category.totalAmount;
        });
        
        // Add totals row
        const totalsRow = `
            <tr class="bg-gray">
                <td><strong>TOTALS</strong></td>
                <td><strong>${totalCurrent.toFixed(2)}</strong></td>
                <td><strong>${total30Days.toFixed(2)}</strong></td>
                <td><strong>${total60Days.toFixed(2)}</strong></td>
                <td><strong>${total90Days.toFixed(2)}</strong></td>
                <td><strong>${totalOver90Days.toFixed(2)}</strong></td>
                <td><strong>${grandTotal.toFixed(2)}</strong></td>
            </tr>
        `;
        $('#payablesAgingBody').append(totalsRow);
    }

    // Render receivables aging report
    function renderReceivablesAging(agingReport) {
        $('#receivablesAgingBody').empty();
        
        let totalCurrent = 0;
        let total30Days = 0;
        let total60Days = 0;
        let total90Days = 0;
        let totalOver90Days = 0;
        let grandTotal = 0;
        
        agingReport.categories.forEach(function(category) {
            category.items.forEach(function(item) {
                const row = `
                    <tr>
                        <td>${item.customerName || 'Unknown Customer'}</td>
                        <td>${category.name === 'Current' ? item.amount.toFixed(2) : ''}</td>
                        <td>${category.name === '1-30 Days' ? item.amount.toFixed(2) : ''}</td>
                        <td>${category.name === '31-60 Days' ? item.amount.toFixed(2) : ''}</td>
                        <td>${category.name === '61-90 Days' ? item.amount.toFixed(2) : ''}</td>
                        <td>${category.name === '> 90 Days' ? item.amount.toFixed(2) : ''}</td>
                        <td><strong>${item.totalAmount.toFixed(2)}</strong></td>
                    </tr>
                `;
                $('#receivablesAgingBody').append(row);
            });
            
            // Update totals
            if (category.name === 'Current') totalCurrent += category.totalAmount;
            if (category.name === '1-30 Days') total30Days += category.totalAmount;
            if (category.name === '31-60 Days') total60Days += category.totalAmount;
            if (category.name === '61-90 Days') total90Days += category.totalAmount;
            if (category.name === '> 90 Days') totalOver90Days += category.totalAmount;
            grandTotal += category.totalAmount;
        });
        
        // Add totals row
        const totalsRow = `
            <tr class="bg-gray">
                <td><strong>TOTALS</strong></td>
                <td><strong>${totalCurrent.toFixed(2)}</strong></td>
                <td><strong>${total30Days.toFixed(2)}</strong></td>
                <td><strong>${total60Days.toFixed(2)}</strong></td>
                <td><strong>${total90Days.toFixed(2)}</strong></td>
                <td><strong>${totalOver90Days.toFixed(2)}</strong></td>
                <td><strong>${grandTotal.toFixed(2)}</strong></td>
            </tr>
        `;
        $('#receivablesAgingBody').append(totalsRow);
    }

    // Add account statement functionality for suppliers
    window.viewSupplierStatement = function(supplierId) {
        $.get(api + "supplier-accounts/supplier/" + supplierId + "/statement", function(data) {
            const statement = data.statement;
            
            let statementHtml = `
                <h5>Account Statement for Supplier</h5>
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
            
            notiflix.Report.info('Supplier Account Statement', statementHtml, 'Close');
        });
    };

    // Export aging reports to CSV
    window.exportPayablesAging = function() {
        $.get(api + "supplier-accounts/aging-report", function(data) {
            exportAgingToCSV(data.agingReport, 'payables-aging');
        });
    };

    window.exportReceivablesAging = function() {
        $.get(api + "customer-accounts/aging-report", function(data) {
            exportAgingToCSV(data.agingReport, 'receivables-aging');
        });
    };

    // Helper function to export aging report to CSV
    function exportAgingToCSV(agingReport, filename) {
        let csv = 'Entity,Current,1-30 Days,31-60 Days,61-90 Days,> 90 Days,Total\n';
        
        // Group items by entity
        const entityMap = {};
        
        agingReport.categories.forEach(function(category) {
            category.items.forEach(function(item) {
                const entityName = item.supplierName || item.customerName || 'Unknown';
                
                if (!entityMap[entityName]) {
                    entityMap[entityName] = {
                        current: 0,
                        days30: 0,
                        days60: 0,
                        days90: 0,
                        over90: 0,
                        total: 0
                    };
                }
                
                if (category.name === 'Current') entityMap[entityName].current += item.amount;
                if (category.name === '1-30 Days') entityMap[entityName].days30 += item.amount;
                if (category.name === '31-60 Days') entityMap[entityName].days60 += item.amount;
                if (category.name === '61-90 Days') entityMap[entityName].days90 += item.amount;
                if (category.name === '> 90 Days') entityMap[entityName].over90 += item.amount;
                entityMap[entityName].total += item.amount;
            });
        });
        
        // Add rows to CSV
        for (const entity in entityMap) {
            const data = entityMap[entity];
            csv += `"${entity}",${data.current.toFixed(2)},${data.days30.toFixed(2)},${data.days60.toFixed(2)},${data.days90.toFixed(2)},${data.over90.toFixed(2)},${data.total.toFixed(2)}\n`;
        }
        
        // Download CSV
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename + '-' + new Date().toISOString().split('T')[0] + '.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    }

    // Add export buttons to aging reports modal
    $('#agingReportsModal').on('shown.bs.modal', function() {
        if ($('#payablesExportBtn').length === 0) {
            $('#payablesAging .btn-info').after(' <button type="button" class="btn btn-success btn-sm" onclick="exportPayablesAging()" id="payablesExportBtn"><i class="glyphicon glyphicon-download"></i> Export</button>');
        }
        
        if ($('#receivablesExportBtn').length === 0) {
            $('#receivablesAging .btn-info').after(' <button type="button" class="btn btn-success btn-sm" onclick="exportReceivablesAging()" id="receivablesExportBtn"><i class="glyphicon glyphicon-download"></i> Export</button>');
        }
    });
});