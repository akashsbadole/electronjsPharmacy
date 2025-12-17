let app = require("express")();
let server = require("http").Server(app);
let bodyParser = require("body-parser");
let Datastore = require("@seald-io/nedb");
let Inventory = require("./inventory");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
  appData,
  appName,
  "server",
  "databases",
  "transactions.db",
);

// Initialize stores database for store context
const storesDBPath = path.join(
  appData,
  appName,
  "server",
  "databases",
  "stores.db",
);

const storesDB = new Datastore({
  filename: storesDBPath,
  autoload: true,
});

app.use(bodyParser.json());

module.exports = app;

let transactionsDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

transactionsDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Transactions API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/", function (req, res) {
  res.send("Transactions API");
});

/**
 * GET endpoint: Get details of all transactions.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/all", function (req, res) {
  transactionsDB.find({}, function (err, docs) {
    res.send(docs);
  });
});

/**
 * GET endpoint: Get on-hold transactions.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/on-hold", function (req, res) {
  transactionsDB.find(
    { $and: [{ ref_number: { $ne: "" } }, { status: 0 }] },
    function (err, docs) {
      if (docs) res.send(docs);
    },
  );
});

/**
 * GET endpoint: Get customer orders with a status of 0 and an empty reference number.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/customer-orders", function (req, res) {
  transactionsDB.find(
    { $and: [{ customer: { $ne: "0" } }, { status: 0 }, { ref_number: "" }] },
    function (err, docs) {
      if (docs) res.send(docs);
    },
  );
});

/**
 * GET endpoint: Get transactions based on date, user, and till parameters.
 *
 * @param {Object} req request object with query parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/by-date", function (req, res) {
  let startDate = new Date(req.query.start);
  let endDate = new Date(req.query.end);
  const storeId = req.query.storeId ? parseInt(req.query.storeId) : Inventory.getCurrentStoreId();

  let query = {
    $and: [
      { date: { $gte: startDate.toJSON(), $lte: endDate.toJSON() } },
      { status: parseInt(req.query.status) },
    ],
  };

  // Add store filter if specified
  if (storeId) {
    query.$and.push({ storeId: storeId });
  }

  if (req.query.user == 0 && req.query.till == 0) {
    transactionsDB.find(query, function (err, docs) {
      if (docs) res.send(docs);
    });
  }

  if (req.query.user != 0 && req.query.till == 0) {
    query.$and.push({ user_id: parseInt(req.query.user) });
    transactionsDB.find(query, function (err, docs) {
      if (docs) res.send(docs);
    });
  }

  if (req.query.user == 0 && req.query.till != 0) {
    query.$and.push({ till: parseInt(req.query.till) });
    transactionsDB.find(query, function (err, docs) {
      if (docs) res.send(docs);
    });
  }

  if (req.query.user != 0 && req.query.till != 0) {
    query.$and.push({ till: parseInt(req.query.till) });
    query.$and.push({ user_id: parseInt(req.query.user) });
    transactionsDB.find(query, function (err, docs) {
      if (docs) res.send(docs);
    });
  }
});

/**
 * POST endpoint: Create a new transaction.
 *
 * @param {Object} req request object with transaction data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/new", function (req, res) {
  let newTransaction = req.body;

  // Get current store ID from inventory module
  const currentStoreId = Inventory.getCurrentStoreId();
  
  // Add store information to transaction
  newTransaction.storeId = currentStoreId;
  newTransaction.storeName = req.body.storeName || "";

  transactionsDB.insert(newTransaction, function (err, transaction) {
    if (err) {
      console.error(err);
      res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    } else {
      res.sendStatus(200);

      if (newTransaction.paid >= newTransaction.total) {
        Inventory.decrementInventory(newTransaction.items, { storeId: currentStoreId });
      }
      
      // Create customer invoice for credit sales
      if (newTransaction.customer && newTransaction.customer !== "0" && newTransaction.paid < newTransaction.total) {
        createCustomerInvoice(transaction, function(err) {
          if (err) {
            console.error("Failed to create customer invoice:", err);
          }
        });
      }
    }
  });
});

/**
 * PUT endpoint: Update an existing transaction.
 *
 * @param {Object} req request object with transaction data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.put("/new", function (req, res) {
  let oderId = req.body._id;
  transactionsDB.update(
    {
      _id: oderId,
    },
    req.body,
    {},
    function (err, numReplaced, order) {
      if (err) {
        console.error(err);
        res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      } else {
        res.sendStatus(200);
      }
    },
  );
});

/**
 * POST endpoint: Delete a transaction.
 *
 * @param {Object} req request object with transaction data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/delete", function (req, res) {
  let transaction = req.body;
  transactionsDB.remove(
    {
      _id: transaction.orderId,
    },
    function (err, numRemoved) {
      if (err) {
        console.error(err);
        res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      } else {
        res.sendStatus(200);
      }
    },
  );
});

/**
 * GET endpoint: Get details of a specific transaction by transaction ID.
 *
 * @param {Object} req request object with transaction ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
app.get("/:transactionId", function (req, res) {
  transactionsDB.find({ _id: req.params.transactionId }, function (err, doc) {
    if (doc) res.send(doc[0]);
  });
});

/**
 * POST endpoint: Calculate GST for a transaction.
 * This endpoint calculates GST based on transaction items and customer state.
 *
 * @param {Object} req request object with transaction details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/calculate-gst", function (req, res) {
    // Validate required fields
    if (!req.body.items || !Array.isArray(req.body.items) || req.body.items.length === 0) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Items array is required and cannot be empty.",
        });
    }

    if (!req.body.customer_state) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer state is required.",
        });
    }

    // Get active GST configuration
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    const dbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "gst-config.db",
    );
    
    const gstConfigDB = new Datastore({
        filename: dbPath,
        autoload: true,
    });

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
        const customerState = req.body.customer_state;
        const isInterState = config.state_code !== customerState;
        
        let subtotal = 0;
        let totalCGST = 0;
        let totalSGST = 0;
        let totalIGST = 0;
        let totalCESS = 0;
        
        // Process each item
        const itemsWithGST = req.body.items.map(function (item) {
            const itemAmount = parseFloat(item.price) * parseInt(item.quantity);
            let cgstAmount = 0;
            let sgstAmount = 0;
            let igstAmount = 0;
            let cessAmount = 0;
            let itemGST = 0;
            
            // Get HSN code specific GST rates if available, otherwise use default rates
            // In a real implementation, we would have a separate HSN codes database
            const hsnCode = item.hsn_code || "default";
            let cgstRate = config.cgst_rate;
            let sgstRate = config.sgst_rate;
            let igstRate = config.igst_rate;
            let cessRate = config.cess_rate;
            
            // Calculate GST based on transaction type
            if (isInterState) {
                // Inter-state transaction: IGST applies
                igstAmount = (itemAmount * igstRate) / 100;
                itemGST = igstAmount;
            } else {
                // Intra-state transaction: CGST + SGST applies
                cgstAmount = (itemAmount * cgstRate) / 100;
                sgstAmount = (itemAmount * sgstRate) / 100;
                itemGST = cgstAmount + sgstAmount;
            }
            
            // CESS applies to both inter-state and intra-state transactions
            cessAmount = (itemAmount * cessRate) / 100;
            itemGST += cessAmount;
            
            // Update totals
            subtotal += itemAmount;
            totalCGST += cgstAmount;
            totalSGST += sgstAmount;
            totalIGST += igstAmount;
            totalCESS += cessAmount;
            
            return {
                ...item,
                item_amount: parseFloat(itemAmount.toFixed(2)),
                cgst_rate: cgstRate,
                sgst_rate: sgstRate,
                igst_rate: igstRate,
                cess_rate: cessRate,
                cgst_amount: parseFloat(cgstAmount.toFixed(2)),
                sgst_amount: parseFloat(sgstAmount.toFixed(2)),
                igst_amount: parseFloat(igstAmount.toFixed(2)),
                cess_amount: parseFloat(cessAmount.toFixed(2)),
                item_gst: parseFloat(itemGST.toFixed(2)),
                item_total: parseFloat((itemAmount + itemGST).toFixed(2))
            };
        });
        
        const totalGST = totalCGST + totalSGST + totalIGST + totalCESS;
        const totalAmount = subtotal + totalGST;
        
        res.send({
            items: itemsWithGST,
            subtotal: parseFloat(subtotal.toFixed(2)),
            cgst_rate: config.cgst_rate,
            sgst_rate: config.sgst_rate,
            igst_rate: config.igst_rate,
            cess_rate: config.cess_rate,
            total_cgst: parseFloat(totalCGST.toFixed(2)),
            total_sgst: parseFloat(totalSGST.toFixed(2)),
            total_igst: parseFloat(totalIGST.toFixed(2)),
            total_cess: parseFloat(totalCESS.toFixed(2)),
            total_gst: parseFloat(totalGST.toFixed(2)),
            total_amount: parseFloat(totalAmount.toFixed(2)),
            is_inter_state: isInterState
        });
    });
});

/**
 * POST endpoint: Generate e-invoice for a transaction.
 *
 * @param {Object} req request object with transaction ID in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/:transactionId/generate-e-invoice", function (req, res) {
    if (!req.params.transactionId) {
        return res.status(400).send("Transaction ID is required.");
    }

    // Check if transaction exists
    transactionsDB.findOne({ _id: req.params.transactionId }, function (err, transaction) {
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

        // Check if e-invoice already exists for this transaction
        const Datastore = require("@seald-io/nedb");
        const path = require("path");
        const dbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "e-invoices.db",
        );
        
        const eInvoiceDB = new Datastore({
            filename: dbPath,
            autoload: true,
        });

        eInvoiceDB.findOne({ transaction_id: req.params.transactionId }, function (err, existingInvoice) {
            if (err) {
                console.error(err);
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            if (existingInvoice) {
                return res.status(409).json({
                    error: "Conflict",
                    message: "E-Invoice already exists for this transaction.",
                });
            }

            // Create e-invoice
            const crypto = require("crypto");
            const invoiceId = crypto.randomBytes(16).toString('hex');
            
            const eInvoice = {
                _id: invoiceId,
                transaction_id: req.params.transactionId,
                irn: null, // Will be generated after GSTN verification
                signed_invoice: null,
                signed_qr_code: null,
                ack_number: null,
                ack_date: null,
                invoice_status: 'PENDING',
                cancellation_reason: null,
                cancelled_at: null,
                created_at: new Date(),
                updated_at: new Date()
            };

            eInvoiceDB.insert(eInvoice, function (err, newInvoice) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Simulate IRN generation
                setTimeout(function() {
                    // Generate a mock IRN (64 characters as per GSTN specification)
                    const mockIRN = crypto.randomBytes(32).toString('hex').toUpperCase();
                    
                    // Generate a mock acknowledgement number (20 characters)
                    const mockAckNumber = Math.floor(10000000000000000000 + Math.random() * 90000000000000000000).toString();
                    
                    // Update invoice with mock data
                    eInvoiceDB.update(
                        { _id: invoiceId },
                        { 
                            $set: {
                                irn: mockIRN,
                                signed_invoice: "mock_signed_invoice_data",
                                signed_qr_code: "mock_qr_code_data",
                                ack_number: mockAckNumber,
                                ack_date: new Date(),
                                invoice_status: "GENERATED",
                                updated_at: new Date()
                            }
                        },
                        {},
                        function (err, numReplaced) {
                            if (err) {
                                console.error("Error updating e-invoice:", err);
                            }
                        }
                    );
                }, 2000); // Simulate a 2-second delay for API call

                res.status(201).send(newInvoice);
            });
        });
    });
});

/**
 * POST endpoint: Generate e-way bill for a transaction.
 *
 * @param {Object} req request object with transaction ID and e-way bill details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
app.post("/:transactionId/generate-eway-bill", function (req, res) {
    if (!req.params.transactionId) {
        return res.status(400).send("Transaction ID is required.");
    }

    // Validate required fields
    if (!req.body.from_state || !req.body.to_state || 
        !req.body.from_pincode || !req.body.to_pincode) {
        return res.status(400).json({
            error: "Bad Request",
            message: "From state, to state, from pincode, and to pincode are required fields.",
        });
    }

    // Validate pincodes (6 digits)
    if (!/^\d{6}$/.test(req.body.from_pincode) || !/^\d{6}$/.test(req.body.to_pincode)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Pincodes must be 6 digits.",
        });
    }

    // Check if transaction exists
    transactionsDB.findOne({ _id: req.params.transactionId }, function (err, transaction) {
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

        // Check if e-way bill already exists for this transaction
        const Datastore = require("@seald-io/nedb");
        const path = require("path");
        const dbPath = path.join(
            process.env.APPDATA,
            process.env.APPNAME,
            "server",
            "databases",
            "eway-bill.db",
        );
        
        const eWayBillDB = new Datastore({
            filename: dbPath,
            autoload: true,
        });

        eWayBillDB.findOne({ transaction_id: req.params.transactionId }, function (err, existingBill) {
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

            // Create e-way bill
            const crypto = require("crypto");
            const billId = crypto.randomBytes(16).toString('hex');
            
            const eWayBill = {
                _id: billId,
                transaction_id: req.params.transactionId,
                eway_bill_number: null, // Will be generated after GSTN verification
                generated_date: generatedDate,
                valid_until: validUntil,
                from_state: req.body.from_state,
                to_state: req.body.to_state,
                from_pincode: req.body.from_pincode,
                to_pincode: req.body.to_pincode,
                transporter_id: req.body.transporter_id || null,
                vehicle_number: req.body.vehicle_number || null,
                distance_km: req.body.distance_km || 0,
                document_status: 'ACTIVE',
                cancel_reason: null,
                cancelled_at: null,
                created_at: new Date(),
                updated_at: new Date()
            };

            eWayBillDB.insert(eWayBill, function (err, newBill) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Simulate e-way bill number generation
                setTimeout(function() {
                    // Generate a mock e-way bill number (12 characters as per GSTN specification)
                    const mockBillNumber = Math.floor(100000000000 + Math.random() * 900000000000).toString();
                    
                    // Update e-way bill with mock data
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
                                console.error("Error updating e-way bill:", err);
                            }
                        }
                    );
                }, 2000); // Simulate a 2-second delay for API call

                res.status(201).send(newBill);
            });
        });
    });
});

/**
 * Helper function to create customer invoice
 *
 * @param {Object} transaction transaction object
 * @param {function} callback callback function
 * @returns {void}
 */
