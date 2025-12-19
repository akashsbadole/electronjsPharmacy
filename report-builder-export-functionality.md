# Report Builder Export Functionality Design

## Overview

This document defines the export functionality for the PharmaSoft custom report builder system. The design supports multiple export formats (PDF, Excel, CSV, JSON) with customizable options, templates, and delivery methods while ensuring security and performance.

## Export Architecture

### 1. Export Service Structure

```javascript
// Main export service class
class ReportExportService {
  constructor() {
    this.exporters = {
      pdf: new PDFExporter(),
      excel: new ExcelExporter(),
      csv: new CSVExporter(),
      json: new JSONExporter()
    };
    
    this.templates = new ExportTemplateManager();
    this.queue = new ExportQueue();
    this.storage = new ExportStorage();
  }

  async exportReport(executionId, format, options = {}) {
    try {
      // Validate export format
      if (!this.exporters[format]) {
        throw new Error(`Unsupported export format: ${format}`);
      }

      // Check user permissions
      const user = await this.getCurrentUser();
      if (!this.hasExportPermission(user, format)) {
        throw new Error(`Permission denied for ${format} export`);
      }

      // Get report data
      const reportData = await this.getReportData(executionId);
      
      // Check data size limits
      if (!this.checkDataLimits(reportData, format, user)) {
        throw new Error('Export data exceeds allowed limits');
      }

      // Generate export
      const exporter = this.exporters[format];
      const exportResult = await exporter.export(reportData, options);

      // Save export record
      const exportRecord = await this.saveExportRecord({
        executionId,
        format,
        options,
        filePath: exportResult.filePath,
        fileSize: exportResult.fileSize,
        userId: user._id
      });

      // Apply delivery options
      if (options.delivery) {
        await this.deliverExport(exportRecord, options.delivery);
      }

      return exportRecord;
    } catch (error) {
      console.error('Export error:', error);
      throw error;
    }
  }

  async getExportStatus(exportId) {
    return await this.storage.getExportRecord(exportId);
  }

  async downloadExport(exportId) {
    const exportRecord = await this.storage.getExportRecord(exportId);
    
    if (!exportRecord) {
      throw new Error('Export not found');
    }

    // Check permissions
    const user = await this.getCurrentUser();
    if (exportRecord.userId !== user._id && !user.permissions.includes('admin')) {
      throw new Error('Access denied');
    }

    return {
      filePath: exportRecord.filePath,
      filename: exportRecord.filename,
      mimeType: this.getMimeType(exportRecord.format)
    };
  }

  hasExportPermission(user, format) {
    const permission = `reports.export.${format}`;
    return user.permissions.includes(permission) || user.role === 'admin';
  }

  checkDataLimits(reportData, format, user) {
    const recordCount = reportData.data.length;
    const maxRecords = this.getMaxRecordsForUser(user, format);
    
    return recordCount <= maxRecords;
  }

  getMaxRecordsForUser(user, format) {
    // Define limits based on user role and format
    const limits = {
      admin: {
        pdf: 50000,
        excel: 100000,
        csv: 100000,
        json: 50000
      },
      manager: {
        pdf: 25000,
        excel: 50000,
        csv: 50000,
        json: 25000
      },
      cashier: {
        pdf: 5000,
        excel: 10000,
        csv: 10000,
        json: 5000
      },
      viewer: {
        pdf: 1000,
        excel: 2000,
        csv: 2000,
        json: 1000
      }
    };

    return limits[user.role]?.[format] || limits.viewer[format];
  }

  getMimeType(format) {
    const mimeTypes = {
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv',
      json: 'application/json'
    };

    return mimeTypes[format] || 'application/octet-stream';
  }
}
```

### 2. PDF Exporter

