const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const validator = require("validator");
const crypto = require("crypto");
const sqliteDBManager = require("./sqlite-db-manager");

router.use(bodyParser.json());

module.exports = router;

/**
 * Initialize e-way bill table in SQLite database
 */
async function initializeEWayBillTable() {
    const db = await sqliteDBManager.initialize();
    
    // Create e-way bills table if it doesn't exist
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS eway_bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id VARCHAR(50) UNIQUE NOT NULL,
            transaction_id VARCHAR(50) UNIQUE NOT NULL,
            eway_bill_number VARCHAR(50),
            generated_date DATETIME,
            valid_until DATETIME,
            from_state VARCHAR(50),
            to_state VARCHAR(50),
            from_pincode VARCHAR(6),
            to_pincode VARCHAR(6),
            transporter_id VARCHAR(50),
            vehicle_number VARCHAR(20),
            distance_km INTEGER,
            document_status VARCHAR(20) DEFAULT 'ACTIVE',
            cancel_reason TEXT,
            cancelled_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    await db.run(createTableQuery);
    
    // Create indexes
    await db.run('CREATE INDEX IF NOT EXISTS idx_eway_bills_transaction_id ON eway_bills(transaction_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_eway_bills_eway_bill_number ON eway_bills(eway_bill_number)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_eway_bills_status ON eway_bills(document_status)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_eway_bills_valid_until ON eway_bills(valid_until)');
}

/**
 * GET endpoint: Get welcome message for the E-Way Bill API.
 */
router.get("/", function (req, res) {
    res.send("E-Way Bill API (SQLite)");
});

/**
 * GET endpoint: Retrieve all e-way bill records.
 */
