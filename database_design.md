# PharmaSpot Database Design Document

## Overview

This document outlines the comprehensive database schema design for PharmaSpot, a pharmacy management system. The design supports migration from the current NeDB implementation to SQL databases (PostgreSQL/SQLite) while maintaining compatibility with both database systems.

### Architecture Considerations

- **Multi-store support**: Each store has a local database with periodic sync to a central server
- **Offline capability**: Local databases allow operation without constant connectivity
- **Data synchronization**: Conflict resolution mechanisms for distributed data updates
- **Scalability**: Design supports growth from single store to multi-store chains

## Current System Analysis

### Existing Data Models

Based on the current NeDB implementation, the system has the following core entities:

1. **Products/Inventory** (`inventory.db`)
   - Fields: _id, barcode, expirationDate, price, category, quantity, name, stock, minStock, img
   - Basic inventory tracking with simple stock management

2. **Transactions** (`transactions.db`)
   - Fields: _id, items, total, paid, date, status, user_id, till, customer, ref_number
   - Sales transaction records with payment tracking

3. **Customers** (`customers.db`)
   - Fields: _id, name, phone, email, address
   - Basic customer information

4. **Categories** (`categories.db`)
   - Fields: _id, name
   - Product categorization

5. **Users** (`users.db`)
   - Fields: _id, username, password, fullname, permissions, status
   - User authentication and authorization

6. **Settings** (`settings.db`)
   - Fields: _id, app, store, address_one, address_two, contact, tax, symbol, percentage, charge_tax, footer, img
   - Store configuration and tax settings

## Enhanced Database Schema Design

### 1. Billing & Compliance Enhancements

#### 1.1 GST Tax Configuration

```sql
CREATE TABLE gst_configurations (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    gst_number VARCHAR(15) NOT NULL,
    state_code VARCHAR(2) NOT NULL,
    cgst_rate DECIMAL(5,2) DEFAULT 0.00,
    sgst_rate DECIMAL(5,2) DEFAULT 0.00,
    igst_rate DECIMAL(5,2) DEFAULT 0.00,
    cess_rate DECIMAL(5,2) DEFAULT 0.00,
    effective_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(store_id, gst_number, effective_date)
);

-- Indexes
CREATE INDEX idx_gst_config_store_active ON gst_configurations(store_id, is_active);
CREATE INDEX idx_gst_config_effective_date ON gst_configurations(effective_date);
```

#### 1.2 E-Invoice Management

```sql
CREATE TABLE e_invoices (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    irn VARCHAR(64) UNIQUE, -- Invoice Reference Number
    signed_invoice TEXT, -- Base64 encoded signed invoice
    signed_qr_code TEXT, -- Base64 encoded QR code
    ack_number VARCHAR(20),
    ack_date TIMESTAMP,
    invoice_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, GENERATED, CANCELLED
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- Indexes
CREATE INDEX idx_e_invoice_transaction ON e_invoices(transaction_id);
CREATE INDEX idx_e_invoice_status ON e_invoices(invoice_status);
CREATE INDEX idx_e_invoice_irn ON e_invoices(irn);
```

#### 1.3 E-Way Bill Management

```sql
CREATE TABLE e_way_bills (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    eway_bill_number VARCHAR(12) UNIQUE,
    generated_date DATE NOT NULL,
    valid_until DATE NOT NULL,
    from_state VARCHAR(50) NOT NULL,
    to_state VARCHAR(50) NOT NULL,
    from_pincode VARCHAR(6) NOT NULL,
    to_pincode VARCHAR(6) NOT NULL,
    transporter_id INTEGER,
    vehicle_number VARCHAR(20),
    distance_km INTEGER,
    document_status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, CANCELLED, EXPIRED
    cancel_reason TEXT,
    cancelled_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (transporter_id) REFERENCES transporters(id)
);

-- Transporter information
CREATE TABLE transporters (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    gst_number VARCHAR(15),
    transporter_id VARCHAR(15) UNIQUE, -- GSTN transporter ID
    phone VARCHAR(15),
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- Indexes
CREATE INDEX idx_eway_bill_transaction ON e_way_bills(transaction_id);
CREATE INDEX idx_eway_bill_number ON e_way_bills(eway_bill_number);
CREATE INDEX idx_eway_bill_status ON e_way_bills(document_status);
CREATE INDEX idx_transporter_store ON transporters(store_id);
```

### 2. Inventory Management

#### 2.1 Enhanced Product Management