```javascript
class PDFExporter {
  constructor() {
    this.defaultOptions = {
      pageSize: 'A4',
      orientation: 'portrait',
      margins: {
        top: 20,
        right: 20,
        bottom: 20,
        left: 20
      },
      header: {
        enabled: true,
        height: 60,
        includeLogo: true,
        includeTitle: true,
        includeDate: true,
        includePageNumbers: true
      },
      footer: {
        enabled: true,
        height: 40,
        includePageNumbers: true,
        includeGeneratedBy: true
      },
      table: {
        headerStyle: {
          fontSize: 10,
          bold: true,
          fillColor: '#f2f2f2',
          textColor: '#333333'
        },
        bodyStyle: {
          fontSize: 9,
          textColor: '#333333'
        },
        alternateRowStyle: {
          fillColor: '#f9f9f9'
        },
        cellPadding: 5
      }
    };
  }

  async export(reportData, options = {}) {
    const config = { ...this.defaultOptions, ...options };
    
    try {
      // Create PDF document
      const doc = new PDFDocument({
        size: config.pageSize,
        margins: config.margins
      });

      // Add metadata
      this.addMetadata(doc, reportData, config);

      // Add header
      if (config.header.enabled) {
        this.addHeader(doc, reportData, config);
      }

      // Add title and summary
      this.addTitleAndSummary(doc, reportData, config);

      // Add charts if available
      if (reportData.charts && reportData.charts.length > 0) {
        await this.addCharts(doc, reportData.charts, config);
      }

      // Add table data
      this.addTable(doc, reportData, config);

      // Add footer
      if (config.footer.enabled) {
        this.addFooter(doc, reportData, config);
      }

      // Generate file
      const filePath = await this.generatePDFFile(doc, reportData);
      const fileSize = await this.getFileSize(filePath);

      return {
        filePath,
        fileSize,
        format: 'pdf'
      };
    } catch (error) {
      console.error('PDF export error:', error);
      throw new Error('Failed to generate PDF export');
    }
  }

  addMetadata(doc, reportData, config) {
    doc.info.Title = reportData.title || 'Report';
    doc.info.Author = 'PharmaSoft Report Builder';
    doc.info.Subject = reportData.description || '';
    doc.info.Creator = 'PharmaSoft';
    doc.info.Producer = 'PharmaSoft Report Builder';
    doc.info.CreationDate = new Date();
  }

  addHeader(doc, reportData, config) {
    const { header } = config;
    
    if (header.includeLogo) {
      // Add company logo (placeholder)
      doc.image('assets/images/logo.svg', 50, 20, { width: 100 });
    }

    let yPosition = 30;

    if (header.includeTitle) {
      doc.fontSize(16).fillColor('#333333');
      doc.text(reportData.title || 'Report', 200, yPosition, { align: 'center' });
      yPosition += 25;
    }

    if (header.includeDate) {
      doc.fontSize(10).fillColor('#666666');
      doc.text(`Generated: ${new Date().toLocaleDateString()}`, 200, yPosition, { align: 'center' });
    }

    if (header.includePageNumbers) {
      doc.fontSize(8).fillColor('#999999');
      doc.text('Page ', doc.page.width() - 50, doc.page.height() - 30, { align: 'right' });
    }
  }

  addTitleAndSummary(doc, reportData, config) {
    let yPosition = 100;

    // Add report description
    if (reportData.description) {
      doc.fontSize(12).fillColor('#333333');
      doc.text(reportData.description, 50, yPosition);
      yPosition += 20;
    }

    // Add summary cards if available
    if (reportData.summaries && reportData.summaries.length > 0) {
      yPosition += 10;
      doc.fontSize(14).fillColor('#333333');
      doc.text('Summary', 50, yPosition);
      yPosition += 20;

      reportData.summaries.forEach(summary => {
        doc.fontSize(10).fillColor('#666666');
        doc.text(`${summary.label}: ${this.formatSummaryValue(summary.value, summary.type)}`, 70, yPosition);
        yPosition += 15;
      });

      yPosition += 10;
    }
  }

  async addCharts(doc, charts, config) {
    let yPosition = doc.y + 20;

    doc.fontSize(14).fillColor('#333333');
    doc.text('Charts', 50, yPosition);
    yPosition += 30;

    for (const chart of charts) {
      // Add chart image (charts would be pre-generated as images)
      if (chart.imagePath) {
        try {
          doc.image(chart.imagePath, 50, yPosition, {
            width: doc.page.width() - 100,
            height: 200
          });
          yPosition += 220;
          
          // Add chart title
          doc.fontSize(12).fillColor('#333333');
          doc.text(chart.title, 50, yPosition);
          yPosition += 30;
        } catch (error) {
          console.error('Error adding chart image:', error);
        }
      }
    }
  }

  addTable(doc, reportData, config) {
    const { table } = config;
    const { columns, data } = reportData;

    let yPosition = doc.y + 20;

    // Add table title
    doc.fontSize(14).fillColor('#333333');
    doc.text('Report Data', 50, yPosition);
    yPosition += 30;

    // Calculate column widths
    const pageWidth = doc.page.width() - config.margins.left - config.margins.right;
    const columnWidths = this.calculateColumnWidths(columns, pageWidth);

    // Add table header
    this.addTableHeader(doc, columns, columnWidths, yPosition, table.headerStyle);
    yPosition += 25;

    // Add table rows
    data.forEach((row, index) => {
      if (yPosition > doc.page.height() - 100) {
        doc.addPage();
        yPosition = 50;
        this.addTableHeader(doc, columns, columnWidths, yPosition, table.headerStyle);
        yPosition += 25;
      }

      const rowStyle = index % 2 === 1 ? table.alternateRowStyle : table.bodyStyle;
      this.addTableRow(doc, row, columns, columnWidths, yPosition, rowStyle);
      yPosition += 20;
    });
  }

  addTableHeader(doc, columns, columnWidths, yPosition, style) {
    let xPosition = 50;

    columns.forEach((column, index) => {
      doc.fontSize(style.fontSize).fillColor(style.fillColor);
      
      if (style.bold) {
        doc.font('Helvetica-Bold');
      }

      doc.text(column.label, xPosition, yPosition, {
        width: columnWidths[index],
        ellipsis: true
      });

      xPosition += columnWidths[index];
    });

    // Reset font
    doc.font('Helvetica');
  }

  addTableRow(doc, row, columns, columnWidths, yPosition, style) {
    let xPosition = 50;

    columns.forEach((column, index) => {
      doc.fontSize(style.fontSize).fillColor(style.textColor);
      
      const value = this.formatCellValue(row[column.key], column.type);
      doc.text(value, xPosition, yPosition, {
        width: columnWidths[index],
        ellipsis: true
      });

      xPosition += columnWidths[index];
    });
  }

  calculateColumnWidths(columns, pageWidth) {
    const totalColumns = columns.length;
    const baseWidth = pageWidth / totalColumns;
    
    return columns.map(column => {
      // Adjust width based on content type
      switch (column.type) {
        case 'number':
        case 'currency':
          return baseWidth * 0.8;
        case 'date':
          return baseWidth * 0.9;
        default:
          return baseWidth;
      }
    });
  }

  addFooter(doc, reportData, config) {
    const { footer } = config;
    const pageCount = doc.bufferedPageRange().count;

    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      
      let yPosition = doc.page.height() - 60;

      if (footer.includePageNumbers) {
        doc.fontSize(8).fillColor('#999999');
        doc.text(`Page ${i + 1} of ${pageCount}`, doc.page.width() - 50, yPosition, { align: 'right' });
      }

      if (footer.includeGeneratedBy) {
        doc.fontSize(8).fillColor('#999999');
        doc.text('Generated by PharmaSoft Report Builder', 50, yPosition);
      }
    }
  }

  async generatePDFFile(doc, reportData) {
    const filename = `report_${reportData.executionId}_${Date.now()}.pdf`;
    const filePath = path.join(exportsPath, filename);

    return new Promise((resolve, reject) => {
      const stream = fs.createWriteStream(filePath);
      
      stream.on('error', reject);
      stream.on('finish', () => resolve(filePath));
      
      doc.pipe(stream);
      doc.end();
    });
  }

  formatSummaryValue(value, type) {
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR'
        }).format(value);
      case 'percentage':
        return `${value}%`;
      case 'number':
        return new Intl.NumberFormat('en-IN').format(value);
      default:
        return value;
    }
  }

  formatCellValue(value, type) {
    if (value === null || value === undefined) return '';
    
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR'
        }).format(value);
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'percentage':
        return `${value}%`;
      default:
        return value.toString();
    }
  }

  async getFileSize(filePath) {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  }
}
```

