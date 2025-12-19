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
  "communications.db",
);

router.use(bodyParser.json());

module.exports = router;

let communicationsDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

communicationsDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Communication API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
  res.send("Communication API");
});

/**
 * GET endpoint: Get all communications.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  
  communicationsDB.find({})
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
      
      communicationsDB.count({}, function (err, count) {
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
 * GET endpoint: Get communications by transaction ID.
 *
 * @param {Object} req request object with transaction ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/transaction/:transactionId", function (req, res) {
  if (!req.params.transactionId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Transaction ID is required.",
    });
  }

  communicationsDB.find(
    { transactionId: req.params.transactionId },
    function (err, docs) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }
      res.json(docs);
    }
  );
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
 * POST endpoint: Send WhatsApp message (simulation mode).
 *
 * @param {Object} req request object with WhatsApp message data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/whatsapp", function (req, res) {
  if (!req.body.customerId || !req.body.transactionId || !req.body.phoneNumber) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID, transaction ID, and phone number are required.",
    });
  }

  const communication = {
    _id: Math.floor(Date.now() / 1000) + Math.random(),
    type: "whatsapp",
    customerId: req.body.customerId,
    transactionId: req.body.transactionId,
    recipient: req.body.phoneNumber,
    message: req.body.message || "Your invoice has been generated and is available for download.",
    templateId: req.body.templateId || null,
    status: "sent", // In simulation mode, we mark as sent immediately
    sentAt: new Date(),
    deliveredAt: new Date(), // Simulated immediate delivery
    readAt: null,
    errorMessage: null,
    retryCount: 0,
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

    // Log the simulated WhatsApp message
    console.log(`[SIMULATION] WhatsApp message sent to ${req.body.phoneNumber}:`, req.body.message);
    console.log(`[SIMULATION] Transaction ID: ${req.body.transactionId}, Customer ID: ${req.body.customerId}`);

    res.status(201).json(newCommunication);
  });
});

/**
 * POST endpoint: Send SMS message (simulation mode).
 *
 * @param {Object} req request object with SMS message data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/sms", function (req, res) {
  if (!req.body.customerId || !req.body.transactionId || !req.body.phoneNumber) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID, transaction ID, and phone number are required.",
    });
  }

  const communication = {
    _id: Math.floor(Date.now() / 1000) + Math.random(),
    type: "sms",
    customerId: req.body.customerId,
    transactionId: req.body.transactionId,
    recipient: req.body.phoneNumber,
    message: req.body.message || "Your invoice has been generated. Thank you for your purchase!",
    templateId: req.body.templateId || null,
    status: "sent", // In simulation mode, we mark as sent immediately
    sentAt: new Date(),
    deliveredAt: new Date(), // Simulated immediate delivery
    readAt: null,
    errorMessage: null,
    retryCount: 0,
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

    // Log the simulated SMS message
    console.log(`[SIMULATION] SMS message sent to ${req.body.phoneNumber}:`, req.body.message);
    console.log(`[SIMULATION] Transaction ID: ${req.body.transactionId}, Customer ID: ${req.body.customerId}`);

    res.status(201).json(newCommunication);
  });
});

/**
 * POST endpoint: Send email with PDF attachment.
 *
 * @param {Object} req request object with email data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/email", function (req, res) {
  if (!req.body.customerId || !req.body.transactionId || !req.body.emailAddress) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID, transaction ID, and email address are required.",
    });
  }

  const communication = {
    _id: Math.floor(Date.now() / 1000) + Math.random(),
    type: "email",
    customerId: req.body.customerId,
    transactionId: req.body.transactionId,
    recipient: req.body.emailAddress,
    subject: req.body.subject || "Your Invoice from PharmaSpot",
    message: req.body.message || "Please find your invoice attached to this email.",
    attachmentPath: req.body.attachmentPath || null,
    templateId: req.body.templateId || null,
    status: "sent", // In simulation mode, we mark as sent immediately
    sentAt: new Date(),
    deliveredAt: new Date(), // Simulated immediate delivery
    readAt: null,
    errorMessage: null,
    retryCount: 0,
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

    // Log the simulated email
    console.log(`[SIMULATION] Email sent to ${req.body.emailAddress}:`);
    console.log(`[SIMULATION] Subject: ${req.body.subject || "Your Invoice from PharmaSpot"}`);
    console.log(`[SIMULATION] Transaction ID: ${req.body.transactionId}, Customer ID: ${req.body.customerId}`);
    if (req.body.attachmentPath) {
      console.log(`[SIMULATION] Attachment: ${req.body.attachmentPath}`);
    }

    res.status(201).json(newCommunication);
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

  const validStatuses = ["pending", "sent", "delivered", "read", "failed"];
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
  if (req.body.status === "delivered") {
    updateData.deliveredAt = new Date();
  } else if (req.body.status === "read") {
    updateData.readAt = new Date();
  } else if (req.body.status === "failed" && req.body.errorMessage) {
    updateData.errorMessage = req.body.errorMessage;
    updateData.retryCount = req.body.retryCount || 0;
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
      total: communications.length,
      byType: {
        whatsapp: communications.filter(c => c.type === "whatsapp").length,
        sms: communications.filter(c => c.type === "sms").length,
        email: communications.filter(c => c.type === "email").length
      },
      byStatus: {
        pending: communications.filter(c => c.status === "pending").length,
        sent: communications.filter(c => c.status === "sent").length,
        delivered: communications.filter(c => c.status === "delivered").length,
        read: communications.filter(c => c.status === "read").length,
        failed: communications.filter(c => c.status === "failed").length
      },
      deliveryRate: 0,
      readRate: 0
    };

    // Calculate rates
    const sentCommunications = communications.filter(c => c.status === "sent" || c.status === "delivered" || c.status === "read");
    if (sentCommunications.length > 0) {
      analytics.deliveryRate = ((communications.filter(c => c.status === "delivered" || c.status === "read").length / sentCommunications.length) * 100).toFixed(2);
      analytics.readRate = ((communications.filter(c => c.status === "read").length / sentCommunications.length) * 100).toFixed(2);
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