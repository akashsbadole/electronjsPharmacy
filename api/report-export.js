const express = require("express");
const router = express.Router();
const bodyParser = require("body-parser");
const jsPDF = require("jspdf");
const path = require("path");
const moment = require("moment");

router.use(bodyParser.json());

module.exports = router;

/**
 * GET endpoint: Get welcome message for Report Export API.
 */
router.get("/", function (req, res) {
    res.send("Report Export API");
});

/**
 * POST endpoint: Export report to CSV format
 */
router.post("/csv", function (req, res) {
    const { data, fields, filename, includeHeaders = true } = req.body;

    if (!data || !Array.isArray(data) || !fields || !Array.isArray(fields)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Data and fields arrays are required.",
        });
    }

    try {
        let csvContent = "";

        // Add headers if requested
        if (includeHeaders) {
            const headers = fields.map(field => `"${field.label || field.key}"`);
            csvContent += headers.join(",") + "\n";
        }

        // Add data rows
        data.forEach(row => {
            const values = fields.map(field => {
                let value = row[field.key] || "";
                
                // Handle different data types
                if (field.type === "date" && value) {
                    value = moment(value).format(field.format || "YYYY-MM-DD");
                } else if (field.type === "currency" && value) {
                    value = parseFloat(value).toFixed(2);
                } else if (field.type === "number" && value) {
                    value = parseFloat(value);
                }

                // Escape commas and quotes in values
                if (typeof value === "string" && (value.includes(",") || value.includes("\""))) {
                    value = `"${value.replace(/"/g, '""')}"`;
                } else if (typeof value !== "string") {
                    value = `"${value}"`;
                }

                return value;
            });
            csvContent += values.join(",") + "\n";
        });

        const defaultFilename = filename || `report-${moment().format("YYYY-MM-DD-HH-mm-ss")}.csv`;
        const finalFilename = defaultFilename.endsWith(".csv") ? defaultFilename : `${defaultFilename}.csv`;

        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
        res.send(csvContent);

    } catch (error) {
        res.status(500).json({
            error: "Export Failed",
            message: error.message
        });
    }
});

/**
 * POST endpoint: Export report to Excel format (simplified CSV approach)
 */
router.post("/excel", function (req, res) {
    const { data, fields, filename, includeHeaders = true } = req.body;

    if (!data || !Array.isArray(data) || !fields || !Array.isArray(fields)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Data and fields arrays are required.",
        });
    }

    try {
        // For simplicity, we'll create a tab-separated format that Excel can open
        let excelContent = "";

        // Add headers if requested
        if (includeHeaders) {
            const headers = fields.map(field => field.label || field.key);
            excelContent += headers.join("\t") + "\n";
        }

        // Add data rows
        data.forEach(row => {
            const values = fields.map(field => {
                let value = row[field.key] || "";
                
                // Handle different data types
                if (field.type === "date" && value) {
                    value = moment(value).format(field.format || "YYYY-MM-DD");
                } else if (field.type === "currency" && value) {
                    value = parseFloat(value).toFixed(2);
                } else if (field.type === "number" && value) {
                    value = parseFloat(value);
                }

                // Convert to string and escape tabs
                return String(value).replace(/\t/g, " ");
            });
            excelContent += values.join("\t") + "\n";
        });

        const defaultFilename = filename || `report-${moment().format("YYYY-MM-DD-HH-mm-ss")}.xlsx`;
        const finalFilename = defaultFilename.endsWith(".xlsx") ? defaultFilename : `${defaultFilename}.xlsx`;

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
        res.send(excelContent);

    } catch (error) {
        res.status(500).json({
            error: "Export Failed",
            message: error.message
        });
    }
});

/**
 * POST endpoint: Export report to PDF format
 */
