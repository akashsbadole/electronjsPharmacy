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
    "payments.db",
);

app.use(bodyParser.json());

module.exports = app;

let paymentsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

paymentsDB.ensureIndex({ fieldName: "_id", unique: true });
paymentsDB.ensureIndex({ fieldName: "paymentNumber" });
paymentsDB.ensureIndex({ fieldName: "supplierId" });
paymentsDB.ensureIndex({ fieldName: "customerId" });
paymentsDB.ensureIndex({ fieldName: "paymentType" });
paymentsDB.ensureIndex({ fieldName: "paymentDate" });

/**
 * GET endpoint: Get welcome message for Payments API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Payments API");
});

/**
 * GET endpoint: Retrieve payments with pagination.
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
    if (req.query.supplierId) {
        query.supplierId = parseInt(req.query.supplierId);
    }
    if (req.query.customerId) {
        query.customerId = req.query.customerId;
    }
    if (req.query.paymentType) {
        query.paymentType = validator.escape(req.query.paymentType);
    }
    if (req.query.paymentMethod) {
        query.paymentMethod = validator.escape(req.query.paymentMethod);
    }
    if (req.query.startDate && req.query.endDate) {
        query.paymentDate = {
            $gte: validator.escape(req.query.startDate),
            $lte: validator.escape(req.query.endDate)
        };
    }
    
    paymentsDB.find(query)
        .sort({ paymentDate: -1 })
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
            paymentsDB.count(query, function (err, count) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    payments: docs,
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
 * POST endpoint: Create new payment.
 *
 * @param {Object} req request object with payment data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.paymentType || !req.body.amount || !req.body.paymentMethod) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment type, amount, and payment method are required fields.",
        });
    }
    
    if (req.body.paymentType !== 'PAYABLE' && req.body.paymentType !== 'RECEIVABLE') {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment type must be either 'PAYABLE' or 'RECEIVABLE'.",
        });
    }
    
    if (req.body.paymentType === 'PAYABLE' && !req.body.supplierId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Supplier ID is required for payable payments.",
        });
    }
    
    if (req.body.paymentType === 'RECEIVABLE' && !req.body.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required for receivable payments.",
        });
    }
    
    // Generate unique payment number
    const paymentNumber = generatePaymentNumber(req.body.paymentType);
    
    const newPayment = {
        _id: Math.floor(Date.now() / 1000),
        paymentNumber: paymentNumber,
        paymentType: validator.escape(req.body.paymentType),
        supplierId: req.body.supplierId ? parseInt(req.body.supplierId) : null,
        customerId: req.body.customerId ? req.body.customerId : null,
        amount: parseFloat(req.body.amount),
        paymentMethod: validator.escape(req.body.paymentMethod),
        referenceNumber: req.body.referenceNumber ? validator.escape(req.body.referenceNumber) : null,
        notes: req.body.notes ? validator.escape(req.body.notes) : null,
        paymentDate: req.body.paymentDate || new Date().toISOString().split('T')[0],
        allocations: req.body.allocations || [],
        status: 'COMPLETED',
        createdBy: req.body.createdBy ? parseInt(req.body.createdBy) : null,
        createdAt: new Date(),
        updatedAt: new Date()
    };
    
    paymentsDB.insert(newPayment, function (err, payment) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        // Update account balance
        updateAccountBalance(payment, function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to update account balance.",
                });
            }
            
            // Process allocations if provided
            if (req.body.allocations && Array.isArray(req.body.allocations) && req.body.allocations.length > 0) {
                processPaymentAllocations(payment._id, req.body.allocations, function(err) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to process payment allocations.",
                        });
                    }
                    
                    res.status(201).json(payment);
                });
            } else {
                res.status(201).json(payment);
            }
        });
    });
});

/**
 * GET endpoint: Get specific payment by ID.
 *
 * @param {Object} req request object with payment ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment ID is required.",
        });
    }
    
    const paymentId = parseInt(req.params.id);
    
    paymentsDB.findOne({ _id: paymentId }, function (err, payment) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!payment) {
            return res.status(404).json({
                error: "Not Found",
                message: "Payment not found.",
            });
        }
        
        res.json(payment);
    });
});

/**
 * PUT endpoint: Update payment.
 *
 * @param {Object} req request object with updated payment data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment ID is required.",
        });
    }
    
    const paymentId = parseInt(req.params.id);
    
    // Check if payment exists
    paymentsDB.findOne({ _id: paymentId }, function (err, existingPayment) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!existingPayment) {
            return res.status(404).json({
                error: "Not Found",
                message: "Payment not found.",
            });
        }
        
        // Cannot update completed payments
        if (existingPayment.status === 'COMPLETED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot update a completed payment.",
            });
        }
        
        const updatedPayment = {
            amount: req.body.amount !== undefined ? parseFloat(req.body.amount) : existingPayment.amount,
            paymentMethod: req.body.paymentMethod !== undefined ? validator.escape(req.body.paymentMethod) : existingPayment.paymentMethod,
            referenceNumber: req.body.referenceNumber !== undefined ? validator.escape(req.body.referenceNumber) : existingPayment.referenceNumber,
            notes: req.body.notes !== undefined ? validator.escape(req.body.notes) : existingPayment.notes,
            paymentDate: req.body.paymentDate !== undefined ? validator.escape(req.body.paymentDate) : existingPayment.paymentDate,
            status: req.body.status !== undefined ? validator.escape(req.body.status) : existingPayment.status,
            updatedAt: new Date()
        };
        
        paymentsDB.update({ _id: paymentId }, { $set: updatedPayment }, {}, function (err, numReplaced) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({
                ...updatedPayment,
                _id: paymentId
            });
        });
    });
});

/**
 * DELETE endpoint: Delete payment.
 *
 * @param {Object} req request object with payment ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment ID is required.",
        });
    }
    
    const paymentId = parseInt(req.params.id);
    
    // Check if payment exists
    paymentsDB.findOne({ _id: paymentId }, function (err, payment) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!payment) {
            return res.status(404).json({
                error: "Not Found",
                message: "Payment not found.",
            });
        }
        
        // Cannot delete completed payments
        if (payment.status === 'COMPLETED') {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete a completed payment.",
            });
        }
        
        // Delete payment
        paymentsDB.remove({ _id: paymentId }, function (err, numRemoved) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({ message: "Payment deleted successfully." });
        });
    });
});

/**
 * POST endpoint: Allocate payment to invoices.
 *
 * @param {Object} req request object with payment ID and allocations in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/:id/allocate", function (req, res) {
    if (!req.params.id) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment ID is required.",
        });
    }
    
    if (!req.body.allocations || !Array.isArray(req.body.allocations)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Allocations array is required.",
        });
    }
    
    const paymentId = parseInt(req.params.id);
    
    // Check if payment exists
    paymentsDB.findOne({ _id: paymentId }, function (err, payment) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!payment) {
            return res.status(404).json({
                error: "Not Found",
                message: "Payment not found.",
            });
        }
        
        // Process allocations
        processPaymentAllocations(paymentId, req.body.allocations, function(err) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to process payment allocations.",
                });
            }
            
            // Update payment with allocations
            paymentsDB.update(
                { _id: paymentId },
                { 
                    $set: {
                        allocations: req.body.allocations,
                        updatedAt: new Date()
                    }
                },
                {},
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to update payment allocations.",
                        });
                    }
                    
                    res.json({ message: "Payment allocated successfully." });
                }
            );
        });
    });
});

/**
 * GET endpoint: Get payments by type (payable/receivable).
 *
 * @param {Object} req request object with payment type as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/type/:paymentType", function (req, res) {
    if (!req.params.paymentType) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment type is required.",
        });
    }
    
    const paymentType = validator.escape(req.params.paymentType);
    
    if (paymentType !== 'PAYABLE' && paymentType !== 'RECEIVABLE') {
        return res.status(400).json({
            error: "Bad Request",
            message: "Payment type must be either 'PAYABLE' or 'RECEIVABLE'.",
        });
    }
    
    paymentsDB.find({ paymentType: paymentType })
        .sort({ paymentDate: -1 })
        .exec(function (err, payments) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json(payments);
        });
});

/**
 * GET endpoint: Get payment summary.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/summary", function (req, res) {
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    let query = {};
    if (startDate && endDate) {
        query.paymentDate = {
            $gte: validator.escape(startDate),
            $lte: validator.escape(endDate)
        };
    }
    
    paymentsDB.find(query, function (err, payments) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        const summary = {
            totalPayables: 0,
            totalReceivables: 0,
            payableCount: 0,
            receivableCount: 0,
            paymentMethods: {}
        };
        
        payments.forEach(payment => {
            if (payment.paymentType === 'PAYABLE') {
                summary.totalPayables += payment.amount;
                summary.payableCount++;
            } else if (payment.paymentType === 'RECEIVABLE') {
                summary.totalReceivables += payment.amount;
                summary.receivableCount++;
            }
            
            // Count by payment method
            if (!summary.paymentMethods[payment.paymentMethod]) {
                summary.paymentMethods[payment.paymentMethod] = 0;
            }
            summary.paymentMethods[payment.paymentMethod] += payment.amount;
        });
        
        res.json(summary);
    });
});

/**
 * Helper function to generate unique payment number
 *
 * @param {string} paymentType payment type (PAYABLE/RECEIVABLE)
 * @returns {string} unique payment number
 */
