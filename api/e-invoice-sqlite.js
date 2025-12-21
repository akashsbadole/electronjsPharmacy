const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const validator = require("validator");
const crypto = require("crypto");
const sqliteDBManager = require("./sqlite-db-manager");

router.use(bodyParser.json());

module.exports = router;

/**
 * Initialize e-invoice table in SQLite database
 */
async function initializeEInvoiceTable() {
    const db = await sqliteDBManager.initialize();
    
    // Create e-invoices table if it doesn't exist
    const createTableQuery = `
        CREATE TABLE IF NOT EXISTS e_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id VARCHAR(50) UNIQUE NOT NULL,
            transaction_id VARCHAR(50) UNIQUE NOT NULL,
            irn VARCHAR(100),
            signed_invoice TEXT,
            signed_qr_code TEXT,
            ack_number VARCHAR(50),
            ack_date DATETIME,
            invoice_status VARCHAR(20) DEFAULT 'PENDING',
            cancellation_reason TEXT,
            cancelled_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `;
    
    await db.run(createTableQuery);
    
    // Create indexes
    await db.run('CREATE INDEX IF NOT EXISTS idx_e_invoices_transaction_id ON e_invoices(transaction_id)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_e_invoices_irn ON e_invoices(irn)');
    await db.run('CREATE INDEX IF NOT EXISTS idx_e_invoices_status ON e_invoices(invoice_status)');
}

/**
 * GET endpoint: Get the welcome message for the E-Invoice API.
 */
router.get("/", function (req, res) {
    res.send("E-Invoice API (SQLite)");
});

/**
 * GET endpoint: Retrieve all e-invoice records.
 */