```sql
CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    sku VARCHAR(50) UNIQUE,
    barcode VARCHAR(50),
    name VARCHAR(200) NOT NULL,
    generic_name VARCHAR(200),
    manufacturer VARCHAR(100),
    category_id INTEGER,
    description TEXT,
    hsn_code VARCHAR(8),
    schedule_category VARCHAR(20), -- H, H1, X, etc.
    is_prescription_required BOOLEAN DEFAULT FALSE,
    is_narcotic BOOLEAN DEFAULT FALSE,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    UNIQUE(store_id, sku)
);

-- Product pricing
CREATE TABLE product_pricing (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    purchase_price DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    mrp DECIMAL(10,2),
    gst_rate DECIMAL(5,2) DEFAULT 0.00,
    effective_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(product_id, store_id, effective_date)
);

-- Batch-wise inventory
CREATE TABLE product_batches (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    batch_number VARCHAR(50) NOT NULL,
    expiry_date DATE NOT NULL,
    manufacturing_date DATE,
    initial_quantity INTEGER NOT NULL,
    current_quantity INTEGER NOT NULL,
    cost_price DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    supplier_id INTEGER,
    rack_location VARCHAR(50),
    shelf_location VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    UNIQUE(product_id, store_id, batch_number)
);

-- Inventory movements
CREATE TABLE inventory_movements (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    batch_id INTEGER,
    movement_type VARCHAR(20) NOT NULL, -- PURCHASE, SALE, RETURN, ADJUSTMENT, TRANSFER, EXPIRED
    quantity INTEGER NOT NULL, -- Positive for incoming, negative for outgoing
    reference_id INTEGER, -- Transaction ID, Purchase ID, etc.
    reference_type VARCHAR(20), -- TRANSACTION, PURCHASE, ADJUSTMENT
    reason TEXT,
    user_id INTEGER,
    movement_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Reorder thresholds
CREATE TABLE product_reorder_settings (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    min_quantity INTEGER NOT NULL DEFAULT 0,
    max_quantity INTEGER NOT NULL DEFAULT 0,
    reorder_quantity INTEGER NOT NULL DEFAULT 0,
    lead_time_days INTEGER DEFAULT 7,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(product_id, store_id)
);

-- Indexes
CREATE INDEX idx_product_store ON products(store_id);
CREATE INDEX idx_product_category ON products(category_id);
CREATE INDEX idx_product_barcode ON products(barcode);
CREATE INDEX idx_product_sku ON products(sku);

CREATE INDEX idx_pricing_product_store ON product_pricing(product_id, store_id);
CREATE INDEX idx_pricing_effective_date ON product_pricing(effective_date);

CREATE INDEX idx_batch_product_store ON product_batches(product_id, store_id);
CREATE INDEX idx_batch_expiry ON product_batches(expiry_date);
CREATE INDEX idx_batch_location ON product_batches(rack_location, shelf_location);

CREATE INDEX idx_movement_product_store ON inventory_movements(product_id, store_id);
CREATE INDEX idx_movement_date ON inventory_movements(movement_date);
CREATE INDEX idx_movement_type ON inventory_movements(movement_type);

CREATE INDEX idx_reorder_product_store ON product_reorder_settings(product_id, store_id);
```

#### 2.2 Supplier Management

```sql
CREATE TABLE suppliers (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    contact_person VARCHAR(100),
    phone VARCHAR(15),
    email VARCHAR(100),
    gst_number VARCHAR(15),
    pan_number VARCHAR(10),
    drug_license_number VARCHAR(20),
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(50),
    pincode VARCHAR(6),
    payment_terms VARCHAR(50), -- NET30, NET60, etc.
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(store_id, name)
);

-- Indexes
CREATE INDEX idx_supplier_store ON suppliers(store_id);
CREATE INDEX idx_supplier_gst ON suppliers(gst_number);
CREATE INDEX idx_supplier_active ON suppliers(is_active);
```

#### 2.3 Purchase Order Management

```sql
CREATE TABLE purchase_orders (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    supplier_id INTEGER NOT NULL,
    order_number VARCHAR(50) UNIQUE,
    order_date DATE NOT NULL,
    expected_delivery_date DATE,
    status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, CONFIRMED, PARTIAL_RECEIVED, RECEIVED, CANCELLED
    subtotal DECIMAL(12,2) NOT NULL,
    gst_amount DECIMAL(12,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0.00,
    notes TEXT,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE purchase_order_items (
    id INTEGER PRIMARY KEY,
    purchase_order_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_number VARCHAR(50),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    gst_rate DECIMAL(5,2) DEFAULT 0.00,
    discount_percent DECIMAL(5,2) DEFAULT 0.00,
    total_price DECIMAL(12,2) NOT NULL,
    received_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Purchase receipts
CREATE TABLE purchase_receipts (
    id INTEGER PRIMARY KEY,
    purchase_order_id INTEGER NOT NULL,
    receipt_number VARCHAR(50) UNIQUE,
    receipt_date DATE NOT NULL,
    invoice_number VARCHAR(50),
    invoice_date DATE,
    status VARCHAR(20) DEFAULT 'RECEIVED',
    notes TEXT,
    received_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
    FOREIGN KEY (received_by) REFERENCES users(id)
);

CREATE TABLE purchase_receipt_items (
    id INTEGER PRIMARY KEY,
    receipt_id INTEGER NOT NULL,
    purchase_order_item_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    batch_number VARCHAR(50) NOT NULL,
    expiry_date DATE NOT NULL,
    manufacturing_date DATE,
    quantity_received INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (receipt_id) REFERENCES purchase_receipts(id),
    FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
);

-- Indexes
CREATE INDEX idx_po_store ON purchase_orders(store_id);
CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);
CREATE INDEX idx_po_status ON purchase_orders(status);
CREATE INDEX idx_po_date ON purchase_orders(order_date);

CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_po_items_product ON purchase_order_items(product_id);

CREATE INDEX idx_receipt_po ON purchase_receipts(purchase_order_id);
CREATE INDEX idx_receipt_date ON purchase_receipts(receipt_date);

CREATE INDEX idx_receipt_items_receipt ON purchase_receipt_items(receipt_id);
CREATE INDEX idx_receipt_items_batch ON purchase_receipt_items(batch_id);
```

