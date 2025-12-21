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
            WHERE type='table' AND name='gst_config'
        `);
        
        if (!tableExists) {
            console.log("GST config table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS gst_config (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    gst_number VARCHAR(15) NOT NULL,
                    state_code VARCHAR(2) NOT NULL,
                    cgst_rate DECIMAL(5,2) DEFAULT 0.00,
                    sgst_rate DECIMAL(5,2) DEFAULT 0.00,
                    igst_rate DECIMAL(5,2) DEFAULT 0.00,
                    cess_rate DECIMAL(5,2) DEFAULT 0.00,
                    effective_date DATE NOT NULL,
                    is_active BOOLEAN DEFAULT 1,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            
            // Create indexes for better performance
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_gst_config_is_active ON gst_config(is_active)');
            await sqliteDBManager.run('CREATE INDEX IF NOT EXISTS idx_gst_config_state_code ON gst_config(state_code)');
        }
        
        dbInitialized = true;
        console.log("GST config SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize GST config SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in GST config module:", err);
});

/**
 * GET endpoint: Get welcome message for GST Configuration API.
 */
router.get("/", function (req, res) {
    res.send("GST Configuration API (SQLite)");
});

/**
 * GET endpoint: Get active GST configuration.
 */
router.get("/active", async function (req, res) {
    try {
        await initializeDatabase();
        
        const config = await sqliteDBManager.get(`
            SELECT * FROM gst_config WHERE is_active = 1
        `);
        
        if (config) {
            return res.json(config);
        } else {
            // Return default GST configuration if none exists
            return res.json({
                id: null,
                gst_number: "",
                state_code: "",
                cgst_rate: 0.00,
                sgst_rate: 0.00,
                igst_rate: 0.00,
                cess_rate: 0.00,
                effective_date: new Date().toISOString().split('T')[0],
                is_active: 1
            });
        }
    } catch (error) {
        console.error("Error getting active GST config:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create or update GST configuration.
 */
router.post("/", async function (req, res) {
    try {
        await initializeDatabase();
        
        // Validate required fields
        if (!req.body.gst_number || !req.body.state_code) {
            return res.status(400).json({
                error: "Bad Request",
                message: "GST number and state code are required fields.",
            });
        }

        // Validate GST number format (basic validation)
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(req.body.gst_number)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid GST number format.",
            });
        }

        // Validate state code (2 characters)
        if (req.body.state_code.length !== 2) {
            return res.status(400).json({
                error: "Bad Request",
                message: "State code must be 2 characters.",
            });
        }

        // Validate GST rates (must be numbers)
        const cgstRate = parseFloat(req.body.cgst_rate) || 0.00;
        const sgstRate = parseFloat(req.body.sgst_rate) || 0.00;
        const igstRate = parseFloat(req.body.igst_rate) || 0.00;
        const cessRate = parseFloat(req.body.cess_rate) || 0.00;

        // Check if a configuration already exists
        const existingConfig = await sqliteDBManager.get(`
            SELECT id FROM gst_config WHERE is_active = 1
        `);

        if (existingConfig) {
            // Deactivate existing configuration
            await sqliteDBManager.run(`
                UPDATE gst_config SET
                    is_active = 0, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [existingConfig.id]);
        }
        
        // Create new configuration
        const result = await sqliteDBManager.run(`
            INSERT INTO gst_config (
                gst_number, state_code, cgst_rate, sgst_rate,
                igst_rate, cess_rate, effective_date, is_active,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            validator.escape(req.body.gst_number),
            validator.escape(req.body.state_code),
            cgstRate,
            sgstRate,
            igstRate,
            cessRate,
            req.body.effective_date || new Date().toISOString().split('T')[0],
            1,
            new Date().toISOString(),
            new Date().toISOString()
        ]);
        
        // Return created configuration
        const newConfig = await sqliteDBManager.get(`
            SELECT * FROM gst_config WHERE id = ?
        `, [result.lastID]);
        
        res.status(201).json(newConfig);
    } catch (error) {
        console.error("Error creating GST config:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get all GST configurations (including inactive ones).
 */
router.get("/all", async function (req, res) {
    try {
        await initializeDatabase();
        
        const configs = await sqliteDBManager.all(`
            SELECT * FROM gst_config ORDER BY effective_date DESC
        `);
        
        res.json(configs);
    } catch (error) {
        console.error("Error getting all GST configs:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get GST configuration by ID.
 */
router.get("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const configId = parseInt(req.params.id);
        
        // Ensure we don't catch root route which might be handled by express weirdly if params collide
        if (req.params.id === 'calculate' || req.params.id === 'all') {
            return; // Pass to next handler ideally, but here we just return to avoid conflict
        }

        const config = await sqliteDBManager.get(`
            SELECT * FROM gst_config WHERE id = ?
        `, [configId]);

        if (config) {
            res.json(config);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "GST configuration not found.",
            });
        }
    } catch (error) {
        console.error("Error getting GST config:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update GST configuration.
 */
router.put("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const configId = parseInt(req.params.id);
        
        // Check if configuration exists
        const existingConfig = await sqliteDBManager.get(`
            SELECT id FROM gst_config WHERE id = ?
        `, [configId]);

        if (!existingConfig) {
            return res.status(404).json({
                error: "Not Found",
                message: "GST configuration not found.",
            });
        }

        // Validate required fields
        if (!req.body.gst_number || !req.body.state_code) {
            return res.status(400).json({
                error: "Bad Request",
                message: "GST number and state code are required fields.",
            });
        }

        // Validate GST number format (basic validation)
        if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(req.body.gst_number)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Invalid GST number format.",
            });
        }

        // Validate state code (2 characters)
        if (req.body.state_code.length !== 2) {
            return res.status(400).json({
                error: "Bad Request",
                message: "State code must be 2 characters.",
            });
        }

        // Validate GST rates (must be numbers)
        const cgstRate = parseFloat(req.body.cgst_rate) || 0.00;
        const sgstRate = parseFloat(req.body.sgst_rate) || 0.00;
        const igstRate = parseFloat(req.body.igst_rate) || 0.00;
        const cessRate = parseFloat(req.body.cess_rate) || 0.00;

        // Update configuration
        await sqliteDBManager.run(`
            UPDATE gst_config SET
                gst_number = ?, state_code = ?, cgst_rate = ?, sgst_rate = ?,
                igst_rate = ?, cess_rate = ?, effective_date = ?, is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [
            validator.escape(req.body.gst_number),
            validator.escape(req.body.state_code),
            cgstRate,
            sgstRate,
            igstRate,
            cessRate,
            req.body.effective_date || new Date().toISOString().split('T')[0],
            req.body.is_active !== undefined ? (req.body.is_active ? 1 : 0) : 1,
            configId
        ]);
        
        // Return updated configuration
        const updatedConfig = await sqliteDBManager.get(`
            SELECT * FROM gst_config WHERE id = ?
        `, [configId]);
        
        res.json(updatedConfig);
    } catch (error) {
        console.error("Error updating GST config:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete a GST configuration by ID.
 */
router.delete("/:id", async function (req, res) {
    try {
        await initializeDatabase();
        const configId = parseInt(req.params.id);

        // Check if it's active configuration
        const config = await sqliteDBManager.get(`
            SELECT id FROM gst_config WHERE id = ? AND is_active = 1
        `, [configId]);

        if (config) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete active GST configuration. Please create a new one first.",
            });
        }

        // Delete configuration
        await sqliteDBManager.run(`
            DELETE FROM gst_config WHERE id = ?
        `, [configId]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting GST config:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Calculate GST for a transaction.
 * This endpoint calculates GST based on transaction amount and customer state.
 */
router.post("/calculate", async function (req, res) {
    try {
        await initializeDatabase();
        
        // Validate required fields
        if (!req.body.amount || !req.body.customer_state) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Amount and customer state are required fields.",
            });
        }

        const amount = parseFloat(req.body.amount);
        const customerState = validator.escape(req.body.customer_state);

        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Amount must be a positive number.",
            });
        }

        // Get active GST configuration
        const config = await sqliteDBManager.get(`
            SELECT * FROM gst_config WHERE is_active = 1
        `);

        if (!config) {
            return res.status(404).json({
                error: "Not Found",
                message: "No active GST configuration found.",
            });
        }

        // Check if it's an inter-state or intra-state transaction
        const isInterState = config.state_code !== customerState;
        
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;
        let cessAmount = 0;
        let totalGst = 0;

        if (isInterState) {
            // Inter-state transaction: IGST applies
            igstAmount = (amount * config.igst_rate) / 100;
            totalGst = igstAmount;
        } else {
            // Intra-state transaction: CGST + SGST applies
            cgstAmount = (amount * config.cgst_rate) / 100;
            sgstAmount = (amount * config.sgst_rate) / 100;
            totalGst = cgstAmount + sgstAmount;
        }

        // CESS applies to both inter-state and intra-state transactions
        cessAmount = (amount * config.cess_rate) / 100;
        totalGst += cessAmount;

        const totalAmount = amount + totalGst;

        res.json({
            original_amount: amount,
            cgst_rate: config.cgst_rate,
            sgst_rate: config.sgst_rate,
            igst_rate: config.igst_rate,
            cess_rate: config.cess_rate,
            cgst_amount: parseFloat(cgstAmount.toFixed(2)),
            sgst_amount: parseFloat(sgstAmount.toFixed(2)),
            igst_amount: parseFloat(igstAmount.toFixed(2)),
            cess_amount: parseFloat(cessAmount.toFixed(2)),
            total_gst: parseFloat(totalGst.toFixed(2)),
            total_amount: parseFloat(totalAmount.toFixed(2)),
            is_inter_state: isInterState
        });
    } catch (error) {
        console.error("Error calculating GST:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});