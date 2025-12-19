# Report Builder Database Schema Design

## Overview

This document defines the database schema for the PharmaSoft custom report builder system. The schema is designed to work with the existing NeDB database structure while providing comprehensive support for report configurations, templates, and execution history.

## Database Collections

### 1. Report Templates Collection

**Collection Name:** `report-templates.db`

```javascript
// Report Template Schema
{
  _id: "string",                    // Auto-generated unique ID
  name: "string",                   // Template name (display name)
  description: "string",            // Template description
  category: "string",               // Category: sales, inventory, customers, financial
  icon: "string",                   // FontAwesome icon class
  isSystem: "boolean",              // System template vs user-created
  
  // Template configuration
  dataSource: {
    primary: "string",              // Primary collection name
    collections: ["string"],        // All collections involved
    joins: [                        // Join configurations
      {
        from: "string",             // Source collection
        to: "string",               // Target collection
        on: "string",               // Join field
        type: "string",             // inner, left, right
        select: ["string"]          // Fields to select
      }
    ]
  },
  
  // Default and available filters
  defaultFilters: {
    dateRange: "string",            // today, yesterday, this-week, etc.
    storeId: "string",              // current, specific store ID
    // Other default filter values
  },
  
  availableFilters: [
    {
      key: "string",                // Filter key
      type: "string",               // date-range, select, text, number
      label: "string",              // Display label
      required: "boolean",          // Whether filter is required
      options: "array"              // Available options (for select type)
    }
  ],
  
  // Column definitions
  columns: [
    {
      key: "string",                // Column key/field name
      label: "string",              // Display label
      type: "string",               // string, number, date, currency, percentage
      width: "string",              // Column width (CSS)
      format: "string",             // Format string (optional)
      visible: "boolean"            // Default visibility
    }
  ],
  
  // Summary calculations
  summaries: [
    {
      key: "string",                // Summary key
      label: "string",              // Display label
      calculation: "string"         // Calculation expression
    }
  ],
  
  // Chart configurations
  charts: [
    {
      type: "string",               // bar, line, pie, etc.
      title: "string",              // Chart title
      xAxis: "string",              // X-axis field
      yAxis: "string",              // Y-axis field
      limit: "number"               // Data limit (optional)
    }
  ],
  
  // Metadata
  createdBy: "string",              // User ID who created the template
  createdAt: "Date",                // Creation timestamp
  updatedAt: "Date",                // Last update timestamp
  version: "string",                // Template version
  isActive: "boolean",              // Whether template is active
  
  // Usage tracking
  usageCount: "number",             // Number of times used
  lastUsed: "Date"                  // Last usage timestamp
}
```

**Indexes:**
```javascript
// Performance indexes for report templates
[
  { fields: ["category"], description: "For category filtering" },
  { fields: ["isSystem"], description: "For system/user template separation" },
  { fields: ["isActive"], description: "For active template filtering" },
  { fields: ["createdBy"], description: "For user-specific templates" },
  { fields: ["usageCount"], description: "For popular template queries" }
]
```

### 2. Report Configurations Collection

**Collection Name:** `report-configurations.db`

```javascript
// Report Configuration Schema
{
  _id: "string",                    // Auto-generated unique ID
  name: "string",                   // Configuration name
  description: "string",            // Configuration description
  templateId: "string",             // Reference to report template
  
  // User-defined filter values
  filters: {
    dateRange: {
      start: "Date",                // Start date
      end: "Date"                   // End date
    },
    storeId: "string",              // Selected store ID
    categoryId: "string",           // Selected category ID
    // Other filter values based on template
  },
  
  // Column customizations
  columnCustomizations: [
    {
      key: "string",                // Column key
      visible: "boolean",           // Visibility override
      width: "string",              // Width override
      label: "string",              // Label override
      format: "string"              // Format override
    }
  ],
  
  // Sort configuration
  sortBy: "string",                 // Sort field
  sortOrder: "string",              // asc, desc
  
  // Grouping configuration
  groupBy: "string",                // Group field
  groupSortBy: "string",            // Group sort field
  groupSortOrder: "string",         // Group sort order
  
  // Pagination configuration
  pageSize: "number",               // Page size
  showPagination: "boolean",        // Whether to show pagination
  
  // Chart customizations
  chartCustomizations: [
    {
      chartIndex: "number",         // Chart index from template
      type: "string",               // Chart type override
      title: "string",              // Chart title override
      colors: ["string"]            // Custom colors
    }
  ],
  
  // Metadata
  createdBy: "string",              // User ID who created the configuration
  createdAt: "Date",                // Creation timestamp
  updatedAt: "Date",                // Last update timestamp
  isPublic: "boolean",              // Whether configuration is shared
  sharedWith: ["string"],           // Array of user IDs it's shared with
  
  // Usage tracking
  usageCount: "number",             // Number of times used
  lastUsed: "Date"                  // Last usage timestamp
}
```

