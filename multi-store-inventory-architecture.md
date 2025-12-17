# Multi-Store Inventory Management Architecture for PharmaSpot

## Executive Summary

This document outlines the comprehensive architecture design for extending PharmaSpot's current single-store inventory system to support multiple pharmacy locations. The design addresses database schema modifications, API endpoints, UI/UX considerations, technical implementation approaches, and integration points with existing modules.

### Key Requirements
- Existing data will be migrated to a default "Store 1"
- Each store maintains completely separate inventory for the same products
- Stores must operate offline for up to 24 hours
- Users need explicit permissions per store
- System must maintain data consistency across stores during synchronization

## 1. Database Schema Changes

### 1.1 Core Store Management

#### stores Table
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

-- Indexes
CREATE INDEX idx_store_active ON stores(is_active);
CREATE INDEX idx_store_type ON stores(store_type);
CREATE INDEX idx_store_parent ON stores(parent_store_id);
```

#### store_configurations Table
```sql
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
CREATE INDEX idx_store_config_store ON store_configurations(store_id);
CREATE INDEX idx_store_config_key ON store_configurations(config_key);
```

### 1.2 Enhanced Inventory Model with Store Support

#### Modified products Table
```sql
CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    sku VARCHAR(50) UNIQUE, -- Global SKU across all stores
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
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Indexes
CREATE INDEX idx_product_barcode ON products(barcode);
CREATE INDEX idx_product_sku ON products(sku);
CREATE INDEX idx_product_active ON products(is_active);
```

#### store_inventory Table (New)
```sql
CREATE TABLE store_inventory (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,
    min_stock INTEGER NOT NULL DEFAULT 0,
    max_stock INTEGER NOT NULL DEFAULT 0,
    reorder_quantity INTEGER NOT NULL DEFAULT 0,
    rack_location VARCHAR(50),
    shelf_location VARCHAR(50),
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (updated_by) REFERENCES users(id),
    UNIQUE(store_id, product_id)
);

-- Indexes
CREATE INDEX idx_store_inventory_store ON store_inventory(store_id);
CREATE INDEX idx_store_inventory_product ON store_inventory(product_id);
CREATE INDEX idx_store_inventory_low_stock ON store_inventory(store_id, quantity, min_stock);
```

#### store_product_pricing Table (New)
```sql
CREATE TABLE store_product_pricing (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    purchase_price DECIMAL(10,2) NOT NULL,
    selling_price DECIMAL(10,2) NOT NULL,
    mrp DECIMAL(10,2),
    gst_rate DECIMAL(5,2) DEFAULT 0.00,
    effective_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    UNIQUE(store_id, product_id, effective_date)
);

-- Indexes
CREATE INDEX idx_pricing_store_product ON store_product_pricing(store_id, product_id);
CREATE INDEX idx_pricing_effective_date ON store_product_pricing(effective_date);
```

### 1.3 Batch Management with Store Support

#### Modified product_batches Table
```sql
CREATE TABLE product_batches (
    id INTEGER PRIMARY KEY,
    store_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
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
    sync_version INTEGER DEFAULT 1,
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
    UNIQUE(store_id, product_id, batch_number)
);

-- Indexes
CREATE INDEX idx_batch_store_product ON product_batches(store_id, product_id);
CREATE INDEX idx_batch_expiry ON product_batches(expiry_date);
CREATE INDEX idx_batch_location ON product_batches(rack_location, shelf_location);
```

### 1.4 Inter-Store Transfer Management

#### inter_store_transfers Table
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

-- Indexes
CREATE INDEX idx_transfer_from_store ON inter_store_transfers(from_store_id);
CREATE INDEX idx_transfer_to_store ON inter_store_transfers(to_store_id);
CREATE INDEX idx_transfer_status ON inter_store_transfers(transfer_status);
CREATE INDEX idx_transfer_date ON inter_store_transfers(transfer_date);
```