router.post("/pdf", function (req, res) {
    const { data, fields, filename, title = "Report", includeHeaders = true, summary = {} } = req.body;

    if (!data || !Array.isArray(data) || !fields || !Array.isArray(fields)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Data and fields arrays are required.",
        });
    }

    try {
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        let yPosition = 20;

        // Add title
        doc.setFontSize(18);
        doc.text(title, pageWidth / 2, yPosition, { align: "center" });
        yPosition += 15;

        // Add generation date
        doc.setFontSize(10);
        doc.text(`Generated: ${moment().format("YYYY-MM-DD HH:mm:ss")}`, pageWidth / 2, yPosition, { align: "center" });
        yPosition += 15;

        // Add summary if provided
        if (Object.keys(summary).length > 0) {
            doc.setFontSize(12);
            doc.text("Summary:", 20, yPosition);
            yPosition += 10;

            doc.setFontSize(10);
            Object.keys(summary).forEach(key => {
                if (yPosition > pageHeight - 20) {
                    doc.addPage();
                    yPosition = 20;
                }
                
                let value = summary[key];
                if (typeof value === "number") {
                    value = value.toLocaleString();
                }
                doc.text(`${key}: ${value}`, 25, yPosition);
                yPosition += 7;
            });
            yPosition += 10;
        }

        // Add table headers
        if (includeHeaders) {
            doc.setFontSize(12);
            doc.text("Report Data:", 20, yPosition);
            yPosition += 10;

            const headers = fields.map(field => field.label || field.key);
            const columnWidth = (pageWidth - 40) / headers.length;
            
            doc.setFontSize(10);
            headers.forEach((header, index) => {
                const xPosition = 20 + (index * columnWidth);
                doc.text(header, xPosition, yPosition);
            });
            yPosition += 7;

            // Add line under headers
            doc.line(20, yPosition, pageWidth - 20, yPosition);
            yPosition += 5;
        }

        // Add data rows
        doc.setFontSize(9);
        const columnWidth = (pageWidth - 40) / fields.length;

        data.forEach((row, rowIndex) => {
            // Check if we need a new page
            if (yPosition > pageHeight - 20) {
                doc.addPage();
                yPosition = 20;

                // Repeat headers on new page
                if (includeHeaders) {
                    const headers = fields.map(field => field.label || field.key);
                    doc.setFontSize(10);
                    headers.forEach((header, index) => {
                        const xPosition = 20 + (index * columnWidth);
                        doc.text(header, xPosition, yPosition);
                    });
                    yPosition += 7;
                    doc.line(20, yPosition, pageWidth - 20, yPosition);
                    yPosition += 5;
                    doc.setFontSize(9);
                }
            }

            fields.forEach((field, index) => {
                let value = row[field.key] || "";
                
                // Handle different data types
                if (field.type === "date" && value) {
                    value = moment(value).format(field.format || "YYYY-MM-DD");
                } else if (field.type === "currency" && value) {
                    value = parseFloat(value).toFixed(2);
                } else if (field.type === "number" && value) {
                    value = parseFloat(value).toLocaleString();
                }

                const xPosition = 20 + (index * columnWidth);
                const maxWidth = columnWidth - 5;
                
                // Truncate text if it's too long
                if (doc.getTextWidth(value) > maxWidth) {
                    while (doc.getTextWidth(value + "...") > maxWidth && value.length > 0) {
                        value = value.slice(0, -1);
                    }
                    value += "...";
                }
                
                doc.text(String(value), xPosition, yPosition);
            });
            yPosition += 6;
        });

        // Add page numbers
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 10, { align: "center" });
        }

        const defaultFilename = filename || `report-${moment().format("YYYY-MM-DD-HH-mm-ss")}.pdf`;
        const finalFilename = defaultFilename.endsWith(".pdf") ? defaultFilename : `${defaultFilename}.pdf`;

        const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
        res.send(pdfBuffer);

    } catch (error) {
        res.status(500).json({
            error: "Export Failed",
            message: error.message
        });
    }
});

/**
 * POST endpoint: Export report to JSON format
 */
router.post("/json", function (req, res) {
    const { data, fields, filename, includeMetadata = true, summary = {} } = req.body;

    if (!data || !Array.isArray(data) || !fields || !Array.isArray(fields)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Data and fields arrays are required.",
        });
    }

    try {
        const exportData = {
            exportedAt: new Date(),
            filename: filename || `report-${moment().format("YYYY-MM-DD-HH-mm-ss")}`,
            format: "json"
        };

        if (includeMetadata) {
            exportData.metadata = {
                fields: fields,
                totalRecords: data.length,
                summary: summary
            };
        }

        exportData.data = data;

        const defaultFilename = filename || `report-${moment().format("YYYY-MM-DD-HH-mm-ss")}.json`;
        const finalFilename = defaultFilename.endsWith(".json") ? defaultFilename : `${defaultFilename}.json`;

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
        res.json(exportData);

    } catch (error) {
        res.status(500).json({
            error: "Export Failed",
            message: error.message
        });
    }
});

/**
 * GET endpoint: Get available export formats
 */
router.get("/formats", function (req, res) {
    const formats = [
        {
            id: "csv",
            name: "CSV (Comma Separated Values)",
            description: "Universal format compatible with spreadsheet applications",
            extension: "csv",
            mimeType: "text/csv"
        },
        {
            id: "excel",
            name: "Excel (XLSX)",
            description: "Microsoft Excel format",
            extension: "xlsx",
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        },
        {
            id: "pdf",
            name: "PDF (Portable Document Format)",
            description: "Document format for printing and sharing",
            extension: "pdf",
            mimeType: "application/pdf"
        },
        {
            id: "json",
            name: "JSON (JavaScript Object Notation)",
            description: "Data format for developers and APIs",
            extension: "json",
            mimeType: "application/json"
        }
    ];

    res.json({ formats: formats });
});

/**
 * POST endpoint: Export report with format selection
 */
router.post("/export", function (req, res) {
    const { data, fields, filename, format, title, includeHeaders = true, summary = {}, includeMetadata = true } = req.body;

    if (!data || !Array.isArray(data) || !fields || !Array.isArray(fields) || !format) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Data, fields arrays, and format are required.",
        });
    }

    const validFormats = ["csv", "excel", "pdf", "json"];
    if (!validFormats.includes(format)) {
        return res.status(400).json({
            error: "Bad Request",
            message: "Invalid export format. Valid formats are: csv, excel, pdf, json",
        });
    }

    // Route to the appropriate export endpoint
    const exportReq = {
        body: {
            data,
            fields,
            filename,
            title,
            includeHeaders,
            summary,
            includeMetadata
        }
    };

    switch (format) {
        case "csv":
            return module.exports.children["/csv"](exportReq, res);
        case "excel":
            return module.exports.children["/excel"](exportReq, res);
        case "pdf":
            return module.exports.children["/pdf"](exportReq, res);
        case "json":
            return module.exports.children["/json"](exportReq, res);
        default:
            return res.status(400).json({
                error: "Bad Request",
                message: "Unsupported export format",
            });
    }
});