# Report Builder API Endpoints Design

## Overview

This document defines the API endpoints for the PharmaSoft custom report builder system. The API design follows the existing pattern used in PharmaSoft while providing comprehensive functionality for report generation, template management, and configuration handling.

## API Architecture

### Base URL Structure
```
/api/reports-builder/
```

### Response Format
All API responses follow a consistent format:

```javascript
// Success Response
{
  "success": true,
  "data": {},           // Response data
  "message": "string",  // Success message
  "timestamp": "ISO8601"
}

// Error Response
{
  "success": false,
  "error": {
    "code": "string",     // Error code
    "message": "string",  // Error message
    "details": {}         // Additional error details
  },
  "timestamp": "ISO8601"
}
```

## API Endpoints

### 1. Template Management Endpoints

#### 1.1 Get All Templates
```javascript
// GET /api/reports-builder/templates
router.get('/templates', async (req, res) => {
  try {
    const { category, isSystem, isActive } = req.query;
    
    // Build query filter
    const filter = {};
    if (category) filter.category = category;
    if (isSystem !== undefined) filter.isSystem = isSystem === 'true';
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    
    // Get templates from database
    const templates = await db.templates.find(filter).sort({ name: 1 });
    
    res.json({
      success: true,
      data: templates,
      message: `${templates.length} templates retrieved`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_FETCH_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 1.2 Get Template by ID
```javascript
// GET /api/reports-builder/templates/:id
router.get('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const template = await db.templates.findOne({ _id: id });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Template not found'
        }
      });
    }
    
    // Update usage count
    await db.templates.update(
      { _id: id },
      { 
        $inc: { usageCount: 1 },
        $set: { lastUsed: new Date() }
      }
    );
    
    res.json({
      success: true,
      data: template,
      message: 'Template retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_FETCH_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 1.3 Create Template
```javascript
// POST /api/reports-builder/templates
router.post('/templates', async (req, res) => {
  try {
    const templateData = {
      ...req.body,
      _id: uuidv4(),
      isSystem: false,
      createdBy: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: '1.0',
      isActive: true,
      usageCount: 0,
      lastUsed: null
    };
    
    // Validate template
    const validation = ReportTemplateValidator.validateTemplate(templateData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEMPLATE_VALIDATION_ERROR',
          message: 'Template validation failed',
          details: validation.errors
        }
      });
    }
    
    const newTemplate = await db.templates.insert(templateData);
    
    res.status(201).json({
      success: true,
      data: newTemplate,
      message: 'Template created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_CREATE_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 1.4 Update Template
```javascript
// PUT /api/reports-builder/templates/:id
router.put('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
      updatedAt: new Date()
    };
    
    // Check if template exists and user has permission
    const existingTemplate = await db.templates.findOne({ _id: id });
    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Template not found'
        }
      });
    }
    
    if (existingTemplate.isSystem) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TEMPLATE_UPDATE_FORBIDDEN',
          message: 'Cannot update system templates'
        }
      });
    }
    
    if (existingTemplate.createdBy !== req.user.id && !req.user.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TEMPLATE_PERMISSION_DENIED',
          message: 'Permission denied'
        }
      });
    }
    
    // Validate updated template
    const validation = ReportTemplateValidator.validateTemplate({ ...existingTemplate, ...updates });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEMPLATE_VALIDATION_ERROR',
          message: 'Template validation failed',
          details: validation.errors
        }
      });
    }
    
    const result = await db.templates.update({ _id: id }, { $set: updates });
    
    res.json({
      success: true,
      data: { updated: result },
      message: 'Template updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_UPDATE_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 1.5 Delete Template
```javascript
// DELETE /api/reports-builder/templates/:id
router.delete('/templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if template exists and user has permission
    const existingTemplate = await db.templates.findOne({ _id: id });
    if (!existingTemplate) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Template not found'
        }
      });
    }
    
    if (existingTemplate.isSystem) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TEMPLATE_DELETE_FORBIDDEN',
          message: 'Cannot delete system templates'
        }
      });
    }
    
    if (existingTemplate.createdBy !== req.user.id && !req.user.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TEMPLATE_PERMISSION_DENIED',
          message: 'Permission denied'
        }
      });
    }
    
    // Check if template is in use
    const configurationsCount = await db.configurations.count({ templateId: id });
    if (configurationsCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEMPLATE_IN_USE',
          message: 'Cannot delete template that is in use',
          details: { configurationsCount }
        }
      });
    }
    
    const result = await db.templates.remove({ _id: id });
    
    res.json({
      success: true,
      data: { deleted: result },
      message: 'Template deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'TEMPLATE_DELETE_ERROR',
        message: error.message
      }
    });
  }
});
```

### 2. Configuration Management Endpoints

#### 2.1 Get All Configurations
```javascript
// GET /api/reports-builder/configurations
router.get('/configurations', async (req, res) => {
  try {
    const { templateId, createdBy, isPublic } = req.query;
    
    // Build query filter
    let filter = {};
    if (templateId) filter.templateId = templateId;
    if (createdBy) filter.createdBy = createdBy;
    if (isPublic !== undefined) filter.isPublic = isPublic === 'true';
    
    // Add user access filter
    if (!req.user.permissions.includes('admin')) {
      filter.$or = [
        { createdBy: req.user.id },
        { isPublic: true },
        { sharedWith: { $in: [req.user.id] } }
      ];
    }
    
    const configurations = await db.configurations.find(filter).sort({ updatedAt: -1 });
    
    res.json({
      success: true,
      data: configurations,
      message: `${configurations.length} configurations retrieved`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CONFIGURATION_FETCH_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 2.2 Get Configuration by ID
```javascript
// GET /api/reports-builder/configurations/:id
router.get('/configurations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const configuration = await db.configurations.findOne({ _id: id });
    
    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONFIGURATION_NOT_FOUND',
          message: 'Configuration not found'
        }
      });
    }
    
    // Check user access
    if (!req.user.permissions.includes('admin') && 
        configuration.createdBy !== req.user.id && 
        !configuration.isPublic && 
        !configuration.sharedWith.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CONFIGURATION_ACCESS_DENIED',
          message: 'Access denied'
        }
      });
    }
    
    // Update usage count
    await db.configurations.update(
      { _id: id },
      { 
        $inc: { usageCount: 1 },
        $set: { lastUsed: new Date() }
      }
    );
    
    res.json({
      success: true,
      data: configuration,
      message: 'Configuration retrieved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CONFIGURATION_FETCH_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 2.3 Create Configuration
```javascript
// POST /api/reports-builder/configurations
router.post('/configurations', async (req, res) => {
  try {
    const configurationData = {
      ...req.body,
      _id: uuidv4(),
      createdBy: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      usageCount: 0,
      lastUsed: null
    };
    
    // Validate configuration
    const validation = ReportTemplateValidator.validateConfiguration(configurationData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CONFIGURATION_VALIDATION_ERROR',
          message: 'Configuration validation failed',
          details: validation.errors
        }
      });
    }
    
    // Check if template exists
    const template = await db.templates.findOne({ _id: configurationData.templateId });
    if (!template) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Referenced template not found'
        }
      });
    }
    
    const newConfiguration = await db.configurations.insert(configurationData);
    
    res.status(201).json({
      success: true,
      data: newConfiguration,
      message: 'Configuration created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CONFIGURATION_CREATE_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 2.4 Update Configuration
```javascript
// PUT /api/reports-builder/configurations/:id
router.put('/configurations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
      updatedAt: new Date()
    };
    
    // Check if configuration exists and user has permission
    const existingConfiguration = await db.configurations.findOne({ _id: id });
    if (!existingConfiguration) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONFIGURATION_NOT_FOUND',
          message: 'Configuration not found'
        }
      });
    }
    
    if (existingConfiguration.createdBy !== req.user.id && !req.user.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CONFIGURATION_PERMISSION_DENIED',
          message: 'Permission denied'
        }
      });
    }
    
    const result = await db.configurations.update({ _id: id }, { $set: updates });
    
    res.json({
      success: true,
      data: { updated: result },
      message: 'Configuration updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CONFIGURATION_UPDATE_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 2.5 Delete Configuration
```javascript
// DELETE /api/reports-builder/configurations/:id
router.delete('/configurations/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if configuration exists and user has permission
    const existingConfiguration = await db.configurations.findOne({ _id: id });
    if (!existingConfiguration) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'CONFIGURATION_NOT_FOUND',
          message: 'Configuration not found'
        }
      });
    }
    
    if (existingConfiguration.createdBy !== req.user.id && !req.user.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'CONFIGURATION_PERMISSION_DENIED',
          message: 'Permission denied'
        }
      });
    }
    
    const result = await db.configurations.remove({ _id: id });
    
    res.json({
      success: true,
      data: { deleted: result },
      message: 'Configuration deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'CONFIGURATION_DELETE_ERROR',
        message: error.message
      }
    });
  }
});
```

### 3. Report Generation Endpoints

#### 3.1 Generate Report
```javascript
// POST /api/reports-builder/generate
router.post('/generate', async (req, res) => {
  try {
    const { configurationId, templateId, filters, format = 'json' } = req.body;
    
    // Get configuration or create from template
    let configuration;
    if (configurationId) {
      configuration = await db.configurations.findOne({ _id: configurationId });
      if (!configuration) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'CONFIGURATION_NOT_FOUND',
            message: 'Configuration not found'
          }
        });
      }
    } else if (templateId) {
      const template = await db.templates.findOne({ _id: templateId });
      if (!template) {
        return res.status(404).json({
          success: false,
          error: {
            code: 'TEMPLATE_NOT_FOUND',
            message: 'Template not found'
          }
        });
      }
      
      configuration = {
        templateId,
        filters: filters || template.defaultFilters,
        columns: template.columns,
        sortBy: template.defaultSort?.field,
        sortOrder: template.defaultSort?.order || 'asc'
      };
    } else {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CONFIGURATION',
          message: 'Either configurationId or templateId is required'
        }
      });
    }
    
    // Create execution record
    const executionId = uuidv4();
    const execution = {
      _id: executionId,
      configurationId: configurationId || null,
      templateId: configuration.templateId,
      executionParameters: {
        filters: configuration.filters,
        columns: configuration.columns,
        sortBy: configuration.sortBy,
        sortOrder: configuration.sortOrder
      },
      executionStatus: 'pending',
      startTime: new Date(),
      executedBy: req.user.id,
      executedAt: new Date(),
      outputFormat: format
    };
    
    await db.executions.insert(execution);
    
    // Start async report generation
    generateReportAsync(executionId, configuration, req.user.id);
    
    res.status(202).json({
      success: true,
      data: { executionId },
      message: 'Report generation started'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'REPORT_GENERATION_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 3.2 Get Report Generation Status
```javascript
// GET /api/reports-builder/generate/:executionId/status
router.get('/generate/:executionId/status', async (req, res) => {
  try {
    const { executionId } = req.params;
    
    const execution = await db.executions.findOne({ _id: executionId });
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EXECUTION_NOT_FOUND',
          message: 'Report execution not found'
        }
      });
    }
    
    // Check user access
    if (!req.user.permissions.includes('admin') && execution.executedBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'EXECUTION_ACCESS_DENIED',
          message: 'Access denied'
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        executionId: execution._id,
        status: execution.executionStatus,
        startTime: execution.startTime,
        endTime: execution.endTime,
        duration: execution.duration,
        totalRecords: execution.totalRecords,
        returnedRecords: execution.returnedRecords,
        progress: execution.progress || 0,
        errorMessage: execution.errorMessage
      },
      message: 'Execution status retrieved'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'EXECUTION_STATUS_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 3.3 Get Report Results
```javascript
// GET /api/reports-builder/generate/:executionId/results
router.get('/generate/:executionId/results', async (req, res) => {
  try {
    const { executionId } = req.params;
    const { page = 1, limit = 100 } = req.query;
    
    const execution = await db.executions.findOne({ _id: executionId });
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EXECUTION_NOT_FOUND',
          message: 'Report execution not found'
        }
      });
    }
    
    // Check user access
    if (!req.user.permissions.includes('admin') && execution.executedBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'EXECUTION_ACCESS_DENIED',
          message: 'Access denied'
        }
      });
    }
    
    if (execution.executionStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EXECUTION_NOT_COMPLETED',
          message: 'Report execution is not completed'
        }
      });
    }
    
    // Get cached results
    const cacheKey = `report_${executionId}`;
    const cachedResult = await cacheManager.get(cacheKey);
    
    if (!cachedResult) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESULTS_NOT_FOUND',
          message: 'Report results not found or expired'
        }
      });
    }
    
    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedData = cachedResult.data.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        executionId: execution._id,
        totalRecords: cachedResult.metadata.totalRecords,
        currentPage: parseInt(page),
        pageSize: parseInt(limit),
        totalPages: Math.ceil(cachedResult.metadata.totalRecords / limit),
        data: paginatedData,
        summaries: cachedResult.summaries,
        charts: cachedResult.charts
      },
      message: 'Report results retrieved'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'RESULTS_FETCH_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 3.4 Download Report
```javascript
// GET /api/reports-builder/generate/:executionId/download
router.get('/generate/:executionId/download', async (req, res) => {
  try {
    const { executionId } = req.params;
    const { format = 'pdf' } = req.query;
    
    const execution = await db.executions.findOne({ _id: executionId });
    
    if (!execution) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'EXECUTION_NOT_FOUND',
          message: 'Report execution not found'
        }
      });
    }
    
    // Check user access
    if (!req.user.permissions.includes('admin') && execution.executedBy !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'EXECUTION_ACCESS_DENIED',
          message: 'Access denied'
        }
      });
    }
    
    if (execution.executionStatus !== 'completed') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'EXECUTION_NOT_COMPLETED',
          message: 'Report execution is not completed'
        }
      });
    }
    
    // Get cached results
    const cacheKey = `report_${executionId}`;
    const cachedResult = await cacheManager.get(cacheKey);
    
    if (!cachedResult) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'RESULTS_NOT_FOUND',
          message: 'Report results not found or expired'
        }
      });
    }
    
    // Generate file based on format
    const filePath = await ReportExporter.export(cachedResult, format, execution);
    
    // Set appropriate headers
    const filename = `report_${executionId}.${format}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', getContentType(format));
    
    // Send file
    res.sendFile(filePath, (err) => {
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
```

