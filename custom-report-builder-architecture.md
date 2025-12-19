# Custom Report Builder Architecture for PharmaSoft

## Executive Summary

This document presents a comprehensive architecture for a custom report builder in PharmaSoft, a pharmacy management system built on Electron.js. The architecture provides a simple, user-friendly reporting solution with pre-defined templates and basic filtering options, designed specifically for pharmacy business needs.

The solution focuses on simplicity and ease of use, providing essential reporting capabilities without overwhelming users with complex features.

## System Overview

### Current System Analysis

PharmaSoft is built on:
- **Frontend**: Electron.js with web technologies (HTML, CSS, JavaScript)
- **Backend**: Node.js with Express.js
- **Database**: NeDB (embedded NoSQL database)
- **UI Framework**: Bootstrap with jQuery
- **Existing Features**: Point of Sale, Inventory Management, Customer Management, Basic Reports

### Architecture Goals

1. **Simplicity**: Easy-to-use interface for non-technical users
2. **Pre-defined Templates**: Common pharmacy reports ready to use
3. **Basic Filtering**: Date ranges and store selection
4. **Performance**: Fast report generation for essential business insights
5. **Integration**: Seamless integration with existing system

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                PharmaSoft Report Builder                    │
├─────────────────────────────────────────────────────────────┤
│                    Presentation Layer                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────┐ │
│  │   Report        │ │   Report        │ │ Export  │ │
│  │   Templates     │ │   Viewer        │ │ Options  │ │
│  └─────────────────┘ └─────────────────┘ └─────────┘ │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────┐ │
│  │   Date Range    │ │   Store         │ │ Generate │ │
│  │   Selector      │ │   Selector      │ │ Button  │ │
│  └─────────────────┘ └─────────────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────┤
│                     Application Layer                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────┐ │
│  │  Report         │ │   Template      │ │ Export  │ │
│  │  Generator      │ │   Manager       │ │ Service │ │
│  └─────────────────┘ └─────────────────┘ └─────────┘ │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────┐ │
│  │  Data           │ │   Filter        │ │ Cache   │ │
│  │  Aggregator     │ │   Processor     │ │ Manager │ │
│  └─────────────────┘ └─────────────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────┤
│                      Data Layer                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────┐ │
│  │   Transactions  │ │   Inventory     │ │ Report   │ │
│  │   Collection    │ │   Collection    │ │ Config  │ │
│  └─────────────────┘ └─────────────────┘ └─────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Report Builder Components

### 1. Report Template System

#### Pre-defined Report Templates
```javascript
// Report Template Structure
const reportTemplate = {
  id: "sales_summary",
  name: "Sales Summary Report",
  description: "Daily/Weekly/Monthly sales summary with key metrics",
  category: "sales",
  icon: "fa-chart-line",
  
  // Data source configuration
  dataSource: {
    primary: "transactions",
    collections: ["transactions", "inventory", "customers"],
    joins: [
      {
        from: "transactions",
        to: "customers",
        on: "customer_id"
      }
    ]
  },
  
  // Default filters
  defaultFilters: {
    dateRange: "this-month",
    storeId: "current",
    status: "paid"
  },
  
  // Available filters
  availableFilters: [
    {
      key: "dateRange",
      type: "date-range",
      label: "Date Range",
      required: true,
      options: ["today", "yesterday", "this-week", "this-month", "last-month", "custom"]
    },
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false,
      options: "stores" // Dynamic from stores collection
    },
    {
      key: "categoryId",
      type: "select",
      label: "Category",
      required: false,
      options: "categories" // Dynamic from categories collection
    }
  ],
  
  // Report columns
  columns: [
    { key: "date", label: "Date", type: "date", format: "DD/MM/YYYY" },
    { key: "invoiceNumber", label: "Invoice", type: "string" },
    { key: "customerName", label: "Customer", type: "string" },
    { key: "items", label: "Items", type: "number" },
    { key: "subtotal", label: "Subtotal", type: "currency" },
    { key: "tax", label: "Tax", type: "currency" },
    { key: "total", label: "Total", type: "currency" },
    { key: "paymentMethod", label: "Payment", type: "string" }
  ],
  
  // Summary calculations
  summaries: [
    { key: "totalSales", label: "Total Sales", calculation: "sum(total)" },
    { key: "totalTransactions", label: "Transactions", calculation: "count()" },
    { key: "averageTransaction", label: "Average Transaction", calculation: "avg(total)" },
    { key: "totalItems", label: "Total Items", calculation: "sum(items)" }
  ]
};
```

