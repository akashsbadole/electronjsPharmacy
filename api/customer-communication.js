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
  "customer-communications.db",
);

router.use(bodyParser.json());

module.exports = router;

let communicationsDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

communicationsDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Customer Communication API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
  res.send("Customer Communication API");
});

/**
 * POST endpoint: Send multi-channel communication
 *
 * @param {Object} req request object with communication data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/send", function (req, res) {
  if (!req.body.customerId || !req.body.channel || !req.body.type) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID, channel, and type are required.",
    });
  }

  const validChannels = ["sms", "email", "whatsapp", "in_app", "push"];
  const validTypes = [
    "APPOINTMENT_REMINDER", "PRESCRIPTION_REFILL", "PROMOTIONAL", 
    "TRANSACTIONAL", "HEALTH_TIP", "BIRTHDAY_WISH", "LOYALTY_UPDATE"
  ];

  if (!validChannels.includes(req.body.channel)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid channel. Must be one of: ${validChannels.join(", ")}`,
    });
  }

  if (!validTypes.includes(req.body.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  // Get customer data to validate and get contact information
  const customersDB = require("./customers");
  const Datastore = require("@seald-io/nedb");
  const customersDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "customers.db",
  );
  
  const customersDBInstance = new Datastore({
    filename: customersDbPath,
    autoload: true,
  });

  customersDBInstance.findOne({ _id: req.body.customerId }, function (err, customer) {
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

    // Get customer preferences
    const customerPreferencesDbPath = path.join(
      appData,
      appName,
      "server",
      "databases",
      "customer-communication-preferences.db",
    );
    
    const customerPreferencesDB = new Datastore({
      filename: customerPreferencesDbPath,
      autoload: true,
    });

    customerPreferencesDB.findOne({ customerId: req.body.customerId }, function (err, preferences) {
      if (err) {
        console.error("Error fetching customer preferences:", err);
      }

      // Check if customer has consent for this type of communication
      if (preferences && !hasConsent(preferences, req.body.channel, req.body.type)) {
        return res.status(403).json({
          error: "Forbidden",
          message: "Customer has not consented to this type of communication.",
        });
      }

      // Determine recipient based on channel
      let recipient = getRecipientForChannel(customer, req.body.channel);
      if (!recipient) {
        return res.status(400).json({
          error: "Bad Request",
          message: `Customer does not have a valid ${req.body.channel} address.`,
        });
      }

      const communication = {
        _id: Math.floor(Date.now() / 1000) + Math.random(),
        customerId: req.body.customerId,
        transactionId: req.body.transactionId || null,
        prescriptionId: req.body.prescriptionId || null,
        campaignId: req.body.campaignId || null,
        templateId: req.body.templateId || null,
        channel: req.body.channel,
        type: req.body.type,
        category: getCategoryForType(req.body.type),
        recipient: recipient,
        subject: req.body.subject || null,
        content: req.body.content || "",
        attachments: req.body.attachments || [],
        personalizationData: req.body.personalizationData || {},
        priority: req.body.priority || 1,
        status: "PENDING",
        scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date(),
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        failedAt: null,
        errorMessage: null,
        retryCount: 0,
        maxRetries: 3,
        cost: 0,
        currency: "USD",
        provider: null,
        providerMessageId: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      communicationsDB.insert(communication, function (err, newCommunication) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }

        // Add to message queue for processing
        addToMessageQueue(newCommunication);

        res.status(201).json({
          success: true,
          communicationId: newCommunication._id,
          status: newCommunication.status,
          scheduledAt: newCommunication.scheduledAt
        });
      });
    });
  });
});

/**
 * GET endpoint: Get communications by customer ID.
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

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  communicationsDB.find({ customerId: req.params.customerId })
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
      
      communicationsDB.count({ customerId: req.params.customerId }, function (err, count) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }
        
        res.json({
          communications: docs,
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
 * GET endpoint: Get communication by ID.
 *
 * @param {Object} req request object with communication ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:communicationId", function (req, res) {
  if (!req.params.communicationId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Communication ID is required.",
    });
  }

  communicationsDB.findOne({ _id: req.params.communicationId }, function (err, communication) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!communication) {
      return res.status(404).json({
        error: "Not Found",
        message: "Communication not found.",
      });
    }

    res.json(communication);
  });
});

/**
 * PUT endpoint: Update communication status.
 *
 * @param {Object} req request object with communication ID and status update in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:communicationId/status", function (req, res) {
  if (!req.params.communicationId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Communication ID is required.",
    });
  }

  if (!req.body.status) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Status is required.",
    });
  }

  const validStatuses = ["PENDING", "PROCESSING", "SENT", "DELIVERED", "READ", "FAILED"];
  if (!validStatuses.includes(req.body.status)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
    });
  }

  const updateData = {
    status: req.body.status,
    updatedAt: new Date()
  };

  // Update timestamp based on status
  if (req.body.status === "SENT") {
    updateData.sentAt = new Date();
  } else if (req.body.status === "DELIVERED") {
    updateData.deliveredAt = new Date();
  } else if (req.body.status === "READ") {
    updateData.readAt = new Date();
  } else if (req.body.status === "FAILED") {
    updateData.failedAt = new Date();
    if (req.body.errorMessage) {
      updateData.errorMessage = req.body.errorMessage;
    }
  }

  // Update additional fields if provided
  if (req.body.providerMessageId) {
    updateData.providerMessageId = req.body.providerMessageId;
  }
  if (req.body.cost) {
    updateData.cost = req.body.cost;
  }
  if (req.body.provider) {
    updateData.provider = req.body.provider;
  }

  communicationsDB.update(
    { _id: req.params.communicationId },
    { $set: updateData },
    {},
    function (err, numReplaced) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }

      if (numReplaced === 0) {
        return res.status(404).json({
          error: "Not Found",
          message: "Communication not found.",
        });
      }

      res.sendStatus(200);
    }
  );
});

/**
 * GET endpoint: Get communication analytics.
 *
 * @param {Object} req request object with optional date range.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/analytics", function (req, res) {
  const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Default to last 30 days
  const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();

  communicationsDB.find({
    createdAt: { $gte: startDate, $lte: endDate }
  }, function (err, communications) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    const analytics = {
      summary: {
        total: communications.length,
        sent: communications.filter(c => c.status === "SENT").length,
        delivered: communications.filter(c => c.status === "DELIVERED").length,
        read: communications.filter(c => c.status === "READ").length,
        failed: communications.filter(c => c.status === "FAILED").length,
        pending: communications.filter(c => c.status === "PENDING").length,
        processing: communications.filter(c => c.status === "PROCESSING").length
      },
      byChannel: {
        sms: communications.filter(c => c.channel === "sms").length,
        email: communications.filter(c => c.channel === "email").length,
        whatsapp: communications.filter(c => c.channel === "whatsapp").length,
        in_app: communications.filter(c => c.channel === "in_app").length,
        push: communications.filter(c => c.channel === "push").length
      },
      byType: {},
      deliveryRate: 0,
      readRate: 0,
      totalCost: communications.reduce((sum, c) => sum + (c.cost || 0), 0)
    };

    // Calculate by type
    const types = [...new Set(communications.map(c => c.type))];
    types.forEach(type => {
      analytics.byType[type] = communications.filter(c => c.type === type).length;
    });

    // Calculate rates
    const sentCommunications = communications.filter(c => c.status === "SENT" || c.status === "DELIVERED" || c.status === "READ");
    if (sentCommunications.length > 0) {
      analytics.deliveryRate = ((communications.filter(c => c.status === "DELIVERED" || c.status === "READ").length / sentCommunications.length) * 100).toFixed(2);
      analytics.readRate = ((communications.filter(c => c.status === "READ").length / sentCommunications.length) * 100).toFixed(2);
    }

    res.json(analytics);
  });
});

/**
 * DELETE endpoint: Delete a communication by ID.
 *
 * @param {Object} req request object with communication ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:communicationId", function (req, res) {
  if (!req.params.communicationId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Communication ID is required.",
    });
  }

  communicationsDB.remove(
    { _id: req.params.communicationId },
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
          message: "Communication not found.",
        });
      }

      res.sendStatus(200);
    }
  );
});

/**
 * Helper function to check if customer has consent for communication
 *
 * @param {Object} preferences Customer preferences object
 * @param {string} channel Communication channel
 * @param {string} type Communication type
 * @returns {boolean} Whether customer has consent
 */
