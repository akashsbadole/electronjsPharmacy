const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const validator = require("validator");
const dbManager = require('./db-manager');

router.use(bodyParser.json());

module.exports = router;

// Initialize database asynchronously
let transportersDB;

// Initialize the database when the module loads
(async function() {
    try {
        transportersDB = await dbManager.getDatabase("transporters.db");
        transportersDB.ensureIndex({ fieldName: "_id", unique: true });
        transportersDB.ensureIndex({ fieldName: "transporter_id", unique: true, sparse: true });
        console.log("Transporters database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize transporters database:", error);
    }
})();


/**
 * GET endpoint: Get the welcome message for the Transporter API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Transporter API");
});

/**
 * GET endpoint: Retrieve all transporters.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    // Support pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Support filtering by active status
    const isActive = req.query.is_active;
    const query = isActive !== undefined ? { is_active: isActive === 'true' } : {};
    
    transportersDB.find(query)
        .sort({ name: 1 })
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
                transportersDB.count(query, function (err, count) {
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
 * GET endpoint: Get a specific transporter by ID.
 *
 * @param {Object} req request object with transporter ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    transportersDB.findOne({ _id: req.params.id }, function (err, transporter) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else if (transporter) {
            res.send(transporter);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "Transporter not found.",
            });
        }
    });
});

/**
 * POST endpoint: Add a new transporter.
 *
 * @param {Object} req request object with transporter data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.name) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transporter name is required.",
        });
    }

    // Validate phone number if provided
    if (req.body.phone && !validator.isMobilePhone(req.body.phone, 'any')) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid phone number format.",
        });
    }

    // Validate email if provided
    if (req.body.email && !validator.isEmail(req.body.email)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid email format.",
        });
    }

    // Validate GST number if provided
    if (req.body.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(req.body.gst_number)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid GST number format.",
        });
    }

    // Check if transporter with same name already exists
    transportersDB.findOne({ name: validator.escape(req.body.name) }, function (err, existingTransporter) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (existingTransporter) {
            return res.status(409).json({
                error: "Conflict",
                message: "Transporter with this name already exists.",
            });
        }

        // Generate a unique ID for transporter
        const transporterId = Math.floor(Date.now() / 1000);
        
        const transporter = {
            _id: transporterId,
            name: validator.escape(req.body.name),
            gst_number: req.body.gst_number ? validator.escape(req.body.gst_number) : null,
            transporter_id: req.body.transporter_id ? validator.escape(req.body.transporter_id) : null,
            phone: req.body.phone ? validator.escape(req.body.phone) : null,
            address: req.body.address ? validator.escape(req.body.address) : null,
            is_active: req.body.is_active !== undefined ? req.body.is_active : true,
            created_at: new Date(),
            updated_at: new Date()
        };

        // Insert new transporter
        transportersDB.insert(transporter, function (err, newTransporter) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            } else {
                res.status(201).send(newTransporter);
            }
        });
    });
});

/**
 * PUT endpoint: Update a transporter.
 *
 * @param {Object} req request object with transporter ID and update data.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    // Validate phone number if provided
    if (req.body.phone && !validator.isMobilePhone(req.body.phone, 'any')) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid phone number format.",
        });
    }

    // Validate email if provided
    if (req.body.email && !validator.isEmail(req.body.email)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid email format.",
        });
    }

    // Validate GST number if provided
    if (req.body.gst_number && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(req.body.gst_number)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid GST number format.",
        });
    }

    // Check if transporter exists
    transportersDB.findOne({ _id: req.params.id }, function (err, existingTransporter) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!existingTransporter) {
            return res.status(404).json({
                error: "Not Found",
                message: "Transporter not found.",
            });
        }

        // Check if another transporter with the same name exists (if name is being updated)
        if (req.body.name && req.body.name !== existingTransporter.name) {
            transportersDB.findOne({ name: validator.escape(req.body.name) }, function (err, duplicateTransporter) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                if (duplicateTransporter) {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "Transporter with this name already exists.",
                    });
                }

                updateTransporter();
            });
        } else {
            updateTransporter();
        }

        function updateTransporter() {
            // Prepare update data
            const updateData = {
                updated_at: new Date()
            };

            if (req.body.name !== undefined) {
                updateData.name = validator.escape(req.body.name);
            }

            if (req.body.gst_number !== undefined) {
                updateData.gst_number = req.body.gst_number ? validator.escape(req.body.gst_number) : null;
            }

            if (req.body.transporter_id !== undefined) {
                updateData.transporter_id = req.body.transporter_id ? validator.escape(req.body.transporter_id) : null;
            }

            if (req.body.phone !== undefined) {
                updateData.phone = req.body.phone ? validator.escape(req.body.phone) : null;
            }

            if (req.body.address !== undefined) {
                updateData.address = req.body.address ? validator.escape(req.body.address) : null;
            }

            if (req.body.is_active !== undefined) {
                updateData.is_active = req.body.is_active;
            }

            transportersDB.update(
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
                            message: "Transporter not found.",
                        });
                    } else {
                        // Return updated transporter
                        transportersDB.findOne({ _id: req.params.id }, function (err, transporter) {
                            if (err) {
                                console.error(err);
                                res.status(500).json({
                                    error: "Internal Server Error",
                                    message: "An unexpected error occurred.",
                                });
                            } else {
                                res.send(transporter);
                            }
                        });
                    }
                }
            );
        }
    });
});

/**
 * DELETE endpoint: Delete a transporter by ID.
 *
 * @param {Object} req request object with transporter ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    // Check if transporter is associated with any e-way bills
    const eWayBillDB = require("./eway-bill");
    
    // In a real implementation, we would check if the transporter is referenced in any e-way bills
    // For now, we'll just proceed with the deletion
    
    transportersDB.remove({ _id: req.params.id }, function (err, numRemoved) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else if (numRemoved === 0) {
            res.status(404).json({
                error: "Not Found",
                message: "Transporter not found.",
            });
        } else {
            res.sendStatus(200);
        }
    });
});

/**
 * GET endpoint: Search transporters by name or GST number.
 *
 * @param {Object} req request object with search query.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/search/:query", function (req, res) {
    if (!req.params.query) {
        return res.status(400).send("Search query is required.");
    }

    const query = validator.escape(req.params.query);
    
    // Search by name or GST number
    transportersDB.find({
        $or: [
            { name: { $regex: query, $options: 'i' } },
            { gst_number: { $regex: query, $options: 'i' } },
            { transporter_id: { $regex: query, $options: 'i' } }
        ]
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
 * GET endpoint: Get active transporters only.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/active", function (req, res) {
    transportersDB.find({ is_active: true }, function (err, docs) {
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
 * POST endpoint: Bulk import transporters.
 *
 * @param {Object} req request object with array of transporter data.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/bulk", function (req, res) {
    if (!req.body.transporters || !Array.isArray(req.body.transporters)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transporters array is required.",
        });
    }

    const transporters = req.body.transporters;
    const results = {
        success: [],
        failed: []
    };

    // Process each transporter
    let processed = 0;
    const total = transporters.length;

    if (total === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transporters array cannot be empty.",
        });
    }

    transporters.forEach(function (transporterData, index) {
        // Validate required fields
        if (!transporterData.name) {
            results.failed.push({
                index: index,
                data: transporterData,
                error: "Transporter name is required."
            });
            processed++;
            checkComplete();
            return;
        }

        // Check if transporter with same name already exists
        transportersDB.findOne({ name: validator.escape(transporterData.name) }, function (err, existingTransporter) {
            if (err) {
                results.failed.push({
                    index: index,
                    data: transporterData,
                    error: "Database error."
                });
            } else if (existingTransporter) {
                results.failed.push({
                    index: index,
                    data: transporterData,
                    error: "Transporter with this name already exists."
                });
            } else {
                // Generate a unique ID for transporter
                const transporterId = Math.floor(Date.now() / 1000) + index;
                
                const transporter = {
                    _id: transporterId,
                    name: validator.escape(transporterData.name),
                    gst_number: transporterData.gst_number ? validator.escape(transporterData.gst_number) : null,
                    transporter_id: transporterData.transporter_id ? validator.escape(transporterData.transporter_id) : null,
                    phone: transporterData.phone ? validator.escape(transporterData.phone) : null,
                    address: transporterData.address ? validator.escape(transporterData.address) : null,
                    is_active: transporterData.is_active !== undefined ? transporterData.is_active : true,
                    created_at: new Date(),
                    updated_at: new Date()
                };

                transportersDB.insert(transporter, function (err, newTransporter) {
                    if (err) {
                        results.failed.push({
                            index: index,
                            data: transporterData,
                            error: "Failed to insert transporter."
                        });
                    } else {
                        results.success.push(newTransporter);
                    }
                });
            }
            
            processed++;
            checkComplete();
        });
    });

    function checkComplete() {
        if (processed === total) {
            res.send({
                message: `Processed ${total} transporters.`,
                results: results
            });
        }
    }
});