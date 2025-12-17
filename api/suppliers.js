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
    "suppliers.db",
);

app.use(bodyParser.json());

module.exports = app;

let suppliersDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

suppliersDB.ensureIndex({ fieldName: "_id", unique: true });
suppliersDB.ensureIndex({ fieldName: "gstNumber" });
suppliersDB.ensureIndex({ fieldName: "panNumber" });
suppliersDB.ensureIndex({ fieldName: "isActive" });

/**
 * GET endpoint: Get welcome message for Suppliers API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Suppliers API");
});

/**
 * GET endpoint: Retrieve suppliers with pagination.
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
    
    suppliersDB.find(query)
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
            suppliersDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    suppliers: docs,
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
 * POST endpoint: Add new supplier.
 *
 * @param {Object} req request object with supplier data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.name) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier name is a required field.",
        });
    }
    
    // Check if supplier with same name already exists
    suppliersDB.findOne({
        name: validator.escape(req.body.name)
    }, function (err, existingSupplier) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (existingSupplier) {
            return res.status(409).json({
                error: "Conflict",
                message: "A supplier with this name already exists.",
            });
        }
        
        // Check GST number uniqueness if provided
        if (req.body.gstNumber) {
            suppliersDB.findOne({
                gstNumber: validator.escape(req.body.gstNumber)
            }, function (err, existingGst) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (existingGst) {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "A supplier with this GST number already exists.",
                    });
                }
                
                createSupplier();
            });
        } else {
            createSupplier();
        }
        
        function createSupplier() {
            const newSupplier = {
                _id: Math.floor(Date.now() / 1000),
                name: validator.escape(req.body.name),
                contactPerson: req.body.contactPerson ? validator.escape(req.body.contactPerson) : null,
                phone: req.body.phone ? validator.escape(req.body.phone) : null,
                email: req.body.email ? validator.escape(req.body.email) : null,
                gstNumber: req.body.gstNumber ? validator.escape(req.body.gstNumber) : null,
                panNumber: req.body.panNumber ? validator.escape(req.body.panNumber) : null,
                drugLicenseNumber: req.body.drugLicenseNumber ? validator.escape(req.body.drugLicenseNumber) : null,
                address: req.body.address ? validator.escape(req.body.address) : null,
                city: req.body.city ? validator.escape(req.body.city) : null,
                state: req.body.state ? validator.escape(req.body.state) : null,
                pincode: req.body.pincode ? validator.escape(req.body.pincode) : null,
                paymentTerms: req.body.paymentTerms ? validator.escape(req.body.paymentTerms) : null,
                isActive: req.body.isActive !== undefined ? req.body.isActive : true,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            suppliersDB.insert(newSupplier, function (err, supplier) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.status(201).json(supplier);
            });
        }
    });
});

/**
 * GET endpoint: Get specific supplier by ID.
 *
 * @param {Object} req request object with supplier ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }
    
    suppliersDB.findOne({ _id: parseInt(req.params.id) }, function (err, supplier) {
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
        
        res.json(supplier);
    });
});

/**
 * PUT endpoint: Update supplier.
 *
 * @param {Object} req request object with updated supplier data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }
    
    const supplierId = parseInt(req.params.id);
    
    // Check if supplier exists
    suppliersDB.findOne({ _id: supplierId }, function (err, existingSupplier) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingSupplier) {
            return res.status(404).json({
                error: "Not Found",
                message: "Supplier not found.",
            });
        }
        
        // Check for duplicate name if it's being changed
        if (req.body.name && req.body.name !== existingSupplier.name) {
            suppliersDB.findOne({
                name: validator.escape(req.body.name),
                _id: { $ne: supplierId }
            }, function (err, duplicateSupplier) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (duplicateSupplier) {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "A supplier with this name already exists.",
                    });
                }
                
                checkGstUniqueness();
            });
        } else {
            checkGstUniqueness();
        }
        
        function checkGstUniqueness() {
            // Check GST number uniqueness if it's being changed
            if (req.body.gstNumber && req.body.gstNumber !== existingSupplier.gstNumber) {
                suppliersDB.findOne({
                    gstNumber: validator.escape(req.body.gstNumber),
                    _id: { $ne: supplierId }
                }, function (err, duplicateGst) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    if (duplicateGst) {
                        return res.status(409).json({
                            error: "Conflict",
                            message: "A supplier with this GST number already exists.",
                        });
                    }
                    
                    updateSupplier();
                });
            } else {
                updateSupplier();
            }
        }
        
        function updateSupplier() {
            const updatedSupplier = {
                name: req.body.name ? validator.escape(req.body.name) : existingSupplier.name,
                contactPerson: req.body.contactPerson !== undefined ? validator.escape(req.body.contactPerson) : existingSupplier.contactPerson,
                phone: req.body.phone !== undefined ? validator.escape(req.body.phone) : existingSupplier.phone,
                email: req.body.email !== undefined ? validator.escape(req.body.email) : existingSupplier.email,
                gstNumber: req.body.gstNumber !== undefined ? validator.escape(req.body.gstNumber) : existingSupplier.gstNumber,
                panNumber: req.body.panNumber !== undefined ? validator.escape(req.body.panNumber) : existingSupplier.panNumber,
                drugLicenseNumber: req.body.drugLicenseNumber !== undefined ? validator.escape(req.body.drugLicenseNumber) : existingSupplier.drugLicenseNumber,
                address: req.body.address !== undefined ? validator.escape(req.body.address) : existingSupplier.address,
                city: req.body.city !== undefined ? validator.escape(req.body.city) : existingSupplier.city,
                state: req.body.state !== undefined ? validator.escape(req.body.state) : existingSupplier.state,
                pincode: req.body.pincode !== undefined ? validator.escape(req.body.pincode) : existingSupplier.pincode,
                paymentTerms: req.body.paymentTerms !== undefined ? validator.escape(req.body.paymentTerms) : existingSupplier.paymentTerms,
                isActive: req.body.isActive !== undefined ? req.body.isActive : existingSupplier.isActive,
                updatedAt: new Date()
            };
            
            suppliersDB.update({ _id: supplierId }, { $set: updatedSupplier }, {}, function (err, numReplaced) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({ ...updatedSupplier, _id: supplierId });
            });
        }
    });
});

/**
 * DELETE endpoint: Delete supplier.
 *
 * @param {Object} req request object with supplier ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }
    
    const supplierId = parseInt(req.params.id);
    
    // Check if supplier exists
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
        
        // Check if supplier has associated batches or purchase orders
        checkSupplierDependencies();
        
        function checkSupplierDependencies() {
            const Datastore = require("@seald-io/nedb");
            const path = require("path");
            
            // Check batches
            const batchesDbPath = path.join(
                process.env.APPDATA,
                process.env.APPNAME,
                "server",
                "databases",
                "batches.db",
            );
            
            const batchesDB = new Datastore({
                filename: batchesDbPath,
                autoload: true,
            });
            
            batchesDB.findOne({ supplierId: supplierId }, function (err, batch) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (batch) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Cannot delete supplier with associated batches. Remove or reassign batches first.",
                    });
                }
                
                // Check purchase orders
                const purchaseOrdersDbPath = path.join(
                    process.env.APPDATA,
                    process.env.APPNAME,
                    "server",
                    "databases",
                    "purchase-orders.db",
                );
                
                const purchaseOrdersDB = new Datastore({
                    filename: purchaseOrdersDbPath,
                    autoload: true,
                });
                
                purchaseOrdersDB.findOne({ supplierId: supplierId }, function (err, purchaseOrder) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    if (purchaseOrder) {
                        return res.status(400).json({
                            error: "Bad Request",
                            message: "Cannot delete supplier with associated purchase orders. Remove or reassign orders first.",
                        });
                    }
                    
                    // Safe to delete
                    suppliersDB.remove({ _id: supplierId }, function (err, numRemoved) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }
                        
                        res.json({ message: "Supplier deleted successfully." });
                    });
                });
            });
        }
    });
});

/**
 * GET endpoint: Search suppliers.
 *
 * @param {Object} req request object with search query as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/search/:query", function (req, res) {
    if (!req.params.query) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Search query is required.",
        });
    }
    
    const query = validator.escape(req.params.query);
    const searchRegex = new RegExp(query, 'i');
    
    suppliersDB.find({
        $or: [
            { name: searchRegex },
            { contactPerson: searchRegex },
            { phone: searchRegex },
            { email: searchRegex },
            { gstNumber: searchRegex }
        ]
    }).sort({ name: 1 }).exec(function (err, suppliers) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.json(suppliers);
    });
});

/**
 * GET endpoint: Get active suppliers only.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/active", function (req, res) {
    suppliersDB.find({ isActive: true })
        .sort({ name: 1 })
        .exec(function (err, suppliers) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(suppliers);
        });
});

/**
 * POST endpoint: Bulk import suppliers.
 *
 * @param {Object} req request object with suppliers array in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/bulk", function (req, res) {
    if (!req.body.suppliers || !Array.isArray(req.body.suppliers)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Suppliers array is required.",
        });
    }
    
    const suppliers = req.body.suppliers;
    const results = {
        success: 0,
        failed: 0,
        errors: []
    };
    
    // Process suppliers one by one to handle duplicates
    async.eachSeries(suppliers, function (supplierData, callback) {
        // Validate required fields
        if (!supplierData.name) {
            results.failed++;
            results.errors.push({
                name: supplierData.name || 'Unknown',
                error: "Name is required"
            });
            return callback();
        }
        
        // Check for duplicates
        suppliersDB.findOne({
            name: validator.escape(supplierData.name)
        }, function (err, existingSupplier) {
            if (err) {
                results.failed++;
                results.errors.push({
                    name: supplierData.name,
                    error: "Database error"
                });
                return callback();
            }
            
            if (existingSupplier) {
                results.failed++;
                results.errors.push({
                    name: supplierData.name,
                    error: "Supplier already exists"
                });
                return callback();
            }
            
            // Create new supplier
            const newSupplier = {
                _id: Math.floor(Date.now() / 1000) + Math.random(),
                name: validator.escape(supplierData.name),
                contactPerson: supplierData.contactPerson ? validator.escape(supplierData.contactPerson) : null,
                phone: supplierData.phone ? validator.escape(supplierData.phone) : null,
                email: supplierData.email ? validator.escape(supplierData.email) : null,
                gstNumber: supplierData.gstNumber ? validator.escape(supplierData.gstNumber) : null,
                panNumber: supplierData.panNumber ? validator.escape(supplierData.panNumber) : null,
                drugLicenseNumber: supplierData.drugLicenseNumber ? validator.escape(supplierData.drugLicenseNumber) : null,
                address: supplierData.address ? validator.escape(supplierData.address) : null,
                city: supplierData.city ? validator.escape(supplierData.city) : null,
                state: supplierData.state ? validator.escape(supplierData.state) : null,
                pincode: supplierData.pincode ? validator.escape(supplierData.pincode) : null,
                paymentTerms: supplierData.paymentTerms ? validator.escape(supplierData.paymentTerms) : null,
                isActive: supplierData.isActive !== undefined ? supplierData.isActive : true,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            suppliersDB.insert(newSupplier, function (err, supplier) {
                if (err) {
                    results.failed++;
                    results.errors.push({
                        name: supplierData.name,
                        error: "Failed to insert: " + err.message
                    });
                } else {
                    results.success++;
                }
                callback();
            });
        });
    }, function (err) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.status(201).json(results);
    });
});

/**
 * GET endpoint: Get supplier with account information.
 *
 * @param {Object} req request object with supplier ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id/with-account", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }
    
    const supplierId = parseInt(req.params.id);
    
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
        
        // Get supplier account
        const Datastore = require("@seald-io/nedb");
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
        
        supplierAccountsDB.findOne({ supplierId: supplierId }, function (err, account) {
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
                        supplier: supplier,
                        account: account,
                        paymentTerms: paymentTerms
                    });
                });
            } else {
                res.json({
                    supplier: supplier,
                    account: account,
                    paymentTerms: null
                });
            }
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
app.post("/:id/account", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required.",
        });
    }
    
    const supplierId = parseInt(req.params.id);
    
    // Check if supplier exists
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
        
        // Create or update supplier account
        const Datastore = require("@seald-io/nedb");
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
                    balance: 0,
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
 * GET endpoint: Get all suppliers with account information.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/with-accounts", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build query based on filters
    let query = {};
    if (req.query.isActive !== undefined) {
        query.isActive = req.query.isActive === 'true';
    }
    
    suppliersDB.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, suppliers) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get total count for pagination
            suppliersDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get account information for all suppliers
                const Datastore = require("@seald-io/nedb");
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
                
                supplierAccountsDB.find({}, function (err, accounts) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    // Combine supplier and account information
                    const suppliersWithAccounts = suppliers.map(supplier => {
                        const account = accounts.find(acc => acc.supplierId === supplier._id);
                        return {
                            ...supplier,
                            account: account || null
                        };
                    });
                    
                    res.json({
                        suppliers: suppliersWithAccounts,
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