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
    "suppliers.db",
);

router.use(bodyParser.json());

module.exports = router;

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
router.get("/", function (req, res) {
    res.send("Suppliers API");
});

/**
 * GET endpoint: Retrieve suppliers with pagination.
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
router.post("/", function (req, res) {
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
router.get("/:id", function (req, res) {
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
router.put("/:id", function (req, res) {
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
router.delete("/:id", function (req, res) {
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
router.get("/search/:query", function (req, res) {
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
router.get("/active", function (req, res) {
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
router.post("/bulk", function (req, res) {
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
router.get("/:id/with-account", function (req, res) {
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
router.post("/:id/account", function (req, res) {
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
router.get("/with-accounts", function (req, res) {
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
            
            /**
             * GET endpoint: Get supplier performance metrics.
             *
             * @param {Object} req request object with supplier ID as a parameter.
             * @param {Object} res response object.
             * @returns {void}
             */
            router.get("/:id/performance", function (req, res) {
                if (!req.params.id) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Supplier ID is required.",
                    });
                }
                
                const supplierId = parseInt(req.params.id);
                const timePeriod = req.query.timePeriod || 'monthly'; // daily, weekly, monthly, quarterly, yearly
                
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
                    
                    // Get supplier performance metrics
                    getSupplierPerformanceMetrics(supplierId, timePeriod, function(err, metrics) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "Failed to retrieve supplier performance metrics.",
                            });
                        }
                        
                        res.json({
                            supplier: supplier,
                            performance: metrics,
                            timePeriod: timePeriod,
                            calculatedAt: new Date()
                        });
                    });
                });
            });
            
            /**
             * GET endpoint: Get all suppliers with performance metrics.
             *
             * @param {Object} req request object.
             * @param {Object} res response object.
             * @returns {void}
             */
            router.get("/with-performance", function (req, res) {
                const timePeriod = req.query.timePeriod || 'monthly';
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
                            
                            // Get performance metrics for all suppliers
                            const suppliersWithPerformance = [];
                            
                            async.eachSeries(suppliers, function (supplier, callback) {
                                getSupplierPerformanceMetrics(supplier._id, timePeriod, function(err, metrics) {
                                    if (err) {
                                        console.error(err);
                                        // Continue with other suppliers even if one fails
                                        suppliersWithPerformance.push({
                                            ...supplier,
                                            performance: null,
                                            error: err.message
                                        });
                                    } else {
                                        suppliersWithPerformance.push({
                                            ...supplier,
                                            performance: metrics
                                        });
                                    }
                                    
                                    callback();
                                });
                            }, function (err) {
                                if (err) {
                                    console.error(err);
                                }
                                
                                res.json({
                                    suppliers: suppliersWithPerformance,
                                    pagination: {
                                        total: count,
                                        page: page,
                                        limit: limit,
                                        pages: Math.ceil(count / limit)
                                    },
                                    timePeriod: timePeriod,
                                    calculatedAt: new Date()
                                });
                            });
                        });
                    });
            });
            
            /**
             * POST endpoint: Update supplier performance metrics.
             *
             * @param {Object} req request object with performance data in the body.
             * @param {Object} res response object.
             * @returns {void}
             */
            router.post("/:id/performance", function (req, res) {
                if (!req.params.id) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Supplier ID is required.",
                    });
                }
                
                const supplierId = parseInt(req.params.id);
                
                // Validate required fields
                if (!req.body.metricType || req.body.value === undefined) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Metric type and value are required fields.",
                    });
                }
                
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
                    
                    // Store performance metric
                    storeSupplierPerformanceMetric(supplierId, req.body, function(err, metric) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "Failed to store performance metric.",
                            });
                        }
                        
                        res.status(201).json({
                            message: "Performance metric recorded successfully.",
                            metric: metric
                        });
                    });
                });
            });
            
            /**
             * GET endpoint: Get supplier ranking based on performance.
             *
             * @param {Object} req request object.
             * @param {Object} res response object.
             * @returns {void}
             */
            router.get("/ranking", function (req, res) {
                const timePeriod = req.query.timePeriod || 'monthly';
                const sortBy = req.query.sortBy || 'overall_score'; // delivery_time, quality, cost, overall_score
                const limit = parseInt(req.query.limit) || 10;
                
                // Get all active suppliers
                suppliersDB.find({ isActive: true }, function (err, suppliers) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    // Get performance metrics for all suppliers
                    const suppliersWithRanking = [];
                    
                    async.eachSeries(suppliers, function (supplier, callback) {
                        getSupplierPerformanceMetrics(supplier._id, timePeriod, function(err, metrics) {
                            if (err) {
                                console.error(err);
                                // Continue with other suppliers even if one fails
                                suppliersWithRanking.push({
                                    ...supplier,
                                    performance: null,
                                    ranking: {
                                        overallScore: 0,
                                        deliveryTimeRank: null,
                                        qualityRank: null,
                                        costRank: null
                                    },
                                    error: err.message
                                });
                            } else {
                                // Calculate ranking score
                                const ranking = calculateSupplierRanking(metrics, sortBy);
                                
                                suppliersWithRanking.push({
                                    ...supplier,
                                    performance: metrics,
                                    ranking: ranking
                                });
                            }
                            
                            callback();
                        });
                    }, function (err) {
                        if (err) {
                            console.error(err);
                        }
                        
                        // Sort suppliers by ranking score
                        suppliersWithRanking.sort((a, b) => {
                            if (sortBy === 'delivery_time') {
                                return a.ranking.deliveryTimeRank - b.ranking.deliveryTimeRank;
                            } else if (sortBy === 'quality') {
                                return b.ranking.qualityRank - a.ranking.qualityRank;
                            } else if (sortBy === 'cost') {
                                return a.ranking.costRank - b.ranking.costRank;
                            } else {
                                return b.ranking.overallScore - a.ranking.overallScore;
                            }
                        });
                        
                        // Assign rank numbers
                        suppliersWithRanking.forEach((supplier, index) => {
                            supplier.ranking.rank = index + 1;
                        });
                        
                        res.json({
                            suppliers: suppliersWithRanking.slice(0, limit),
                            totalSuppliers: suppliersWithRanking.length,
                            sortBy: sortBy,
                            timePeriod: timePeriod,
                            calculatedAt: new Date()
                        });
                    });
                });
            });
            
            /**
             * GET endpoint: Get supplier comparison for multiple suppliers.
             *
             * @param {Object} req request object.
             * @param {Object} res response object.
             * @returns {void}
             */
            router.get("/comparison", function (req, res) {
                const supplierIds = req.query.supplierIds ?
                    req.query.supplierIds.split(',').map(id => parseInt(id)) : [];
                const timePeriod = req.query.timePeriod || 'monthly';
                
                if (supplierIds.length === 0) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "At least one supplier ID is required.",
                    });
                }
                
                // Get suppliers
                suppliersDB.find({ _id: { $in: supplierIds } }, function (err, suppliers) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    if (suppliers.length === 0) {
                        return res.status(404).json({
                            error: "Not Found",
                            message: "No suppliers found with the provided IDs.",
                        });
                    }
                    
                    // Get performance metrics for all suppliers
                    const suppliersWithComparison = [];
                    
                    async.eachSeries(suppliers, function (supplier, callback) {
                        getSupplierPerformanceMetrics(supplier._id, timePeriod, function(err, metrics) {
                            if (err) {
                                console.error(err);
                                suppliersWithComparison.push({
                                    ...supplier,
                                    performance: null,
                                    error: err.message
                                });
                            } else {
                                suppliersWithComparison.push({
                                    ...supplier,
                                    performance: metrics
                                });
                            }
                            
                            callback();
                        });
                    }, function (err) {
                        if (err) {
                            console.error(err);
                        }
                        
                        // Generate comparison data
                        const comparisonData = generateSupplierComparison(suppliersWithComparison);
                        
                        res.json({
                            suppliers: suppliersWithComparison,
                            comparison: comparisonData,
                            timePeriod: timePeriod,
                            calculatedAt: new Date()
                        });
                    });
                });
            });
            
            /**
             * Helper function to get supplier performance metrics
             *
             * @param {number} supplierId supplier ID
             * @param {string} timePeriod time period
             * @param {function} callback callback function
             * @returns {void}
             */
            function getSupplierPerformanceMetrics(supplierId, timePeriod, callback) {
                const Datastore = require("@seald-io/nedb");
                const path = require("path");
                
                // Get purchase orders for this supplier
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
                
                // Calculate date range based on time period
                const endDate = new Date();
                let startDate = new Date();
                
                switch (timePeriod) {
                    case 'daily':
                        startDate.setDate(endDate.getDate() - 1);
                        break;
                    case 'weekly':
                        startDate.setDate(endDate.getDate() - 7);
                        break;
                    case 'monthly':
                        startDate.setMonth(endDate.getMonth() - 1);
                        break;
                    case 'quarterly':
                        startDate.setMonth(endDate.getMonth() - 3);
                        break;
                    case 'yearly':
                        startDate.setFullYear(endDate.getFullYear() - 1);
                        break;
                    default:
                        startDate.setMonth(endDate.getMonth() - 1);
                }
                
                purchaseOrdersDB.find({
                    supplierId: supplierId,
                    orderDate: {
                        $gte: startDate.toISOString().split('T')[0],
                        $lte: endDate.toISOString().split('T')[0]
                    }
                }, function(err, orders) {
                    if (err) {
                        return callback(err);
                    }
                    
                    // Get purchase order items for detailed analysis
                    const purchaseOrderItemsDbPath = path.join(
                        process.env.APPDATA,
                        process.env.APPNAME,
                        "server",
                        "databases",
                        "purchase-order-items.db",
                    );
                    
                    const purchaseOrderItemsDB = new Datastore({
                        filename: purchaseOrderItemsDbPath,
                        autoload: true,
                    });
                    
                    const orderIds = orders.map(o => o._id);
                    
                    purchaseOrderItemsDB.find({
                        purchaseOrderId: { $in: orderIds }
                    }, function(err, items) {
                        if (err) {
                            return callback(err);
                        }
                        
                        // Calculate performance metrics
                        const metrics = calculateSupplierMetrics(orders, items, timePeriod);
                        
                        callback(null, metrics);
                    });
                });
            }
            
            /**
             * Helper function to calculate supplier metrics
             *
             * @param {Array} orders array of purchase orders
             * @param {Array} items array of purchase order items
             * @param {string} timePeriod time period
             * @returns {Object} calculated metrics
             */
            function calculateSupplierMetrics(orders, items, timePeriod) {
                if (orders.length === 0) {
                    return {
                        totalOrders: 0,
                        totalValue: 0,
                        averageOrderValue: 0,
                        onTimeDeliveryRate: 0,
                        averageDeliveryTime: 0,
                        qualityScore: 0,
                        costEfficiency: 0,
                        overallScore: 0
                    };
                }
                
                const totalOrders = orders.length;
                const totalValue = orders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
                const averageOrderValue = totalValue / totalOrders;
                
                // Calculate delivery performance
                const deliveredOrders = orders.filter(o => o.status === 'RECEIVED');
                const onTimeDeliveries = deliveredOrders.filter(o => {
                    if (!o.expectedDeliveryDate || !o.receivedDate) return false;
                    const expectedDate = new Date(o.expectedDeliveryDate);
                    const receivedDate = new Date(o.receivedDate);
                    return receivedDate <= expectedDate;
                });
                
                const onTimeDeliveryRate = deliveredOrders.length > 0 ?
                    (onTimeDeliveries.length / deliveredOrders.length) * 100 : 0;
                
                // Calculate average delivery time
                const deliveryTimes = deliveredOrders.map(o => {
                    if (!o.orderDate || !o.receivedDate) return 0;
                    const orderDate = new Date(o.orderDate);
                    const receivedDate = new Date(o.receivedDate);
                    return Math.ceil((receivedDate - orderDate) / (1000 * 60 * 60 * 24)); // days
                }).filter(days => days > 0);
                
                const averageDeliveryTime = deliveryTimes.length > 0 ?
                    deliveryTimes.reduce((sum, days) => sum + days, 0) / deliveryTimes.length : 0;
                
                // Calculate quality score (simplified - would normally be based on returns, defects, etc.)
                const qualityScore = Math.min(100, Math.max(0, 85 + (Math.random() * 15))); // Simulated quality score
                
                // Calculate cost efficiency (lower is better)
                const costEfficiency = Math.min(100, Math.max(0, 75 + (Math.random() * 25))); // Simulated cost efficiency
                
                // Calculate overall score
                const overallScore = (
                    (onTimeDeliveryRate * 0.3) +
                    (qualityScore * 0.4) +
                    (costEfficiency * 0.3)
                );
                
                return {
                    totalOrders: totalOrders,
                    totalValue: parseFloat(totalValue.toFixed(2)),
                    averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
                    onTimeDeliveryRate: parseFloat(onTimeDeliveryRate.toFixed(2)),
                    averageDeliveryTime: parseFloat(averageDeliveryTime.toFixed(2)),
                    qualityScore: parseFloat(qualityScore.toFixed(2)),
                    costEfficiency: parseFloat(costEfficiency.toFixed(2)),
                    overallScore: parseFloat(overallScore.toFixed(2)),
                    timePeriod: timePeriod
                };
            }
            
            /**
             * Helper function to store supplier performance metric
             *
             * @param {number} supplierId supplier ID
             * @param {Object} metricData metric data
             * @param {function} callback callback function
             * @returns {void}
             */
            function storeSupplierPerformanceMetric(supplierId, metricData, callback) {
                const Datastore = require("@seald-io/nedb");
                const path = require("path");
                
                // Get supplier analytics database
                const reorderAnalyticsDbPath = path.join(
                    process.env.APPDATA,
                    process.env.APPNAME,
                    "server",
                    "databases",
                    "reorder-analytics.db",
                );
                
                const reorderAnalyticsDB = new Datastore({
                    filename: reorderAnalyticsDbPath,
                    autoload: true,
                });
                
                const newMetric = {
                    _id: Math.floor(Date.now() / 1000),
                    metricType: 'SUPPLIER_PERFORMANCE',
                    value: parseFloat(metricData.value),
                    unit: metricData.unit || null,
                    storeId: metricData.storeId || null,
                    supplierId: supplierId,
                    referenceId: metricData.referenceId || null,
                    metadata: {
                        deliveryTime: metricData.deliveryTime || null,
                        quality: metricData.quality || null,
                        totalOrders: metricData.totalOrders || null,
                        onTimeDeliveries: metricData.onTimeDeliveries || null,
                        notes: metricData.notes || null
                    },
                    date: metricData.date ? new Date(metricData.date) : new Date(),
                    createdAt: new Date()
                };
                
                reorderAnalyticsDB.insert(newMetric, function (err, metric) {
                    if (err) {
                        return callback(err);
                    }
                    
                    callback(null, metric);
                });
            }
            
            /**
             * Helper function to calculate supplier ranking
             *
             * @param {Object} metrics performance metrics
             * @param {string} sortBy sort criteria
             * @returns {Object} ranking data
             */
            function calculateSupplierRanking(metrics, sortBy) {
                if (!metrics) {
                    return {
                        overallScore: 0,
                        deliveryTimeRank: null,
                        qualityRank: null,
                        costRank: null
                    };
                }
                
                let score = 0;
                
                switch (sortBy) {
                    case 'delivery_time':
                        score = 100 - (metrics.averageDeliveryTime * 2); // Lower delivery time = higher score
                        break;
                    case 'quality':
                        score = metrics.qualityScore;
                        break;
                    case 'cost':
                        score = metrics.costEfficiency;
                        break;
                    default:
                        score = metrics.overallScore;
                }
                
                return {
                    overallScore: metrics.overallScore,
                    deliveryTimeRank: metrics.averageDeliveryTime,
                    qualityRank: metrics.qualityScore,
                    costRank: metrics.costEfficiency,
                    score: parseFloat(score.toFixed(2))
                };
            }
            
            /**
             * Helper function to generate supplier comparison data
             *
             * @param {Array} suppliers array of suppliers with performance data
             * @returns {Object} comparison data
             */
            function generateSupplierComparison(suppliers) {
                if (suppliers.length === 0) {
                    return {
                        summary: {},
                        bestPerformers: {},
                        metrics: {}
                    };
                }
                
                const validSuppliers = suppliers.filter(s => s.performance !== null);
                
                if (validSuppliers.length === 0) {
                    return {
                        summary: { totalSuppliers: suppliers.length, validSuppliers: 0 },
                        bestPerformers: {},
                        metrics: {}
                    };
                }
                
                // Find best performers in each category
                const bestDeliveryTime = validSuppliers.reduce((best, current) =>
                    !best || current.performance.averageDeliveryTime < best.performance.averageDeliveryTime ? current : best
                , null);
                
                const bestQuality = validSuppliers.reduce((best, current) =>
                    !best || current.performance.qualityScore > best.performance.qualityScore ? current : best
                , null);
                
                const bestCostEfficiency = validSuppliers.reduce((best, current) =>
                    !best || current.performance.costEfficiency > best.performance.costEfficiency ? current : best
                , null);
                
                const bestOverall = validSuppliers.reduce((best, current) =>
                    !best || current.performance.overallScore > best.performance.overallScore ? current : best
                , null);
                
                // Calculate averages
                const avgDeliveryTime = validSuppliers.reduce((sum, s) => sum + s.performance.averageDeliveryTime, 0) / validSuppliers.length;
                const avgQuality = validSuppliers.reduce((sum, s) => sum + s.performance.qualityScore, 0) / validSuppliers.length;
                const avgCostEfficiency = validSuppliers.reduce((sum, s) => sum + s.performance.costEfficiency, 0) / validSuppliers.length;
                const avgOverallScore = validSuppliers.reduce((sum, s) => sum + s.performance.overallScore, 0) / validSuppliers.length;
                
                return {
                    summary: {
                        totalSuppliers: suppliers.length,
                        validSuppliers: validSuppliers.length,
                        averages: {
                            deliveryTime: parseFloat(avgDeliveryTime.toFixed(2)),
                            qualityScore: parseFloat(avgQuality.toFixed(2)),
                            costEfficiency: parseFloat(avgCostEfficiency.toFixed(2)),
                            overallScore: parseFloat(avgOverallScore.toFixed(2))
                        }
                    },
                    bestPerformers: {
                        deliveryTime: bestDeliveryTime ? {
                            supplier: bestDeliveryTime.name,
                            value: bestDeliveryTime.performance.averageDeliveryTime,
                            score: calculateSupplierRanking(bestDeliveryTime.performance, 'delivery_time').score
                        } : null,
                        quality: bestQuality ? {
                            supplier: bestQuality.name,
                            value: bestQuality.performance.qualityScore,
                            score: calculateSupplierRanking(bestQuality.performance, 'quality').score
                        } : null,
                        costEfficiency: bestCostEfficiency ? {
                            supplier: bestCostEfficiency.name,
                            value: bestCostEfficiency.performance.costEfficiency,
                            score: calculateSupplierRanking(bestCostEfficiency.performance, 'cost').score
                        } : null,
                        overall: bestOverall ? {
                            supplier: bestOverall.name,
                            value: bestOverall.performance.overallScore,
                            score: bestOverall.performance.overallScore
                        } : null
                    },
                    metrics: validSuppliers.map(s => ({
                        supplierId: s._id,
                        supplierName: s.name,
                        deliveryTime: s.performance.averageDeliveryTime,
                        qualityScore: s.performance.qualityScore,
                        costEfficiency: s.performance.costEfficiency,
                        overallScore: s.performance.overallScore,
                        totalOrders: s.performance.totalOrders,
                        totalValue: s.performance.totalValue
                    }))
                };
            }
            
            module.exports = router;
            });
        });
});