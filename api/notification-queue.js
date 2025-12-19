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
  "notification-queue.db",
);

router.use(bodyParser.json());

module.exports = router;

let notificationQueueDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

notificationQueueDB.ensureIndex({ fieldName: "_id", unique: true });

// Queue processor interval (in milliseconds)
const QUEUE_PROCESS_INTERVAL = 30000; // 30 seconds
let queueProcessor = null;

/**
 * GET endpoint: Get the welcome message for the Notification Queue API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
  res.send("Notification Queue API");
});

/**
 * GET endpoint: Get all notifications in the queue.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const status = req.query.status || null;
  
  let query = {};
  if (status) {
    query.status = status;
  }
  
  notificationQueueDB.find(query)
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
      
      notificationQueueDB.count(query, function (err, count) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }
        
        res.json({
          notifications: docs,
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
 * POST endpoint: Add a notification to the queue.
 *
 * @param {Object} req request object with notification data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/add", function (req, res) {
  if (!req.body.type || !req.body.recipient || !req.body.customerId || !req.body.transactionId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Type, recipient, customer ID, and transaction ID are required.",
    });
  }

  const validTypes = ["whatsapp", "sms", "email"];
  if (!validTypes.includes(req.body.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  const notification = {
    _id: Math.floor(Date.now() / 1000) + Math.random(),
    type: req.body.type,
    recipient: req.body.recipient,
    customerId: req.body.customerId,
    transactionId: req.body.transactionId,
    subject: req.body.subject || null,
    message: req.body.message || "",
    attachmentPath: req.body.attachmentPath || null,
    templateId: req.body.templateId || null,
    templateData: req.body.templateData || {},
    priority: req.body.priority || "normal", // low, normal, high
    status: "pending", // pending, processing, sent, failed
    scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date(),
    retryCount: 0,
    maxRetries: req.body.maxRetries || 3,
    retryDelay: req.body.retryDelay || 60000, // 1 minute default
    errorMessage: null,
    lastAttemptAt: null,
    sentAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  notificationQueueDB.insert(notification, function (err, newNotification) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    res.status(201).json(newNotification);
  });
});

/**
 * PUT endpoint: Update notification status.
 *
 * @param {Object} req request object with notification ID and status update in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:notificationId/status", function (req, res) {
  if (!req.params.notificationId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Notification ID is required.",
    });
  }

  if (!req.body.status) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Status is required.",
    });
  }

  const validStatuses = ["pending", "processing", "sent", "failed"];
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
  if (req.body.status === "processing") {
    updateData.lastAttemptAt = new Date();
  } else if (req.body.status === "sent") {
    updateData.sentAt = new Date();
  } else if (req.body.status === "failed") {
    updateData.errorMessage = req.body.errorMessage || null;
    updateData.retryCount = req.body.retryCount || 0;
  }

  notificationQueueDB.update(
    { _id: req.params.notificationId },
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
          message: "Notification not found.",
        });
      }

      res.sendStatus(200);
    }
  );
});

/**
 * POST endpoint: Process the notification queue.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/process", function (req, res) {
  processQueue(function (err, results) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    res.json({
      message: "Queue processing completed.",
      results: results
    });
  });
});

/**
 * POST endpoint: Start the automatic queue processor.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/start-processor", function (req, res) {
  if (queueProcessor) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Queue processor is already running.",
    });
  }

  const interval = req.body.interval || QUEUE_PROCESS_INTERVAL;
  
  queueProcessor = setInterval(function () {
    processQueue(function (err, results) {
      if (err) {
        console.error("Error processing queue:", err);
      } else {
        console.log(`Queue processed: ${results.processed} notifications, ${results.sent} sent, ${results.failed} failed`);
      }
    });
  }, interval);

  res.json({
    message: "Queue processor started.",
    interval: interval
  });
});

/**
 * POST endpoint: Stop the automatic queue processor.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/stop-processor", function (req, res) {
  if (!queueProcessor) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Queue processor is not running.",
    });
  }

  clearInterval(queueProcessor);
  queueProcessor = null;

  res.json({
    message: "Queue processor stopped."
  });
});

/**
 * GET endpoint: Get queue processor status.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/processor-status", function (req, res) {
  res.json({
    isRunning: queueProcessor !== null,
    interval: queueProcessor ? QUEUE_PROCESS_INTERVAL : null
  });
});

/**
 * DELETE endpoint: Remove a notification from the queue.
 *
 * @param {Object} req request object with notification ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:notificationId", function (req, res) {
  if (!req.params.notificationId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Notification ID is required.",
    });
  }

  notificationQueueDB.remove(
    { _id: req.params.notificationId },
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
          message: "Notification not found.",
        });
      }

      res.sendStatus(200);
    }
  );
});

/**
 * GET endpoint: Get queue statistics.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/statistics", function (req, res) {
  notificationQueueDB.find({}, function (err, notifications) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    const statistics = {
      total: notifications.length,
      byStatus: {
        pending: notifications.filter(n => n.status === "pending").length,
        processing: notifications.filter(n => n.status === "processing").length,
        sent: notifications.filter(n => n.status === "sent").length,
        failed: notifications.filter(n => n.status === "failed").length
      },
      byType: {
        whatsapp: notifications.filter(n => n.type === "whatsapp").length,
        sms: notifications.filter(n => n.type === "sms").length,
        email: notifications.filter(n => n.type === "email").length
      },
      byPriority: {
        low: notifications.filter(n => n.priority === "low").length,
        normal: notifications.filter(n => n.priority === "normal").length,
        high: notifications.filter(n => n.priority === "high").length
      }
    };

    res.json(statistics);
  });
});

/**
 * Helper function to process the notification queue.
 *
 * @param {function} callback callback function
 * @returns {void}
 */