**Indexes:**
```javascript
// Performance indexes for report configurations
[
  { fields: ["templateId"], description: "For template-based queries" },
  { fields: ["createdBy"], description: "For user-specific configurations" },
  { fields: ["isPublic"], description: "For public configuration filtering" },
  { fields: ["sharedWith"], description: "For shared configuration access" },
  { fields: ["usageCount"], description: "For popular configuration queries" }
]
```

### 3. Report Executions Collection

**Collection Name:** `report-executions.db`

```javascript
// Report Execution Schema
{
  _id: "string",                    // Auto-generated unique ID
  configurationId: "string",        // Reference to report configuration
  templateId: "string",             // Reference to report template
  
  // Execution parameters
  executionParameters: {
    filters: "object",              // Filter values used
    columns: ["string"],            // Columns selected
    sortBy: "string",               // Sort field
    sortOrder: "string",            // Sort order
    // Other execution parameters
  },
  
  // Execution results
  executionStatus: "string",       // pending, running, completed, failed, cancelled
  startTime: "Date",                // Execution start time
  endTime: "Date",                  // Execution end time
  duration: "number",               // Execution duration in milliseconds
  
  // Result statistics
  totalRecords: "number",           // Total records processed
  returnedRecords: "number",        // Records returned (after filtering)
  resultSize: "number",             // Result size in bytes
  
  // Error information (if failed)
  errorMessage: "string",           // Error message
  errorDetails: "object",           // Detailed error information
  
  // Output information
  outputFormat: "string",           // json, csv, pdf, excel
  outputFile: "string",              // Output file path (if saved)
  downloadUrl: "string",            // Download URL (if applicable)
  
  // Metadata
  executedBy: "string",             // User ID who executed the report
  executedAt: "Date",               // Execution timestamp
  ipAddress: "string",              // Client IP address
  userAgent: "string",               // Client user agent
  
  // Performance metrics
  queryTime: "number",              // Database query time
  processingTime: "number",         // Data processing time
  renderTime: "number",             // Rendering time
  
  // Cache information
  cacheHit: "boolean",              // Whether result was from cache
  cacheKey: "string",               // Cache key used
  cacheExpiry: "Date"               // Cache expiry time
}
```

**Indexes:**
```javascript
// Performance indexes for report executions
[
  { fields: ["configurationId"], description: "For configuration-based queries" },
  { fields: ["templateId"], description: "For template-based queries" },
  { fields: ["executedBy"], description: "For user-specific execution history" },
  { fields: ["executionStatus"], description: "For status filtering" },
  { fields: ["executedAt"], description: "For time-based queries" },
  { fields: ["startTime"], description: "For performance monitoring" }
]
```

### 4. Report Schedules Collection

**Collection Name:** `report-schedules.db`

