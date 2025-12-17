const app = require("express")();
const server = require("http").Server(app);
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
    "payment-terms.db",
);

app.use(bodyParser.json());

module.exports = app;

let paymentTermsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

paymentTermsDB.ensureIndex({ fieldName: "_id", unique: true });
paymentTermsDB.ensureIndex({ fieldName: "name", unique: true });

/**
 * GET endpoint: Get welcome message for Payment Terms API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Payment Terms API");
});

/**
 * GET endpoint: Retrieve payment terms with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build query based on filters
    let query = {};
    if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive === 'true';
    }
    
    paymentTermsDB.find(query)
        .sort({ name: 1 })
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
            paymentTermsDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    paymentTerms: docs,
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
 * POST endpoint: Create new payment term.
 *
 * @param {Object} req request object with payment term data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.name || !req.body.days) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name and days are required fields.",
        });
    }
    
    // Check if payment term with same name already exists
    paymentTermsDB.findOne({
        name: validator.escape(req.body.name)
    }, function (err, existingTerm) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (existingTerm) {
            return res.status(409).json({
                error: "Conflict",
                message: "A payment term with this name already exists.",
            });
        }
        
        const newPaymentTerm = {
            _id: Math.floor(Date.now() / 1000),
            name: validator.escape(req.body.name),
            description: req.body.description ? validator.escape(req.body.description) : null,
            days: parseInt(req.body.days),
            isActive: req.body.isActive !== undefined ? req.body.isActive : true,
            isDefault: req.body.isDefault !== undefined ? req.body.isDefault : false,
            createdAt: new Date(),
            updatedAt: new Date()
        };
        
        // If this is set as default, unset all other defaults
        if (newPaymentTerm.isDefault) {
            paymentTermsDB.update(
                { isDefault: true },
                { $set: { isDefault: false } },
                { multi: true },
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    createPaymentTerm();
                }
            );
        } else {
            createPaymentTerm();
        }
        
        function createPaymentTerm() {
            paymentTermsDB.insert(newPaymentTerm, function (err, paymentTerm) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.status(201).json(paymentTerm);
            });
        }
    });
});

/**
 * GET endpoint: Get specific payment term by ID.
 *
 * @param {Object} req request object with payment term ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment term ID is required.",
        });
    }
    
    const termId = parseInt(req.params.id);
    
    paymentTermsDB.findOne({ _id: termId }, function (err, paymentTerm) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!paymentTerm) {
            return res.status(404).json({
                error: "Not Found",
                message: "Payment term not found.",
            });
        }
        
        res.json(paymentTerm);
    });
});

/**
 * PUT endpoint: Update payment term.
 *
 * @param {Object} req request object with updated payment term data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment term ID is required.",
        });
    }
    
    const termId = parseInt(req.params.id);
    
    // Check if payment term exists
    paymentTermsDB.findOne({ _id: termId }, function (err, existingTerm) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingTerm) {
            return res.status(404).json({
                error: "Not Found",
                message: "Payment term not found.",
            });
        }
        
        // Check for duplicate name if it's being changed
        if (req.body.name && req.body.name !== existingTerm.name) {
            paymentTermsDB.findOne({
                name: validator.escape(req.body.name),
                _id: { $ne: termId }
            }, function (err, duplicateTerm) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (duplicateTerm) {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "A payment term with this name already exists.",
                    });
                }
                
                updatePaymentTerm();
            });
        } else {
            updatePaymentTerm();
        }
        
        function updatePaymentTerm() {
            const updatedTerm = {
                name: req.body.name ? validator.escape(req.body.name) : existingTerm.name,
                description: req.body.description !== undefined ? validator.escape(req.body.description) : existingTerm.description,
                days: req.body.days !== undefined ? parseInt(req.body.days) : existingTerm.days,
                isActive: req.body.isActive !== undefined ? req.body.isActive : existingTerm.isActive,
                isDefault: req.body.isDefault !== undefined ? req.body.isDefault : existingTerm.isDefault,
                updatedAt: new Date()
            };
            
            // If this is set as default, unset all other defaults
            if (updatedTerm.isDefault && !existingTerm.isDefault) {
                paymentTermsDB.update(
                    { isDefault: true },
                    { $set: { isDefault: false } },
                    { multi: true },
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        updateTerm();
                    }
                );
            } else {
                updateTerm();
            }
            
            function updateTerm() {
                paymentTermsDB.update({ _id: termId }, { $set: updatedTerm }, {}, function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.json({
                        ...updatedTerm,
                        _id: termId
                    });
                });
            }
        }
    });
});

/**
 * DELETE endpoint: Delete payment term.
 *
 * @param {Object} req request object with payment term ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment term ID is required.",
        });
    }
    
    const termId = parseInt(req.params.id);
    
    // Check if payment term exists
    paymentTermsDB.findOne({ _id: termId }, function (err, paymentTerm) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!paymentTerm) {
            return res.status(404).json({
                error: "Not Found",
                message: "Payment term not found.",
            });
        }
        
        // Cannot delete default payment term
        if (paymentTerm.isDefault) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete the default payment term. Set another term as default first.",
            });
        }
        
        // Check if payment term is in use
        checkPaymentTermUsage(termId, function(isInUse) {
            if (isInUse) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Cannot delete payment term that is in use by suppliers or customers.",
                });
            }
            
            // Safe to delete
            paymentTermsDB.remove({ _id: termId }, function (err, numRemoved) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({ message: "Payment term deleted successfully." });
            });
        });
    });
});

/**
 * GET endpoint: Get active payment terms only.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/active", function (req, res) {
    paymentTermsDB.find({ isActive: true })
        .sort({ name: 1 })
        .exec(function (err, paymentTerms) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(paymentTerms);
        });
});

/**
 * GET endpoint: Get default payment term.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/default", function (req, res) {
    paymentTermsDB.findOne({ isDefault: true }, function (err, paymentTerm) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!paymentTerm) {
            return res.status(404).json({
                error: "Not Found",
                message: "No default payment term found.",
            });
        }
        
        res.json(paymentTerm);
    });
});

/**
 * POST endpoint: Set payment term as default.
 *
 * @param {Object} req request object with payment term ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/:id/set-default", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment term ID is required.",
        });
    }
    
    const termId = parseInt(req.params.id);
    
    // Check if payment term exists
    paymentTermsDB.findOne({ _id: termId }, function (err, paymentTerm) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!paymentTerm) {
            return res.status(404).json({
                error: "Not Found",
                message: "Payment term not found.",
            });
        }
        
        // Unset all other defaults
        paymentTermsDB.update(
            { isDefault: true },
            { $set: { isDefault: false } },
            { multi: true },
            function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Set this term as default
                paymentTermsDB.update(
                    { _id: termId },
                    { $set: { isDefault: true, updatedAt: new Date() } },
                    {},
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        res.json({ message: "Payment term set as default successfully." });
                    }
                );
            }
        );
    });
});

/**
 * Helper function to check if payment term is in use
 *
 * @param {number} termId payment term ID
 * @param {function} callback callback function
 * @returns {void}
 */
function checkPaymentTermUsage(termId, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Check supplier accounts
    const supplierAccountsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "supplier-accounts.db",
    );
    
    const supplierAccountsDB = new Datastore({
        filename: supplierAccountsDbPath,
        autoload: true,
    });
    
    supplierAccountsDB.findOne({ paymentTermId: termId }, function (err, account) {
        if (err) {
            return callback(true); // Assume in use on error
        }
        
        if (account) {
            return callback(true);
        }
        
        // Check customer accounts
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
        
        customerAccountsDB.findOne({ paymentTermId: termId }, function (err, account) {
            if (err) {
                return callback(true); // Assume in use on error
            }
            
            callback(!!account);
        });
    });
}