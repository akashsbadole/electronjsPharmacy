# Report Builder Authentication and Permissions Integration

## Overview

This document defines the authentication and permissions integration strategy for the PharmaSoft custom report builder system. The design ensures seamless integration with the existing authentication system while providing granular access control for report features.

## Existing Authentication System Analysis

### Current Authentication Structure
Based on the existing PharmaSoft system:

```javascript
// Current User Structure (from users collection)
{
  _id: "string",              // User ID
  username: "string",         // Login username
  fullname: "string",        // Display name
  email: "string",          // Email address
  role: "string",           // User role (admin, manager, cashier, etc.)
  permissions: ["string"],   // Array of permission strings
  storeId: "string",        // Assigned store (for multi-store)
  isActive: "boolean",       // Account status
  createdAt: "Date",         // Account creation date
  lastLogin: "Date"         // Last login timestamp
}
```

### Current Permission Structure
```javascript
// Existing Permission Examples
const existingPermissions = [
  'dashboard.view',
  'sales.create',
  'sales.edit',
  'sales.delete',
  'inventory.view',
  'inventory.edit',
  'customers.view',
  'customers.create',
  'reports.view',
  'reports.export',
  'admin.users',
  'admin.settings'
];
```

## Report Builder Permission Framework

### 1. Permission Categories

#### 1.1 Report Template Permissions
```javascript
const reportTemplatePermissions = {
  // Template management
  'reports.templates.view': 'View report templates',
  'reports.templates.create': 'Create custom templates',
  'reports.templates.edit': 'Edit custom templates',
  'reports.templates.delete': 'Delete custom templates',
  'reports.templates.share': 'Share templates with other users',
  
  // System template access
  'reports.templates.system': 'Access system templates',
  'reports.templates.import': 'Import templates from external sources',
  'reports.templates.export': 'Export templates to external sources'
};
```

#### 1.2 Report Configuration Permissions
```javascript
const reportConfigurationPermissions = {
  // Configuration management
  'reports.configurations.view': 'View report configurations',
  'reports.configurations.create': 'Create report configurations',
  'reports.configurations.edit': 'Edit report configurations',
  'reports.configurations.delete': 'Delete report configurations',
  'reports.configurations.share': 'Share configurations with other users',
  'reports.configurations.duplicate': 'Duplicate existing configurations',
  
  // Advanced configuration
  'reports.configurations.advanced': 'Access advanced configuration options',
  'reports.configurations.custom_fields': 'Create custom calculated fields',
  'reports.configurations.custom_queries': 'Write custom SQL queries'
};
```

#### 1.3 Report Generation Permissions
```javascript
const reportGenerationPermissions = {
  // Basic report operations
  'reports.generate': 'Generate reports',
  'reports.view': 'View generated reports',
  'reports.download': 'Download reports',
  'reports.print': 'Print reports',
  
  // Advanced operations
  'reports.large_dataset': 'Generate reports with large datasets (>10,000 records)',
  'reports.real_time': 'Generate real-time reports',
  'reports.historical': 'Access historical data beyond default period',
  
  // Export permissions
  'reports.export.pdf': 'Export to PDF format',
  'reports.export.excel': 'Export to Excel format',
  'reports.export.csv': 'Export to CSV format',
  'reports.export.json': 'Export to JSON format'
};
```

#### 1.4 Report Scheduling Permissions
```javascript
const reportSchedulingPermissions = {
  // Schedule management
  'reports.schedules.view': 'View report schedules',
  'reports.schedules.create': 'Create report schedules',
  'reports.schedules.edit': 'Edit report schedules',
  'reports.schedules.delete': 'Delete report schedules',
  'reports.schedules.execute': 'Execute scheduled reports manually',
  
  // Advanced scheduling
  'reports.schedules.advanced': 'Use advanced scheduling options (cron expressions)',
  'reports.schedules.email': 'Email scheduled reports',
  'reports.schedules.external': 'Export to external systems'
};
```

