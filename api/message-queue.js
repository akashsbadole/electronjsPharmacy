const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const dbUtils = require('./db-utils');
const dbManager = require('./db-manager');

router.use(bodyParser.json());

module.exports = router;

// Database instance - will be initialized asynchronously
let messageQueueDB;

/**
 * Initialize database asynchronously
 */
async function initializeDatabase() {
    try {
        console.log("Initializing message queue API database...");
        messageQueueDB = await dbManager.getDatabase("message-queue.db");
        
        // Ensure index is created
        messageQueueDB.ensureIndex({ fieldName: "_id", unique: true });
        
        console.log("Message queue API database initialized successfully");
    } catch (error) {
        console.error("Failed to initialize message queue API database:", error);
        throw error;
    }
}

// Initialize database immediately
initializeDatabase().catch(err => {
    console.error("Database initialization failed in message-queue module:", err);
});

// Queue processor instance
let queueProcessor = null;
let isProcessing = false;

/**
 * GET endpoint: Get welcome message for Message Queue API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
    res.send("Message Queue API");
});

/**
 * GET endpoint: Get all queued messages with optional filtering.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    // Build filter object
    let filter = {};
    if (req.query.status) {
        filter.status = req.query.status;
    }
    if (req.query.channel) {
        filter.channel = req.query.channel;
    }
    if (req.query.priority) {
        filter.priority = parseInt(req.query.priority);
    }

    messageQueueDB.find(filter)
        .sort({ priority: -1, scheduledAt: 1 })
        .skip(skip)
        .limit(limit)
        .exec(function (err, docs) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }
            
            messageQueueDB.count(filter, function (err, count) {
                if (err) {
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }
                
                res.json({
                    messages: docs,
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
 * GET endpoint: Get message by ID.
 *
 * @param {Object} req request object with message ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:messageId", function (req, res) {
    if (!req.params.messageId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Message ID is required.",
        });
    }

    messageQueueDB.findOne({ _id: req.params.messageId }, function (err, message) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        if (!message) {
            return res.status(404).json({
                error: "Not Found",
                message: "Message not found.",
            });
        }

        res.json(message);
    });
});

/**
 * POST endpoint: Add a message to the queue.
 *
 * @param {Object} req request object with message data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/enqueue", function (req, res) {
    if (!req.body.customerId || !req.body.channel || !req.body.content) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID, channel, and content are required.",
        });
    }

    const validChannels = ["sms", "email", "whatsapp", "in_app", "push"];
    if (!validChannels.includes(req.body.channel)) {
        return res.status(400).json({
            error: "Bad Request",
            message: `Invalid channel. Must be one of: ${validChannels.join(", ")}`,
        });
    }

    const message = {
        _id: "MSG-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
        communicationId: req.body.communicationId || null,
        customerId: req.body.customerId,
        channel: req.body.channel,
        type: req.body.type || "TRANSACTIONAL",
        priority: req.body.priority || 1,
        recipient: req.body.recipient,
        subject: req.body.subject || null,
        content: req.body.content,
        attachments: req.body.attachments || [],
        templateId: req.body.templateId || null,
        personalizationData: req.body.personalizationData || {},
        scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date(),
        sendAfter: req.body.sendAfter ? new Date(req.body.sendAfter) : null,
        status: "PENDING",
        processingStartedAt: null,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        failedAt: null,
        retryCount: 0,
        maxRetries: req.body.maxRetries || 3,
        retryDelayMinutes: req.body.retryDelayMinutes || 5,
        nextRetryAt: null,
        errorMessage: null,
        errorCode: null,
        provider: null,
        providerMessageId: null,
        providerResponse: null,
        cost: 0,
        currency: "USD",
        campaignId: req.body.campaignId || null,
        transactionId: req.body.transactionId || null,
        prescriptionId: req.body.prescriptionId || null,
        appointmentId: req.body.appointmentId || null,
        createdAt: new Date(),
        updatedAt: new Date()
    };

    messageQueueDB.insert(message, function (err, newMessage) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        res.status(201).json({
            success: true,
            messageId: newMessage._id,
            status: newMessage.status,
            scheduledAt: newMessage.scheduledAt
        });
    });
});

/**
 * PUT endpoint: Update message status.
 *
 * @param {Object} req request object with message ID and status update in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:messageId/status", function (req, res) {
    if (!req.params.messageId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Message ID is required.",
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
    if (req.body.status === "PROCESSING") {
        updateData.processingStartedAt = new Date();
    } else if (req.body.status === "SENT") {
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
        if (req.body.errorCode) {
            updateData.errorCode = req.body.errorCode;
        }
    }

    // Update additional fields if provided
    if (req.body.providerMessageId) {
        updateData.providerMessageId = req.body.providerMessageId;
    }
    if (req.body.provider) {
        updateData.provider = req.body.provider;
    }
    if (req.body.providerResponse) {
        updateData.providerResponse = req.body.providerResponse;
    }
    if (req.body.cost) {
        updateData.cost = req.body.cost;
    }
    if (req.body.retryCount !== undefined) {
        updateData.retryCount = req.body.retryCount;
    }
    if (req.body.nextRetryAt) {
        updateData.nextRetryAt = new Date(req.body.nextRetryAt);
    }

    messageQueueDB.update(
        { _id: req.params.messageId },
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
                    message: "Message not found.",
                });
            }

            res.sendStatus(200);
        }
    );
});

/**
 * POST endpoint: Process pending messages.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/process", function (req, res) {
    if (isProcessing) {
        return res.status(409).json({
            error: "Conflict",
            message: "Queue processing is already in progress.",
        });
    }

    startQueueProcessor();

    res.json({
        success: true,
        message: "Queue processing started"
    });
});

/**
 * POST endpoint: Retry failed messages.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/retry-failed", function (req, res) {
    messageQueueDB.update(
        { 
            status: "FAILED",
            retryCount: { $lt: req.body.maxRetries || 3 }
        },
        { 
            $set: { 
                status: "PENDING",
                nextRetryAt: new Date(),
                updatedAt: new Date()
            }
        },
        { multi: true },
        function (err, numReplaced) {
            if (err) {
                return res.status(500).json({
                    error: "Internal Server Error",
                    message: "An unexpected error occurred.",
                });
            }

            res.json({
                success: true,
                message: `${numReplaced} failed messages queued for retry`
            });
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
    messageQueueDB.find({}, function (err, messages) {
        if (err) {
            return res.status(500).json({
                error: "Internal Server Error",
                message: "An unexpected error occurred.",
            });
        }

        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const statistics = {
            total: messages.length,
            byStatus: {
                pending: messages.filter(m => m.status === "PENDING").length,
                processing: messages.filter(m => m.status === "PROCESSING").length,
                sent: messages.filter(m => m.status === "SENT").length,
                delivered: messages.filter(m => m.status === "DELIVERED").length,
                read: messages.filter(m => m.status === "READ").length,
                failed: messages.filter(m => m.status === "FAILED").length
            },
            byChannel: {
                sms: messages.filter(m => m.channel === "sms").length,
                email: messages.filter(m => m.channel === "email").length,
                whatsapp: messages.filter(m => m.channel === "whatsapp").length,
                in_app: messages.filter(m => m.channel === "in_app").length,
                push: messages.filter(m => m.channel === "push").length
            },
            byPriority: {
                high: messages.filter(m => m.priority === 3).length,
                normal: messages.filter(m => m.priority === 2).length,
                low: messages.filter(m => m.priority === 1).length
            },
            timeStats: {
                lastHour: messages.filter(m => m.createdAt >= oneHourAgo).length,
                lastDay: messages.filter(m => m.createdAt >= oneDayAgo).length,
                overdue: messages.filter(m => m.status === "PENDING" && m.scheduledAt < now).length
            },
            isProcessing: isProcessing
        };

        res.json(statistics);
    });
});

/**
 * DELETE endpoint: Delete a message by ID.
 *
 * @param {Object} req request object with message ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/:messageId", function (req, res) {
    if (!req.params.messageId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Message ID is required.",
        });
    }

    messageQueueDB.remove(
        { _id: req.params.messageId },
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
                    message: "Message not found.",
                });
            }

            res.sendStatus(200);
        }
    );
});

/**
 * Start queue processor
 *
 * @returns {Promise<void>}
 */
