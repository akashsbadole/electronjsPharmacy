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
  "communication-campaigns.db",
);

router.use(bodyParser.json());

module.exports = router;

let campaignsDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

campaignsDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get welcome message for Communication Campaigns API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
  res.send("Communication Campaigns API");
});

/**
 * GET endpoint: Get all campaigns with optional filtering.
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
  if (req.query.type) {
    filter.type = req.query.type;
  }
  if (req.query.status) {
    filter.status = req.query.status;
  }
  if (req.query.createdBy) {
    filter.createdBy = req.query.createdBy;
  }

  campaignsDB.find(filter)
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
      
      campaignsDB.count(filter, function (err, count) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }
        
        res.json({
          campaigns: docs,
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
 * GET endpoint: Get campaign by ID.
 *
 * @param {Object} req request object with campaign ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:campaignId", function (req, res) {
  if (!req.params.campaignId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Campaign ID is required.",
    });
  }

  campaignsDB.findOne({ _id: req.params.campaignId }, function (err, campaign) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!campaign) {
      return res.status(404).json({
        error: "Not Found",
        message: "Campaign not found.",
      });
    }

    res.json(campaign);
  });
});

/**
 * POST endpoint: Create a new campaign.
 *
 * @param {Object} req request object with campaign data in body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/campaign", function (req, res) {
  if (!req.body.name || !req.body.type || !req.body.createdBy) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Name, type, and createdBy are required.",
    });
  }

  const validTypes = ["PROMOTIONAL", "REMINDER", "INFORMATIONAL"];
  const validScheduleTypes = ["IMMEDIATE", "SCHEDULED", "RECURRING"];

  if (!validTypes.includes(req.body.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  if (req.body.schedule && req.body.schedule.type && !validScheduleTypes.includes(req.body.schedule.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid schedule type. Must be one of: ${validScheduleTypes.join(", ")}`,
    });
  }

  const campaign = {
    _id: Math.floor(Date.now() / 1000) + Math.random(),
    name: req.body.name,
    description: req.body.description || "",
    type: req.body.type,
    priority: req.body.priority || 1,
    schedule: req.body.schedule || {
      type: "IMMEDIATE"
    },
    targeting: req.body.targeting || {},
    content: req.body.content || {},
    throttling: req.body.throttling || {
      enabled: false
    },
    status: "DRAFT",
    metrics: {
      sent: 0,
      delivered: 0,
      read: 0,
      clicked: 0,
      converted: 0,
      unsubscribed: 0,
      cost: 0
    },
    createdBy: req.body.createdBy,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  campaignsDB.insert(campaign, function (err, newCampaign) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    // Estimate reach and cost
    estimateCampaignReach(newCampaign, function (estimate) {
      res.status(201).json({
        success: true,
        campaignId: newCampaign._id,
        status: newCampaign.status,
        estimatedReach: estimate.reach,
        estimatedCost: estimate.cost
      });
    });
  });
});

/**
 * PUT endpoint: Update an existing campaign.
 *
 * @param {Object} req request object with updated campaign data in body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/campaign/:campaignId", function (req, res) {
  if (!req.params.campaignId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Campaign ID is required.",
    });
  }

  // Check if campaign exists
  campaignsDB.findOne({ _id: req.params.campaignId }, function (err, existingCampaign) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!existingCampaign) {
      return res.status(404).json({
        error: "Not Found",
        message: "Campaign not found.",
      });
    }

    // Don't allow updates to running campaigns
    if (existingCampaign.status === "RUNNING") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Cannot update a running campaign. Pause it first.",
      });
    }

    const updateData = {
      updatedAt: new Date()
    };

    // Update only provided fields
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.type !== undefined) updateData.type = req.body.type;
    if (req.body.priority !== undefined) updateData.priority = req.body.priority;
    if (req.body.schedule !== undefined) updateData.schedule = req.body.schedule;
    if (req.body.targeting !== undefined) updateData.targeting = req.body.targeting;
    if (req.body.content !== undefined) updateData.content = req.body.content;
    if (req.body.throttling !== undefined) updateData.throttling = req.body.throttling;

    campaignsDB.update(
      { _id: req.params.campaignId },
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
            message: "Campaign not found.",
          });
        }

        res.sendStatus(200);
      }
    );
  });
});

/**
 * DELETE endpoint: Delete a campaign by ID.
 *
 * @param {Object} req request object with campaign ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/campaign/:campaignId", function (req, res) {
  if (!req.params.campaignId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Campaign ID is required.",
    });
  }

  // Check if campaign exists and is not running
  campaignsDB.findOne({ _id: req.params.campaignId }, function (err, campaign) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!campaign) {
      return res.status(404).json({
        error: "Not Found",
        message: "Campaign not found.",
      });
    }

    if (campaign.status === "RUNNING") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Cannot delete a running campaign. Pause it first.",
      });
    }

    campaignsDB.remove(
      { _id: req.params.campaignId },
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
            message: "Campaign not found.",
          });
        }

        res.sendStatus(200);
      }
    );
  });
});

/**
 * POST endpoint: Launch a campaign.
 *
 * @param {Object} req request object with campaign ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/campaign/:campaignId/launch", function (req, res) {
  if (!req.params.campaignId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Campaign ID is required.",
    });
  }

  campaignsDB.findOne({ _id: req.params.campaignId }, function (err, campaign) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!campaign) {
      return res.status(404).json({
        error: "Not Found",
        message: "Campaign not found.",
      });
    }

    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Only draft or scheduled campaigns can be launched.",
      });
    }

    const newStatus = campaign.schedule.type === "IMMEDIATE" ? "RUNNING" : "SCHEDULED";

    campaignsDB.update(
      { _id: req.params.campaignId },
      { 
        $set: {
          status: newStatus,
          updatedAt: new Date()
        }
      },
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
            message: "Campaign not found.",
          });
        }

        // If immediate, start processing the campaign
        if (newStatus === "RUNNING") {
          processCampaign(campaign);
        }

        res.json({
          success: true,
          message: `Campaign ${newStatus.toLowerCase()} successfully`,
          status: newStatus
        });
      }
    );
  });
});

/**
 * POST endpoint: Pause a running campaign.
 *
 * @param {Object} req request object with campaign ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/campaign/:campaignId/pause", function (req, res) {
  if (!req.params.campaignId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Campaign ID is required.",
    });
  }

  campaignsDB.update(
    { _id: req.params.campaignId, status: "RUNNING" },
    { 
      $set: {
        status: "PAUSED",
        updatedAt: new Date()
      }
    },
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
          message: "Running campaign not found.",
        });
      }

      res.json({
        success: true,
        message: "Campaign paused successfully"
      });
    }
  );
});

/**
 * POST endpoint: Resume a paused campaign.
 *
 * @param {Object} req request object with campaign ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/campaign/:campaignId/resume", function (req, res) {
  if (!req.params.campaignId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Campaign ID is required.",
    });
  }

  campaignsDB.findOne({ _id: req.params.campaignId }, function (err, campaign) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!campaign) {
      return res.status(404).json({
        error: "Not Found",
        message: "Campaign not found.",
      });
    }

    if (campaign.status !== "PAUSED") {
      return res.status(400).json({
        error: "Bad Request",
        message: "Only paused campaigns can be resumed.",
      });
    }

    campaignsDB.update(
      { _id: req.params.campaignId },
      { 
        $set: {
          status: "RUNNING",
          updatedAt: new Date()
        }
      },
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
            message: "Campaign not found.",
          });
        }

        // Resume processing the campaign
        processCampaign(campaign);

        res.json({
          success: true,
          message: "Campaign resumed successfully"
        });
      }
    );
  });
});

/**
 * POST endpoint: Cancel a campaign.
 *
 * @param {Object} req request object with campaign ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/campaign/:campaignId/cancel", function (req, res) {
  if (!req.params.campaignId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Campaign ID is required.",
    });
  }

  campaignsDB.update(
    { _id: req.params.campaignId },
    { 
      $set: {
        status: "CANCELLED",
        updatedAt: new Date()
      }
    },
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
          message: "Campaign not found.",
        });
      }

      res.json({
        success: true,
        message: "Campaign cancelled successfully"
      });
    }
  );
});

/**
 * GET endpoint: Get campaign analytics.
 *
 * @param {Object} req request object with campaign ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/campaign/:campaignId/analytics", function (req, res) {
  if (!req.params.campaignId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Campaign ID is required.",
    });
  }

  campaignsDB.findOne({ _id: req.params.campaignId }, function (err, campaign) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!campaign) {
      return res.status(404).json({
        error: "Not Found",
        message: "Campaign not found.",
      });
    }

    // Get communications for this campaign
    const communicationsDbPath = path.join(
      appData,
      appName,
      "server",
      "databases",
      "customer-communications.db",
    );
    
    const communicationsDB = new Datastore({
      filename: communicationsDbPath,
      autoload: true,
    });

    communicationsDB.find({ campaignId: req.params.campaignId }, function (err, communications) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }

      const analytics = {
        campaign: {
          id: campaign._id,
          name: campaign.name,
          type: campaign.type,
          status: campaign.status,
          createdAt: campaign.createdAt
        },
        metrics: {
          sent: communications.filter(c => c.status === "SENT").length,
          delivered: communications.filter(c => c.status === "DELIVERED").length,
          read: communications.filter(c => c.status === "READ").length,
          failed: communications.filter(c => c.status === "FAILED").length,
          pending: communications.filter(c => c.status === "PENDING").length
        },
        byChannel: {
          sms: communications.filter(c => c.channel === "sms").length,
          email: communications.filter(c => c.channel === "email").length,
          whatsapp: communications.filter(c => c.channel === "whatsapp").length,
          in_app: communications.filter(c => c.channel === "in_app").length,
          push: communications.filter(c => c.channel === "push").length
        },
        deliveryRate: 0,
        readRate: 0,
        totalCost: communications.reduce((sum, c) => sum + (c.cost || 0), 0)
      };

      // Calculate rates
      const sentCommunications = communications.filter(c => c.status === "SENT" || c.status === "DELIVERED" || c.status === "READ");
      if (sentCommunications.length > 0) {
        analytics.deliveryRate = ((communications.filter(c => c.status === "DELIVERED" || c.status === "READ").length / sentCommunications.length) * 100).toFixed(2);
        analytics.readRate = ((communications.filter(c => c.status === "READ").length / sentCommunications.length) * 100).toFixed(2);
      }

      res.json(analytics);
    });
  });
});

/**
 * Helper function to estimate campaign reach and cost
 *
 * @param {Object} campaign Campaign object
 * @param {function} callback Callback function
 * @returns {void}
 */