#### Template Categories
1. **Sales Reports**
   - Daily Sales Summary
   - Sales by Product
   - Sales by Category
   - Sales by Payment Method
   - Sales Performance

2. **Inventory Reports**
   - Current Stock Status
   - Low Stock Items
   - Expiry Analysis
   - Stock Movement
   - Inventory Valuation

3. **Customer Reports**
   - Customer Sales History
   - Top Customers
   - Customer Purchase Analysis
   - Outstanding Balances

4. **Financial Reports**
   - Profit & Loss Summary
   - Tax Summary
   - Payment Methods Analysis
   - Daily Cash Summary

### 2. Simple Report Builder Interface

#### Report Selection Screen
```html
<div class="report-builder-container">
  <div class="row">
    <div class="col-md-3">
      <div class="report-categories">
        <h4>Report Categories</h4>
        <div class="category-list">
          <div class="category-item active" data-category="sales">
            <i class="fa fa-chart-line"></i> Sales Reports
          </div>
          <div class="category-item" data-category="inventory">
            <i class="fa fa-boxes"></i> Inventory Reports
          </div>
          <div class="category-item" data-category="customers">
            <i class="fa fa-users"></i> Customer Reports
          </div>
          <div class="category-item" data-category="financial">
            <i class="fa fa-money"></i> Financial Reports
          </div>
        </div>
      </div>
    </div>
    
    <div class="col-md-6">
      <div class="report-templates">
        <h4>Available Reports</h4>
        <div class="template-grid" id="templateGrid">
          <!-- Templates loaded dynamically -->
        </div>
      </div>
    </div>
    
    <div class="col-md-3">
      <div class="report-filters">
        <h4>Report Options</h4>
        <form id="reportFilterForm">
          <div class="form-group">
            <label>Date Range</label>
            <select name="dateRange" class="form-control">
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this-week">This Week</option>
              <option value="this-month" selected>This Month</option>
              <option value="last-month">Last Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          
          <div class="form-group" id="customDateRange" style="display: none;">
            <div class="row">
              <div class="col-md-6">
                <label>From Date</label>
                <input type="date" name="startDate" class="form-control">
              </div>
              <div class="col-md-6">
                <label>To Date</label>
                <input type="date" name="endDate" class="form-control">
              </div>
            </div>
          </div>
          
          <div class="form-group">
            <label>Store</label>
            <select name="storeId" class="form-control">
              <option value="all">All Stores</option>
              <!-- Stores loaded dynamically -->
            </select>
          </div>
          
          <div class="form-group">
            <label>Category</label>
            <select name="categoryId" class="form-control">
              <option value="all">All Categories</option>
              <!-- Categories loaded dynamically -->
            </select>
          </div>
          
          <button type="button" class="btn btn-primary btn-block" onclick="generateReport()">
            <i class="fa fa-file-text"></i> Generate Report
          </button>
        </form>
      </div>
    </div>
  </div>
</div>
```

## Data Source Integration

### 1. Existing Database Integration

#### Primary Data Sources
```javascript
// Data Source Configuration
const dataSources = {
  transactions: {
    collection: "transactions",
    fields: [
      "_id", "date", "invoiceNumber", "customer", "items", 
      "subtotal", "tax", "total", "paymentMethod", "status"
    ],
    indexes: ["date", "status", "storeId"]
  },
  
  inventory: {
    collection: "inventory",
    fields: [
      "_id", "name", "barcode", "category", "price", "quantity", 
      "minStock", "expiryDate"
    ],
    indexes: ["category", "storeId", "quantity"]
  },
  
  customers: {
    collection: "customers",
    fields: [
      "_id", "name", "phone", "email", "address", "totalPurchases"
    ],
    indexes: ["name", "phone"]
  },
  
  stores: {
    collection: "stores",
    fields: ["_id", "name", "address", "phone"],
    indexes: ["name"]
  }
};
```

### 2. Simple Query Builder