#### 1.5 Data Access Permissions
```javascript
const dataAccessPermissions = {
  // Store access
  'reports.data.all_stores': 'Access data from all stores',
  'reports.data.own_store': 'Access data from own store only',
  'reports.data.assigned_stores': 'Access data from assigned stores',
  
  // Time period access
  'reports.data.all_time': 'Access all historical data',
  'reports.data.current_year': 'Access current year data',
  'reports.data.current_month': 'Access current month data',
  
  // Sensitive data access
  'reports.data.financial': 'Access financial data (profit, cost)',
  'reports.data.customer_details': 'Access customer personal information',
  'reports.data.supplier_details': 'Access supplier information',
  'reports.data.employee_data': 'Access employee performance data'
};
```

### 2. Role-Based Access Control

#### 2.1 Role Definitions
```javascript
const reportRoles = {
  // Administrator Role
  admin: {
    name: 'Administrator',
    description: 'Full access to all report features',
    permissions: [
      // All template permissions
      'reports.templates.view',
      'reports.templates.create',
      'reports.templates.edit',
      'reports.templates.delete',
      'reports.templates.share',
      'reports.templates.system',
      'reports.templates.import',
      'reports.templates.export',
      
      // All configuration permissions
      'reports.configurations.view',
      'reports.configurations.create',
      'reports.configurations.edit',
      'reports.configurations.delete',
      'reports.configurations.share',
      'reports.configurations.duplicate',
      'reports.configurations.advanced',
      'reports.configurations.custom_fields',
      'reports.configurations.custom_queries',
      
      // All generation permissions
      'reports.generate',
      'reports.view',
      'reports.download',
      'reports.print',
      'reports.large_dataset',
      'reports.real_time',
      'reports.historical',
      'reports.export.pdf',
      'reports.export.excel',
      'reports.export.csv',
      'reports.export.json',
      
      // All scheduling permissions
      'reports.schedules.view',
      'reports.schedules.create',
      'reports.schedules.edit',
      'reports.schedules.delete',
      'reports.schedules.execute',
      'reports.schedules.advanced',
      'reports.schedules.email',
      'reports.schedules.external',
      
      // All data access permissions
      'reports.data.all_stores',
      'reports.data.all_time',
      'reports.data.financial',
      'reports.data.customer_details',
      'reports.data.supplier_details',
      'reports.data.employee_data'
    ]
  },
  
  // Manager Role
  manager: {
    name: 'Manager',
    description: 'Access to store-level reports and basic configuration',
    permissions: [
      // Template permissions
      'reports.templates.view',
      'reports.templates.create',
      'reports.templates.edit',
      'reports.templates.share',
      'reports.templates.system',
      
      // Configuration permissions
      'reports.configurations.view',
      'reports.configurations.create',
      'reports.configurations.edit',
      'reports.configurations.share',
      'reports.configurations.duplicate',
      
      // Generation permissions
      'reports.generate',
      'reports.view',
      'reports.download',
      'reports.print',
      'reports.large_dataset',
      'reports.export.pdf',
      'reports.export.excel',
      'reports.export.csv',
      
      // Scheduling permissions
      'reports.schedules.view',
      'reports.schedules.create',
      'reports.schedules.edit',
      'reports.schedules.execute',
      'reports.schedules.email',
      
      // Data access permissions
      'reports.data.assigned_stores',
      'reports.data.current_year',
      'reports.data.financial',
      'reports.data.customer_details'
    ]
  },
  
  // Cashier/Sales Role
  cashier: {
    name: 'Cashier',
    description: 'Access to basic sales reports only',
    permissions: [
      // Template permissions
      'reports.templates.view',
      'reports.templates.system',
      
      // Configuration permissions
      'reports.configurations.view',
      'reports.configurations.duplicate',
      
      // Generation permissions
      'reports.generate',
      'reports.view',
      'reports.download',
      'reports.print',
      'reports.export.pdf',
      'reports.export.csv',
      
      // Data access permissions
      'reports.data.own_store',
      'reports.data.current_month'
    ]
  },
  
  // Viewer Role
  viewer: {
    name: 'Viewer',
    description: 'Read-only access to shared reports',
    permissions: [
      // Template permissions
      'reports.templates.view',
      'reports.templates.system',
      
      // Configuration permissions
      'reports.configurations.view',
      
      // Generation permissions
      'reports.view',
      'reports.download',
      'reports.print',
      'reports.export.pdf',
      
      // Data access permissions
      'reports.data.own_store',
      'reports.data.current_month'
    ]
  }
};
```