function generatePaymentNumber(paymentType) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = date.getTime();
    
    const prefix = paymentType === 'PAYABLE' ? 'PMT' : 'RMT';
    return `${prefix}${year}${month}${day}${time.toString().slice(-6)}`;
}

/**
 * Helper function to update account balance
 *
 * @param {Object} payment payment object
 * @param {function} callback callback function
 * @returns {void}
 */
function updateAccountBalance(payment, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    if (payment.paymentType === 'PAYABLE') {
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
        
        // For payable payments, we reduce the balance (we're paying off what we owe)
        supplierAccountsDB.update(
            { supplierId: payment.supplierId },
            { $inc: { balance: -payment.amount } },
            {},
            function (err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                callback(null);
            }
        );
    } else if (payment.paymentType === 'RECEIVABLE') {
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
        
        // For receivable payments, we reduce the balance (customer is paying what they owe)
        customerAccountsDB.update(
            { customerId: payment.customerId },
            { $inc: { balance: -payment.amount } },
            {},
            function (err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                callback(null);
            }
        );
    } else {
        callback(new Error("Invalid payment type"));
    }
}

/**
 * Helper function to process payment allocations
 *
 * @param {number} paymentId payment ID
 * @param {Array} allocations array of allocations
 * @param {function} callback callback function
 * @returns {void}
 */
function processPaymentAllocations(paymentId, allocations, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Process each allocation
    allocations.forEach(allocation => {
        if (allocation.invoiceType === 'SUPPLIER') {
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
            
            // Update invoice balance
            supplierInvoicesDB.update(
                { _id: allocation.invoiceId },
                { $inc: { balanceAmount: -allocation.amount } },
                {},
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                    }
                }
            );
        } else if (allocation.invoiceType === 'CUSTOMER') {
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
            
            // Update invoice balance
            customerInvoicesDB.update(
                { _id: allocation.invoiceId },
                { $inc: { balanceAmount: -allocation.amount } },
                {},
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                    }
                }
            );
        }
    });
    
    callback(null);
}