#### Filter Processing
```javascript
class SimpleQueryBuilder {
  constructor(template, filters) {
    this.template = template;
    this.filters = filters;
  }
  
  buildQuery() {
    let query = {};
    
    // Date range filter
    if (this.filters.dateRange && this.filters.dateRange !== 'custom') {
      const dateRange = this.getDateRange(this.filters.dateRange);
      query.date = { $gte: dateRange.start, $lte: dateRange.end };
    } else if (this.filters.startDate && this.filters.endDate) {
      query.date = { 
        $gte: new Date(this.filters.startDate), 
        $lte: new Date(this.filters.endDate) 
      };
    }
    
    // Store filter
    if (this.filters.storeId && this.filters.storeId !== 'all') {
      query.storeId = parseInt(this.filters.storeId);
    }
    
    // Status filter (for transactions)
    if (this.template.dataSource.primary === 'transactions') {
      query.status = 1; // Paid transactions only
    }
    
    return query;
  }
  
  getDateRange(range) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    switch (range) {
      case 'today':
        return { start: today, end: now };
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { start: yesterday, end: yesterday };
      case 'this-week':
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return { start: weekStart, end: today };
      case 'this-month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: monthStart, end: today };
      case 'last-month':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        return { start: lastMonthStart, end: lastMonthEnd };
      default:
        return { start: today, end: today };
    }
  }
}
```

## Report Types

### 1. Tabular Reports

#### Basic Table Structure
```javascript
class TabularReportGenerator {
  constructor(template, data, filters) {
    this.template = template;
    this.data = data;
    this.filters = filters;
  }
  
  generate() {
    const report = {
      title: this.template.name,
      subtitle: this.getSubtitle(),
      generatedAt: new Date(),
      filters: this.filters,
      
      // Table headers
      headers: this.template.columns.map(col => ({
        key: col.key,
        label: col.label,
        type: col.type,
        format: col.format
      })),
      
      // Table rows
      rows: this.data.map(item => this.formatRow(item)),
      
      // Summary section
      summary: this.calculateSummary()
    };
    
    return report;
  }
  
  formatRow(item) {
    const row = {};
    this.template.columns.forEach(col => {
      let value = item[col.key];
      
      // Apply formatting based on column type
      switch (col.type) {
        case 'date':
          value = this.formatDate(value, col.format);
          break;
        case 'currency':
          value = this.formatCurrency(value);
          break;
        case 'number':
          value = this.formatNumber(value);
          break;
        default:
          value = value || '';
      }
      
      row[col.key] = value;
    });
    
    return row;
  }
  
  calculateSummary() {
    const summary = {};
    this.template.summaries.forEach(summaryItem => {
      switch (summaryItem.calculation) {
        case 'sum(total)':
          summary[summaryItem.key] = this.data.reduce((sum, item) => sum + (item.total || 0), 0);
          break;
        case 'count()':
          summary[summaryItem.key] = this.data.length;
          break;
        case 'avg(total)':
          const total = this.data.reduce((sum, item) => sum + (item.total || 0), 0);
          summary[summaryItem.key] = total / this.data.length;
          break;
      }
    });
    
    return summary;
  }
}
```

### 2. Summary Reports

#### Key Metrics Display
```javascript
class SummaryReportGenerator {
  constructor(template, data, filters) {
    this.template = template;
    this.data = data;
    this.filters = filters;
  }
  
  generate() {
    return {
      title: this.template.name,
      subtitle: this.getSubtitle(),
      generatedAt: new Date(),
      filters: this.filters,
      
      // Key metrics cards
      metrics: this.calculateMetrics(),
      
      // Charts data (simple)
      charts: this.generateChartData(),
      
      // Detailed breakdown
      breakdown: this.generateBreakdown()
    };
  }
  
  calculateMetrics() {
    const metrics = {};
    
    // Calculate key metrics based on template
    if (this.template.id === 'sales_summary') {
      metrics.totalSales = this.data.reduce((sum, item) => sum + (item.total || 0), 0);
      metrics.totalTransactions = this.data.length;
      metrics.averageTransaction = metrics.totalSales / metrics.totalTransactions;
      metrics.totalItems = this.data.reduce((sum, item) => sum + (item.items || 0), 0);
    }
    
    return metrics;
  }
  
  generateChartData() {
    // Simple chart data for visualization
    return {
      salesByDay: this.groupSalesByDay(),
      salesByCategory: this.groupSalesByCategory(),
      paymentMethods: this.groupByPaymentMethod()
    };
  }
}
```

## Configuration Options

### 1. Basic Filter Options

#### Date Range Selector
```javascript
const dateRangeOptions = [
  { value: 'today', label: 'Today', icon: 'fa-calendar-day' },
  { value: 'yesterday', label: 'Yesterday', icon: 'fa-calendar-minus' },
  { value: 'this-week', label: 'This Week', icon: 'fa-calendar-week' },
  { value: 'this-month', label: 'This Month', icon: 'fa-calendar' },
  { value: 'last-month', label: 'Last Month', icon: 'fa-calendar-alt' },
  { value: 'custom', label: 'Custom Range', icon: 'fa-calendar-range' }
];
```