async function startQueueProcessor() {
    if (isProcessing) {
        return;
    }

    // Wait for database to be initialized
    if (!messageQueueDB) {
        console.log("Waiting for message queue database to initialize...");
        try {
            await initializeDatabase();
        } catch (error) {
            console.error("Failed to initialize message queue database:", error);
            return;
        }
    }

    isProcessing = true;
    console.log("Starting message queue processor");

    // Process queue every 30 seconds
    queueProcessor = setInterval(processQueue, 30000);
    
    // Process immediately once
    processQueue();
}

/**
 * Stop the queue processor
 *
 * @returns {void}
 */
function stopQueueProcessor() {
    if (queueProcessor) {
        clearInterval(queueProcessor);
        queueProcessor = null;
    }
    isProcessing = false;
    console.log("Stopped message queue processor");
}

/**
 * Process message queue
 *
 * @returns {void}
 */
function processQueue() {
    // Check if database is initialized
    if (!messageQueueDB) {
        console.error("Message queue database not initialized. Skipping queue processing.");
        return;
    }

    const now = new Date();

    // Get pending messages that are ready to be sent
    messageQueueDB.find({
        status: "PENDING",
        $or: [
            { scheduledAt: { $lte: now } },
            { sendAfter: { $lte: now } }
        ]
    })
    .sort({ priority: -1, scheduledAt: 1 })
    .limit(10) // Process max 10 messages at a time
    .exec(function (err, messages) {
        if (err) {
            console.error("Error fetching messages from queue:", err);
            return;
        }

        if (messages.length === 0) {
            return;
        }

        console.log(`Processing ${messages.length} messages from queue`);

        messages.forEach(message => {
            processMessage(message);
        });
    });
}