### 3. Excel Exporter

```javascript
class ExcelExporter {
  constructor() {
    this.defaultOptions = {
      includeHeaders: true,
      includeSummary: true,
      includeCharts: false,
      autoFilter: true,
      freezeHeaderRow: true,
      columnWidths: 'auto', // 'auto' or array of widths
      styling: {
        header: {
          font: { bold: true, color: { argb: 'FF333333' } },
          fill: { fgColor: { argb: 'FFF2F2F2' } },
          border: { bottom: { style: 'thin' } }
        },
        summary: {
          font: { bold: true, color: { argb: 'FF333333' } },
          fill: { fgColor: { argb: 'FFE8F5E8' } }
        },
        currency: {
          numFmt: '"₹"#,##0.00'
        },
        percentage: {
          numFmt: '0.00%'
        },
        date: {
          numFmt: 'dd/mm/yyyy'
        }
      }
    };
  }

  async export(reportData, options = {}) {
    const config = { ...this.defaultOptions, ...options };
    
    try {
      // Create Excel workbook
      const workbook = new ExcelJS.Workbook();
      
      // Add metadata
      this.addWorkbookMetadata(workbook, reportData);

      // Create main data sheet
      const dataSheet = this.createDataSheet(workbook, reportData, config);

      // Create summary sheet if requested
      if (config.includeSummary && reportData.summaries) {
        this.createSummarySheet(workbook, reportData, config);
      }

      // Create charts sheet if requested
      if (config.includeCharts && reportData.charts) {
        await this.createChartsSheet(workbook, reportData, config);
      }

      // Generate file
      const filePath = await this.generateExcelFile(workbook, reportData);
      const fileSize = await this.getFileSize(filePath);

      return {
        filePath,
        fileSize,
        format: 'excel'
      };
    } catch (error) {
      console.error('Excel export error:', error);
      throw new Error('Failed to generate Excel export');
    }
  }

  addWorkbookMetadata(workbook, reportData) {
    workbook.creator = 'PharmaSoft Report Builder';
    workbook.lastModifiedBy = 'PharmaSoft';
    workbook.created = new Date();
    workbook.modified = new Date();
    workbook.properties.title = reportData.title || 'Report';
    workbook.properties.subject = reportData.description || '';
    workbook.properties.description = 'Generated by PharmaSoft Report Builder';
  }

  createDataSheet(workbook, reportData, config) {
    const worksheet = workbook.addWorksheet('Report Data');
    const { columns, data } = reportData;

    // Set column headers
    if (config.includeHeaders) {
      const headerRow = worksheet.addRow(columns.map(col => col.label));
      this.applyHeaderStyling(headerRow, config.styling.header);
    }

    // Add data rows
    data.forEach((row, index) => {
      const values = columns.map(col => this.formatCellValue(row[col.key], col.type));
      const dataRow = worksheet.addRow(values);
      
      // Apply cell styling based on data type
      columns.forEach((col, colIndex) => {
        const cell = dataRow.getCell(colIndex + 1);
        this.applyCellStyling(cell, col.type, config.styling);
      });
    });

    // Auto-filter
    if (config.autoFilter && config.includeHeaders) {
      worksheet.autoFilter = {
        from: 'A1',
        to: `${this.getColumnLetter(columns.length)}${data.length + 1}`
      };
    }

    // Freeze header row
    if (config.freezeHeaderRow && config.includeHeaders) {
      worksheet.views = [
        { state: 'frozen', ySplit: 1 }
      ];
    }

    // Set column widths
    this.setColumnWidths(worksheet, columns, config.columnWidths);

    return worksheet;
  }

  createSummarySheet(workbook, reportData, config) {
    const worksheet = workbook.addWorksheet('Summary');
    const { summaries } = reportData;

    // Add title
    worksheet.addRow(['Report Summary']);
    worksheet.getCell('A1').font = { bold: true, size: 14 };
    worksheet.getCell('A1').fill = { fgColor: { argb: 'FFF2F2F2' } };

    // Add summary items
    let rowIndex = 3;
    summaries.forEach(summary => {
      worksheet.addRow([summary.label, this.formatSummaryValue(summary.value, summary.type)]);
      
      const labelCell = worksheet.getCell(`A${rowIndex}`);
      const valueCell = worksheet.getCell(`B${rowIndex}`);
      
      labelCell.font = { bold: true };
      valueCell.font = { bold: true };
      
      // Apply summary styling
      if (config.styling.summary) {
        Object.assign(labelCell, config.styling.summary);
        Object.assign(valueCell, config.styling.summary);
      }

      rowIndex++;
    });

    // Set column widths
    worksheet.getColumn(1).width = 30;
    worksheet.getColumn(2).width = 20;

    return worksheet;
  }

  async createChartsSheet(workbook, reportData, config) {
    const worksheet = workbook.addWorksheet('Charts');
    const { charts } = reportData;

    // Add title
    worksheet.addRow(['Report Charts']);
    worksheet.getCell('A1').font = { bold: true, size: 14 };

    // Add chart images (charts would be pre-generated as images)
    let rowIndex = 3;
    for (const chart of charts) {
      if (chart.imagePath) {
        try {
          const imageId = workbook.addImage({
            filename: chart.imagePath,
            extension: 'png'
          });

          worksheet.addImage(imageId, {
            tl: { col: 0, row: rowIndex - 1 },
            ext: { width: 800, height: 400 }
          });

          // Add chart title
          worksheet.getCell(`A${rowIndex}`).value = chart.title;
          worksheet.getCell(`A${rowIndex}`).font = { bold: true, size: 12 };

          rowIndex += 25; // Approximate rows for image height
        } catch (error) {
          console.error('Error adding chart image:', error);
        }
      }
    }

    return worksheet;
  }

  applyHeaderStyling(headerRow, style) {
    headerRow.eachCell((cell, colNumber) => {
      Object.assign(cell, style);
    });
  }

  applyCellStyling(cell, type, styling) {
    switch (type) {
      case 'currency':
        cell.numFmt = styling.currency.numFmt;
        break;
      case 'percentage':
        cell.numFmt = styling.percentage.numFmt;
        break;
      case 'date':
      case 'datetime':
        cell.numFmt = styling.date.numFmt;
        break;
    }
  }

  setColumnWidths(worksheet, columns, widthConfig) {
    if (widthConfig === 'auto') {
      columns.forEach((col, index) => {
        const column = worksheet.getColumn(index + 1);
        
        // Set width based on content type
        switch (col.type) {
          case 'number':
          case 'currency':
            column.width = 15;
            break;
          case 'date':
            column.width = 12;
            break;
          default:
            column.width = 20;
        }
      });
    } else if (Array.isArray(widthConfig)) {
      widthConfig.forEach((width, index) => {
        if (index < columns.length) {
          worksheet.getColumn(index + 1).width = width;
        }
      });
    }
  }

  getColumnLetter(columnNumber) {
    let letters = '';
    while (columnNumber > 0) {
      const remainder = (columnNumber - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      columnNumber = Math.floor((columnNumber - 1) / 26);
    }
    return letters;
  }

  async generateExcelFile(workbook, reportData) {
    const filename = `report_${reportData.executionId}_${Date.now()}.xlsx`;
    const filePath = path.join(exportsPath, filename);

    await workbook.xlsx.writeFile(filePath);
    return filePath;
  }

  formatSummaryValue(value, type) {
    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR'
        }).format(value);
      case 'percentage':
        return `${value}%`;
      case 'number':
        return new Intl.NumberFormat('en-IN').format(value);
      default:
        return value;
    }
  }

  formatCellValue(value, type) {
    if (value === null || value === undefined) return '';
    
    switch (type) {
      case 'currency':
      case 'number':
      case 'percentage':
      case 'date':
      case 'datetime':
        return value; // Excel will handle formatting
      default:
        return value.toString();
    }
  }

  async getFileSize(filePath) {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  }
}
```

