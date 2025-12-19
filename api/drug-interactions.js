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
    "drug-interactions.db",
);

router.use(bodyParser.json());

module.exports = router;

let drugInteractionsDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

drugInteractionsDB.ensureIndex({ fieldName: "_id", unique: true });
drugInteractionsDB.ensureIndex({ fieldName: "product_id_1" });
drugInteractionsDB.ensureIndex({ fieldName: "product_id_2" });

/**
 * GET endpoint: Get welcome message for the Drug Interactions API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Drug Interactions API");
});

/**
 * GET endpoint: Retrieve drug interactions with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    drugInteractionsDB
        .find({})
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, interactions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            drugInteractionsDB.count({}, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get product details for each interaction
                const inventoryDB = getInventoryDB();
                let interactionsWithProducts = [];
                let processedCount = 0;
                
                if (interactions.length === 0) {
                    return res.json({
                        interactions: interactions,
                        pagination: {
                            page: page,
                            limit: limit,
                            total: totalCount,
                            pages: Math.ceil(totalCount / limit)
                        }
                    });
                }
                
                interactions.forEach(function (interaction, index) {
                    inventoryDB.findOne({ _id: parseInt(interaction.product_id_1) }, function (err, product1) {
                        inventoryDB.findOne({ _id: parseInt(interaction.product_id_2) }, function (err, product2) {
                            interactionsWithProducts[index] = {
                                ...interaction,
                                product1: product1 || null,
                                product2: product2 || null
                            };
                            
                            processedCount++;
                            if (processedCount === interactions.length) {
                                res.json({
                                    interactions: interactionsWithProducts,
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
});

/**
 * POST endpoint: Add new drug interaction.
 *
 * @param {Object} req request object with drug interaction data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.product_id_1 || !req.body.product_id_2 || !req.body.interaction_level || !req.body.interaction_description) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Product IDs, interaction level, and description are required fields.",
        });
    }
    
    // Validate interaction level
    const validLevels = ['MINOR', 'MODERATE', 'MAJOR', 'CONTRAINDICATED'];
    if (!validLevels.includes(req.body.interaction_level.toUpperCase())) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Interaction level must be one of: MINOR, MODERATE, MAJOR, CONTRAINDICATED.",
        });
    }
    
    // Check if products exist
    const inventoryDB = getInventoryDB();
    inventoryDB.findOne({ _id: parseInt(req.body.product_id_1) }, function (err, product1) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!product1) {
            return res.status(404).json({
                error: "Not Found",
                message: "First product not found.",
            });
        }
        
        inventoryDB.findOne({ _id: parseInt(req.body.product_id_2) }, function (err, product2) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!product2) {
                return res.status(404).json({
                    error: "Not Found",
                    message: "Second product not found.",
                });
            }
            
            // Ensure product_id_1 is always less than product_id_2 to prevent duplicates
            const productId1 = Math.min(parseInt(req.body.product_id_1), parseInt(req.body.product_id_2));
            const productId2 = Math.max(parseInt(req.body.product_id_1), parseInt(req.body.product_id_2));
            
            // Check if interaction already exists
            drugInteractionsDB.findOne({
                product_id_1: productId1,
                product_id_2: productId2
            }, function (err, existingInteraction) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (existingInteraction) {
                    return res.status(409).json({
                        error: "Conflict",
                        message: "An interaction between these drugs already exists.",
                    });
                }
                
                const newInteraction = {
                    _id: Math.floor(Date.now() / 1000),
                    product_id_1: productId1,
                    product_id_2: productId2,
                    interaction_level: req.body.interaction_level.toUpperCase(),
                    interaction_description: validator.escape(req.body.interaction_description),
                    recommendation: validator.escape(req.body.recommendation || ""),
                    is_active: req.body.is_active !== undefined ? req.body.is_active : true,
                    created_at: new Date(),
                    updated_at: new Date()
                };
                
                drugInteractionsDB.insert(newInteraction, function (err, interaction) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.status(201).json({
                        ...interaction,
                        product1: product1,
                        product2: product2
                    });
                });
            });
        });
    });
});

/**
 * GET endpoint: Get specific drug interaction by ID.
 *
 * @param {Object} req request object with interaction ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Interaction ID is required.");
    }
    
    drugInteractionsDB.findOne({ _id: req.params.id }, function (err, interaction) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!interaction) {
            return res.status(404).json({
                error: "Not Found",
                message: "Drug interaction not found.",
            });
        }
        
        // Get product details
        const inventoryDB = getInventoryDB();
        inventoryDB.findOne({ _id: parseInt(interaction.product_id_1) }, function (err, product1) {
            inventoryDB.findOne({ _id: parseInt(interaction.product_id_2) }, function (err, product2) {
                res.json({
                    ...interaction,
                    product1: product1 || null,
                    product2: product2 || null
                });
            });
        });
    });
});

/**
 * PUT endpoint: Update drug interaction.
 *
 * @param {Object} req request object with updated interaction data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Interaction ID is required.");
    }
    
    // Check if interaction exists
    drugInteractionsDB.findOne({ _id: req.params.id }, function (err, interaction) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!interaction) {
            return res.status(404).json({
                error: "Not Found",
                message: "Drug interaction not found.",
            });
        }
        
        // Validate interaction level if provided
        if (req.body.interaction_level) {
            const validLevels = ['MINOR', 'MODERATE', 'MAJOR', 'CONTRAINDICATED'];
            if (!validLevels.includes(req.body.interaction_level.toUpperCase())) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Interaction level must be one of: MINOR, MODERATE, MAJOR, CONTRAINDICATED.",
                });
            }
        }
        
        const updatedInteraction = {
            interaction_level: req.body.interaction_level ? req.body.interaction_level.toUpperCase() : interaction.interaction_level,
            interaction_description: req.body.interaction_description ? validator.escape(req.body.interaction_description) : interaction.interaction_description,
            recommendation: req.body.recommendation !== undefined ? validator.escape(req.body.recommendation) : interaction.recommendation,
            is_active: req.body.is_active !== undefined ? req.body.is_active : interaction.is_active,
            updated_at: new Date()
        };
        
        drugInteractionsDB.update(
            { _id: req.params.id },
            { $set: updatedInteraction },
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
                    message: "Drug interaction updated successfully.",
                    interaction: { ...interaction, ...updatedInteraction }
                });
            }
        );
    });
});

/**
 * DELETE endpoint: Delete drug interaction.
 *
 * @param {Object} req request object with interaction ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Interaction ID is required.");
    }
    
    // Check if interaction exists
    drugInteractionsDB.findOne({ _id: req.params.id }, function (err, interaction) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!interaction) {
            return res.status(404).json({
                error: "Not Found",
                message: "Drug interaction not found.",
            });
        }
        
        drugInteractionsDB.remove(
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
                    message: "Drug interaction deleted successfully."
                });
            }
        );
    });
});

/**
 * POST endpoint: Check for interactions between drugs.
 *
 * @param {Object} req request object with drug IDs in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/check", function (req, res) {
    // Validate required fields
    if (!req.body.drug_ids || !Array.isArray(req.body.drug_ids) || req.body.drug_ids.length < 2) {
        return res.status(400).json({
            error: "Bad Request",
            message: "At least two drug IDs are required.",
        });
    }
    
    const drugIds = req.body.drug_ids.map(id => parseInt(id));
    const inventoryDB = getInventoryDB();
    
    // Check if all drugs exist
    let validDrugCount = 0;
    const validDrugs = [];
    
    drugIds.forEach(function (drugId) {
        inventoryDB.findOne({ _id: drugId }, function (err, product) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (product) {
                validDrugs.push(product);
            }
            
            validDrugCount++;
            if (validDrugCount === drugIds.length) {
                if (validDrugs.length < 2) {
                    return res.status(404).json({
                        error: "Not Found",
                        message: "At least two valid drugs are required.",
                    });
                }
                
                // Check for interactions between all pairs of drugs
                const interactions = [];
                let checkedPairs = 0;
                const totalPairs = (validDrugs.length * (validDrugs.length - 1)) / 2;
                
                for (let i = 0; i < validDrugs.length; i++) {
                    for (let j = i + 1; j < validDrugs.length; j++) {
                        const drug1Id = Math.min(validDrugs[i]._id, validDrugs[j]._id);
                        const drug2Id = Math.max(validDrugs[i]._id, validDrugs[j]._id);
                        
                        drugInteractionsDB.findOne({
                            product_id_1: drug1Id,
                            product_id_2: drug2Id,
                            is_active: true
                        }, function (err, interaction) {
                            if (err) {
                                console.error(err);
                                return res.status(500).json({
                                    error: "Internal Server Error",
                                    message: "An unexpected error occurred.",
                                });
                            }
                            
                            if (interaction) {
                                interactions.push({
                                    ...interaction,
                                    drug1: validDrugs[i],
                                    drug2: validDrugs[j]
                                });
                            }
                            
                            checkedPairs++;
                            if (checkedPairs === totalPairs) {
                                // Sort interactions by severity level
                                interactions.sort(function (a, b) {
                                    const severityOrder = { 'CONTRAINDICATED': 4, 'MAJOR': 3, 'MODERATE': 2, 'MINOR': 1 };
                                    return severityOrder[b.interaction_level] - severityOrder[a.interaction_level];
                                });
                                
                                res.json({
                                    drugs: validDrugs,
                                    interactions: interactions,
                                    has_interactions: interactions.length > 0
                                });
                            }
                        });
                    }
                }
            }
        });
    });
});

/**
 * GET endpoint: Get interactions for a drug.
 *
 * @param {Object} req request object with drug ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/drug/:drugId", function (req, res) {
    if (!req.params.drugId) {
        return res.status(400).send("Drug ID is required.");
    }
    
    const drugId = parseInt(req.params.drugId);
    
    // Check if drug exists
    const inventoryDB = getInventoryDB();
    inventoryDB.findOne({ _id: drugId }, function (err, drug) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!drug) {
            return res.status(404).json({
                error: "Not Found",
                message: "Drug not found.",
            });
        }
        
        // Find interactions where this drug is either product_id_1 or product_id_2
        drugInteractionsDB.find({
            $or: [
                { product_id_1: drugId },
                { product_id_2: drugId }
            ],
            is_active: true
        }, function (err, interactions) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            // Get product details for the other drug in each interaction
            let interactionsWithProducts = [];
            let processedCount = 0;
            
            if (interactions.length === 0) {
                return res.json({
                    drug: drug,
                    interactions: []
                });
            }
            
            interactions.forEach(function (interaction, index) {
                const otherDrugId = interaction.product_id_1 === drugId ? interaction.product_id_2 : interaction.product_id_1;
                
                inventoryDB.findOne({ _id: parseInt(otherDrugId) }, function (err, otherDrug) {
                    interactionsWithProducts[index] = {
                        ...interaction,
                        other_drug: otherDrug || null
                    };
                    
                    processedCount++;
                    if (processedCount === interactions.length) {
                        // Sort interactions by severity level
                        interactionsWithProducts.sort(function (a, b) {
                            const severityOrder = { 'CONTRAINDICATED': 4, 'MAJOR': 3, 'MODERATE': 2, 'MINOR': 1 };
                            return severityOrder[b.interaction_level] - severityOrder[a.interaction_level];
                        });
                        
                        res.json({
                            drug: drug,
                            interactions: interactionsWithProducts
                        });
                    }
                });
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