```javascript
// Report Schedule Schema
{
  _id: "string",                    // Auto-generated unique ID
  name: "string",                   // Schedule name
  description: "string",            // Schedule description
  configurationId: "string",        // Reference to report configuration
  
  // Schedule configuration
  scheduleType: "string",           // daily, weekly, monthly, yearly, custom
  scheduleConfig: {
    // Daily configuration
    time: "string",                 // HH:MM format
    
    // Weekly configuration
    dayOfWeek: "number",            // 0-6 (Sunday-Saturday)
    
    // Monthly configuration
    dayOfMonth: "number",           // 1-31
    
    // Custom configuration (cron-like)
    cronExpression: "string",       // Cron expression
    
    // Common configuration
    timezone: "string",             // Timezone identifier
    startDate: "Date",              // Schedule start date
    endDate: "Date"                 // Schedule end date (optional)
  },
  
  // Output configuration
  outputConfig: {
    format: "string",               // json, csv, pdf, excel
    email: {
      enabled: "boolean",
      recipients: ["string"],      // Email addresses
      subject: "string",            // Email subject
      body: "string",               // Email body
      includeReport: "boolean"      // Whether to attach report
    },
    save: {
      enabled: "boolean",
      location: "string",           // Save location
      filename: "string",           // Filename pattern
      overwrite: "boolean"          // Whether to overwrite existing files
    }
  },
  
  // Schedule status
  isActive: "boolean",              // Whether schedule is active
  lastExecution: "Date",            // Last execution timestamp
  nextExecution: "Date",            // Next execution timestamp
  executionCount: "number",         // Number of times executed
  failureCount: "number",          // Number of failed executions
  
  // Metadata
  createdBy: "string",              // User ID who created the schedule
  createdAt: "Date",                // Creation timestamp
  updatedAt: "Date",                // Last update timestamp
  
  // Notification settings
  notifications: {
    onSuccess: "boolean",           // Notify on successful execution
    onFailure: "boolean",           // Notify on failed execution
    recipients: ["string"]          // Notification recipients
  }
}
```

**Indexes:**
```javascript
// Performance indexes for report schedules
[
  { fields: ["configurationId"], description: "For configuration-based queries" },
  { fields: ["isActive"], description: "For active schedule filtering" },
  { fields: ["nextExecution"], description: "For scheduler queries" },
  { fields: ["createdBy"], description: "For user-specific schedules" },
  { fields: ["scheduleType"], description: "For schedule type filtering" }
]
```

### 5. Report Cache Collection

**Collection Name:** `report-cache.db`

```javascript
// Report Cache Schema
{
  _id: "string",                    // Auto-generated unique ID
  cacheKey: "string",               // Unique cache key
  configurationId: "string",        // Reference to report configuration
  
  // Cache data
  data: "object",                   // Cached report data
  metadata: {
    totalRecords: "number",         // Total records
    generatedAt: "Date",            // Data generation timestamp
    dataSize: "number",             // Data size in bytes
    checksum: "string"              // Data checksum for integrity
  },
  
  // Cache configuration
  ttl: "number",                    // Time to live in seconds
  createdAt: "Date",                // Cache creation timestamp
  expiresAt: "Date",                // Cache expiry timestamp
  
  // Usage tracking
  hitCount: "number",               // Number of cache hits
  lastAccessed: "Date",              // Last access timestamp
  
  // Cache status
  isValid: "boolean",               // Whether cache is valid
  isDirty: "boolean",               // Whether cache needs refresh
}
```

**Indexes:**
```javascript
// Performance indexes for report cache
[
  { fields: ["cacheKey"], description: "For cache key lookups" },
  { fields: ["configurationId"], description: "For configuration-based cache invalidation" },
  { fields: ["expiresAt"], description: "For cache cleanup queries" },
  { fields: ["isValid"], description: "For valid cache filtering" }
]
```

### 6. Report Permissions Collection

**Collection Name:** `report-permissions.db`

```javascript
// Report Permissions Schema
{
  _id: "string",                    // Auto-generated unique ID
  entityType: "string",             // template, configuration, schedule
  entityId: "string",               // Entity ID
  
  // Permission configuration
  permissions: [
    {
      userId: "string",             // User ID (null for role-based)
      roleId: "string",             // Role ID (null for user-specific)
      permissions: ["string"],      // view, edit, delete, share, execute
      conditions: "object"          // Additional conditions
    }
  ],
  
  // Inheritance configuration
  inheritFrom: "string",            // Parent entity ID for inheritance
  inheritType: "string",           // template, configuration
  
  // Metadata
  createdBy: "string",              // User ID who created permissions
  createdAt: "Date",                // Creation timestamp
  updatedAt: "Date"                 // Last update timestamp
}
```