#### inter_store_transfer_items Table
```sql
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
CREATE INDEX idx_transfer_items_transfer ON inter_store_transfer_items(transfer_id);
CREATE INDEX idx_transfer_items_product ON inter_store_transfer_items(product_id);
```

### 1.5 Data Synchronization Support

#### sync_logs Table
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

-- Indexes
CREATE INDEX idx_sync_log_store ON sync_logs(store_id);
CREATE INDEX idx_sync_log_status ON sync_logs(sync_status);
CREATE INDEX idx_sync_log_start_time ON sync_logs(start_time);
```

#### sync_queue Table
```sql
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
CREATE INDEX idx_sync_queue_store ON sync_queue(store_id);
CREATE INDEX idx_sync_queue_status ON sync_queue(sync_status);
CREATE INDEX idx_sync_queue_priority ON sync_queue(priority DESC);
CREATE INDEX idx_sync_queue_retry ON sync_queue(next_retry_at);
```

### 1.6 Enhanced User Management with Store Permissions

#### Modified users Table
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(15),
    role VARCHAR(20) DEFAULT 'STAFF', -- ADMIN, MANAGER, PHARMACIST, STAFF, CASHIER
    global_permissions TEXT, -- JSON with system-wide permissions
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP,
    login_attempts INTEGER DEFAULT 0,
    locked_until TIMESTAMP,
    password_changed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_user_username ON users(username);
CREATE INDEX idx_user_role ON users(role);
CREATE INDEX idx_user_active ON users(is_active);
```

#### user_store_permissions Table (New)
```sql
CREATE TABLE user_store_permissions (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    store_id INTEGER NOT NULL,
    permissions TEXT NOT NULL, -- JSON with store-specific permissions
    is_active BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (store_id) REFERENCES stores(id),
    FOREIGN KEY (assigned_by) REFERENCES users(id),
    UNIQUE(user_id, store_id)
);

-- Indexes
CREATE INDEX idx_user_store_user ON user_store_permissions(user_id);
CREATE INDEX idx_user_store_store ON user_store_permissions(store_id);
CREATE INDEX idx_user_store_active ON user_store_permissions(is_active);
```

### 1.7 Enhanced Transactions with Store Support

#### Modified transactions Table
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

-- Indexes
CREATE INDEX idx_transaction_store ON transactions(store_id);
CREATE INDEX idx_transaction_customer ON transactions(customer_id);
CREATE INDEX idx_transaction_user ON transactions(user_id);
CREATE INDEX idx_transaction_date ON transactions(transaction_date);
CREATE INDEX idx_transaction_status ON transactions(transaction_status);
CREATE INDEX idx_transaction_type ON transactions(transaction_type);
CREATE INDEX idx_transaction_number ON transactions(transaction_number);
```

### 1.8 Migration Strategy

#### Initial Migration Process
1. Create default "Store 1" with existing settings
2. Migrate existing inventory data to store_inventory table for Store 1
3. Migrate existing batch data to product_batches table for Store 1
4. Migrate existing transaction data with store_id = 1
5. Create user_store_permissions for existing users with Store 1 access
6. Update all existing records with appropriate store_id references

#### Data Migration Script
```sql
-- Create default store
INSERT INTO stores (id, store_code, store_name, address_line1, address_line2, city, state, pincode, phone, email, is_active)
SELECT 1, 'STORE001', 'Main Store', settings.address_one, settings.address_two, '', '', '', settings.contact, '', 1
FROM settings WHERE _id = 1;

-- Migrate inventory to store_inventory
INSERT INTO store_inventory (store_id, product_id, quantity, min_stock, max_stock, reorder_quantity, rack_location, shelf_location)
SELECT 1, _id, quantity, minStock, 0, 0, '', '' FROM inventory;

-- Migrate batches to product_batches
INSERT INTO product_batches (store_id, product_id, batch_number, expiry_date, manufacturing_date, initial_quantity, current_quantity, cost_price, selling_price, supplier_id, rack_location, shelf_location, is_active)
SELECT 1, productId, batchNumber, expiryDate, manufacturingDate, initialQuantity, currentQuantity, costPrice, sellingPrice, supplierId, rackLocation, shelfLocation, isActive FROM batches;

