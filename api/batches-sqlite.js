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
            WHERE type='table' AND name='product_batches'
        `);
        
        if (!tableExists) {
            console.log("Product batches table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS product_batches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (product_id) REFERENCES products(id),
                    FOREIGN KEY (store_id) REFERENCES stores(id),
                    FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
                    UNIQUE(product_id, store_id, batch_number)
                )
            `);
            
            // Create indexes for better performance
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_product_batches_product_id ON product_batches(product_id)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_product_batches_store_id ON product_batches(store_id)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_product_batches_batch_number ON product_batches(batch_number)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_product_batches_expiry_date ON product_batches(expiry_date)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_product_batches_supplier_id ON product_batches(supplier_id)');
        }
        
        // Check if batch_movements table exists
        const movementsTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='batch_movements'
        `);
        
        if (!movementsTableExists) {
            console.log("Batch movements table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS batch_movements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    batch_id INTEGER NOT NULL,
                    movement_type VARCHAR(50) NOT NULL,
                    quantity INTEGER NOT NULL,
                    reference_type VARCHAR(50),
                    reference_id INTEGER,
                    previous_quantity INTEGER,
                    new_quantity INTEGER,
                    notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (batch_id) REFERENCES product_batches(id)
                )
            `);
            
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_batch_movements_batch_id ON batch_movements(batch_id)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_batch_movements_movement_type ON batch_movements(movement_type)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_batch_movements_created_at ON batch_movements(created_at)');
        }
        
        dbInitialized = true;
        console.log("Batches SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize batches SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in batches module:", err);
});

/**
 * GET endpoint: Get welcome message for Batches API.
 */
router.get("/", function (req, res) {
    res.send("Batches API (SQLite)");
});

/**
 * GET endpoint: Retrieve batch records with pagination.
 */