**Indexes:**
```javascript
// Performance indexes for report permissions
[
  { fields: ["entityType", "entityId"], description: "For entity-based permission queries" },
  { fields: ["permissions.userId"], description: "For user permission queries" },
  { fields: ["permissions.roleId"], description: "For role permission queries" },
  { fields: ["inheritFrom"], description: "For inheritance queries" }
]
```

## Database Initialization

### 1. Database Creation Script

```javascript
// Database initialization script
const Datastore = require('nedb');
const path = require('path');
const { app } = require('electron').remote || require('electron');

const appData = app.getPath('userData');
const appName = app.getName();
const dbPath = path.join(appData, appName, 'server', 'databases');

class ReportDatabaseInitializer {
  constructor() {
    this.databases = {
      templates: new Datastore({ 
        filename: path.join(dbPath, 'report-templates.db'),
        autoload: true 
      }),
      configurations: new Datastore({ 
        filename: path.join(dbPath, 'report-configurations.db'),
        autoload: true 
      }),
      executions: new Datastore({ 
        filename: path.join(dbPath, 'report-executions.db'),
        autoload: true 
      }),
      schedules: new Datastore({ 
        filename: path.join(dbPath, 'report-schedules.db'),
        autoload: true 
      }),
      cache: new Datastore({ 
        filename: path.join(dbPath, 'report-cache.db'),
        autoload: true 
      }),
      permissions: new Datastore({ 
        filename: path.join(dbPath, 'report-permissions.db'),
        autoload: true 
      })
    };
    
    this.ensureIndexes();
  }
  
  async ensureIndexes() {
    // Templates indexes
    this.databases.templates.ensureIndex({ fieldName: 'category' });
    this.databases.templates.ensureIndex({ fieldName: 'isSystem' });
    this.databases.templates.ensureIndex({ fieldName: 'isActive' });
    this.databases.templates.ensureIndex({ fieldName: 'createdBy' });
    this.databases.templates.ensureIndex({ fieldName: 'usageCount' });
    
    // Configurations indexes
    this.databases.configurations.ensureIndex({ fieldName: 'templateId' });
    this.databases.configurations.ensureIndex({ fieldName: 'createdBy' });
    this.databases.configurations.ensureIndex({ fieldName: 'isPublic' });
    this.databases.configurations.ensureIndex({ fieldName: 'sharedWith' });
    this.databases.configurations.ensureIndex({ fieldName: 'usageCount' });
    
    // Executions indexes
    this.databases.executions.ensureIndex({ fieldName: 'configurationId' });
    this.databases.executions.ensureIndex({ fieldName: 'templateId' });
    this.databases.executions.ensureIndex({ fieldName: 'executedBy' });
    this.databases.executions.ensureIndex({ fieldName: 'executionStatus' });
    this.databases.executions.ensureIndex({ fieldName: 'executedAt' });
    this.databases.executions.ensureIndex({ fieldName: 'startTime' });
    
    // Schedules indexes
    this.databases.schedules.ensureIndex({ fieldName: 'configurationId' });
    this.databases.schedules.ensureIndex({ fieldName: 'isActive' });
    this.databases.schedules.ensureIndex({ fieldName: 'nextExecution' });
    this.databases.schedules.ensureIndex({ fieldName: 'createdBy' });
    this.databases.schedules.ensureIndex({ fieldName: 'scheduleType' });
    
    // Cache indexes
    this.databases.cache.ensureIndex({ fieldName: 'cacheKey' });
    this.databases.cache.ensureIndex({ fieldName: 'configurationId' });
    this.databases.cache.ensureIndex({ fieldName: 'expiresAt' });
    this.databases.cache.ensureIndex({ fieldName: 'isValid' });
    
    // Permissions indexes
    this.databases.permissions.ensureIndex({ fieldName: 'entityType' });
    this.databases.permissions.ensureIndex({ fieldName: 'entityId' });
    this.databases.permissions.ensureIndex({ fieldName: 'permissions.userId' });
    this.databases.permissions.ensureIndex({ fieldName: 'permissions.roleId' });
    this.databases.permissions.ensureIndex({ fieldName: 'inheritFrom' });
  }
  
  getDatabase(name) {
    return this.databases[name];
  }
  
  async initializeSystemTemplates(templates) {
    for (const template of templates) {
      await this.insertTemplate(template);
    }
  }
  
  async insertTemplate(template) {
    return new Promise((resolve, reject) => {
      this.databases.templates.insert(template, (err, newTemplate) => {
        if (err) reject(err);
        else resolve(newTemplate);
      });
    });
  }
}
```