### 3. Permission Middleware

#### 3.1 API Permission Middleware
```javascript
// Permission middleware for API endpoints
const permissionMiddleware = {
  // Check if user has specific permission
  hasPermission: (permission) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      }
      
      if (!checkUserPermission(req.user, permission)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Permission '${permission}' required`
          }
        });
      }
      
      next();
    };
  },
  
  // Check if user has any of the specified permissions
  hasAnyPermission: (permissions) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      }
      
      const hasPermission = permissions.some(permission => 
        checkUserPermission(req.user, permission)
      );
      
      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `One of these permissions required: ${permissions.join(', ')}`
          }
        });
      }
      
      next();
    };
  },
  
  // Check data access permissions
  canAccessData: (dataType, storeId = null) => {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
      }
      
      if (!checkDataAccess(req.user, dataType, storeId)) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'DATA_ACCESS_DENIED',
            message: 'Access to this data is not permitted'
          }
        });
      }
      
      next();
    };
  }
};

// Permission checking function
function checkUserPermission(user, permission) {
  // Admin users have all permissions
  if (user.role === 'admin') {
    return true;
  }
  
  // Check explicit permissions
  if (user.permissions && user.permissions.includes(permission)) {
    return true;
  }
  
  // Check role-based permissions
  const rolePermissions = reportRoles[user.role]?.permissions || [];
  if (rolePermissions.includes(permission)) {
    return true;
  }
  
  // Check inherited permissions (wildcard matching)
  const userPermissions = [...(user.permissions || []), ...rolePermissions];
  
  // Check for wildcard permissions
  return userPermissions.some(userPerm => {
    if (userPerm.endsWith('.*')) {
      const prefix = userPerm.slice(0, -2);
      return permission.startsWith(prefix);
    }
    return userPerm === permission;
  });
}

// Data access checking function
function checkDataAccess(user, dataType, storeId = null) {
  // Admin users have all data access
  if (user.role === 'admin') {
    return true;
  }
  
  // Check store access
  if (storeId) {
    if (checkUserPermission(user, 'reports.data.all_stores')) {
      // Can access all stores
    } else if (checkUserPermission(user, 'reports.data.assigned_stores')) {
      // Check if store is in user's assigned stores
      if (!user.assignedStores || !user.assignedStores.includes(storeId)) {
        return false;
      }
    } else if (checkUserPermission(user, 'reports.data.own_store')) {
      // Check if store is user's own store
      if (user.storeId !== storeId) {
        return false;
      }
    } else {
      return false;
    }
  }
  
  // Check data type access
  switch (dataType) {
    case 'financial':
      return checkUserPermission(user, 'reports.data.financial');
    case 'customer_details':
      return checkUserPermission(user, 'reports.data.customer_details');
    case 'supplier_details':
      return checkUserPermission(user, 'reports.data.supplier_details');
    case 'employee_data':
      return checkUserPermission(user, 'reports.data.employee_data');
    default:
      return true;
  }
}
```

### 4. API Endpoint Protection

#### 4.1 Secured API Routes
```javascript
// Apply permission middleware to report builder API routes

// Template endpoints
router.get('/templates', 
  permissionMiddleware.hasPermission('reports.templates.view'), 
  templateController.getTemplates
);

router.post('/templates', 
  permissionMiddleware.hasPermission('reports.templates.create'), 
  templateController.createTemplate
);