router.get("/", async function (req, res) {
    try {
        await initializeDatabase();
        
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // Build query based on filters
        let whereClause = "WHERE pb.is_active = 1";
        let params = [];
        
        if (req.query.productId) {
            whereClause += " AND pb.product_id = ?";
            params.push(parseInt(req.query.productId));
        }
        if (req.query.supplierId) {
            whereClause += " AND pb.supplier_id = ?";
            params.push(parseInt(req.query.supplierId));
        }
        if (req.query.storeId) {
            whereClause += " AND pb.store_id = ?";
            params.push(parseInt(req.query.storeId));
        }
        
        // Get batches with product information
        const batches = await sqliteDBManager.all(`
            SELECT pb.*, p.name as product_name, p.sku, s.name as supplier_name
            FROM product_batches pb
            LEFT JOIN products p ON pb.product_id = p.id
            LEFT JOIN suppliers s ON pb.supplier_id = s.id
            ${whereClause}
            ORDER BY pb.expiry_date ASC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);
        
        // Get total count for pagination
        const countResult = await sqliteDBManager.get(`
            SELECT COUNT(*) as total
            FROM product_batches pb
            ${whereClause}
        `, params);
        
        res.json({
            batches: batches,
            pagination: {
                total: countResult.total,
                page: page,
                limit: limit,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        console.error("Error getting batches:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Add new batch.
 */
router.post("/", async function (req, res) {
    try {
        await initializeDatabase();
        
        // Validate required fields
        if (!req.body.productId || !req.body.batchNumber || !req.body.expiryDate) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Product ID, batch number, and expiry date are required fields.",
            });
        }
        
        // Check if batch with same number and product already exists
        const existingBatch = await sqliteDBManager.get(`
            SELECT id FROM product_batches 
            WHERE product_id = ? AND batch_number = ? AND store_id = ?
        `, [
            parseInt(req.body.productId),
            validator.escape(req.body.batchNumber),
            req.body.storeId ? parseInt(req.body.storeId) : 1
        ]);
        
        if (existingBatch) {
            return res.status(409).json({
                error: "Conflict",
                message: "A batch with this number already exists for this product.",
            });
        }
        
        // Create new batch
        const result = await sqliteDBManager.run(`
            INSERT INTO product_batches (
                product_id, store_id, batch_number, expiry_date,
                manufacturing_date, initial_quantity, current_quantity,
                cost_price, selling_price, supplier_id,
                rack_location, shelf_location, is_active,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            parseInt(req.body.productId),
            req.body.storeId ? parseInt(req.body.storeId) : 1,
            validator.escape(req.body.batchNumber),
            validator.escape(req.body.expiryDate),
            req.body.manufacturingDate ? validator.escape(req.body.manufacturingDate) : null,
            parseInt(req.body.initialQuantity) || 0,
            parseInt(req.body.currentQuantity) || parseInt(req.body.initialQuantity) || 0,
            parseFloat(req.body.costPrice) || 0,
            parseFloat(req.body.sellingPrice) || 0,
            req.body.supplierId ? parseInt(req.body.supplierId) : null,
            req.body.rackLocation ? validator.escape(req.body.rackLocation) : null,
            req.body.shelfLocation ? validator.escape(req.body.shelfLocation) : null,
            1,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        const batchId = result.lastID;
        
        // Update product with batch tracking flag
        await sqliteDBManager.run(`
            UPDATE products SET
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [parseInt(req.body.productId)]);
        
        // Update store inventory
        const storeInventory = await sqliteDBManager.get(`
            SELECT id, quantity FROM store_inventory 
            WHERE product_id = ? AND store_id = ?
        `, [
            parseInt(req.body.productId),
            req.body.storeId ? parseInt(req.body.storeId) : 1
        ]);
        
        if (storeInventory) {
            // Update existing inventory
            await sqliteDBManager.run(`
                UPDATE store_inventory SET
                    quantity = quantity + ?, last_updated = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                parseInt(req.body.currentQuantity) || parseInt(req.body.initialQuantity) || 0,
                storeInventory.id
            ]);
        } else {
            // Create new inventory record
            await sqliteDBManager.run(`
                INSERT INTO store_inventory (
                    product_id, store_id, quantity, last_updated, updated_by
                ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'system')
            `, [
                parseInt(req.body.productId),
                req.body.storeId ? parseInt(req.body.storeId) : 1,
                parseInt(req.body.currentQuantity) || parseInt(req.body.initialQuantity) || 0
            ]);
        }
        
        // Return created batch
        const createdBatch = await sqliteDBManager.get(`
            SELECT pb.*, p.name as product_name, p.sku, s.name as supplier_name
            FROM product_batches pb
            LEFT JOIN products p ON pb.product_id = p.id
            LEFT JOIN suppliers s ON pb.supplier_id = s.id
            WHERE pb.id = ?
        `, [batchId]);
        
        res.status(201).json(createdBatch);
    } catch (error) {
        console.error("Error creating batch:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get specific batch by ID.
 */
router.get("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const batchId = parseInt(req.params.id);
        
        const batch = await sqliteDBManager.get(`
            SELECT pb.*, p.name as product_name, p.sku, s.name as supplier_name
            FROM product_batches pb
            LEFT JOIN products p ON pb.product_id = p.id
            LEFT JOIN suppliers s ON pb.supplier_id = s.id
            WHERE pb.id = ?
        `, [batchId]);
        
        if (!batch) {
            return res.status(404).json({
                error: "Not Found",
                message: "Batch not found.",
            });
        }
        
        res.json(batch);
    } catch (error) {
        console.error("Error getting batch:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update batch.
 */
router.put("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const batchId = parseInt(req.params.id);
        
        // Check if batch exists
        const existingBatch = await sqliteDBManager.get(`
            SELECT id FROM product_batches WHERE id = ?
        `, [batchId]);
        
        if (!existingBatch) {
            return res.status(404).json({
                error: "Not Found",
                message: "Batch not found.",
            });
        }
        
        // Check for duplicate batch number if it's being changed
        if (req.body.batchNumber) {
            const duplicateBatch = await sqliteDBManager.get(`
                SELECT id FROM product_batches 
                WHERE product_id = ? AND batch_number = ? AND store_id = ? AND id != ?
            `, [
                req.body.productId ? parseInt(req.body.productId) : 1,
                validator.escape(req.body.batchNumber),
                req.body.storeId ? parseInt(req.body.storeId) : 1,
                batchId
            ]);
            
            if (duplicateBatch) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "A batch with this number already exists for this product.",
                });
            }
        }
        
        // Update batch
        await sqliteDBManager.run(`
            UPDATE product_batches SET
                product_id = ?, store_id = ?, batch_number = ?, expiry_date = ?,
                manufacturing_date = ?, initial_quantity = ?, current_quantity = ?,
                cost_price = ?, selling_price = ?, supplier_id = ?,
                rack_location = ?, shelf_location = ?, is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            req.body.productId ? parseInt(req.body.productId) : null,
            req.body.storeId ? parseInt(req.body.storeId) : 1,
            req.body.batchNumber ? validator.escape(req.body.batchNumber) : null,
            req.body.expiryDate ? validator.escape(req.body.expiryDate) : null,
            req.body.manufacturingDate ? validator.escape(req.body.manufacturingDate) : null,
            req.body.initialQuantity ? parseInt(req.body.initialQuantity) : null,
            req.body.currentQuantity !== undefined ? parseInt(req.body.currentQuantity) : null,
            req.body.costPrice !== undefined ? parseFloat(req.body.costPrice) : null,
            req.body.sellingPrice !== undefined ? parseFloat(req.body.sellingPrice) : null,
            req.body.supplierId !== undefined ? (req.body.supplierId ? parseInt(req.body.supplierId) : null) : null,
            req.body.rackLocation !== undefined ? validator.escape(req.body.rackLocation) : null,
            req.body.shelfLocation !== undefined ? validator.escape(req.body.shelfLocation) : null,
            req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : 1,
            batchId
        ]);
        
        // Return updated batch
        const updatedBatch = await sqliteDBManager.get(`
            SELECT pb.*, p.name as product_name, p.sku, s.name as supplier_name
            FROM product_batches pb
            LEFT JOIN products p ON pb.product_id = p.id
            LEFT JOIN suppliers s ON pb.supplier_id = s.id
            WHERE pb.id = ?
        `, [batchId]);
        
        res.json(updatedBatch);
    } catch (error) {
        console.error("Error updating batch:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete batch.
 */
router.delete("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const batchId = parseInt(req.params.id);
        
        // Check if batch exists and has quantity
        const batch = await sqliteDBManager.get(`
            SELECT id, current_quantity FROM product_batches WHERE id = ?
        `, [batchId]);
        
        if (!batch) {
            return res.status(404).json({
                error: "Not Found",
                message: "Batch not found.",
            });
        }
        
        if (batch.current_quantity > 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete batch with remaining quantity. Adjust quantity to zero first.",
            });
        }
        
        // Delete batch
        await sqliteDBManager.run(`
            DELETE FROM product_batches WHERE id = ?
        `, [batchId]);
        
        res.json({ message: "Batch deleted successfully." });
    } catch (error) {
        console.error("Error deleting batch:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get batches expiring within 30 days.
 */
router.get("/expiring-soon", async function (req, res) {
    try {
        await initializeDatabase();
        const today = new Date().toISOString().split('T')[0];
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        const thirtyDaysFromNowStr = thirtyDaysFromNow.toISOString().split('T')[0];
        
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : 1;
        
        const batches = await sqliteDBManager.all(`
            SELECT pb.*, p.name as product_name, p.sku
            FROM product_batches pb
            LEFT JOIN products p ON pb.product_id = p.id
            WHERE pb.expiry_date BETWEEN ? AND ? 
              AND pb.current_quantity > 0 
              AND pb.is_active = 1
              AND pb.store_id = ?
            ORDER BY pb.expiry_date ASC
        `, [today, thirtyDaysFromNowStr, storeId]);
        
        res.json(batches);
    } catch (error) {
        console.error("Error getting expiring batches:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get expired batches.
 */
router.get("/expired", async function (req, res) {
    try {
        await initializeDatabase();
        const today = new Date().toISOString().split('T')[0];
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : 1;
        
        const batches = await sqliteDBManager.all(`
            SELECT pb.*, p.name as product_name, p.sku
            FROM product_batches pb
            LEFT JOIN products p ON pb.product_id = p.id
            WHERE pb.expiry_date < ? 
              AND pb.current_quantity > 0 
              AND pb.is_active = 1
              AND pb.store_id = ?
            ORDER BY pb.expiry_date ASC
        `, [today, storeId]);
        
        res.json(batches);
    } catch (error) {
        console.error("Error getting expired batches:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get all batches for a product.
 */
router.get("/product/:productId", async function (req, res) {
    try {
        await initializeDatabase();
        const productId = parseInt(req.params.productId);
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : 1;
        
        const batches = await sqliteDBManager.all(`
            SELECT pb.*, p.name as product_name, p.sku, s.name as supplier_name
            FROM product_batches pb
            LEFT JOIN products p ON pb.product_id = p.id
            LEFT JOIN suppliers s ON pb.supplier_id = s.id
            WHERE pb.product_id = ? AND pb.is_active = 1 AND pb.store_id = ?
            ORDER BY pb.expiry_date ASC
        `, [productId, storeId]);
        
        res.json(batches);
    } catch (error) {
        console.error("Error getting product batches:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get batches for stock counting.
 */
router.get("/stock-count/:sessionId", async function (req, res) {
    try {
        await initializeDatabase();
        const sessionId = parseInt(req.params.sessionId);
        
        // Check if stock counting table exists and get session details
        const stockCountingTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='stock_counting'
        `);
        
        if (!stockCountingTableExists) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock counting module not available.",
            });
        }
        
        const stockCount = await sqliteDBManager.get(`
            SELECT * FROM stock_counting WHERE id = ?
        `, [sessionId]);
        
        if (!stockCount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock count session not found.",
            });
        }
        
        // Build query based on count scope
        let whereClause = "WHERE pb.is_active = 1 AND pb.current_quantity > 0";
        let params = [];
        
        // Apply scope filters if specified
        if (stockCount.countScope && Object.keys(stockCount.countScope).length > 0) {
            const scope = stockCount.countScope;
            
            if (scope.products && scope.products.length > 0) {
                whereClause += " AND pb.product_id IN (" + scope.products.map(() => '?').join(',') + ")";
                params.push(...scope.products);
            }
            
            if (scope.suppliers && scope.suppliers.length > 0) {
                whereClause += " AND pb.supplier_id IN (" + scope.suppliers.map(() => '?').join(',') + ")";
                params.push(...scope.suppliers);
            }
            
            if (scope.expiryDate) {
                if (scope.expiryDate.before) {
                    whereClause += " AND pb.expiry_date <= ?";
                    params.push(scope.expiryDate.before);
                }
                if (scope.expiryDate.after) {
                    whereClause += " AND pb.expiry_date >= ?";
                    params.push(scope.expiryDate.after);
                }
            }
        }
        
        // Add store filter
        whereClause += " AND pb.store_id = ?";
        params.push(stockCount.storeId);
        
        const batches = await sqliteDBManager.all(`
            SELECT pb.*, p.name as product_name, p.sku, p.barcode,
                   p.category_id, c.name as category_name
            FROM product_batches pb
            LEFT JOIN products p ON pb.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            ${whereClause}
            ORDER BY pb.expiry_date ASC
        `, params);
        
        // Get store inventory for each batch
        const productIds = [...new Set(batches.map(b => b.product_id))];
        let storeInventories = [];
        
        if (productIds.length > 0) {
            storeInventories = await sqliteDBManager.all(`
                SELECT * FROM store_inventory 
                WHERE product_id IN (${productIds.map(() => '?').join(',')}) AND store_id = ?
            `, [...productIds, stockCount.storeId]);
        }
        
        // Enrich batches with additional information
        const enrichedBatches = batches.map(batch => {
            const storeInventory = storeInventories.find(si => si.product_id === batch.product_id);
            
            const today = new Date();
            const expiryDate = new Date(batch.expiry_date);
            const daysUntilExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
            
            return {
                ...batch,
                storeQuantity: storeInventory ? storeInventory.quantity : 0,
                daysUntilExpiry: daysUntilExpiry,
                expiryStatus: daysUntilExpiry < 0 ? 'EXPIRED' :
                             daysUntilExpiry <= 30 ? 'EXPIRING_SOON' :
                             daysUntilExpiry <= 90 ? 'EXPIRING' : 'OK',
                totalValue: batch.current_quantity * (batch.selling_price || 0)
            };
        });
        
        res.json({
            batches: enrichedBatches,
            sessionId: sessionId,
            countType: stockCount.countType,
            storeId: stockCount.storeId
        });
    } catch (error) {
        console.error("Error getting stock count batches:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Update batch quantities from stock count.
 */
router.post("/update-from-stock-count", async function (req, res) {
    try {
        await initializeDatabase();
        
        if (!req.body.sessionId || !req.body.batches) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Session ID and batches array are required.",
            });
        }
        
        const sessionId = parseInt(req.body.sessionId);
        const batchUpdates = req.body.batches;
        
        // Check if stock counting table exists
        const stockCountingTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='stock_counting'
        `);
        
        if (!stockCountingTableExists) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock counting module not available.",
            });
        }
        
        const stockCount = await sqliteDBManager.get(`
            SELECT countStatus FROM stock_counting WHERE id = ?
        `, [sessionId]);
        
        if (!stockCount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Stock count session not found.",
            });
        }
        
        if (stockCount.countStatus !== 'COMPLETED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Batch quantities can only be updated from completed stock counts.",
            });
        }
        
        // Process each batch update
        const updatedBatches = [];
        
        await sqliteDBManager.transaction(async (trx) => {
            for (const batchData of batchUpdates) {
                const batchId = parseInt(batchData.batchId);
                const countedQuantity = parseInt(batchData.countedQuantity);
                
                // Find existing batch
                const batch = await trx.get(`
                    SELECT id, current_quantity FROM product_batches WHERE id = ?
                `, [batchId]);
                
                if (!batch) {
                    throw new Error(`Batch ${batchId} not found`);
                }
                
                const variance = countedQuantity - batch.current_quantity;
                
                // Update batch quantity
                await trx.run(`
                    UPDATE product_batches SET
                        current_quantity = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [countedQuantity, batchId]);
                
                // Create batch movement record
                await trx.run(`
                    INSERT INTO batch_movements (
                        batch_id, movement_type, quantity, reference_type,
                        reference_id, previous_quantity, new_quantity, notes, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    batchId,
                    variance >= 0 ? 'STOCK_COUNT_INCREASE' : 'STOCK_COUNT_DECREASE',
                    Math.abs(variance),
                    'STOCK_COUNT',
                    sessionId,
                    batch.current_quantity,
                    countedQuantity,
                    batchData.notes || `Stock count adjustment for session ${sessionId}`,
                    new Date().toISOString()
                ]);
                
                updatedBatches.push({
                    batchId: batchId,
                    previousQuantity: batch.current_quantity,
                    newQuantity: countedQuantity,
                    variance: variance
                });
            }
        });
        
        res.json({
            message: "Batch quantities updated successfully from stock count.",
            updatedBatches: updatedBatches,
            sessionId: sessionId
        });
    } catch (error) {
        console.error("Error updating batch quantities:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get batch movements for tracking.
 */
router.get("/:batchId/movements", async function (req, res) {
    try {
        await initializeDatabase();
        const batchId = parseInt(req.params.batchId);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        
        // Check if batch exists
        const batch = await sqliteDBManager.get(`
            SELECT id FROM product_batches WHERE id = ?
        `, [batchId]);
        
        if (!batch) {
            return res.status(404).json({
                error: "Not Found",
                message: "Batch not found.",
            });
        }
        
        // Get batch movements
        const movements = await sqliteDBManager.all(`
            SELECT * FROM batch_movements
            WHERE batch_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [batchId, limit, offset]);
        
        // Get total count for pagination
        const countResult = await sqliteDBManager.get(`
            SELECT COUNT(*) as total FROM batch_movements WHERE batch_id = ?
        `, [batchId]);
        
        res.json({
            movements: movements,
            pagination: {
                total: countResult.total,
                page: page,
                limit: limit,
                pages: Math.ceil(countResult.total / limit)
            }
        });
    } catch (error) {
        console.error("Error getting batch movements:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});