-- Migrate transactions
UPDATE transactions SET store_id = 1 WHERE store_id IS NULL;

-- Create user permissions for Store 1
INSERT INTO user_store_permissions (user_id, store_id, permissions, is_active, assigned_by)
SELECT _id, 1, '{"perm_products": 1, "perm_categories": 1, "perm_transactions": 1, "perm_users": 1, "perm_settings": 1}', 1, 1 FROM users;
```

## 2. API Endpoints Design

### 2.1 Store Management Endpoints

#### Store CRUD Operations
```javascript
// GET /api/stores - Get all stores
// GET /api/stores/:id - Get specific store
// POST /api/stores - Create new store
// PUT /api/stores/:id - Update store
// DELETE /api/stores/:id - Delete store (soft delete)
// GET /api/stores/:id/config - Get store configuration
// POST /api/stores/:id/config - Update store configuration
// GET /api/stores/active - Get all active stores
// POST /api/stores/:id/activate - Activate store
// POST /api/stores/:id/deactivate - Deactivate store
```

#### Store Configuration Management
```javascript
// GET /api/stores/:id/configurations - Get all configurations for a store
// GET /api/stores/:id/configurations/:key - Get specific configuration
// POST /api/stores/:id/configurations - Create/update configuration
// DELETE /api/stores/:id/configurations/:key - Delete configuration
```

### 2.2 Multi-Store Inventory Endpoints

#### Store-Specific Inventory Operations
```javascript
// GET /api/inventory/stores/:storeId/products - Get all products for a store
// GET /api/inventory/stores/:storeId/products/:productId - Get specific product in store
// POST /api/inventory/stores/:storeId/products - Add/update product in store
// PUT /api/inventory/stores/:storeId/products/:productId - Update product in store
// DELETE /api/inventory/stores/:storeId/products/:productId - Remove product from store
// GET /api/inventory/stores/:storeId/low-stock - Get low stock products for store
// GET /api/inventory/stores/:storeId/expiring - Get expiring products for store
```

#### Cross-Store Inventory Reporting
```javascript
// GET /api/inventory/cross-store/availability/:productId - Check product availability across all stores
// GET /api/inventory/cross-stock/summary - Get inventory summary across all stores
// GET /api/inventory/cross-store/movements/:productId - Track product movements between stores
// GET /api/inventory/cross-store/valuation - Get inventory valuation across all stores
```

### 2.3 Inter-Store Transfer Endpoints

#### Transfer Management
```javascript
// GET /api/transfers - Get all inter-store transfers
// GET /api/transfers/:id - Get specific transfer
// POST /api/transfers - Create new transfer request
// PUT /api/transfers/:id/approve - Approve transfer request
// PUT /api/transfers/:id/ship - Mark transfer as shipped
// PUT /api/transfers/:id/receive - Mark transfer as received
// PUT /api/transfers/:id/cancel - Cancel transfer
// GET /api/transfers/from/:storeId - Get transfers from specific store
// GET /api/transfers/to/:storeId - Get transfers to specific store
// GET /api/transfers/status/:status - Get transfers by status
```

#### Transfer Items Management
```javascript
// GET /api/transfers/:id/items - Get items in a transfer
// POST /api/transfers/:id/items - Add items to transfer
// PUT /api/transfers/:id/items/:itemId - Update transfer item
// DELETE /api/transfers/:id/items/:itemId - Remove item from transfer
```

### 2.4 Store-Specific Batch Management

#### Batch Operations per Store
```javascript
// GET /api/batches/stores/:storeId - Get all batches for a store
// GET /api/batches/stores/:storeId/products/:productId - Get batches for product in store
// POST /api/batches/stores/:storeId - Add new batch to store
// PUT /api/batches/stores/:storeId/:id - Update batch in store
// DELETE /api/batches/stores/:storeId/:id - Delete batch from store
// GET /api/batches/stores/:storeId/expiring - Get expiring batches for store
// GET /api/batches/stores/:storeId/expired - Get expired batches for store
```

### 2.5 Store-Specific Pricing Management

#### Pricing Operations
```javascript
// GET /api/pricing/stores/:storeId/products - Get pricing for all products in store
// GET /api/pricing/stores/:storeId/products/:productId - Get pricing for specific product
// POST /api/pricing/stores/:storeId/products - Set pricing for product in store
// PUT /api/pricing/stores/:storeId/products/:productId - Update pricing
// GET /api/pricing/stores/:storeId/products/:productId/history - Get pricing history
```

### 2.6 User Store Permissions

#### Permission Management
```javascript
// GET /api/users/:userId/stores - Get stores user has access to
// GET /api/users/:userId/stores/:storeId/permissions - Get user permissions for store
// POST /api/users/:userId/stores/:storeId/permissions - Grant store permissions to user
// PUT /api/users/:userId/stores/:storeId/permissions - Update store permissions
// DELETE /api/users/:userId/stores/:storeId/permissions - Revoke store permissions
// GET /api/stores/:storeId/users - Get users with access to store
// GET /api/stores/:storeId/users/:userId/permissions - Get permissions for user in store
```

### 2.7 Data Synchronization Endpoints

#### Sync Management
```javascript
// POST /api/sync/stores/:storeId/push - Push changes from store to central
// POST /api/sync/stores/:storeId/pull - Pull changes from central to store
// POST /api/sync/stores/:storeId/bidirectional - Perform bidirectional sync
// GET /api/sync/stores/:storeId/logs - Get sync logs for store
// GET /api/sync/stores/:storeId/queue - Get sync queue for store
// POST /api/sync/stores/:storeId/queue/clear - Clear sync queue for store
// GET /api/sync/status - Get overall sync status across all stores
```

## 3. UI/UX Considerations

### 3.1 Store Selection Interface

#### Global Store Selector
- **Location**: Top navigation bar, persistent across all pages
- **Design**: Dropdown with store name, code, and current status indicator
- **Functionality**: 
  - Quick store switching
  - Visual indicator for currently selected store
  - Store status (online/offline/syncing)
  - Search functionality for multiple stores

#### Store Dashboard
- **Multi-store overview**: Summary cards for each store
- **Key metrics**: Sales, inventory value, low stock alerts, pending transfers
- **Quick actions**: Switch to store, view reports, manage transfers
- **Visual indicators**: Color-coded status for each store

### 3.2 Inventory UI Modifications

#### Product Management with Store Context
- **Store-aware product listing**: Show inventory levels per store
- **Store-specific actions**: Edit inventory, pricing, batches for selected store
- **Cross-store comparison**: Side-by-side comparison of product across stores
- **Bulk operations**: Update pricing/inventory across multiple stores

#### Enhanced Batch Management
- **Store-specific batch view**: Filter batches by store
- **Cross-store batch transfers**: Move batches between stores
- **Expiry tracking by store**: Store-specific expiry alerts
- **Batch reconciliation**: Compare expected vs actual quantities per store

### 3.3 Stock Transfer Interface

#### Transfer Request Form
- **Source/Destination selection**: Store dropdowns with validation
- **Product search**: Multi-store product availability display
- **Batch selection**: Show available batches in source store
- **Quantity validation**: Prevent over-transfer from source store
- **Transfer notes**: Optional notes for transfer reason

#### Transfer Tracking Dashboard
- **Status visualization**: Kanban-style board (Pending → Approved → In Transit → Received)
- **Transfer details**: Expandable cards with full transfer information
- **Action buttons**: Approve, ship, receive, cancel based on user permissions
- **History tracking**: Complete audit trail of transfer activities

#### Transfer Confirmation Workflow
- **Receiving interface**: Scan/verify received items
- **Quantity discrepancy handling**: Report and resolve differences
- **Batch creation**: Automatically create new batches in destination store
- **Inventory updates**: Automatic inventory adjustment on both ends

### 3.4 Cross-Store Reporting Interface

#### Multi-Store Dashboard
- **Consolidated metrics**: Total sales, inventory value across all stores
- **Store comparison**: Performance comparison charts
- **Heat maps**: Geographic visualization of store performance
- **Drill-down capability**: From summary to detailed store-level data

#### Inventory Consolidation Reports
- **Product availability matrix**: Show product stock levels across all stores
- **Stock transfer suggestions**: AI-powered recommendations for balancing inventory
- **Expiry consolidation**: View expiring products across all stores
- **Valuation reports**: Total inventory value by store and product category

#### Transfer Analytics
- **Transfer frequency analysis**: Most commonly transferred products
- **Transfer efficiency metrics**: Time between request and completion
- **Cost analysis**: Transfer costs and savings
- **Seasonal patterns**: Transfer trends over time

### 3.5 User Permission Management UI

#### Store Access Management
- **User-Store matrix**: Grid view of user permissions across stores
- **Bulk permission assignment**: Grant access to multiple stores at once
- **Role-based templates**: Pre-defined permission sets for different roles
- **Permission inheritance**: Cascade permissions from parent to child stores

#### Context-Aware Interface
- **Store-specific branding**: Show store name/logo in header
- **Permission-based UI**: Hide/show features based on store permissions
- **Store-specific settings**: Context-sensitive settings panels
- **Audit trail display**: Show store-specific activity logs

## 4. Technical Implementation Approach

### 4.1 Data Consistency Strategy

#### Optimistic Concurrency Control
- **Version-based locking**: Use sync_version field for conflict detection
- **Last-write-wins with manual override**: Default conflict resolution with manual review option
- **Conflict resolution queue**: Queue unresolved conflicts for admin review
- **Change tracking**: Maintain detailed audit trails for all modifications

#### Transaction Isolation
- **Store-level transactions**: Ensure atomic operations within single store
- **Cross-store coordination**: Two-phase commit for inter-store operations
- **Rollback mechanisms**: Automatic rollback on failed operations
- **Compensation transactions**: Reverse operations when needed

### 4.2 Offline Operation Support

#### Local Data Caching
- **Store-specific local databases**: Complete data replication for each store
- **Change tracking**: Queue all changes while offline
- **Conflict detection**: Timestamp-based conflict resolution
- **Data validation**: Client-side validation before sync

#### Synchronization Mechanism
- **Incremental sync**: Transfer only changed data
- **Priority-based queuing**: Critical data synced first
- **Retry mechanisms**: Automatic retry with exponential backoff
- **Bandwidth optimization**: Compress and batch sync operations

### 4.3 API Architecture Modifications

#### Store Context Injection
```javascript
// Middleware to inject store context
app.use('/api', (req, res, next) => {
    const storeId = req.headers['x-store-id'] || req.user.defaultStoreId;
    req.storeId = storeId;
    next();
});