#### Store Selection
```javascript
// Multi-store support
const storeSelector = {
  type: 'select',
  options: [
    { value: 'all', label: 'All Stores' },
    // Dynamic store options loaded from database
  ]
};
```

### 2. Simple Column Configuration

#### Pre-defined Column Sets
```javascript
const columnPresets = {
  sales: [
    { key: 'date', label: 'Date', type: 'date', visible: true },
    { key: 'invoiceNumber', label: 'Invoice', type: 'string', visible: true },
    { key: 'customerName', label: 'Customer', type: 'string', visible: true },
    { key: 'total', label: 'Total', type: 'currency', visible: true },
    { key: 'paymentMethod', label: 'Payment', type: 'string', visible: true }
  ],
  
  inventory: [
    { key: 'name', label: 'Product Name', type: 'string', visible: true },
    { key: 'barcode', label: 'Barcode', type: 'string', visible: true },
    { key: 'category', label: 'Category', type: 'string', visible: true },
    { key: 'quantity', label: 'Stock', type: 'number', visible: true },
    { key: 'price', label: 'Price', type: 'currency', visible: true }
  ]
};
```

## Report Management

### 1. Simple Report History

#### Recent Reports Storage
```javascript
// Store recent reports for quick access
const recentReportsDB = new Datastore({ 
  filename: path.join(appData, appName, 'server', 'databases', 'recent-reports.db'),
  autoload: true 
});

// Recent report structure
const recentReport = {
  id: "report_" + Date.now(),
  templateId: "sales_summary",
  templateName: "Sales Summary Report",
  filters: {
    dateRange: "this-month",
    storeId: "all"
  },
  generatedAt: new Date(),
  generatedBy: userId,
  filePath: "/reports/sales_summary_20231201.pdf"
};
```

### 2. Basic Report Sharing

#### Export and Share Options
```javascript
const shareOptions = {
  exportFormats: ['PDF', 'Excel', 'CSV'],
  shareMethods: ['Email', 'Print'],
  
  // Simple sharing without complex permissions
  shareReport: function(reportId, format, method) {
    const shareData = {
      reportId: reportId,
      format: format,
      method: method,
      sharedBy: userId,
      sharedAt: new Date()
    };
    
    // Log sharing for audit
    this.logShareActivity(shareData);
    
    // Execute sharing
    return this.executeShare(shareData);
  }
};
```

## Integration Points

### 1. Existing Analytics Integration

#### Leverage Current Analytics API
```javascript
// Extend existing analytics API
const analyticsExtension = {
  // Use existing analytics endpoints
  getSalesData: function(filters) {
    return fetch('/api/analytics/sales', {
      method: 'POST',
      body: JSON.stringify(filters)
    }).then(response => response.json());
  },
  
  getInventoryData: function(filters) {
    return fetch('/api/analytics/inventory', {
      method: 'POST',
      body: JSON.stringify(filters)
    }).then(response => response.json());
  }
};
```

### 2. User Permissions Integration

#### Role-Based Access Control
```javascript
// Integrate with existing user permissions
const permissionCheck = {
  canAccessReports: function(user) {
    // Check if user has reports permission
    return user.permissions && user.permissions.includes('perm_transactions');
  },
  
  canAccessAllStores: function(user) {
    // Check if user can view all stores
    return user.role === 'admin' || user.role === 'manager';
  },
  
  getAccessibleStores: function(user) {
    if (user.role === 'admin') {
      return 'all';
    } else {
      return user.storeIds || [];
    }
  }
};
```

### 3. Multi-Store Data Handling

#### Store-Specific Data Filtering
```javascript
const multiStoreHandler = {
  filterDataByStore: function(data, userStores) {
    if (userStores === 'all') {
      return data;
    }
    
    return data.filter(item => 
      !item.storeId || userStores.includes(item.storeId)
    );
  },
  
  addStoreInfo: function(data, stores) {
    return data.map(item => {
      if (item.storeId) {
        const store = stores.find(s => s._id === item.storeId);
        item.storeName = store ? store.name : 'Unknown Store';
      }
      return item;
    });
  }
};
```

## Database Schema

### 1. Report Templates Storage

