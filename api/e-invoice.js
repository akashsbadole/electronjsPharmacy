const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const validator = require("validator");
const path = require("path");
const crypto = require("crypto");

const appName = process.env.APPNAME || 'PharmaSoft';
const appData = process.env.APPDATA || (process.platform === 'win32' ? process.env.USERPROFILE + '/AppData/Roaming' : process.env.HOME + '/.config');
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "e-invoices.db",
);

router.use(bodyParser.json());

module.exports = router;

let eInvoiceDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

eInvoiceDB.ensureIndex({ fieldName: "_id", unique: true });
eInvoiceDB.ensureIndex({ fieldName: "transaction_id", unique: true });
eInvoiceDB.ensureIndex({ fieldName: "irn", unique: true, sparse: true });

/**
 * GET endpoint: Get the welcome message for the E-Invoice API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("E-Invoice API");
});

/**
 * GET endpoint: Retrieve all e-invoice records.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    // Support pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Support filtering by status
    const status = req.query.status;
    const query = status ? { invoice_status: status } : {};
    
    eInvoiceDB.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, docs) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                // Get total count for pagination
                eInvoiceDB.count(query, function (err, count) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.send({
                        data: docs,
                        pagination: {
                            page: page,
                            limit: limit,
                            total: count,
                            pages: Math.ceil(count / limit)
                        }
                    });
                });
            }
        });
});

/**
 * GET endpoint: Get a specific e-invoice by ID.
 *
 * @param {Object} req request object with e-invoice ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    eInvoiceDB.findOne({ _id: req.params.id }, function (err, invoice) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else if (invoice) {
            res.send(invoice);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "E-Invoice not found.",
            });
        }
    });
});

/**
 * POST endpoint: Generate a new e-invoice.
 *
 * @param {Object} req request object with e-invoice data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.transaction_id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transaction ID is required.",
        });
    }

    // Check if e-invoice already exists for this transaction
    eInvoiceDB.findOne({ transaction_id: req.body.transaction_id }, function (err, existingInvoice) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (existingInvoice) {
            return res.status(409).json({
                error: "Conflict",
                message: "E-Invoice already exists for this transaction.",
            });
        }

        // Generate a unique ID for the e-invoice
        const invoiceId = crypto.randomBytes(16).toString('hex');
        
        const eInvoice = {
            _id: invoiceId,
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

        // Insert the new e-invoice
        eInvoiceDB.insert(eInvoice, function (err, newInvoice) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                // In a real implementation, this would trigger the process to generate IRN
                // For now, we'll simulate the IRN generation
                generateIRN(newInvoice._id, function (err, updatedInvoice) {
                    if (err) {
                        console.error(err);
                        // Still return the created invoice even if IRN generation failed
                        res.status(201).send(newInvoice);
                    } else {
                        res.status(201).send(updatedInvoice);
                    }
                });
            }
        });
    });
});

/**
 * PUT endpoint: Update an e-invoice status (e.g., mark as generated or cancelled).
 *
 * @param {Object} req request object with e-invoice ID and update data.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
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

    // Prepare update data
    const updateData = {
        updated_at: new Date()
    };

    if (status) {
        updateData.invoice_status = status;
        
        if (status === 'CANCELLED') {
            updateData.cancellation_reason = req.body.cancellation_reason || '';
            updateData.cancelled_at = new Date();
        }
    }

    if (req.body.irn) {
        updateData.irn = validator.escape(req.body.irn);
    }

    if (req.body.signed_invoice) {
        updateData.signed_invoice = validator.escape(req.body.signed_invoice);
    }

    if (req.body.signed_qr_code) {
        updateData.signed_qr_code = validator.escape(req.body.signed_qr_code);
    }

    if (req.body.ack_number) {
        updateData.ack_number = validator.escape(req.body.ack_number);
    }

    if (req.body.ack_date) {
        updateData.ack_date = new Date(req.body.ack_date);
    }

    eInvoiceDB.update(
        { _id: req.params.id },
        { $set: updateData },
        {},
        function (err, numReplaced) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else if (numReplaced === 0) {
                res.status(404).json({
                    error: "Not Found",
                    message: "E-Invoice not found.",
                });
            } else {
                // Return the updated invoice
                eInvoiceDB.findOne({ _id: req.params.id }, function (err, invoice) {
                    if (err) {
                        console.error(err);
                        res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    } else {
                        res.send(invoice);
                    }
                });
            }
        }
    );
});

/**
 * DELETE endpoint: Delete an e-invoice by ID.
 *
 * @param {Object} req request object with e-invoice ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    // Check if the invoice is already generated
    eInvoiceDB.findOne({ _id: req.params.id, invoice_status: 'GENERATED' }, function (err, invoice) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (invoice) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete a generated e-invoice. Please cancel it instead.",
            });
        }

        // Delete the invoice
        eInvoiceDB.remove({ _id: req.params.id }, function (err, numRemoved) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else if (numRemoved === 0) {
                res.status(404).json({
                    error: "Not Found",
                    message: "E-Invoice not found.",
                });
            } else {
                res.sendStatus(200);
            }
        });
    });
});

/**
 * GET endpoint: Export e-invoice data as JSON for GSTN.
 *
 * @param {Object} req request object with e-invoice ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id/export", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    eInvoiceDB.findOne({ _id: req.params.id }, function (err, invoice) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!invoice) {
            return res.status(404).json({
                error: "Not Found",
                message: "E-Invoice not found.",
            });
        }

        // Get transaction details to include in the export
        const transactionsDB = require("./transactions");
        // This is a simplified approach - in a real implementation, 
        // we would have a proper way to access the transactions database
        
        // For now, we'll return the e-invoice data in the expected format
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
                Gstin: null, // Will be populated from GST config
                LglNm: null, // Legal name
                TrdNm: null, // Trade name
                Addr1: null, // Address line 1
                Addr2: null, // Address line 2
                Loc: null, // Location
                Pin: null, // Pincode
                Stcd: null, // State code
                Ph: null, // Phone
                Em: null // Email
            },
            BuyerDtls: {
                Gstin: null, // Will be populated from customer data
                LglNm: null, // Legal name
                TrdNm: null, // Trade name
                Addr1: null, // Address line 1
                Addr2: null, // Address line 2
                Loc: null, // Location
                Pin: null, // Pincode
                Stcd: null, // State code
                Ph: null, // Phone
                Em: null // Email
            },
            ItemList: [], // Will be populated from transaction items
            ValDtls: {
                AssVal: null, // Assessable value
                CgstVal: null, // CGST value
                SgstVal: null, // SGST value
                IgstVal: null, // IGST value
                CessVal: null, // CESS value
                OthChrg: null, // Other charges
                TotInvVal: null, // Total invoice value
                Disc: null, // Discount
                OthDisc: null, // Other discount
                PreTaxVal: null, // Pre-tax value
                TotInvValFc: null // Total invoice value in foreign currency
            },
            PayDtls: {
                CrDay: null, // Credit days
                PaidAmt: null, // Paid amount
                PaymtDue: null // Payment due
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
        res.setHeader('Content-Disposition', `attachment; filename="e-invoice-${invoice._id}.json"`);
        res.send(JSON.stringify(exportData, null, 2));
    });
});

/**
 * Helper function to generate IRN (Invoice Reference Number)
 * In a real implementation, this would call the GSTN API
 *
 * @param {String} invoiceId The ID of the invoice
 * @param {Function} callback Callback function
 * @returns {void}
 */