// Modified inventory endpoint with store context
app.get('/api/inventory/products', async (req, res) => {
    const { storeId } = req;
    const products = await inventoryService.getProductsByStore(storeId);
    res.json(products);
});
```

#### Service Layer Abstraction
```javascript
// Store-aware service layer
class InventoryService {
    async getProductsByStore(storeId, filters = {}) {
        return await storeInventoryRepository.findByStore(storeId, filters);
    }
    
    async updateProductInStore(storeId, productId, updates) {
        // Validate store permissions
        // Update store inventory
        // Queue for sync
        // Return result
    }
    
    async transferProduct(fromStoreId, toStoreId, productId, quantity) {
        // Create transfer record
        // Update source store inventory
        // Create pending inventory in destination
        // Queue sync operations
    }
}
```

### 4.4 Database Connection Management

#### Multi-Database Strategy
```javascript
// Database factory for store-specific connections
class DatabaseFactory {
    constructor() {
        this.storeConnections = new Map();
    }
    
    async getStoreConnection(storeId) {
        if (!this.storeConnections.has(storeId)) {
            const connection = await this.createStoreConnection(storeId);
            this.storeConnections.set(storeId, connection);
        }
        return this.storeConnections.get(storeId);
    }
    
    async createStoreConnection(storeId) {
        // Create store-specific database connection
        // Apply store-specific configurations
        // Set up connection pooling
    }
}
```

#### Connection Pooling
- **Store-specific pools**: Separate connection pools for each store
- **Dynamic pool sizing**: Adjust pool size based on store activity
- **Connection health monitoring**: Regular health checks and reconnection
- **Load balancing**: Distribute read operations across replicas

### 4.5 Caching Strategy

#### Multi-Level Caching
```javascript
// Store-aware caching
class CacheManager {
    constructor() {
        this.redis = new Redis();
        this.localCache = new Map();
    }
    
