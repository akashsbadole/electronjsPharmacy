const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const validator = require("validator");
const dbUtils = require('./db-utils');
const dbPath = dbUtils.getDatabasePath('supplier-accounts.db');

router.use(bodyParser.json());

module.exports = router;

let supplierAccountsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

supplierAccountsDB.ensureIndex({ fieldName: "_id", unique: true });
supplierAccountsDB.ensureIndex({ fieldName: "supplierId", unique: true });

/**
 * GET endpoint: Get welcome message for Supplier Accounts API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Supplier Accounts API");
});

/**
 * GET endpoint: Retrieve supplier accounts with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build query based on filters
    let query = {};
    if (req.query.supplierId) {
        query.supplierId = parseInt(req.query.supplierId);
    }
    if (req.query.balanceStatus) {
        if (req.query.balanceStatus === 'positive') {
            query.balance = { $gt: 0 };
        } else if (req.query.balanceStatus === 'negative') {
            query.balance = { $lt: 0 };
        } else if (req.query.balanceStatus === 'zero') {
            query.balance = 0;
        }
    }

    supplierAccountsDB.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, docs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Get total count for pagination
            supplierAccountsDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.json({
                    supplierAccounts: docs,
                    pagination: {
                        total: count,
                        page: page,
                        limit: limit,
                        pages: Math.ceil(count / limit)
                    }
                });
            });
        });
});

/**
 * POST endpoint: Create or update supplier account.
 *
 * @param {Object} req request object with supplier account data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is a required field.",
        });
    }

    const supplierId = parseInt(req.body.supplierId);

    // Check if supplier exists
    const Datastore = require("@seald-io/nedb");
    const suppliersDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "suppliers.db",
    );

    const suppliersDB = new Datastore({
        filename: suppliersDbPath,
        autoload: true,
    });

    suppliersDB.findOne({ _id: supplierId }, function (err, supplier) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!supplier) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier not found.",
            });
        }

        // Check if account already exists
        supplierAccountsDB.findOne({ supplierId: supplierId }, function (err, existingAccount) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (existingAccount) {
                // Update existing account
                const updatedAccount = {
                    creditLimit: req.body.creditLimit !== undefined ? parseFloat(req.body.creditLimit) : existingAccount.creditLimit,
                    balance: req.body.balance !== undefined ? parseFloat(req.body.balance) : existingAccount.balance,
                    paymentTermId: req.body.paymentTermId !== undefined ? req.body.paymentTermId : existingAccount.paymentTermId,
                    updatedAt: new Date()
                };

                supplierAccountsDB.update(
                    { supplierId: supplierId },
                    { $set: updatedAccount },
                    {},
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }

                        res.json({
                            ...updatedAccount,
                            _id: existingAccount._id,
                            supplierId: supplierId
                        });
                    }
                );
            } else {
                // Create new account
                const newAccount = {
                    _id: Math.floor(Date.now() / 1000),
                    supplierId: supplierId,
                    creditLimit: parseFloat(req.body.creditLimit) || 0,
                    balance: parseFloat(req.body.balance) || 0,
                    paymentTermId: req.body.paymentTermId || null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                supplierAccountsDB.insert(newAccount, function (err, account) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    res.status(201).json(account);
                });
            }
        });
    });
});

/**
 * GET endpoint: Get specific supplier account by ID.
 *
 * @param {Object} req request object with supplier ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/supplier/:supplierId", function (req, res) {
    if (!req.params.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }

    const supplierId = parseInt(req.params.supplierId);

    supplierAccountsDB.findOne({ supplierId: supplierId }, function (err, account) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!account) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier account not found.",
            });
        }

        res.json(account);
    });
});

/**
 * PUT endpoint: Update supplier account.
 *
 * @param {Object} req request object with updated supplier account data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/supplier/:supplierId", function (req, res) {
    if (!req.params.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }

    const supplierId = parseInt(req.params.supplierId);

    // Check if account exists
    supplierAccountsDB.findOne({ supplierId: supplierId }, function (err, existingAccount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!existingAccount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier account not found.",
            });
        }

        const updatedAccount = {
            creditLimit: req.body.creditLimit !== undefined ? parseFloat(req.body.creditLimit) : existingAccount.creditLimit,
            balance: req.body.balance !== undefined ? parseFloat(req.body.balance) : existingAccount.balance,
            paymentTermId: req.body.paymentTermId !== undefined ? req.body.paymentTermId : existingAccount.paymentTermId,
            updatedAt: new Date()
        };

        supplierAccountsDB.update(
            { supplierId: supplierId },
            { $set: updatedAccount },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.json({
                    ...updatedAccount,
                    _id: existingAccount._id,
                    supplierId: supplierId
                });
            }
        );
    });
});

/**
 * POST endpoint: Update account balance.
 *
 * @param {Object} req request object with supplier ID and amount in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/supplier/:supplierId/update-balance", function (req, res) {
    if (!req.params.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }

    if (req.body.amount === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Amount is required.",
        });
    }

    const supplierId = parseInt(req.params.supplierId);
    const amount = parseFloat(req.body.amount);

    // Check if account exists
    supplierAccountsDB.findOne({ supplierId: supplierId }, function (err, existingAccount) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!existingAccount) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier account not found.",
            });
        }

        const newBalance = existingAccount.balance + amount;

        supplierAccountsDB.update(
            { supplierId: supplierId },
            {
                $set: {
                    balance: newBalance,
                    updatedAt: new Date()
                }
            },
            {},
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.json({
                    _id: existingAccount._id,
                    supplierId: supplierId,
                    previousBalance: existingAccount.balance,
                    amount: amount,
                    newBalance: newBalance,
                    updatedAt: new Date()
                });
            }
        );
    });
});

/**
 * GET endpoint: Get supplier account with supplier details.
 *
 * @param {Object} req request object with supplier ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/supplier/:supplierId/with-details", function (req, res) {
    if (!req.params.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }

    const supplierId = parseInt(req.params.supplierId);

    supplierAccountsDB.findOne({ supplierId: supplierId }, function (err, account) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!account) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier account not found.",
            });
        }

        // Get supplier details
        const Datastore = require("@seald-io/nedb");
        const suppliersDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "suppliers.db",
        );

        const suppliersDB = new Datastore({
            filename: suppliersDbPath,
            autoload: true,
        });

        suppliersDB.findOne({ _id: supplierId }, function (err, supplier) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (!supplier) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Supplier not found.",
                });
            }

            // Get payment terms if available
            let paymentTerms = null;
            if (account.paymentTermId) {
                const paymentTermsDbPath = path.join(
                    process.env.APPDATA,
                    process.env.APPNAME,
                    "server",
                    "databases",
                    "payment-terms.db",
                );

                const paymentTermsDB = new Datastore({
                    filename: paymentTermsDbPath,
                    autoload: true,
                });

                paymentTermsDB.findOne({ _id: account.paymentTermId }, function (err, terms) {
                    if (!err && terms) {
                        paymentTerms = terms;
                    }

                    res.json({
                        account: account,
                        supplier: supplier,
                        paymentTerms: paymentTerms
                    });
                });
            } else {
                res.json({
                    account: account,
                    supplier: supplier,
                    paymentTerms: null
                });
            }
        });
    });
});

/**
 * GET endpoint: Get accounts payable aging report.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/aging-report", function (req, res) {
    // Get all supplier accounts with balance > 0
    supplierAccountsDB.find({ balance: { $gt: 0 } }, function (err, accounts) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        // Get supplier invoices for aging calculation
        const Datastore = require("@seald-io/nedb");
        const invoicesDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "supplier-invoices.db",
        );

        const invoicesDB = new Datastore({
            filename: invoicesDbPath,
            autoload: true,
        });

        invoicesDB.find({ balanceAmount: { $gt: 0 } }, function (err, invoices) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            // Calculate aging
            const agingReport = {
                current: { total: 0, count: 0, items: [] },
                days1to30: { total: 0, count: 0, items: [] },
                days31to60: { total: 0, count: 0, items: [] },
                days61to90: { total: 0, count: 0, items: [] },
                over90: { total: 0, count: 0, items: [] }
            };

            const today = new Date();

            accounts.forEach(account => {
                const accountInvoices = invoices.filter(inv => inv.supplierId === account.supplierId);

                accountInvoices.forEach(invoice => {
                    const dueDate = new Date(invoice.dueDate);
                    const daysOverdue = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
                    const balanceAmount = invoice.balanceAmount;

                    let category;
                    if (daysOverdue <= 0) {
                        category = agingReport.current;
                    } else if (daysOverdue <= 30) {
                        category = agingReport.days1to30;
                    } else if (daysOverdue <= 60) {
                        category = agingReport.days31to60;
                    } else if (daysOverdue <= 90) {
                        category = agingReport.days61to90;
                    } else {
                        category = agingReport.over90;
                    }

                    category.total += balanceAmount;
                    category.count++;
                    category.items.push({
                        supplierId: account.supplierId,
                        invoiceNumber: invoice.invoiceNumber,
                        invoiceDate: invoice.invoiceDate,
                        dueDate: invoice.dueDate,
                        daysOverdue: Math.max(0, daysOverdue),
                        balanceAmount: balanceAmount
                    });
                });
            });

            res.json(agingReport);
        });
    });
});

/**
 * GET endpoint: Get supplier account statement.
 *
 * @param {Object} req request object with supplier ID as a parameter.
 * @param {Object} res response object.
 */