#### Report Templates Collection
```javascript
// Database: report-templates.db
const reportTemplateSchema = {
  _id: "auto-generated-id",
  
  // Template identification
  templateId: "sales_summary",
  name: "Sales Summary Report",
  description: "Daily/Weekly/Monthly sales summary",
  category: "sales",
  icon: "fa-chart-line",
  
  // Data source configuration
  dataSource: {
    primary: "transactions",
    collections: ["transactions", "customers"],
    joins: []
  },
  
  // Filter configuration
  availableFilters: [
    {
      key: "dateRange",
      type: "date-range",
      label: "Date Range",
      required: true
    }
  ],
  
  // Column configuration
  columns: [
    {
      key: "date",
      label: "Date",
      type: "date",
      format: "DD/MM/YYYY",
      visible: true
    }
  ],
  
  // Summary calculations
  summaries: [
    {
      key: "totalSales",
      label: "Total Sales",
      calculation: "sum(total)"
    }
  ],
  
  // Metadata
  isActive: true,
  isSystem: true, // System template vs user-created
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: "system"
};
```

### 2. Report History Storage

#### Report History Collection
```javascript
// Database: report-history.db
const reportHistorySchema = {
  _id: "auto-generated-id",
  
  // Report identification
  templateId: "sales_summary",
  templateName: "Sales Summary Report",
  reportId: "sales_summary_20231201_143022",
  
  // Execution details
  filters: {
    dateRange: "this-month",
    storeId: "all",
    categoryId: "all"
  },
  
  // Results
  status: "completed", // running, completed, failed
  recordCount: 1250,
  filePath: "/reports/sales_summary_20231201_143022.pdf",
  fileSize: 245760, // bytes
  
  // Metadata
  generatedBy: userId,
  generatedAt: new Date(),
  executionTime: 2.5, // seconds
  errorMessage: null
};
```

### 3. User Report Preferences

#### User Preferences Collection
```javascript
// Database: user-report-preferences.db
const userPreferencesSchema = {
  _id: "auto-generated-id",
  
  userId: "user123",
  
  // Default preferences
  defaultDateRange: "this-month",
  defaultStore: "current",
  defaultExportFormat: "PDF",
  
  // Favorite reports
  favoriteReports: [
    {
      templateId: "sales_summary",
      position: 1
    },
    {
      templateId: "inventory_status",
      position: 2
    }
  ],
  
  // Recent reports
  recentReports: [
    {
      templateId: "sales_summary",
      reportId: "sales_summary_20231201_143022",
      generatedAt: new Date()
    }
  ],
  
  updatedAt: new Date()
};
```

## Technical Implementation

### 1. Simple Report Generation Service

#### Report Service Implementation
```javascript
class SimpleReportService {
  constructor() {
    this.templatesDB = new Datastore({ 
      filename: path.join(appData, appName, 'server', 'databases', 'report-templates.db'),
      autoload: true 
    });
    
    this.historyDB = new Datastore({ 
      filename: path.join(appData, appName, 'server', 'databases', 'report-history.db'),
      autoload: true 
    });
  }
  
  async generateReport(templateId, filters, userId) {
    try {
      // Get template
      const template = await this.getTemplate(templateId);
      if (!template) {
        throw new Error('Template not found');
      }
      
      // Build query
      const queryBuilder = new SimpleQueryBuilder(template, filters);
      const query = queryBuilder.buildQuery();
      
      // Get data
      const data = await this.fetchData(template.dataSource, query);
      
      // Generate report
      const generator = this.getGenerator(template.type);
      const report = generator.generate(template, data, filters);
      
      // Save to history
      const historyRecord = await this.saveToHistory(template, filters, report, userId);
      
      return {
        success: true,
        report: report,
        historyId: historyRecord._id
      };
      
    } catch (error) {
      console.error('Report generation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async fetchData(dataSource, query) {
    const results = {};
    
    // Fetch data from each collection
    for (const collection of dataSource.collections) {
      const db = this.getDatabase(collection);
      results[collection] = await this.findDocuments(db, query);
    }
    
    // Process joins if needed
    if (dataSource.joins && dataSource.joins.length > 0) {
      return this.processJoins(results, dataSource.joins);
    }
    
    return results[dataSource.primary];
  }
  
  getGenerator(type) {
    switch (type) {
      case 'tabular':
        return new TabularReportGenerator();
      case 'summary':
        return new SummaryReportGenerator();
      default:
        return new TabularReportGenerator();
    }
  }
}
```