### 2. Data Migration Scripts

```javascript
// Data migration for existing reports
class ReportDataMigrator {
  constructor(databaseInitializer) {
    this.db = databaseInitializer;
  }
  
  async migrateExistingReports() {
    // Migrate from existing reports.js configurations
    const existingReports = await this.loadExistingReports();
    
    for (const report of existingReports) {
      const template = this.convertToTemplate(report);
      await this.db.insertTemplate(template);
    }
  }
  
  async loadExistingReports() {
    // Load existing report configurations from current system
    // This would read from existing reports.js or database
    return [];
  }
  
  convertToTemplate(existingReport) {
    // Convert existing report format to new template format
    return {
      name: existingReport.name,
      description: existingReport.description || '',
      category: this.inferCategory(existingReport),
      icon: existingReport.icon || 'fa-file-alt',
      isSystem: true,
      dataSource: existingReport.dataSource,
      defaultFilters: existingReport.defaultFilters || {},
      availableFilters: existingReport.availableFilters || [],
      columns: existingReport.columns || [],
      summaries: existingReport.summaries || [],
      charts: existingReport.charts || [],
      createdBy: 'system',
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0',
      isActive: true,
      usageCount: 0,
      lastUsed: null
    };
  }
  
  inferCategory(report) {
    // Infer category from report name or data source
    const name = report.name.toLowerCase();
    
    if (name.includes('sale') || name.includes('revenue')) {
      return 'sales';
    } else if (name.includes('stock') || name.includes('inventory')) {
      return 'inventory';
    } else if (name.includes('customer')) {
      return 'customers';
    } else if (name.includes('profit') || name.includes('tax')) {
      return 'financial';
    }
    
    return 'general';
  }
}
```

## Data Validation

### 1. Template Validation

```javascript
class ReportTemplateValidator {
  static validateTemplate(template) {
    const errors = [];
    
    // Required fields
    if (!template.name) errors.push('Template name is required');
    if (!template.category) errors.push('Template category is required');
    if (!template.dataSource) errors.push('Data source configuration is required');
    
    // Data source validation
    if (template.dataSource) {
      if (!template.dataSource.primary) {
        errors.push('Primary data source is required');
      }
      
      if (template.dataSource.joins) {
        template.dataSource.joins.forEach((join, index) => {
          if (!join.from) errors.push(`Join ${index + 1}: from field is required`);
          if (!join.to) errors.push(`Join ${index + 1}: to field is required`);
          if (!join.on) errors.push(`Join ${index + 1}: on field is required`);
        });
      }
    }
    
    // Column validation
    if (template.columns) {
      template.columns.forEach((column, index) => {
        if (!column.key) errors.push(`Column ${index + 1}: key is required`);
        if (!column.label) errors.push(`Column ${index + 1}: label is required`);
        if (!column.type) errors.push(`Column ${index + 1}: type is required`);
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  static validateConfiguration(configuration) {
    const errors = [];
    
    // Required fields
    if (!configuration.name) errors.push('Configuration name is required');
    if (!configuration.templateId) errors.push('Template ID is required');
    
    // Filter validation
    if (configuration.filters) {
      // Validate filter values based on template
      // This would require loading the template to validate against
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
```