function createCustomerInvoice(transaction, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    // Create customer invoice
    const customerInvoicesDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "customer-invoices.db",
    );
    
    const customerInvoicesDB = new Datastore({
        filename: customerInvoicesDbPath,
        autoload: true,
    });
    
    // Generate unique invoice number
    const invoiceNumber = generateInvoiceNumber('CUSTOMER');
    
    // Calculate due date based on payment terms
    let dueDate = new Date();
    const customerAccountsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "customer-accounts.db",
    );
    
    const customerAccountsDB = new Datastore({
        filename: customerAccountsDbPath,
        autoload: true,
    });
    
    customerAccountsDB.findOne({ customerId: transaction.customer }, function(err, account) {
        if (err) {
            return callback(err);
        }
        
        if (account && account.paymentTermId) {
            // Get payment terms
            const paymentTermsDbPath = path.join(
                process.env.APPDATA,
                process.env.APPNAME,
                "server",
                "databases",
                "payment-terms.db",
            );
            
            const paymentTermsDB = new Datastore({
                filename: paymentTermsDbPath,
                autoload: true,
            });
            
            paymentTermsDB.findOne({ _id: account.paymentTermId }, function(err, paymentTerm) {
                if (!err && paymentTerm) {
                    dueDate.setDate(dueDate.getDate() + paymentTerm.days);
                }
                
                createInvoice();
            });
        } else {
            // Default 30 days
            dueDate.setDate(dueDate.getDate() + 30);
            createInvoice();
        }
        
        function createInvoice() {
            const newInvoice = {
                _id: Math.floor(Date.now() / 1000),
                invoiceNumber: invoiceNumber,
                transactionId: transaction._id,
                customerId: transaction.customer,
                invoiceDate: new Date().toISOString().split('T')[0],
                dueDate: dueDate.toISOString().split('T')[0],
                subtotal: transaction.subtotal || transaction.total,
                gstAmount: transaction.gstAmount || 0,
                totalAmount: transaction.total,
                discountAmount: transaction.discountAmount || 0,
                balanceAmount: transaction.total - transaction.paid,
                status: 'PENDING',
                notes: transaction.notes || null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            customerInvoicesDB.insert(newInvoice, function (err, invoice) {
                if (err) {
                    return callback(err);
                }
                
                // Create invoice items
                createCustomerInvoiceItems(invoice._id, transaction.items, function(err) {
                    if (err) {
                        return callback(err);
                    }
                    
                    // Update customer account balance
                    updateCustomerAccountBalance(transaction.customer, transaction.total - transaction.paid, function(err) {
                        if (err) {
                            console.error("Failed to update customer account balance:", err);
                        }
                        
                        callback(null);
                    });
                });
            });
        }
    });
}