/**
 * Process a single message
 *
 * @param {Object} message Message object
 * @returns {void}
 */
function processMessage(message) {
    // Update status to processing
    messageQueueDB.update(
        { _id: message._id },
        { 
            $set: {
                status: "PROCESSING",
                processingStartedAt: new Date(),
                updatedAt: new Date()
            }
        },
        {},
        function (err) {
            if (err) {
                console.error(`Error updating message ${message._id} to processing:`, err);
                return;
            }

            // Get appropriate channel adapter
            const adapter = getChannelAdapter(message.channel);
            
            if (!adapter) {
                console.error(`No adapter found for channel: ${message.channel}`);
                markMessageFailed(message._id, "No adapter found for channel", "NO_ADAPTER");
                return;
            }

            // Send message
            adapter.sendMessage(message, function (error, result) {
                if (error) {
                    console.error(`Error sending message ${message._id}:`, error);
                    markMessageFailed(message._id, error.message, "SEND_ERROR");
                    scheduleRetry(message);
                    return;
                }

                // Update message with result
                const updateData = {
                    status: "SENT",
                    sentAt: new Date(),
                    updatedAt: new Date()
                };

                if (result.messageId) {
                    updateData.providerMessageId = result.messageId;
                }
                if (result.provider) {
                    updateData.provider = result.provider;
                }
                if (result.cost) {
                    updateData.cost = result.cost;
                }
                if (result.response) {
                    updateData.providerResponse = result.response;
                }

                messageQueueDB.update(
                    { _id: message._id },
                    { $set: updateData },
                    {},
                    function (err) {
                        if (err) {
                            console.error(`Error updating message ${message._id} to sent:`, err);
                        } else {
                            console.log(`Message ${message._id} sent successfully`);
                            
                            // Update communication status
                            updateCommunicationStatus(message.communicationId, "SENT", {
                                providerMessageId: result.messageId,
                                provider: result.provider,
                                cost: result.cost
                            });
                        }
                    }
                );
            });
        }
    );
}

/**
 * Mark a message as failed
 *
 * @param {string} messageId Message ID
 * @param {string} errorMessage Error message
 * @param {string} errorCode Error code
 * @returns {void}
 */
function markMessageFailed(messageId, errorMessage, errorCode) {
    messageQueueDB.update(
        { _id: messageId },
        { 
            $set: {
                status: "FAILED",
                failedAt: new Date(),
                errorMessage: errorMessage,
                errorCode: errorCode,
                updatedAt: new Date()
            }
        },
        {},
        function (err) {
            if (err) {
                console.error(`Error marking message ${messageId} as failed:`, err);
            }
        }
    );
}

/**
 * Schedule a retry for a failed message
 *
 * @param {Object} message Message object
 * @returns {void}
 */