router.put('/templates/:id', 
  permissionMiddleware.hasPermission('reports.templates.edit'), 
  templateController.updateTemplate
);

router.delete('/templates/:id', 
  permissionMiddleware.hasPermission('reports.templates.delete'), 
  templateController.deleteTemplate
);

// Configuration endpoints
router.get('/configurations', 
  permissionMiddleware.hasPermission('reports.configurations.view'), 
  configurationController.getConfigurations
);

router.post('/configurations', 
  permissionMiddleware.hasPermission('reports.configurations.create'), 
  configurationController.createConfiguration
);

router.put('/configurations/:id', 
  permissionMiddleware.hasPermission('reports.configurations.edit'), 
  configurationController.updateConfiguration
);

router.delete('/configurations/:id', 
  permissionMiddleware.hasPermission('reports.configurations.delete'), 
  configurationController.deleteConfiguration
);

// Report generation endpoints
router.post('/generate', 
  permissionMiddleware.hasPermission('reports.generate'), 
  reportController.generateReport
);

router.get('/generate/:executionId/results', 
  permissionMiddleware.hasPermission('reports.view'), 
  reportController.getReportResults
);

router.get('/generate/:executionId/download', 
  permissionMiddleware.hasAnyPermission([
    'reports.download', 
    'reports.export.pdf', 
    'reports.export.excel', 
    'reports.export.csv'
  ]), 
  reportController.downloadReport
);

// Schedule endpoints
router.get('/schedules', 
  permissionMiddleware.hasPermission('reports.schedules.view'), 
  scheduleController.getSchedules
);

router.post('/schedules', 
  permissionMiddleware.hasPermission('reports.schedules.create'), 
  scheduleController.createSchedule
);

router.put('/schedules/:id', 
  permissionMiddleware.hasPermission('reports.schedules.edit'), 
  scheduleController.updateSchedule
);

router.delete('/schedules/:id', 
  permissionMiddleware.hasPermission('reports.schedules.delete'), 
  scheduleController.deleteSchedule
);
```

### 5. Frontend Permission Integration

#### 5.1 Permission Service
```javascript
// Frontend permission service
class PermissionService {
  constructor() {
    this.userPermissions = [];
    this.userRole = null;
    this.loadUserPermissions();
  }

  async loadUserPermissions() {
    try {
      const response = await fetch('/api/auth/user');
      const result = await response.json();
      
      if (result.success) {
        this.userRole = result.data.role;
        this.userPermissions = result.data.permissions || [];
      }
    } catch (error) {
      console.error('Error loading user permissions:', error);
    }
  }

  hasPermission(permission) {
    // Check if user has explicit permission
    if (this.userPermissions.includes(permission)) {
      return true;
    }

    // Check role-based permissions
    const rolePermissions = reportRoles[this.userRole]?.permissions || [];
    if (rolePermissions.includes(permission)) {
      return true;
    }

    // Check wildcard permissions
    return this.userPermissions.some(userPerm => {
      if (userPerm.endsWith('.*')) {
        const prefix = userPerm.slice(0, -2);
        return permission.startsWith(prefix);
      }
      return false;
    });
  }

  hasAnyPermission(permissions) {
    return permissions.some(permission => this.hasPermission(permission));
  }

  canAccessTemplate(template) {
    // Check system template access
    if (template.isSystem && !this.hasPermission('reports.templates.system')) {
      return false;
    }

    // Check template ownership
    if (template.createdBy !== this.getCurrentUserId() && 
        !this.hasPermission('reports.templates.view')) {
      return false;
    }

    return true;
  }

  canAccessConfiguration(configuration) {
    // Check public access
    if (configuration.isPublic && this.hasPermission('reports.configurations.view')) {
      return true;
    }

    // Check ownership
    if (configuration.createdBy === this.getCurrentUserId()) {
      return true;
    }

    // Check shared access
    if (configuration.sharedWith && 
        configuration.sharedWith.includes(this.getCurrentUserId())) {
      return true;
    }

    return false;
  }

