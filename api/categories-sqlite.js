const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
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
            WHERE type='table' AND name='categories'
        `);
        
        if (!tableExists) {
            console.log("Categories table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id INTEGER NOT NULL,
                    parent_category_id INTEGER,
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    hsn_code VARCHAR(8),
                    image_url VARCHAR(255),
                    display_order INTEGER DEFAULT 0,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (store_id) REFERENCES stores(id),
                    FOREIGN KEY (parent_category_id) REFERENCES categories(id),
                    UNIQUE(store_id, name)
                )
            `);
        }
        
        dbInitialized = true;
        console.log("Categories SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize categories SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in categories module:", err);
});

/**
 * GET endpoint: Get welcome message for Category API.
 */
router.get("/", function (req, res) {
    res.send("Category API (SQLite)");
});

/**
 * GET endpoint: Get details of all categories.
 */
router.get("/all", async function (req, res) {
    try {
        await initializeDatabase();
        
        const categories = await sqliteDBManager.all(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count,
                   pc.name as parent_category_name
            FROM categories c
            LEFT JOIN categories pc ON c.parent_category_id = pc.id
            WHERE c.is_active = 1
            ORDER BY c.display_order, c.name
        `);
        
        res.send(categories);
    } catch (error) {
        console.error("Error getting categories:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get category by ID
 */
router.get("/:categoryId", async function (req, res) {
    try {
        await initializeDatabase();
        const categoryId = parseInt(req.params.categoryId);
        
        const category = await sqliteDBManager.get(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count,
                   pc.name as parent_category_name
            FROM categories c
            LEFT JOIN categories pc ON c.parent_category_id = pc.id
            WHERE c.id = ?
        `, [categoryId]);
        
        if (!category) {
            return res.status(404).json({
                error: "Not Found",
                message: "Category not found.",
            });
        }
        
        res.send(category);
    } catch (error) {
        console.error("Error getting category:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get categories by store ID
 */
router.get("/store/:storeId", async function (req, res) {
    try {
        await initializeDatabase();
        const storeId = parseInt(req.params.storeId);
        
        const categories = await sqliteDBManager.all(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.store_id = ?) as product_count,
                   pc.name as parent_category_name
            FROM categories c
            LEFT JOIN categories pc ON c.parent_category_id = pc.id
            WHERE c.store_id = ? AND c.is_active = 1
            ORDER BY c.display_order, c.name
        `, [storeId, storeId]);
        
        res.send(categories);
    } catch (error) {
        console.error("Error getting store categories:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get root categories (categories without parent)
 */
router.get("/root", async function (req, res) {
    try {
        await initializeDatabase();
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : 1;
        
        const categories = await sqliteDBManager.all(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.store_id = ?) as product_count
            FROM categories c
            WHERE c.parent_category_id IS NULL AND c.store_id = ? AND c.is_active = 1
            ORDER BY c.display_order, c.name
        `, [storeId, storeId]);
        
        res.send(categories);
    } catch (error) {
        console.error("Error getting root categories:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get child categories of a parent category
 */
router.get("/parent/:parentId", async function (req, res) {
    try {
        await initializeDatabase();
        const parentId = parseInt(req.params.parentId);
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : 1;
        
        const categories = await sqliteDBManager.all(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.store_id = ?) as product_count
            FROM categories c
            WHERE c.parent_category_id = ? AND c.store_id = ? AND c.is_active = 1
            ORDER BY c.display_order, c.name
        `, [storeId, parentId, storeId]);
        
        res.send(categories);
    } catch (error) {
        console.error("Error getting child categories:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create a new category.
 */
router.post("/category", async function (req, res) {
    try {
        await initializeDatabase();
        
        const newCategory = {
            store_id: req.body.storeId || 1,
            parent_category_id: req.body.parentCategoryId || null,
            name: req.body.name,
            description: req.body.description || null,
            hsn_code: req.body.hsnCode || null,
            image_url: req.body.imageUrl || null,
            display_order: req.body.displayOrder || 0,
            is_active: 1
        };
        
        const result = await sqliteDBManager.run(`
            INSERT INTO categories (
                store_id, parent_category_id, name, description,
                hsn_code, image_url, display_order, is_active,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            newCategory.store_id,
            newCategory.parent_category_id,
            newCategory.name,
            newCategory.description,
            newCategory.hsn_code,
            newCategory.image_url,
            newCategory.display_order,
            newCategory.is_active,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        const categoryId = result.lastID;
        
        // Return the created category
        const createdCategory = await sqliteDBManager.get(`
            SELECT * FROM categories WHERE id = ?
        `, [categoryId]);
        
        res.status(201).send(createdCategory);
    } catch (error) {
        console.error("Error creating category:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update category details.
 */
router.put("/category", async function (req, res) {
    try {
        await initializeDatabase();
        const categoryId = parseInt(req.body.id);
        
        // Check if category exists
        const existing = await sqliteDBManager.get("SELECT id FROM categories WHERE id = ?", [categoryId]);
        if (!existing) {
            return res.status(404).json({
                error: "Not Found",
                message: "Category not found.",
            });
        }
        
        const updateData = {
            parent_category_id: req.body.parentCategoryId || null,
            name: req.body.name,
            description: req.body.description || null,
            hsn_code: req.body.hsnCode || null,
            image_url: req.body.imageUrl || null,
            display_order: req.body.displayOrder || 0,
            is_active: req.body.isActive !== undefined ? (req.body.isActive ? 1 : 0) : 1
        };
        
        await sqliteDBManager.run(`
            UPDATE categories SET
                parent_category_id = ?, name = ?, description = ?,
                hsn_code = ?, image_url = ?, display_order = ?,
                is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            updateData.parent_category_id,
            updateData.name,
            updateData.description,
            updateData.hsn_code,
            updateData.image_url,
            updateData.display_order,
            updateData.is_active,
            categoryId
        ]);
        
        // Return the updated category
        const updatedCategory = await sqliteDBManager.get(`
            SELECT * FROM categories WHERE id = ?
        `, [categoryId]);
        
        res.send(updatedCategory);
    } catch (error) {
        console.error("Error updating category:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete a category by category ID.
 */
router.delete("/category/:categoryId", async function (req, res) {
    try {
        await initializeDatabase();
        const categoryId = parseInt(req.params.categoryId);
        
        // Check if category has products
        const productCount = await sqliteDBManager.get(`
            SELECT COUNT(*) as count FROM products WHERE category_id = ?
        `, [categoryId]);
        
        if (productCount.count > 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete category with associated products.",
            });
        }
        
        // Check if category has child categories
        const childCount = await sqliteDBManager.get(`
            SELECT COUNT(*) as count FROM categories WHERE parent_category_id = ?
        `, [categoryId]);
        
        if (childCount.count > 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete category with child categories.",
            });
        }
        
        // Soft delete by setting is_active to 0
        await sqliteDBManager.run(`
            UPDATE categories SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [categoryId]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting category:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Reorder categories
 */
router.post("/reorder", async function (req, res) {
    try {
        await initializeDatabase();
        
        if (!req.body.categories || !Array.isArray(req.body.categories)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Categories array is required.",
            });
        }
        
        // Update display order for each category
        await sqliteDBManager.transaction(async (trx) => {
            for (const item of req.body.categories) {
                await trx.run(`
                    UPDATE categories SET display_order = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [item.order, item.id]);
            }
        });
        
        res.json({ message: "Categories reordered successfully." });
    } catch (error) {
        console.error("Error reordering categories:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Search categories by name
 */
router.get("/search/:query", async function (req, res) {
    try {
        await initializeDatabase();
        const query = req.params.query;
        const storeId = req.query.storeId ? parseInt(req.query.storeId) : 1;
        
        const categories = await sqliteDBManager.all(`
            SELECT c.*, 
                   (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.store_id = ?) as product_count,
                   pc.name as parent_category_name
            FROM categories c
            LEFT JOIN categories pc ON c.parent_category_id = pc.id
            WHERE c.store_id = ? AND c.is_active = 1 AND c.name LIKE ?
            ORDER BY c.name
        `, [storeId, storeId, `%${query}%`]);
        
        res.send(categories);
    } catch (error) {
        console.error("Error searching categories:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});