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
    "prescriptions.db",
);

app.use(bodyParser.json());

module.exports = app;

let prescriptionsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

prescriptionsDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Prescriptions API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Prescriptions API");
});

/**
 * GET endpoint: Retrieve prescriptions with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    prescriptionsDB
        .find({})
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, prescriptions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            prescriptionsDB.count({}, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    prescriptions: prescriptions,
                    pagination: {
                        page: page,
                        limit: limit,
                        total: totalCount,
                        pages: Math.ceil(totalCount / limit)
                    }
                });
            });
        });
});

/**
 * POST endpoint: Create new prescription.
 *
 * @param {Object} req request object with prescription data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.customer_id || !req.body.prescription_date) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID and prescription date are required fields.",
        });
    }
    
    const newPrescription = {
        _id: Math.floor(Date.now() / 1000),
        prescription_number: req.body.prescription_number || generatePrescriptionNumber(),
        customer_id: validator.escape(req.body.customer_id),
        doctor_name: validator.escape(req.body.doctor_name || ""),
        doctor_registration: validator.escape(req.body.doctor_registration || ""),
        hospital_name: validator.escape(req.body.hospital_name || ""),
        prescription_date: new Date(req.body.prescription_date),
        notes: validator.escape(req.body.notes || ""),
        image_url: validator.escape(req.body.image_url || ""),
        is_processed: req.body.is_processed || false,
        processed_by: req.body.processed_by || null,
        processed_at: req.body.processed_at || null,
        created_at: new Date(),
        updated_at: new Date()
    };
    
    prescriptionsDB.insert(newPrescription, function (err, prescription) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        res.status(201).json(prescription);
    });
});

/**
 * GET endpoint: Get specific prescription by ID.
 *
 * @param {Object} req request object with prescription ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Prescription ID is required.");
    }
    
    prescriptionsDB.findOne({ _id: req.params.id }, function (err, prescription) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!prescription) {
            return res.status(404).json({
                error: "Not Found",
                message: "Prescription not found.",
            });
        }
        
        res.json(prescription);
    });
});

/**
 * PUT endpoint: Update prescription.
 *
 * @param {Object} req request object with updated prescription data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Prescription ID is required.");
    }
    
    // Check if prescription exists
    prescriptionsDB.findOne({ _id: req.params.id }, function (err, prescription) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!prescription) {
            return res.status(404).json({
                error: "Not Found",
                message: "Prescription not found.",
            });
        }
        
        const updatedPrescription = {
            prescription_number: req.body.prescription_number || prescription.prescription_number,
            customer_id: req.body.customer_id ? validator.escape(req.body.customer_id) : prescription.customer_id,
            doctor_name: req.body.doctor_name !== undefined ? validator.escape(req.body.doctor_name) : prescription.doctor_name,
            doctor_registration: req.body.doctor_registration !== undefined ? validator.escape(req.body.doctor_registration) : prescription.doctor_registration,
            hospital_name: req.body.hospital_name !== undefined ? validator.escape(req.body.hospital_name) : prescription.hospital_name,
            prescription_date: req.body.prescription_date ? new Date(req.body.prescription_date) : prescription.prescription_date,
            notes: req.body.notes !== undefined ? validator.escape(req.body.notes) : prescription.notes,
            image_url: req.body.image_url !== undefined ? validator.escape(req.body.image_url) : prescription.image_url,
            is_processed: req.body.is_processed !== undefined ? req.body.is_processed : prescription.is_processed,
            processed_by: req.body.processed_by !== undefined ? req.body.processed_by : prescription.processed_by,
            processed_at: req.body.processed_at !== undefined ? req.body.processed_at : prescription.processed_at,
            updated_at: new Date()
        };
        
        prescriptionsDB.update(
            { _id: req.params.id },
            { $set: updatedPrescription },
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
                    message: "Prescription updated successfully.",
                    prescription: { ...prescription, ...updatedPrescription }
                });
            }
        );
    });
});

/**
 * DELETE endpoint: Delete prescription.
 *
 * @param {Object} req request object with prescription ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Prescription ID is required.");
    }
    
    // Check if prescription exists
    prescriptionsDB.findOne({ _id: req.params.id }, function (err, prescription) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!prescription) {
            return res.status(404).json({
                error: "Not Found",
                message: "Prescription not found.",
            });
        }
        
        prescriptionsDB.remove(
            { _id: req.params.id },
            {},
            function (err, numRemoved) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    message: "Prescription deleted successfully."
                });
            }
        );
    });
});

/**
 * GET endpoint: Get prescriptions for a customer.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/customer/:customerId", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).send("Customer ID is required.");
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    prescriptionsDB
        .find({ customer_id: req.params.customerId })
        .sort({ prescription_date: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, prescriptions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            prescriptionsDB.count({ customer_id: req.params.customerId }, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    prescriptions: prescriptions,
                    pagination: {
                        page: page,
                        limit: limit,
                        total: totalCount,
                        pages: Math.ceil(totalCount / limit)
                    }
                });
            });
        });
});

/**
 * GET endpoint: Get prescriptions by doctor.
 *
 * @param {Object} req request object with doctor name as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/doctor/:doctorName", function (req, res) {
    if (!req.params.doctorName) {
        return res.status(400).send("Doctor name is required.");
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Using regex for partial match on doctor name
    const doctorNameRegex = new RegExp(req.params.doctorName, "i");
    
    prescriptionsDB
        .find({ doctor_name: doctorNameRegex })
        .sort({ prescription_date: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, prescriptions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            prescriptionsDB.count({ doctor_name: doctorNameRegex }, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    prescriptions: prescriptions,
                    pagination: {
                        page: page,
                        limit: limit,
                        total: totalCount,
                        pages: Math.ceil(totalCount / limit)
                    }
                });
            });
        });
});

/**
 * GET endpoint: Get prescriptions by status.
 *
 * @param {Object} req request object with status as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/status/:status", function (req, res) {
    if (!req.params.status) {
        return res.status(400).send("Status is required.");
    }
    
    const isProcessed = req.params.status === 'processed';
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    prescriptionsDB
        .find({ is_processed: isProcessed })
        .sort({ prescription_date: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, prescriptions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            prescriptionsDB.count({ is_processed: isProcessed }, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    prescriptions: prescriptions,
                    pagination: {
                        page: page,
                        limit: limit,
                        total: totalCount,
                        pages: Math.ceil(totalCount / limit)
                    }
                });
            });
        });
});

/**
 * POST endpoint: Convert prescription to sale.
 *
 * @param {Object} req request object with prescription ID and sale details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/:id/convert-to-sale", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Prescription ID is required.");
    }
    
    // Validate required fields
    if (!req.body.user_id || !req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "User ID and items array are required fields.",
        });
    }
    
    // Check if prescription exists
    prescriptionsDB.findOne({ _id: req.params.id }, function (err, prescription) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!prescription) {
            return res.status(404).json({
                error: "Not Found",
                message: "Prescription not found.",
            });
        }
        
        // Check if prescription is already processed
        if (prescription.is_processed) {
            return res.status(409).json({
                error: "Conflict",
                message: "Prescription is already processed.",
            });
        }
        
        // Create transaction from prescription
        const Transactions = require("./transactions");
        const transactionData = {
            customer: prescription.customer_id,
            user_id: req.body.user_id,
            items: req.body.items,
            total: req.body.total || calculateTotal(req.body.items),
            paid: req.body.paid || 0,
            date: new Date(),
            status: req.body.paid >= (req.body.total || calculateTotal(req.body.items)) ? 1 : 0,
            prescription_id: prescription._id,
            notes: `Sale from prescription #${prescription.prescription_number}`
        };
        
        // Create the transaction
        Transactions.createNewTransaction(transactionData, function (err, transaction) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to create transaction from prescription.",
                });
            }
            
            // Update prescription as processed
            prescriptionsDB.update(
                { _id: req.params.id },
                {
                    $set: {
                        is_processed: true,
                        processed_by: req.body.user_id,
                        processed_at: new Date(),
                        updated_at: new Date()
                    }
                },
                {},
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to update prescription status.",
                        });
                    }
                    
                    res.status(201).json({
                        message: "Prescription converted to sale successfully.",
                        transaction: transaction,
                        prescription: { ...prescription, is_processed: true, processed_by: req.body.user_id, processed_at: new Date() }
                    });
                }
            );
        });
    });
});

/**
 * Helper function to generate a prescription number
 *
 * @returns {string} Generated prescription number
 */
function generatePrescriptionNumber() {
    const date = new Date();
    const year = date.getFullYear().toString().substr(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `PR${year}${month}${day}${random}`;
}

/**
 * Helper function to calculate total from items
 *
 * @param {Array} items Array of items with price and quantity
 * @returns {number} Total amount
 */
function calculateTotal(items) {
    return items.reduce((total, item) => {
        return total + (parseFloat(item.price) * parseInt(item.quantity));
    }, 0);
}

/**
 * Helper function to create a new transaction (to be used with Transactions module)
 *
 * @param {Object} transactionData Transaction data
 * @param {Function} callback Callback function
 * @returns {void}
 */
function createNewTransaction(transactionData, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const dbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "transactions.db",
    );
    
    const transactionsDB = new Datastore({
        filename: dbPath,
        autoload: true,
    });
    
    transactionsDB.insert(transactionData, callback);
}

module.exports.createNewTransaction = createNewTransaction;