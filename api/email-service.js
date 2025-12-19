const nodemailer = require("nodemailer");
const path = require("path");
const fs = require("fs");
const appName = process.env.APPNAME;
const appData = process.env.APPDATA;

/**
 * Email Service utility for sending emails with PDF attachments
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.defaultFrom = "noreply@pharmaspot.com";
    this.isConfigured = false;
    this.initializeTransporter();
  }

  /**
   * Initialize email transporter with configuration
   *
   * @returns {void}
   */
  initializeTransporter() {
    try {
      // Check if email configuration exists
      const configPath = path.join(
        appData,
        appName,
        "server",
        "config",
        "email-config.json"
      );

      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        
        this.transporter = nodemailer.createTransporter({
          host: config.smtp.host,
          port: config.smtp.port,
          secure: config.smtp.secure, // true for 465, false for other ports
          auth: {
            user: config.smtp.user,
            pass: config.smtp.password
          }
        });

        this.defaultFrom = config.from || this.defaultFrom;
        this.isConfigured = true;
        
        console.log("Email service configured successfully");
      } else {
        console.log("Email configuration not found, using simulation mode");
        this.isConfigured = false;
      }
    } catch (error) {
      console.error("Error initializing email transporter:", error);
      this.isConfigured = false;
    }
  }

  /**
   * Send email with PDF attachment
   *
   * @param {Object} options Email options
   * @param {function} callback Callback function
   * @returns {void}
   */
  sendEmailWithPDF(options, callback) {
    if (!options.to || !options.subject || !options.text) {
      return callback(new Error("To, subject, and text are required"));
    }

    const mailOptions = {
      from: options.from || this.defaultFrom,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html || this.textToHtml(options.text)
    };

    // Add PDF attachment if provided
    if (options.pdfBuffer) {
      mailOptions.attachments = [
        {
          filename: options.filename || "invoice.pdf",
          content: options.pdfBuffer,
          contentType: "application/pdf"
        }
      ];
    } else if (options.pdfPath && fs.existsSync(options.pdfPath)) {
      mailOptions.attachments = [
        {
          filename: options.filename || "invoice.pdf",
          path: options.pdfPath
        }
      ];
    }

    if (this.isConfigured && this.transporter) {
      // Send real email
      this.transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.error("Error sending email:", error);
          return callback(error);
        }
        
        console.log("Email sent successfully:", info.messageId);
        callback(null, {
          messageId: info.messageId,
          response: info.response
        });
      });
    } else {
      // Simulation mode
      console.log("[SIMULATION] Email would be sent with the following details:");
      console.log("[SIMULATION] To:", options.to);
      console.log("[SIMULATION] Subject:", options.subject);
      console.log("[SIMULATION] Text:", options.text);
      console.log("[SIMULATION] Has PDF attachment:", !!(options.pdfBuffer || options.pdfPath));
      
      // Simulate email sending delay
      setTimeout(function () {
        callback(null, {
          messageId: "simulated_" + Date.now(),
          response: "Email sent successfully (simulation mode)"
        });
      }, 1000);
    }
  }

  /**
   * Send invoice email using template
   *
   * @param {Object} invoiceData Invoice data
   * @param {Object} customerData Customer data
   * @param {Object} storeData Store data
   * @param {Object} templateData Email template data
   * @param {function} callback Callback function
   * @returns {void}
   */
  sendInvoiceEmail(invoiceData, customerData, storeData, templateData, callback) {
    try {
      // Process template with data
      const processedSubject = this.processTemplate(
        templateData.subject,
        {
          invoiceNumber: invoiceData.invoiceNumber || invoiceData._id,
          customerName: customerData.name,
          storeName: storeData.name,
          date: new Date(invoiceData.date || invoiceData.createdAt).toLocaleDateString(),
          amount: `₹${parseFloat(invoiceData.total || 0).toFixed(2)}`
        }
      );

      const processedText = this.processTemplate(
        templateData.content,
        {
          invoiceNumber: invoiceData.invoiceNumber || invoiceData._id,
          customerName: customerData.name,
          storeName: storeData.name,
          date: new Date(invoiceData.date || invoiceData.createdAt).toLocaleDateString(),
          amount: `₹${parseFloat(invoiceData.total || 0).toFixed(2)}`,
          paymentStatus: invoiceData.paid >= invoiceData.total ? "Paid" : "Pending",
          items: this.formatItemsForEmail(invoiceData.items),
          storeAddress: storeData.address || "",
          storePhone: storeData.phone || ""
        }
      );

      const emailOptions = {
        to: customerData.email,
        subject: processedSubject,
        text: processedText,
        html: this.textToHtml(processedText)
      };

      // Generate PDF and attach to email
      const pdfGenerator = require("./pdf-generator");
      pdfGenerator.generateInvoicePDF(
        invoiceData,
        storeData,
        customerData,
        function (err, pdfResult) {
          if (err) {
            return callback(err);
          }

          emailOptions.pdfBuffer = pdfResult.buffer;
          emailOptions.filename = pdfResult.filename;

          // Send the email
          this.sendEmailWithPDF(emailOptions, callback);
        }.bind(this)
      );
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Process template by replacing placeholders with actual data
   *
   * @param {string} template Template string
   * @param {Object} data Data object
   * @returns {string} Processed template
   */
  processTemplate(template, data) {
    if (!template || !data) return template;

    let processed = template;
    
    // Replace placeholders with actual data
    for (const [key, value] of Object.entries(data)) {
      const placeholder = `{{${key}}}`;
      processed = processed.replace(new RegExp(placeholder, 'g'), value);
    }

    return processed;
  }

  /**
   * Convert plain text to HTML
   *
   * @param {string} text Plain text
   * @returns {string} HTML
   */
  textToHtml(text) {
    if (!text) return "";
    
    // Convert newlines to <br> tags
    let html = text.replace(/\n/g, "<br>");
    
    // Wrap in basic HTML structure
    html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Invoice</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .header { background-color: #f8f9fa; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>Invoice Notification</h2>
        </div>
        <div class="content">
          ${html}
        </div>
        <div class="footer">
          <p>This is an automated message from PharmaSpot Pharmacy Management System.</p>
        </div>
      </body>
      </html>
    `;
    
    return html;
  }

  /**
   * Format items for email display
   *
   * @param {Array} items Array of items
   * @returns {string} Formatted items string
   */
  formatItemsForEmail(items) {
    if (!items || items.length === 0) return "No items";
    
    let formatted = "";
    items.forEach((item, index) => {
      const itemTotal = (item.price || 0) * (item.quantity || 0);
      formatted += `${index + 1}. ${item.name || "Unknown Item"} - Qty: ${item.quantity || 0} x ₹${parseFloat(item.price || 0).toFixed(2)} = ₹${itemTotal.toFixed(2)}\n`;
    });
    
    return formatted;
  }

  /**
   * Test email configuration
   *
   * @param {function} callback Callback function
   * @returns {void}
   */
  testConfiguration(callback) {
    if (!this.isConfigured) {
      return callback(new Error("Email service is not configured"));
    }

    const testOptions = {
      to: this.defaultFrom,
      subject: "PharmaSpot Email Test",
      text: "This is a test email from PharmaSpot to verify email configuration."
    };

    this.sendEmailWithPDF(testOptions, callback);
  }

  /**
   * Get email configuration status
   *
   * @returns {Object} Configuration status
   */
  getConfigurationStatus() {
    return {
      isConfigured: this.isConfigured,
      defaultFrom: this.defaultFrom
    };
  }

  /**
   * Update email configuration
   *
   * @param {Object} config Email configuration
   * @param {function} callback Callback function
   * @returns {void}
   */
  updateConfiguration(config, callback) {
    try {
      // Ensure config directory exists
      const configDir = path.join(
        appData,
        appName,
        "server",
        "config"
      );
      
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Save configuration
      const configPath = path.join(configDir, "email-config.json");
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      // Reinitialize transporter
      this.initializeTransporter();

      callback(null, {
        message: "Email configuration updated successfully",
        isConfigured: this.isConfigured
      });
    } catch (error) {
      callback(error);
    }
  }
}

module.exports = new EmailService();