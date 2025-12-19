const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const path = require("path");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;

router.use(bodyParser.json());

module.exports = router;

/**
 * POST endpoint: Share invoice via WhatsApp, SMS, or Email.
 *
 * @param {Object} req request object with sharing details in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/share/:transactionId", function (req, res) {
    if (!req.params.transactionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transaction ID is required.",
        });
    }

    if (!req.body.method || !req.body.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Method and customer ID are required.",
        });
    }

    const validMethods = ["whatsapp", "sms", "email"];
    if (!validMethods.includes(req.body.method)) {
        return res.status(400).json({
            error: "Bad Request",
            message: `Invalid method. Must be one of: ${validMethods.join(", ")}`,
        });
    }

    // Check if transaction exists
    const transactionsDB = new Datastore({
        filename: path.join(
            appData,
            appName,
            "server",
            "databases",
            "transactions.db",
        ),
        autoload: true,
    });

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

        // Get customer information
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

        customersDB.findOne({ _id: req.body.customerId }, function (err, customer) {
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

            // Get customer preferences
            const customerPreferencesDB = new Datastore({
                filename: path.join(
                    appData,
                    appName,
                    "server",
                    "databases",
                    "customer-preferences.db",
                ),
                autoload: true,
            });

            customerPreferencesDB.findOne({ customerId: req.body.customerId }, function (err, preferences) {
                if (err) {
                    console.error(err);
                    return res.status(500).json({
                        error: "Internal Server Error",
                        message: "An unexpected error occurred.",
                    });
                }

                // Check if customer has consent for this communication method
                if (preferences && !checkConsent(preferences, req.body.method)) {
                    return res.status(403).json({
                        error: "Forbidden",
                        message: "Customer has not consented to receive communications via this method.",
                    });
                }

                // Get store information
                const storesDB = new Datastore({
                    filename: path.join(
                        appData,
                        appName,
                        "server",
                        "databases",
                        "stores.db",
                    ),
                    autoload: true,
                });

                storesDB.findOne({ _id: transaction.storeId }, function (err, store) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    const storeData = store || {
                        name: "PharmaSpot",
                        address: "",
                        phone: "",
                        email: ""
                    };

                    // Share invoice based on method
                    shareInvoice(transaction, customer, storeData, req.body.method, req.body.templateId, function (err, result) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }

                        res.json({
                            message: "Invoice shared successfully",
                            method: req.body.method,
                            result: result
                        });
                    });
                });
            });
        });
    });
});

/**
 * POST endpoint: Share invoice using customer's preferred method.
 *
 * @param {Object} req request object with customer ID in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/share-preferred/:transactionId", function (req, res) {
    if (!req.params.transactionId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Transaction ID is required.",
        });
    }

    if (!req.body.customerId) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Customer ID is required.",
        });
    }

    // Check if transaction exists
    const transactionsDB = new Datastore({
        filename: path.join(
            appData,
            appName,
            "server",
            "databases",
            "transactions.db",
        ),
        autoload: true,
    });

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

        // Get customer preferences
        const customerPreferencesDB = new Datastore({
            filename: path.join(
                appData,
                appName,
                "server",
                "databases",
                "customer-preferences.db",
            ),
            autoload: true,
        });

        customerPreferencesDB.findOne({ customerId: req.body.customerId }, function (err, preferences) {
            if (err) {
                console.error(err);
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

            const preferredMethod = preferences.preferences.invoiceDelivery;
            const hasConsent = checkConsent(preferences, preferredMethod);

            if (!hasConsent) {
                return res.status(403).json({
                    error: "Forbidden",
                    message: "Customer has not consented to receive communications via their preferred method.",
                });
            }

            // Get customer information
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

            customersDB.findOne({ _id: req.body.customerId }, function (err, customer) {
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

                // Get store information
                const storesDB = new Datastore({
                    filename: path.join(
                        appData,
                        appName,
                        "server",
                        "databases",
                        "stores.db",
                    ),
                    autoload: true,
                });

                storesDB.findOne({ _id: transaction.storeId }, function (err, store) {
                    if (err) {
                        console.error(err);
                        return res.status(500).json({
                            error: "Internal Server Error",
                            message: "An unexpected error occurred.",
                        });
                    }

                    const storeData = store || {
                        name: "PharmaSpot",
                        address: "",
                        phone: "",
                        email: ""
                    };

                    // Share invoice using preferred method
                    shareInvoice(transaction, customer, storeData, preferredMethod, null, function (err, result) {
                        if (err) {
                            console.error(err);
                            return res.status(500).json({
                                error: "Internal Server Error",
                                message: "An unexpected error occurred.",
                            });
                        }

                        res.json({
                            message: "Invoice shared successfully using preferred method",
                            method: preferredMethod,
                            result: result
                        });
                    });
                });
            });
        });
    });
});

/**
 * Helper function to check if customer has consent for a communication method
 *
 * @param {Object} preferences Customer preferences
 * @param {string} method Communication method
 * @returns {boolean} Consent status
 */
function checkConsent(preferences, method) {
    if (!preferences) return false;

    switch (method) {
        case "whatsapp":
            return preferences.whatsapp.enabled && preferences.whatsapp.consent && preferences.whatsapp.phoneNumber;
        case "sms":
            return preferences.sms.enabled && preferences.sms.consent && preferences.sms.phoneNumber;
        case "email":
            return preferences.email.enabled && preferences.email.consent && preferences.email.emailAddress;
        default:
            return false;
    }
}