### 3. Pharmacy-Specific Logic

#### 3.1 Prescription Management

```sql
CREATE TABLE prescriptions (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    prescription_number VARCHAR(50) UNIQUE,
    customer_id INTEGER,
    doctor_name VARCHAR(100),
    doctor_registration VARCHAR(50),
    hospital_name VARCHAR(100),
    prescription_date DATE NOT NULL,
    notes TEXT,
    image_url VARCHAR(255), -- Scanned prescription image
    is_processed BOOLEAN DEFAULT FALSE,
    processed_by INTEGER,
    processed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (processed_by) REFERENCES users(id)
);

CREATE TABLE prescription_items (
    id INTEGER PRIMARY KEY,
    prescription_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    dosage VARCHAR(100),
    frequency VARCHAR(100),
    duration VARCHAR(100),
    quantity INTEGER NOT NULL,
    instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Indexes
CREATE INDEX idx_prescription_store ON prescriptions(store_id);
CREATE INDEX idx_prescription_customer ON prescriptions(customer_id);
CREATE INDEX idx_prescription_date ON prescriptions(prescription_date);
CREATE INDEX idx_prescription_status ON prescriptions(is_processed);

CREATE INDEX idx_prescription_items_prescription ON prescription_items(prescription_id);
CREATE INDEX idx_prescription_items_product ON prescription_items(product_id);
```

#### 3.2 Drug Interaction Database

```sql
CREATE TABLE drug_interactions (
    id INTEGER PRIMARY KEY,
    product_id_1 INTEGER NOT NULL,
    product_id_2 INTEGER NOT NULL,
    interaction_level VARCHAR(20) NOT NULL, -- MINOR, MODERATE, MAJOR, CONTRAINDICATED
    interaction_description TEXT NOT NULL,
    recommendation TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id_1) REFERENCES products(id),
    FOREIGN KEY (product_id_2) REFERENCES products(id),
    CHECK(product_id_1 < product_id_2), -- Prevent duplicate entries
    UNIQUE(product_id_1, product_id_2)
);

-- Indexes
CREATE INDEX idx_interaction_product1 ON drug_interactions(product_id_1);
CREATE INDEX idx_interaction_product2 ON drug_interactions(product_id_2);
CREATE INDEX idx_interaction_level ON drug_interactions(interaction_level);
```

#### 3.3 Restricted Drugs Management

```sql
CREATE TABLE restricted_drugs (
    id INTEGER PRIMARY KEY,
    product_id INTEGER NOT NULL,
    schedule_category VARCHAR(20) NOT NULL, -- H, H1, X, etc.
    storage_requirements TEXT,
    max_purchase_quantity INTEGER,
    valid_prescription_required BOOLEAN DEFAULT TRUE,
    photo_id_required BOOLEAN DEFAULT FALSE,
    register_maintenance BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    UNIQUE(product_id)
);

-- Restricted drugs sales register
CREATE TABLE restricted_drugs_register (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    quantity_sold INTEGER NOT NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_address TEXT NOT NULL,
    doctor_name VARCHAR(100),
    prescription_number VARCHAR(50),
    customer_id_proof VARCHAR(50), -- Aadhaar, Voter ID, etc.
    id_proof_number VARCHAR(50),
    sold_by INTEGER,
    sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id),
    FOREIGN KEY (sold_by) REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_restricted_drug_product ON restricted_drugs(product_id);
CREATE INDEX idx_restricted_drug_schedule ON restricted_drugs(schedule_category);

CREATE INDEX idx_restricted_register_store ON restricted_drugs_register(store_id);
CREATE INDEX idx_restricted_register_transaction ON restricted_drugs_register(transaction_id);
CREATE INDEX idx_restricted_register_product ON restricted_drugs_register(product_id);
CREATE INDEX idx_restricted_register_date ON restricted_drugs_register(sale_date);
```

### 4. Reporting & Dashboards

#### 4.1 Sales Analytics

