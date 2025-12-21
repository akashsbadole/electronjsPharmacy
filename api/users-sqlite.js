const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const bcrypt = require("bcryptjs");
const validator = require("validator");
const sqliteDBManager = require('./sqlite-db-manager');

const saltRounds = 10;

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
            WHERE type='table' AND name='users'
        `);
        
        if (!tableExists) {
            console.log("Users table does not exist, creating...");
            await sqliteDBManager.run(`
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    store_id INTEGER NOT NULL,
                    username VARCHAR(50) UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    full_name VARCHAR(100) NOT NULL,
                    email VARCHAR(100),
                    phone VARCHAR(15),
                    role VARCHAR(20) DEFAULT 'STAFF',
                    permissions TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    last_login DATETIME,
                    login_attempts INTEGER DEFAULT 0,
                    locked_until DATETIME,
                    password_changed_at DATETIME,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    sync_version INTEGER DEFAULT 1,
                    FOREIGN KEY (store_id) REFERENCES stores(id)
                )
            `);
        }
        
        dbInitialized = true;
        console.log("Users SQLite database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize users SQLite database:", error);
        throw error;
    }
}

// Initialize database when module loads
initializeDatabase().catch(err => {
    console.error("Database initialization failed in users module:", err);
});

/**
 * GET endpoint: Get welcome message for Users API.
 */
router.get("/", function (req, res) {
    res.send("Users API (SQLite)");
});

/**
 * GET endpoint: Get user details by user ID.
 */
router.get("/user/:userId", async function (req, res) {
    if (!req.params.userId) {
        return res.status(500).send("ID field is required.");
    }
    
    try {
        await initializeDatabase();
        const userId = parseInt(req.params.userId);
        
        const user = await sqliteDBManager.get(`
            SELECT id, store_id, username, full_name, email, phone, role, 
                   permissions, is_active, last_login, created_at, updated_at
            FROM users WHERE id = ? AND is_active = 1
        `, [userId]);
        
        if (!user) {
            return res.status(404).json({
                error: "Not Found",
                message: "User not found.",
            });
        }
        
        res.send(user);
    } catch (error) {
        console.error("Error getting user:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Log out a user by updating user status.
 */
router.get("/logout/:userId", async function (req, res) {
    if (!req.params.userId) {
        return res.status(500).send("ID field is required.");
    }
    
    try {
        await initializeDatabase();
        const userId = parseInt(req.params.userId);
        
        await sqliteDBManager.run(`
            UPDATE users SET last_login = NULL, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [userId]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error logging out user:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Authenticate user login and update user status.
 */
