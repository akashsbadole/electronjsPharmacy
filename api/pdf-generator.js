const jsPDF = require("jspdf");
const path = require("path");
const fs = require("fs");

/**
 * PDF Generator utility for creating invoice PDFs
 */
class PDFGenerator {
  constructor() {
    this.defaultFont = "helvetica";
    this.fontSize = 12;
    this.margin = 20;
    this.pageWidth = 210; // A4 width in mm
    this.pageHeight = 297; // A4 height in mm
  }

  /**
   * Generate an invoice PDF
   *
   * @param {Object} invoiceData Invoice data object
   * @param {Object} storeData Store information
   * @param {Object} customerData Customer information
   * @param {function} callback Callback function
   * @returns {void}
   */
  generateInvoicePDF(invoiceData, storeData, customerData, callback) {
    try {
      const doc = new jsPDF();
      let yPosition = this.margin;

      // Set font
      doc.setFont(this.defaultFont);
      doc.setFontSize(this.fontSize);

      // Add store header
      yPosition = this.addStoreHeader(doc, storeData, yPosition);

      // Add customer information
      yPosition = this.addCustomerInfo(doc, customerData, yPosition);

      // Add invoice details
      yPosition = this.addInvoiceDetails(doc, invoiceData, yPosition);

      // Add items table
      yPosition = this.addItemsTable(doc, invoiceData.items, yPosition);

      // Add totals
      yPosition = this.addTotals(doc, invoiceData, yPosition);

      // Add footer
      this.addFooter(doc, storeData);

      // Generate PDF buffer
      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

      // Save PDF to file if path is provided
      let filePath = null;
      if (invoiceData.savePath) {
        filePath = invoiceData.savePath;
        fs.writeFileSync(filePath, pdfBuffer);
      }

      callback(null, {
        buffer: pdfBuffer,
        path: filePath,
        filename: `invoice_${invoiceData.invoiceNumber || invoiceData._id}.pdf`
      });
    } catch (error) {
      callback(error);
    }
  }

  /**
   * Add store header to PDF
   *
   * @param {Object} doc jsPDF document
   * @param {Object} storeData Store information
   * @param {number} yPosition Current Y position
   * @returns {number} New Y position
   */
  addStoreHeader(doc, storeData, yPosition) {
    // Store name
    doc.setFontSize(18);
    doc.setFont(undefined, "bold");
    doc.text(storeData.name || "PharmaSpot", this.margin, yPosition);
    yPosition += 10;

    // Store address
    doc.setFontSize(10);
    doc.setFont(undefined, "normal");
    if (storeData.address) {
      const addressLines = this.wrapText(storeData.address, 50);
      addressLines.forEach(line => {
        doc.text(line, this.margin, yPosition);
        yPosition += 5;
      });
    }

    // Store contact info
    if (storeData.phone) {
      doc.text(`Phone: ${storeData.phone}`, this.margin, yPosition);
      yPosition += 5;
    }
    if (storeData.email) {
      doc.text(`Email: ${storeData.email}`, this.margin, yPosition);
      yPosition += 5;
    }
    if (storeData.gstin) {
      doc.text(`GSTIN: ${storeData.gstin}`, this.margin, yPosition);
      yPosition += 5;
    }

    yPosition += 10;
    return yPosition;
  }

  /**
   * Add customer information to PDF
   *
   * @param {Object} doc jsPDF document
   * @param {Object} customerData Customer information
   * @param {number} yPosition Current Y position
   * @returns {number} New Y position
   */
  addCustomerInfo(doc, customerData, yPosition) {
    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("Bill To:", this.margin, yPosition);
    yPosition += 7;

    doc.setFont(undefined, "normal");
    doc.text(customerData.name || "Customer", this.margin, yPosition);
    yPosition += 5;

    if (customerData.address) {
      const addressLines = this.wrapText(customerData.address, 50);
      addressLines.forEach(line => {
        doc.text(line, this.margin, yPosition);
        yPosition += 5;
      });
    }

    if (customerData.phone) {
      doc.text(`Phone: ${customerData.phone}`, this.margin, yPosition);
      yPosition += 5;
    }

    if (customerData.email) {
      doc.text(`Email: ${customerData.email}`, this.margin, yPosition);
      yPosition += 5;
    }

    yPosition += 10;
    return yPosition;
  }