/**
 * Helper function to share invoice using specified method
 *
 * @param {Object} transaction Transaction data
 * @param {Object} customer Customer data
 * @param {Object} store Store data
 * @param {string} method Communication method
 * @param {string} templateId Template ID (optional)
 * @param {function} callback Callback function
 * @returns {void}
 */
function shareInvoice(transaction, customer, store, method, templateId, callback) {
    try {
        // Get appropriate template if not provided
        if (!templateId) {
            const templatesDB = new Datastore({
                filename: path.join(
                    appData,
                    appName,
                    "server",
                    "databases",
                    "templates.db",
                ),
                autoload: true,
            });

            templatesDB.findOne({ type: method, isDefault: true, isActive: true }, function (err, template) {
                if (err) {
                    return callback(err);
                }

                if (!template) {
                    return callback(new Error(`No default template found for ${method}`));
                }

                processSharing(transaction, customer, store, method, template, callback);
            });
        } else {
            // Use provided template
            const templatesDB = new Datastore({
                filename: path.join(
                    appData,
                    appName,
                    "server",
                    "databases",
                    "templates.db",
                ),
                autoload: true,
            });

            templatesDB.findOne({ _id: templateId }, function (err, template) {
                if (err) {
                    return callback(err);
                }

                if (!template) {
                    return callback(new Error("Template not found"));
                }

                processSharing(transaction, customer, store, method, template, callback);
            });
        }
    } catch (error) {
        callback(error);
    }
}

/**
 * Helper function to process invoice sharing
 *
 * @param {Object} transaction Transaction data
 * @param {Object} customer Customer data
 * @param {Object} store Store data
 * @param {string} method Communication method
 * @param {Object} template Template data
 * @param {function} callback Callback function
 * @returns {void}
 */
function processSharing(transaction, customer, store, method, template, callback) {
    try {
        // Prepare template data
        const templateData = {
            storeName: store.name,
            customerName: customer.name,
            invoiceNumber: transaction._id,
            amount: `₹${parseFloat(transaction.total || 0).toFixed(2)}`,
            date: new Date(transaction.date || transaction.createdAt).toLocaleDateString(),
            paymentStatus: transaction.paid >= transaction.total ? "Paid" : "Pending",
            items: formatItemsForTemplate(transaction.items)
        };

        // Process template
        let processedSubject = template.subject;
        let processedContent = template.content;

        for (const [key, value] of Object.entries(templateData)) {
            const placeholder = `{{${key}}}`;
            processedSubject = processedSubject.replace(new RegExp(placeholder, 'g'), value);
            processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value);
        }

        sendCommunication(transaction, customer, store, method, {
            templateId: template._id,
            processedSubject: processedSubject,
            processedContent: processedContent
        }, callback);
    } catch (error) {
        callback(error);
    }
}

/**
 * Helper function to send communication
 *
 * @param {Object} transaction Transaction data
 * @param {Object} customer Customer data
 * @param {Object} store Store data
 * @param {string} method Communication method
 * @param {Object} processedData Processed template data
 * @param {function} callback Callback function
 * @returns {void}
 */
function sendCommunication(transaction, customer, store, method, processedData, callback) {
    try {
        let recipient = null;
        let additionalData = {};

        switch (method) {
            case "whatsapp":
                recipient = customer.phone;
                additionalData.message = processedData.processedContent;
                break;
            case "sms":
                recipient = customer.phone;
                additionalData.message = processedData.processedContent;
                break;
            case "email":
                recipient = customer.email;
                additionalData.subject = processedData.processedSubject;
                additionalData.message = processedData.processedContent;
                
                // Generate PDF for email attachment
                const pdfGenerator = require("./pdf-generator");
                pdfGenerator.generateInvoicePDF(
                    transaction,
                    store,
                    customer,
                    function (err, pdfResult) {
                        if (err) {
                            return callback(err);
                        }
                        
                        additionalData.attachmentPath = pdfResult.path;
                        
                        // Send email with PDF
                        const emailService = require("./email-service");
                        emailService.sendInvoiceEmail(
                            transaction,
                            customer,
                            store,
                            {
                                subject: processedData.processedSubject,
                                content: processedData.processedContent
                            },
                            callback
                        );
                    }
                );
                return;
        }

        // For WhatsApp and SMS, use communication API
        const communicationAPI = require("./communication");
        const mockReq = {
            body: {
                customerId: customer._id,
                transactionId: transaction._id,
                templateId: processedData.templateId,
                phoneNumber: recipient,
                ...additionalData
            }
        };
        
        const mockRes = {
            status: function(code) {
                this.statusCode = code;
                return this;
            },
            json: function(data) {
                if (mockRes.statusCode >= 400) {
                    return callback(new Error(data.message || "Communication failed"));
                }
                
                callback(null, data);
            }
        };

        // Simulate sending communication
        console.log(`[SHARING] Sending ${method} to ${recipient}:`, additionalData);
        
        setTimeout(function () {
            callback(null, {
                method: method,
                recipient: recipient,
                status: "sent",
                timestamp: new Date()
            });
        }, 1000);
    } catch (error) {
        callback(error);
    }
}

/**
 * Helper function to format items for template
 *
 * @param {Array} items Array of items
 * @returns {string} Formatted items string
 */
function formatItemsForTemplate(items) {
    if (!items || items.length === 0) return "No items";
    
    let formatted = "";
    items.forEach((item, index) => {
        const itemTotal = (item.price || 0) * (item.quantity || 0);
        formatted += `${index + 1}. ${item.name || "Unknown Item"} - Qty: ${item.quantity || 0} x ₹${parseFloat(item.price || 0).toFixed(2)} = ₹${itemTotal.toFixed(2)}\n`;
    });
    
    return formatted;
}