```sql
CREATE TABLE sales_summaries (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    summary_date DATE NOT NULL,
    summary_type VARCHAR(10) NOT NULL, -- DAILY, WEEKLY, MONTHLY, YEARLY
    total_transactions INTEGER DEFAULT 0,
    total_sales DECIMAL(12,2) DEFAULT 0.00,
    total_tax DECIMAL(12,2) DEFAULT 0.00,
    total_discount DECIMAL(12,2) DEFAULT 0.00,
    total_cost DECIMAL(12,2) DEFAULT 0.00,
    gross_profit DECIMAL(12,2) DEFAULT 0.00,
    net_profit DECIMAL(12,2) DEFAULT 0.00,
    cash_sales DECIMAL(12,2) DEFAULT 0.00,
    card_sales DECIMAL(12,2) DEFAULT 0.00,
    credit_sales DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(store_id, summary_date, summary_type)
);

CREATE TABLE product_sales_summary (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    summary_date DATE NOT NULL,
    summary_type VARCHAR(10) NOT NULL,
    quantity_sold INTEGER DEFAULT 0,
    total_sales DECIMAL(12,2) DEFAULT 0.00,
    total_cost DECIMAL(12,2) DEFAULT 0.00,
    profit DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    UNIQUE(store_id, product_id, summary_date, summary_type)
);

CREATE TABLE category_sales_summary (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    summary_date DATE NOT NULL,
    summary_type VARCHAR(10) NOT NULL,
    quantity_sold INTEGER DEFAULT 0,
    total_sales DECIMAL(12,2) DEFAULT 0.00,
    total_cost DECIMAL(12,2) DEFAULT 0.00,
    profit DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    UNIQUE(store_id, category_id, summary_date, summary_type)
);

-- Indexes
CREATE INDEX idx_sales_summary_store_date ON sales_summaries(store_id, summary_date);
CREATE INDEX idx_sales_summary_type ON sales_summaries(summary_type);

CREATE INDEX idx_product_sales_store_date ON product_sales_summary(store_id, summary_date);
CREATE INDEX idx_product_sales_product ON product_sales_summary(product_id);

CREATE INDEX idx_category_sales_store_date ON category_sales_summary(store_id, summary_date);
CREATE INDEX idx_category_sales_category ON category_sales_summary(category_id);
```

#### 4.2 Audit Trails

```sql
CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    action VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    old_values TEXT, -- JSON format
    new_values TEXT, -- JSON format
    changed_fields TEXT, -- JSON array of changed field names
    user_id INTEGER,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_audit_store ON audit_logs(store_id);
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);
```

### 5. User Experience & Workflow

#### 5.1 Receipt Sharing

```sql
CREATE TABLE receipt_shares (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    share_type VARCHAR(20) NOT NULL, -- WHATSAPP, EMAIL, SMS
    recipient VARCHAR(255) NOT NULL,
    share_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, SENT, FAILED
    sent_at TIMESTAMP,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- Indexes
CREATE INDEX idx_receipt_share_transaction ON receipt_shares(transaction_id);
CREATE INDEX idx_receipt_share_status ON receipt_shares(share_status);
CREATE INDEX idx_receipt_share_type ON receipt_shares(share_type);
```

#### 5.2 Home Delivery Management

```sql
CREATE TABLE delivery_orders (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL UNIQUE,
    customer_id INTEGER NOT NULL,
    delivery_address TEXT NOT NULL,
    delivery_pincode VARCHAR(6),
    delivery_phone VARCHAR(15),
    delivery_instructions TEXT,
    delivery_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, ASSIGNED, PICKED, IN_TRANSIT, DELIVERED, CANCELLED
    scheduled_delivery_time TIMESTAMP,
    estimated_delivery_time TIMESTAMP,
    actual_delivery_time TIMESTAMP,
    delivery_charge DECIMAL(8,2) DEFAULT 0.00,
    driver_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (driver_id) REFERENCES drivers(id)
);

CREATE TABLE delivery_status_updates (
    id INTEGER PRIMARY KEY,
    delivery_order_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    location_lat DECIMAL(10,8),
    location_lng DECIMAL(11,8),
    notes TEXT,
    updated_by INTEGER, -- Driver ID
    update_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (delivery_order_id) REFERENCES delivery_orders(id),
    FOREIGN KEY (updated_by) REFERENCES drivers(id)
);

-- Drivers management
CREATE TABLE drivers (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15) UNIQUE,
    email VARCHAR(100),
    license_number VARCHAR(50),
    vehicle_number VARCHAR(20),
    vehicle_type VARCHAR(20), -- BIKE, CAR, VAN
    is_available BOOLEAN DEFAULT TRUE,
    current_location_lat DECIMAL(10,8),
    current_location_lng DECIMAL(11,8),
    last_location_update TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- Delivery routes
CREATE TABLE delivery_routes (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    route_name VARCHAR(100) NOT NULL,
    route_description TEXT,
    estimated_duration_minutes INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE route_waypoints (
    id INTEGER PRIMARY KEY,
    route_id INTEGER NOT NULL,
    waypoint_order INTEGER NOT NULL,
    location_name VARCHAR(100),
    location_lat DECIMAL(10,8),
    location_lng DECIMAL(11,8),
    estimated_time_minutes INTEGER,
    FOREIGN KEY (route_id) REFERENCES delivery_routes(id),
    UNIQUE(route_id, waypoint_order)
);

-- Indexes
CREATE INDEX idx_delivery_transaction ON delivery_orders(transaction_id);
CREATE INDEX idx_delivery_customer ON delivery_orders(customer_id);
CREATE INDEX idx_delivery_status ON delivery_orders(delivery_status);
CREATE INDEX idx_delivery_driver ON delivery_orders(driver_id);
CREATE INDEX idx_delivery_scheduled_time ON delivery_orders(scheduled_delivery_time);

CREATE INDEX idx_delivery_status_delivery ON delivery_status_updates(delivery_order_id);
CREATE INDEX idx_delivery_status_time ON delivery_status_updates(update_time);

CREATE INDEX idx_driver_store ON drivers(store_id);
CREATE INDEX idx_driver_available ON drivers(is_available);
CREATE INDEX idx_driver_location ON drivers(current_location_lat, current_location_lng);

CREATE INDEX idx_route_store ON delivery_routes(store_id);
CREATE INDEX idx_route_waypoints ON route_waypoints(route_id);
```

