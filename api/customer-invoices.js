const express = require("express");
const router = express.Router();
const Datastore = require("@seald-io/nedb");
const path = require("path");
const validator = require("validator");

// Database paths
const dbPath = path.join(
    process.env.APPDATA ||
        (process.platform == "darwin"
            ? process.env.HOME + "/Library/Preferences"
            : process.env.HOME + "/.local/share"),
    "PharmaSoft",
    "databases",
    "customer-invoices.db",
);

let customerInvoicesDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

customerInvoicesDB.ensureIndex({ fieldName: "_id", unique: true });
customerInvoicesDB.ensureIndex({ fieldName: "invoiceNumber", unique: true });
customerInvoicesDB.ensureIndex({ fieldName: "customerId" });

/**
 * GET endpoint: Retrieve customer invoices with pagination.
 *
 * @param {Object} req request object with optional query parameters for pagination and filtering.
 * @param {Object} res response object.
 */
router.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.query.customerId) {
        query.customerId = req.query.customerId;
    }
    if (req.query.status) {
        query.status = validator.escape(req.query.status);
    }

    customerInvoicesDB
        .find(query)
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, docs) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve customer invoices.",
                });
            }

            // Get total count for pagination
            customerInvoicesDB.count(query, function (err, count) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to count customer invoices.",
                    });
                }

                res.json({
                    invoices: docs,
                    pagination: {
                        page: page,
                        limit: limit,
                        total: count,
                        pages: Math.ceil(count / limit),
                    },
                });
            });
        });
});

/**
 * GET endpoint: Get specific customer invoice by ID.
 *
 * @param {Object} req request object with invoice ID as a parameter.
 * @param {Object} res response object.
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invoice ID is required.",
        });
    }

    customerInvoicesDB.findOne({ _id: parseInt(req.params.id) }, function (err, invoice) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve customer invoice.",
            });
        }

        if (!invoice) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer invoice not found.",
            });
        }

        res.json(invoice);
    });
});

/**
 * GET endpoint: Get customer invoices by customer ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 */
router.get("/customer/:customerId", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }

    const customerId = req.params.customerId;

    customerInvoicesDB
        .find({ customerId: customerId })
        .sort({ invoiceDate: -1 })
        .exec(function (err, invoices) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve customer invoices.",
                });
            }

            res.json({ invoices: invoices });
        });
});

/**
 * POST endpoint: Create new customer invoice.
 *
 * @param {Object} req request object with invoice data in the body.
 * @param {Object} res response object.
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.customerId || !req.body.totalAmount) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID and total amount are required.",
        });
    }

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber();

    const newInvoice = {
        _id: Math.floor(Date.now() / 1000) + Math.random(),
        invoiceNumber: invoiceNumber,
        customerId: req.body.customerId,
        transactionId: req.body.transactionId || null,
        invoiceDate: req.body.invoiceDate || new Date().toISOString().split('T')[0],
        dueDate: req.body.dueDate || calculateDueDate(req.body.invoiceDate, req.body.paymentTerms),
        totalAmount: parseFloat(req.body.totalAmount),
        balance: parseFloat(req.body.totalAmount),
        status: "PENDING",
        notes: req.body.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    customerInvoicesDB.insert(newInvoice, function (err, invoice) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to create customer invoice.",
            });
        }

        res.status(201).json(invoice);
    });
});

/**
 * PUT endpoint: Update customer invoice.
 *
 * @param {Object} req request object with updated invoice data in the body.
 * @param {Object} res response object.
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invoice ID is required.",
        });
    }

    const invoiceId = parseInt(req.params.id);

    // Check if invoice exists
    customerInvoicesDB.findOne({ _id: invoiceId }, function (err, existingInvoice) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve customer invoice.",
            });
        }

        if (!existingInvoice) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer invoice not found.",
            });
        }

        const updatedInvoice = {
            invoiceDate: req.body.invoiceDate !== undefined ? validator.escape(req.body.invoiceDate) : existingInvoice.invoiceDate,
            dueDate: req.body.dueDate !== undefined ? validator.escape(req.body.dueDate) : existingInvoice.dueDate,
            totalAmount: req.body.totalAmount !== undefined ? parseFloat(req.body.totalAmount) : existingInvoice.totalAmount,
            balance: req.body.balance !== undefined ? parseFloat(req.body.balance) : existingInvoice.balance,
            status: req.body.status !== undefined ? validator.escape(req.body.status) : existingInvoice.status,
            notes: req.body.notes !== undefined ? validator.escape(req.body.notes) : existingInvoice.notes,
            updatedAt: new Date(),
        };

        customerInvoicesDB.update(
            { _id: invoiceId },
            { $set: updatedInvoice },
            {},
            function (err, numReplaced) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to update customer invoice.",
                    });
                }

                if (numReplaced === 0) {
                    return res.status(404).json({
                        error: "Not Found",
                        message: "Customer invoice not found.",
                    });
                }

                res.json({
                    ...updatedInvoice,
                    _id: invoiceId,
                });
            }
        );
    });
});

/**
 * DELETE endpoint: Delete customer invoice.
 *
 * @param {Object} req request object with invoice ID as a parameter.
 * @param {Object} res response object.
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invoice ID is required.",
        });
    }

    const invoiceId = parseInt(req.params.id);

    // Check if invoice exists
    customerInvoicesDB.findOne({ _id: invoiceId }, function (err, invoice) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve customer invoice.",
            });
        }

        if (!invoice) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer invoice not found.",
            });
        }

        // Check if invoice has payments
        const Datastore = require("@seald-io/nedb");
        const paymentsDbPath = path.join(
            process.env.APPDATA ||
                (process.platform == "darwin"
                    ? process.env.HOME + "/Library/Preferences"
                    : process.env.HOME + "/.local/share"),
            "PharmaSoft",
            "databases",
            "payments.db",
        );

        const paymentsDB = new Datastore({
            filename: paymentsDbPath,
            autoload: true,
        });

        paymentsDB.findOne(
            {
                $and: [
                    { paymentType: "RECEIVABLE" },
                    { "allocations.invoiceId": invoiceId },
                    { "allocations.invoiceType": "CUSTOMER" },
                ],
            },
            function (err, payment) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to check for payments.",
                    });
                }

                if (payment) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Cannot delete invoice with associated payments.",
                    });
                }

                // Safe to delete
                customerInvoicesDB.remove({ _id: invoiceId }, function (err, numRemoved) {
                    if (err) {
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to delete customer invoice.",
                        });
                    }

                    if (numRemoved === 0) {
                        return res.status(404).json({
                            error: "Not Found",
                            message: "Customer invoice not found.",
                        });
                    }

                    res.json({
                        message: "Customer invoice deleted successfully.",
                    });
                });
            }
        );
    });
});

/**
 * Helper function to generate invoice number
 *
 * @returns {string} generated invoice number
 */
function generateInvoiceNumber() {
    const prefix = "CUST-INV-";
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return prefix + timestamp + "-" + random;
}

/**
 * Helper function to calculate due date
 *
 * @param {string} invoiceDate invoice date
 * @param {number} paymentTerms payment terms in days
 * @returns {string} due date
 */
function calculateDueDate(invoiceDate, paymentTerms) {
    if (!paymentTerms) {
        return invoiceDate;
    }

    const date = new Date(invoiceDate);
    date.setDate(date.getDate() + parseInt(paymentTerms));
    return date.toISOString().split('T')[0];
}

module.exports = router;