  canAccessData(dataType, storeId = null) {
    // Check store access
    if (storeId) {
      if (this.hasPermission('reports.data.all_stores')) {
        // Can access all stores
      } else if (this.hasPermission('reports.data.assigned_stores')) {
        // Check if store is in user's assigned stores
        const userStores = this.getUserStores();
        if (!userStores.includes(storeId)) {
          return false;
        }
      } else if (this.hasPermission('reports.data.own_store')) {
        // Check if store is user's own store
        if (this.getUserStoreId() !== storeId) {
          return false;
        }
      } else {
        return false;
      }
    }

    // Check data type access
    switch (dataType) {
      case 'financial':
        return this.hasPermission('reports.data.financial');
      case 'customer_details':
        return this.hasPermission('reports.data.customer_details');
      case 'supplier_details':
        return this.hasPermission('reports.data.supplier_details');
      case 'employee_data':
        return this.hasPermission('reports.data.employee_data');
      default:
        return true;
    }
  }

  getCurrentUserId() {
    // Get current user ID from session or local storage
    return localStorage.getItem('userId') || sessionStorage.getItem('userId');
  }

  getUserStoreId() {
    // Get user's assigned store ID
    return localStorage.getItem('storeId') || sessionStorage.getItem('storeId');
  }

  getUserStores() {
    // Get user's assigned stores (for multi-store access)
    const stores = localStorage.getItem('assignedStores') || sessionStorage.getItem('assignedStores');
    return stores ? JSON.parse(stores) : [];
  }

  // UI helper methods
  showElementIfPermission(element, permission) {
    if (this.hasPermission(permission)) {
      element.style.display = '';
    } else {
      element.style.display = 'none';
    }
  }

  hideElementIfPermission(element, permission) {
    if (this.hasPermission(permission)) {
      element.style.display = 'none';
    } else {
      element.style.display = '';
    }
  }

  disableElementIfPermission(element, permission) {
    if (!this.hasPermission(permission)) {
      element.disabled = true;
      element.classList.add('disabled');
    } else {
      element.disabled = false;
      element.classList.remove('disabled');
    }
  }
}

// Global permission service instance
window.permissionService = new PermissionService();
```

#### 5.2 UI Permission Integration
```javascript
// Apply permissions to UI elements
class UIPermissionManager {
  constructor() {
    this.permissionService = window.permissionService;
    this.initializePermissions();
  }