function hasConsent(preferences, channel, type) {
  if (!preferences || !preferences.channels) {
    return true; // Default to true if no preferences set
  }

  const channelPreferences = preferences.channels[channel];
  if (!channelPreferences || !channelPreferences.enabled) {
    return false;
  }

  // Check consent based on type category
  const category = getCategoryForType(type);
  if (category === "TRANSACTIONAL") {
    return channelPreferences.consent && channelPreferences.consent.transactional !== false;
  } else if (category === "PROMOTIONAL") {
    return channelPreferences.consent && channelPreferences.consent.marketing !== false;
  } else if (category === "APPOINTMENT") {
    return channelPreferences.consent && channelPreferences.consent.appointment !== false;
  } else if (category === "PRESCRIPTION") {
    return channelPreferences.consent && channelPreferences.consent.prescription !== false;
  }

  return true;
}

/**
 * Helper function to get recipient address for channel
 *
 * @param {Object} customer Customer object
 * @param {string} channel Communication channel
 * @returns {string|null} Recipient address or null if not available
 */
function getRecipientForChannel(customer, channel) {
  switch (channel) {
    case "sms":
    case "whatsapp":
      return customer.phone || customer.mobile || null;
    case "email":
      return customer.email || null;
    case "in_app":
      return customer._id; // Use customer ID for in-app messages
    case "push":
      return customer.deviceToken || null;
    default:
      return null;
  }
}

/**
 * Helper function to get category for communication type
 *
 * @param {string} type Communication type
 * @returns {string} Category
 */
function getCategoryForType(type) {
  if (type.includes("APPOINTMENT")) {
    return "APPOINTMENT";
  } else if (type.includes("PRESCRIPTION")) {
    return "PRESCRIPTION";
  } else if (type.includes("PROMOTIONAL")) {
    return "PROMOTIONAL";
  } else if (type.includes("TRANSACTIONAL")) {
    return "TRANSACTIONAL";
  } else {
    return "INFORMATIONAL";
  }
}

/**
 * Helper function to add communication to message queue
 *
 * @param {Object} communication Communication object
 * @returns {void}
 */
function addToMessageQueue(communication) {
  const messageQueueDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "message-queue.db",
  );
  
  const messageQueueDB = new Datastore({
    filename: messageQueueDbPath,
    autoload: true,
  });

  const queueItem = {
    _id: "MSG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
    communicationId: communication._id,
    customerId: communication.customerId,
    channel: communication.channel,
    type: communication.type,
    priority: communication.priority,
    recipient: communication.recipient,
    subject: communication.subject,
    content: communication.content,
    attachments: communication.attachments,
    templateId: communication.templateId,
    personalizationData: communication.personalizationData,
    scheduledAt: communication.scheduledAt,
    status: "PENDING",
    retryCount: 0,
    maxRetries: communication.maxRetries,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  messageQueueDB.insert(queueItem, function (err, newItem) {
    if (err) {
      console.error("Error adding to message queue:", err);
    } else {
      console.log(`Added to message queue: ${newItem._id}`);
    }
  });
}