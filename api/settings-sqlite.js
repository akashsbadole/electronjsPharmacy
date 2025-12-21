const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const multer = require("multer");
const sanitizeFilename = require('sanitize-filename');
const fs = require("fs");
const path = require("path");
const validator = require("validator");
const sqliteDBManager = require('./sqlite-db-manager');

// validFileTypes is handled by filterFile utility
const maxFileSize = 2097152; // 2MB = 2*1024*1024
const defaultLogoName = "logo";

const { filterFile } = require('../assets/js/utils');

const storage = multer.diskStorage({
    destination: function (_req, _file, callback) {
        // Use the same uploads directory as the original
        const uploadsDir = path.join(process.env.APPDATA || (process.platform === 'win32' ? process.env.USERPROFILE + '/AppData/Roaming' : process.env.HOME + '/.config'),
            process.env.APPNAME || 'PharmaSoft',
            'uploads');

        // Ensure directory exists
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }

        callback(null, uploadsDir);
    },
    filename: function (_req, file, callback) {
        callback(null, defaultLogoName + path.extname(file.originalname));
    },
});

const upload = multer({
    storage: storage,
    limits: { fileSize: maxFileSize },
    fileFilter: filterFile,
}).single("imagename");

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
            WHERE type='table' AND name='settings'
        `);

        if (!tableExists) {
            console.log("Settings table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id INTEGER NOT NULL DEFAULT 1,
                    setting_key VARCHAR(50) NOT NULL,
                    setting_value TEXT,
                    setting_type VARCHAR(20) DEFAULT 'STRING',
                    is_encrypted BOOLEAN DEFAULT 0,
                    description TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sync_version INTEGER DEFAULT 1,
                    UNIQUE(store_id, setting_key)
                )
            `);
        }

        // Check if network_settings table exists
        const networkSettingsTableExists = await sqliteDBManager.get(`
            SELECT name FROM sqlite_master
            WHERE type='table' AND name='network_settings'
        `);

        if (!networkSettingsTableExists) {
            console.log("Network settings table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS network_settings (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    server_ip VARCHAR(15) NOT NULL,
                    till_number INTEGER NOT NULL,
                    mac_address VARCHAR(17),
                    app_name VARCHAR(50),
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        }

        // Ensure default store exists
        const storeExists = await sqliteDBManager.get(`
            SELECT id FROM stores WHERE id = 1
        `);

        if (!storeExists) {
            console.log("Default store does not exist, creating...");
            try {
                await sqliteDBManager.run(`
                    INSERT INTO stores (id, store_code, store_name, store_type, is_active, is_central)
                    VALUES (1, 'MAIN', 'Main Store', 'RETAIL', 1, 1)
                `);
            } catch (e) {
                // Store might already exist or table might not exist yet
                console.log("Could not create default store:", e.message);
            }
        }

        dbInitialized = true;
        console.log("Settings SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize settings SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in settings module:", err);
});

/**
 * GET endpoint: Get welcome message for Settings API.
 */
router.get("/", function (_req, res) {
    res.send("Settings API (SQLite)");
});

/**
 * GET endpoint: Get settings details.
 */