  initializePermissions() {
    // Apply permissions when DOM is ready
    document.addEventListener('DOMContentLoaded', () => {
      this.applyPermissions();
    });

    // Apply permissions after dynamic content loads
    const observer = new MutationObserver(() => {
      this.applyPermissions();
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  applyPermissions() {
    // Apply permission-based visibility
    this.applyPermissionAttributes();
    this.applyRoleBasedUI();
    this.applyDataAccessRestrictions();
  }

  applyPermissionAttributes() {
    // Handle elements with permission attributes
    document.querySelectorAll('[data-permission]').forEach(element => {
      const permission = element.getAttribute('data-permission');
      const action = element.getAttribute('data-permission-action') || 'hide';
      
      if (!this.permissionService.hasPermission(permission)) {
        switch (action) {
          case 'hide':
            element.style.display = 'none';
            break;
          case 'disable':
            element.disabled = true;
            element.classList.add('disabled');
            break;
          case 'remove':
            element.remove();
            break;
        }
      }
    });

    // Handle elements with permission-any attributes
    document.querySelectorAll('[data-permission-any]').forEach(element => {
      const permissions = element.getAttribute('data-permission-any').split(',');
      const action = element.getAttribute('data-permission-action') || 'hide';
      
      if (!this.permissionService.hasAnyPermission(permissions)) {
        switch (action) {
          case 'hide':
            element.style.display = 'none';
            break;
          case 'disable':
            element.disabled = true;
            element.classList.add('disabled');
            break;
          case 'remove':
            element.remove();
            break;
        }
      }
    });
  }

  applyRoleBasedUI() {
    // Apply role-specific UI modifications
    const userRole = this.permissionService.userRole;
    
    // Hide advanced features for non-admin users
    if (userRole !== 'admin') {
      document.querySelectorAll('[data-admin-only]').forEach(element => {
        element.style.display = 'none';
      });
    }

    // Show manager-specific features
    if (userRole === 'manager' || userRole === 'admin') {
      document.querySelectorAll('[data-manager-only]').forEach(element => {
        element.style.display = '';
      });
    }

    // Show cashier-specific features
    if (userRole === 'cashier' || userRole === 'manager' || userRole === 'admin') {
      document.querySelectorAll('[data-cashier-only]').forEach(element => {
        element.style.display = '';
      });
    }
  }

  applyDataAccessRestrictions() {
    // Apply data access restrictions to form elements
    document.querySelectorAll('[data-requires-data-access]').forEach(element => {
      const dataType = element.getAttribute('data-requires-data-access');
      const storeId = element.getAttribute('data-store-id');
      
      if (!this.permissionService.canAccessData(dataType, storeId)) {
        element.disabled = true;
        element.classList.add('disabled');
        
        // Add tooltip explaining restriction
        element.title = 'You do not have permission to access this data';
      }
    });

    // Filter store selection based on user permissions
    document.querySelectorAll('select[data-store-filter]').forEach(select => {
      this.filterStoreOptions(select);
    });
  }

  filterStoreOptions(storeSelect) {
    const options = storeSelect.querySelectorAll('option');
    
    options.forEach(option => {
      const storeId = option.value;
      
      if (storeId && !this.permissionService.canAccessData('general', storeId)) {
        option.style.display = 'none';
        option.disabled = true;
      }
    });
  }
}

// Initialize UI permission manager
window.uiPermissionManager = new UIPermissionManager();
```

### 6. Database-Level Security

#### 6.1 Query Filtering
```javascript
// Database-level security for data access
class DatabaseSecurity {
  static filterQueryByPermissions(query, user, collection) {
    // Apply store-based filtering
    if (!user.permissions.includes('reports.data.all_stores')) {
      if (user.permissions.includes('reports.data.assigned_stores')) {
        // Filter by assigned stores
        query.storeId = { $in: user.assignedStores || [user.storeId] };
      } else if (user.permissions.includes('reports.data.own_store')) {
        // Filter by own store
        query.storeId = user.storeId;
      }
    }

    // Apply time-based filtering
    if (!user.permissions.includes('reports.data.all_time')) {
      if (user.permissions.includes('reports.data.current_year')) {
        const currentYear = new Date().getFullYear();
        query.date = { 
          $gte: new Date(currentYear, 0, 1),
          $lte: new Date(currentYear, 11, 31)
        };
      } else if (user.permissions.includes('reports.data.current_month')) {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        query.date = { 
          $gte: new Date(currentYear, currentMonth, 1),
          $lte: new Date(currentYear, currentMonth + 1, 0)
        };
      }
    }

    // Apply data type filtering
    if (collection === 'transactions' && !user.permissions.includes('reports.data.financial')) {
      // Remove financial fields from query projection
      if (query.projection) {
        delete query.projection.cost;
        delete query.projection.profit;
        delete query.projection.profitMargin;
      }
    }

    return query;
  }

  static filterResultByPermissions(data, user, collection) {
    // Filter sensitive data from results
    if (collection === 'customers' && !user.permissions.includes('reports.data.customer_details')) {
      return data.map(item => {
        const filtered = { ...item };
        delete filtered.email;
        delete filtered.phone;
        delete filtered.address;
        return filtered;
      });
    }

    if (collection === 'suppliers' && !user.permissions.includes('reports.data.supplier_details')) {
      return data.map(item => {
        const filtered = { ...item };
        delete filtered.email;
        delete filtered.phone;
        delete filtered.address;
        return filtered;
      });
    }

    return data;
  }
}
```

### 7. Audit and Logging

#### 7.1 Permission Audit
```javascript
// Permission audit logging
class PermissionAudit {
  static logPermissionCheck(userId, permission, resource, result) {
    const auditEntry = {
      userId,
      permission,
      resource,
      result: result ? 'granted' : 'denied',
      timestamp: new Date(),
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent()
    };

    // Log to audit database
    this.saveAuditEntry(auditEntry);
  }

  static logDataAccess(userId, dataType, storeId, query, resultCount) {
    const auditEntry = {
      userId,
      action: 'data_access',
      dataType,
      storeId,
      query: JSON.stringify(query),
      resultCount,
      timestamp: new Date(),
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent()
    };

    this.saveAuditEntry(auditEntry);
  }

  static logReportGeneration(userId, reportId, configurationId, executionTime, recordCount) {
    const auditEntry = {
      userId,
      action: 'report_generation',
      reportId,
      configurationId,
      executionTime,
      recordCount,
      timestamp: new Date(),
      ipAddress: this.getClientIP(),
      userAgent: this.getUserAgent()
    };

    this.saveAuditEntry(auditEntry);
  }

  static async saveAuditEntry(entry) {
    try {
      // Save to audit database
      await db.audit.insert(entry);
    } catch (error) {
      console.error('Error saving audit entry:', error);
    }
  }

  static getClientIP() {
    // Get client IP from request
    return request.ip || request.connection.remoteAddress || 'unknown';
  }

  static getUserAgent() {
    // Get user agent from request
    return request.get('User-Agent') || 'unknown';
  }
}
```

### 8. Integration with Existing System

#### 8.1 User Migration
```javascript
// User migration script to add report permissions
const userMigration = {
  async migrateExistingUsers() {
    try {
      // Get all existing users
      const users = await db.users.find({});
      
      for (const user of users) {
        // Add report permissions based on existing role
        const reportPermissions = this.getReportPermissionsForRole(user.role);
        
        // Update user permissions
        await db.users.update(
          { _id: user._id },
          { 
            $addToSet: { permissions: { $each: reportPermissions } }
          }
        );
      }
      
      console.log('User migration completed successfully');
    } catch (error) {
      console.error('Error migrating users:', error);
    }
  },

  getReportPermissionsForRole(role) {
    const roleConfig = reportRoles[role];
    return roleConfig ? roleConfig.permissions : [];
  }
};
```

#### 8.2 Authentication Middleware Integration
```javascript
// Integrate with existing authentication middleware
const authMiddleware = {
  // Extend existing authentication to include report permissions
  authenticateWithReportPermissions: (req, res, next) => {
    // Call existing authentication middleware
    existingAuthMiddleware(req, res, () => {
      // Add report permissions to user object
      if (req.user) {
        req.user.reportPermissions = this.getUserReportPermissions(req.user);
      }
      
      next();
    });
  },

  getUserReportPermissions(user) {
    // Get role-based permissions
    const rolePermissions = reportRoles[user.role]?.permissions || [];
    
    // Combine with explicit permissions
    const allPermissions = [...(user.permissions || []), ...rolePermissions];
    
    // Remove duplicates
    return [...new Set(allPermissions)];
  }
};
```

## Conclusion

This authentication and permissions integration design provides comprehensive security for the PharmaSoft custom report builder system while maintaining compatibility with the existing authentication framework. The design ensures:

1. **Granular Access Control**: Fine-grained permissions for all report features
2. **Role-Based Security**: Appropriate access levels for different user roles
3. **Data Protection**: Secure access to sensitive business data
4. **Audit Trail**: Complete logging of permission checks and data access
5. **Seamless Integration**: Works with existing PharmaSoft authentication system
6. **Scalability**: Flexible framework for future permission requirements

The permission system protects sensitive data while providing appropriate access levels for different user roles in the pharmacy environment.