/**
 * Helper function to create customer invoice items
 *
 * @param {number} invoiceId invoice ID
 * @param {Array} items array of items
 * @param {function} callback callback function
 * @returns {void}
 */
function createCustomerInvoiceItems(invoiceId, items, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const itemsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "customer-invoice-items.db",
    );
    
    const itemsDB = new Datastore({
        filename: itemsDbPath,
        autoload: true,
    });
    
    const createdItems = [];
    
    items.forEach(function(item) {
        const newItem = {
            _id: Math.floor(Date.now() / 1000) + Math.random(),
            customerInvoiceId: invoiceId,
            productId: item.id,
            description: item.name || null,
            quantity: item.quantity,
            unitPrice: item.price,
            gstRate: item.gstRate || 0,
            discountAmount: item.discountAmount || 0,
            totalPrice: item.total || (item.price * item.quantity),
            createdAt: new Date()
        };
        
        createdItems.push(newItem);
    });
    
    // Insert all items
    itemsDB.insert(createdItems, function(err, items) {
        if (err) {
            return callback(err);
        }
        
        callback(null);
    });
}

/**
 * Helper function to update customer account balance
 *
 * @param {string} customerId customer ID
 * @param {number} amount amount to add to balance
 * @param {function} callback callback function
 * @returns {void}
 */
