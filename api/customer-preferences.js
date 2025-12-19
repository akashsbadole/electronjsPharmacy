const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;
const dbPath = path.join(
  appData,
  appName,
  "server",
  "databases",
  "customer-preferences.db",
);

router.use(bodyParser.json());

module.exports = router;

let customerPreferencesDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

customerPreferencesDB.ensureIndex({ fieldName: "_id", unique: true });
customerPreferencesDB.ensureIndex({ fieldName: "customerId", unique: true });

/**
 * GET endpoint: Get the welcome message for the Customer Preferences API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
  res.send("Customer Preferences API");
});

/**
 * GET endpoint: Get all customer preferences.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  customerPreferencesDB.find({})
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec(function (err, docs) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }
      
      customerPreferencesDB.count({}, function (err, count) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }
        
        res.json({
          preferences: docs,
          pagination: {
            total: count,
            page: page,
            limit: limit,
            pages: Math.ceil(count / limit)
          }
        });
      });
    });
});

/**
 * GET endpoint: Get customer preferences by customer ID.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  customerPreferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    // If no preferences exist, return default preferences
    if (!preferences) {
      const defaultPreferences = {
        customerId: req.params.customerId,
        whatsapp: {
          enabled: true,
          phoneNumber: null,
          consent: false,
          consentDate: null
        },
        sms: {
          enabled: true,
          phoneNumber: null,
          consent: false,
          consentDate: null
        },
        email: {
          enabled: true,
          emailAddress: null,
          consent: false,
          consentDate: null
        },
        preferences: {
          invoiceDelivery: "email", // whatsapp, sms, email
          promotionalMessages: false,
          orderUpdates: true,
          paymentReminders: true,
          lowStockAlerts: false,
          newProductAlerts: false,
          loyaltyUpdates: true
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      return res.json(defaultPreferences);
    }

    res.json(preferences);
  });
});

/**
 * POST endpoint: Create or update customer preferences.
 *
 * @param {Object} req request object with customer preferences data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/customer/:customerId", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  // Check if customer exists
  const customersDB = new Datastore({
    filename: path.join(
      appData,
      appName,
      "server",
      "databases",
      "customers.db",
    ),
    autoload: true,
  });

  customersDB.findOne({ _id: req.params.customerId }, function (err, customer) {
    if (err) {
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

    // Check if preferences already exist
    customerPreferencesDB.findOne({ customerId: req.params.customerId }, function (err, existingPreferences) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }

      const preferences = {
        customerId: req.params.customerId,
        whatsapp: {
          enabled: req.body.whatsapp && req.body.whatsapp.enabled !== undefined ? req.body.whatsapp.enabled : true,
          phoneNumber: req.body.whatsapp && req.body.whatsapp.phoneNumber ? req.body.whatsapp.phoneNumber : customer.phone || null,
          consent: req.body.whatsapp && req.body.whatsapp.consent !== undefined ? req.body.whatsapp.consent : false,
          consentDate: req.body.whatsapp && req.body.whatsapp.consent ? new Date() : null
        },
        sms: {
          enabled: req.body.sms && req.body.sms.enabled !== undefined ? req.body.sms.enabled : true,
          phoneNumber: req.body.sms && req.body.sms.phoneNumber ? req.body.sms.phoneNumber : customer.phone || null,
          consent: req.body.sms && req.body.sms.consent !== undefined ? req.body.sms.consent : false,
          consentDate: req.body.sms && req.body.sms.consent ? new Date() : null
        },
        email: {
          enabled: req.body.email && req.body.email.enabled !== undefined ? req.body.email.enabled : true,
          emailAddress: req.body.email && req.body.email.emailAddress ? req.body.email.emailAddress : customer.email || null,
          consent: req.body.email && req.body.email.consent !== undefined ? req.body.email.consent : false,
          consentDate: req.body.email && req.body.email.consent ? new Date() : null
        },
        preferences: {
          invoiceDelivery: req.body.preferences && req.body.preferences.invoiceDelivery ? req.body.preferences.invoiceDelivery : "email",
          promotionalMessages: req.body.preferences && req.body.preferences.promotionalMessages !== undefined ? req.body.preferences.promotionalMessages : false,
          orderUpdates: req.body.preferences && req.body.preferences.orderUpdates !== undefined ? req.body.preferences.orderUpdates : true,
          paymentReminders: req.body.preferences && req.body.preferences.paymentReminders !== undefined ? req.body.preferences.paymentReminders : true,
          lowStockAlerts: req.body.preferences && req.body.preferences.lowStockAlerts !== undefined ? req.body.preferences.lowStockAlerts : false,
          newProductAlerts: req.body.preferences && req.body.preferences.newProductAlerts !== undefined ? req.body.preferences.newProductAlerts : false,
          loyaltyUpdates: req.body.preferences && req.body.preferences.loyaltyUpdates !== undefined ? req.body.preferences.loyaltyUpdates : true
        },
        updatedAt: new Date()
      };

      if (existingPreferences) {
        // Update existing preferences
        customerPreferencesDB.update(
          { customerId: req.params.customerId },
          { $set: preferences },
          {},
          function (err, numReplaced) {
            if (err) {
              return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
              });
            }

            res.json({
              ...existingPreferences,
              ...preferences
            });
          }
        );
      } else {
        // Create new preferences
        preferences._id = Math.floor(Date.now() / 1000) + Math.random();
        preferences.createdAt = new Date();

        customerPreferencesDB.insert(preferences, function (err, newPreferences) {
          if (err) {
            return res.status(500).json({
              error: "Internal Server Error",
              message: "An unexpected error occurred.",
            });
          }

          res.status(201).json(newPreferences);
        });
      }
    });
  });
});

/**
 * PUT endpoint: Update specific customer preference.
 *
 * @param {Object} req request object with customer ID and preference update in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/customer/:customerId/preference", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  if (!req.body.type || !req.body.field) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Type and field are required.",
    });
  }

  const validTypes = ["whatsapp", "sms", "email", "preferences"];
  if (!validTypes.includes(req.body.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  // Check if preferences exist
  customerPreferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!preferences) {
      return res.status(404).json({
        error: "Not Found",
        message: "Customer preferences not found.",
      });
    }

    // Update the specific field
    const updatePath = `${req.body.type}.${req.body.field}`;
    const updateData = {};
    updateData[updatePath] = req.body.value;
    updateData.updatedAt = new Date();

    // Handle consent date updates
    if (req.body.field === "consent" && req.body.value === true) {
      updateData[`${req.body.type}.consentDate`] = new Date();
    }

    customerPreferencesDB.update(
      { customerId: req.params.customerId },
      { $set: updateData },
      {},
      function (err, numReplaced) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }

        // Return updated preferences
        customerPreferencesDB.findOne({ customerId: req.params.customerId }, function (err, updatedPreferences) {
          if (err) {
            return res.status(500).json({
              error: "Internal Server Error",
              message: "An unexpected error occurred.",
            });
          }

          res.json(updatedPreferences);
        });
      }
    );
  });
});

/**
 * POST endpoint: Update customer consent for communication.
 *
 * @param {Object} req request object with consent data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/customer/:customerId/consent", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  if (!req.body.type || req.body.consent === undefined) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Type and consent are required.",
    });
  }

  const validTypes = ["whatsapp", "sms", "email"];
  if (!validTypes.includes(req.body.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  // Check if preferences exist
  customerPreferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!preferences) {
      return res.status(404).json({
        error: "Not Found",
        message: "Customer preferences not found.",
      });
    }

    // Update consent
    const updateData = {};
    updateData[`${req.body.type}.consent`] = req.body.consent;
    updateData[`${req.body.type}.consentDate`] = req.body.consent ? new Date() : null;
    updateData.updatedAt = new Date();

    customerPreferencesDB.update(
      { customerId: req.params.customerId },
      { $set: updateData },
      {},
      function (err, numReplaced) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }

        // Log consent change for compliance
        const consentLog = {
          _id: Math.floor(Date.now() / 1000) + Math.random(),
          customerId: req.params.customerId,
          type: req.body.type,
          consent: req.body.consent,
          consentDate: req.body.consent ? new Date() : null,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get("User-Agent"),
          createdAt: new Date()
        };

        // Store consent log in a separate database for compliance
        const consentLogDB = new Datastore({
          filename: path.join(
            appData,
            appName,
            "server",
            "databases",
            "consent-log.db",
          ),
          autoload: true,
        });

        consentLogDB.insert(consentLog, function (err) {
          if (err) {
            console.error("Error logging consent:", err);
          }
        });

        // Return updated preferences
        customerPreferencesDB.findOne({ customerId: req.params.customerId }, function (err, updatedPreferences) {
          if (err) {
            return res.status(500).json({
              error: "Internal Server Error",
              message: "An unexpected error occurred.",
            });
          }

          res.json(updatedPreferences);
        });
      }
    );
  });
});

/**
 * GET endpoint: Get customer's preferred communication method for invoices.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId/invoice-preference", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  customerPreferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    // If no preferences exist, return default
    if (!preferences) {
      return res.json({
        method: "email",
        enabled: true,
        recipient: null,
        consent: false
      });
    }

    const invoiceDelivery = preferences.preferences.invoiceDelivery;
    let method = "email";
    let enabled = true;
    let recipient = null;
    let consent = false;

    switch (invoiceDelivery) {
      case "whatsapp":
        method = "whatsapp";
        enabled = preferences.whatsapp.enabled;
        recipient = preferences.whatsapp.phoneNumber;
        consent = preferences.whatsapp.consent;
        break;
      case "sms":
        method = "sms";
        enabled = preferences.sms.enabled;
        recipient = preferences.sms.phoneNumber;
        consent = preferences.sms.consent;
        break;
      case "email":
      default:
        method = "email";
        enabled = preferences.email.enabled;
        recipient = preferences.email.emailAddress;
        consent = preferences.email.consent;
        break;
    }

    res.json({
      method: method,
      enabled: enabled,
      recipient: recipient,
      consent: consent
    });
  });
});

/**
 * DELETE endpoint: Delete customer preferences.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/customer/:customerId", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  customerPreferencesDB.remove(
    { customerId: req.params.customerId },
    {},
    function (err, numRemoved) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }

      if (numRemoved === 0) {
        return res.status(404).json({
          error: "Not Found",
          message: "Customer preferences not found.",
        });
      }

      res.sendStatus(200);
    }
  );
});

/**
 * GET endpoint: Get consent log for a customer.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId/consent-log", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  const consentLogDB = new Datastore({
    filename: path.join(
      appData,
      appName,
      "server",
      "databases",
      "consent-log.db",
    ),
    autoload: true,
  });

  consentLogDB.find({ customerId: req.params.customerId })
    .sort({ createdAt: -1 })
    .exec(function (err, logs) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }

      res.json(logs);
    });
});