### 4. CSV Exporter

```javascript
class CSVExporter {
  constructor() {
    this.defaultOptions = {
      includeHeaders: true,
      delimiter: ',',
      quoteChar: '"',
      escapeChar: '"',
      encoding: 'utf8',
      lineEnding: '\n'
    };
  }

  async export(reportData, options = {}) {
    const config = { ...this.defaultOptions, ...options };
    
    try {
      // Generate CSV content
      const csvContent = this.generateCSV(reportData, config);

      // Generate file
      const filePath = await this.generateCSVFile(csvContent, reportData);
      const fileSize = await this.getFileSize(filePath);

      return {
        filePath,
        fileSize,
        format: 'csv'
      };
    } catch (error) {
      console.error('CSV export error:', error);
      throw new Error('Failed to generate CSV export');
    }
  }

  generateCSV(reportData, config) {
    const { columns, data } = reportData;
    let csvContent = '';

    // Add headers
    if (config.includeHeaders) {
      const headers = columns.map(col => this.escapeField(col.label, config));
      csvContent += headers.join(config.delimiter) + config.lineEnding;
    }

    // Add data rows
    data.forEach(row => {
      const values = columns.map(col => {
        const value = this.formatCellValue(row[col.key], col.type);
        return this.escapeField(value, config);
      });
      
      csvContent += values.join(config.delimiter) + config.lineEnding;
    });

    return csvContent;
  }

  escapeField(value, config) {
    if (value === null || value === undefined) {
      return '';
    }

    const stringValue = value.toString();
    
    // Check if field needs quoting
    const needsQuoting = stringValue.includes(config.delimiter) ||
                        stringValue.includes(config.quoteChar) ||
                        stringValue.includes('\n') ||
                        stringValue.includes('\r');

    if (needsQuoting) {
      // Escape quote characters
      const escapedValue = stringValue.replace(
        new RegExp(config.quoteChar, 'g'),
        config.escapeChar + config.quoteChar
      );
      return config.quoteChar + escapedValue + config.quoteChar;
    }

    return stringValue;
  }

  formatCellValue(value, type) {
    if (value === null || value === undefined) return '';
    
    switch (type) {
      case 'currency':
        // Format as plain number for CSV
        return typeof value === 'number' ? value.toString() : value;
      case 'date':
        return new Date(value).toLocaleDateString();
      case 'datetime':
        return new Date(value).toLocaleString();
      case 'percentage':
        return typeof value === 'number' ? value.toString() : value;
      default:
        return value.toString();
    }
  }

  async generateCSVFile(csvContent, reportData) {
    const filename = `report_${reportData.executionId}_${Date.now()}.csv`;
    const filePath = path.join(exportsPath, filename);

    await fs.promises.writeFile(filePath, csvContent, this.defaultOptions.encoding);
    return filePath;
  }

  async getFileSize(filePath) {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  }
}
```