## Performance Optimization

### 1. Query Optimization

```javascript
class QueryOptimizer {
  static optimizeQuery(template, filters) {
    let optimizedQuery = {
      collection: template.dataSource.primary,
      query: {},
      sort: {},
      limit: null
    };
    
    // Apply date range filter first (most selective)
    if (filters.dateRange) {
      optimizedQuery.query.date = {
        $gte: filters.dateRange.start,
        $lte: filters.dateRange.end
      };
    }
    
    // Apply store filter
    if (filters.storeId && filters.storeId !== 'all') {
      optimizedQuery.query.storeId = filters.storeId;
    }
    
    // Apply other filters
    Object.keys(filters).forEach(key => {
      if (key !== 'dateRange' && key !== 'storeId' && filters[key]) {
        optimizedQuery.query[key] = filters[key];
      }
    });
    
    // Apply sorting
    if (template.defaultSort) {
      optimizedQuery.sort[template.defaultSort.field] = template.defaultSort.order === 'desc' ? -1 : 1;
    }
    
    // Apply reasonable limit for performance
    if (!optimizedQuery.limit) {
      optimizedQuery.limit = 10000; // Maximum 10,000 records
    }
    
    return optimizedQuery;
  }
}
```

### 2. Cache Management

```javascript
class CacheManager {
  constructor(database) {
    this.db = database.getDatabase('cache');
  }
  
  async get(cacheKey) {
    return new Promise((resolve, reject) => {
      this.db.findOne({ 
        cacheKey, 
        isValid: true, 
        expiresAt: { $gt: new Date() } 
      }, (err, cached) => {
        if (err) reject(err);
        else {
          if (cached) {
            // Update hit count and last accessed
            this.db.update({ _id: cached._id }, { 
              $inc: { hitCount: 1 },
              $set: { lastAccessed: new Date() }
            });
          }
          resolve(cached);
        }
      });
    });
  }
  
  async set(cacheKey, data, ttl = 3600) {
    const expiresAt = new Date(Date.now() + (ttl * 1000));
    
    const cacheEntry = {
      cacheKey,
      data,
      metadata: {
        totalRecords: Array.isArray(data) ? data.length : 0,
        generatedAt: new Date(),
        dataSize: JSON.stringify(data).length,
        checksum: this.generateChecksum(data)
      },
      ttl,
      createdAt: new Date(),
      expiresAt,
      hitCount: 0,
      lastAccessed: new Date(),
      isValid: true,
      isDirty: false
    };
    
    return new Promise((resolve, reject) => {
      this.db.update({ cacheKey }, cacheEntry, { upsert: true }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
  
  async invalidate(configurationId) {
    return new Promise((resolve, reject) => {
      this.db.update(
        { configurationId },
        { $set: { isValid: false, isDirty: true } },
        { multi: true },
        (err, numUpdated) => {
          if (err) reject(err);
          else resolve(numUpdated);
        }
      );
    });
  }
  
  async cleanup() {
    const cutoffDate = new Date();
    
    return new Promise((resolve, reject) => {
      this.db.remove(
        { 
          $or: [
            { expiresAt: { $lt: cutoffDate } },
            { isValid: false }
          ]
        },
        { multi: true },
        (err, numRemoved) => {
          if (err) reject(err);
          else resolve(numRemoved);
        }
      );
    });
  }
  
  generateChecksum(data) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(JSON.stringify(data)).digest('hex');
  }
}
```

## Conclusion

This database schema design provides a comprehensive foundation for the PharmaSoft custom report builder system. The schema is optimized for:

1. **Performance**: Proper indexing and query optimization
2. **Scalability**: Efficient data structure for growing report needs
3. **Flexibility**: Support for various report types and configurations
4. **Security**: Role-based permissions and access control
5. **Maintainability**: Clear structure and relationships
6. **Caching**: Built-in caching for improved performance

The schema integrates seamlessly with the existing NeDB database structure while providing the necessary extensions for advanced reporting capabilities.