const express = require("express");
const app = express();
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
    "supplier-invoices.db",
);

let supplierInvoicesDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

supplierInvoicesDB.ensureIndex({ fieldName: "_id", unique: true });
supplierInvoicesDB.ensureIndex({ fieldName: "invoiceNumber", unique: true });
supplierInvoicesDB.ensureIndex({ fieldName: "supplierId" });

/**
 * GET endpoint: Retrieve supplier invoices with pagination.
 *
 * @param {Object} req request object with optional query parameters for pagination and filtering.
 * @param {Object} res response object.
 */
app.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    let query = {};
    if (req.query.supplierId) {
        query.supplierId = parseInt(req.query.supplierId);
    }
    if (req.query.status) {
        query.status = validator.escape(req.query.status);
    }

    supplierInvoicesDB
        .find(query)
        .sort({ invoiceDate: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, docs) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve supplier invoices.",
                });
            }

            // Get total count for pagination
            supplierInvoicesDB.count(query, function (err, count) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to count supplier invoices.",
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
 * GET endpoint: Get specific supplier invoice by ID.
 *
 * @param {Object} req request object with invoice ID as a parameter.
 * @param {Object} res response object.
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invoice ID is required.",
        });
    }

    supplierInvoicesDB.findOne({ _id: parseInt(req.params.id) }, function (err, invoice) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve supplier invoice.",
            });
        }

        if (!invoice) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier invoice not found.",
            });
        }

        res.json(invoice);
    });
});

/**
 * GET endpoint: Get supplier invoices by supplier ID.
 *
 * @param {Object} req request object with supplier ID as a parameter.
 * @param {Object} res response object.
 */
app.get("/supplier/:supplierId", function (req, res) {
    if (!req.params.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }

    const supplierId = parseInt(req.params.supplierId);

    supplierInvoicesDB
        .find({ supplierId: supplierId })
        .sort({ invoiceDate: -1 })
        .exec(function (err, invoices) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve supplier invoices.",
                });
            }

            res.json({ invoices: invoices });
        });
});

/**
 * POST endpoint: Create new supplier invoice.
 *
 * @param {Object} req request object with invoice data in the body.
 * @param {Object} res response object.
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.supplierId || !req.body.totalAmount) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID and total amount are required.",
        });
    }

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber();

    const newInvoice = {
        _id: Math.floor(Date.now() / 1000) + Math.random(),
        invoiceNumber: invoiceNumber,
        supplierId: parseInt(req.body.supplierId),
        purchaseOrderId: req.body.purchaseOrderId || null,
        invoiceDate: req.body.invoiceDate || new Date().toISOString().split('T')[0],
        dueDate: req.body.dueDate || calculateDueDate(req.body.invoiceDate, req.body.paymentTerms),
        totalAmount: parseFloat(req.body.totalAmount),
        balance: parseFloat(req.body.totalAmount),
        status: "PENDING",
        notes: req.body.notes || null,
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    supplierInvoicesDB.insert(newInvoice, function (err, invoice) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to create supplier invoice.",
            });
        }

        res.status(201).json(invoice);
    });
});

/**
 * PUT endpoint: Update supplier invoice.
 *
 * @param {Object} req request object with updated invoice data in the body.
 * @param {Object} res response object.
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invoice ID is required.",
        });
    }

    const invoiceId = parseInt(req.params.id);

    // Check if invoice exists
    supplierInvoicesDB.findOne({ _id: invoiceId }, function (err, existingInvoice) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve supplier invoice.",
            });
        }

        if (!existingInvoice) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier invoice not found.",
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

        supplierInvoicesDB.update(
            { _id: invoiceId },
            { $set: updatedInvoice },
            {},
            function (err, numReplaced) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to update supplier invoice.",
                    });
                }

                if (numReplaced === 0) {
                    return res.status(404).json({
                        error: "Not Found",
                        message: "Supplier invoice not found.",
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
 * DELETE endpoint: Delete supplier invoice.
 *
 * @param {Object} req request object with invoice ID as a parameter.
 * @param {Object} res response object.
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invoice ID is required.",
        });
    }

    const invoiceId = parseInt(req.params.id);

    // Check if invoice exists
    supplierInvoicesDB.findOne({ _id: invoiceId }, function (err, invoice) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve supplier invoice.",
            });
        }

        if (!invoice) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier invoice not found.",
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
                    { paymentType: "PAYABLE" },
                    { "allocations.invoiceId": invoiceId },
                    { "allocations.invoiceType": "SUPPLIER" },
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
                supplierInvoicesDB.remove({ _id: invoiceId }, function (err, numRemoved) {
                    if (err) {
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to delete supplier invoice.",
                        });
                    }

                    if (numRemoved === 0) {
                        return res.status(404).json({
                            error: "Not Found",
                            message: "Supplier invoice not found.",
                        });
                    }

                    res.json({
                        message: "Supplier invoice deleted successfully.",
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
    const prefix = "SUP-INV-";
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

module.exports = app;