### 5. JSON Exporter

```javascript
class JSONExporter {
  constructor() {
    this.defaultOptions = {
      includeMetadata: true,
      includeSummaries: true,
      includeCharts: false,
      prettyPrint: true,
      dateFormat: 'ISO8601' // 'ISO8601', 'locale', 'timestamp'
    };
  }

  async export(reportData, options = {}) {
    const config = { ...this.defaultOptions, ...options };
    
    try {
      // Generate JSON content
      const jsonContent = this.generateJSON(reportData, config);

      // Generate file
      const filePath = await this.generateJSONFile(jsonContent, reportData);
      const fileSize = await this.getFileSize(filePath);

      return {
        filePath,
        fileSize,
        format: 'json'
      };
    } catch (error) {
      console.error('JSON export error:', error);
      throw new Error('Failed to generate JSON export');
    }
  }

  generateJSON(reportData, config) {
    const exportData = {};

    // Add metadata
    if (config.includeMetadata) {
      exportData.metadata = {
        title: reportData.title,
        description: reportData.description,
        executionId: reportData.executionId,
        generatedAt: new Date().toISOString(),
        generatedBy: 'PharmaSoft Report Builder',
        totalRecords: reportData.data.length,
        format: 'json'
      };
    }

    // Add column definitions
    exportData.columns = reportData.columns.map(col => ({
      key: col.key,
      label: col.label,
      type: col.type,
      format: col.format
    }));

    // Add data
    exportData.data = reportData.data.map(row => {
      const formattedRow = {};
      
      reportData.columns.forEach(col => {
        formattedRow[col.key] = this.formatCellValue(row[col.key], col.type, config.dateFormat);
      });
      
      return formattedRow;
    });

    // Add summaries
    if (config.includeSummaries && reportData.summaries) {
      exportData.summaries = reportData.summaries;
    }

    // Add charts
    if (config.includeCharts && reportData.charts) {
      exportData.charts = reportData.charts;
    }

    // Convert to JSON string
    return JSON.stringify(exportData, null, config.prettyPrint ? 2 : 0);
  }

  formatCellValue(value, type, dateFormat) {
    if (value === null || value === undefined) return null;
    
    switch (type) {
      case 'date':
      case 'datetime':
        const date = new Date(value);
        switch (dateFormat) {
          case 'ISO8601':
            return date.toISOString();
          case 'locale':
            return date.toLocaleString();
          case 'timestamp':
            return date.getTime();
          default:
            return date.toISOString();
        }
      case 'currency':
      case 'number':
      case 'percentage':
        return typeof value === 'number' ? value : parseFloat(value);
      default:
        return value;
    }
  }

  async generateJSONFile(jsonContent, reportData) {
    const filename = `report_${reportData.executionId}_${Date.now()}.json`;
    const filePath = path.join(exportsPath, filename);

    await fs.promises.writeFile(filePath, jsonContent, 'utf8');
    return filePath;
  }

  async getFileSize(filePath) {
    const stats = await fs.promises.stat(filePath);
    return stats.size;
  }
}
```

