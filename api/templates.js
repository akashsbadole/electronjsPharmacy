const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const Datastore = require("@seald-io/nedb");
const dbUtils = require('./db-utils');
const dbPath = dbUtils.getDatabasePath('templates.db');

router.use(bodyParser.json());

module.exports = router;

let templatesDB = new Datastore({
  filename: dbPath,
  autoload: true,
});

templatesDB.ensureIndex({ fieldName: "_id", unique: true });

/**
 * GET endpoint: Get the welcome message for the Templates API.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/", function (req, res) {
  res.send("Templates API");
});

/**
 * GET endpoint: Get all templates.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/all", function (req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const type = req.query.type || null;

  let query = {};
  if (type) {
    query.type = type;
  }

  templatesDB.find(query)
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

      templatesDB.count(query, function (err, count) {
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
 * GET endpoint: Get a specific template by ID.
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
router.post("/new", function (req, res) {
  if (!req.body.name || !req.body.type || !req.body.subject || !req.body.content) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Name, type, subject, and content are required.",
    });
  }

  const validTypes = ["whatsapp", "sms", "email"];
  if (!validTypes.includes(req.body.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  const template = {
    _id: Math.floor(Date.now() / 1000) + Math.random(),
    name: req.body.name,
    type: req.body.type,
    subject: req.body.subject,
    content: req.body.content,
    variables: req.body.variables || [],
    isActive: req.body.isActive !== undefined ? req.body.isActive : true,
    isDefault: req.body.isDefault !== undefined ? req.body.isDefault : false,
    description: req.body.description || null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // If this is set as default, unset other default templates of the same type
  if (template.isDefault) {
    templatesDB.update(
      { type: template.type, isDefault: true },
      { $set: { isDefault: false, updatedAt: new Date() } },
      { multi: true },
      function (err, numReplaced) {
        if (err) {
          console.error("Error updating default templates:", err);
        }
      }
    );
  }

  templatesDB.insert(template, function (err, newTemplate) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    res.status(201).json(newTemplate);
  });
});

/**
 * PUT endpoint: Update an existing template.
 *
 * @param {Object} req request object with updated template data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.put("/:templateId", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  // Check if template exists
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

    const updateData = {
      name: req.body.name !== undefined ? req.body.name : template.name,
      type: req.body.type !== undefined ? req.body.type : template.type,
      subject: req.body.subject !== undefined ? req.body.subject : template.subject,
      content: req.body.content !== undefined ? req.body.content : template.content,
      variables: req.body.variables !== undefined ? req.body.variables : template.variables,
      isActive: req.body.isActive !== undefined ? req.body.isActive : template.isActive,
      isDefault: req.body.isDefault !== undefined ? req.body.isDefault : template.isDefault,
      description: req.body.description !== undefined ? req.body.description : template.description,
      updatedAt: new Date()
    };

    // Validate type if provided
    if (req.body.type) {
      const validTypes = ["whatsapp", "sms", "email"];
      if (!validTypes.includes(req.body.type)) {
        return res.status(400).json({
          error: "Bad Request",
          message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
        });
      }
    }

    // If this is set as default, unset other default templates of the same type
    if (updateData.isDefault && !template.isDefault) {
      templatesDB.update(
        { type: updateData.type, isDefault: true, _id: { $ne: req.params.templateId } },
        { $set: { isDefault: false, updatedAt: new Date() } },
        { multi: true },
        function (err, numReplaced) {
          if (err) {
            console.error("Error updating default templates:", err);
          }
        }
      );
    }

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

        res.json({
          ...template,
          ...updateData
        });
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
router.delete("/:templateId", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  // Check if template exists
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

        res.sendStatus(200);
      }
    );
  });
});

/**
 * GET endpoint: Get default template by type.
 *
 * @param {Object} req request object with type as a parameter.
 * @param {Object} res response object.
 * @returns {void}
 */
router.get("/default/:type", function (req, res) {
  if (!req.params.type) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Type is required.",
    });
  }

  const validTypes = ["whatsapp", "sms", "email"];
  if (!validTypes.includes(req.params.type)) {
    return res.status(400).json({
      error: "Bad Request",
      message: `Invalid type. Must be one of: ${validTypes.join(", ")}`,
    });
  }

  templatesDB.findOne({ type: req.params.type, isDefault: true, isActive: true }, function (err, template) {
    if (err) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "An unexpected error occurred.",
      });
    }

    if (!template) {
      return res.status(404).json({
        error: "Not Found",
        message: "No default template found for this type.",
      });
    }

    res.json(template);
  });
});

