const app = require("express")();
const server = require("http").Server(app);
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const validator = require("validator");
const path = require("path");
const crypto = require("crypto");

const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "eway-bill.db",
);

app.use(bodyParser.json());

module.exports = app;

let eWayBillDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

eWayBillDB.ensureIndex({ fieldName: "_id", unique: true });
eWayBillDB.ensureIndex({ fieldName: "transaction_id", unique: true });
eWayBillDB.ensureIndex({ fieldName: "eway_bill_number", unique: true, sparse: true });

/**
 * GET endpoint: Get the welcome message for the E-Way Bill API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("E-Way Bill API");
});

/**
 * GET endpoint: Retrieve all e-way bill records.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    // Support pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Support filtering by status
    const status = req.query.status;
    const query = status ? { document_status: status } : {};
    
    eWayBillDB.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, docs) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                // Get total count for pagination
                eWayBillDB.count(query, function (err, count) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.send({
                        data: docs,
                        pagination: {
                            page: page,
                            limit: limit,
                            total: count,
                            pages: Math.ceil(count / limit)
                        }
                    });
                });
            }
        });
});

/**
 * GET endpoint: Get a specific e-way bill by ID.
 *
 * @param {Object} req request object with e-way bill ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    eWayBillDB.findOne({ _id: req.params.id }, function (err, eWayBill) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else if (eWayBill) {
            res.send(eWayBill);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "E-Way Bill not found.",
            });
        }
    });
});

/**
 * POST endpoint: Generate a new e-way bill.
 *
 * @param {Object} req request object with e-way bill data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.transaction_id || !req.body.from_state || !req.body.to_state || 
        !req.body.from_pincode || !req.body.to_pincode) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transaction ID, from state, to state, from pincode, and to pincode are required fields.",
        });
    }

    // Validate pincodes (6 digits)
    if (!/^\d{6}$/.test(req.body.from_pincode) || !/^\d{6}$/.test(req.body.to_pincode)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Pincodes must be 6 digits.",
        });
    }

    // Check if e-way bill already exists for this transaction
    eWayBillDB.findOne({ transaction_id: req.body.transaction_id }, function (err, existingBill) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (existingBill) {
            return res.status(409).json({
                error: "Conflict",
                message: "E-Way Bill already exists for this transaction.",
            });
        }

        // Calculate validity date (default 1 day from generation date)
        const generatedDate = new Date(req.body.generated_date) || new Date();
        const validUntil = new Date(generatedDate);
        validUntil.setDate(validUntil.getDate() + 1);

        // Generate a unique ID for e-way bill
        const billId = crypto.randomBytes(16).toString('hex');
        
        const eWayBill = {
            _id: billId,
            transaction_id: validator.escape(req.body.transaction_id),
            eway_bill_number: null, // Will be generated after GSTN verification
            generated_date: generatedDate,
            valid_until: validUntil,
            from_state: validator.escape(req.body.from_state),
            to_state: validator.escape(req.body.to_state),
            from_pincode: validator.escape(req.body.from_pincode),
            to_pincode: validator.escape(req.body.to_pincode),
            transporter_id: req.body.transporter_id ? validator.escape(req.body.transporter_id) : null,
            vehicle_number: req.body.vehicle_number ? validator.escape(req.body.vehicle_number) : null,
            distance_km: req.body.distance_km ? parseInt(req.body.distance_km) : 0,
            document_status: 'ACTIVE',
            cancel_reason: null,
            cancelled_at: null,
            created_at: new Date(),
            updated_at: new Date()
        };

        // Insert new e-way bill
        eWayBillDB.insert(eWayBill, function (err, newBill) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                // In a real implementation, this would trigger process to generate e-way bill number
                // For now, we'll simulate the generation
                generateEWayBillNumber(newBill._id, function (err, updatedBill) {
                    if (err) {
                        console.error(err);
                        // Still return created bill even if e-way bill number generation failed
                        res.status(201).send(newBill);
                    } else {
                        res.status(201).send(updatedBill);
                    }
                });
            }
        });
    });
});

/**
 * PUT endpoint: Update an e-way bill (e.g., update vehicle number, extend validity).
 *
 * @param {Object} req request object with e-way bill ID and update data.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    // Validate status
    const validStatuses = ['ACTIVE', 'CANCELLED', 'EXPIRED'];
    const status = req.body.document_status;
    
    if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
            error: "Bad Request",
            message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
    }

    // Prepare update data
    const updateData = {
        updated_at: new Date()
    };

    if (status) {
        updateData.document_status = status;
        
        if (status === 'CANCELLED') {
            updateData.cancel_reason = req.body.cancel_reason || '';
            updateData.cancelled_at = new Date();
        }
    }

    if (req.body.vehicle_number) {
        updateData.vehicle_number = validator.escape(req.body.vehicle_number);
    }

    if (req.body.distance_km !== undefined) {
        updateData.distance_km = parseInt(req.body.distance_km) || 0;
    }

    if (req.body.valid_until) {
        updateData.valid_until = new Date(req.body.valid_until);
    }

    if (req.body.transporter_id !== undefined) {
        updateData.transporter_id = req.body.transporter_id ? validator.escape(req.body.transporter_id) : null;
    }

    eWayBillDB.update(
        { _id: req.params.id },
        { $set: updateData },
        {},
        function (err, numReplaced) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else if (numReplaced === 0) {
                res.status(404).json({
                    error: "Not Found",
                    message: "E-Way Bill not found.",
                });
            } else {
                // Return updated e-way bill
                eWayBillDB.findOne({ _id: req.params.id }, function (err, bill) {
                    if (err) {
                        console.error(err);
                        res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    } else {
                        res.send(bill);
                    }
                });
            }
        }
    );
});

/**
 * DELETE endpoint: Delete an e-way bill by ID.
 *
 * @param {Object} req request object with e-way bill ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    // Check if e-way bill is active
    eWayBillDB.findOne({ _id: req.params.id, document_status: 'ACTIVE' }, function (err, bill) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (bill) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete an active e-way bill. Please cancel it instead.",
            });
        }

        // Delete e-way bill
        eWayBillDB.remove({ _id: req.params.id }, function (err, numRemoved) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else if (numRemoved === 0) {
                res.status(404).json({
                    error: "Not Found",
                    message: "E-Way Bill not found.",
                });
            } else {
                res.sendStatus(200);
            }
        });
    });
});

/**
 * POST endpoint: Cancel an e-way bill.
 *
 * @param {Object} req request object with e-way bill ID and cancellation reason.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/:id/cancel", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    if (!req.body.cancel_reason) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Cancellation reason is required.",
        });
    }

    eWayBillDB.update(
        { _id: req.params.id, document_status: 'ACTIVE' },
        { 
            $set: {
                document_status: 'CANCELLED',
                cancel_reason: validator.escape(req.body.cancel_reason),
                cancelled_at: new Date(),
                updated_at: new Date()
            }
        },
        {},
        function (err, numReplaced) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else if (numReplaced === 0) {
                res.status(404).json({
                    error: "Not Found",
                    message: "Active E-Way Bill not found.",
                });
            } else {
                // Return updated e-way bill
                eWayBillDB.findOne({ _id: req.params.id }, function (err, bill) {
                    if (err) {
                        console.error(err);
                        res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    } else {
                        res.send(bill);
                    }
                });
            }
        }
    );
});

/**
 * GET endpoint: Get e-way bills that are expiring soon (within 24 hours).
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/expiring-soon", function (req, res) {
    // Calculate 24 hours from now
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    eWayBillDB.find({
        document_status: 'ACTIVE',
        valid_until: { $lte: tomorrow }
    }, function (err, docs) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else {
            res.send(docs);
        }
    });
});

/**
 * GET endpoint: Get e-way bills by e-way bill number.
 *
 * @param {Object} req request object with e-way bill number as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/number/:ewayBillNumber", function (req, res) {
    if (!req.params.ewayBillNumber) {
        return res.status(400).send("E-Way Bill number is required.");
    }

    eWayBillDB.findOne({ eway_bill_number: req.params.ewayBillNumber }, function (err, bill) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else if (bill) {
            res.send(bill);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "E-Way Bill not found.",
            });
        }
    });
});

/**
 * Helper function to generate e-way bill number
 * In a real implementation, this would call GSTN API
 *
 * @param {String} billId The ID of e-way bill
 * @param {Function} callback Callback function
 * @returns {void}
 */
function generateEWayBillNumber(billId, callback) {
    // In a real implementation, this would:
    // 1. Get the transaction details
    // 2. Get the e-way bill data
    // 3. Format data according to GSTN requirements
    // 4. Call the GSTN API to generate e-way bill number
    // 5. Update the e-way bill with the response

    // For now, we'll simulate the process with a timeout
    setTimeout(function() {
        // Generate a mock e-way bill number (12 characters as per GSTN specification)
        const mockBillNumber = Math.floor(100000000000 + Math.random() * 900000000000).toString();
        
        // Update the e-way bill with the mock data
        eWayBillDB.update(
            { _id: billId },
            { 
                $set: {
                    eway_bill_number: mockBillNumber,
                    updated_at: new Date()
                }
            },
            {},
            function (err, numReplaced) {
                if (err) {
                    return callback(err);
                }
                
                // Get the updated e-way bill
                eWayBillDB.findOne({ _id: billId }, function (err, bill) {
                    if (err) {
                        return callback(err);
                    }
                    
                    callback(null, bill);
                });
            }
        );
    }, 2000); // Simulate a 2-second delay for the API call
}