    async get(key, storeId) {
        const storeKey = `${storeId}:${key}`;
        
        // Try local cache first
        if (this.localCache.has(storeKey)) {
            return this.localCache.get(storeKey);
        }
        
        // Try Redis cache
        const cached = await this.redis.get(storeKey);
        if (cached) {
            this.localCache.set(storeKey, JSON.parse(cached));
            return JSON.parse(cached);
        }
        
        return null;
    }
    
    async set(key, storeId, value, ttl = 3600) {
        const storeKey = `${storeId}:${key}`;
        this.localCache.set(storeKey, value);
        await this.redis.setex(storeKey, ttl, JSON.stringify(value));
    }
}
```

#### Cache Invalidation
- **Store-specific invalidation**: Invalidate cache only for affected store
- **Tag-based invalidation**: Group related cache keys for bulk invalidation
- **Version-based invalidation**: Use version numbers to detect stale cache
- **Event-driven invalidation**: Automatic invalidation on data changes

## 5. Integration Points with Existing Modules

### 5.1 Transactions Module Integration

#### Store-Aware Transaction Processing
```javascript
// Modified transaction service
class TransactionService {
    async createTransaction(transactionData, storeId) {
        // Validate store permissions
        // Check inventory availability in store
        // Create transaction with store context
        // Update store inventory
        // Generate store-specific receipt
        // Queue for sync
    }
    