function estimateCampaignReach(campaign, callback) {
  // This is a simplified estimation - in a real implementation,
  // you would query the customer database with the targeting criteria
  
  const customersDbPath = path.join(
    appData,
    appName,
    "server",
    "databases",
    "customers.db",
  );
  
  const customersDB = new Datastore({
    filename: customersDbPath,
    autoload: true,
  });

  customersDB.count({}, function (err, totalCustomers) {
    if (err) {
      return callback({ reach: 0, cost: 0 });
    }

    // Simple estimation based on targeting criteria
    let estimatedReach = totalCustomers;
    
    if (campaign.targeting.conditions) {
      // Apply some basic filtering logic
      if (campaign.targeting.conditions.ageRange) {
        estimatedReach = Math.floor(estimatedReach * 0.6); // Assume 60% in age range
      }
      if (campaign.targeting.conditions.categories && campaign.targeting.conditions.categories.length > 0) {
        estimatedReach = Math.floor(estimatedReach * 0.4); // Assume 40% bought these categories
      }
    }

    // Estimate cost based on channels and reach
    let estimatedCost = 0;
    const channels = campaign.content.templates ? Object.keys(campaign.content.templates) : [];
    
    channels.forEach(channel => {
      switch (channel) {
        case "sms":
          estimatedCost += estimatedReach * 0.05; // $0.05 per SMS
          break;
        case "email":
          estimatedCost += estimatedReach * 0.01; // $0.01 per email
          break;
        case "whatsapp":
          estimatedCost += estimatedReach * 0.08; // $0.08 per WhatsApp message
          break;
        case "push":
          estimatedCost += estimatedReach * 0.005; // $0.005 per push notification
          break;
      }
    });

    callback({ reach: estimatedReach, cost: estimatedCost });
  });
}

/**
 * Helper function to process a campaign
 *
 * @param {Object} campaign Campaign object
 * @returns {void}
 */
function processCampaign(campaign) {
  console.log(`Processing campaign: ${campaign.name} (${campaign._id})`);
  
  // This is a simplified implementation
  // In a real implementation, you would:
  // 1. Get targeted customers based on criteria
  // 2. Create communications for each customer
  // 3. Add them to the message queue
  // 4. Handle throttling and scheduling
  
  // For now, just log that the campaign is being processed
  console.log(`Campaign ${campaign._id} processing started`);
}

module.exports.processCampaign = processCampaign;