### 4. Schedule Management Endpoints

#### 4.1 Get All Schedules
```javascript
// GET /api/reports-builder/schedules
router.get('/schedules', async (req, res) => {
  try {
    const { isActive, configurationId } = req.query;
    
    // Build query filter
    let filter = {};
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (configurationId) filter.configurationId = configurationId;
    
    // Add user access filter
    if (!req.user.permissions.includes('admin')) {
      filter.createdBy = req.user.id;
    }
    
    const schedules = await db.schedules.find(filter).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: schedules,
      message: `${schedules.length} schedules retrieved`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SCHEDULE_FETCH_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 4.2 Create Schedule
```javascript
// POST /api/reports-builder/schedules
router.post('/schedules', async (req, res) => {
  try {
    const scheduleData = {
      ...req.body,
      _id: uuidv4(),
      createdBy: req.user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
      executionCount: 0,
      failureCount: 0
    };
    
    // Validate schedule
    const validation = ScheduleValidator.validate(scheduleData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'SCHEDULE_VALIDATION_ERROR',
          message: 'Schedule validation failed',
          details: validation.errors
        }
      });
    }
    
    // Calculate next execution time
    scheduleData.nextExecution = ScheduleCalculator.calculateNextExecution(scheduleData);
    
    const newSchedule = await db.schedules.insert(scheduleData);
    
    res.status(201).json({
      success: true,
      data: newSchedule,
      message: 'Schedule created successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SCHEDULE_CREATE_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 4.3 Update Schedule
```javascript
// PUT /api/reports-builder/schedules/:id
router.put('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = {
      ...req.body,
      updatedAt: new Date()
    };
    
    // Check if schedule exists and user has permission
    const existingSchedule = await db.schedules.findOne({ _id: id });
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SCHEDULE_NOT_FOUND',
          message: 'Schedule not found'
        }
      });
    }
    
    if (existingSchedule.createdBy !== req.user.id && !req.user.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SCHEDULE_PERMISSION_DENIED',
          message: 'Permission denied'
        }
      });
    }
    
    // Recalculate next execution if schedule config changed
    if (updates.scheduleType || updates.scheduleConfig) {
      const updatedSchedule = { ...existingSchedule, ...updates };
      updates.nextExecution = ScheduleCalculator.calculateNextExecution(updatedSchedule);
    }
    
    const result = await db.schedules.update({ _id: id }, { $set: updates });
    
    res.json({
      success: true,
      data: { updated: result },
      message: 'Schedule updated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SCHEDULE_UPDATE_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 4.4 Delete Schedule
```javascript
// DELETE /api/reports-builder/schedules/:id
router.delete('/schedules/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if schedule exists and user has permission
    const existingSchedule = await db.schedules.findOne({ _id: id });
    if (!existingSchedule) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'SCHEDULE_NOT_FOUND',
          message: 'Schedule not found'
        }
      });
    }
    
    if (existingSchedule.createdBy !== req.user.id && !req.user.permissions.includes('admin')) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'SCHEDULE_PERMISSION_DENIED',
          message: 'Permission denied'
        }
      });
    }
    
    const result = await db.schedules.remove({ _id: id });
    
    res.json({
      success: true,
      data: { deleted: result },
      message: 'Schedule deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SCHEDULE_DELETE_ERROR',
        message: error.message
      }
    });
  }
});
```

### 5. Utility Endpoints

#### 5.1 Get Filter Options
```javascript
// GET /api/reports-builder/filter-options/:type
router.get('/filter-options/:type', async (req, res) => {
  try {
    const { type } = req.params;
    
    let options = [];
    
    switch (type) {
      case 'stores':
        options = await db.stores.find({ isActive: true }).sort({ name: 1 });
        break;
      case 'categories':
        options = await db.categories.find({}).sort({ name: 1 });
        break;
      case 'users':
        options = await db.users.find({ isActive: true }).sort({ fullname: 1 });
        break;
      case 'customers':
        options = await db.customers.find({}).sort({ name: 1 });
        break;
      default:
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILTER_TYPE',
            message: 'Invalid filter type'
          }
        });
    }
    
    res.json({
      success: true,
      data: options,
      message: `${options.length} options retrieved`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FILTER_OPTIONS_ERROR',
        message: error.message
      }
    });
  }
});
```

#### 5.2 Preview Report Data
```javascript
// POST /api/reports-builder/preview
router.post('/preview', async (req, res) => {
  try {
    const { templateId, filters, limit = 10 } = req.body;
    
    // Get template
    const template = await db.templates.findOne({ _id: templateId });
    if (!template) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'Template not found'
        }
      });
    }
    
    // Merge filters with defaults
    const mergedFilters = { ...template.defaultFilters, ...filters };
    
    // Generate preview data
    const previewData = await ReportGenerator.generatePreview(template, mergedFilters, limit);
    
    res.json({
      success: true,
      data: previewData,
      message: 'Preview data generated successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'PREVIEW_ERROR',
        message: error.message
      }
    });
  }
});
```

## Supporting Classes

### 1. Report Generator
```javascript
class ReportGenerator {
  static async generateReport(executionId, configuration, userId) {
    const startTime = Date.now();
    
    try {
      // Update execution status
      await db.executions.update(
        { _id: executionId },
        { $set: { executionStatus: 'running', startTime: new Date() } }
      );
      
      // Get template
      const template = await db.templates.findOne({ _id: configuration.templateId });
      
      // Build and execute query
      const query = QueryBuilder.build(template, configuration.filters);
      const data = await this.executeQuery(query);
      
      // Process data
      const processedData = await this.processData(data, template, configuration);
      
      // Calculate summaries
      const summaries = await this.calculateSummaries(processedData, template);
      
      // Generate chart data
      const charts = await this.generateChartData(processedData, template);
      
      // Cache results
      const cacheKey = `report_${executionId}`;
      await cacheManager.set(cacheKey, {
        data: processedData,
        summaries,
        charts,
        metadata: {
          totalRecords: processedData.length,
          generatedAt: new Date(),
          dataSize: JSON.stringify(processedData).length
        }
      }, 3600); // 1 hour cache
      
      // Update execution record
      const endTime = new Date();
      const duration = endTime - startTime;
      
      await db.executions.update(
        { _id: executionId },
        {
          $set: {
            executionStatus: 'completed',
            endTime,
            duration,
            totalRecords: data.length,
            returnedRecords: processedData.length
          }
        }
      );
      
      return { success: true };
    } catch (error) {
      // Update execution with error
      await db.executions.update(
        { _id: executionId },
        {
          $set: {
            executionStatus: 'failed',
            endTime: new Date(),
            duration: Date.now() - startTime,
            errorMessage: error.message,
            errorDetails: error.stack
          }
        }
      );
      
      throw error;
    }
  }
  