    async processReturn(transactionId, storeId) {
        // Validate return permissions for store
        // Update store inventory
        // Process refund with store-specific policies
        // Create return transaction
    }
}
```

#### Receipt and Invoice Generation
- **Store-specific branding**: Use store logo, address, and details
- **Store-specific tax calculations**: Apply store GST configurations
- **Store-specific numbering**: Use store-specific transaction numbering
- **Multi-store reporting**: Generate consolidated reports across stores

### 5.2 Purchase Orders Integration

#### Store-Specific Procurement
```javascript
// Enhanced purchase order service
class PurchaseOrderService {
    async createPurchaseOrder(orderData, storeId) {
        // Validate store procurement permissions
        // Check store-specific supplier relationships
        // Create purchase order for store
        // Update expected inventory for store
        // Generate store-specific purchase order
    }
    
    async receivePurchaseOrder(orderId, storeId) {
        // Validate receiving permissions
        // Update store inventory
        // Create store-specific batches
        // Update store financial records
    }
}
```

#### Supplier Management per Store
- **Store-specific suppliers**: Different suppliers for different stores
- **Centralized supplier catalog**: Shared supplier database
- **Store-specific pricing**: Different purchase prices per store
- **Consolidated ordering**: Group orders across stores for better pricing

### 5.3 Reports Module Integration

#### Multi-Store Reporting
```javascript
// Enhanced reporting service
class ReportingService {
    async generateStoreReport(reportType, storeId, parameters) {
        // Generate store-specific report
        // Apply store-specific filters
        // Use store-specific data
        // Format according to store preferences
    }
    
