const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const validator = require("validator");
const sqliteDBManager = require('./sqlite-db-manager');

router.use(bodyParser.json());
module.exports = router;

let dbInitialized = false;

/**
 * Initialize database connection
 */
async function initializeDatabase() {
    if (dbInitialized) return;
    
    try {
        // Ensure SQLite database is initialized
        const db = sqliteDBManager.getDatabase();
        if (!db) {
            await sqliteDBManager.initialize();
        }
        
        // Verify tables exist
        const tableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='purchase_orders'
        `);
        
        if (!tableExists) {
            console.log("Purchase orders table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS purchase_orders (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    order_number VARCHAR(50) UNIQUE NOT NULL,
                    supplier_id INTEGER NOT NULL,
                    order_date DATE NOT NULL,
                    expected_delivery_date DATE,
                    status VARCHAR(20) DEFAULT 'PENDING',
                    subtotal DECIMAL(12,2) NOT NULL,
                    gst_amount DECIMAL(12,2) DEFAULT 0.00,
                    total_amount DECIMAL(12,2) NOT NULL,
                    discount_amount DECIMAL(12,2) DEFAULT 0.00,
                    notes TEXT,
                    created_by VARCHAR(50),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `);
            
            // Create indexes for better performance
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_number ON purchase_orders(order_number)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date)');
        }
        
        // Check if purchase_order_items table exists
        const itemsTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='purchase_order_items'
        `);
        
        if (!itemsTableExists) {
            console.log("Purchase order items table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS purchase_order_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    purchase_order_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    batch_number VARCHAR(50),
                    quantity INTEGER NOT NULL,
                    unit_price DECIMAL(10,2) NOT NULL,
                    gst_rate DECIMAL(5,2) DEFAULT 0.00,
                    discount_percent DECIMAL(5,2) DEFAULT 0.00,
                    discount_amount DECIMAL(8,2) DEFAULT 0.00,
                    total_price DECIMAL(12,2) NOT NULL,
                    received_quantity INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
                    FOREIGN KEY (product_id) REFERENCES products(id)
                )
            `);
            
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(purchase_order_id)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON purchase_order_items(product_id)');
        }
        
        // Check if supplier_invoices table exists
        const invoicesTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='supplier_invoices'
        `);
        
        if (!invoicesTableExists) {
            console.log("Supplier invoices table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS supplier_invoices (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    invoice_number VARCHAR(50) UNIQUE NOT NULL,
                    purchase_order_id INTEGER,
                    supplier_id INTEGER NOT NULL,
                    invoice_date DATE NOT NULL,
                    due_date DATE,
                    subtotal DECIMAL(12,2) NOT NULL,
                    gst_amount DECIMAL(12,2) DEFAULT 0.00,
                    total_amount DECIMAL(12,2) NOT NULL,
                    discount_amount DECIMAL(12,2) DEFAULT 0.00,
                    balance_amount DECIMAL(12,2) NOT NULL,
                    status VARCHAR(20) DEFAULT 'PENDING',
                    notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id),
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
                )
            `);
        }
        
        // Check if supplier_invoice_items table exists
        const invoiceItemsTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='supplier_invoice_items'
        `);
        
        if (!invoiceItemsTableExists) {
            console.log("Supplier invoice items table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS supplier_invoice_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    supplier_invoice_id INTEGER NOT NULL,
                    product_id INTEGER NOT NULL,
                    description TEXT,
                    quantity INTEGER NOT NULL,
                    unit_price DECIMAL(10,2) NOT NULL,
                    gst_rate DECIMAL(5,2) DEFAULT 0.00,
                    discount_amount DECIMAL(8,2) DEFAULT 0.00,
                    total_price DECIMAL(12,2) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (supplier_invoice_id) REFERENCES supplier_invoices(id),
                    FOREIGN KEY (product_id) REFERENCES products(id)
                )
            `);
        }
        
        dbInitialized = true;
        console.log("Purchase orders SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize purchase orders SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in purchase orders module:", err);
});

/**
 * Helper function to generate unique order number
 */
function generateOrderNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = date.getTime();
    
    return `PO${year}${month}${day}${time.toString().slice(-6)}`;
}

