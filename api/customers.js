const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const path = require("path");
const validator = require("validator");
const dbUtils = require('./db-utils');
const dbPath = dbUtils.getDatabasePath("customers.db");

router.use(bodyParser.json());

module.exports = router;

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
router.get("/", function (req, res) {
    res.send("Customer API");
});

/**
 * GET endpoint: Get customer details by customer ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId", function (req, res) {
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
router.get("/all", function (req, res) {
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
router.post("/customer", function (req, res) {
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
router.delete("/customer/:customerId", function (req, res) {
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
router.put("/customer", function (req, res) {
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
router.get("/customer/:customerId/with-account", function (req, res) {
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
            appData,
            appName,
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
            
            // Get loyalty account
            const customerLoyaltyDbPath = path.join(
                appData,
                appName,
                "server",
                "databases",
                "customer-loyalty-accounts.db",
            );
            
            const customerLoyaltyDB = new Datastore({
                filename: customerLoyaltyDbPath,
                autoload: true,
            });
            
            customerLoyaltyDB.findOne({ customer_id: customerId }, function (err, loyaltyAccount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get delivery addresses
                const deliveryAddressesDbPath = path.join(
                    appData,
                    appName,
                    "server",
                    "databases",
                    "customer-delivery-addresses.db",
                );
                
                const deliveryAddressesDB = new Datastore({
                    filename: deliveryAddressesDbPath,
                    autoload: true,
                });
                
                deliveryAddressesDB.find({ customer_id: customerId }, function (err, deliveryAddresses) {
                    if (err) {
                        console.error(err);
                        deliveryAddresses = [];
                    }
                    
                    // Get payment terms if available
                    let paymentTerms = null;
                    if (account && account.paymentTermId) {
                        const paymentTermsDbPath = path.join(
                            appData,
                            appName,
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
                                loyaltyAccount: loyaltyAccount,
                                deliveryAddresses: deliveryAddresses,
                                paymentTerms: paymentTerms
                            });
                        });
                    } else {
                        res.json({
                            customer: customer,
                            account: account,
                            loyaltyAccount: loyaltyAccount,
                            deliveryAddresses: deliveryAddresses,
                            paymentTerms: null
                        });
                    }
                });
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
router.post("/customer/:customerId/account", function (req, res) {
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
            appData,
            appName,
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
 * POST endpoint: Enroll customer in loyalty program.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/customer/:customerId/enroll-loyalty", function (req, res) {
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
        
        // Call loyalty API to enroll customer
        const loyaltyAPI = require("./loyalty");
        const mockReq = {
            body: {
                customerId: customerId,
                enrollmentSource: "CUSTOMER_MANAGEMENT"
            }
        };
        
        const mockRes = {
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                if (mockRes.statusCode >= 400) {
                    return res.status(mockRes.statusCode).json(data);
                }
                return res.status(201).json(data);
            }
        };
        
        // Simulate calling the loyalty enrollment endpoint
        const customerLoyaltyDbPath = path.join(
            appData,
            appName,
            "server",
            "databases",
            "customer-loyalty-accounts.db",
        );
        
        const customerLoyaltyDB = new Datastore({
            filename: customerLoyaltyDbPath,
            autoload: true,
        });
        
        // Check if customer already has a loyalty account
        customerLoyaltyDB.findOne({ customer_id: customerId }, function (err, existingAccount) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (existingAccount) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Customer already has a loyalty account.",
                });
            }

            // Generate unique loyalty account number
            const timestamp = Date.now().toString().slice(-6);
            const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            const loyaltyAccountNumber = `LOY-${timestamp}${random}`;

            // Create new loyalty account
            const newLoyaltyAccount = {
                _id: Math.floor(Date.now() / 1000),
                customer_id: customerId,
                loyalty_account_number: loyaltyAccountNumber,
                current_points: 0,
                tier: "Basic",
                tier_expiry_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
                total_points_earned: 0,
                total_points_redeemed: 0,
                enrollment_date: new Date().toISOString().split('T')[0],
                last_activity_date: new Date().toISOString().split('T')[0],
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            };

            customerLoyaltyDB.insert(newLoyaltyAccount, function (err, loyaltyAccount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.status(201).json(loyaltyAccount);
            });
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
router.get("/with-accounts", function (req, res) {
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
                    appData,
                    appName,
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
                    
                    // Get loyalty account information for all customers
                    const customerLoyaltyDbPath = path.join(
                        appData,
                        appName,
                        "server",
                        "databases",
                        "customer-loyalty-accounts.db",
                    );
                    
                    const customerLoyaltyDB = new Datastore({
                        filename: customerLoyaltyDbPath,
                        autoload: true,
                    });
                    
                    customerLoyaltyDB.find({}, function (err, loyaltyAccounts) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        // Combine customer, account, and loyalty information
                        const customersWithAccounts = customers.map(customer => {
                            const account = accounts.find(acc => acc.customerId === customer._id);
                            const loyaltyAccount = loyaltyAccounts.find(loyalty => loyalty.customer_id === customer._id);
                            return {
                                ...customer,
                                account: account || null,
                                loyaltyAccount: loyaltyAccount || null
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
                
                /**
                 * POST endpoint: Add delivery address for a customer
                 *
                 * @param {Object} req request object with delivery address data in body.
                 * @param {Object} res response object.
                 * @returns {void}
                 */
                router.post("/customer/:customerId/delivery-address", function (req, res) {
                    if (!req.params.customerId) {
                        return res.status(400).json({
                            error: "Bad Request",
                            message: "Customer ID is required.",
                        });
                    }
                    
                    const customerId = req.params.customerId;
                    const newAddress = req.body;
                    
                    // Validate required fields
                    if (!newAddress.address || !newAddress.pincode) {
                        return res.status(400).json({
                            error: "Bad Request",
                            message: "Address and pincode are required.",
                        });
                    }
                    
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
                        
                        // Create delivery address
                        const Datastore = require("@seald-io/nedb");
                        const deliveryAddressesDbPath = path.join(
                            appData,
                            appName,
                            "server",
                            "databases",
                            "customer-delivery-addresses.db",
                        );
                        
                        const deliveryAddressesDB = new Datastore({
                            filename: deliveryAddressesDbPath,
                            autoload: true,
                        });
                        
                        const deliveryAddress = {
                            _id: "ADDR-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
                            customer_id: customerId,
                            address: newAddress.address,
                            landmark: newAddress.landmark || null,
                            pincode: newAddress.pincode,
                            latitude: newAddress.latitude || null,
                            longitude: newAddress.longitude || null,
                            is_default: newAddress.is_default || false,
                            created_at: new Date(),
                            updated_at: new Date()
                        };
                        
                        // If this is set as default, unset other default addresses
                        if (deliveryAddress.is_default) {
                            deliveryAddressesDB.update(
                                { customer_id: customerId },
                                { $set: { is_default: false, updated_at: new Date() } },
                                { multi: true },
                                function (err) {
                                    if (err) {
                                        console.error("Failed to unset default addresses:", err);
                                    }
                                }
                            );
                        }
                        
                        deliveryAddressesDB.insert(deliveryAddress, function (err, address) {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({
                                    error: "Internal Server Error",
                                    message: "An unexpected error occurred.",
                                });
                            }
                            
                            res.status(201).json(address);
                        });
                    });
                });
                
                /**
                 * PUT endpoint: Update delivery address
                 *
                 * @param {Object} req request object with updated address data in body.
                 * @param {Object} res response object.
                 * @returns {void}
                 */
                router.put("/customer/:customerId/delivery-address/:addressId", function (req, res) {
                    const customerId = req.params.customerId;
                    const addressId = req.params.addressId;
                    const updatedAddress = req.body;
                    
                    // Don't allow updating certain fields
                    delete updatedAddress._id;
                    delete updatedAddress.customer_id;
                    delete updatedAddress.created_at;
                    
                    // Update timestamp
                    updatedAddress.updated_at = new Date();
                    
                    const Datastore = require("@seald-io/nedb");
                    const deliveryAddressesDbPath = path.join(
                        appData,
                        appName,
                        "server",
                        "databases",
                        "customer-delivery-addresses.db",
                    );
                    
                    const deliveryAddressesDB = new Datastore({
                        filename: deliveryAddressesDbPath,
                        autoload: true,
                    });
                    
                    // If this is set as default, unset other default addresses
                    if (updatedAddress.is_default) {
                        deliveryAddressesDB.update(
                            { customer_id: customerId },
                            { $set: { is_default: false, updated_at: new Date() } },
                            { multi: true },
                            function (err) {
                                if (err) {
                                    console.error("Failed to unset default addresses:", err);
                                }
                            }
                        );
                    }
                    
                    deliveryAddressesDB.update(
                        { _id: addressId, customer_id: customerId },
                        { $set: updatedAddress },
                        {},
                        function (err, numReplaced) {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({
                                    error: "Internal Server Error",
                                    message: "An unexpected error occurred.",
                                });
                            }
                            
                            if (numReplaced === 0) {
                                return res.status(404).json({
                                    error: "Not Found",
                                    message: "Delivery address not found.",
                                });
                            }
                            
                            res.sendStatus(200);
                        }
                    );
                });
                
                /**
                 * DELETE endpoint: Delete delivery address
                 *
                 * @param {Object} req request object with customer ID and address ID as parameters.
                 * @param {Object} res response object.
                 * @returns {void}
                 */
                router.delete("/customer/:customerId/delivery-address/:addressId", function (req, res) {
                    const customerId = req.params.customerId;
                    const addressId = req.params.addressId;
                    
                    const Datastore = require("@seald-io/nedb");
                    const deliveryAddressesDbPath = path.join(
                        appData,
                        appName,
                        "server",
                        "databases",
                        "customer-delivery-addresses.db",
                    );
                    
                    const deliveryAddressesDB = new Datastore({
                        filename: deliveryAddressesDbPath,
                        autoload: true,
                    });
                    
                    deliveryAddressesDB.remove({ _id: addressId, customer_id: customerId }, {}, function (err, numRemoved) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        if (numRemoved === 0) {
                            return res.status(404).json({
                                error: "Not Found",
                                message: "Delivery address not found.",
                            });
                        }
                        
                        res.sendStatus(200);
                    });
                });
            });
            
            /**
             * GET endpoint: Get customer communication preferences.
             *
             * @param {Object} req request object with customer ID as a parameter.
             * @param {Object} res response object.
             * @returns {void}
             */
            router.get("/customer/:customerId/communication-preferences", function (req, res) {
                if (!req.params.customerId) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Customer ID is required.",
                    });
                }
                
                const customerPreferencesDbPath = path.join(
                    appData,
                    appName,
                    "server",
                    "databases",
                    "customer-communication-preferences.db",
                );
                
                const customerPreferencesDB = new Datastore({
                    filename: customerPreferencesDbPath,
                    autoload: true,
                });
                
                customerPreferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
                    if (err) {
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    // Return default preferences if none exist
                    if (!preferences) {
                        const defaultPreferences = require("./customer-communication-preferences").getDefaultPreferences
                            ? require("./customer-communication-preferences").getDefaultPreferences(req.params.customerId)
                            : {
                                customerId: req.params.customerId,
                                channels: {
                                    sms: { enabled: true, consent: { marketing: false, transactional: true } },
                                    email: { enabled: true, consent: { marketing: true, transactional: true } },
                                    whatsapp: { enabled: true, consent: { marketing: false, transactional: true } }
                                },
                                global: { quietHours: { enabled: true, start: "22:00", end: "08:00" } }
                            };
                        return res.json(defaultPreferences);
                    }
                    
                    res.json(preferences);
                });
            });
            
            /**
             * POST endpoint: Send communication to customer.
             *
             * @param {Object} req request object with customer ID as a parameter and communication data in body.
             * @param {Object} res response object.
             * @returns {void}
             */
            router.post("/customer/:customerId/send-communication", function (req, res) {
                if (!req.params.customerId) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Customer ID is required.",
                    });
                }
                
                // Check if customer exists
                customerDB.findOne({ _id: req.params.customerId }, function (err, customer) {
                    if (err) {
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
                    
                    // Use customer communication API to send message
                    const customerCommunicationAPI = require("./customer-communication");
                    
                    // Create a mock request object
                    const mockReq = {
                        body: {
                            customerId: req.params.customerId,
                            channel: req.body.channel || "email",
                            type: req.body.type || "TRANSACTIONAL",
                            content: req.body.content || "",
                            subject: req.body.subject || null,
                            personalizationData: req.body.personalizationData || {},
                            priority: req.body.priority || 1
                        }
                    };
                    
                    // Create a mock response object
                    let responseData = null;
                    const mockRes = {
                        status: function(code) {
                            this.statusCode = code;
                            return this;
                        },
                        json: function(data) {
                            responseData = data;
                            if (mockRes.statusCode >= 400) {
                                return res.status(mockRes.statusCode).json(data);
                            }
                            return res.status(mockRes.statusCode || 201).json(data);
                        }
                    };
                    
                    // Call the send endpoint
                    customerCommunicationAPI._router.handle(mockReq, mockRes);
                });
            });
        });
});