    async generateConsolidatedReport(reportType, storeIds, parameters) {
        // Aggregate data across multiple stores
        // Apply cross-store calculations
        // Generate consolidated insights
        // Format for multi-store analysis
    }
}
```

#### Cross-Store Analytics
- **Comparative analysis**: Performance comparison across stores
- **Trend analysis**: Identify trends across store network
- **Consolidated financials**: Combine financial data from all stores
- **Inventory optimization**: Analyze inventory distribution across stores

### 5.4 Settings Module Integration

#### Hierarchical Settings Management
```javascript
// Enhanced settings service
class SettingsService {
    async getStoreSetting(key, storeId) {
        // Check store-specific setting first
        // Fall back to global setting if not found
        // Apply inheritance rules
        // Return effective setting
    }
    
    async setStoreSetting(key, value, storeId) {
        // Validate setting permissions
        // Update store-specific setting
        // Invalidate relevant caches
        // Queue for sync if needed
    }
}
```

#### Configuration Inheritance
- **Global defaults**: Base settings applicable to all stores
- **Store overrides**: Store-specific settings that override globals
- **Inheritance rules**: Logical inheritance from parent to child stores
- **Validation rules**: Ensure setting consistency across stores

### 5.5 Backward Compatibility

#### Single-Store Operation Mode
```javascript
// Compatibility layer for single-store operations
class CompatibilityService {
    constructor() {
        this.isMultiStore = this.checkMultiStoreMode();
    }
    
    async getProducts(filters = {}) {
        if (this.isMultiStore) {
            const storeId = this.getCurrentStoreId();
            return await this.inventoryService.getProductsByStore(storeId, filters);
        } else {
            return await this.inventoryService.getAllProducts(filters);
        }
    }
    
    async createTransaction(transactionData) {
        if (this.isMultiStore) {
            const storeId = this.getCurrentStoreId();
            return await this.transactionService.createTransaction(transactionData, storeId);
        } else {
            return await this.transactionService.createTransaction(transactionData);
        }
    }
}
```

#### Migration Support
- **Gradual migration**: Allow phased rollout of multi-store features
- **Feature flags**: Enable/disable multi-store functionality
- **Data migration tools**: Automated migration from single to multi-store
- **Rollback capability**: Ability to revert to single-store mode if needed

## 6. Security Considerations

### 6.1 Store-Based Access Control

#### Permission Framework
```javascript
// Store-aware permission system
class PermissionService {
    async checkUserPermission(userId, storeId, permission) {
        // Check global permissions first
        // Check store-specific permissions
        // Apply role-based rules
        // Consider time-based restrictions
        // Return permission result
    }
    
    async grantStorePermission(userId, storeId, permissions) {
        // Validate permission assignment
        // Create store permission record
        // Update user session
        // Log permission change
    }
}
```

#### Security Layers
- **Authentication**: Verify user identity across all stores
- **Authorization**: Check store-specific permissions
- **Data isolation**: Ensure users only see authorized store data
- **Audit logging**: Track all access and modifications

### 6.2 Data Protection

#### Encryption Strategy
- **Data at rest**: Encrypt sensitive store data
- **Data in transit**: Use TLS for all communications
- **Key management**: Store-specific encryption keys
- **Access logging**: Track all data access attempts

#### Compliance Requirements
- **GST compliance**: Store-specific GST configurations
- **Drug regulations**: Store-specific compliance rules
- **Data retention**: Store-specific retention policies
- **Audit trails**: Complete audit trails for each store

## 7. Performance Optimization

### 7.1 Database Optimization

#### Indexing Strategy
- **Store-specific indexes**: Optimize queries for each store
- **Composite indexes**: Multi-column indexes for common queries
- **Partitioning**: Partition large tables by store_id
- **Query optimization**: Store-specific query optimization

#### Connection Management
- **Connection pooling**: Efficient connection reuse
- **Load balancing**: Distribute read operations
- **Failover handling**: Automatic failover for store databases
- **Performance monitoring**: Track database performance per store

### 7.2 Caching Optimization

#### Multi-Level Caching
- **Application cache**: In-memory cache for frequently accessed data
- **Redis cache**: Distributed cache for shared data
- **CDN cache**: Cache static assets and reports
- **Database cache**: Query result caching

#### Cache Strategies
- **Store isolation**: Separate cache namespaces per store
- **Cache warming**: Pre-populate cache with expected data
- **Cache invalidation**: Intelligent invalidation strategies
- **Cache monitoring**: Track cache hit rates and performance

## 8. Monitoring and Maintenance

### 8.1 System Monitoring

#### Health Checks
```javascript
// Store health monitoring
class HealthMonitor {
    async checkStoreHealth(storeId) {
        const checks = [
            this.checkDatabaseConnection(storeId),
            this.checkSyncStatus(storeId),
            this.checkDiskSpace(storeId),
            this.checkMemoryUsage(storeId),
            this.checkNetworkConnectivity(storeId)
        ];
        
        const results = await Promise.allSettled(checks);
        return this.aggregateHealthResults(results);
    }
    
