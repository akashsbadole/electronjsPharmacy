const app = require("express")();
const server = require("http").Server(app);
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const path = require("path");
const validator = require("validator");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "customers.db",
);

app.use(bodyParser.json());

module.exports = app;

let customerDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

customerDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Customer API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Customer API");
});

/**
 * GET endpoint: Get customer details by customer ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/customer/:customerId", function (req, res) {
    if (!req.params.customerId) {
        res.status(500).send("ID field is required.");
    } else {
        customerDB.findOne(
            {
                _id: req.params.customerId,
            },
            function (err, customer) {
                res.send(customer);
            },
        );
    }
});

/**
 * GET endpoint: Get details of all customers.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/all", function (req, res) {
    customerDB.find({}, function (err, docs) {
        res.send(docs);
    });
});

/**
 * POST endpoint: Create a new customer.
 *
 * @param {Object} req request object with new customer data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/customer", function (req, res) {
    var newCustomer = req.body;
    customerDB.insert(newCustomer, function (err, customer) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else {
            res.sendStatus(200);
        }
    });
});

/**
 * DELETE endpoint: Delete a customer by customer ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/customer/:customerId", function (req, res) {
    customerDB.remove(
        {
            _id: req.params.customerId,
        },
        function (err, numRemoved) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                res.sendStatus(200);
            }
        },
    );
});

/**
 * PUT endpoint: Update customer details.
 *
 * @param {Object} req request object with updated customer data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/customer", function (req, res) {
    let customerId = validator.escape(req.body._id);

    customerDB.update(
        {
            _id: customerId,
        },
        req.body,
        {},
        function (err, numReplaced, customer) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                res.sendStatus(200);
            }
        },
    );
});

/**
 * GET endpoint: Get customer with account information.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/customer/:customerId/with-account", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    const customerId = req.params.customerId;
    
    customerDB.findOne({ _id: customerId }, function (err, customer) {
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
        
        // Get customer account
        const Datastore = require("@seald-io/nedb");
        const customerAccountsDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "customer-accounts.db",
        );
        
        const customerAccountsDB = new Datastore({
            filename: customerAccountsDbPath,
            autoload: true,
        });
        
        customerAccountsDB.findOne({ customerId: customerId }, function (err, account) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get payment terms if available
            let paymentTerms = null;
            if (account && account.paymentTermId) {
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
                        customer: customer,
                        account: account,
                        paymentTerms: paymentTerms
                    });
                });
            } else {
                res.json({
                    customer: customer,
                    account: account,
                    paymentTerms: null
                });
            }
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
app.post("/customer/:customerId/account", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }
    
    const customerId = req.params.customerId;
    
    // Check if customer exists
    customerDB.findOne({ _id: customerId }, function (err, customer) {
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
        
        // Create or update customer account
        const Datastore = require("@seald-io/nedb");
        const customerAccountsDbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "customer-accounts.db",
        );
        
        const customerAccountsDB = new Datastore({
            filename: customerAccountsDbPath,
            autoload: true,
        });
        
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
                    balance: 0,
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
 * GET endpoint: Get all customers with account information.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/with-accounts", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    customerDB.find({})
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, customers) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get total count for pagination
            customerDB.count({}, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get account information for all customers
                const Datastore = require("@seald-io/nedb");
                const customerAccountsDbPath = path.join(
                    process.env.APPDATA,
                    process.env.APPNAME,
                    "server",
                    "databases",
                    "customer-accounts.db",
                );
                
                const customerAccountsDB = new Datastore({
                    filename: customerAccountsDbPath,
                    autoload: true,
                });
                
                customerAccountsDB.find({}, function (err, accounts) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    // Combine customer and account information
                    const customersWithAccounts = customers.map(customer => {
                        const account = accounts.find(acc => acc.customerId === customer._id);
                        return {
                            ...customer,
                            account: account || null
                        };
                    });
                    
                    res.json({
                        customers: customersWithAccounts,
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
});