function scheduleRetry(message) {
    if (message.retryCount >= message.maxRetries) {
        console.log(`Message ${message._id} has reached max retries, not scheduling retry`);
        return;
    }

    const nextRetryTime = new Date(Date.now() + (message.retryDelayMinutes * 60 * 1000 * Math.pow(2, message.retryCount)));
    
    messageQueueDB.update(
        { _id: message._id },
        { 
            $set: {
                status: "PENDING",
                retryCount: message.retryCount + 1,
                nextRetryAt: nextRetryTime,
                updatedAt: new Date()
            }
        },
        {},
        function (err) {
            if (err) {
                console.error(`Error scheduling retry for message ${message._id}:`, err);
            } else {
                console.log(`Scheduled retry ${message.retryCount + 1} for message ${message._id} at ${nextRetryTime}`);
            }
        }
    );
}

/**
 * Get channel adapter for sending messages
 *
 * @param {string} channel Channel name
 * @returns {Object|null} Channel adapter or null
 */
function getChannelAdapter(channel) {
    switch (channel) {
        case "sms":
            return new SMSAdapter();
        case "email":
            return new EmailAdapter();
        case "whatsapp":
            return new WhatsAppAdapter();
        case "in_app":
            return new InAppAdapter();
        case "push":
            return new PushAdapter();
        default:
            return null;
    }
}

/**
 * Update communication status
 *
 * @param {string} communicationId Communication ID
 * @param {string} status New status
 * @param {Object} additionalData Additional data to update
 * @returns {void}
 */
async function updateCommunicationStatus(communicationId, status, additionalData) {
    if (!communicationId) {
        return;
    }

    try {
        const communicationsDB = await dbManager.getDatabase("customer-communications.db");

        const updateData = {
            status: status,
            updatedAt: new Date()
        };

        if (status === "SENT") {
            updateData.sentAt = new Date();
        }

        // Merge additional data
        Object.assign(updateData, additionalData);


        communicationsDB.update(
            { _id: communicationId },
            { $set: updateData },
            {},
            function (err) {
                if (err) {
                    console.error(`Error updating communication ${communicationId}:`, err);
                }
            }
        );
    } catch (error) {
        console.error(`Error in updateCommunicationStatus:`, error);
    }
}


// Channel Adapter Classes (Simulation Mode)

class SMSAdapter {
    sendMessage(message, callback) {
        console.log(`[SMS SIMULATION] Sending to ${message.recipient}:`, message.content);
        
        // Simulate sending delay
        setTimeout(() => {
            callback(null, {
                messageId: "SMS_" + Date.now(),
                provider: "simulation",
                cost: 0.05,
                response: "SMS sent successfully (simulation)"
            });
        }, 1000);
    }
}

class EmailAdapter {
    sendMessage(message, callback) {
        console.log(`[EMAIL SIMULATION] Sending to ${message.recipient}:`, message.subject);
        
        // Use existing email service
        const emailService = require("./email-service");
        
        const emailOptions = {
            to: message.recipient,
            subject: message.subject,
            text: message.content,
            html: message.content
        };

        emailService.sendEmailWithPDF(emailOptions, callback);
    }
}

class WhatsAppAdapter {
    sendMessage(message, callback) {
        console.log(`[WHATSAPP SIMULATION] Sending to ${message.recipient}:`, message.content);
        
        // Simulate sending delay
        setTimeout(() => {
            callback(null, {
                messageId: "WA_" + Date.now(),
                provider: "simulation",
                cost: 0.08,
                response: "WhatsApp message sent successfully (simulation)"
            });
        }, 1500);
    }
}

class InAppAdapter {
    sendMessage(message, callback) {
        console.log(`[IN-APP SIMULATION] Sending to user ${message.recipient}:`, message.content);
        
        // Simulate sending delay
        setTimeout(() => {
            callback(null, {
                messageId: "APP_" + Date.now(),
                provider: "in_app",
                cost: 0,
                response: "In-app message sent successfully"
            });
        }, 500);
    }
}

class PushAdapter {
    sendMessage(message, callback) {
        console.log(`[PUSH SIMULATION] Sending to device ${message.recipient}:`, message.content);
        
        // Simulate sending delay
        setTimeout(() => {
            callback(null, {
                messageId: "PUSH_" + Date.now(),
                provider: "simulation",
                cost: 0.005,
                response: "Push notification sent successfully (simulation)"
            });
        }, 800);
    }
}

// Auto-start the queue processor
initializeDatabase().then(() => {
    startQueueProcessor();
}).catch(err => {
    console.error("Failed to initialize database before starting queue processor:", err);
});

router.startQueueProcessor = startQueueProcessor;
router.stopQueueProcessor = stopQueueProcessor;

module.exports = router;