/**
 * Helper function to generate unique invoice number
 */
function generateInvoiceNumber(type) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = date.getTime();
    
    const prefix = type === 'SUPPLIER' ? 'SINV' : 'CINV';
    return `${prefix}${year}${month}${day}${time.toString().slice(-6)}`;
}

/**
 * GET endpoint: Get welcome message for Purchase Orders API.
 */
router.get("/", function (req, res) {
    res.send("Purchase Orders API (SQLite)");
});

/**
 * GET endpoint: Retrieve purchase orders with pagination.
 */
router.get("/", async function (req, res) {
    try {
        await initializeDatabase();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // Build query based on filters
        let whereClause = "WHERE 1=1";
        let params = [];
        
        if (req.query.supplierId) {
            whereClause += " AND po.supplier_id = ?";
            params.push(parseInt(req.query.supplierId));
        }
        if (req.query.status) {
            whereClause += " AND po.status = ?";
            params.push(validator.escape(req.query.status));
        }
        if (req.query.startDate && req.query.endDate) {
            whereClause += " AND po.order_date BETWEEN ? AND ?";
            params.push(validator.escape(req.query.startDate), validator.escape(req.query.endDate));
        }
        
        // Get purchase orders with supplier information
        const purchaseOrders = await sqliteDBManager.all(`
            SELECT po.*, s.name as supplier_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            ${whereClause}
            ORDER BY po.order_date DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        // Get total count for pagination
        const countResult = await sqliteDBManager.get(`
            SELECT COUNT(*) as total
            FROM purchase_orders po
            ${whereClause}
        `, params);
        
        res.json({
            purchaseOrders: purchaseOrders,
            pagination: {
                total: countResult.total,
                page: page,
                limit: limit,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        console.error("Error getting purchase orders:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create new purchase order.
 */
router.post("/", async function (req, res) {
    try {
        await initializeDatabase();
        
        // Validate required fields
        if (!req.body.supplierId || !req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Supplier ID and items array are required fields.",
            });
        }
        
        // Validate items
        for (let i = 0; i < req.body.items.length; i++) {
            const item = req.body.items[i];
            if (!item.productId || !item.quantity || !item.unitPrice) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: `Item ${i + 1} is missing required fields (productId, quantity, unitPrice).`,
                });
            }
        }
        
        // Check if supplier exists
        const supplier = await sqliteDBManager.get(`
            SELECT id FROM suppliers WHERE id = ?
        `, [parseInt(req.body.supplierId)]);
        
        if (!supplier) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier not found.",
            });
        }
        
        // Generate unique order number
        const orderNumber = generateOrderNumber();
        
        // Calculate totals
        let subtotal = 0;
        let totalGst = 0;
        
        req.body.items.forEach(function(item) {
            const itemTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
            const itemGst = itemTotal * (parseFloat(item.gstRate || 0) / 100);
            subtotal += itemTotal;
            totalGst += itemGst;
        });
        
        const discountAmount = parseFloat(req.body.discountAmount) || 0;
        const totalAmount = subtotal + totalGst - discountAmount;
        
        // Create purchase order
        const result = await sqliteDBManager.run(`
            INSERT INTO purchase_orders (
                order_number, supplier_id, order_date, expected_delivery_date,
                status, subtotal, gst_amount, total_amount, discount_amount,
                notes, created_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            orderNumber,
            parseInt(req.body.supplierId),
            req.body.orderDate || new Date().toISOString().split('T')[0],
            req.body.expectedDeliveryDate || null,
            'PENDING',
            parseFloat(subtotal.toFixed(2)),
            parseFloat(totalGst.toFixed(2)),
            parseFloat(totalAmount.toFixed(2)),
            parseFloat(discountAmount.toFixed(2)),
            req.body.notes ? validator.escape(req.body.notes) : null,
            req.body.createdBy ? validator.escape(req.body.createdBy) : null,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        const purchaseOrderId = result.lastID;
        
        // Create purchase order items
        const createdItems = [];
        for (const itemData of req.body.items) {
            const itemTotal = parseFloat(itemData.unitPrice) * parseInt(itemData.quantity);
            const itemGst = itemTotal * (parseFloat(itemData.gstRate || 0) / 100);
            const totalPrice = itemTotal + itemGst - (parseFloat(itemData.discountAmount) || 0);
            
            const itemResult = await sqliteDBManager.run(`
                INSERT INTO purchase_order_items (
                    purchase_order_id, product_id, batch_number, quantity,
                    unit_price, gst_rate, discount_percent, discount_amount,
                    total_price, received_quantity, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                purchaseOrderId,
                parseInt(itemData.productId),
                itemData.batchNumber ? validator.escape(itemData.batchNumber) : null,
                parseInt(itemData.quantity),
                parseFloat(itemData.unitPrice),
                parseFloat(itemData.gstRate) || 0,
                parseFloat(itemData.discountPercent) || 0,
                parseFloat(itemData.discountAmount) || 0,
                parseFloat(totalPrice.toFixed(2)),
                0,
                new Date().toISOString()
            ]);
            
            createdItems.push({
                id: itemResult.lastID,
                ...itemData,
                totalPrice: parseFloat(totalPrice.toFixed(2))
            });
        }
        
        res.status(201).json({
            id: purchaseOrderId,
            orderNumber: orderNumber,
            supplierId: parseInt(req.body.supplierId),
            orderDate: req.body.orderDate || new Date().toISOString().split('T')[0],
            expectedDeliveryDate: req.body.expectedDeliveryDate || null,
            status: 'PENDING',
            subtotal: parseFloat(subtotal.toFixed(2)),
            gstAmount: parseFloat(totalGst.toFixed(2)),
            totalAmount: parseFloat(totalAmount.toFixed(2)),
            discountAmount: parseFloat(discountAmount.toFixed(2)),
            notes: req.body.notes ? validator.escape(req.body.notes) : null,
            createdBy: req.body.createdBy ? validator.escape(req.body.createdBy) : null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: createdItems
        });
    } catch (error) {
        console.error("Error creating purchase order:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get specific purchase order by ID.
 */
router.get("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const orderId = parseInt(req.params.id);
        
        // Get purchase order with supplier information
        const purchaseOrder = await sqliteDBManager.get(`
            SELECT po.*, s.name as supplier_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.id = ?
        `, [orderId]);
        
        if (!purchaseOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order not found.",
            });
        }
        
        // Get purchase order items
        const items = await sqliteDBManager.all(`
            SELECT poi.*, p.name as product_name, p.sku
            FROM purchase_order_items poi
            LEFT JOIN products p ON poi.product_id = p.id
            WHERE poi.purchase_order_id = ?
            ORDER BY poi.id
        `, [orderId]);
        
        res.json({
            ...purchaseOrder,
            items: items
        });
    } catch (error) {
        console.error("Error getting purchase order:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update purchase order.
 */
router.put("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const orderId = parseInt(req.params.id);
        
        // Check if purchase order exists
        const existingOrder = await sqliteDBManager.get(`
            SELECT id, status FROM purchase_orders WHERE id = ?
        `, [orderId]);
        
        if (!existingOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order not found.",
            });
        }
        
        // Cannot update received or cancelled orders
        if (existingOrder.status === 'RECEIVED' || existingOrder.status === 'CANCELLED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot update a purchase order that has been received or cancelled.",
            });
        }
        
        // Validate items if provided
        if (req.body.items && Array.isArray(req.body.items)) {
            for (let i = 0; i < req.body.items.length; i++) {
                const item = req.body.items[i];
                if (!item.productId || !item.quantity || !item.unitPrice) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: `Item ${i + 1} is missing required fields (productId, quantity, unitPrice).`,
                    });
                }
            }
        }
        
        // Calculate totals if items are provided
        let subtotal = existingOrder.subtotal;
        let totalGst = existingOrder.gst_amount;
        let totalAmount = existingOrder.total_amount;
        
        if (req.body.items && Array.isArray(req.body.items)) {
            subtotal = 0;
            totalGst = 0;
            
            req.body.items.forEach(function(item) {
                const itemTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
                const itemGst = itemTotal * (parseFloat(item.gstRate || 0) / 100);
                subtotal += itemTotal;
                totalGst += itemGst;
            });
            
            const discountAmount = parseFloat(req.body.discountAmount) || existingOrder.discount_amount;
            totalAmount = subtotal + totalGst - discountAmount;
        }
        
        // Update purchase order
        await sqliteDBManager.run(`
            UPDATE purchase_orders SET
                supplier_id = ?, order_date = ?, expected_delivery_date = ?,
                status = ?, subtotal = ?, gst_amount = ?, total_amount = ?,
                discount_amount = ?, notes = ?, updated_at = ?
            WHERE id = ?
        `, [
            req.body.supplierId !== undefined ? parseInt(req.body.supplierId) : null,
            req.body.orderDate !== undefined ? validator.escape(req.body.orderDate) : null,
            req.body.expectedDeliveryDate !== undefined ? validator.escape(req.body.expectedDeliveryDate) : null,
            req.body.status !== undefined ? validator.escape(req.body.status) : null,
            parseFloat(subtotal.toFixed(2)),
            parseFloat(totalGst.toFixed(2)),
            parseFloat(totalAmount.toFixed(2)),
            req.body.discountAmount !== undefined ? parseFloat(req.body.discountAmount) : null,
            req.body.notes !== undefined ? validator.escape(req.body.notes) : null,
            new Date().toISOString(),
            orderId
        ]);
        
        // Update items if provided
        let items = [];
        if (req.body.items && Array.isArray(req.body.items)) {
            // Remove existing items
            await sqliteDBManager.run(`
                DELETE FROM purchase_order_items WHERE purchase_order_id = ?
            `, [orderId]);
            
            // Create new items
            for (const itemData of req.body.items) {
                const itemTotal = parseFloat(itemData.unitPrice) * parseInt(itemData.quantity);
                const itemGst = itemTotal * (parseFloat(itemData.gstRate || 0) / 100);
                const totalPrice = itemTotal + itemGst - (parseFloat(itemData.discountAmount) || 0);
                
                const itemResult = await sqliteDBManager.run(`
                    INSERT INTO purchase_order_items (
                        purchase_order_id, product_id, batch_number, quantity,
                        unit_price, gst_rate, discount_percent, discount_amount,
                        total_price, received_quantity, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    orderId,
                    parseInt(itemData.productId),
                    itemData.batchNumber ? validator.escape(itemData.batchNumber) : null,
                    parseInt(itemData.quantity),
                    parseFloat(itemData.unitPrice),
                    parseFloat(itemData.gstRate) || 0,
                    parseFloat(itemData.discountPercent) || 0,
                    parseFloat(itemData.discountAmount) || 0,
                    parseFloat(totalPrice.toFixed(2)),
                    0,
                    new Date().toISOString()
                ]);
                
                items.push({
                    id: itemResult.lastID,
                    ...itemData,
                    totalPrice: parseFloat(totalPrice.toFixed(2))
                });
            }
        } else {
            // Get existing items
            items = await sqliteDBManager.all(`
                SELECT poi.*, p.name as product_name, p.sku
                FROM purchase_order_items poi
                LEFT JOIN products p ON poi.product_id = p.id
                WHERE poi.purchase_order_id = ?
                ORDER BY poi.id
            `, [orderId]);
        }
        
        // Return updated purchase order
        const updatedOrder = await sqliteDBManager.get(`
            SELECT po.*, s.name as supplier_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.id = ?
        `, [orderId]);
        
        res.json({
            ...updatedOrder,
            items: items
        });
    } catch (error) {
        console.error("Error updating purchase order:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete purchase order.
 */
router.delete("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const orderId = parseInt(req.params.id);
        
        // Check if purchase order exists
        const purchaseOrder = await sqliteDBManager.get(`
            SELECT id, status FROM purchase_orders WHERE id = ?
        `, [orderId]);
        
        if (!purchaseOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order not found.",
            });
        }
        
        // Cannot delete received orders
        if (purchaseOrder.status === 'RECEIVED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete a purchase order that has been received. Cancel it instead.",
            });
        }
        
        // Delete purchase order items first
        await sqliteDBManager.run(`
            DELETE FROM purchase_order_items WHERE purchase_order_id = ?
        `, [orderId]);
        
        // Delete purchase order
        await sqliteDBManager.run(`
            DELETE FROM purchase_orders WHERE id = ?
        `, [orderId]);
        
        res.json({ message: "Purchase order deleted successfully." });
    } catch (error) {
        console.error("Error deleting purchase order:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Mark purchase order as received.
 */
router.post("/:id/receive", async function (req, res) {
    try {
        await initializeDatabase();
        const orderId = parseInt(req.params.id);
        
        // Check if purchase order exists
        const purchaseOrder = await sqliteDBManager.get(`
            SELECT id, status FROM purchase_orders WHERE id = ?
        `, [orderId]);
        
        if (!purchaseOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order not found.",
            });
        }
        
        if (purchaseOrder.status === 'RECEIVED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Purchase order has already been received.",
            });
        }
        
        if (purchaseOrder.status === 'CANCELLED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot receive a cancelled purchase order.",
            });
        }
        
        // Update status to received
        await sqliteDBManager.run(`
            UPDATE purchase_orders SET
                status = 'RECEIVED', updated_at = ?
            WHERE id = ?
        `, [new Date().toISOString(), orderId]);
        
        // Update inventory with received items
        const items = await sqliteDBManager.all(`
            SELECT * FROM purchase_order_items WHERE purchase_order_id = ?
        `, [orderId]);
        
        for (const item of items) {
            // Update product batches if batch number is provided
            if (item.batch_number) {
                // Check if batch already exists
                const existingBatch = await sqliteDBManager.get(`
                    SELECT id, current_quantity FROM product_batches 
                    WHERE product_id = ? AND batch_number = ?
                `, [item.product_id, item.batch_number]);
                
                if (existingBatch) {
                    // Update existing batch quantity
                    await sqliteDBManager.run(`
                        UPDATE product_batches SET
                            current_quantity = current_quantity + ?
                        WHERE id = ?
                    `, [item.quantity, existingBatch.id]);
                } else {
                    // Create new batch
                    await sqliteDBManager.run(`
                        INSERT INTO product_batches (
                            product_id, batch_number, initial_quantity, current_quantity,
                            cost_price, created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    `, [
                        item.product_id,
                        item.batch_number,
                        item.quantity,
                        item.quantity,
                        item.unit_price,
                        new Date().toISOString(),
                        new Date().toISOString()
                    ]);
                }
            }
            
            // Update store inventory
            const storeInventory = await sqliteDBManager.get(`
                SELECT id, quantity FROM store_inventory 
                WHERE product_id = ? AND store_id = 1
            `, [item.product_id]);
            
            if (storeInventory) {
                // Update existing inventory
                await sqliteDBManager.run(`
                    UPDATE store_inventory SET
                        quantity = quantity + ?, last_updated = ?
                    WHERE id = ?
                `, [item.quantity, new Date().toISOString(), storeInventory.id]);
            } else {
                // Create new inventory record
                await sqliteDBManager.run(`
                    INSERT INTO store_inventory (
                        product_id, store_id, quantity, last_updated, updated_by
                    ) VALUES (?, 1, ?, ?, 'system')
                `, [item.product_id, item.quantity, new Date().toISOString()]);
            }
            
            // Update purchase order item received quantity
            await sqliteDBManager.run(`
                UPDATE purchase_order_items SET
                    received_quantity = ?
                WHERE id = ?
            `, [item.quantity, item.id]);
        }
        
        // Create supplier invoice
        const invoiceNumber = generateInvoiceNumber('SUPPLIER');
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 30); // Default 30 days
        
        await sqliteDBManager.run(`
            INSERT INTO supplier_invoices (
                invoice_number, purchase_order_id, supplier_id, invoice_date,
                due_date, subtotal, gst_amount, total_amount,
                discount_amount, balance_amount, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
        `, [
            invoiceNumber,
            orderId,
            purchaseOrder.supplier_id,
            new Date().toISOString().split('T')[0],
            dueDate.toISOString().split('T')[0],
            purchaseOrder.subtotal,
            purchaseOrder.gst_amount,
            purchaseOrder.total_amount,
            purchaseOrder.discount_amount,
            purchaseOrder.total_amount,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        res.json({ message: "Purchase order marked as received successfully." });
    } catch (error) {
        console.error("Error receiving purchase order:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Cancel purchase order.
 */
router.post("/:id/cancel", async function (req, res) {
    try {
        await initializeDatabase();
        const orderId = parseInt(req.params.id);
        
        // Check if purchase order exists
        const purchaseOrder = await sqliteDBManager.get(`
            SELECT id, status FROM purchase_orders WHERE id = ?
        `, [orderId]);
        
        if (!purchaseOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order not found.",
            });
        }
        
        if (purchaseOrder.status === 'CANCELLED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Purchase order has already been cancelled.",
            });
        }
        
        if (purchaseOrder.status === 'RECEIVED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot cancel a purchase order that has been received.",
            });
        }
        
        // Update status to cancelled
        await sqliteDBManager.run(`
            UPDATE purchase_orders SET
                status = 'CANCELLED', updated_at = ?
            WHERE id = ?
        `, [new Date().toISOString(), orderId]);
        
        res.json({ message: "Purchase order cancelled successfully." });
    } catch (error) {
        console.error("Error cancelling purchase order:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get orders by status.
 */
router.get("/status/:status", async function (req, res) {
    try {
        await initializeDatabase();
        const status = validator.escape(req.params.status);
        
        const orders = await sqliteDBManager.all(`
            SELECT po.*, s.name as supplier_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.status = ?
            ORDER BY po.order_date DESC
        `, [status]);
        
        res.json(orders);
    } catch (error) {
        console.error("Error getting orders by status:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get automated purchase orders.
 */
router.get("/automated", async function (req, res) {
    try {
        await initializeDatabase();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // Build query based on filters
        let whereClause = "WHERE po.notes LIKE '%AUTOMATED%'";
        let params = [];
        
        if (req.query.supplierId) {
            whereClause += " AND po.supplier_id = ?";
            params.push(parseInt(req.query.supplierId));
        }
        if (req.query.status) {
            whereClause += " AND po.status = ?";
            params.push(validator.escape(req.query.status));
        }
        if (req.query.startDate && req.query.endDate) {
            whereClause += " AND po.order_date BETWEEN ? AND ?";
            params.push(validator.escape(req.query.startDate), validator.escape(req.query.endDate));
        }
        
        const orders = await sqliteDBManager.all(`
            SELECT po.*, s.name as supplier_name
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            ${whereClause}
            ORDER BY po.order_date DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        const countResult = await sqliteDBManager.get(`
            SELECT COUNT(*) as total
            FROM purchase_orders po
            ${whereClause}
        `, params);
        
        res.json({
            purchaseOrders: orders,
            pagination: {
                total: countResult.total,
                page: page,
                limit: limit,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        console.error("Error getting automated purchase orders:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Approve automated purchase order.
 */
router.post("/:id/approve", async function (req, res) {
    try {
        await initializeDatabase();
        const orderId = parseInt(req.params.id);
        
        // Check if purchase order exists
        const purchaseOrder = await sqliteDBManager.get(`
            SELECT id, status, notes FROM purchase_orders WHERE id = ?
        `, [orderId]);
        
        if (!purchaseOrder) {
            return res.status(404).json({
                error: "Not Found",
                message: "Purchase order not found.",
            });
        }
        
        // Check if it's an automated PO
        if (!purchaseOrder.notes || !purchaseOrder.notes.includes('AUTOMATED')) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Only automated purchase orders can be approved through this endpoint.",
            });
        }
        
        // Update status to approved
        await sqliteDBManager.run(`
            UPDATE purchase_orders SET
                status = 'APPROVED', updated_at = ?
            WHERE id = ?
        `, [new Date().toISOString(), orderId]);
        
        res.json({
            message: "Automated purchase order approved successfully.",
            purchaseOrder: {
                id: orderId,
                status: 'APPROVED',
                approvedBy: req.body.approvedBy || 'MANUAL',
                approvedAt: new Date()
            }
        });
    } catch (error) {
        console.error("Error approving purchase order:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});