### 6. Export Queue and Storage

```javascript
class ExportQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.maxConcurrent = 3;
    this.currentJobs = 0;
  }

  async addToQueue(exportJob) {
    return new Promise((resolve, reject) => {
      const job = {
        ...exportJob,
        id: this.generateJobId(),
        status: 'queued',
        createdAt: new Date(),
        resolve,
        reject
      };

      this.queue.push(job);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.processing || this.currentJobs >= this.maxConcurrent) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0 && this.currentJobs < this.maxConcurrent) {
      const job = this.queue.shift();
      this.currentJobs++;
      
      this.processJob(job)
        .finally(() => {
          this.currentJobs--;
          if (this.queue.length === 0) {
            this.processing = false;
          } else {
            this.processQueue();
          }
        });
    }
  }

  async processJob(job) {
    try {
      job.status = 'processing';
      job.startedAt = new Date();
      
      // Update job status in storage
      await this.updateJobStatus(job);
      
      // Process export
      const exportService = new ReportExportService();
      const result = await exportService.exportReport(
        job.executionId,
        job.format,
        job.options
      );
      
      job.status = 'completed';
      job.completedAt = new Date();
      job.result = result;
      
      // Update job status in storage
      await this.updateJobStatus(job);
      
      job.resolve(result);
    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error.message;
      
      // Update job status in storage
      await this.updateJobStatus(job);
      
      job.reject(error);
    }
  }

  generateJobId() {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async updateJobStatus(job) {
    // Save job status to database
    await db.exports.update(
      { _id: job.id },
      {
        $set: {
          status: job.status,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          result: job.result,
          error: job.error
        }
      },
      { upsert: true }
    );
  }
}

class ExportStorage {
  constructor() {
    this.exportsPath = path.join(appData, appName, 'exports');
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.exportsPath)) {
      fs.mkdirSync(this.exportsPath, { recursive: true });
    }
  }

  async saveExportRecord(exportData) {
    const record = {
      _id: this.generateExportId(),
      ...exportData,
      createdAt: new Date()
    };

    await db.exports.insert(record);
    return record;
  }

  async getExportRecord(exportId) {
    return await db.exports.findOne({ _id: exportId });
  }

  async getExportsByUser(userId, limit = 50) {
    return await db.exports
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit);
  }

  async deleteExport(exportId) {
    const exportRecord = await this.getExportRecord(exportId);
    
    if (exportRecord && exportRecord.filePath) {
      // Delete file
      try {
        await fs.promises.unlink(exportRecord.filePath);
      } catch (error) {
        console.error('Error deleting export file:', error);
      }
    }

    // Delete database record
    return await db.exports.remove({ _id: exportId });
  }

  async cleanupOldExports() {
    const cutoffDate = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago
    
    const oldExports = await db.exports.find({
      createdAt: { $lt: cutoffDate }
    });

    for (const exportRecord of oldExports) {
      await this.deleteExport(exportRecord._id);
    }

    return oldExports.length;
  }

  generateExportId() {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
```

