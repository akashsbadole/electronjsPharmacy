# Invoice Sharing Implementation for PharmaSpot

This document describes the invoice sharing feature implementation for PharmaSpot Pharmacy Management System.

## Overview

The invoice sharing feature allows pharmacies to send invoices to customers via multiple communication channels:
- WhatsApp (simulation mode)
- SMS (simulation mode)
- Email with PDF attachment

## Architecture

### Core Components

1. **API Layer**
   - `api/communication.js` - Manages communication records and tracking
   - `api/templates.js` - Handles template management
   - `api/notification-queue.js` - Manages outgoing communication queue
   - `api/customer-preferences.js` - Manages customer communication preferences
   - `api/invoice-sharing.js` - Main invoice sharing endpoints
   - `api/pdf-generator.js` - PDF generation utility
   - `api/email-service.js` - Email sending service

2. **Frontend Components**
   - `assets/js/invoice-sharing.js` - POS interface for sharing invoices
   - `assets/js/customer-preferences.js` - Customer preferences management UI
   - `assets/js/template-management.js` - Template management interface
   - `assets/js/communication-tracking.js` - Communication tracking interface

3. **Supporting Files**
   - `server-updated.js` - Updated server configuration
   - `invoice-sharing-demo.html` - Demo page for testing functionality

## Features Implemented

### 1. Communication Methods

#### WhatsApp Sharing (Simulation Mode)
- Endpoint: `POST /api/communication/whatsapp`
- Simulates WhatsApp message sending
- Logs messages to console for demonstration
- Supports template-based messaging

#### SMS Sharing (Simulation Mode)
- Endpoint: `POST /api/communication/sms`
- Simulates SMS message sending
- Logs messages to console for demonstration
- Supports template-based messaging

#### Email Sharing with PDF
- Endpoint: `POST /api/communication/email`
- Real email sending capability using nodemailer
- Automatic PDF generation and attachment
- Supports HTML email templates
- Configurable SMTP settings

### 2. Template Management

#### Template CRUD Operations
- Create, read, update, delete templates
- Support for WhatsApp, SMS, and Email templates
- Default template initialization
- Template processing with variable substitution

#### Template Variables
- `{{storeName}}` - Pharmacy/store name
- `{{customerName}}` - Customer name
- `{{invoiceNumber}}` - Invoice number
- `{{amount}}` - Invoice amount
- `{{date}}` - Invoice date
- `{{paymentStatus}}` - Payment status
- `{{items}}` - List of purchased items
- `{{storeAddress}}` - Store address
- `{{storePhone}}` - Store phone number

### 3. Customer Preferences

#### Communication Consent Management
- Opt-in/opt-out for each communication method
- Phone number and email address management
- Preferred delivery method selection
- Consent logging for compliance

#### Notification Preferences
- Promotional messages
- Order updates
- Payment reminders
- Loyalty updates
- Low stock alerts
- New product alerts

### 4. Communication Tracking

#### Delivery Status Tracking
- Pending, sent, delivered, read, failed statuses
- Retry mechanism for failed communications
- Detailed error logging
- Analytics and reporting

#### Queue Management
- Automatic queue processing
- Priority-based sending
- Retry logic with exponential backoff
- Manual queue processing options

### 5. PDF Generation

#### Invoice PDF Generation
- Professional invoice layout
- Store information header
- Customer details
- Itemized billing
- Tax calculations
- Payment status

#### Receipt PDF Generation
- Compact receipt format
- Transaction details
- Payment information
- Store branding

## API Endpoints

### Communication API (`/api/communication/`)

#### Methods
- `GET /` - Welcome message
- `GET /all` - Get all communications (with pagination)
- `GET /transaction/:transactionId` - Get communications by transaction
- `GET /customer/:customerId` - Get communications by customer
- `POST /whatsapp` - Send WhatsApp message (simulation)
- `POST /sms` - Send SMS message (simulation)
- `POST /email` - Send email with PDF attachment
- `PUT /:communicationId/status` - Update communication status
- `GET /analytics` - Get communication analytics
- `DELETE /:communicationId` - Delete communication

### Templates API (`/api/templates/`)

#### Methods
- `GET /` - Welcome message
- `GET /all` - Get all templates (with pagination)
- `GET /:templateId` - Get specific template
- `POST /new` - Create new template
- `PUT /:templateId` - Update existing template
- `DELETE /:templateId` - Delete template
- `GET /default/:type` - Get default template by type
- `POST /:templateId/process` - Process template with data
- `POST /initialize-defaults` - Initialize default templates

