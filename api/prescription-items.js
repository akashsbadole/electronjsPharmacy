const express = require("express");
const router = express.Router();
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
    "prescription-items.db",
);

router.use(bodyParser.json());

module.exports = router;

let prescriptionItemsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

prescriptionItemsDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get welcome message for the Prescription Items API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Prescription Items API");
});

/**
 * GET endpoint: Retrieve prescription items with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    prescriptionItemsDB
        .find({})
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, items) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            prescriptionItemsDB.count({}, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    items: items,
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
 * POST endpoint: Add items to prescription.
 *
 * @param {Object} req request object with prescription item data in body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.prescription_id || !req.body.product_id || !req.body.quantity) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Prescription ID, product ID, and quantity are required fields.",
        });
    }
    
    // Check if prescription exists
    const prescriptionsDB = getPrescriptionsDB();
    prescriptionsDB.findOne({ _id: req.body.prescription_id }, function (err, prescription) {
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
            
            const newPrescriptionItem = {
                _id: Math.floor(Date.now() / 1000),
                prescription_id: validator.escape(req.body.prescription_id),
                product_id: validator.escape(req.body.product_id),
                dosage: validator.escape(req.body.dosage || ""),
                frequency: validator.escape(req.body.frequency || ""),
                duration: validator.escape(req.body.duration || ""),
                quantity: parseInt(req.body.quantity),
                instructions: validator.escape(req.body.instructions || ""),
                created_at: new Date()
            };
            
            prescriptionItemsDB.insert(newPrescriptionItem, function (err, item) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                res.status(201).json(item);
            });
        });
    });
});

/**
 * PUT endpoint: Update prescription item.
 *
 * @param {Object} req request object with updated prescription item data in body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Prescription Item ID is required.");
    }
    
    // Check if prescription item exists
    prescriptionItemsDB.findOne({ _id: req.params.id }, function (err, item) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!item) {
            return res.status(404).json({
                error: "Not Found",
                message: "Prescription item not found.",
            });
        }
        
        const updatedItem = {
            prescription_id: req.body.prescription_id ? validator.escape(req.body.prescription_id) : item.prescription_id,
            product_id: req.body.product_id ? validator.escape(req.body.product_id) : item.product_id,
            dosage: req.body.dosage !== undefined ? validator.escape(req.body.dosage) : item.dosage,
            frequency: req.body.frequency !== undefined ? validator.escape(req.body.frequency) : item.frequency,
            duration: req.body.duration !== undefined ? validator.escape(req.body.duration) : item.duration,
            quantity: req.body.quantity !== undefined ? parseInt(req.body.quantity) : item.quantity,
            instructions: req.body.instructions !== undefined ? validator.escape(req.body.instructions) : item.instructions
        };
        
        prescriptionItemsDB.update(
            { _id: req.params.id },
            { $set: updatedItem },
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
                    message: "Prescription item updated successfully.",
                    item: { ...item, ...updatedItem }
                });
            }
        );
    });
});

/**
 * DELETE endpoint: Delete prescription item.
 *
 * @param {Object} req request object with prescription item ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Prescription Item ID is required.");
    }
    
    // Check if prescription item exists
    prescriptionItemsDB.findOne({ _id: req.params.id }, function (err, item) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!item) {
            return res.status(404).json({
                error: "Not Found",
                message: "Prescription item not found.",
            });
        }
        
        prescriptionItemsDB.remove(
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
                    message: "Prescription item deleted successfully."
                });
            }
        );
    });
});

/**
 * GET endpoint: Get items for a prescription.
 *
 * @param {Object} req request object with prescription ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/prescription/:prescriptionId", function (req, res) {
    if (!req.params.prescriptionId) {
        return res.status(400).send("Prescription ID is required.");
    }
    
    // Check if prescription exists
    const prescriptionsDB = getPrescriptionsDB();
    prescriptionsDB.findOne({ _id: req.params.prescriptionId }, function (err, prescription) {
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
        
        prescriptionItemsDB.find({ prescription_id: req.params.prescriptionId }, function (err, items) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get product details for each item
            const inventoryDB = getInventoryDB();
            let itemsWithProducts = [];
            let processedCount = 0;
            
            if (items.length === 0) {
                return res.json(items);
            }
            
            items.forEach(function (item, index) {
                inventoryDB.findOne({ _id: parseInt(item.product_id) }, function (err, product) {
                    itemsWithProducts[index] = {
                        ...item,
                        product: product || null
                    };
                    
                    processedCount++;
                    if (processedCount === items.length) {
                        res.json(itemsWithProducts);
                    }
                });
            });
        });
    });
});

/**
 * GET endpoint: Get prescription item by ID.
 *
 * @param {Object} req request object with prescription item ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Prescription Item ID is required.");
    }
    
    prescriptionItemsDB.findOne({ _id: req.params.id }, function (err, item) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!item) {
            return res.status(404).json({
                error: "Not Found",
                message: "Prescription item not found.",
            });
        }
        
        // Get product details
        const inventoryDB = getInventoryDB();
        inventoryDB.findOne({ _id: parseInt(item.product_id) }, function (err, product) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            res.json({
                ...item,
                product: product || null
            });
        });
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