function updateCustomerAccountBalance(customerId, amount, callback) {
    const Datastore = require("@seald-io/nedb");
    const path = require("path");
    
    const customerAccountsDbPath = path.join(
        process.env.APPDATA,
        process.env.APPNAME,
        "server",
        "databases",
        "customer-accounts.db",
    );
    
    const customerAccountsDB = new Datastore({
        filename: customerAccountsDbPath,
        autoload: true,
    });
    
    // Check if account exists
    customerAccountsDB.findOne({ customerId: customerId }, function(err, account) {
        if (err) {
            return callback(err);
        }
        
        if (account) {
            // Update existing account
            customerAccountsDB.update(
                { customerId: customerId },
                {
                    $inc: { balance: amount },
                    $set: { updatedAt: new Date() }
                },
                {},
                function(err, numReplaced) {
                    if (err) {
                        return callback(err);
                    }
                    
                    callback(null);
                }
            );
        } else {
            // Create new account
            const newAccount = {
                _id: Math.floor(Date.now() / 1000),
                customerId: customerId,
                creditLimit: 0,
                balance: amount,
                paymentTermId: null,
                createdAt: new Date(),
                updatedAt: new Date()
            };
            
            customerAccountsDB.insert(newAccount, function(err, account) {
                if (err) {
                    return callback(err);
                }
                
                callback(null);
            });
        }
    });
}

/**
 * Helper function to generate unique invoice number
 *
 * @param {string} type invoice type (SUPPLIER/CUSTOMER)
 * @returns {string} unique invoice number
 */
function generateInvoiceNumber(type) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const time = date.getTime();
    
    const prefix = type === 'SUPPLIER' ? 'SINV' : 'CINV';
    return `${prefix}${year}${month}${day}${time.toString().slice(-6)}`;
}