router.get("/", async function (req, res) {
    try {
        await initializeEInvoiceTable();
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
            whereClause = "WHERE invoice_status = ?";
            params.push(status);
        }
        
        // Get total count for pagination
        const countQuery = `SELECT COUNT(*) as total FROM e_invoices ${whereClause}`;
        const countResult = await db.get(countQuery, params);
        const total = countResult.total;
        
        // Get e-invoices with pagination
        const query = `
            SELECT * FROM e_invoices 
            ${whereClause}
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `;
        
        params.push(limit, offset);
        const eInvoices = await db.all(query, params);
        
        res.send({
            data: eInvoices,
            pagination: {
                page: page,
                limit: limit,
                total: total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error retrieving e-invoices:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Get a specific e-invoice by ID.
 */
router.get("/:id", async function (req, res) {
    try {
        if (!req.params.id) {
            return res.status(400).send("ID field is required.");
        }
        
        await initializeEInvoiceTable();
        const db = await sqliteDBManager.initialize();
        
        const query = "SELECT * FROM e_invoices WHERE id = ?";
        const invoice = await db.get(query, [req.params.id]);
        
        if (invoice) {
            res.send(invoice);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "E-Invoice not found.",
            });
        }
    } catch (error) {
        console.error('Error retrieving e-invoice:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Generate a new e-invoice.
 */
router.post("/", async function (req, res) {
    try {
        // Validate required fields
        if (!req.body.transaction_id) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Transaction ID is required.",
            });
        }
        
        await initializeEInvoiceTable();
        const db = await sqliteDBManager.initialize();
        
        // Check if e-invoice already exists for this transaction
        const existingInvoiceQuery = "SELECT id FROM e_invoices WHERE transaction_id = ?";
        const existingInvoice = await db.get(existingInvoiceQuery, [req.body.transaction_id]);
        
        if (existingInvoice) {
            return res.status(409).json({
                error: "Conflict",
                message: "E-Invoice already exists for this transaction.",
            });
        }
        
        // Generate a unique invoice ID
        const invoiceId = crypto.randomBytes(16).toString('hex');
        
        const insertQuery = `
            INSERT INTO e_invoices (
                invoice_id, transaction_id, irn, signed_invoice, signed_qr_code,
                ack_number, ack_date, invoice_status, cancellation_reason, cancelled_at,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const eInvoice = {
            invoice_id: invoiceId,
            transaction_id: validator.escape(req.body.transaction_id),
            irn: null, // Will be generated after GSTN verification
            signed_invoice: null,
            signed_qr_code: null,
            ack_number: null,
            ack_date: null,
            invoice_status: 'PENDING',
            cancellation_reason: null,
            cancelled_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const result = await db.run(insertQuery, [
            eInvoice.invoice_id,
            eInvoice.transaction_id,
            eInvoice.irn,
            eInvoice.signed_invoice,
            eInvoice.signed_qr_code,
            eInvoice.ack_number,
            eInvoice.ack_date,
            eInvoice.invoice_status,
            eInvoice.cancellation_reason,
            eInvoice.cancelled_at,
            eInvoice.created_at.toISOString(),
            eInvoice.updated_at.toISOString()
        ]);
        
        // Get the created invoice
        const newInvoice = await db.get("SELECT * FROM e_invoices WHERE id = ?", [result.lastID]);
        
        // In a real implementation, this would trigger the process to generate IRN
        // For now, we'll simulate to IRN generation
        generateIRN(result.lastID, function (err, updatedInvoice) {
            if (err) {
                console.error('Error generating IRN:', err);
                // Still return the created invoice even if IRN generation failed
                res.status(201).send(newInvoice);
            } else {
                res.status(201).send(updatedInvoice);
            }
        });
    } catch (error) {
        console.error('Error creating e-invoice:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * PUT endpoint: Update an e-invoice status (e.g., mark as generated or cancelled).
 */
router.put("/:id", async function (req, res) {
    try {
        if (!req.params.id) {
            return res.status(400).send("ID field is required.");
        }
        
        // Validate status
        const validStatuses = ['PENDING', 'GENERATED', 'CANCELLED'];
        const status = req.body.invoice_status;
        
        if (status && !validStatuses.includes(status)) {
            return res.status(400).json({
                error: "Bad Request",
                message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            });
        }
        
        await initializeEInvoiceTable();
        const db = await sqliteDBManager.initialize();
        
        // Prepare update data
        const updateFields = [];
        const updateValues = [];
        
        if (status) {
            updateFields.push("invoice_status = ?");
            updateValues.push(status);
            
            if (status === 'CANCELLED') {
                updateFields.push("cancellation_reason = ?");
                updateFields.push("cancelled_at = ?");
                updateValues.push(req.body.cancellation_reason || '');
                updateValues.push(new Date().toISOString());
            }
        }
        
        if (req.body.irn !== undefined) {
            updateFields.push("irn = ?");
            updateValues.push(validator.escape(req.body.irn));
        }
        
        if (req.body.signed_invoice !== undefined) {
            updateFields.push("signed_invoice = ?");
            updateValues.push(validator.escape(req.body.signed_invoice));
        }
        
        if (req.body.signed_qr_code !== undefined) {
            updateFields.push("signed_qr_code = ?");
            updateValues.push(validator.escape(req.body.signed_qr_code));
        }
        
        if (req.body.ack_number !== undefined) {
            updateFields.push("ack_number = ?");
            updateValues.push(validator.escape(req.body.ack_number));
        }
        
        if (req.body.ack_date !== undefined) {
            updateFields.push("ack_date = ?");
            updateValues.push(new Date(req.body.ack_date).toISOString());
        }
        
        // Always update the updated_at timestamp
        updateFields.push("updated_at = ?");
        updateValues.push(new Date().toISOString());
        
        // Add the ID to the end of the values array
        updateValues.push(req.params.id);
        
        const updateQuery = `
            UPDATE e_invoices 
            SET ${updateFields.join(', ')}
            WHERE id = ?
        `;
        
        const result = await db.run(updateQuery, updateValues);
        
        if (result.changes === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "E-Invoice not found.",
            });
        } else {
            // Return the updated invoice
            const updatedInvoice = await db.get("SELECT * FROM e_invoices WHERE id = ?", [req.params.id]);
            res.send(updatedInvoice);
        }
    } catch (error) {
        console.error('Error updating e-invoice:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * DELETE endpoint: Delete an e-invoice by ID.
 */
router.delete("/:id", async function (req, res) {
    try {
        if (!req.params.id) {
            return res.status(400).send("ID field is required.");
        }
        
        await initializeEInvoiceTable();
        const db = await sqliteDBManager.initialize();
        
        // Check if invoice is already generated
        const checkQuery = "SELECT id FROM e_invoices WHERE id = ? AND invoice_status = 'GENERATED'";
        const generatedInvoice = await db.get(checkQuery, [req.params.id]);
        
        if (generatedInvoice) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete a generated e-invoice. Please cancel it instead.",
            });
        }
        
        const deleteQuery = "DELETE FROM e_invoices WHERE id = ?";
        const result = await db.run(deleteQuery, [req.params.id]);
        
        if (result.changes === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "E-Invoice not found.",
            });
        } else {
            res.sendStatus(200);
        }
    } catch (error) {
        console.error('Error deleting e-invoice:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * GET endpoint: Export e-invoice data as JSON for GSTN.
 */
router.get("/:id/export", async function (req, res) {
    try {
        if (!req.params.id) {
            return res.status(400).send("ID field is required.");
        }
        
        await initializeEInvoiceTable();
        const db = await sqliteDBManager.initialize();
        
        const invoiceQuery = "SELECT * FROM e_invoices WHERE id = ?";
        const invoice = await db.get(invoiceQuery, [req.params.id]);
        
        if (!invoice) {
            return res.status(404).json({
                error: "Not Found",
                message: "E-Invoice not found.",
            });
        }
        
        // Get transaction details to include in the export
        const transactionQuery = `
            SELECT t.*, c.name as customer_name, c.gst_number as customer_gst,
                   s.store_name, s.gst_number as store_gst, s.address_line1, s.address_line2,
                   s.city, s.state, s.pincode, s.phone, s.email
            FROM transactions t
            LEFT JOIN customers c ON t.customer_id = c.id
            LEFT JOIN stores s ON t.store_id = s.id
            WHERE t.transaction_number = ?
        `;
        
        const transaction = await db.get(transactionQuery, [invoice.transaction_id]);
        
        // Get transaction items
        const itemsQuery = `
            SELECT ti.*, p.name as product_name, p.hsn_code, pp.gst_rate
            FROM transaction_items ti
            JOIN products p ON ti.product_id = p.id
            LEFT JOIN product_pricing pp ON p.id = pp.product_id AND pp.is_active = 1
            WHERE ti.transaction_id = (SELECT id FROM transactions WHERE transaction_number = ?)
        `;
        
        const items = await db.all(itemsQuery, [invoice.transaction_id]);
        
        // Format export data according to GSTN requirements
        const exportData = {
            Version: "1.1",
            TranDtls: {
                TaxSch: "GST",
                SupTyp: "B2B", // Business to Business
                RegRev: "N",
                EcmGstin: null, // E-commerce GSTIN if applicable
                IgstOnIntra: "N" // IGST on intra-state supplies
            },
            DocDtls: {
                Typ: "INV", // Invoice type
                No: invoice.transaction_id, // Invoice number
                Dt: new Date(invoice.created_at).toISOString().split('T')[0] // Invoice date
            },
            SellerDtls: {
                Gstin: transaction?.store_gst || null, // GSTIN from store
                LglNm: transaction?.store_name || null, // Legal name
                TrdNm: transaction?.store_name || null, // Trade name
                Addr1: transaction?.address_line1 || null, // Address line 1
                Addr2: transaction?.address_line2 || null, // Address line 2
                Loc: transaction?.city || null, // Location
                Pin: transaction?.pincode || null, // Pincode
                Stcd: transaction?.state || null, // State code
                Ph: transaction?.phone || null, // Phone
                Em: transaction?.email || null // Email
            },
            BuyerDtls: {
                Gstin: transaction?.customer_gst || null, // GSTIN from customer
                LglNm: transaction?.customer_name || null, // Legal name
                TrdNm: transaction?.customer_name || null, // Trade name
                Addr1: null, // Address line 1 - would need customer address
                Addr2: null, // Address line 2 - would need customer address
                Loc: null, // Location - would need customer address
                Pin: null, // Pincode - would need customer address
                Stcd: null, // State code - would need customer address
                Ph: null, // Phone - would need customer phone
                Em: null // Email - would need customer email
            },
            ItemList: items.map(item => ({
                SlNo: "1", // Serial number
                IsServc: "N", // Is service
                ItemDesc: item.product_name, // Item description
                HsnCd: item.hsn_code || "", // HSN code
                Barcde: "", // Barcode
                Qty: item.quantity, // Quantity
                Unit: "NOS", // Unit
                UnitPrice: item.unit_price, // Unit price
                TotAmt: item.total_price, // Total amount
                Discount: 0, // Discount
                PreTaxVal: item.total_price, // Pre-tax value
                AssAmt: item.total_price, // Assessable value
                GstRt: item.gst_rate || 0, // GST rate
                IgstAmt: 0, // IGST amount
                CgstAmt: (item.total_price * (item.gst_rate || 0) / 200), // CGST amount (half of GST)
                SgstAmt: (item.total_price * (item.gst_rate || 0) / 200), // SGST amount (half of GST)
                CessRate: 0, // CESS rate
                CessAmt: 0, // CESS amount
                CesNonAdvlAmt: 0, // CESS non-advol amount
                StateCesRt: 0, // State CESS rate
                StateCesAmt: 0, // State CESS amount
                StateCesNonAdvlAmt: 0, // State CESS non-advol amount
                OthChrg: 0 // Other charges
            })),
            ValDtls: {
                AssVal: transaction?.subtotal || 0, // Assessable value
                CgstVal: items.reduce((sum, item) => sum + (item.total_price * (item.gst_rate || 0) / 200), 0), // CGST value
                SgstVal: items.reduce((sum, item) => sum + (item.total_price * (item.gst_rate || 0) / 200), 0), // SGST value
                IgstVal: 0, // IGST value
                CessVal: 0, // CESS value
                OthChrg: 0, // Other charges
                TotInvVal: transaction?.total_amount || 0, // Total invoice value
                Disc: 0, // Discount
                OthDisc: 0, // Other discount
                PreTaxVal: transaction?.subtotal || 0, // Pre-tax value
                TotInvValFc: 0 // Total invoice value in foreign currency
            },
            PayDtls: {
                CrDay: 0, // Credit days
                PaidAmt: 0, // Paid amount
                PaymtDue: 0 // Payment due
            },
            RefDtls: {
                PrecDocDtls: [], // Preceding document details
                ContrDtls: [], // Contract details
                ExtDocDtls: [], // Extending document details
                ProjDtls: [] // Project details
            },
            AddlDocDtls: [], // Additional document details
            ExpDtls: null // Export details
        };
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="e-invoice-${invoice.invoice_id}.json"`);
        res.send(JSON.stringify(exportData, null, 2));
    } catch (error) {
        console.error('Error exporting e-invoice:', error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * Helper function to generate IRN (Invoice Reference Number)
 * In a real implementation, this would call to GSTN API
 */
function generateIRN(invoiceId, callback) {
    // In a real implementation, this would:
    // 1. Get the transaction details
    // 2. Get the GST configuration
    // 3. Format data according to GSTN requirements
    // 4. Call to GSTN API to generate IRN
    // 5. Update the invoice with the response
    
    // For now, we'll simulate the process with a timeout
    setTimeout(async function() {
        try {
            const db = await sqliteDBManager.initialize();
            
            // Generate a mock IRN (64 characters as per GSTN specification)
            const mockIRN = crypto.randomBytes(32).toString('hex').toUpperCase();
            
            // Generate a mock acknowledgement number (20 characters)
            const mockAckNumber = Math.floor(10000000000000000000 + Math.random() * 90000000000000000000).toString();
            
            // Update the invoice with mock data
            const updateQuery = `
                UPDATE e_invoices 
                SET irn = ?, signed_invoice = ?, signed_qr_code = ?, 
                    ack_number = ?, ack_date = ?, invoice_status = ?, updated_at = ?
                WHERE id = ?
            `;
            
            await db.run(updateQuery, [
                mockIRN,
                "mock_signed_invoice_data",
                "mock_qr_code_data",
                mockAckNumber,
                new Date().toISOString(),
                "GENERATED",
                new Date().toISOString(),
                invoiceId
            ]);
            
            // Get the updated invoice
            const updatedInvoice = await db.get("SELECT * FROM e_invoices WHERE id = ?", [invoiceId]);
            
            callback(null, updatedInvoice);
        } catch (error) {
            callback(error);
        }
    }, 2000); // Simulate a 2-second delay for the API call
}