#### 5.3 Loyalty & Discount Schemes

```sql
CREATE TABLE loyalty_programs (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    program_name VARCHAR(100) NOT NULL,
    program_type VARCHAR(20) NOT NULL, -- POINTS, TIER, CASHBACK
    description TEXT,
    points_per_currency DECIMAL(8,2), -- Points earned per currency unit
    min_purchase_amount DECIMAL(10,2),
    expiry_months INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE customer_loyalty (
    id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL,
    loyalty_program_id INTEGER NOT NULL,
    current_points INTEGER DEFAULT 0,
    total_earned_points INTEGER DEFAULT 0,
    total_redeemed_points INTEGER DEFAULT 0,
    tier_level VARCHAR(20),
    tier_expiry_date DATE,
    last_activity_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (loyalty_program_id) REFERENCES loyalty_programs(id),
    UNIQUE(customer_id, loyalty_program_id)
);

CREATE TABLE loyalty_transactions (
    id INTEGER PRIMARY KEY,
    customer_loyalty_id INTEGER NOT NULL,
    transaction_id INTEGER,
    transaction_type VARCHAR(20) NOT NULL, -- EARN, REDEEM, EXPIRE, ADJUST
    points INTEGER NOT NULL,
    balance_before INTEGER,
    balance_after INTEGER,
    reference_id INTEGER, -- Related transaction or adjustment ID
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_loyalty_id) REFERENCES customer_loyalty(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

CREATE TABLE discount_schemes (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    scheme_name VARCHAR(100) NOT NULL,
    scheme_type VARCHAR(20) NOT NULL, -- PERCENTAGE, FIXED, BOGO, BUY_X_GET_Y
    discount_value DECIMAL(10,2),
    min_purchase_amount DECIMAL(10,2),
    max_discount_amount DECIMAL(10,2),
    applicable_products TEXT, -- JSON array of product IDs
    applicable_categories TEXT, -- JSON array of category IDs
    applicable_customers TEXT, -- JSON array of customer IDs
    start_date DATE,
    end_date DATE,
    usage_limit_per_customer INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE discount_usage (
    id INTEGER PRIMARY KEY,
    discount_scheme_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    customer_id INTEGER,
    discount_amount DECIMAL(10,2) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (discount_scheme_id) REFERENCES discount_schemes(id),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Indexes
CREATE INDEX idx_loyalty_program_store ON loyalty_programs(store_id);
CREATE INDEX idx_loyalty_program_active ON loyalty_programs(is_active);

CREATE INDEX idx_customer_loyalty_customer ON customer_loyalty(customer_id);
CREATE INDEX idx_customer_loyalty_program ON customer_loyalty(loyalty_program_id);

CREATE INDEX idx_loyalty_transaction_customer_loyalty ON loyalty_transactions(customer_loyalty_id);
CREATE INDEX idx_loyalty_transaction_type ON loyalty_transactions(transaction_type);
CREATE INDEX idx_loyalty_transaction_date ON loyalty_transactions(created_at);

CREATE INDEX idx_discount_scheme_store ON discount_schemes(store_id);
CREATE INDEX idx_discount_scheme_active ON discount_schemes(is_active);
CREATE INDEX idx_discount_scheme_dates ON discount_schemes(start_date, end_date);

CREATE INDEX idx_discount_usage_scheme ON discount_usage(discount_scheme_id);
CREATE INDEX idx_discount_usage_customer ON discount_usage(customer_id);
```

### 6. Advanced Multi-Store Support

#### 6.1 Store Management

```sql
CREATE TABLE stores (
    id INTEGER PRIMARY KEY,
    store_code VARCHAR(10) UNIQUE NOT NULL,
    store_name VARCHAR(100) NOT NULL,
    store_type VARCHAR(20) DEFAULT 'RETAIL', -- RETAIL, WAREHOUSE, HEAD_OFFICE
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(50),
    state VARCHAR(50),
    country VARCHAR(50) DEFAULT 'India',
    pincode VARCHAR(6),
    phone VARCHAR(15),
    email VARCHAR(100),
    gst_number VARCHAR(15),
    drug_license_number VARCHAR(20),
    store_timings TEXT, -- JSON with opening/closing times
    is_active BOOLEAN DEFAULT TRUE,
    is_central BOOLEAN DEFAULT FALSE, -- Central server flag
    parent_store_id INTEGER, -- For hierarchical store structure
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_store_id) REFERENCES stores(id)
);

-- Store configurations
CREATE TABLE store_configurations (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    config_key VARCHAR(50) NOT NULL,
    config_value TEXT,
    config_type VARCHAR(20) DEFAULT 'STRING', -- STRING, NUMBER, BOOLEAN, JSON
    is_encrypted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(store_id, config_key)
);

-- Indexes
CREATE INDEX idx_store_active ON stores(is_active);
CREATE INDEX idx_store_type ON stores(store_type);
CREATE INDEX idx_store_parent ON stores(parent_store_id);

CREATE INDEX idx_store_config_store ON store_configurations(store_id);
CREATE INDEX idx_store_config_key ON store_configurations(config_key);
```

#### 6.2 Data Synchronization

