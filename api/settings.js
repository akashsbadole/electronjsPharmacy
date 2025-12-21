const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const multer = require("multer");
const sanitizeFilename = require('sanitize-filename');
const fs = require("fs");
const path = require("path");
const validator = require("validator");
const dbUtils = require('./db-utils');
const validFileTypes = [
    "image/jpg",
    "image/jpeg",
    "image/png",
    "image/webp"];
const maxFileSize = 2097152 //2MB = 2*1024*1024
const defaultLogoName = "logo";
const {filterFile} = require('../assets/js/utils');
const dbPath = dbUtils.getDatabasePath("settings.db");
const networkSettingsPath = dbUtils.getDatabasePath("network-settings.db");

const storage = multer.diskStorage({
    destination: dbUtils.getUploadsDir(),
    filename: function (req, file, callback) {
        callback(null, defaultLogoName+path.extname(file.originalname));
    },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: maxFileSize },
  fileFilter: filterFile,
}).single("imagename");


router.use(bodyParser.json());

module.exports = router;

let settingsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

let networkSettingsDB = new Datastore({
    filename: networkSettingsPath,
    autoload: true,
});

settingsDB.ensureIndex({ fieldName: "_id", unique: true });
networkSettingsDB.ensureIndex({ fieldName: "_id", unique: true });
/**
 * GET endpoint: Get the welcome message for the Settings API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */

router.get("/", function (req, res) {
    res.send("Settings API");
});

/**
 * GET endpoint: Get settings details.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/get", function (req, res) {
    settingsDB.findOne(
        {
            _id: 1,
        },
        function (err, docs) {
            res.send(docs);
        },
    );
});

/**
 * GET endpoint: Get network settings.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/network", function (req, res) {
    networkSettingsDB.findOne(
        {
            _id: 1,
        },
        function (err, docs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred while retrieving network settings.",
                });
            }
            res.send(docs || {});
        },
    );
});

/**
 * POST endpoint: Create or update network settings.
 *
 * @param {Object} req request object with network settings data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/network", function (req, res) {
    try {
        // Validate required fields
        const { ip, till, mac, app } = req.body;
        
        // Basic validation
        if (!ip || validator.isEmpty(ip.trim())) {
            return res.status(400).json({
                error: "Validation Error",
                message: "Server IP Address is required",
            });
        }
        
        if (!till || validator.isEmpty(till.trim())) {
            return res.status(400).json({
                error: "Validation Error",
                message: "Till Number is required",
            });
        }
        
        // Validate IP address format
        if (!validator.isIP(ip)) {
            return res.status(400).json({
                error: "Validation Error",
                message: "Invalid IP address format",
            });
        }
        
        // Validate till is a number
        if (!validator.isNumeric(till.toString()) || parseInt(till) < 1) {
            return res.status(400).json({
                error: "Validation Error",
                message: "Till Number must be a positive integer greater than 0",
            });
        }
        
        // Sanitize inputs
        const sanitizedIp = validator.escape(ip.trim());
        const sanitizedTill = validator.escape(till.trim());
        const sanitizedMac = mac ? validator.escape(mac.trim()) : "";
        const sanitizedApp = app ? validator.escape(app.trim()) : "";
        
        const networkSettings = {
            _id: 1,
            ip: sanitizedIp,
            till: parseInt(sanitizedTill),
            mac: sanitizedMac,
            app: sanitizedApp,
            updatedAt: new Date(),
        };
        
        // Check if settings already exist
        networkSettingsDB.findOne({ _id: 1 }, function (err, existingSettings) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (existingSettings) {
                // Update existing settings
                networkSettingsDB.update(
                    { _id: 1 },
                    networkSettings,
                    {},
                    function (err, numReplaced) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "Failed to update network settings.",
                            });
                        }
                        res.status(200).json({
                            success: true,
                            message: "Network settings updated successfully",
                            data: networkSettings,
                        });
                    }
                );
            } else {
                // Insert new settings
                networkSettingsDB.insert(networkSettings, function (err, newSettings) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "Failed to save network settings.",
                        });
                    }
                    res.status(201).json({
                        success: true,
                        message: "Network settings created successfully",
                        data: newSettings,
                    });
                });
            }
        });
        
    } catch (error) {
        console.error(error);
        res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
        });
    }
});

/**
 * POST endpoint: Create or update settings.
 *
 * @param {Object} req request object with settings data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */

router.post("/post", function (req, res) {
    upload(req, res, function (err) {

        if (err) {
            if (err instanceof multer.MulterError) {
                console.error('Upload Error:', err);
                return res.status(400).json({
                    error: 'Upload Error',
                    message: err.message,
                });
            } else {
                console.error('Unknown Error:', err);
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: err.message,
                });
            }
        }

    let image = "";

    if (req.body.img && validator.escape(req.body.img) !== "") {
        image = sanitizeFilename(req.body.img);
    }

    if (req.file) {
        image = sanitizeFilename(req.file.filename);
    }


    if (req.body.remove && validator.escape(req.body.remove) === "1") {
            try {
                let imgPath = path.join(
                    dbUtils.getUploadsDir(),
                    image,
                );

                if (!req.file) {
                fs.unlinkSync(imgPath);
                image = "";
                }
               
            } catch (err) {
                console.error(err);
            }

        }
        
    // Validate required fields for general store settings
    const { store, address_one, address_two, contact, symbol, percentage } = req.body;
    
    if (!store || validator.isEmpty(store.trim())) {
        return res.status(400).json({
            error: "Validation Error",
            message: "Store Name is required",
        });
    }
    
    if (!address_one || validator.isEmpty(address_one.trim())) {
        return res.status(400).json({
            error: "Validation Error",
            message: "Address Line 1 is required",
        });
    }
    
    if (!address_two || validator.isEmpty(address_two.trim())) {
        return res.status(400).json({
            error: "Validation Error",
            message: "Address Line 2 is required",
        });
    }
    
    if (!symbol || validator.isEmpty(symbol.trim())) {
        return res.status(400).json({
            error: "Validation Error",
            message: "Currency Symbol is required",
        });
    }
    
    if (!percentage || validator.isEmpty(percentage.toString().trim())) {
        return res.status(400).json({
            error: "Validation Error",
            message: "VAT Percentage is required",
        });
    }
    
    // Validate percentage is a number within valid range
    if (!validator.isNumeric(percentage.toString()) || parseFloat(percentage) < 0 || parseFloat(percentage) > 100) {
        return res.status(400).json({
            error: "Validation Error",
            message: "VAT Percentage must be a number between 0 and 100",
        });
    }
    
    // Validate currency symbol length (max 3 characters as per HTML constraint)
    if (symbol.length > 3) {
        return res.status(400).json({
            error: "Validation Error",
            message: "Currency Symbol must be maximum 3 characters",
        });
    }
    
    const Settings = {
        _id: 1,
        settings: {
            app: req.body.app ? validator.escape(req.body.app) : "",
            store: validator.escape(store.trim()),
            address_one: validator.escape(address_one.trim()),
            address_two: validator.escape(address_two.trim()),
            contact: contact ? validator.escape(contact.trim()) : "",
            tax: req.body.tax ? validator.escape(req.body.tax.trim()) : "",
            symbol: validator.escape(symbol.trim()),
            percentage: validator.escape(percentage.toString().trim()),
            charge_tax: req.body.charge_tax === true || req.body.charge_tax === 'on',
            footer: req.body.footer ? validator.escape(req.body.footer.trim()) : "",
            img: image,
        },
        updatedAt: new Date(),
    };

    if (!req.body.id || validator.escape(req.body.id) === "") {
        settingsDB.insert(Settings, function (err, settings) {
            if (err) {
                console.error(err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred while creating settings.",
                });
            } else {
                res.status(201).json({
                    success: true,
                    message: "Settings created successfully",
                    data: Settings,
                });
            }
        });
    } else {
        settingsDB.update(
            {
                _id: 1,
            },
            Settings,
            {},
            function (err, numReplaced, settings) {
                if (err) {
                    console.error(err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred while updating settings.",
                    });
                } else {
                    res.status(200).json({
                        success: true,
                        message: "Settings updated successfully",
                        data: Settings,
                    });
                }
            },
        );
    }
});

});