  /**
   * Add invoice details to PDF
   *
   * @param {Object} doc jsPDF document
   * @param {Object} invoiceData Invoice data
   * @param {number} yPosition Current Y position
   * @returns {number} New Y position
   */
  addInvoiceDetails(doc, invoiceData, yPosition) {
    // Invoice number and date on the right side
    const rightColumn = this.pageWidth - this.margin - 60;

    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text("Invoice Details:", this.margin, yPosition);
    yPosition += 7;

    doc.setFont(undefined, "normal");
    doc.text(`Invoice #: ${invoiceData.invoiceNumber || invoiceData._id}`, rightColumn, yPosition);
    yPosition += 5;
    doc.text(`Date: ${new Date(invoiceData.date || invoiceData.createdAt).toLocaleDateString()}`, rightColumn, yPosition);
    yPosition += 5;

    if (invoiceData.paymentMethod) {
      doc.text(`Payment: ${invoiceData.paymentMethod}`, rightColumn, yPosition);
      yPosition += 5;
    }

    yPosition += 10;
    return yPosition;
  }

  /**
   * Add items table to PDF
   *
   * @param {Object} doc jsPDF document
   * @param {Array} items Array of invoice items
   * @param {number} yPosition Current Y position
   * @returns {number} New Y position
   */
  addItemsTable(doc, items, yPosition) {
    if (!items || items.length === 0) {
      return yPosition;
    }

    // Table headers
    doc.setFont(undefined, "bold");
    doc.setFontSize(10);
    
    const headers = ["#", "Item", "Qty", "Price", "Total"];
    const columnWidths = [10, 80, 20, 30, 30];
    let xPos = this.margin;

    headers.forEach((header, index) => {
      doc.text(header, xPos, yPosition);
      xPos += columnWidths[index];
    });

    yPosition += 7;

    // Table rows
    doc.setFont(undefined, "normal");
    items.forEach((item, index) => {
      // Check if we need a new page
      if (yPosition > this.pageHeight - 50) {
        doc.addPage();
        yPosition = this.margin;
        
        // Repeat headers on new page
        doc.setFont(undefined, "bold");
        xPos = this.margin;
        headers.forEach((header, colIndex) => {
          doc.text(header, xPos, yPosition);
          xPos += columnWidths[colIndex];
        });
        yPosition += 7;
        doc.setFont(undefined, "normal");
      }

      xPos = this.margin;
      
      // Serial number
      doc.text((index + 1).toString(), xPos, yPosition);
      xPos += columnWidths[0];
      
      // Item name (truncate if too long)
      const itemName = item.name || "Unknown Item";
      const truncatedName = itemName.length > 30 ? itemName.substring(0, 27) + "..." : itemName;
      doc.text(truncatedName, xPos, yPosition);
      xPos += columnWidths[1];
      
      // Quantity
      doc.text(item.quantity.toString(), xPos, yPosition);
      xPos += columnWidths[2];
      
      // Price
      doc.text(`₹${parseFloat(item.price || 0).toFixed(2)}`, xPos, yPosition);
      xPos += columnWidths[3];
      
      // Total
      const itemTotal = (item.price || 0) * (item.quantity || 0);
      doc.text(`₹${itemTotal.toFixed(2)}`, xPos, yPosition);
      
      yPosition += 6;
    });

    yPosition += 10;
    return yPosition;
  }

  /**
   * Add totals section to PDF
   *
   * @param {Object} doc jsPDF document
   * @param {Object} invoiceData Invoice data
   * @param {number} yPosition Current Y position
   * @returns {number} New Y position
   */
  addTotals(doc, invoiceData, yPosition) {
    const totalsColumn = this.pageWidth - this.margin - 60;
    
    doc.setFont(undefined, "bold");
    doc.setFontSize(10);
    
    // Subtotal
    doc.text("Subtotal:", totalsColumn, yPosition);
    doc.text(`₹${parseFloat(invoiceData.subtotal || invoiceData.total || 0).toFixed(2)}`, this.pageWidth - this.margin, yPosition);
    yPosition += 6;
    
    // Discount
    if (invoiceData.discountAmount && invoiceData.discountAmount > 0) {
      doc.text("Discount:", totalsColumn, yPosition);
      doc.text(`-₹${parseFloat(invoiceData.discountAmount).toFixed(2)}`, this.pageWidth - this.margin, yPosition);
      yPosition += 6;
    }
    
    // GST
    if (invoiceData.gstAmount && invoiceData.gstAmount > 0) {
      doc.text("GST:", totalsColumn, yPosition);
      doc.text(`₹${parseFloat(invoiceData.gstAmount).toFixed(2)}`, this.pageWidth - this.margin, yPosition);
      yPosition += 6;
    }
    
    // Total
    doc.setFont(undefined, "bold");
    doc.setFontSize(12);
    doc.text("Total:", totalsColumn, yPosition);
    doc.text(`₹${parseFloat(invoiceData.total || 0).toFixed(2)}`, this.pageWidth - this.margin, yPosition);
    yPosition += 8;
    
    // Paid
    if (invoiceData.paid !== undefined) {
      doc.setFont(undefined, "normal");
      doc.setFontSize(10);
      doc.text("Paid:", totalsColumn, yPosition);
      doc.text(`₹${parseFloat(invoiceData.paid).toFixed(2)}`, this.pageWidth - this.margin, yPosition);
      yPosition += 6;
      
      // Balance
      const balance = (invoiceData.total || 0) - (invoiceData.paid || 0);
      doc.text("Balance:", totalsColumn, yPosition);
      doc.text(`₹${balance.toFixed(2)}`, this.pageWidth - this.margin, yPosition);
      yPosition += 6;
    }

    return yPosition;
  }