### 7. Export Templates

```javascript
class ExportTemplateManager {
  constructor() {
    this.templates = new Map();
    this.initializeDefaultTemplates();
  }

  initializeDefaultTemplates() {
    // PDF templates
    this.templates.set('pdf-standard', {
      name: 'Standard PDF',
      format: 'pdf',
      options: {
        pageSize: 'A4',
        orientation: 'portrait',
        header: {
          enabled: true,
          includeLogo: true,
          includeTitle: true,
          includeDate: true,
          includePageNumbers: true
        },
        footer: {
          enabled: true,
          includePageNumbers: true,
          includeGeneratedBy: true
        }
      }
    });

    this.templates.set('pdf-compact', {
      name: 'Compact PDF',
      format: 'pdf',
      options: {
        pageSize: 'A4',
        orientation: 'landscape',
        margins: { top: 10, right: 10, bottom: 10, left: 10 },
        header: {
          enabled: true,
          includeLogo: false,
          includeTitle: true,
          includeDate: true,
          includePageNumbers: false
        },
        footer: {
          enabled: false
        },
        table: {
          headerStyle: { fontSize: 8, bold: true },
          bodyStyle: { fontSize: 7 }
        }
      }
    });

    // Excel templates
    this.templates.set('excel-standard', {
      name: 'Standard Excel',
      format: 'excel',
      options: {
        includeHeaders: true,
        includeSummary: true,
        autoFilter: true,
        freezeHeaderRow: true,
        columnWidths: 'auto'
      }
    });

    this.templates.set('excel-analysis', {
      name: 'Analysis Excel',
      format: 'excel',
      options: {
        includeHeaders: true,
        includeSummary: true,
        includeCharts: true,
        autoFilter: true,
        freezeHeaderRow: true,
        columnWidths: 'auto'
      }
    });

    // CSV templates
    this.templates.set('csv-standard', {
      name: 'Standard CSV',
      format: 'csv',
      options: {
        includeHeaders: true,
        delimiter: ',',
        encoding: 'utf8'
      }
    });

    // JSON templates
    this.templates.set('json-standard', {
      name: 'Standard JSON',
      format: 'json',
      options: {
        includeMetadata: true,
        includeSummaries: true,
        prettyPrint: true,
        dateFormat: 'ISO8601'
      }
    });
  }

  getTemplate(templateId) {
    return this.templates.get(templateId);
  }

  getTemplatesByFormat(format) {
    return Array.from(this.templates.values())
      .filter(template => template.format === format);
  }

  getAllTemplates() {
    return Array.from(this.templates.values());
  }

  addTemplate(template) {
    this.templates.set(template.id, template);
  }

  removeTemplate(templateId) {
    this.templates.delete(templateId);
  }
}
```