function generateIRN(invoiceId, callback) {
    // In a real implementation, this would:
    // 1. Get the transaction details
    // 2. Get the GST configuration
    // 3. Format the data according to GSTN requirements
    // 4. Call the GSTN API to generate IRN
    // 5. Update the invoice with the response

    // For now, we'll simulate the process with a timeout
    setTimeout(function() {
        // Generate a mock IRN (64 characters as per GSTN specification)
        const mockIRN = crypto.randomBytes(32).toString('hex').toUpperCase();
        
        // Generate a mock acknowledgement number (20 characters)
        const mockAckNumber = Math.floor(10000000000000000000 + Math.random() * 90000000000000000000).toString();
        
        // Update the invoice with the mock data
        eInvoiceDB.update(
            { _id: invoiceId },
            { 
                $set: {
                    irn: mockIRN,
                    signed_invoice: "mock_signed_invoice_data",
                    signed_qr_code: "mock_qr_code_data",
                    ack_number: mockAckNumber,
                    ack_date: new Date(),
                    invoice_status: "GENERATED",
                    updated_at: new Date()
                }
            },
            {},
            function (err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                
                // Get the updated invoice
                eInvoiceDB.findOne({ _id: invoiceId }, function (err, invoice) {
                    if (err) {
                        return callback(err);
                    }
                    
                    callback(null, invoice);
                });
            }
        );
    }, 2000); // Simulate a 2-second delay for the API call
}