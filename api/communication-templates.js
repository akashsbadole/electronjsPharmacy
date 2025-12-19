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
  "communication-templates.db",
);

router.use(bodyParser.json());

module.exports = router;

let templatesDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

templatesDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get welcome message for the Communication Templates API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
  res.send("Communication Templates API");
});

/**
 * GET endpoint: Get all templates with optional filtering.
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
  if (req.query.category) {
    filter.category = req.query.category;
  }
  if (req.query.language) {
    filter.language = req.query.language;
  }
  if (req.query.isActive !== undefined) {
    filter.isActive = req.query.isActive === 'true';
  }

  templatesDB.find(filter)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .exec(function (err, docs) {
      if (err) {
        return res.status(500).json({
          error: "Internal Server Error",
          message: "An unexpected error occurred.",
        });
      }
      
      templatesDB.count(filter, function (err, count) {
        if (err) {
          return res.status(500).json({
            error: "Internal Server Error",
            message: "An unexpected error occurred.",
          });
        }
        
        res.json({
          templates: docs,
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
 * GET endpoint: Get template by ID.
 *
 * @param {Object} req request object with template ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/:templateId", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  templatesDB.findOne({ _id: req.params.templateId }, function (err, template) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!template) {
      return res.status(404).json({
        error: "Not Found",
        message: "Template not found.",
      });
    }

    res.json(template);
  });
});

/**
 * POST endpoint: Create a new template.
 *
 * @param {Object} req request object with template data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/template", function (req, res) {
  if (!req.body.name || !req.body.type || !req.body.category) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Name, type, and category are required.",
    });
  }

  const validTypes = ["SMS", "EMAIL", "WHATSAPP", "IN_APP", "PUSH"];
  const validCategories = ["PRESCRIPTION", "APPOINTMENT", "PROMOTIONAL", "PERSONAL", "TRANSACTIONAL", "INFORMATIONAL"];

  if (!validTypes.includes(req.body.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  if (!validCategories.includes(req.body.category)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid category. Must be one of: ${validCategories.join(", ")}`,
    });
  }

  // Validate content based on type
  if (!validateTemplateContent(req.body.type, req.body.content)) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Invalid content for the specified template type.",
    });
  }

  const template = {
    _id: Math.floor(Date.now() / 1000) + Math.random(),
    name: req.body.name,
    description: req.body.description || "",
    type: req.body.type,
    category: req.body.category,
    language: req.body.language || "en",
    content: req.body.content || {},
    variables: req.body.variables || [],
    isActive: req.body.isActive !== undefined ? req.body.isActive : true,
    isDefault: req.body.isDefault || false,
    version: req.body.version || "1.0",
    approvalStatus: req.body.approvalStatus || "PENDING",
    approvedBy: req.body.approvedBy || null,
    approvedAt: req.body.approvedAt || null,
    rejectionReason: req.body.rejectionReason || null,
    usageCount: 0,
    lastUsedAt: null,
    performance: {
      openRate: 0,
      clickRate: 0,
      conversionRate: 0
    },
    createdBy: req.body.createdBy || "system",
    createdAt: new Date(),
    updatedAt: new Date()
  };

  templatesDB.insert(template, function (err, newTemplate) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    res.status(201).json({
      success: true,
      templateId: newTemplate._id,
      status: newTemplate.approvalStatus
    });
  });
});

/**
 * PUT endpoint: Update an existing template.
 *
 * @param {Object} req request object with updated template data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/template/:templateId", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  // Check if template exists
  templatesDB.findOne({ _id: req.params.templateId }, function (err, existingTemplate) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!existingTemplate) {
      return res.status(404).json({
        error: "Not Found",
        message: "Template not found.",
      });
    }

    // Validate content if provided
    if (req.body.content && !validateTemplateContent(existingTemplate.type, req.body.content)) {
      return res.status(400).json({
        error: "Bad Request",
        message: "Invalid content for the specified template type.",
      });
    }

    const updateData = {
      updatedAt: new Date()
    };

    // Update only provided fields
    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.content !== undefined) updateData.content = req.body.content;
    if (req.body.variables !== undefined) updateData.variables = req.body.variables;
    if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;
    if (req.body.isDefault !== undefined) updateData.isDefault = req.body.isDefault;
    if (req.body.version !== undefined) updateData.version = req.body.version;
    if (req.body.approvalStatus !== undefined) updateData.approvalStatus = req.body.approvalStatus;
    if (req.body.approvedBy !== undefined) updateData.approvedBy = req.body.approvedBy;
    if (req.body.approvedAt !== undefined) updateData.approvedAt = req.body.approvedAt;
    if (req.body.rejectionReason !== undefined) updateData.rejectionReason = req.body.rejectionReason;

    templatesDB.update(
      { _id: req.params.templateId },
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
            message: "Template not found.",
          });
        }

        res.sendStatus(200);
      }
    );
  });
});

/**
 * DELETE endpoint: Delete a template by ID.
 *
 * @param {Object} req request object with template ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.delete("/template/:templateId", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  templatesDB.remove(
    { _id: req.params.templateId },
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
          message: "Template not found.",
        });
      }

      res.sendStatus(200);
    }
  );
});

/**
 * POST endpoint: Approve a template.
 *
 * @param {Object} req request object with template ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/template/:templateId/approve", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  if (!req.body.approvedBy) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Approved by is required.",
    });
  }

  templatesDB.update(
    { _id: req.params.templateId },
    { 
      $set: {
        approvalStatus: "APPROVED",
        approvedBy: req.body.approvedBy,
        approvedAt: new Date(),
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
          message: "Template not found.",
        });
      }

      res.json({
        success: true,
        message: "Template approved successfully"
      });
    }
  );
});

/**
 * POST endpoint: Reject a template.
 *
 * @param {Object} req request object with template ID as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/template/:templateId/reject", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  if (!req.body.rejectionReason) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Rejection reason is required.",
    });
  }

  templatesDB.update(
    { _id: req.params.templateId },
    { 
      $set: {
        approvalStatus: "REJECTED",
        rejectionReason: req.body.rejectionReason,
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
          message: "Template not found.",
        });
      }

      res.json({
        success: true,
        message: "Template rejected successfully"
      });
    }
  );
});

/**
 * POST endpoint: Preview template with sample data.
 *
 * @param {Object} req request object with template ID and sample data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/template/:templateId/preview", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  templatesDB.findOne({ _id: req.params.templateId }, function (err, template) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!template) {
      return res.status(404).json({
        error: "Not Found",
        message: "Template not found.",
      });
    }

    const sampleData = req.body.sampleData || {};

    try {
      const preview = processTemplate(template, sampleData);
      res.json({
        success: true,
        preview: preview
      });
    } catch (error) {
      res.status(400).json({
        error: "Bad Request",
        message: "Error processing template: " + error.message
      });
    }
  });
});

/**
 * GET endpoint: Get default templates by type and category.
 *
 * @param {Object} req request object with type and category as parameters.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/default/:type/:category", function (req, res) {
  if (!req.params.type || !req.params.category) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Type and category are required.",
    });
  }

  templatesDB.findOne({
    type: req.params.type.toUpperCase(),
    category: req.params.category.toUpperCase(),
    isDefault: true,
    isActive: true,
    approvalStatus: "APPROVED"
  }, function (err, template) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!template) {
      return res.status(404).json({
        error: "Not Found",
        message: "Default template not found.",
      });
    }

    res.json(template);
  });
});

/**
 * Helper function to validate template content based on type
 *
 * @param {string} type Template type
 * @param {Object} content Template content
 * @returns {boolean} Whether content is valid
 */