  static async generatePreview(template, filters, limit) {
    const query = QueryBuilder.build(template, filters);
    query.limit = limit;
    
    const data = await this.executeQuery(query);
    const processedData = await this.processData(data, template, { columns: template.columns });
    
    return {
      columns: template.columns,
      data: processedData,
      totalRecords: data.length
    };
  }
  
  static async executeQuery(query) {
    // Implementation depends on database type
    // This would integrate with existing database access patterns
    return [];
  }
  
  static async processData(data, template, configuration) {
    // Apply column selection, sorting, grouping
    return data;
  }
  
  static async calculateSummaries(data, template) {
    // Calculate summary values
    return [];
  }
  
  static async generateChartData(data, template) {
    // Generate chart data
    return [];
  }
}
```

### 2. Cache Manager
```javascript
class CacheManager {
  static async get(key) {
    return new Promise((resolve, reject) => {
      db.cache.findOne({ 
        cacheKey: key, 
        isValid: true, 
        expiresAt: { $gt: new Date() } 
      }, (err, cached) => {
        if (err) reject(err);
        else resolve(cached);
      });
    });
  }
  
  static async set(key, data, ttl = 3600) {
    const cacheEntry = {
      cacheKey: key,
      data,
      metadata: {
        totalRecords: Array.isArray(data.data) ? data.data.length : 0,
        generatedAt: new Date(),
        dataSize: JSON.stringify(data).length
      },
      ttl,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + (ttl * 1000)),
      hitCount: 0,
      lastAccessed: new Date(),
      isValid: true,
      isDirty: false
    };
    