function processQueue(callback) {
  const now = new Date();
  
  // Find pending notifications that are scheduled to be sent
  notificationQueueDB.find({
    status: "pending",
    scheduledAt: { $lte: now }
  }, function (err, notifications) {
    if (err) {
      return callback(err);
    }

    if (notifications.length === 0) {
      return callback(null, {
        processed: 0,
        sent: 0,
        failed: 0
      });
    }

    // Sort by priority (high first) and then by creation date (older first)
    notifications.sort(function (a, b) {
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }
      return new Date(a.createdAt) - new Date(b.createdAt);
    });

    let processed = 0;
    let sent = 0;
    let failed = 0;

    // Process notifications one by one
    async.eachSeries(notifications, function (notification, next) {
      // Mark as processing
      notificationQueueDB.update(
        { _id: notification._id },
        { $set: { status: "processing", lastAttemptAt: new Date(), updatedAt: new Date() } },
        {},
        function (err) {
          if (err) {
            return next(err);
          }

          // Process the notification based on type
          processNotification(notification, function (err, success) {
            processed++;

            if (err || !success) {
              failed++;
              
              // Check if we should retry
              if (notification.retryCount < notification.maxRetries) {
                const newRetryCount = notification.retryCount + 1;
                const retryAt = new Date(Date.now() + notification.retryDelay);
                
                notificationQueueDB.update(
                  { _id: notification._id },
                  { 
                    $set: { 
                      status: "pending", 
                      retryCount: newRetryCount,
                      scheduledAt: retryAt,
                      errorMessage: err ? err.message : "Unknown error",
                      updatedAt: new Date()
                    }
                  },
                  {},
                  function (updateErr) {
                    if (updateErr) {
                      console.error("Error updating notification for retry:", updateErr);
                    }
                    next();
                  }
                );
              } else {
                // Max retries reached, mark as failed
                notificationQueueDB.update(
                  { _id: notification._id },
                  { 
                    $set: { 
                      status: "failed", 
                      errorMessage: err ? err.message : "Max retries reached",
                      updatedAt: new Date()
                    }
                  },
                  {},
                  function (updateErr) {
                    if (updateErr) {
                      console.error("Error updating notification as failed:", updateErr);
                    }
                    next();
                  }
                );
              }
            } else {
              sent++;
              
              // Mark as sent
              notificationQueueDB.update(
                { _id: notification._id },
                { $set: { status: "sent", sentAt: new Date(), updatedAt: new Date() } },
                {},
                function (updateErr) {
                  if (updateErr) {
                    console.error("Error updating notification as sent:", updateErr);
                  }
                  next();
                }
              );
            }
          });
        }
      );
    }, function (err) {
      if (err) {
        return callback(err);
      }

      callback(null, {
        processed: processed,
        sent: sent,
        failed: failed
      });
    });
  });
}

/**
 * Helper function to process a single notification.
 *
 * @param {Object} notification notification object
 * @param {function} callback callback function
 * @returns {void}
 */
function processNotification(notification, callback) {
  // Get the appropriate communication API based on type
  let communicationAPI;
  
  try {
    switch (notification.type) {
      case "whatsapp":
        communicationAPI = require("./communication");
        break;
      case "sms":
        communicationAPI = require("./communication");
        break;
      case "email":
        communicationAPI = require("./communication");
        break;
      default:
        return callback(new Error(`Unknown notification type: ${notification.type}`));
    }

    // Prepare the request data
    let requestData = {
      customerId: notification.customerId,
      transactionId: notification.transactionId,
      templateId: notification.templateId
    };

    // Add type-specific data
    switch (notification.type) {
      case "whatsapp":
        requestData.phoneNumber = notification.recipient;
        requestData.message = notification.message;
        break;
      case "sms":
        requestData.phoneNumber = notification.recipient;
        requestData.message = notification.message;
        break;
      case "email":
        requestData.emailAddress = notification.recipient;
        requestData.subject = notification.subject;
        requestData.message = notification.message;
        requestData.attachmentPath = notification.attachmentPath;
        break;
    }

    // Simulate sending the notification
    console.log(`[NOTIFICATION] Processing ${notification.type} notification to ${notification.recipient}`);
    
    // In a real implementation, this would make an actual API call
    // For now, we simulate success
    setTimeout(function () {
      callback(null, true);
    }, 1000);

  } catch (error) {
    callback(error);
  }
}