```sql
CREATE TABLE sync_logs (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    sync_type VARCHAR(20) NOT NULL, -- PUSH, PULL, BIDIRECTIONAL
    sync_status VARCHAR(20) NOT NULL, -- STARTED, IN_PROGRESS, COMPLETED, FAILED
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    records_processed INTEGER DEFAULT 0,
    records_success INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    sync_details TEXT, -- JSON with detailed sync information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

CREATE TABLE sync_conflicts (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    conflict_type VARCHAR(20) NOT NULL, -- UPDATE_CONFLICT, DELETE_CONFLICT, DUPLICATE_INSERT
    local_data TEXT, -- JSON format
    remote_data TEXT, -- JSON format
    conflict_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, RESOLVED_LOCAL, RESOLVED_REMOTE, MANUAL_REVIEW
    resolution_data TEXT, -- JSON with resolution information
    resolved_by INTEGER,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (resolved_by) REFERENCES users(id)
);

CREATE TABLE sync_queue (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INTEGER NOT NULL,
    operation VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
    data TEXT, -- JSON format of the record data
    priority INTEGER DEFAULT 0, -- Higher number = higher priority
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at TIMESTAMP,
    sync_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- Indexes
CREATE INDEX idx_sync_log_store ON sync_logs(store_id);
CREATE INDEX idx_sync_log_status ON sync_logs(sync_status);
CREATE INDEX idx_sync_log_start_time ON sync_logs(start_time);

CREATE INDEX idx_sync_conflict_store ON sync_conflicts(store_id);
CREATE INDEX idx_sync_conflict_table ON sync_conflicts(table_name);
CREATE INDEX idx_sync_conflict_status ON sync_conflicts(conflict_status);

CREATE INDEX idx_sync_queue_store ON sync_queue(store_id);
CREATE INDEX idx_sync_queue_status ON sync_queue(sync_status);
CREATE INDEX idx_sync_queue_priority ON sync_queue(priority DESC);
CREATE INDEX idx_sync_queue_retry ON sync_queue(next_retry_at);
```

#### 6.3 Inter-Store Transfers

```sql
CREATE TABLE inter_store_transfers (
    id INTEGER PRIMARY KEY,
    transfer_number VARCHAR(50) UNIQUE,
    from_store_id INTEGER NOT NULL,
    to_store_id INTEGER NOT NULL,
    transfer_status VARCHAR(20) DEFAULT 'PENDING', -- PENDING, APPROVED, IN_TRANSIT, RECEIVED, CANCELLED
    transfer_date DATE NOT NULL,
    expected_delivery_date DATE,
    notes TEXT,
    requested_by INTEGER,
    approved_by INTEGER,
    shipped_by INTEGER,
    received_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (from_store_id) REFERENCES stores(id),
    FOREIGN KEY (to_store_id) REFERENCES stores(id),
    FOREIGN KEY (requested_by) REFERENCES users(id),
    FOREIGN KEY (approved_by) REFERENCES users(id),
    FOREIGN KEY (shipped_by) REFERENCES users(id),
    FOREIGN KEY (received_by) REFERENCES users(id),
    CHECK(from_store_id != to_store_id)
);

CREATE TABLE inter_store_transfer_items (
    id INTEGER PRIMARY KEY,
    transfer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    from_batch_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transfer_id) REFERENCES inter_store_transfers(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id),
    FOREIGN KEY (from_batch_id) REFERENCES product_batches(id)
);

-- Indexes
CREATE INDEX idx_transfer_from_store ON inter_store_transfers(from_store_id);
CREATE INDEX idx_transfer_to_store ON inter_store_transfers(to_store_id);
CREATE INDEX idx_transfer_status ON inter_store_transfers(transfer_status);
CREATE INDEX idx_transfer_date ON inter_store_transfers(transfer_date);

CREATE INDEX idx_transfer_items_transfer ON inter_store_transfer_items(transfer_id);
CREATE INDEX idx_transfer_items_product ON inter_store_transfer_items(product_id);
```

## Enhanced Core Tables (Modified from Existing)

### 1. Enhanced Categories

```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    parent_category_id INTEGER,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    hsn_code VARCHAR(8),
    image_url VARCHAR(255),
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (parent_category_id) REFERENCES categories(id),
    UNIQUE(store_id, name)
);

-- Indexes
CREATE INDEX idx_category_store ON categories(store_id);
CREATE INDEX idx_category_parent ON categories(parent_category_id);
CREATE INDEX idx_category_active ON categories(is_active);
```

### 2. Enhanced Customers

```sql
CREATE TABLE customers (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    customer_code VARCHAR(20) UNIQUE,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15),
    email VARCHAR(100),
    address TEXT,
    city VARCHAR(50),
    state VARCHAR(50),
    pincode VARCHAR(6),
    gst_number VARCHAR(15),
    date_of_birth DATE,
    anniversary_date DATE,
    customer_type VARCHAR(20) DEFAULT 'REGULAR', -- REGULAR, LOYAL, CORPORATE
    credit_limit DECIMAL(10,2) DEFAULT 0.00,
    current_balance DECIMAL(10,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(store_id, phone)
);

-- Indexes
CREATE INDEX idx_customer_store ON customers(store_id);
CREATE INDEX idx_customer_phone ON customers(phone);
CREATE INDEX idx_customer_email ON customers(email);
CREATE INDEX idx_customer_type ON customers(customer_type);
```