/**
 * POST endpoint: Process template with data.
 *
 * @param {Object} req request object with template ID and data in the body.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/:templateId/process", function (req, res) {
  if (!req.params.templateId) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Template ID is required.",
    });
  }

  if (!req.body.data) {
    return res.status(400).json({
      error: "Bad Request",
      message: "Data is required for template processing.",
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

    try {
      let processedSubject = template.subject;
      let processedContent = template.content;

      // Replace variables in subject and content
      for (const [key, value] of Object.entries(req.body.data)) {
        const placeholder = `{{${key}}}`;
        processedSubject = processedSubject.replace(new RegExp(placeholder, 'g'), value);
        processedContent = processedContent.replace(new RegExp(placeholder, 'g'), value);
      }

      res.json({
        templateId: template._id,
        originalSubject: template.subject,
        originalContent: template.content,
        processedSubject: processedSubject,
        processedContent: processedContent,
        type: template.type
      });
    } catch (error) {
      return res.status(500).json({
        error: "Internal Server Error",
        message: "Error processing template.",
      });
    }
  });
});

/**
 * POST endpoint: Initialize default templates.
 *
 * @param {Object} req request object.
 * @param {Object} res response object.
 * @returns {void}
 */
router.post("/initialize-defaults", function (req, res) {
  const defaultTemplates = [
    {
      name: "Default WhatsApp Invoice",
      type: "whatsapp",
      subject: "Invoice from {{storeName}}",
      content: "Dear {{customerName}},\n\nThank you for your purchase at {{storeName}}. Your invoice #{{invoiceNumber}} for {{amount}} has been generated.\n\nItems purchased:\n{{items}}\n\nPayment: {{paymentStatus}}\n\nThank you for shopping with us!",
      variables: ["storeName", "customerName", "invoiceNumber", "amount", "items", "paymentStatus"],
      isActive: true,
      isDefault: true,
      description: "Default WhatsApp template for sending invoice notifications"
    },
    {
      name: "Default SMS Invoice",
      type: "sms",
      subject: "Invoice from {{storeName}}",
      content: "Dear {{customerName}}, Thank you for shopping at {{storeName}}. Invoice #{{invoiceNumber}} for {{amount}} has been generated. Payment status: {{paymentStatus}}.",
      variables: ["storeName", "customerName", "invoiceNumber", "amount", "paymentStatus"],
      isActive: true,
      isDefault: true,
      description: "Default SMS template for sending invoice notifications"
    },
    {
      name: "Default Email Invoice",
      type: "email",
      subject: "Your Invoice #{{invoiceNumber}} from {{storeName}}",
      content: "Dear {{customerName}},\n\nThank you for your purchase at {{storeName}}. Please find your invoice #{{invoiceNumber}} attached to this email.\n\nInvoice Details:\n- Amount: {{amount}}\n- Date: {{date}}\n- Payment Status: {{paymentStatus}}\n\nItems purchased:\n{{items}}\n\nThank you for shopping with us!\n\n{{storeName}}\n{{storeAddress}}\n{{storePhone}}",
      variables: ["storeName", "customerName", "invoiceNumber", "amount", "date", "paymentStatus", "items", "storeAddress", "storePhone"],
      isActive: true,
      isDefault: true,
      description: "Default email template for sending invoice notifications with PDF attachment"
    }
  ];

  let insertedCount = 0;
  let skippedCount = 0;

  defaultTemplates.forEach(function (templateData) {
    // Check if template already exists
    templatesDB.findOne({ name: templateData.name, type: templateData.type }, function (err, existingTemplate) {
      if (err) {
        console.error("Error checking existing template:", err);
        return;
      }

      if (existingTemplate) {
        skippedCount++;
        checkCompletion();
        return;
      }

      const template = {
        _id: Math.floor(Date.now() / 1000) + Math.random(),
        ...templateData,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      templatesDB.insert(template, function (err, newTemplate) {
        if (err) {
          console.error("Error inserting template:", err);
          return;
        }

        insertedCount++;
        checkCompletion();
      });
    });
  });

  function checkCompletion() {
    if (insertedCount + skippedCount === defaultTemplates.length) {
      res.json({
        message: "Default templates initialization completed.",
        inserted: insertedCount,
        skipped: skippedCount
      });
    }
  }
});