router.get("/get", async function (_req, res) {
    try {
        await initializeDatabase();

        // Get all settings for the default store (store_id = 1)
        const settings = await sqliteDBManager.all(`
            SELECT setting_key, setting_value, setting_type 
            FROM settings 
            WHERE store_id = 1
        `);

        // Convert settings array to object format like the original
        const settingsObject = {
            _id: 1,
            settings: {}
        };

        settings.forEach(setting => {
            // Parse JSON values if needed
            let value = setting.setting_value;
            if (setting.setting_type === 'JSON' && value) {
                try {
                    value = JSON.parse(value);
                } catch (e) {
                    console.error("Error parsing JSON setting:", setting.setting_key, e);
                }
            }
            settingsObject.settings[setting.setting_key] = value;
        });

        res.send(settingsObject);
    } catch (error) {
        console.error("Error getting settings:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get network settings.
 */
router.get("/network", async function (_req, res) {
    try {
        await initializeDatabase();

        const networkSettings = await sqliteDBManager.get(`
            SELECT * FROM network_settings ORDER BY updated_at DESC LIMIT 1
        `);

        res.send(networkSettings || {});
    } catch (error) {
        console.error("Error getting network settings:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred while retrieving network settings.",
        });
    }
});

/**
 * POST endpoint: Create or update network settings.
 */
router.post("/network", async function (req, res) {
    try {
        await initializeDatabase();

        // Validate required fields
        const { ip, till, mac, app } = req.body;

        // Basic validation
        if (!ip || validator.isEmpty(ip.trim())) {
            return res.status(400).json({
                error: "Validation Error",
                message: "Server IP Address is required",
            });
        }

        if (!till || validator.isEmpty(till.trim())) {
            return res.status(400).json({
                error: "Validation Error",
                message: "Till Number is required",
            });
        }

        // Validate IP address format
        if (!validator.isIP(ip)) {
            return res.status(400).json({
                error: "Validation Error",
                message: "Invalid IP address format",
            });
        }

        // Validate till is a number
        if (!validator.isNumeric(till.toString()) || parseInt(till) < 1) {
            return res.status(400).json({
                error: "Validation Error",
                message: "Till Number must be a positive integer greater than 0",
            });
        }

        // Sanitize inputs
        const sanitizedIp = validator.escape(ip.trim());
        const sanitizedTill = validator.escape(till.trim());
        const sanitizedMac = mac ? validator.escape(mac.trim()) : "";
        const sanitizedApp = app ? validator.escape(app.trim()) : "";

        // Check if network settings already exist
        const existingSettings = await sqliteDBManager.get(`
            SELECT id FROM network_settings ORDER BY updated_at DESC LIMIT 1
        `);

        if (existingSettings) {
            // Update existing settings
            await sqliteDBManager.run(`
                UPDATE network_settings SET
                    server_ip = ?, till_number = ?, mac_address = ?, 
                    app_name = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [sanitizedIp, parseInt(sanitizedTill), sanitizedMac, sanitizedApp, existingSettings.id]);

            res.status(200).json({
                success: true,
                message: "Network settings updated successfully",
                data: {
                    id: existingSettings.id,
                    server_ip: sanitizedIp,
                    till_number: parseInt(sanitizedTill),
                    mac_address: sanitizedMac,
                    app_name: sanitizedApp
                },
            });
        } else {
            // Insert new settings
            const result = await sqliteDBManager.run(`
                INSERT INTO network_settings (
                    server_ip, till_number, mac_address, app_name, updated_at
                ) VALUES (?, ?, ?, ?, ?)
            `, [sanitizedIp, parseInt(sanitizedTill), sanitizedMac, sanitizedApp, new Date().toISOString()]);

            res.status(201).json({
                success: true,
                message: "Network settings created successfully",
                data: {
                    id: result.lastID,
                    server_ip: sanitizedIp,
                    till_number: parseInt(sanitizedTill),
                    mac_address: sanitizedMac,
                    app_name: sanitizedApp
                },
            });
        }
    } catch (error) {
        console.error("Error saving network settings:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create or update settings.
 */
router.post("/post", async function (req, res) {
    upload(req, res, async function (err) {
        if (err) {
            if (err instanceof multer.MulterError) {
                console.error('Upload Error:', err);
                return res.status(400).json({
                    error: 'Upload Error',
                    message: err.message,
                });
            } else {
                console.error('Unknown Error:', err);
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: err.message,
                });
            }
        }

        try {
            await initializeDatabase();

            console.log("Settings POST received:", req.body);

            let image = "";

            if (req.body.img && validator.escape(req.body.img) !== "") {
                image = sanitizeFilename(req.body.img);
            }

            if (req.file) {
                image = sanitizeFilename(req.file.filename);
            }

            if (req.body.remove && validator.escape(req.body.remove) === "1") {
                try {
                    const uploadsDir = path.join(process.env.APPDATA || (process.platform === 'win32' ? process.env.USERPROFILE + '/AppData/Roaming' : process.env.HOME + '/.config'),
                        process.env.APPNAME || 'PharmaSoft',
                        'uploads');
                    let imgPath = path.join(uploadsDir, image);

                    if (!req.file && fs.existsSync(imgPath)) {
                        fs.unlinkSync(imgPath);
                        image = "";
                    }
                } catch (err) {
                    console.error("Error removing image:", err);
                }
            }

            // Validate required fields for general store settings
            const { store, address_one, address_two, contact, symbol, percentage } = req.body;

            if (!store || validator.isEmpty(store.trim())) {
                return res.status(400).json({
                    error: "Validation Error",
                    message: "Store Name is required",
                });
            }

            if (!address_one || validator.isEmpty(address_one.trim())) {
                return res.status(400).json({
                    error: "Validation Error",
                    message: "Address Line 1 is required",
                });
            }

            if (!address_two || validator.isEmpty(address_two.trim())) {
                return res.status(400).json({
                    error: "Validation Error",
                    message: "Address Line 2 is required",
                });
            }

            if (!symbol || validator.isEmpty(symbol.trim())) {
                return res.status(400).json({
                    error: "Validation Error",
                    message: "Currency Symbol is required",
                });
            }

            if (percentage === undefined || percentage === null || validator.isEmpty(percentage.toString().trim())) {
                return res.status(400).json({
                    error: "Validation Error",
                    message: "VAT Percentage is required",
                });
            }

            // Validate percentage is a number within valid range
            if (!validator.isNumeric(percentage.toString()) || parseFloat(percentage) < 0 || parseFloat(percentage) > 100) {
                return res.status(400).json({
                    error: "Validation Error",
                    message: "VAT Percentage must be a number between 0 and 100",
                });
            }

            // Validate currency symbol length (max 3 characters as per HTML constraint)
            if (symbol.length > 3) {
                return res.status(400).json({
                    error: "Validation Error",
                    message: "Currency Symbol must be maximum 3 characters",
                });
            }

            // Prepare settings object
            const settingsData = {
                app: req.body.app ? validator.escape(req.body.app) : "",
                store: validator.escape(store.trim()),
                address_one: validator.escape(address_one.trim()),
                address_two: validator.escape(address_two.trim()),
                contact: contact ? validator.escape(contact.trim()) : "",
                tax: req.body.tax ? validator.escape(req.body.tax.trim()) : "",
                symbol: validator.escape(symbol.trim()),
                percentage: validator.escape(percentage.toString().trim()),
                charge_tax: req.body.charge_tax === true || req.body.charge_tax === 'on',
                footer: req.body.footer ? validator.escape(req.body.footer.trim()) : "",
                img: image,
            };

            // Save settings one by one (simpler approach)
            for (const [key, value] of Object.entries(settingsData)) {
                // Check if setting exists
                const existing = await sqliteDBManager.get(`
                    SELECT id FROM settings 
                    WHERE store_id = 1 AND setting_key = ?
                `, [key]);

                const settingValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
                const settingType = typeof value === 'object' ? 'JSON' : 'STRING';

                if (existing) {
                    // Update existing setting
                    await sqliteDBManager.run(`
                        UPDATE settings SET 
                            setting_value = ?, setting_type = ?, updated_at = CURRENT_TIMESTAMP
                        WHERE store_id = 1 AND setting_key = ?
                    `, [settingValue, settingType, key]);
                } else {
                    // Insert new setting
                    await sqliteDBManager.run(`
                        INSERT INTO settings (
                            store_id, setting_key, setting_value, setting_type,
                            created_at, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?)
                    `, [
                        1, key, settingValue, settingType,
                        new Date().toISOString(), new Date().toISOString()
                    ]);
                }
            }

            console.log("Settings saved successfully:", settingsData);

            res.status(200).json({
                success: true,
                message: "Settings updated successfully",
                data: {
                    _id: 1,
                    settings: settingsData
                }
            });
        } catch (error) {
            console.error("Error saving settings:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
    });
});

/**
 * GET endpoint: Get specific setting by key
 */
router.get("/:key", async function (req, res) {
    if (!req.params.key) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Setting key is required.",
        });
    }

    try {
        await initializeDatabase();

        const setting = await sqliteDBManager.get(`
            SELECT setting_key, setting_value, setting_type 
            FROM settings 
            WHERE store_id = 1 AND setting_key = ?
        `, [req.params.key]);

        if (!setting) {
            return res.status(404).json({
                error: "Not Found",
                message: "Setting not found.",
            });
        }

        // Parse JSON value if needed
        let value = setting.setting_value;
        if (setting.setting_type === 'JSON' && value) {
            try {
                value = JSON.parse(value);
            } catch (e) {
                console.error("Error parsing JSON setting:", setting.setting_key, e);
            }
        }

        res.json({
            key: setting.setting_key,
            value: value,
            type: setting.setting_type
        });
    } catch (error) {
        console.error("Error getting setting:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Update specific setting by key
 */
router.post("/:key", async function (req, res) {
    if (!req.params.key) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Setting key is required.",
        });
    }

    if (req.body.value === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Setting value is required.",
        });
    }

    try {
        await initializeDatabase();

        const key = req.params.key;
        const value = req.body.value;
        const type = req.body.type || 'STRING';

        // Check if setting exists
        const existing = await sqliteDBManager.get(`
            SELECT id FROM settings 
            WHERE store_id = 1 AND setting_key = ?
        `, [key]);

        if (existing) {
            // Update existing setting
            await sqliteDBManager.run(`
                UPDATE settings SET 
                    setting_value = ?, setting_type = ?, updated_at = CURRENT_TIMESTAMP
                WHERE store_id = 1 AND setting_key = ?
            `, [typeof value === 'object' ? JSON.stringify(value) : value, type, key]);
        } else {
            // Insert new setting
            await sqliteDBManager.run(`
                INSERT INTO settings (
                    store_id, setting_key, setting_value, setting_type,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)
            `, [
                1, key,
                typeof value === 'object' ? JSON.stringify(value) : value,
                type,
                new Date().toISOString(), new Date().toISOString()
            ]);
        }

        res.json({
            success: true,
            message: "Setting updated successfully",
            key: key,
            value: value
        });
    } catch (error) {
        console.error("Error updating setting:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete specific setting by key
 */
router.delete("/:key", async function (req, res) {
    if (!req.params.key) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Setting key is required.",
        });
    }

    try {
        await initializeDatabase();

        const result = await sqliteDBManager.run(`
            DELETE FROM settings 
            WHERE store_id = 1 AND setting_key = ?
        `, [req.params.key]);

        if (result.changes === 0) {
            return res.status(404).json({
                error: "Not Found",
                message: "Setting not found.",
            });
        }

        res.json({
            success: true,
            message: "Setting deleted successfully"
        });
    } catch (error) {
        console.error("Error deleting setting:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});