router.get("/", async function (req, res) {
    try {
        await initializeEWayBillTable();
        const db = await sqliteDBManager.initialize();
        
        // Support pagination
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        
        // Support filtering by status
        const status = req.query.status;
        let whereClause = "";
        let params = [];
        
        if (status) {
            whereClause = "WHERE document_status = ?";
            params.push(status);
        }
        
        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) as total FROM eway_bills ${whereClause}`;
        const countResult = await db.get(countQuery, params);
        const total = countResult.total;
        
        // Get e-way bills with pagination
        const query = `
            SELECT * FROM eway_bills 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `;
        
        params.push(limit, offset);
        const eWayBills = await db.all(query, params);
        
        res.send({
            data: eWayBills,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error retrieving e-way bills:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get a specific e-way bill by ID.
 */
router.get("/:id", async function (req, res) {
    try {
        if (!req.params.id) {
            return res.status(400).send("ID field is required.");
        }
        
        await initializeEWayBillTable();
        const db = await sqliteDBManager.initialize();
        
        const query = "SELECT * FROM eway_bills WHERE id = ?";
        const eWayBill = await db.get(query, [req.params.id]);
        
        if (eWayBill) {
            res.send(eWayBill);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "E-Way Bill not found.",
            });
        }
    } catch (error) {
        console.error('Error retrieving e-way bill:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Generate a new e-way bill.
 */
router.post("/", async function (req, res) {
    try {
        // Validate required fields
        if (!req.body.transaction_id || !req.body.from_state || !req.body.to_state || 
            !req.body.from_pincode || !req.body.to_pincode) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Transaction ID, from state, to state, from pincode, and to pincode are required fields.",
            });
        }
        
        // Validate pincodes (6 digits)
        if (!/^\d{6}$/.test(req.body.from_pincode) || !/^\d{6}$/.test(req.body.to_pincode)) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Pincodes must be 6 digits.",
            });
        }
        
        await initializeEWayBillTable();
        const db = await sqliteDBManager.initialize();
        
        // Check if e-way bill already exists for this transaction
        const existingBillQuery = "SELECT id FROM eway_bills WHERE transaction_id = ?";
        const existingBill = await db.get(existingBillQuery, [req.body.transaction_id]);
        
        if (existingBill) {
            return res.status(409).json({
                error: "Conflict",
                message: "E-Way Bill already exists for this transaction.",
            });
        }
        
        // Calculate validity date (default 1 day from generation date)
        const generatedDate = req.body.generated_date ? new Date(req.body.generated_date) : new Date();
        const validUntil = new Date(generatedDate);
        validUntil.setDate(validUntil.getDate() + 1);
        
        // Generate a unique bill ID
        const billId = crypto.randomBytes(16).toString('hex');
        
        const insertQuery = `
            INSERT INTO eway_bills (
                bill_id, transaction_id, eway_bill_number, generated_date, valid_until,
                from_state, to_state, from_pincode, to_pincode, transporter_id,
                vehicle_number, distance_km, document_status, cancel_reason, cancelled_at,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const eWayBill = {
            bill_id: billId,
            transaction_id: validator.escape(req.body.transaction_id),
            eway_bill_number: null, // Will be generated after GSTN verification
            generated_date: generatedDate,
            valid_until: validUntil,
            from_state: validator.escape(req.body.from_state),
            to_state: validator.escape(req.body.to_state),
            from_pincode: validator.escape(req.body.from_pincode),
            to_pincode: validator.escape(req.body.to_pincode),
            transporter_id: req.body.transporter_id ? validator.escape(req.body.transporter_id) : null,
            vehicle_number: req.body.vehicle_number ? validator.escape(req.body.vehicle_number) : null,
            distance_km: req.body.distance_km ? parseInt(req.body.distance_km) : 0,
            document_status: 'ACTIVE',
            cancel_reason: null,
            cancelled_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const result = await db.run(insertQuery, [
            eWayBill.bill_id,
            eWayBill.transaction_id,
            eWayBill.eway_bill_number,
            eWayBill.generated_date.toISOString(),
            eWayBill.valid_until.toISOString(),
            eWayBill.from_state,
            eWayBill.to_state,
            eWayBill.from_pincode,
            eWayBill.to_pincode,
            eWayBill.transporter_id,
            eWayBill.vehicle_number,
            eWayBill.distance_km,
            eWayBill.document_status,
            eWayBill.cancel_reason,
            eWayBill.cancelled_at,
            eWayBill.created_at.toISOString(),
            eWayBill.updated_at.toISOString()
        ]);
        
        // Get created e-way bill
        const newBill = await db.get("SELECT * FROM eway_bills WHERE id = ?", [result.lastID]);
        
        // In a real implementation, this would trigger process to generate e-way bill number
        // For now, we'll simulate generation
        generateEWayBillNumber(result.lastID, function (err, updatedBill) {
            if (err) {
                console.error('Error generating e-way bill number:', err);
                // Still return created bill even if e-way bill number generation failed
                res.status(201).send(newBill);
            } else {
                res.status(201).send(updatedBill);
            }
        });
    } catch (error) {
        console.error('Error creating e-way bill:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update an e-way bill (e.g., update vehicle number, extend validity).
 */
router.put("/:id", async function (req, res) {
    try {
        if (!req.params.id) {
            return res.status(400).send("ID field is required.");
        }
        
        // Validate status
        const validStatuses = ['ACTIVE', 'CANCELLED', 'EXPIRED'];
        const status = req.body.document_status;
        
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                error: "Bad Request",
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            });
        }
        
        await initializeEWayBillTable();
        const db = await sqliteDBManager.initialize();
        
        // Prepare update data
        const updateFields = [];
        const updateValues = [];
        
        if (status) {
            updateFields.push("document_status = ?");
            updateValues.push(status);
            
            if (status === 'CANCELLED') {
                updateFields.push("cancel_reason = ?");
                updateFields.push("cancelled_at = ?");
                updateValues.push(req.body.cancel_reason || '');
                updateValues.push(new Date().toISOString());
            }
        }
        
        if (req.body.vehicle_number !== undefined) {
            updateFields.push("vehicle_number = ?");
            updateValues.push(validator.escape(req.body.vehicle_number));
        }
        
        if (req.body.distance_km !== undefined) {
            updateFields.push("distance_km = ?");
            updateValues.push(parseInt(req.body.distance_km) || 0);
        }
        
        if (req.body.valid_until !== undefined) {
            updateFields.push("valid_until = ?");
            updateValues.push(new Date(req.body.valid_until).toISOString());
        }
        
        if (req.body.transporter_id !== undefined) {
            updateFields.push("transporter_id = ?");
            updateValues.push(req.body.transporter_id ? validator.escape(req.body.transporter_id) : null);
        }
        
        // Always update the updated_at timestamp
        updateFields.push("updated_at = ?");
        updateValues.push(new Date().toISOString());
        
        // Add ID to the end of the values array
        updateValues.push(req.params.id);
        
        const updateQuery = `
            UPDATE eway_bills 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `;
        
        const result = await db.run(updateQuery, updateValues);
        
        if (result.changes === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "E-Way Bill not found.",
            });
        } else {
            // Return updated e-way bill
            const updatedBill = await db.get("SELECT * FROM eway_bills WHERE id = ?", [req.params.id]);
            res.send(updatedBill);
        }
    } catch (error) {
        console.error('Error updating e-way bill:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete an e-way bill by ID.
 */
router.delete("/:id", async function (req, res) {
    try {
        if (!req.params.id) {
            return res.status(400).send("ID field is required.");
        }
        
        await initializeEWayBillTable();
        const db = await sqliteDBManager.initialize();
        
        // Check if e-way bill is active
        const checkQuery = "SELECT id FROM eway_bills WHERE id = ? AND document_status = 'ACTIVE'";
        const activeBill = await db.get(checkQuery, [req.params.id]);
        
        if (activeBill) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete an active e-way bill. Please cancel it instead.",
            });
        }
        
        const deleteQuery = "DELETE FROM eway_bills WHERE id = ?";
        const result = await db.run(deleteQuery, [req.params.id]);
        
        if (result.changes === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "E-Way Bill not found.",
            });
        } else {
            res.sendStatus(200);
        }
    } catch (error) {
        console.error('Error deleting e-way bill:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Cancel an e-way bill.
 */
router.post("/:id/cancel", async function (req, res) {
    try {
        if (!req.params.id) {
            return res.status(400).send("ID field is required.");
        }
        
        if (!req.body.cancel_reason) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cancellation reason is required.",
            });
        }
        
        await initializeEWayBillTable();
        const db = await sqliteDBManager.initialize();
        
        const updateQuery = `
            UPDATE eway_bills 
            SET document_status = ?, cancel_reason = ?, cancelled_at = ?, updated_at = ?
            WHERE id = ? AND document_status = 'ACTIVE'
        `;
        
        const result = await db.run(updateQuery, [
            'CANCELLED',
            validator.escape(req.body.cancel_reason),
            new Date().toISOString(),
            new Date().toISOString(),
            req.params.id
        ]);
        
        if (result.changes === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "Active E-Way Bill not found.",
            });
        } else {
            // Return updated e-way bill
            const updatedBill = await db.get("SELECT * FROM eway_bills WHERE id = ?", [req.params.id]);
            res.send(updatedBill);
        }
    } catch (error) {
        console.error('Error cancelling e-way bill:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get e-way bills that are expiring soon (within 24 hours).
 */
router.get("/expiring-soon", async function (req, res) {
    try {
        await initializeEWayBillTable();
        const db = await sqliteDBManager.initialize();
        
        // Calculate 24 hours from now
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const query = `
            SELECT * FROM eway_bills 
            WHERE document_status = 'ACTIVE' AND valid_until <= ?
            ORDER BY valid_until ASC
        `;
        
        const expiringBills = await db.all(query, [tomorrow.toISOString()]);
        
        res.send(expiringBills);
    } catch (error) {
        console.error('Error getting expiring e-way bills:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get e-way bills by e-way bill number.
 */
router.get("/number/:ewayBillNumber", async function (req, res) {
    try {
        if (!req.params.ewayBillNumber) {
            return res.status(400).send("E-Way Bill number is required.");
        }
        
        await initializeEWayBillTable();
        const db = await sqliteDBManager.initialize();
        
        const query = "SELECT * FROM eway_bills WHERE eway_bill_number = ?";
        const bill = await db.get(query, [req.params.ewayBillNumber]);
        
        if (bill) {
            res.send(bill);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "E-Way Bill not found.",
            });
        }
    } catch (error) {
        console.error('Error retrieving e-way bill by number:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * Helper function to generate e-way bill number
 * In a real implementation, this would call GSTN API
 */
function generateEWayBillNumber(billId, callback) {
    // In a real implementation, this would:
    // 1. Get transaction details
    // 2. Get e-way bill data
    // 3. Format data according to GSTN requirements
    // 4. Call GSTN API to generate e-way bill number
    // 5. Update e-way bill with response
    
    // For now, we'll simulate the process with a timeout
    setTimeout(async function() {
        try {
            const db = await sqliteDBManager.initialize();
            
            // Generate a mock e-way bill number (12 characters as per GSTN specification)
            const mockBillNumber = Math.floor(100000000000 + Math.random() * 900000000000).toString();
            
            // Update e-way bill with mock data
            const updateQuery = `
                UPDATE eway_bills 
                SET eway_bill_number = ?, updated_at = ?
                WHERE id = ?
            `;
            
            await db.run(updateQuery, [
                mockBillNumber,
                new Date().toISOString(),
                billId
            ]);
            
            // Get updated e-way bill
            const updatedBill = await db.get("SELECT * FROM eway_bills WHERE id = ?", [billId]);
            
            callback(null, updatedBill);
        } catch (error) {
            callback(error);
        }
    }, 2000); // Simulate a 2-second delay for the API call
}