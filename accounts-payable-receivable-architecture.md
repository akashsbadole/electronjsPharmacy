# PharmaSpot Accounts Payable/Receivable Architecture Design

## Executive Summary

This document outlines the comprehensive architecture design for implementing accounts payable and receivable functionality in PharmaSpot. The design integrates with the existing transaction system while providing robust credit management, payment tracking, aging reports, and financial reporting capabilities.

## System Analysis

### Current System Architecture

Based on the analysis of the existing PharmaSpot codebase:

- **Database**: NeDB (embedded NoSQL database)
- **Backend**: Node.js with Express
- **Frontend**: Electron with jQuery
- **Existing Modules**: Transactions, Purchase Orders, Suppliers, Customers, Inventory

### Key Existing Entities

1. **Transactions**: Sales transactions with payment tracking
2. **Purchase Orders**: Supplier purchase management
3. **Suppliers**: Basic supplier information with payment terms field
4. **Customers**: Basic customer information
5. **Inventory**: Product and batch management

## 1. Database Schema Design

### 1.1 Accounts Payable Schema

#### Supplier Credit Accounts Table

```sql
CREATE TABLE supplier_credit_accounts (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    account_number VARCHAR(50) UNIQUE,
    credit_limit DECIMAL(12,2) DEFAULT 0.00,
    current_balance DECIMAL(12,2) DEFAULT 0.00,
    available_credit DECIMAL(12,2) DEFAULT 0.00,
    payment_terms VARCHAR(20) DEFAULT 'NET30', -- NET15, NET30, NET60, NET90, CUSTOM
    custom_terms_days INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    UNIQUE(store_id, supplier_id)
);
```

#### Supplier Invoices Table

```sql
CREATE TABLE supplier_invoices (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    purchase_order_id INTEGER,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    invoice_amount DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL,
    balance_amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PARTIAL_PAID, PAID, OVERDUE, CANCELLED
    payment_terms VARCHAR(20) DEFAULT 'NET30',
    custom_terms_days INTEGER,
    notes TEXT,
    attachment_url VARCHAR(255),
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE(store_id, invoice_number)
);
```

#### Supplier Invoice Items Table

```sql
CREATE TABLE supplier_invoice_items (
    id INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    purchase_order_item_id INTEGER,
    product_id INTEGER,
    description TEXT,
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    discount_percent DECIMAL(5,2) DEFAULT 0.00,
    discount_amount DECIMAL(8,2) DEFAULT 0.00,
    tax_rate DECIMAL(5,2) DEFAULT 0.00,
    tax_amount DECIMAL(8,2) DEFAULT 0.00,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id),
    FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
```

#### Supplier Payments Table