    return new Promise((resolve, reject) => {
      db.cache.update({ cacheKey: key }, cacheEntry, { upsert: true }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  }
}
```

## Error Handling

### Error Codes
```javascript
const ERROR_CODES = {
  // Template errors
  TEMPLATE_NOT_FOUND: 'TEMPLATE_NOT_FOUND',
  TEMPLATE_VALIDATION_ERROR: 'TEMPLATE_VALIDATION_ERROR',
  TEMPLATE_CREATE_ERROR: 'TEMPLATE_CREATE_ERROR',
  TEMPLATE_UPDATE_ERROR: 'TEMPLATE_UPDATE_ERROR',
  TEMPLATE_DELETE_ERROR: 'TEMPLATE_DELETE_ERROR',
  TEMPLATE_UPDATE_FORBIDDEN: 'TEMPLATE_UPDATE_FORBIDDEN',
  TEMPLATE_DELETE_FORBIDDEN: 'TEMPLATE_DELETE_FORBIDDEN',
  TEMPLATE_IN_USE: 'TEMPLATE_IN_USE',
  
  // Configuration errors
  CONFIGURATION_NOT_FOUND: 'CONFIGURATION_NOT_FOUND',
  CONFIGURATION_VALIDATION_ERROR: 'CONFIGURATION_VALIDATION_ERROR',
  CONFIGURATION_CREATE_ERROR: 'CONFIGURATION_CREATE_ERROR',
  CONFIGURATION_UPDATE_ERROR: 'CONFIGURATION_UPDATE_ERROR',
  CONFIGURATION_DELETE_ERROR: 'CONFIGURATION_DELETE_ERROR',
  CONFIGURATION_ACCESS_DENIED: 'CONFIGURATION_ACCESS_DENIED',
  
  // Execution errors
  EXECUTION_NOT_FOUND: 'EXECUTION_NOT_FOUND',
  EXECUTION_ACCESS_DENIED: 'EXECUTION_ACCESS_DENIED',
  EXECUTION_NOT_COMPLETED: 'EXECUTION_NOT_COMPLETED',
  RESULTS_NOT_FOUND: 'RESULTS_NOT_FOUND',
  
  // Schedule errors
  SCHEDULE_NOT_FOUND: 'SCHEDULE_NOT_FOUND',
  SCHEDULE_VALIDATION_ERROR: 'SCHEDULE_VALIDATION_ERROR',
  SCHEDULE_CREATE_ERROR: 'SCHEDULE_CREATE_ERROR',
  SCHEDULE_UPDATE_ERROR: 'SCHEDULE_UPDATE_ERROR',
  SCHEDULE_DELETE_ERROR: 'SCHEDULE_DELETE_ERROR',
  
  // General errors
  MISSING_CONFIGURATION: 'MISSING_CONFIGURATION',
  INVALID_FILTER_TYPE: 'INVALID_FILTER_TYPE',
  REPORT_GENERATION_ERROR: 'REPORT_GENERATION_ERROR',
  PREVIEW_ERROR: 'PREVIEW_ERROR',
  FILE_DOWNLOAD_ERROR: 'FILE_DOWNLOAD_ERROR'
};
```

## Conclusion

This API design provides a comprehensive foundation for the PharmaSoft custom report builder system. The endpoints are designed to:

1. **Follow RESTful principles**: Proper HTTP methods and status codes
2. **Maintain consistency**: Standardized request/response formats
3. **Ensure security**: Proper authentication and authorization
4. **Provide scalability**: Asynchronous report generation and caching
5. **Support extensibility**: Clean architecture for future enhancements

The API integrates seamlessly with the existing PharmaSoft architecture while providing the necessary functionality for advanced reporting capabilities.