### Customer Preferences API (`/api/customer-preferences/`)

#### Methods
- `GET /` - Welcome message
- `GET /all` - Get all preferences (with pagination)
- `GET /customer/:customerId` - Get customer preferences
- `POST /customer/:customerId` - Create/update preferences
- `PUT /customer/:customerId/preference` - Update specific preference
- `POST /customer/:customerId/consent` - Update consent
- `GET /customer/:customerId/invoice-preference` - Get preferred method
- `DELETE /customer/:customerId` - Delete preferences
- `GET /customer/:customerId/consent-log` - Get consent history

### Invoice Sharing API (`/api/invoice-sharing/`)

#### Methods
- `POST /share/:transactionId` - Share invoice via specific method
- `POST /share-preferred/:transactionId` - Share via customer's preferred method

### Notification Queue API (`/api/notification-queue/`)

#### Methods
- `GET /` - Welcome message
- `GET /all` - Get all notifications (with pagination)
- `POST /add` - Add notification to queue
- `PUT /:notificationId/status` - Update notification status
- `POST /process` - Process queue manually
- `POST /start-processor` - Start automatic processor
- `POST /stop-processor` - Stop automatic processor
- `GET /processor-status` - Get processor status
- `DELETE /:notificationId` - Remove notification
- `GET /statistics` - Get queue statistics

## Frontend Integration

### POS Integration
The invoice sharing functionality integrates with the existing POS system:

1. **Transaction Completion**
   - Share button appears after successful transaction
   - Automatic customer preference checking
   - Template selection option

2. **Customer Management**
   - Preferences button in customer list
   - Comprehensive preference management modal
   - Consent tracking

3. **Template Management**
   - Administrative interface for template management
   - Default template initialization
   - Template preview and testing

4. **Communication Tracking**
   - Real-time status monitoring
   - Detailed communication history
   - Analytics dashboard

## Configuration

### Email Configuration
Email service can be configured by creating a configuration file at:
```
{APPDATA}/{APPNAME}/server/config/email-config.json
```

Configuration format:
```json
{
  "smtp": {
    "host": "smtp.gmail.com",
    "port": 587,
    "secure": false,
    "user": "your-email@gmail.com",
    "password": "your-app-password"
  },
  "from": "noreply@pharmaspot.com"
}
```

## Security and Compliance

### Consent Management
- Explicit customer consent required
- Consent date and IP logging
- Easy opt-out mechanism
- Compliance reporting

### Data Protection
- Phone number masking in logs
- Secure email handling
- PDF attachment security
- Audit trail maintenance

## Simulation Mode

For WhatsApp and SMS, the implementation uses simulation mode:
- Messages are logged to console instead of being sent
- No external API keys required
- Easy testing and development
- Production-ready with API integration

## Installation and Setup

1. **Update Server Configuration**
   - Replace `server.js` with `server-updated.js`
   - Or manually add the new API routes to existing `server.js`

2. **Database Initialization**
   - Databases are automatically created on first run
   - Default templates are initialized via API call
   - No manual database setup required

3. **Frontend Integration**
   - Include the JavaScript files in your HTML pages
   - Add the appropriate class names to existing elements
   - Initialize the modules based on page context

## Testing

A demo page (`invoice-sharing-demo.html`) is provided to test all functionality:

1. **Invoice Sharing Test**
   - Tests all communication methods
   - Validates template processing
   - Checks error handling

2. **Template Management Test**
   - Initializes default templates
   - Tests CRUD operations
   - Validates template processing

3. **Communication Tracking Test**
   - Loads communication history
   - Tests pagination and filtering
   - Validates retry mechanism

4. **Customer Preferences Test**
   - Tests preference loading
   - Validates consent management
   - Tests preference updates

## Future Enhancements

### Production Integration
- Real WhatsApp Business API integration
- SMS gateway API integration
- Advanced email analytics
- Multi-language template support

### Advanced Features
- Scheduled communications
- Bulk invoice sharing
- Customer self-service preferences
- Advanced reporting and analytics

## Support

For technical support or questions about the invoice sharing implementation:
1. Check the browser console for detailed error messages
2. Review the API responses in the Network tab
3. Ensure all required dependencies are installed
4. Verify database permissions and file paths

## Dependencies

The invoice sharing feature requires the following npm packages:
- `nodemailer` - Email sending
- `jspdf` - PDF generation
- `@seald-io/nedb` - Database operations
- `express` - Web framework
- `body-parser` - Request parsing

All dependencies are already included in the main package.json file.