```sql
CREATE TABLE supplier_payments (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    payment_number VARCHAR(50) UNIQUE,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(20) NOT NULL, -- CASH, CHECK, BANK_TRANSFER, CARD, ONLINE
    payment_reference VARCHAR(100),
    total_amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'COMPLETED', -- PENDING, COMPLETED, CANCELLED, FAILED
    notes TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

#### Supplier Payment Allocations Table

```sql
CREATE TABLE supplier_payment_allocations (
    id INTEGER PRIMARY KEY,
    payment_id INTEGER NOT NULL,
    invoice_id INTEGER NOT NULL,
    allocated_amount DECIMAL(12,2) NOT NULL,
    discount_taken DECIMAL(8,2) DEFAULT 0.00,
    write_off_amount DECIMAL(8,2) DEFAULT 0.00,
    allocation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (payment_id) REFERENCES supplier_payments(id),
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### 1.2 Accounts Receivable Schema

#### Customer Credit Accounts Table

```sql
CREATE TABLE customer_credit_accounts (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    customer_id INTEGER NOT NULL,
    account_number VARCHAR(50) UNIQUE,
    credit_limit DECIMAL(12,2) DEFAULT 0.00,
    current_balance DECIMAL(12,2) DEFAULT 0.00,
    available_credit DECIMAL(12,2) DEFAULT 0.00,
    payment_terms VARCHAR(20) DEFAULT 'NET30', -- NET15, NET30, NET60, NET90, CUSTOM
    custom_terms_days INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    UNIQUE(store_id, customer_id)
);
```

#### Customer Invoices Table

```sql
CREATE TABLE customer_invoices (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    customer_id INTEGER,
    transaction_id INTEGER,
    invoice_number VARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL,
    balance_amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PARTIAL_PAID, PAID, OVERDUE, CANCELLED
    payment_terms VARCHAR(20) DEFAULT 'NET30',
    custom_terms_days INTEGER,
    notes TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (created_by) REFERENCES users(id),
    UNIQUE(store_id, invoice_number)
);
```

#### Customer Invoice Items Table

```sql
CREATE TABLE customer_invoice_items (
    id INTEGER PRIMARY KEY,
    invoice_id INTEGER NOT NULL,
    transaction_item_id INTEGER,
    product_id INTEGER,
    description TEXT,
    quantity DECIMAL(10,2) NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    discount_percent DECIMAL(5,2) DEFAULT 0.00,
    discount_amount DECIMAL(8,2) DEFAULT 0.00,
    tax_rate DECIMAL(5,2) DEFAULT 0.00,
    tax_amount DECIMAL(8,2) DEFAULT 0.00,
    line_total DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES customer_invoices(id),
    FOREIGN KEY (transaction_item_id) REFERENCES transaction_items(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
```

#### Customer Payments Table

```sql
CREATE TABLE customer_payments (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    customer_id INTEGER,
    payment_number VARCHAR(50) UNIQUE,
    payment_date DATE NOT NULL,
    payment_method VARCHAR(20) NOT NULL, -- CASH, CHECK, BANK_TRANSFER, CARD, UPI, ONLINE
    payment_reference VARCHAR(100),
    total_amount DECIMAL(12,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'COMPLETED', -- PENDING, COMPLETED, CANCELLED, FAILED
    notes TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

#### Customer Payment Allocations Table

```sql
CREATE TABLE customer_payment_allocations (
    id INTEGER PRIMARY KEY,
    payment_id INTEGER NOT NULL,
    invoice_id INTEGER NOT NULL,
    allocated_amount DECIMAL(12,2) NOT NULL,
    discount_taken DECIMAL(8,2) DEFAULT 0.00,
    write_off_amount DECIMAL(8,2) DEFAULT 0.00,
    allocation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    FOREIGN KEY (payment_id) REFERENCES customer_payments(id),
    FOREIGN KEY (invoice_id) REFERENCES customer_invoices(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);
```

### 1.3 Payment Terms Configuration

```sql
CREATE TABLE payment_terms (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    term_code VARCHAR(20) NOT NULL, -- NET15, NET30, NET60, NET90, CUSTOM
    term_name VARCHAR(50) NOT NULL,
    days_due INTEGER NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(store_id, term_code)
);
```

### 1.4 Aging Buckets Configuration

```sql
CREATE TABLE aging_buckets (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    bucket_name VARCHAR(50) NOT NULL, -- CURRENT, 30_DAYS, 60_DAYS, 90_DAYS, 120_PLUS
    min_days INTEGER NOT NULL,
    max_days INTEGER,
    bucket_color VARCHAR(7), -- Hex color code for UI
    display_order INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(store_id, bucket_name)
);
```

### 1.5 Indexes for Performance

```sql
-- Accounts Payable Indexes
CREATE INDEX idx_supplier_credit_supplier ON supplier_credit_accounts(supplier_id);
CREATE INDEX idx_supplier_invoices_supplier ON supplier_invoices(supplier_id);
CREATE INDEX idx_supplier_invoices_status ON supplier_invoices(status);
CREATE INDEX idx_supplier_invoices_due_date ON supplier_invoices(due_date);
CREATE INDEX idx_supplier_payments_supplier ON supplier_payments(supplier_id);
CREATE INDEX idx_payment_allocations_payment ON supplier_payment_allocations(payment_id);
CREATE INDEX idx_payment_allocations_invoice ON supplier_payment_allocations(invoice_id);

-- Accounts Receivable Indexes
CREATE INDEX idx_customer_credit_customer ON customer_credit_accounts(customer_id);
CREATE INDEX idx_customer_invoices_customer ON customer_invoices(customer_id);
CREATE INDEX idx_customer_invoices_status ON customer_invoices(status);
CREATE INDEX idx_customer_invoices_due_date ON customer_invoices(due_date);
CREATE INDEX idx_customer_payments_customer ON customer_payments(customer_id);
CREATE INDEX idx_cust_payment_allocations_payment ON customer_payment_allocations(payment_id);
CREATE INDEX idx_cust_payment_allocations_invoice ON customer_payment_allocations(invoice_id);
```

## 2. API Design

### 2.1 Accounts Payable API Endpoints

#### Supplier Credit Management

```
GET /api/accounts-payable/suppliers
GET /api/accounts-payable/suppliers/:id
POST /api/accounts-payable/suppliers/:id/credit-account
PUT /api/accounts-payable/suppliers/:id/credit-account
GET /api/accounts-payable/suppliers/:id/credit-account
```

#### Supplier Invoice Management

```
GET /api/accounts-payable/invoices
GET /api/accounts-payable/invoices/:id
POST /api/accounts-payable/invoices
PUT /api/accounts-payable/invoices/:id
DELETE /api/accounts-payable/invoices/:id
GET /api/accounts-payable/invoices/:id/items
POST /api/accounts-payable/invoices/:id/items
PUT /api/accounts-payable/invoices/:id/items/:itemId
DELETE /api/accounts-payable/invoices/:id/items/:itemId
POST /api/accounts-payable/invoices/from-purchase-order/:poId
```

#### Supplier Payment Management

```
GET /api/accounts-payable/payments
GET /api/accounts-payable/payments/:id
POST /api/accounts-payable/payments
PUT /api/accounts-payable/payments/:id
DELETE /api/accounts-payable/payments/:id
GET /api/accounts-payable/payments/:id/allocations
POST /api/accounts-payable/payments/:id/allocate
POST /api/accounts-payable/payments/auto-allocate
POST /api/accounts-payable/payments/:id/reverse-allocation
```

#### Reports and Statements

```
GET /api/accounts-payable/aging-report
GET /api/accounts-payable/supplier-statement/:supplierId
GET /api/accounts-payable/cash-requirements
GET /api/accounts-payable/payment-forecast
```

### 2.2 Accounts Receivable API Endpoints

#### Customer Credit Management

```
GET /api/accounts-receivable/customers
GET /api/accounts-receivable/customers/:id
POST /api/accounts-receivable/customers/:id/credit-account
PUT /api/accounts-receivable/customers/:id/credit-account
GET /api/accounts-receivable/customers/:id/credit-account
```

#### Customer Invoice Management

```
GET /api/accounts-receivable/invoices
GET /api/accounts-receivable/invoices/:id
POST /api/accounts-receivable/invoices
PUT /api/accounts-receivable/invoices/:id
DELETE /api/accounts-receivable/invoices/:id
GET /api/accounts-receivable/invoices/:id/items
POST /api/accounts-receivable/invoices/from-transaction/:transactionId
```

#### Customer Payment Management

```
GET /api/accounts-receivable/payments
GET /api/accounts-receivable/payments/:id
POST /api/accounts-receivable/payments
PUT /api/accounts-receivable/payments/:id
DELETE /api/accounts-receivable/payments/:id
GET /api/accounts-receivable/payments/:id/allocations
POST /api/accounts-receivable/payments/:id/allocate
POST /api/accounts-receivable/payments/auto-allocate
POST /api/accounts-receivable/payments/:id/reverse-allocation
```

#### Reports and Statements

```
GET /api/accounts-receivable/aging-report
GET /api/accounts-receivable/customer-statement/:customerId
GET /api/accounts-receivable/collections-report
GET /api/accounts-receivable/payment-forecast
```

### 2.3 Shared API Endpoints

#### Configuration Management

```
GET /api/accounts/payment-terms
POST /api/accounts/payment-terms
PUT /api/accounts/payment-terms/:id
DELETE /api/accounts/payment-terms/:id
GET /api/accounts/aging-buckets
POST /api/accounts/aging-buckets
PUT /api/accounts/aging-buckets/:id
DELETE /api/accounts/aging-buckets/:id
```

## 3. Integration with Existing Modules

### 3.1 Purchase Order Integration

When a purchase order is received, the system will:

1. **Auto-create Supplier Invoice**: Option to automatically generate a supplier invoice from received purchase order
2. **Update Supplier Credit Account**: Adjust the supplier's current balance
3. **Calculate Due Date**: Based on supplier payment terms
4. **Create Accounting Entry**: Record the liability in the accounts payable system

```javascript
// Integration point in purchase-orders.js
app.post("/:id/receive", function (req, res) {
    // ... existing code ...
    
    // New integration code
    if (req.body.createInvoice) {
        createSupplierInvoiceFromPO(purchaseOrder, function(err, invoice) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to create supplier invoice.",
                });
            }
            
            // Update supplier credit account
            updateSupplierCreditAccount(purchaseOrder.supplierId, invoice.totalAmount, function(err) {
                if (err) {
                    console.error(err);
                }
            });
        });
    }
});
```

### 3.2 Sales Transaction Integration

When a credit sale is made, the system will:

1. **Create Customer Invoice**: Generate invoice from transaction
2. **Update Customer Credit Account**: Adjust the customer's current balance
3. **Calculate Due Date**: Based on customer payment terms
4. **Create Accounting Entry**: Record the asset in the accounts receivable system

```javascript
// Integration point in transactions.js
app.post("/new", function (req, res) {
    let newTransaction = req.body;
    
    // ... existing code ...
    
    // New integration code
    if (newTransaction.payment_method === 'CREDIT' && newTransaction.customer_id !== '0') {
        createCustomerInvoiceFromTransaction(newTransaction, function(err, invoice) {
            if (err) {
                console.error(err);
                return;
            }
            
            // Update customer credit account
            updateCustomerCreditAccount(newTransaction.customer_id, invoice.totalAmount, function(err) {
                if (err) {
                    console.error(err);
                }
            });
        });
    }
});
```

### 3.3 Payment Method Integration

Extend existing payment methods to support accounts payable/receivable:

1. **Supplier Payments**: Add new payment method types for supplier payments
2. **Customer Payments**: Enhance existing payment processing to handle credit payments
3. **Bank Reconciliation**: Support for bank statement imports and reconciliation

## 4. UI/UX Design

### 4.1 Supplier Management Interface

#### Supplier Credit Account View
- **Dashboard**: Overview of supplier credit limits and current balances
- **Credit Limit Management**: Set and modify credit limits per supplier
- **Payment Terms Configuration**: Assign predefined or custom payment terms
- **Account Activity**: Recent transactions and payment history

#### Supplier Invoice Management
- **Invoice List**: Filterable list with status indicators
- **Invoice Details**: Complete invoice information with line items
- **Bulk Actions**: Mass invoice processing and approval
- **Document Attachment**: Upload and store invoice documents

#### Supplier Payment Processing
- **Payment Dashboard**: Outstanding invoices and payment suggestions
- **Payment Creation**: Single and bulk payment processing
- **Allocation Interface**: Drag-and-drop payment allocation
- **Payment History**: Complete payment audit trail

### 4.2 Customer Management Interface

#### Customer Credit Account View
- **Dashboard**: Customer credit limits and current balances
- **Credit Management**: Set and modify credit limits per customer
- **Payment Terms**: Assign payment terms and due dates
- **Account Activity**: Recent sales and payment history

#### Customer Invoice Management
- **Invoice List**: Filterable list with aging indicators
- **Invoice Details**: Complete invoice with payment status
- **Collections Tools**: Follow-up reminders and dunning letters
- **Document Generation**: Email/print invoices and statements

#### Customer Payment Processing
- **Payment Entry**: Record customer payments with multiple methods
- **Allocation Interface**: Automatic and manual payment allocation
- **Payment Receipts**: Generate and send payment receipts
- **Deposit Management**: Bank deposit preparation and tracking

### 4.3 Aging Reports Visualization

#### Payables Aging Report
- **Summary Dashboard**: Overall payables aging summary
- **Supplier Breakdown**: Aging by supplier with drill-down capability
- **Visual Indicators**: Color-coded aging buckets
- **Forecasting**: Cash flow projections based on due dates

#### Receivables Aging Report
- **Summary Dashboard**: Overall receivables aging summary
- **Customer Breakdown**: Aging by customer with contact information
- **Collection Priority**: Prioritized collection lists
- **Trend Analysis**: Aging trends over time

### 4.4 Financial Dashboard Widgets

#### Key Performance Indicators
- **Total Payables**: Current accounts payable balance
- **Total Receivables**: Current accounts receivable balance
- **Overdue Items**: Count and value of overdue items
- **Cash Flow**: Net cash flow position

#### Quick Actions
- **Payment Processing**: Quick payment entry buttons
- **Invoice Creation**: Rapid invoice generation
- **Report Access**: One-click report generation
- **Alerts**: Payment due notifications

## 5. Technical Implementation Approach

### 5.1 Payment Allocation Algorithm

#### Automatic Allocation Logic
1. **Oldest Invoice First**: Allocate payments to oldest invoices first
2. **Exact Match**: Prioritize exact amount matches
3. **Partial Allocation**: Handle partial payments with proper tracking
4. **Discount Handling**: Apply early payment discounts when applicable

```javascript
function autoAllocatePayment(paymentId, options = {}) {
    return new Promise((resolve, reject) => {
        // Get payment details
        getPaymentById(paymentId, (err, payment) => {
            if (err) return reject(err);
            
            // Get outstanding invoices
            getOutstandingInvoices(payment.supplier_id || payment.customer_id, (err, invoices) => {
                if (err) return reject(err);
                
                // Sort by due date (oldest first)
                invoices.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
                
                let remainingAmount = payment.total_amount;
                const allocations = [];
                
                for (const invoice of invoices) {
                    if (remainingAmount <= 0) break;
                    
                    const allocatableAmount = Math.min(remainingAmount, invoice.balance_amount);
                    
                    // Check for early payment discount
                    const discount = calculateEarlyPaymentDiscount(invoice, payment.payment_date);
                    const finalAllocation = allocatableAmount - discount;
                    
                    allocations.push({
                        payment_id: paymentId,
                        invoice_id: invoice.id,
                        allocated_amount: finalAllocation,
                        discount_taken: discount,
                        write_off_amount: 0
                    });
                    
                    remainingAmount -= allocatableAmount;
                }
                
                // Create allocations
                createPaymentAllocations(allocations, (err) => {
                    if (err) return reject(err);
                    resolve(allocations);
                });
            });
        });
    });
}
```

### 5.2 Aging Calculation Logic

#### Daily Aging Process
1. **Scheduled Task**: Run aging calculations daily
2. **Bucket Assignment**: Assign invoices to aging buckets
3. **Balance Updates**: Update aged balances
4. **Report Generation**: Generate aging summaries

```javascript
function calculateAgingBuckets(invoices, asOfDate = new Date()) {
    const agingBuckets = {
        CURRENT: { minDays: 0, maxDays: 0, total: 0, count: 0 },
        DAYS_1_30: { minDays: 1, maxDays: 30, total: 0, count: 0 },
        DAYS_31_60: { minDays: 31, maxDays: 60, total: 0, count: 0 },
        DAYS_61_90: { minDays: 61, maxDays: 90, total: 0, count: 0 },
        DAYS_91_PLUS: { minDays: 91, maxDays: null, total: 0, count: 0 }
    };
    
    invoices.forEach(invoice => {
        const daysOverdue = Math.max(0, Math.floor((asOfDate - new Date(invoice.due_date)) / (1000 * 60 * 60 * 24)));
        
        let bucket = null;
        for (const [bucketName, bucketConfig] of Object.entries(agingBuckets)) {
            if (daysOverdue >= bucketConfig.minDays && 
                (bucketConfig.maxDays === null || daysOverdue <= bucketConfig.maxDays)) {
                bucket = bucketConfig;
                break;
            }
        }
        
        if (bucket) {
            bucket.total += invoice.balance_amount;
            bucket.count++;
        }
    });
    
    return agingBuckets;
}
```

### 5.3 Account Statement Generation

#### Statement Generation Process
1. **Period Selection**: Define statement period
2. **Transaction Gathering**: Collect all relevant transactions
3. **Balance Calculation**: Calculate opening and closing balances
4. **Formatting**: Generate formatted statement
5. **Delivery**: Email or print statements

```javascript
function generateAccountStatement(accountId, statementType, startDate, endDate, callback) {
    async.waterfall([
        // Get account information
        function(callback) {
            getAccountById(accountId, statementType, callback);
        },
        
        // Get opening balance
        function(account, callback) {
            calculateOpeningBalance(accountId, statementType, startDate, (err, openingBalance) => {
                callback(err, account, openingBalance);
            });
        },
        
        // Get transactions for period
        function(account, openingBalance, callback) {
            getAccountTransactions(accountId, statementType, startDate, endDate, (err, transactions) => {
                callback(err, account, openingBalance, transactions);
            });
        },
        
        // Calculate closing balance
        function(account, openingBalance, transactions, callback) {
            const closingBalance = calculateClosingBalance(openingBalance, transactions);
            callback(null, account, openingBalance, transactions, closingBalance);
        },
        
        // Generate statement
        function(account, openingBalance, transactions, closingBalance, callback) {
            const statement = {
                account: account,
                period: { start: startDate, end: endDate },
                opening_balance: openingBalance,
                transactions: transactions,
                closing_balance: closingBalance,
                generated_at: new Date()
            };
            
            callback(null, statement);
        }
    ], callback);
}
```

### 5.4 Integration with Existing Transaction Processing

#### Transaction Modification Strategy
1. **Non-Breaking Changes**: Extend existing transaction structure
2. **Backward Compatibility**: Maintain existing functionality
3. **Gradual Migration**: Phase in new features
4. **Data Consistency**: Ensure referential integrity

#### Modified Transaction Flow
1. **Sales Transaction**: Check for credit payment method
2. **Invoice Generation**: Create customer invoice if credit
3. **Account Update**: Update customer credit account
4. **Aging Update**: Recalculate aging buckets
5. **Notification**: Send payment due notifications

## 6. Security and Compliance

### 6.1 Data Security
- **Access Control**: Role-based access to financial data
- **Audit Trail**: Complete audit logging for all financial transactions
- **Data Encryption**: Sensitive financial data encryption
- **Backup Strategy**: Regular automated backups

### 6.2 Compliance Requirements
- **GST Compliance**: Proper tax calculation and reporting
- **Financial Reporting**: Standard financial report formats
- **Data Retention**: Configurable data retention policies
- **Electronic Records**: Compliant electronic record keeping

## 7. Performance Considerations

### 7.1 Database Optimization
- **Indexing Strategy**: Comprehensive indexing for query performance
- **Query Optimization**: Efficient query patterns
- **Data Archiving**: Archive old transaction data
- **Connection Pooling**: Database connection management

### 7.2 Caching Strategy
- **Frequently Accessed Data**: Cache account balances and aging data
- **Report Caching**: Cache generated reports
- **Session Management**: Efficient session handling
- **Background Processing**: Async processing for heavy operations

## 8. Testing Strategy

### 8.1 Unit Testing
- **Business Logic**: Test allocation algorithms and aging calculations
- **Data Validation**: Test input validation and error handling
- **Integration Points**: Test integration with existing modules
- **Edge Cases**: Test boundary conditions and error scenarios

### 8.2 Integration Testing
- **End-to-End Flows**: Test complete payment cycles
- **Data Consistency**: Verify data integrity across modules
- **Performance Testing**: Load testing for high-volume scenarios
- **User Acceptance**: User testing of UI/UX components

## 9. Deployment Strategy

### 9.1 Phased Rollout
1. **Phase 1**: Core accounts payable functionality
2. **Phase 2**: Accounts receivable functionality
3. **Phase 3**: Advanced reporting and analytics
4. **Phase 4**: Mobile and notification features

### 9.2 Data Migration
- **Existing Data**: Migrate existing transaction data
- **Account Setup**: Initialize supplier and customer accounts
- **Balancing**: Verify opening balances
- **Validation**: Data integrity checks

## 10. Future Enhancements

### 10.1 Advanced Features
- **Predictive Analytics**: Cash flow prediction using ML
- **Automated Collections**: AI-powered collection strategies
- **Supplier Portal**: Self-service supplier portal
- **Customer Portal**: Online payment portal for customers

### 10.2 Integration Opportunities
- **Bank Integration**: Direct bank feed integration
- **Accounting Software**: Integration with popular accounting packages
- **ERP Integration**: Enterprise resource planning integration
- **Payment Gateways**: Online payment processing integration

## Conclusion

This comprehensive architecture design provides a robust foundation for implementing accounts payable and receivable functionality in PharmaSpot. The design integrates seamlessly with the existing system while providing advanced features for credit management, payment processing, and financial reporting.

The modular approach allows for phased implementation and future enhancements while maintaining system stability and performance. The design considers security, compliance, and scalability requirements to support the growing needs of pharmacy operations.

---

**Next Steps**:
1. Review and finalize the database schema
2. Create detailed API specifications
3. Develop UI/UX mockups and prototypes
4. Implement core database tables and indexes
5. Develop API endpoints following the specified design
6. Integrate with existing transaction processing
7. Implement UI components and user interfaces
8. Conduct comprehensive testing
9. Deploy in phases with user training
10. Monitor performance and optimize as needed