router.get("/supplier/:supplierId/statement", function (req, res) {
    if (!req.params.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }

    const supplierId = parseInt(req.params.supplierId);

    // Get supplier account
    supplierAccountsDB.findOne({ supplierId: supplierId }, function (err, account) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve supplier account.",
            });
        }

        if (!account) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier account not found.",
            });
        }

        // Get supplier invoices
        const Datastore = require("@seald-io/nedb");
        const supplierInvoicesDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "supplier-invoices.db",
        );

        const supplierInvoicesDB = new Datastore({
            filename: supplierInvoicesDbPath,
            autoload: true,
        });

        // Get payments
        const paymentsDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "payments.db",
        );

        const paymentsDB = new Datastore({
            filename: paymentsDbPath,
            autoload: true,
        });

        // Get all transactions
        const transactions = [];

        // Add invoices
        supplierInvoicesDB.find({ supplierId: supplierId }, function (err, invoices) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve supplier invoices.",
                });
            }

            invoices.forEach(function (invoice) {
                transactions.push({
                    date: invoice.invoiceDate,
                    type: "INVOICE",
                    description: `Invoice #${invoice.invoiceNumber}`,
                    debit: invoice.totalAmount,
                    credit: null,
                    balance: 0, // Will be calculated later
                });
            });

            // Add payments
            paymentsDB.find({ paymentType: "PAYABLE", supplierId: supplierId }, function (err, payments) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to retrieve payments.",
                    });
                }

                payments.forEach(function (payment) {
                    transactions.push({
                        date: payment.paymentDate,
                        type: "PAYMENT",
                        description: `Payment #${payment.paymentNumber}`,
                        debit: null,
                        credit: payment.amount,
                        balance: 0, // Will be calculated later
                    });
                });

                // Sort transactions by date
                transactions.sort(function (a, b) {
                    return new Date(a.date) - new Date(b.date);
                });

                // Calculate running balance
                let runningBalance = 0;
                transactions.forEach(function (transaction) {
                    if (transaction.debit) {
                        runningBalance += transaction.debit;
                    } else if (transaction.credit) {
                        runningBalance -= transaction.credit;
                    }
                    transaction.balance = runningBalance;
                });

                res.json({
                    statement: {
                        supplierId: supplierId,
                        currentBalance: runningBalance,
                        transactions: transactions,
                    },
                });
            });
        });
    });
});