router.post("/login", async function (req, res) {
    try {
        await initializeDatabase();
        
        const username = validator.escape(req.body.username);
        const password = req.body.password;
        
        if (!username || !password) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Username and password are required.",
            });
        }
        
        const user = await sqliteDBManager.get(`
            SELECT id, username, password_hash, full_name, email, phone, role, 
                   permissions, is_active, login_attempts, locked_until
            FROM users WHERE username = ?
        `, [username]);
        
        if (!user) {
            return res.send({ auth: false, message: "Invalid username or password" });
        }
        
        // Check if account is locked
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            return res.send({ 
                auth: false, 
                message: "Account is temporarily locked. Please try again later." 
            });
        }
        
        // Check if account is active
        if (!user.is_active) {
            return res.send({ 
                auth: false, 
                message: "Account is deactivated." 
            });
        }
        
        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (isValidPassword) {
            // Reset login attempts on successful login
            await sqliteDBManager.run(`
                UPDATE users SET 
                    last_login = CURRENT_TIMESTAMP,
                    login_attempts = 0,
                    locked_until = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [user.id]);
            
            // Return user without password hash
            const { password_hash, ...userWithoutPassword } = user;
            res.send({ ...userWithoutPassword, auth: true });
        } else {
            // Increment login attempts on failed login
            const newAttempts = (user.login_attempts || 0) + 1;
            const maxAttempts = 5;
            
            if (newAttempts >= maxAttempts) {
                // Lock account for 30 minutes
                const lockUntil = new Date(Date.now() + 30 * 60 * 1000);
                
                await sqliteDBManager.run(`
                    UPDATE users SET 
                        login_attempts = ?,
                        locked_until = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [newAttempts, lockUntil.toISOString(), user.id]);
                
                return res.send({ 
                    auth: false, 
                    message: "Too many failed login attempts. Account locked for 30 minutes." 
                });
            } else {
                await sqliteDBManager.run(`
                    UPDATE users SET 
                        login_attempts = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [newAttempts, user.id]);
                
                return res.send({ 
                    auth: false, 
                    message: `Invalid username or password. ${maxAttempts - newAttempts} attempts remaining.` 
                });
            }
        }
    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get details of all users.
 */
router.get("/all", async function (req, res) {
    try {
        await initializeDatabase();
        
        const users = await sqliteDBManager.all(`
            SELECT id, store_id, username, full_name, email, phone, role, 
                   permissions, is_active, last_login, created_at, updated_at
            FROM users ORDER BY full_name
        `);
        
        res.send(users);
    } catch (error) {
        console.error("Error getting all users:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete a user by user ID.
 */
router.delete("/user/:userId", async function (req, res) {
    try {
        await initializeDatabase();
        const userId = parseInt(req.params.userId);
        
        // Check if user exists
        const user = await sqliteDBManager.get("SELECT id FROM users WHERE id = ?", [userId]);
        if (!user) {
            return res.status(404).json({
                error: "Not Found",
                message: "User not found.",
            });
        }
        
        // Soft delete by setting is_active to 0
        await sqliteDBManager.run(`
            UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [userId]);
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create or update a user.
 */
router.post("/post", async function (req, res) {
    try {
        await initializeDatabase();
        
        const userId = req.body.id;
        const isUpdate = userId && userId !== "";
        
        // Validate required fields
        if (!req.body.username || validator.isEmpty(req.body.username.trim())) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Username is required.",
            });
        }
        
        if (!req.body.full_name || validator.isEmpty(req.body.full_name.trim())) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Full name is required.",
            });
        }
        
        if (!isUpdate && (!req.body.password || validator.isEmpty(req.body.password))) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Password is required for new users.",
            });
        }
        
        // Process permissions
        const permissions = {
            perm_products: req.body.perm_products === "on" ? 1 : 0,
            perm_categories: req.body.perm_categories === "on" ? 1 : 0,
            perm_transactions: req.body.perm_transactions === "on" ? 1 : 0,
            perm_users: req.body.perm_users === "on" ? 1 : 0,
            perm_settings: req.body.perm_settings === "on" ? 1 : 0
        };
        
        const userData = {
            store_id: req.body.storeId || 1,
            username: validator.escape(req.body.username.trim()),
            full_name: validator.escape(req.body.full_name.trim()),
            email: req.body.email ? validator.escape(req.body.email.trim()) : null,
            phone: req.body.phone ? validator.escape(req.body.phone.trim()) : null,
            role: req.body.role ? validator.escape(req.body.role) : 'STAFF',
            permissions: JSON.stringify(permissions),
            is_active: 1
        };
        
        if (isUpdate) {
            // Update existing user
            const updateUserId = parseInt(userId);
            
            // Check if username is being changed and if it's already taken
            const existingUser = await sqliteDBManager.get(`
                SELECT id FROM users WHERE username = ? AND id != ?
            `, [userData.username, updateUserId]);
            
            if (existingUser) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Username already exists.",
                });
            }
            
            let updateQuery = `
                UPDATE users SET
                    username = ?, full_name = ?, email = ?, phone = ?,
                    role = ?, permissions = ?, updated_at = CURRENT_TIMESTAMP
            `;
            let updateParams = [
                userData.username, userData.full_name, userData.email,
                userData.phone, userData.role, userData.permissions
            ];
            
            // Update password if provided
            if (req.body.password && !validator.isEmpty(req.body.password)) {
                const passwordHash = await bcrypt.hash(req.body.password, saltRounds);
                updateQuery += `, password_hash = ?, password_changed_at = CURRENT_TIMESTAMP`;
                updateParams.push(passwordHash);
            }
            
            updateQuery += ` WHERE id = ?`;
            updateParams.push(updateUserId);
            
            await sqliteDBManager.run(updateQuery, updateParams);
            
            res.sendStatus(200);
        } else {
            // Create new user
            // Check if username already exists
            const existingUser = await sqliteDBManager.get(`
                SELECT id FROM users WHERE username = ?
            `, [userData.username]);
            
            if (existingUser) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Username already exists.",
                });
            }
            
            const passwordHash = await bcrypt.hash(req.body.password, saltRounds);
            
            const result = await sqliteDBManager.run(`
                INSERT INTO users (
                    store_id, username, password_hash, full_name, email, phone,
                    role, permissions, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                userData.store_id, userData.username, passwordHash,
                userData.full_name, userData.email, userData.phone,
                userData.role, userData.permissions, userData.is_active,
                new Date().toISOString(), new Date().toISOString()
            ]);
            
            const newUser = await sqliteDBManager.get(`
                SELECT id, store_id, username, full_name, email, phone, role,
                       permissions, is_active, created_at, updated_at
                FROM users WHERE id = ?
            `, [result.lastID]);
            
            res.status(201).send(newUser);
        }
    } catch (error) {
        console.error("Error creating/updating user:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Check and initialize default admin user if not exists.
 */
router.get("/check", async function (req, res) {
    try {
        await initializeDatabase();
        
        const adminUser = await sqliteDBManager.get("SELECT id FROM users WHERE id = 1");
        
        if (!adminUser) {
            const passwordHash = await bcrypt.hash("admin", saltRounds);
            
            const defaultPermissions = {
                perm_products: 1,
                perm_categories: 1,
                perm_transactions: 1,
                perm_users: 1,
                perm_settings: 1
            };
            
            await sqliteDBManager.run(`
                INSERT INTO users (
                    id, store_id, username, password_hash, full_name,
                    role, permissions, is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                1, 1, "admin", passwordHash, "Administrator",
                "ADMIN", JSON.stringify(defaultPermissions), 1,
                new Date().toISOString(), new Date().toISOString()
            ]);
            
            console.log("Default admin user created successfully");
        }
        
        res.sendStatus(200);
    } catch (error) {
        console.error("Error checking/creating default admin user:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Change user password
 */
router.post("/change-password", async function (req, res) {
    try {
        await initializeDatabase();
        
        const { userId, currentPassword, newPassword } = req.body;
        
        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({
                error: "Bad Request",
                message: "User ID, current password, and new password are required.",
            });
        }
        
        // Get user with current password
        const user = await sqliteDBManager.get(`
            SELECT id, password_hash FROM users WHERE id = ? AND is_active = 1
        `, [parseInt(userId)]);
        
        if (!user) {
            return res.status(404).json({
                error: "Not Found",
                message: "User not found.",
            });
        }
        
        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
        
        if (!isValidPassword) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Current password is incorrect.",
            });
        }
        
        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
        
        // Update password
        await sqliteDBManager.run(`
            UPDATE users SET 
                password_hash = ?, 
                password_changed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [newPasswordHash, parseInt(userId)]);
        
        res.json({ message: "Password changed successfully." });
    } catch (error) {
        console.error("Error changing password:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Reset user password (admin function)
 */
router.post("/reset-password", async function (req, res) {
    try {
        await initializeDatabase();
        
        const { userId, newPassword } = req.body;
        
        if (!userId || !newPassword) {
            return res.status(400).json({
                error: "Bad Request",
                message: "User ID and new password are required.",
            });
        }
        
        // Check if user exists
        const user = await sqliteDBManager.get(`
            SELECT id FROM users WHERE id = ?
        `, [parseInt(userId)]);
        
        if (!user) {
            return res.status(404).json({
                error: "Not Found",
                message: "User not found.",
            });
        }
        
        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
        
        // Update password and reset login attempts
        await sqliteDBManager.run(`
            UPDATE users SET 
                password_hash = ?, 
                password_changed_at = CURRENT_TIMESTAMP,
                login_attempts = 0,
                locked_until = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [newPasswordHash, parseInt(userId)]);
        
        res.json({ message: "Password reset successfully." });
    } catch (error) {
        console.error("Error resetting password:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Unlock user account
 */
router.post("/unlock/:userId", async function (req, res) {
    try {
        await initializeDatabase();
        const userId = parseInt(req.params.userId);
        
        // Check if user exists
        const user = await sqliteDBManager.get(`
            SELECT id FROM users WHERE id = ?
        `, [userId]);
        
        if (!user) {
            return res.status(404).json({
                error: "Not Found",
                message: "User not found.",
            });
        }
        
        // Unlock account
        await sqliteDBManager.run(`
            UPDATE users SET 
                login_attempts = 0,
                locked_until = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [userId]);
        
        res.json({ message: "Account unlocked successfully." });
    } catch (error) {
        console.error("Error unlocking account:", error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});