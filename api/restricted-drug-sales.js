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
    "restricted-drug-sales.db",
);

app.use(bodyParser.json());

module.exports = app;

let restrictedDrugSalesDB = new Datastore({
    filename: dbPath,
    autoload: true,
});

restrictedDrugSalesDB.ensureIndex({ fieldName: "_id", unique: true });
restrictedDrugSalesDB.ensureIndex({ fieldName: "transaction_id" });
restrictedDrugSalesDB.ensureIndex({ fieldName: "product_id" });

/**
 * GET endpoint: Get welcome message for the Restricted Drug Sales API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    res.send("Restricted Drug Sales API");
});

/**
 * GET endpoint: Retrieve restricted drug sales records with pagination.
 *
 * @param {Object} req request object with pagination parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    restrictedDrugSalesDB
        .find({})
        .sort({ sale_date: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, sales) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            restrictedDrugSalesDB.count({}, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                // Get product details for each sale
                const inventoryDB = getInventoryDB();
                let salesWithProducts = [];
                let processedCount = 0;
                
                if (sales.length === 0) {
                    return res.json({
                        sales: sales,
                        pagination: {
                            page: page,
                            limit: limit,
                            total: totalCount,
                            pages: Math.ceil(totalCount / limit)
                        }
                    });
                }
                
                sales.forEach(function (sale, index) {
                    inventoryDB.findOne({ _id: parseInt(sale.product_id) }, function (err, product) {
                        salesWithProducts[index] = {
                            ...sale,
                            product: product || null
                        };
                        
                        processedCount++;
                        if (processedCount === sales.length) {
                            res.json({
                                sales: salesWithProducts,
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
 * POST endpoint: Record new restricted drug sale.
 *
 * @param {Object} req request object with restricted drug sale data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/", function (req, res) {
    // Validate required fields
    if (!req.body.transaction_id || !req.body.product_id || !req.body.quantity_sold || 
        !req.body.customer_name || !req.body.customer_address) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transaction ID, product ID, quantity sold, customer name, and customer address are required fields.",
        });
    }
    
    // Check if product exists and is a restricted drug
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
        
        // Check if product is a restricted drug
        const restrictedDrugsDB = getRestrictedDrugsDB();
        restrictedDrugsDB.findOne({ product_id: req.body.product_id }, function (err, restrictedDrug) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            if (!restrictedDrug) {
                return res.status(400).json({
                    error: "Bad Request",
                    message: "Product is not a restricted drug.",
                });
            }
            
            // Check if transaction exists
            const transactionsDB = getTransactionsDB();
            transactionsDB.findOne({ _id: req.body.transaction_id }, function (err, transaction) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                if (!transaction) {
                    return res.status(404).json({
                        error: "Not Found",
                        message: "Transaction not found.",
                    });
                }
                
                // Validate additional requirements based on restricted drug settings
                if (restrictedDrug.valid_prescription_required && !req.body.prescription_number) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Prescription number is required for this restricted drug.",
                    });
                }
                
                if (restrictedDrug.photo_id_required && (!req.body.customer_id_proof || !req.body.id_proof_number)) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: "Customer ID proof and ID proof number are required for this restricted drug.",
                    });
                }
                
                if (restrictedDrug.max_purchase_quantity && parseInt(req.body.quantity_sold) > restrictedDrug.max_purchase_quantity) {
                    return res.status(400).json({
                        error: "Bad Request",
                        message: `Maximum purchase quantity for this drug is ${restrictedDrug.max_purchase_quantity}.`,
                    });
                }
                
                const newSale = {
                    _id: Math.floor(Date.now() / 1000),
                    transaction_id: validator.escape(req.body.transaction_id),
                    product_id: validator.escape(req.body.product_id),
                    batch_id: req.body.batch_id ? validator.escape(req.body.batch_id) : null,
                    quantity_sold: parseInt(req.body.quantity_sold),
                    customer_name: validator.escape(req.body.customer_name),
                    customer_address: validator.escape(req.body.customer_address),
                    doctor_name: req.body.doctor_name ? validator.escape(req.body.doctor_name) : "",
                    prescription_number: req.body.prescription_number ? validator.escape(req.body.prescription_number) : "",
                    customer_id_proof: req.body.customer_id_proof ? validator.escape(req.body.customer_id_proof) : "",
                    id_proof_number: req.body.id_proof_number ? validator.escape(req.body.id_proof_number) : "",
                    sold_by: req.body.sold_by || null,
                    sale_date: new Date(),
                    created_at: new Date()
                };
                
                restrictedDrugSalesDB.insert(newSale, function (err, sale) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.status(201).json({
                        ...sale,
                        product: product,
                        restricted_drug: restrictedDrug
                    });
                });
            });
        });
    });
});

/**
 * GET endpoint: Get specific restricted drug sale by ID.
 *
 * @param {Object} req request object with sale ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:id", function (req, res) {
    if (!req.params.id) {
        return res.status(400).send("Sale ID is required.");
    }
    
    restrictedDrugSalesDB.findOne({ _id: req.params.id }, function (err, sale) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!sale) {
            return res.status(404).json({
                error: "Not Found",
                message: "Restricted drug sale not found.",
            });
        }
        
        // Get product and transaction details
        const inventoryDB = getInventoryDB();
        const transactionsDB = getTransactionsDB();
        
        inventoryDB.findOne({ _id: parseInt(sale.product_id) }, function (err, product) {
            transactionsDB.findOne({ _id: sale.transaction_id }, function (err, transaction) {
                res.json({
                    ...sale,
                    product: product || null,
                    transaction: transaction || null
                });
            });
        });
    });
});

/**
 * GET endpoint: Get sales history for a restricted drug.
 *
 * @param {Object} req request object with drug ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/drug/:drugId", function (req, res) {
    if (!req.params.drugId) {
        return res.status(400).send("Drug ID is required.");
    }
    
    const drugId = req.params.drugId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Check if product exists and is a restricted drug
    const inventoryDB = getInventoryDB();
    inventoryDB.findOne({ _id: parseInt(drugId) }, function (err, product) {
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
        
        restrictedDrugSalesDB
            .find({ product_id: drugId })
            .sort({ sale_date: -1 })
            .skip(skip)
            .limit(limit)
            .exec(function (err, sales) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                restrictedDrugSalesDB.count({ product_id: drugId }, function (err, totalCount) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    res.json({
                        product: product,
                        sales: sales,
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
});

/**
 * GET endpoint: Get restricted drug purchases by customer.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/customer/:customerId", function (req, res) {
    if (!req.params.customerId) {
        return res.status(400).send("Customer ID is required.");
    }
    
    const customerId = req.params.customerId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Check if customer exists
    const customersDB = getCustomersDB();
    customersDB.findOne({ _id: customerId }, function (err, customer) {
        if (err) {
            console.error(err);
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }
        
        if (!customer) {
            return res.status(404).json({
                error: "Not Found",
                message: "Customer not found.",
            });
        }
        
        // Find sales by customer name (since we don't have customer_id in the sales record)
        restrictedDrugSalesDB
            .find({ customer_name: customer.name })
            .sort({ sale_date: -1 })
            .skip(skip)
            .limit(limit)
            .exec(function (err, sales) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                restrictedDrugSalesDB.count({ customer_name: customer.name }, function (err, totalCount) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }
                    
                    // Get product details for each sale
                    const inventoryDB = getInventoryDB();
                    let salesWithProducts = [];
                    let processedCount = 0;
                    
                    if (sales.length === 0) {
                        return res.json({
                            customer: customer,
                            sales: sales,
                            pagination: {
                                page: page,
                                limit: limit,
                                total: totalCount,
                                pages: Math.ceil(totalCount / limit)
                            }
                        });
                    }
                    
                    sales.forEach(function (sale, index) {
                        inventoryDB.findOne({ _id: parseInt(sale.product_id) }, function (err, product) {
                            salesWithProducts[index] = {
                                ...sale,
                                product: product || null
                            };
                            
                            processedCount++;
                            if (processedCount === sales.length) {
                                res.json({
                                    customer: customer,
                                    sales: salesWithProducts,
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
 * GET endpoint: Get sales by date range.
 *
 * @param {Object} req request object with start and end date as query parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/by-date", function (req, res) {
    if (!req.query.start || !req.query.end) {
        return res.status(400).send("Start and end dates are required.");
    }
    
    const startDate = new Date(req.query.start);
    const endDate = new Date(req.query.end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).send("Invalid date format.");
    }
    
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    restrictedDrugSalesDB
        .find({
            sale_date: { $gte: startDate, $lte: endDate }
        })
        .sort({ sale_date: -1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, sales) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            restrictedDrugSalesDB.count({
                sale_date: { $gte: startDate, $lte: endDate }
            }, function (err, totalCount) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    sales: sales,
                    date_range: {
                        start: startDate,
                        end: endDate
                    },
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
 * Helper function to get restricted drugs database instance
 *
 * @returns {Object} NeDB instance for restricted drugs
 */
function getRestrictedDrugsDB() {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const dbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "restricted-drugs.db",
    );
    
    return new Datastore({
        filename: dbPath,
        autoload: true,
    });
}

/**
 * Helper function to get transactions database instance
 *
 * @returns {Object} NeDB instance for transactions
 */
function getTransactionsDB() {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const dbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "transactions.db",
    );
    
    return new Datastore({
        filename: dbPath,
        autoload: true,
    });
}

/**
 * Helper function to get customers database instance
 *
 * @returns {Object} NeDB instance for customers
 */
function getCustomersDB() {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const dbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "customers.db",
    );
    
    return new Datastore({
        filename: dbPath,
        autoload: true,
    });
}