function validateTemplateContent(type, content) {
  if (!content || typeof content !== 'object') {
    return false;
  }

  switch (type) {
    case "SMS":
      return content.sms && typeof content.sms === 'string' && content.sms.length > 0;
    case "EMAIL":
      return content.email && content.email.subject && content.email.htmlBody;
    case "WHATSAPP":
      return content.whatsapp && content.whatsapp.templateName;
    case "IN_APP":
      return content.inApp && content.inApp.title && content.inApp.body;
    case "PUSH":
      return content.push && content.push.title && content.push.body;
    default:
      return false;
  }
}

/**
 * Helper function to process template with data
 *
 * @param {Object} template Template object
 * @param {Object} data Data to substitute
 * @returns {Object} Processed template content
 */
function processTemplate(template, data) {
  const processed = { ...template.content };

  // Helper function to replace variables in a string
  function replaceVariables(str) {
    if (!str || typeof str !== 'string') return str;
    
    let result = str;
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{{${key}}}`;
      result = result.replace(new RegExp(placeholder, 'g'), value || '');
    }
    return result;
  }

  // Process based on template type
  switch (template.type) {
    case "SMS":
      if (processed.sms) {
        processed.sms = replaceVariables(processed.sms);
      }
      break;
    case "EMAIL":
      if (processed.email) {
        if (processed.email.subject) {
          processed.email.subject = replaceVariables(processed.email.subject);
        }
        if (processed.email.htmlBody) {
          processed.email.htmlBody = replaceVariables(processed.email.htmlBody);
        }
        if (processed.email.textBody) {
          processed.email.textBody = replaceVariables(processed.email.textBody);
        }
      }
      break;
    case "WHATSAPP":
      if (processed.whatsapp && processed.whatsapp.parameters) {
        for (const param of processed.whatsapp.parameters) {
          if (param.value && param.value.includes('{{')) {
            param.value = replaceVariables(param.value);
          }
        }
      }
      break;
    case "IN_APP":
      if (processed.inApp) {
        if (processed.inApp.title) {
          processed.inApp.title = replaceVariables(processed.inApp.title);
        }
        if (processed.inApp.body) {
          processed.inApp.body = replaceVariables(processed.inApp.body);
        }
      }
      break;
    case "PUSH":
      if (processed.push) {
        if (processed.push.title) {
          processed.push.title = replaceVariables(processed.push.title);
        }
        if (processed.push.body) {
          processed.push.body = replaceVariables(processed.push.body);
        }
      }
      break;
  }

  return processed;
}

module.exports.processTemplate = processTemplate;