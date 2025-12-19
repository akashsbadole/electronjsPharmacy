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
  "customer-communication-preferences.db",
);

router.use(bodyParser.json());

module.exports = router;

let preferencesDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

preferencesDB.ensureIndex({ fieldName: "customerId", unique: true });

/**
 * GET endpoint: Get welcome message for Customer Communication Preferences API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
  res.send("Customer Communication Preferences API");
});

/**
 * GET endpoint: Get communication preferences by customer ID.
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

  preferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    // Return default preferences if none exist
    if (!preferences) {
      const defaultPreferences = getDefaultPreferences(req.params.customerId);
      return res.json(defaultPreferences);
    }

    res.json(preferences);
  });
});

/**
 * POST endpoint: Create or update communication preferences for a customer.
 *
 * @param {Object} req request object with customer ID as a parameter and preferences in body.
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

  customersDBInstance.findOne({ _id: req.params.customerId }, function (err, customer) {
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
    preferencesDB.findOne({ customerId: req.params.customerId }, function (err, existingPreferences) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }

      const preferences = mergePreferences(existingPreferences, req.body, req.params.customerId);

      if (existingPreferences) {
        // Update existing preferences
        preferencesDB.update(
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

            if (numReplaced === 0) {
              return res.status(404).json({
                error: "Not Found",
                message: "Preferences not found.",
              });
            }

            logConsentChange(req.params.customerId, preferences, req.ip);
            
            res.json({
              success: true,
              message: "Preferences updated successfully",
              preferences: preferences
            });
          }
        );
      } else {
        // Create new preferences
        preferencesDB.insert(preferences, function (err, newPreferences) {
          if (err) {
            return res.status(500).json({
              error: "Internal Server Error",
              message: "An unexpected error occurred.",
            });
          }

          logConsentChange(req.params.customerId, preferences, req.ip);
          
          res.status(201).json({
            success: true,
            message: "Preferences created successfully",
            preferences: newPreferences
          });
        });
      }
    });
  });
});

/**
 * PUT endpoint: Update specific channel preferences.
 *
 * @param {Object} req request object with customer ID and channel as parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/customer/:customerId/channel/:channel", function (req, res) {
  if (!req.params.customerId || !req.params.channel) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID and channel are required.",
    });
  }

  const validChannels = ["sms", "email", "whatsapp", "in_app", "push"];
  if (!validChannels.includes(req.params.channel)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid channel. Must be one of: ${validChannels.join(", ")}`,
    });
  }

  // Get existing preferences
  preferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!preferences) {
      preferences = getDefaultPreferences(req.params.customerId);
    }

    // Update channel preferences
    if (!preferences.channels) {
      preferences.channels = {};
    }

    if (!preferences.channels[req.params.channel]) {
      preferences.channels[req.params.channel] = {};
    }

    // Update only provided fields
    const channelPrefs = preferences.channels[req.params.channel];
    if (req.body.enabled !== undefined) channelPrefs.enabled = req.body.enabled;
    if (req.body.phoneNumber !== undefined) channelPrefs.phoneNumber = req.body.phoneNumber;
    if (req.body.emailAddress !== undefined) channelPrefs.emailAddress = req.body.emailAddress;
    if (req.body.deviceTokens !== undefined) channelPrefs.deviceTokens = req.body.deviceTokens;
    
    if (req.body.consent) {
      if (!channelPrefs.consent) {
        channelPrefs.consent = {};
      }
      
      if (req.body.consent.marketing !== undefined) channelPrefs.consent.marketing = req.body.consent.marketing;
      if (req.body.consent.transactional !== undefined) channelPrefs.consent.transactional = req.body.consent.transactional;
      if (req.body.consent.appointment !== undefined) channelPrefs.consent.appointment = req.body.consent.appointment;
      if (req.body.consent.prescription !== undefined) channelPrefs.consent.prescription = req.body.consent.prescription;
      if (req.body.consent.newsletter !== undefined) channelPrefs.consent.newsletter = req.body.consent.newsletter;
      
      channelPrefs.consentDate = new Date();
      channelPrefs.consentIP = req.ip;
    }

    preferences.updatedAt = new Date();
    preferences.updatedBy = "customer_self";

    // Save preferences
    preferencesDB.update(
      { customerId: req.params.customerId },
      { $set: preferences },
      { upsert: true },
      function (err, numReplaced) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }

        logConsentChange(req.params.customerId, preferences, req.ip);
        
        res.json({
          success: true,
          message: "Channel preferences updated successfully",
          channel: req.params.channel,
          preferences: channelPrefs
        });
      }
    );
  });
});

/**
 * PUT endpoint: Update global preferences.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/customer/:customerId/global", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  // Get existing preferences
  preferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!preferences) {
      preferences = getDefaultPreferences(req.params.customerId);
    }

    // Update global preferences
    if (!preferences.global) {
      preferences.global = {};
    }

    if (req.body.quietHours !== undefined) {
      if (!preferences.global.quietHours) {
        preferences.global.quietHours = {};
      }
      
      if (req.body.quietHours.enabled !== undefined) preferences.global.quietHours.enabled = req.body.quietHours.enabled;
      if (req.body.quietHours.start !== undefined) preferences.global.quietHours.start = req.body.quietHours.start;
      if (req.body.quietHours.end !== undefined) preferences.global.quietHours.end = req.body.quietHours.end;
      if (req.body.quietHours.timezone !== undefined) preferences.global.quietHours.timezone = req.body.quietHours.timezone;
      if (req.body.quietHours.emergencyOverride !== undefined) preferences.global.quietHours.emergencyOverride = req.body.quietHours.emergencyOverride;
    }

    if (req.body.frequencyLimits !== undefined) {
      if (!preferences.global.frequencyLimits) {
        preferences.global.frequencyLimits = {};
      }
      
      if (req.body.frequencyLimits.enabled !== undefined) preferences.global.frequencyLimits.enabled = req.body.frequencyLimits.enabled;
      if (req.body.frequencyLimits.maxPerDay !== undefined) preferences.global.frequencyLimits.maxPerDay = req.body.frequencyLimits.maxPerDay;
      if (req.body.frequencyLimits.maxPerWeek !== undefined) preferences.global.frequencyLimits.maxPerWeek = req.body.frequencyLimits.maxPerWeek;
      if (req.body.frequencyLimits.cooldownHours !== undefined) preferences.global.frequencyLimits.cooldownHours = req.body.frequencyLimits.cooldownHours;
    }

    if (req.body.language !== undefined) preferences.global.language = req.body.language;
    if (req.body.timezone !== undefined) preferences.global.timezone = req.body.timezone;

    preferences.updatedAt = new Date();
    preferences.updatedBy = "customer_self";

    // Save preferences
    preferencesDB.update(
      { customerId: req.params.customerId },
      { $set: preferences },
      { upsert: true },
      function (err, numReplaced) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }

        logConsentChange(req.params.customerId, preferences, req.ip);
        
        res.json({
          success: true,
          message: "Global preferences updated successfully",
          preferences: preferences.global
        });
      }
    );
  });
});

/**
 * POST endpoint: Update consent for specific communication type.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/customer/:customerId/consent", function (req, res) {
  if (!req.params.customerId || !req.body.type || !req.body.consent) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID, type, and consent are required.",
    });
  }

  const validTypes = ["marketing", "transactional", "appointment", "prescription", "newsletter"];
  if (!validTypes.includes(req.body.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  // Get existing preferences
  preferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!preferences) {
      preferences = getDefaultPreferences(req.params.customerId);
    }

    // Update consent for all channels
    if (preferences.channels) {
      Object.keys(preferences.channels).forEach(channel => {
        if (!preferences.channels[channel].consent) {
          preferences.channels[channel].consent = {};
        }
        
        preferences.channels[channel].consent[req.body.type] = req.body.consent;
        preferences.channels[channel].consentDate = new Date();
        preferences.channels[channel].consentIP = req.ip;
      });
    }

    preferences.updatedAt = new Date();
    preferences.updatedBy = "customer_self";

    // Save preferences
    preferencesDB.update(
      { customerId: req.params.customerId },
      { $set: preferences },
      { upsert: true },
      function (err, numReplaced) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }

        logConsentChange(req.params.customerId, preferences, req.ip);
        
        res.json({
          success: true,
          message: "Consent updated successfully",
          type: req.body.type,
          consent: req.body.consent
        });
      }
    );
  });
});

/**
 * GET endpoint: Get consent history for a customer.
 *
 * @param {Object} req request object with customer ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId/consent-history", function (req, res) {
  if (!req.params.customerId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID is required.",
    });
  }

  const consentHistoryDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "customer-consent-history.db",
  );
  
  const consentHistoryDB = new Datastore({
    filename: consentHistoryDbPath,
    autoload: true,
  });

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  consentHistoryDB.find({ customerId: req.params.customerId })
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limit)
    .exec(function (err, history) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }
      
      consentHistoryDB.count({ customerId: req.params.customerId }, function (err, count) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }
        
        res.json({
          history: history,
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
 * GET endpoint: Check if customer has consent for specific communication.
 *
 * @param {Object} req request object with customer ID, channel, and type as parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/customer/:customerId/consent-check", function (req, res) {
  if (!req.params.customerId || !req.query.channel || !req.query.type) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Customer ID, channel, and type are required.",
    });
  }

  preferencesDB.findOne({ customerId: req.params.customerId }, function (err, preferences) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    // Use default preferences if none exist
    if (!preferences) {
      preferences = getDefaultPreferences(req.params.customerId);
    }

    const hasConsent = checkConsent(preferences, req.query.channel, req.query.type);
    
    res.json({
      customerId: req.params.customerId,
      channel: req.query.channel,
      type: req.query.type,
      hasConsent: hasConsent,
      timestamp: new Date()
    });
  });
});

/**
 * Helper function to get default preferences
 *
 * @param {string} customerId Customer ID
 * @returns {Object} Default preferences object
 */
