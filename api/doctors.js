const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const path = require("path");
const validator = require("validator");
const appName = process.env.APPNAME || "PharmaSoft";
const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
const dbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "doctors.db",
);

router.use(bodyParser.json());

module.exports = router;

let doctorsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

doctorsDB.ensureIndex({ fieldName: "_id", unique: true });
doctorsDB.ensureIndex({ fieldName: "registration_number", unique: true });

/**
 * GET endpoint: Get welcome message for the Doctors API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Doctors API");
});

/**
 * GET endpoint: Retrieve doctors with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    doctorsDB
        .find({})
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, doctors) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            doctorsDB.count({}, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    doctors: doctors,
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
 * POST endpoint: Add new doctor.
 *
 * @param {Object} req request object with doctor data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.name || !req.body.registration_number) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Name and registration number are required fields.",
        });
    }
    
    // Check if doctor with same registration number already exists
    doctorsDB.findOne({ registration_number: req.body.registration_number }, function (err, existingDoctor) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (existingDoctor) {
            return res.status(409).json({
                error: "Conflict",
                message: "A doctor with this registration number already exists.",
            });
        }
        
        const newDoctor = {
            _id: Math.floor(Date.now() / 1000),
            name: validator.escape(req.body.name),
            registration_number: validator.escape(req.body.registration_number),
            specialization: validator.escape(req.body.specialization || ""),
            phone: validator.escape(req.body.phone || ""),
            email: validator.escape(req.body.email || ""),
            address: validator.escape(req.body.address || ""),
            hospital_name: validator.escape(req.body.hospital_name || ""),
            is_active: req.body.is_active !== undefined ? req.body.is_active : true,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        doctorsDB.insert(newDoctor, function (err, doctor) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            res.status(201).json(doctor);
        });
    });
});

/**
 * GET endpoint: Get specific doctor by ID.
 *
 * @param {Object} req request object with doctor ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Doctor ID is required.");
    }
    
    doctorsDB.findOne({ _id: req.params.id }, function (err, doctor) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!doctor) {
            return res.status(404).json({
                error: "Not Found",
                message: "Doctor not found.",
            });
        }
        
        res.json(doctor);
    });
});

/**
 * PUT endpoint: Update doctor.
 *
 * @param {Object} req request object with updated doctor data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Doctor ID is required.");
    }
    
    // Check if doctor exists
    doctorsDB.findOne({ _id: req.params.id }, function (err, doctor) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!doctor) {
            return res.status(404).json({
                error: "Not Found",
                message: "Doctor not found.",
            });
        }
        
        // Check if registration number is being changed and if it's already taken
        if (req.body.registration_number && req.body.registration_number !== doctor.registration_number) {
            doctorsDB.findOne({ registration_number: req.body.registration_number }, function (err, existingDoctor) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (existingDoctor) {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "A doctor with this registration number already exists.",
                    });
                }
                
                updateDoctor();
            });
        } else {
            updateDoctor();
        }
        
        function updateDoctor() {
            const updatedDoctor = {
                name: req.body.name ? validator.escape(req.body.name) : doctor.name,
                registration_number: req.body.registration_number ? validator.escape(req.body.registration_number) : doctor.registration_number,
                specialization: req.body.specialization !== undefined ? validator.escape(req.body.specialization) : doctor.specialization,
                phone: req.body.phone !== undefined ? validator.escape(req.body.phone) : doctor.phone,
                email: req.body.email !== undefined ? validator.escape(req.body.email) : doctor.email,
                address: req.body.address !== undefined ? validator.escape(req.body.address) : doctor.address,
                hospital_name: req.body.hospital_name !== undefined ? validator.escape(req.body.hospital_name) : doctor.hospital_name,
                is_active: req.body.is_active !== undefined ? req.body.is_active : doctor.is_active,
                updated_at: new Date()
            };
            
            doctorsDB.update(
                { _id: req.params.id },
                { $set: updatedDoctor },
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
                        message: "Doctor updated successfully.",
                        doctor: { ...doctor, ...updatedDoctor }
                    });
                }
            );
        }
    });
});

/**
 * DELETE endpoint: Delete doctor.
 *
 * @param {Object} req request object with doctor ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Doctor ID is required.");
    }
    
    // Check if doctor exists
    doctorsDB.findOne({ _id: req.params.id }, function (err, doctor) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!doctor) {
            return res.status(404).json({
                error: "Not Found",
                message: "Doctor not found.",
            });
        }
        
        // Check if doctor has any prescriptions
        const prescriptionsDB = getPrescriptionsDB();
        prescriptionsDB.findOne({ doctor_name: doctor.name }, function (err, prescription) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (prescription) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Cannot delete doctor. Doctor has associated prescriptions.",
                });
            }
            
            doctorsDB.remove(
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
                        message: "Doctor deleted successfully."
                    });
                }
            );
        });
    });
});

/**
 * GET endpoint: Search doctors.
 *
 * @param {Object} req request object with search query as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/search/:query", function (req, res) {
    if (!req.params.query) {
        return res.status(400).send("Search query is required.");
    }
    
    const query = req.params.query;
    const searchRegex = new RegExp(query, "i");
    
    doctorsDB.find({
        $or: [
            { name: searchRegex },
            { registration_number: searchRegex },
            { specialization: searchRegex },
            { hospital_name: searchRegex }
        ]
    }, function (err, doctors) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.json(doctors);
    });
});

/**
 * GET endpoint: Get active doctors only.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/active", function (req, res) {
    doctorsDB.find({ is_active: true }, function (err, doctors) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        res.json(doctors);
    });
});

/**
 * Helper function to get prescriptions database instance
 *
 * @returns {Object} NeDB instance for prescriptions
 */
function getPrescriptionsDB() {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const dbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "prescriptions.db",
    );
    
    return new Datastore({
        filename: dbPath,
        autoload: true,
    });
}