### 2. Client-Side Rendering

#### Report Display Component
```javascript
class ReportViewer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.currentReport = null;
  }
  
  displayReport(reportData) {
    this.currentReport = reportData;
    
    // Clear container
    this.container.innerHTML = '';
    
    // Create report header
    const header = this.createHeader(reportData);
    this.container.appendChild(header);
    
    // Create filters display
    const filters = this.createFiltersDisplay(reportData.filters);
    this.container.appendChild(filters);
    
    // Create summary section
    if (reportData.summary) {
      const summary = this.createSummarySection(reportData.summary);
      this.container.appendChild(summary);
    }
    
    // Create table
    if (reportData.rows && reportData.rows.length > 0) {
      const table = this.createDataTable(reportData);
      this.container.appendChild(table);
    }
    
    // Create export buttons
    const exports = this.createExportButtons(reportData);
    this.container.appendChild(exports);
  }
  
  createDataTable(reportData) {
    const tableContainer = document.createElement('div');
    tableContainer.className = 'table-responsive';
    
    const table = document.createElement('table');
    table.className = 'table table-striped table-bordered';
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    reportData.headers.forEach(header => {
      const th = document.createElement('th');
      th.textContent = header.label;
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    
    reportData.rows.forEach(row => {
      const tr = document.createElement('tr');
      
      reportData.headers.forEach(header => {
        const td = document.createElement('td');
        td.textContent = row[header.key] || '';
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    
    return tableContainer;
  }
  
  createExportButtons(reportData) {
    const container = document.createElement('div');
    container.className = 'export-buttons mt-3';
    
    const pdfBtn = document.createElement('button');
    pdfBtn.className = 'btn btn-primary mr-2';
    pdfBtn.innerHTML = '<i class="fa fa-file-pdf"></i> Export PDF';
    pdfBtn.onclick = () => this.exportReport('pdf', reportData);
    
    const excelBtn = document.createElement('button');
    excelBtn.className = 'btn btn-success mr-2';
    excelBtn.innerHTML = '<i class="fa fa-file-excel"></i> Export Excel';
    excelBtn.onclick = () => this.exportReport('excel', reportData);
    
    const csvBtn = document.createElement('button');
    csvBtn.className = 'btn btn-info';
    csvBtn.innerHTML = '<i class="fa fa-file-csv"></i> Export CSV';
    csvBtn.onclick = () => this.exportReport('csv', reportData);
    
    container.appendChild(pdfBtn);
    container.appendChild(excelBtn);
    container.appendChild(csvBtn);
    
    return container;
  }
}
```

### 3. Performance Optimization

#### Simple Caching Strategy
```javascript
class SimpleCacheManager {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }
  
  get(key) {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }
    
    // Check if cache is expired
    if (Date.now() > item.expires) {
      this.cache.delete(key);
      return null;
    }
    
    return item.data;
  }
  
  set(key, data, ttl = this.cacheTimeout) {
    this.cache.set(key, {
      data: data,
      expires: Date.now() + ttl
    });
  }
  
  generateKey(templateId, filters) {
    // Create cache key based on template and filters
    const filterString = JSON.stringify(filters);
    return `report_${templateId}_${btoa(filterString)}`;
  }
}
```

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- Set up basic report template system
- Create database schema for report configurations
- Implement basic report generation service
- Build simple report selection interface

### Phase 2: Core Features (Week 3-4)
- Implement pre-defined report templates
- Create basic filtering system (date ranges, store selection)
- Build tabular report display
- Add PDF export functionality

### Phase 3: Enhanced Features (Week 5-6)
- Implement Excel and CSV export
- Add report history tracking
- Create user preferences system
- Add simple summary reports with charts

### Phase 4: Integration & Polish (Week 7-8)
- Integrate with existing authentication system
- Optimize performance for large datasets
- Add report sharing capabilities
- Test and bug fixes

## Conclusion

This custom report builder architecture for PharmaSoft provides a simple, user-friendly solution for pharmacy reporting needs. The design focuses on:

1. **Simplicity**: Easy-to-use interface with pre-defined templates
2. **Performance**: Efficient data processing and caching
3. **Integration**: Seamless integration with existing PharmaSoft system
4. **Extensibility**: Framework that allows for future enhancements
5. **Maintainability**: Clean, modular code structure

The architecture provides a solid foundation for essential business reporting while maintaining the simplicity required for non-technical users in pharmacy environments.