function getDefaultPreferences(customerId) {
  return {
    customerId: customerId,
    channels: {
      sms: {
        enabled: true,
        phoneNumber: null,
        consent: {
          marketing: false,
          transactional: true,
          appointment: true,
          prescription: true
        },
        consentDate: null,
        consentIP: null
      },
      email: {
        enabled: true,
        emailAddress: null,
        consent: {
          marketing: true,
          transactional: true,
          appointment: true,
          prescription: true,
          newsletter: false
        },
        consentDate: null,
        consentIP: null
      },
      whatsapp: {
        enabled: true,
        phoneNumber: null,
        consent: {
          marketing: false,
          transactional: true,
          appointment: true
        },
        consentDate: null,
        consentIP: null
      },
      in_app: {
        enabled: true,
        consent: {
          marketing: true,
          transactional: true,
          appointment: true,
          prescription: true
        }
      },
      push: {
        enabled: false,
        deviceTokens: [],
        consent: {
          marketing: false,
          transactional: false
        }
      }
    },
    communicationTypes: {
      appointmentReminders: {
        enabled: true,
        preferredChannel: "sms",
        frequency: "24h_before",
        quietHours: {
          start: "22:00",
          end: "08:00"
        }
      },
      prescriptionRefills: {
        enabled: true,
        preferredChannel: "whatsapp",
        frequency: "7_days_before",
        autoRefill: false
      },
      promotionalMessages: {
        enabled: true,
        maxPerWeek: 2,
        preferredCategories: []
      },
      healthTips: {
        enabled: true,
        frequency: "weekly",
        topics: ["medication_adherence", "general_health"]
      },
      birthdayWishes: {
        enabled: true,
        includeOffer: true
      }
    },
    global: {
      quietHours: {
        enabled: true,
        start: "22:00",
        end: "08:00",
        timezone: "UTC",
        emergencyOverride: true
      },
      frequencyLimits: {
        enabled: true,
        maxPerDay: 5,
        maxPerWeek: 20,
        cooldownHours: 2
      },
      language: "en",
      timezone: "UTC"
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: "system"
  };
}

/**
 * Helper function to merge preferences
 *
 * @param {Object} existing Existing preferences
 * @param {Object} updates Updates to apply
 * @param {string} customerId Customer ID
 * @returns {Object} Merged preferences
 */
function mergePreferences(existing, updates, customerId) {
  const preferences = existing || getDefaultPreferences(customerId);
  
  // Deep merge the updates
  if (updates.channels) {
    Object.keys(updates.channels).forEach(channel => {
      if (!preferences.channels[channel]) {
        preferences.channels[channel] = {};
      }
      
      Object.assign(preferences.channels[channel], updates.channels[channel]);
    });
  }
  
  if (updates.communicationTypes) {
    Object.assign(preferences.communicationTypes, updates.communicationTypes);
  }
  
  if (updates.global) {
    Object.assign(preferences.global, updates.global);
  }
  
  preferences.updatedAt = new Date();
  preferences.updatedBy = "customer_self";
  
  return preferences;
}

/**
 * Helper function to check consent
 *
 * @param {Object} preferences Customer preferences
 * @param {string} channel Communication channel
 * @param {string} type Communication type
 * @returns {boolean} Whether customer has consent
 */
function checkConsent(preferences, channel, type) {
  if (!preferences || !preferences.channels) {
    return true; // Default to true if no preferences set
  }

  const channelPreferences = preferences.channels[channel];
  if (!channelPreferences || !channelPreferences.enabled) {
    return false;
  }

  if (!channelPreferences.consent) {
    return true; // Default to true if no consent settings
  }

  // Check consent based on type
  switch (type) {
    case "marketing":
      return channelPreferences.consent.marketing !== false;
    case "transactional":
      return channelPreferences.consent.transactional !== false;
    case "appointment":
      return channelPreferences.consent.appointment !== false;
    case "prescription":
      return channelPreferences.consent.prescription !== false;
    case "newsletter":
      return channelPreferences.consent.newsletter !== false;
    default:
      return true;
  }
}

/**
 * Helper function to log consent changes
 *
 * @param {string} customerId Customer ID
 * @param {Object} preferences Updated preferences
 * @param {string} ipAddress IP address
 * @returns {void}
 */
function logConsentChange(customerId, preferences, ipAddress) {
  const consentHistoryDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "customer-consent-history.db",
  );
  
  const consentHistoryDB = new Datastore({
    filename: consentHistoryDbPath,
    autoload: true,
  });

  const logEntry = {
    _id: "CONSENT-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9),
    customerId: customerId,
    preferences: JSON.parse(JSON.stringify(preferences)), // Deep copy
    ipAddress: ipAddress,
    timestamp: new Date(),
    userAgent: "API" // In a real implementation, you'd capture the actual user agent
  };

  consentHistoryDB.insert(logEntry, function (err) {
    if (err) {
      console.error("Error logging consent change:", err);
    }
  });
}