### 8. Export API Endpoints

```javascript
// Export API routes
router.post('/export/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;
    const { format, template, options = {} } = req.body;

    // Validate format
    const supportedFormats = ['pdf', 'excel', 'csv', 'json'];
    if (!supportedFormats.includes(format)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_FORMAT',
          message: `Unsupported format: ${format}`
        }
      });
    }

    // Apply template if specified
    if (template) {
      const templateManager = new ExportTemplateManager();
      const exportTemplate = templateManager.getTemplate(template);
      
      if (exportTemplate) {
        options.template = exportTemplate.options;
      }
    }

    // Create export job
    const exportService = new ReportExportService();
    const exportResult = await exportService.exportReport(executionId, format, options);

    res.json({
      success: true,
      data: exportResult,
      message: 'Export completed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EXPORT_ERROR',
        message: error.message
      }
    });
  }
});

router.get('/export/:exportId/download', async (req, res) => {
  try {
    const { exportId } = req.params;
    const storage = new ExportStorage();
    const exportRecord = await storage.getExportRecord(exportId);

    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EXPORT_NOT_FOUND',
          message: 'Export not found'
        }
      });
    }

    // Check permissions
    if (exportRecord.userId !== req.user._id && !req.user.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Access denied'
        }
      });
    }

    // Set headers
    res.setHeader('Content-Disposition', `attachment; filename="${exportRecord.filename}"`);
    res.setHeader('Content-Type', getMimeType(exportRecord.format));

    // Send file
    res.sendFile(exportRecord.filePath, (err) => {
      if (err) {
        res.status(500).json({
          success: false,
          error: {
            code: 'FILE_DOWNLOAD_ERROR',
            message: err.message
          }
        });
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'DOWNLOAD_ERROR',
        message: error.message
      }
    });
  }
});

router.get('/exports', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const storage = new ExportStorage();
    const exports = await storage.getExportsByUser(req.user._id, parseInt(limit));

    res.json({
      success: true,
      data: exports,
      message: `${exports.length} exports retrieved`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EXPORTS_FETCH_ERROR',
        message: error.message
      }
    });
  }
});

router.delete('/export/:exportId', async (req, res) => {
  try {
    const { exportId } = req.params;
    const storage = new ExportStorage();
    
    // Check permissions
    const exportRecord = await storage.getExportRecord(exportId);
    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EXPORT_NOT_FOUND',
          message: 'Export not found'
        }
      });
    }

    if (exportRecord.userId !== req.user._id && !req.user.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCESS_DENIED',
          message: 'Access denied'
        }
      });
    }

    await storage.deleteExport(exportId);

    res.json({
      success: true,
      message: 'Export deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EXPORT_DELETE_ERROR',
        message: error.message
      }
    });
  }
});

router.get('/export/templates', async (req, res) => {
  try {
    const { format } = req.query;
    const templateManager = new ExportTemplateManager();
    
    let templates;
    if (format) {
      templates = templateManager.getTemplatesByFormat(format);
    } else {
      templates = templateManager.getAllTemplates();
    }

    res.json({
      success: true,
      data: templates,
      message: `${templates.length} templates retrieved`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATES_FETCH_ERROR',
        message: error.message
      }
    });
  }
});
```

## Conclusion

This export functionality design provides comprehensive support for exporting reports in multiple formats with customizable options and templates. The design ensures:

1. **Multiple Format Support**: PDF, Excel, CSV, and JSON export capabilities
2. **Customizable Options**: Flexible formatting and styling options for each format
3. **Template System**: Pre-defined export templates for common use cases
4. **Performance**: Efficient processing of large datasets with queuing system
5. **Security**: Permission-based access control and data validation
6. **User Experience**: Progress tracking and download management
7. **Storage Management**: Automatic cleanup of old export files

The export system integrates seamlessly with the report builder architecture while providing professional-quality output options for pharmacy business needs.