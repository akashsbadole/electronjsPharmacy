const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const validator = require("validator");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "customer-accounts.db",
);

router.use(bodyParser.json());

module.exports = router;

let customerAccountsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

customerAccountsDB.ensureIndex({ fieldName: "_id", unique: true });
customerAccountsDB.ensureIndex({ fieldName: "customerId", unique: true });

/**
 * GET endpoint: Get welcome message for Customer Accounts API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Customer Accounts API");
});

/**
 * GET endpoint: Retrieve customer accounts with pagination.
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
    if (req.query.customerId) {
        query.customerId = req.query.customerId;
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
    
    customerAccountsDB.find(query)
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
            customerAccountsDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    customerAccounts: docs,
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
 * POST endpoint: Create or update customer account.
 *
 * @param {Object} req request object with customer account data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is a required field.",
        });
    }
    
    const customerId = req.body.customerId;
    
    // Check if customer exists
    const Datastore = require("@seald-io/nedb");
    const customersDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "customers.db",
    );
    
    const customersDB = new Datastore({
        filename: customersDbPath,
        autoload: true,
    });
    
    customersDB.findOne({ _id: customerId }, function (err, customer) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        // Check if account already exists
        customerAccountsDB.findOne({ customerId: customerId }, function (err, existingAccount) {
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
                
                customerAccountsDB.update(
                    { customerId: customerId },
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
                            customerId: customerId
                        });
                    }
                );
            } else {
                // Create new account
                const newAccount = {
                    _id: Math.floor(Date.now() / 1000),
                    customerId: customerId,
                    creditLimit: parseFloat(req.body.creditLimit) || 0,
                    balance: parseFloat(req.body.balance) || 0,
                    paymentTermId: req.body.paymentTermId || null,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                
                customerAccountsDB.insert(newAccount, function (err, account) {
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
 * GET endpoint: Get specific customer account by ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    const customerId = req.params.customerId;
    
    customerAccountsDB.findOne({ customerId: customerId }, function (err, account) {
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
                message: "Customer account not found.",
            });
        }
        
        res.json(account);
    });
});

/**
 * PUT endpoint: Update customer account.
 *
 * @param {Object} req request object with updated customer account data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/customer/:customerId", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    const customerId = req.params.customerId;
    
    // Check if account exists
    customerAccountsDB.findOne({ customerId: customerId }, function (err, existingAccount) {
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
                message: "Customer account not found.",
            });
        }
        
        const updatedAccount = {
            creditLimit: req.body.creditLimit !== undefined ? parseFloat(req.body.creditLimit) : existingAccount.creditLimit,
            balance: req.body.balance !== undefined ? parseFloat(req.body.balance) : existingAccount.balance,
            paymentTermId: req.body.paymentTermId !== undefined ? req.body.paymentTermId : existingAccount.paymentTermId,
            updatedAt: new Date()
        };
        
        customerAccountsDB.update(
            { customerId: customerId },
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
                    customerId: customerId
                });
            }
        );
    });
});

/**
 * POST endpoint: Update account balance.
 *
 * @param {Object} req request object with customer ID and amount in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/customer/:customerId/update-balance", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    if (req.body.amount === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Amount is required.",
        });
    }
    
    const customerId = req.params.customerId;
    const amount = parseFloat(req.body.amount);
    
    // Check if account exists
    customerAccountsDB.findOne({ customerId: customerId }, function (err, existingAccount) {
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
                message: "Customer account not found.",
            });
        }
        
        const newBalance = existingAccount.balance + amount;
        
        customerAccountsDB.update(
            { customerId: customerId },
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
                    customerId: customerId,
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
 * GET endpoint: Get customer account with customer details.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId/with-details", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    const customerId = req.params.customerId;
    
    customerAccountsDB.findOne({ customerId: customerId }, function (err, account) {
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
                message: "Customer account not found.",
            });
        }
        
        // Get customer details
        const Datastore = require("@seald-io/nedb");
        const customersDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "customers.db",
        );
        
        const customersDB = new Datastore({
            filename: customersDbPath,
            autoload: true,
        });
        
        customersDB.findOne({ _id: customerId }, function (err, customer) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!customer) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Customer not found.",
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
                        customer: customer,
                        paymentTerms: paymentTerms
                    });
                });
            } else {
                res.json({
                    account: account,
                    customer: customer,
                    paymentTerms: null
                });
            }
        });
    });
});

/**
 * GET endpoint: Get accounts receivable aging report.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/aging-report", function (req, res) {
    // Get all customer accounts with balance > 0
    customerAccountsDB.find({ balance: { $gt: 0 } }, function (err, accounts) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        // Get customer invoices for aging calculation
        const Datastore = require("@seald-io/nedb");
        const invoicesDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "customer-invoices.db",
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
                const accountInvoices = invoices.filter(inv => inv.customerId === account.customerId);
                
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
                        customerId: account.customerId,
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
 * POST endpoint: Check credit limit before creating invoice.
 *
 * @param {Object} req request object with customer ID and invoice amount in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/customer/:customerId/check-credit", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    if (req.body.invoiceAmount === undefined) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invoice amount is required.",
        });
    }
    
    const customerId = req.params.customerId;
    const invoiceAmount = parseFloat(req.body.invoiceAmount);
    
    // Get customer account
    customerAccountsDB.findOne({ customerId: customerId }, function (err, account) {
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
                message: "Customer account not found.",
            });
        }
        
        const newBalance = account.balance + invoiceAmount;
        const availableCredit = account.creditLimit - account.balance;
        const canExceedLimit = req.body.canExceedLimit || false;
        
        const creditCheck = {
            customerId: customerId,
            currentBalance: account.balance,
            creditLimit: account.creditLimit,
            invoiceAmount: invoiceAmount,
            newBalance: newBalance,
            availableCredit: availableCredit,
            withinLimit: newBalance <= account.creditLimit,
            canProcess: canExceedLimit || newBalance <= account.creditLimit
        };
        
        res.json(creditCheck);
    });
});

/**
 * GET endpoint: Get customer account statement.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 */
router.get("/customer/:customerId/statement", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }

    const customerId = req.params.customerId;

    // Get customer account
    customerAccountsDB.findOne({ customerId: customerId }, function (err, account) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to retrieve customer account.",
            });
        }

        if (!account) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer account not found.",
            });
        }

        // Get customer invoices
        const Datastore = require("@seald-io/nedb");
        const customerInvoicesDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "customer-invoices.db",
        );

        const customerInvoicesDB = new Datastore({
            filename: customerInvoicesDbPath,
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
        customerInvoicesDB.find({ customerId: customerId }, function (err, invoices) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to retrieve customer invoices.",
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
            paymentsDB.find({ paymentType: "RECEIVABLE", customerId: customerId }, function (err, payments) {
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
                        customerId: customerId,
                        currentBalance: runningBalance,
                        transactions: transactions,
                    },
                });
            });
        });
    });
});