### 3. Enhanced Transactions

```sql
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    transaction_number VARCHAR(50) UNIQUE,
    customer_id INTEGER,
    user_id INTEGER NOT NULL,
    till_id INTEGER,
    transaction_type VARCHAR(20) DEFAULT 'SALE', -- SALE, RETURN, PURCHASE_RETURN
    transaction_status VARCHAR(20) DEFAULT 'COMPLETED', -- PENDING, COMPLETED, CANCELLED, REFUNDED
    subtotal DECIMAL(12,2) NOT NULL,
    discount_amount DECIMAL(12,2) DEFAULT 0.00,
    tax_amount DECIMAL(12,2) DEFAULT 0.00,
    total_amount DECIMAL(12,2) NOT NULL,
    paid_amount DECIMAL(12,2) DEFAULT 0.00,
    balance_amount DECIMAL(12,2) DEFAULT 0.00,
    payment_method VARCHAR(20), -- CASH, CARD, UPI, CREDIT, MIXED
    payment_details TEXT, -- JSON with payment breakdown
    notes TEXT,
    reference_number VARCHAR(50), -- For on-hold transactions
    loyalty_points_earned INTEGER DEFAULT 0,
    loyalty_points_redeemed INTEGER DEFAULT 0,
    delivery_id INTEGER,
    prescription_id INTEGER,
    transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (till_id) REFERENCES tills(id),
    FOREIGN KEY (delivery_id) REFERENCES delivery_orders(id),
    FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
);

CREATE TABLE transaction_items (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    batch_id INTEGER,
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    discount_percent DECIMAL(5,2) DEFAULT 0.00,
    discount_amount DECIMAL(8,2) DEFAULT 0.00,
    tax_rate DECIMAL(5,2) DEFAULT 0.00,
    tax_amount DECIMAL(8,2) DEFAULT 0.00,
    total_price DECIMAL(12,2) NOT NULL,
    cost_price DECIMAL(10,2),
    returned_quantity INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
);

CREATE TABLE transaction_payments (
    id INTEGER PRIMARY KEY,
    transaction_id INTEGER NOT NULL,
    payment_method VARCHAR(20) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    reference_number VARCHAR(50), -- Check number, card last 4, UPI transaction ID
    payment_status VARCHAR(20) DEFAULT 'COMPLETED', -- PENDING, COMPLETED, FAILED, REFUNDED
    payment_details TEXT, -- JSON with additional payment information
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id)
);

-- Indexes
CREATE INDEX idx_transaction_store ON transactions(store_id);
CREATE INDEX idx_transaction_customer ON transactions(customer_id);
CREATE INDEX idx_transaction_user ON transactions(user_id);
CREATE INDEX idx_transaction_date ON transactions(transaction_date);
CREATE INDEX idx_transaction_status ON transactions(transaction_status);
CREATE INDEX idx_transaction_type ON transactions(transaction_type);
CREATE INDEX idx_transaction_number ON transactions(transaction_number);

CREATE INDEX idx_transaction_items_transaction ON transaction_items(transaction_id);
CREATE INDEX idx_transaction_items_product ON transaction_items(product_id);
CREATE INDEX idx_transaction_items_batch ON transaction_items(batch_id);

CREATE INDEX idx_transaction_payments_transaction ON transaction_payments(transaction_id);
CREATE INDEX idx_transaction_payments_method ON transaction_payments(payment_method);
```

### 4. Enhanced Users

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(15),
    role VARCHAR(20) DEFAULT 'STAFF', -- ADMIN, MANAGER, PHARMACIST, STAFF, CASHIER
    permissions TEXT, -- JSON with detailed permissions
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    password_changed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id)
);

-- Indexes
CREATE INDEX idx_user_store ON users(store_id);
CREATE INDEX idx_user_username ON users(username);
CREATE INDEX idx_user_role ON users(role);
CREATE INDEX idx_user_active ON users(is_active);
```

### 5. Enhanced Settings

```sql
CREATE TABLE settings (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    setting_key VARCHAR(50) NOT NULL,
    setting_value TEXT,
    setting_type VARCHAR(20) DEFAULT 'STRING', -- STRING, NUMBER, BOOLEAN, JSON
    is_encrypted BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    UNIQUE(store_id, setting_key)
);

-- Indexes
CREATE INDEX idx_settings_store ON settings(store_id);
CREATE INDEX idx_settings_key ON settings(setting_key);
```

### 6. New Tills Management

```sql
CREATE TABLE tills (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    till_number VARCHAR(20) NOT NULL,
    till_name VARCHAR(100),
    description TEXT,
    opening_balance DECIMAL(12,2) DEFAULT 0.00,
    current_balance DECIMAL(12,2) DEFAULT 0.00,
    assigned_user_id INTEGER,
    status VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE, INACTIVE, CLOSED
    last_opened_at TIMESTAMP,
    last_closed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (assigned_user_id) REFERENCES users(id),
    UNIQUE(store_id, till_number)
);