  /**
   * Add footer to PDF
   *
   * @param {Object} doc jsPDF document
   * @param {Object} storeData Store information
   * @returns {void}
   */
  addFooter(doc, storeData) {
    const footerY = this.pageHeight - 20;
    
    doc.setFont(undefined, "italic");
    doc.setFontSize(8);
    
    // Thank you message
    doc.text("Thank you for your business!", this.margin, footerY);
    
    // Terms and conditions
    if (storeData.terms) {
      const terms = "Terms: " + storeData.terms;
      doc.text(terms, this.margin, footerY + 5);
    }
  }

  /**
   * Wrap text to fit within specified width
   *
   * @param {string} text Text to wrap
   * @param {number} maxWidth Maximum width in characters
   * @returns {Array} Array of wrapped lines
   */
  wrapText(text, maxWidth) {
    if (!text) return [];
    
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";
    
    words.forEach(word => {
      if ((currentLine + word).length <= maxWidth) {
        currentLine += (currentLine ? " " : "") + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    });
    
    if (currentLine) lines.push(currentLine);
    
    return lines;
  }

  /**
   * Generate a receipt PDF
   *
   * @param {Object} receiptData Receipt data object
   * @param {Object} storeData Store information
   * @param {function} callback Callback function
   * @returns {void}
   */
  generateReceiptPDF(receiptData, storeData, callback) {
    try {
      const doc = new jsPDF();
      let yPosition = this.margin;

      // Set font
      doc.setFont(this.defaultFont);
      doc.setFontSize(this.fontSize);

      // Add store header
      yPosition = this.addStoreHeader(doc, storeData, yPosition);

      // Add receipt title
      doc.setFontSize(16);
      doc.setFont(undefined, "bold");
      doc.text("RECEIPT", this.pageWidth / 2 - 20, yPosition);
      yPosition += 15;

      // Add receipt details
      doc.setFontSize(10);
      doc.setFont(undefined, "normal");
      doc.text(`Receipt #: ${receiptData.receiptNumber || receiptData._id}`, this.margin, yPosition);
      yPosition += 5;
      doc.text(`Date: ${new Date(receiptData.date || receiptData.createdAt).toLocaleDateString()}`, this.margin, yPosition);
      yPosition += 5;
      doc.text(`Time: ${new Date(receiptData.date || receiptData.createdAt).toLocaleTimeString()}`, this.margin, yPosition);
      yPosition += 10;

      // Add items table
      yPosition = this.addItemsTable(doc, receiptData.items, yPosition);

      // Add totals
      yPosition = this.addTotals(doc, receiptData, yPosition);

      // Add payment information
      if (receiptData.paymentMethod) {
        yPosition += 10;
        doc.setFont(undefined, "bold");
        doc.text("Payment Information:", this.margin, yPosition);
        yPosition += 7;
        doc.setFont(undefined, "normal");
        doc.text(`Method: ${receiptData.paymentMethod}`, this.margin, yPosition);
        yPosition += 5;
        if (receiptData.paymentReference) {
          doc.text(`Reference: ${receiptData.paymentReference}`, this.margin, yPosition);
          yPosition += 5;
        }
      }

      // Add footer
      this.addFooter(doc, storeData);

      // Generate PDF buffer
      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

      // Save PDF to file if path is provided
      let filePath = null;
      if (receiptData.savePath) {
        filePath = receiptData.savePath;
        fs.writeFileSync(filePath, pdfBuffer);
      }

      callback(null, {
        buffer: pdfBuffer,
        path: filePath,
        filename: `receipt_${receiptData.receiptNumber || receiptData._id}.pdf`
      });
    } catch (error) {
      callback(error);
    }
  }
}

module.exports = new PDFGenerator();