    async getSystemHealth() {
        const stores = await this.getAllStores();
        const healthChecks = await Promise.all(
            stores.map(store => this.checkStoreHealth(store.id))
        );
        
        return this.generateSystemHealthReport(healthChecks);
    }
}
```

#### Alerting System
- **Store-specific alerts**: Individual store monitoring
- **System-wide alerts**: Cross-store issue detection
- **Performance alerts**: Performance degradation detection
- **Automated responses**: Automatic remediation actions

### 8.2 Maintenance Procedures

#### Regular Maintenance
- **Database optimization**: Regular index rebuilding and statistics
- **Cache cleanup**: Remove expired cache entries
- **Log rotation**: Manage log file sizes
- **Backup verification**: Verify backup integrity

#### Update Management
- **Rolling updates**: Update stores one at a time
- **Zero-downtime deployment**: Maintain availability during updates
- **Rollback capability**: Quick rollback if issues arise
- **Update verification**: Verify successful updates

## 9. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)
1. **Database Schema Implementation**
   - Create new multi-store tables
   - Implement migration scripts
   - Set up store-specific indexes
   - Test data migration

2. **Core API Development**
   - Implement store management endpoints
   - Create store-aware inventory APIs
   - Develop user permission system
   - Build basic sync framework

### Phase 2: Core Features (Weeks 5-8)
1. **Store Management UI**
   - Store creation and configuration
   - User permission management
   - Store switching interface
   - Basic multi-store dashboard

2. **Inventory Management**
   - Store-specific inventory operations
   - Cross-store inventory views
   - Batch management per store
   - Store-specific pricing

### Phase 3: Advanced Features (Weeks 9-12)
1. **Inter-Store Transfers**
   - Transfer request workflow
   - Transfer tracking interface
   - Automated inventory updates
   - Transfer reporting

2. **Synchronization System**
   - Offline operation support
   - Conflict resolution mechanisms
   - Sync monitoring dashboard
   - Performance optimization

### Phase 4: Integration & Testing (Weeks 13-16)
1. **Module Integration**
   - Transactions module integration
   - Purchase orders integration
   - Reports module integration
   - Settings module integration

2. **Testing & Deployment**
   - Comprehensive testing
   - Performance optimization
   - Security validation
   - Production deployment

## 10. Conclusion

This comprehensive architecture design provides a robust foundation for extending PharmaSpot's inventory management to support multiple pharmacy locations. The design addresses:

- **Scalability**: Supports growth from single store to large chains
- **Data Consistency**: Ensures data integrity across all stores
- **Offline Operation**: Allows stores to operate independently for up to 24 hours
- **Security**: Implements store-based access control and data protection
- **Performance**: Optimizes for multi-store operations and reporting
- **Backward Compatibility**: Maintains compatibility with existing single-store operations

The modular approach allows for phased implementation, reducing risk and enabling gradual rollout of features. The architecture is designed to accommodate future enhancements and changing business requirements while maintaining system stability and performance.

---

**Next Steps**:
1. Review and approve this architecture design
2. Create detailed implementation plans for each phase
3. Set up development environments for multi-store testing
4. Begin implementation with Phase 1 foundation components
5. Establish testing protocols for multi-store functionality