CREATE TABLE till_sessions (
    id INTEGER PRIMARY KEY,
    till_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    opening_time TIMESTAMP NOT NULL,
    closing_time TIMESTAMP,
    opening_balance DECIMAL(12,2) NOT NULL,
    closing_balance DECIMAL(12,2),
    cash_sales DECIMAL(12,2) DEFAULT 0.00,
    card_sales DECIMAL(12,2) DEFAULT 0.00,
    upi_sales DECIMAL(12,2) DEFAULT 0.00,
    credit_sales DECIMAL(12,2) DEFAULT 0.00,
    total_sales DECIMAL(12,2) DEFAULT 0.00,
    total_refunds DECIMAL(12,2) DEFAULT 0.00,
    notes TEXT,
    status VARCHAR(20) DEFAULT 'OPEN', -- OPEN, CLOSED
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (till_id) REFERENCES tills(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Indexes
CREATE INDEX idx_till_store ON tills(store_id);
CREATE INDEX idx_till_user ON tills(assigned_user_id);
CREATE INDEX idx_till_status ON tills(status);

CREATE INDEX idx_till_session_till ON till_sessions(till_id);
CREATE INDEX idx_till_session_user ON till_sessions(user_id);
CREATE INDEX idx_till_session_opening ON till_sessions(opening_time);
```

## Performance Optimization Indexes

### Additional Indexes for Performance

```sql
-- Composite indexes for common queries
CREATE INDEX idx_inventory_movement_product_date ON inventory_movements(product_id, movement_date);
CREATE INDEX idx_transaction_items_product_quantity ON transaction_items(product_id, quantity);
CREATE INDEX idx_product_batches_expiry_quantity ON product_batches(expiry_date, current_quantity);
CREATE INDEX idx_purchase_orders_supplier_status ON purchase_orders(supplier_id, status);
CREATE INDEX idx_delivery_orders_status_date ON delivery_orders(delivery_status, scheduled_delivery_time);

-- Full-text search indexes (PostgreSQL specific)
-- CREATE INDEX idx_products_name_fts ON products USING gin(to_tsvector('english', name));
-- CREATE INDEX idx_products_generic_fts ON products USING gin(to_tsvector('english', generic_name));

-- Partial indexes for better performance
CREATE INDEX idx_active_products ON products(id) WHERE is_active = TRUE;
CREATE INDEX idx_pending_deliveries ON delivery_orders(id) WHERE delivery_status IN ('PENDING', 'ASSIGNED', 'PICKED', 'IN_TRANSIT');
CREATE INDEX idx_unprocessed_prescriptions ON prescriptions(id) WHERE is_processed = FALSE;
```

## Migration Considerations

### 1. Data Type Mapping (NeDB to SQL)

| NeDB Type | PostgreSQL | SQLite |
|------------|------------|---------|
| String | VARCHAR(n) or TEXT | TEXT |
| Number | INTEGER, DECIMAL, NUMERIC | INTEGER, REAL |
| Boolean | BOOLEAN | INTEGER (0/1) |
| Date | TIMESTAMP, DATE | TEXT (ISO8601) |
| Array | JSONB | TEXT (JSON) |
| Object | JSONB | TEXT (JSON) |

### 2. Migration Strategy

1. **Schema Creation**: Create new SQL schema with all enhanced tables
2. **Data Export**: Export data from NeDB collections
3. **Data Transformation**: Transform data to match new schema
4. **Data Import**: Import transformed data into SQL tables
5. **Data Validation**: Verify data integrity and relationships
6. **Application Update**: Update application to use SQL database
7. **Testing**: Comprehensive testing of all functionality
8. **Deployment**: Gradual rollout with fallback option

### 3. Key Migration Challenges

1. **ID Generation**: NeDB uses timestamp-based IDs, SQL uses auto-increment
   - Solution: Maintain existing IDs as-is, use auto-increment for new records

2. **Nested Objects**: NeDB allows nested objects, SQL requires normalization
   - Solution: Flatten nested objects or use JSON columns

3. **Array Fields**: NeDB supports arrays, SQL requires separate tables or JSON
   - Solution: Use JSON columns or create junction tables

4. **Flexible Schema**: NeDB is schemaless, SQL requires fixed schema
   - Solution: Use JSON columns for flexible data, define core schema strictly

### 4. Synchronization Strategy for Multi-Store

1. **Conflict Resolution**: Implement last-write-wins with manual override options
2. **Incremental Sync**: Use timestamps and version numbers for efficient syncing
3. **Offline Queue**: Queue changes when offline, sync when connection restored
4. **Data Partitioning**: Partition data by store_id for better performance

## Conclusion

This comprehensive database design provides a robust foundation for PharmaSpot's enhanced features while maintaining compatibility with both PostgreSQL and SQLite. The schema supports:

- GST compliance and e-invoicing
- Advanced inventory management with batch tracking
- Pharmacy-specific features like prescription management
- Comprehensive reporting and analytics
- Enhanced customer experience features
- Multi-store support with offline capability

The design considers performance optimization through strategic indexing and provides a clear migration path from the existing NeDB implementation.

---

**Next Steps**:
1. Review and finalize the schema based on specific business requirements
2. Create migration scripts for existing data
3. Implement the database schema in the target database system
4. Update application code to work with the new schema
5. Conduct thorough testing before deployment