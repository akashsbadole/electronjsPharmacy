const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const async = require("async");
const validator = require("validator");
const dbUtils = require('./db-utils');
const dbPath = dbUtils.getDatabasePath('restricted-drugs.db');

router.use(bodyParser.json());

module.exports = router;

let restrictedDrugsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

restrictedDrugsDB.ensureIndex({ fieldName: "_id", unique: true });
restrictedDrugsDB.ensureIndex({ fieldName: "product_id", unique: true });

/**
 * GET endpoint: Get welcome message for the Restricted Drugs API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Restricted Drugs API");
});

/**
 * GET endpoint: Retrieve restricted drugs list with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    restrictedDrugsDB
        .find({})
        .sort({ schedule_category: 1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, restrictedDrugs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            restrictedDrugsDB.count({}, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Get product details for each restricted drug
                const inventoryDB = getInventoryDB();
                let restrictedDrugsWithProducts = [];
                let processedCount = 0;

                if (restrictedDrugs.length === 0) {
                    return res.json({
                        restricted_drugs: restrictedDrugs,
                        pagination: {
                            page: page,
                            limit: limit,
                            total: totalCount,
                            pages: Math.ceil(totalCount / limit)
                        }
                    });
                }

                restrictedDrugs.forEach(function (restrictedDrug, index) {
                    inventoryDB.findOne({ _id: parseInt(restrictedDrug.product_id) }, function (err, product) {
                        restrictedDrugsWithProducts[index] = {
                            ...restrictedDrug,
                            product: product || null
                        };

                        processedCount++;
                        if (processedCount === restrictedDrugs.length) {
                            res.json({
                                restricted_drugs: restrictedDrugsWithProducts,
                                pagination: {
                                    page: page,
                                    limit: limit,
                                    total: totalCount,
                                    pages: Math.ceil(totalCount / limit)
                                }
                            });
                        }
                    });
                });
            });
        });
});

/**
 * POST endpoint: Add new restricted drug.
 *
 * @param {Object} req request object with restricted drug data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.product_id || !req.body.schedule_category) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product ID and schedule category are required fields.",
        });
    }

    // Validate schedule category
    const validSchedules = ['H', 'H1', 'X'];
    if (!validSchedules.includes(req.body.schedule_category.toUpperCase())) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Schedule category must be one of: H, H1, X.",
        });
    }

    // Check if product exists
    const inventoryDB = getInventoryDB();
    inventoryDB.findOne({ _id: parseInt(req.body.product_id) }, function (err, product) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!product) {
            return res.status(404).json({
                error: "Not Found",
                message: "Product not found.",
            });
        }

        // Check if product is already marked as restricted
        restrictedDrugsDB.findOne({ product_id: req.body.product_id }, function (err, existingRestrictedDrug) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (existingRestrictedDrug) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "This product is already marked as a restricted drug.",
                });
            }

            const newRestrictedDrug = {
                _id: Math.floor(Date.now() / 1000),
                product_id: validator.escape(req.body.product_id),
                schedule_category: req.body.schedule_category.toUpperCase(),
                storage_requirements: validator.escape(req.body.storage_requirements || ""),
                max_purchase_quantity: req.body.max_purchase_quantity ? parseInt(req.body.max_purchase_quantity) : null,
                valid_prescription_required: req.body.valid_prescription_required !== undefined ? req.body.valid_prescription_required : true,
                photo_id_required: req.body.photo_id_required !== undefined ? req.body.photo_id_required : false,
                register_maintenance: req.body.register_maintenance !== undefined ? req.body.register_maintenance : true,
                created_at: new Date(),
                updated_at: new Date()
            };

            restrictedDrugsDB.insert(newRestrictedDrug, function (err, restrictedDrug) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                res.status(201).json({
                    ...restrictedDrug,
                    product: product
                });
            });
        });
    });
});

/**
 * GET endpoint: Get specific restricted drug by ID.
 *
 * @param {Object} req request object with restricted drug ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Restricted Drug ID is required.");
    }

    restrictedDrugsDB.findOne({ _id: req.params.id }, function (err, restrictedDrug) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!restrictedDrug) {
            return res.status(404).json({
                error: "Not Found",
                message: "Restricted drug not found.",
            });
        }

        // Get product details
        const inventoryDB = getInventoryDB();
        inventoryDB.findOne({ _id: parseInt(restrictedDrug.product_id) }, function (err, product) {
            res.json({
                ...restrictedDrug,
                product: product || null
            });
        });
    });
});

/**
 * PUT endpoint: Update restricted drug.
 *
 * @param {Object} req request object with updated restricted drug data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Restricted Drug ID is required.");
    }

    // Check if restricted drug exists
    restrictedDrugsDB.findOne({ _id: req.params.id }, function (err, restrictedDrug) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!restrictedDrug) {
            return res.status(404).json({
                error: "Not Found",
                message: "Restricted drug not found.",
            });
        }

        // Validate schedule category if provided
        if (req.body.schedule_category) {
            const validSchedules = ['H', 'H1', 'X'];
            if (!validSchedules.includes(req.body.schedule_category.toUpperCase())) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Schedule category must be one of: H, H1, X.",
                });
            }
        }

        const updatedRestrictedDrug = {
            schedule_category: req.body.schedule_category ? req.body.schedule_category.toUpperCase() : restrictedDrug.schedule_category,
            storage_requirements: req.body.storage_requirements !== undefined ? validator.escape(req.body.storage_requirements) : restrictedDrug.storage_requirements,
            max_purchase_quantity: req.body.max_purchase_quantity !== undefined ? (req.body.max_purchase_quantity ? parseInt(req.body.max_purchase_quantity) : null) : restrictedDrug.max_purchase_quantity,
            valid_prescription_required: req.body.valid_prescription_required !== undefined ? req.body.valid_prescription_required : restrictedDrug.valid_prescription_required,
            photo_id_required: req.body.photo_id_required !== undefined ? req.body.photo_id_required : restrictedDrug.photo_id_required,
            register_maintenance: req.body.register_maintenance !== undefined ? req.body.register_maintenance : restrictedDrug.register_maintenance,
            updated_at: new Date()
        };

        restrictedDrugsDB.update(
            { _id: req.params.id },
            { $set: updatedRestrictedDrug },
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
                    message: "Restricted drug updated successfully.",
                    restricted_drug: { ...restrictedDrug, ...updatedRestrictedDrug }
                });
            }
        );
    });
});

/**
 * DELETE endpoint: Delete restricted drug.
 *
 * @param {Object} req request object with restricted drug ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Restricted Drug ID is required.");
    }

    // Check if restricted drug exists
    restrictedDrugsDB.findOne({ _id: req.params.id }, function (err, restrictedDrug) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!restrictedDrug) {
            return res.status(404).json({
                error: "Not Found",
                message: "Restricted drug not found.",
            });
        }

        // Check if there are any sales records for this restricted drug
        const restrictedDrugSalesDB = getRestrictedDrugSalesDB();
        restrictedDrugSalesDB.findOne({ product_id: restrictedDrug.product_id }, function (err, sale) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (sale) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "Cannot delete restricted drug. There are sales records associated with this drug.",
                });
            }

            restrictedDrugsDB.remove(
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
                        message: "Restricted drug deleted successfully."
                    });
                }
            );
        });
    });
});

/**
 * GET endpoint: Get drugs by schedule (H, H1, X).
 *
 * @param {Object} req request object with schedule category as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/schedule/:schedule", function (req, res) {
    if (!req.params.schedule) {
        return res.status(400).send("Schedule category is required.");
    }

    // Validate schedule category
    const validSchedules = ['H', 'H1', 'X'];
    const schedule = req.params.schedule.toUpperCase();

    if (!validSchedules.includes(schedule)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Schedule category must be one of: H, H1, X.",
        });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    restrictedDrugsDB
        .find({ schedule_category: schedule })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, restrictedDrugs) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            restrictedDrugsDB.count({ schedule_category: schedule }, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Get product details for each restricted drug
                const inventoryDB = getInventoryDB();
                let restrictedDrugsWithProducts = [];
                let processedCount = 0;

                if (restrictedDrugs.length === 0) {
                    return res.json({
                        restricted_drugs: restrictedDrugs,
                        pagination: {
                            page: page,
                            limit: limit,
                            total: totalCount,
                            pages: Math.ceil(totalCount / limit)
                        }
                    });
                }

                restrictedDrugs.forEach(function (restrictedDrug, index) {
                    inventoryDB.findOne({ _id: parseInt(restrictedDrug.product_id) }, function (err, product) {
                        restrictedDrugsWithProducts[index] = {
                            ...restrictedDrug,
                            product: product || null
                        };

                        processedCount++;
                        if (processedCount === restrictedDrugs.length) {
                            res.json({
                                restricted_drugs: restrictedDrugsWithProducts,
                                pagination: {
                                    page: page,
                                    limit: limit,
                                    total: totalCount,
                                    pages: Math.ceil(totalCount / limit)
                                }
                            });
                        }
                    });
                });
            });
        });
});

/**
 * GET endpoint: Check if a product is a restricted drug.
 *
 * @param {Object} req request object with product ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/check/:productId", function (req, res) {
    if (!req.params.productId) {
        return res.status(400).send("Product ID is required.");
    }

    const productId = req.params.productId;

    restrictedDrugsDB.findOne({ product_id: productId }, function (err, restrictedDrug) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!restrictedDrug) {
            return res.json({
                is_restricted: false,
                message: "Product is not a restricted drug."
            });
        }

        // Get product details
        const inventoryDB = getInventoryDB();
        inventoryDB.findOne({ _id: parseInt(productId) }, function (err, product) {
            res.json({
                is_restricted: true,
                restricted_drug: restrictedDrug,
                product: product || null
            });
        });
    });
});

/**
 * Helper function to get inventory database instance
 *
 * @returns {Object} NeDB instance for inventory
 */
function getInventoryDB() {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const dbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "inventory.db",
    );

    return new Datastore({
        filename: dbPath,
        autoload: true,
    });
}

/**
 * Helper function to get restricted drug sales database instance
 *
 * @returns {Object} NeDB instance for restricted drug sales
 */
function getRestrictedDrugSalesDB() {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const dbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "restricted-drug-sales.db",
    );

    return new Datastore({
        filename: dbPath,
        autoload: true,
    });
}