const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const validator = require("validator");
const path = require("path");

const appName = process.env.APPNAME || 'PharmaSoft';
const appData = process.env.APPDATA || (process.platform === 'win32' ? process.env.USERPROFILE + '/AppData/Roaming' : process.env.HOME + '/.config');
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "gst-config.db",
);

router.use(bodyParser.json());

module.exports = router;

let gstConfigDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

gstConfigDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the GST Configuration API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("GST Configuration API");
});

/**
 * GET endpoint: Get GST configuration.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    // Get the active GST configuration
    gstConfigDB.findOne({ is_active: true }, function (err, config) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else if (config) {
            res.send(config);
        } else {
            // Return default GST configuration if none exists
            res.send({
                gst_number: "",
                state_code: "",
                cgst_rate: 0.00,
                sgst_rate: 0.00,
                igst_rate: 0.00,
                cess_rate: 0.00,
                effective_date: new Date().toISOString().split('T')[0],
                is_active: true
            });
        }
    });
});

/**
 * POST endpoint: Create or update GST configuration.
 *
 * @param {Object} req request object with GST configuration data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.gst_number || !req.body.state_code) {
        return res.status(400).json({
            error: "Bad Request",
            message: "GST number and state code are required fields.",
        });
    }

    // Validate GST number format (basic validation)
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/.test(req.body.gst_number)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid GST number format.",
        });
    }

    // Validate state code (2 characters)
    if (req.body.state_code.length !== 2) {
        return res.status(400).json({
            error: "Bad Request",
            message: "State code must be 2 characters.",
        });
    }

    // Validate GST rates (must be numbers)
    const cgstRate = parseFloat(req.body.cgst_rate) || 0.00;
    const sgstRate = parseFloat(req.body.sgst_rate) || 0.00;
    const igstRate = parseFloat(req.body.igst_rate) || 0.00;
    const cessRate = parseFloat(req.body.cess_rate) || 0.00;

    // Check if a configuration already exists
    gstConfigDB.findOne({ is_active: true }, function (err, existingConfig) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const gstConfig = {
            gst_number: validator.escape(req.body.gst_number),
            state_code: validator.escape(req.body.state_code),
            cgst_rate: cgstRate,
            sgst_rate: sgstRate,
            igst_rate: igstRate,
            cess_rate: cessRate,
            effective_date: req.body.effective_date || new Date().toISOString().split('T')[0],
            is_active: true,
            created_at: new Date(),
            updated_at: new Date()
        };

        if (existingConfig) {
            // Deactivate the existing configuration
            gstConfigDB.update(
                { _id: existingConfig._id },
                { $set: { is_active: false, updated_at: new Date() } },
                {},
                function (err, numReplaced) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    // Create new configuration
                    gstConfigDB.insert(gstConfig, function (err, newConfig) {
                        if (err) {
                            console.error(err);
                            res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        } else {
                            res.status(201).send(newConfig);
                        }
                    });
                }
            );
        } else {
            // Create new configuration
            gstConfigDB.insert(gstConfig, function (err, newConfig) {
                if (err) {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                } else {
                    res.status(201).send(newConfig);
                }
            });
        }
    });
});

/**
 * GET endpoint: Get all GST configurations (including inactive ones).
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
    gstConfigDB.find({}, function (err, docs) {
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
 * GET endpoint: Get GST configuration by ID.
 *
 * @param {Object} req request object with configuration ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    gstConfigDB.findOne({ _id: req.params.id }, function (err, config) {
        if (err) {
            console.error(err);
            res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        } else if (config) {
            res.send(config);
        } else {
            res.status(404).json({
                error: "Not Found",
                message: "GST configuration not found.",
            });
        }
    });
});

/**
 * DELETE endpoint: Delete a GST configuration by ID.
 *
 * @param {Object} req request object with configuration ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("ID field is required.");
    }

    // Check if it's the active configuration
    gstConfigDB.findOne({ _id: req.params.id, is_active: true }, function (err, config) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (config) {
            return res.status(400).json({
                error: "Bad Request",
                message: "Cannot delete active GST configuration. Please create a new one first.",
            });
        }

        // Delete the configuration
        gstConfigDB.remove({ _id: req.params.id }, function (err, numRemoved) {
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
});

/**
 * POST endpoint: Calculate GST for a transaction.
 * This endpoint calculates GST based on the transaction amount and customer state.
 *
 * @param {Object} req request object with transaction details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/calculate", function (req, res) {
    // Validate required fields
    if (!req.body.amount || !req.body.customer_state) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Amount and customer state are required fields.",
        });
    }

    const amount = parseFloat(req.body.amount);
    const customerState = validator.escape(req.body.customer_state);

    if (isNaN(amount) || amount <= 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Amount must be a positive number.",
        });
    }

    // Get the active GST configuration
    gstConfigDB.findOne({ is_active: true }, function (err, config) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!config) {
            return res.status(404).json({
                error: "Not Found",
                message: "No active GST configuration found.",
            });
        }

        // Check if it's an inter-state or intra-state transaction
        const isInterState = config.state_code !== customerState;
        
        let cgstAmount = 0;
        let sgstAmount = 0;
        let igstAmount = 0;
        let cessAmount = 0;
        let totalGst = 0;

        if (isInterState) {
            // Inter-state transaction: IGST applies
            igstAmount = (amount * config.igst_rate) / 100;
            totalGst = igstAmount;
        } else {
            // Intra-state transaction: CGST + SGST applies
            cgstAmount = (amount * config.cgst_rate) / 100;
            sgstAmount = (amount * config.sgst_rate) / 100;
            totalGst = cgstAmount + sgstAmount;
        }

        // CESS applies to both inter-state and intra-state transactions
        cessAmount = (amount * config.cess_rate) / 100;
        totalGst += cessAmount;

        const totalAmount = amount + totalGst;

        res.send({
            original_amount: amount,
            cgst_rate: config.cgst_rate,
            sgst_rate: config.sgst_rate,
            igst_rate: config.igst_rate,
            cess_rate: config.cess_rate,
            cgst_amount: parseFloat(cgstAmount.toFixed(2)),
            sgst_amount: parseFloat(sgstAmount.toFixed(2)),
            igst_amount: parseFloat(igstAmount.toFixed(2)),
            cess_amount: parseFloat(cessAmount.toFixed(2)),
            total_gst: parseFloat(totalGst.toFixed(2)),
            total_amount: parseFloat(totalAmount.toFixed(2)),
            is_inter_state: isInterState
        });
    });
});