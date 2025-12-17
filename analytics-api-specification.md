# Enhanced Reports and Analytics API Specification

## Overview

This document provides detailed specifications for all API endpoints required to implement the enhanced reports and analytics system in PharmaSpot. The API follows RESTful principles and builds upon the existing Express.js/NeDB architecture.

## Base URL Structure

```
/api/analytics/ - Analytics data endpoints
/api/dashboard/ - Dashboard data endpoints  
/api/reports/ - Report generation and management
/api/export/ - Data export endpoints
```

## Authentication & Authorization

All endpoints require authentication via JWT token in the Authorization header:

```
Authorization: Bearer <jwt_token>
```

Role-based permissions:
- `admin`: Full access to all analytics and reports
- `manager`: Access to store analytics and basic financial reports
- `pharmacist`: Access to inventory and sales reports
- `cashier`: Limited access to basic sales reports

## Response Format

Standard response format:

```json
{
  "success": true,
  "data": {
    // Response data
  },
  "message": "Operation completed successfully",
  "timestamp": "2023-12-17T12:00:00.000Z"
}
```

Error response format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid date range provided",
    "details": {
      "field": "endDate",
      "issue": "End date cannot be before start date"
    }
  },
  "timestamp": "2023-12-17T12:00:00.000Z"
}
```

## Analytics API Endpoints

### Sales Analytics

#### Get Sales Summary
```http
GET /api/analytics/sales/summary
```

**Query Parameters:**
- `period` (required): `DAILY|WEEKLY|MONTHLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD format
- `endDate` (required if period=CUSTOM): YYYY-MM-DD format
- `storeId` (optional): Store ID or "all" for all stores
- `compareWith` (optional): `PREVIOUS_PERIOD|PREVIOUS_YEAR|NONE`

**Response:**
```json
{
  "success": true,
  "data": {
    "period": "MONTHLY",
    "startDate": "2023-11-01",
    "endDate": "2023-11-30",
    "storeId": "all",
    "summary": {
      "totalSales": 125000.50,
      "totalTransactions": 850,
      "totalTax": 18750.08,
      "totalDiscount": 2500.00,
      "averageTransactionValue": 147.06,
      "salesByPaymentMethod": {
        "cash": 75000.30,
        "card": 40000.20,
        "upi": 10000.00
      },
      "salesByHour": [
        {"hour": 9, "sales": 15000.00},
        {"hour": 10, "sales": 22500.50}
      ],
      "comparison": {
        "previousPeriod": {
          "totalSales": 118000.00,
          "growth": 5.93
        }
      }
    }
  }
}
```

#### Get Sales Trends
```http
GET /api/analytics/sales/trends
```

**Query Parameters:**
- `period` (required): `DAILY|WEEKLY|MONTHLY|YEARLY`
- `startDate` (required): YYYY-MM-DD
- `endDate` (required): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"
- `granularity` (optional): `DAY|WEEK|MONTH` (auto-selected based on period)

**Response:**
```json
{
  "success": true,
  "data": {
    "trends": [
      {
        "date": "2023-11-01",
        "sales": 4250.00,
        "transactions": 28,
        "profit": 850.00
      },
      {
        "date": "2023-11-02",
        "sales": 5100.50,
        "transactions": 35,
        "profit": 1020.10
      }
    ],
    "movingAverages": {
      "sales7Day": 4675.25,
      "sales30Day": 4675.25
    }
  }
}
```

#### Get Product Performance
```http
GET /api/analytics/sales/products
```

**Query Parameters:**
- `period` (required): `DAILY|WEEKLY|MONTHLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"
- `sortBy` (optional): `revenue|quantity|profit|margin`
- `limit` (optional): Number of results (default: 50)
- `category` (optional): Filter by category ID

**Response:**
```json
{
  "success": true,
  "data": {
    "products": [
      {
        "productId": "123",
        "productName": "Paracetamol 500mg",
        "category": "Pain Relief",
        "quantitySold": 150,
        "revenue": 7500.00,
        "cost": 5000.00,
        "profit": 2500.00,
        "profitMargin": 33.33,
        "inventoryTurns": 2.5,
        "daysOfSupply": 45
      }
    ],
    "summary": {
      "totalProducts": 150,
      "totalRevenue": 125000.50,
      "averageMargin": 28.5
    }
  }
}
```

#### Get Category Performance
```http
GET /api/analytics/sales/categories
```

**Query Parameters:**
- `period` (required): `DAILY|WEEKLY|MONTHLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"

**Response:**
```json
{
  "success": true,
  "data": {
    "categories": [
      {
        "categoryId": "5",
        "categoryName": "Pain Relief",
        "revenue": 25000.00,
        "quantitySold": 500,
        "profit": 7500.00,
        "profitMargin": 30.0,
        "revenuePercentage": 20.0
      }
    ]
  }
}
```

### Inventory Analytics

#### Get Inventory Valuation
```http
GET /api/analytics/inventory/valuation
```

**Query Parameters:**
- `asOfDate` (optional): YYYY-MM-DD (default: today)
- `storeId` (optional): Store ID or "all"
- `category` (optional): Filter by category ID
- `includeExpired` (optional): `true|false` (default: false)

**Response:**
```json
{
  "success": true,
  "data": {
    "valuation": {
      "totalValue": 250000.00,
      "totalCost": 175000.00,
      "potentialProfit": 75000.00,
      "categories": [
        {
          "categoryId": "5",
          "categoryName": "Pain Relief",
          "itemCount": 50,
          "totalValue": 50000.00,
          "totalCost": 35000.00
        }
      ]
    },
    "asOfDate": "2023-11-30"
  }
}
```

#### Get Inventory Movement
```http
GET /api/analytics/inventory/movement
```

**Query Parameters:**
- `period` (required): `DAILY|WEEKLY|MONTHLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"
- `productId` (optional): Filter by product ID
- `movementType` (optional): `ALL|SALE|PURCHASE|TRANSFER|ADJUSTMENT`

**Response:**
```json
{
  "success": true,
  "data": {
    "movements": [
      {
        "date": "2023-11-15",
        "productId": "123",
        "productName": "Paracetamol 500mg",
        "movementType": "SALE",
        "quantity": -25,
        "referenceId": "TXN-12345",
        "referenceType": "TRANSACTION"
      }
    ],
    "summary": {
      "totalIn": 1000,
      "totalOut": 750,
      "netMovement": 250
    }
  }
}
```

#### Get Expiry Analysis
```http
GET /api/analytics/inventory/expiry
```

**Query Parameters:**
- `daysAhead` (optional): Number of days to look ahead (default: 90)
- `storeId` (optional): Store ID or "all"
- `category` (optional): Filter by category ID

**Response:**
```json
{
  "success": true,
  "data": {
    "expiringItems": [
      {
        "productId": "123",
        "productName": "Paracetamol 500mg",
        "batchNumber": "B12345",
        "expiryDate": "2024-01-15",
        "daysToExpiry": 45,
        "quantity": 100,
        "value": 5000.00
      }
    ],
    "summary": {
      "totalExpiringValue": 25000.00,
      "itemsCount": 15,
      "criticalItems": 5 // Expiring within 30 days
    }
  }
}
```

### Financial Analytics

#### Get Profit & Loss Statement
```http
GET /api/analytics/financial/profit-loss
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"

**Response:**
```json
{
  "success": true,
  "data": {
    "statement": {
      "revenue": {
        "totalSales": 125000.50,
        "salesByCategory": [
          {
            "categoryId": "5",
            "categoryName": "Pain Relief",
            "amount": 25000.00
          }
        ]
      },
      "costOfGoodsSold": 87500.35,
      "grossProfit": 37500.15,
      "grossProfitMargin": 30.0,
      "expenses": {
        "rent": 10000.00,
        "salaries": 15000.00,
        "utilities": 2500.00,
        "other": 2000.00
      },
      "netProfit": 8000.15,
      "netProfitMargin": 6.4
    }
  }
}
```

#### Get Cash Flow Analysis
```http
GET /api/analytics/financial/cash-flow
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"

**Response:**
```json
{
  "success": true,
  "data": {
    "cashFlow": {
      "openingBalance": 50000.00,
      "inflows": {
        "cashSales": 75000.30,
        "cardSales": 40000.20,
        "customerPayments": 15000.00,
        "total": 130000.50
      },
      "outflows": {
        "supplierPayments": 45000.00,
        "expenses": 29500.35,
        "purchases": 35000.00,
        "total": 109500.35
      },
      "netCashFlow": 20500.15,
      "closingBalance": 70500.15
    }
  }
}
```

#### Get Tax Summary
```http
GET /api/analytics/financial/tax-summary
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"
- `taxType` (optional): `GST|VAT|ALL`

**Response:**
```json
{
  "success": true,
  "data": {
    "taxSummary": {
      "outputTax": {
        "cgst": 9375.04,
        "sgst": 9375.04,
        "igst": 0.00,
        "cess": 0.00,
        "total": 18750.08
      },
      "inputTax": {
        "cgst": 5000.00,
        "sgst": 5000.00,
        "igst": 1000.00,
        "cess": 500.00,
        "total": 11500.00
      },
      "netTaxPayable": 7250.08,
      "taxByHSN": [
        {
          "hsnCode": "3004",
          "description": "Medicaments",
          "taxableValue": 125000.50,
          "taxAmount": 18750.08
        }
      ]
    }
  }
}
```

### Customer Analytics

#### Get Customer Purchase Patterns
```http
GET /api/analytics/customers/purchase-patterns
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"
- `customerId` (optional): Specific customer ID

**Response:**
```json
{
  "success": true,
  "data": {
    "patterns": [
      {
        "customerId": "CUST123",
        "customerName": "John Doe",
        "totalPurchases": 15,
        "totalSpent": 2500.00,
        "averageOrderValue": 166.67,
        "daysSinceLastPurchase": 12,
        "favoriteProducts": [
          {
            "productId": "123",
            "productName": "Paracetamol 500mg",
            "purchaseCount": 5
          }
        ],
        "purchaseFrequency": "WEEKLY"
      }
    ],
    "summary": {
      "totalCustomers": 150,
      "activeCustomers": 85, // Purchased in last 30 days
      "averageOrderValue": 147.06,
      "retentionRate": 65.5
    }
  }
}
```

#### Get Customer Retention Analysis
```http
GET /api/analytics/customers/retention
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY`
- `storeId` (optional): Store ID or "all"

**Response:**
```json
{
  "success": true,
  "data": {
    "retention": {
      "newCustomers": 25,
      "returningCustomers": 125,
      "churnedCustomers": 10,
      "retentionRate": 85.5,
      "churnRate": 7.4,
      "customerLifetimeValue": 1250.00,
      "cohortAnalysis": [
        {
          "cohort": "2023-10",
          "initialCustomers": 30,
          "month1Retention": 85.5,
          "month2Retention": 75.0,
          "month3Retention": 70.0
        }
      ]
    }
  }
}
```

### Supplier Analytics

#### Get Supplier Performance
```http
GET /api/analytics/suppliers/performance
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `supplierId` (optional): Specific supplier ID

**Response:**
```json
{
  "success": true,
  "data": {
    "suppliers": [
      {
        "supplierId": "SUP123",
        "supplierName": "MediSupply Corp",
        "totalPurchases": 50000.00,
        "orderCount": 15,
        "averageOrderValue": 3333.33,
        "onTimeDeliveryRate": 93.3,
        "qualityScore": 4.5,
        "averageLeadTime": 3.5,
        "priceCompetitiveness": "GOOD"
      }
    ]
  }
}
```

#### Get Purchase Analysis
```http
GET /api/analytics/suppliers/purchases
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeId` (optional): Store ID or "all"
- `supplierId` (optional): Filter by supplier ID

**Response:**
```json
{
  "success": true,
  "data": {
    "purchases": [
      {
        "purchaseOrderId": "PO123",
        "supplierId": "SUP123",
        "supplierName": "MediSupply Corp",
        "orderDate": "2023-11-15",
        "totalAmount": 10000.00,
        "itemsCount": 25,
        "status": "RECEIVED"
      }
    ],
    "summary": {
      "totalPurchases": 75000.00,
      "totalOrders": 20,
      "averageOrderValue": 3750.00,
      "purchasesBySupplier": [
        {
          "supplierId": "SUP123",
          "supplierName": "MediSupply Corp",
          "amount": 50000.00,
          "orderCount": 15
        }
      ]
    }
  }
}
```

### Multi-Store Analytics

#### Get Store Comparison
```http
GET /api/analytics/stores/comparison
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `storeIds` (optional): Comma-separated store IDs or "all"

**Response:**
```json
{
  "success": true,
  "data": {
    "comparison": [
      {
        "storeId": "1",
        "storeName": "Main Store",
        "totalSales": 75000.00,
        "totalTransactions": 500,
        "averageTransactionValue": 150.00,
        "profitMargin": 30.5,
        "inventoryTurnover": 4.2
      },
      {
        "storeId": "2",
        "storeName": "Branch Store",
        "totalSales": 50000.50,
        "totalTransactions": 350,
        "averageTransactionValue": 143.44,
        "profitMargin": 28.8,
        "inventoryTurnover": 3.8
      }
    ],
    "summary": {
      "totalStores": 2,
      "bestPerformingStore": {
        "storeId": "1",
        "metric": "totalSales",
        "value": 75000.00
      }
    }
  }
}
```

#### Get Transfer Analysis
```http
GET /api/analytics/stores/transfers
```

**Query Parameters:**
- `period` (required): `MONTHLY|QUARTERLY|YEARLY|CUSTOM`
- `startDate` (required if period=CUSTOM): YYYY-MM-DD
- `endDate` (required if period=CUSTOM): YYYY-MM-DD
- `fromStore` (optional): Filter by source store
- `toStore` (optional): Filter by destination store

**Response:**
```json
{
  "success": true,
  "data": {
    "transfers": [
      {
        "transferId": "TR123",
        "fromStoreId": "1",
        "toStoreId": "2",
        "transferDate": "2023-11-15",
        "totalItems": 10,
        "totalValue": 5000.00,
        "status": "COMPLETED"
      }
    ],
    "summary": {
      "totalTransfers": 15,
      "totalValue": 75000.00,
      "transfersByDirection": {
        "store1_to_store2": 8,
        "store2_to_store1": 7
      }
    }
  }
}
```

## Dashboard API Endpoints

### Executive Dashboard
```http
GET /api/dashboard/executive
```

**Query Parameters:**
- `period` (optional): `TODAY|WEEK|MONTH|YEAR` (default: TODAY)
- `storeId` (optional): Store ID or "all"

**Response:**
```json
{
  "success": true,
  "data": {
    "kpis": {
      "todaySales": {
        "value": 5250.00,
        "target": 5000.00,
        "achievement": 105.0,
        "comparison": {
          "yesterday": 4800.00,
          "growth": 9.4
        }
      },
      "monthToDate": {
        "value": 75000.00,
        "target": 80000.00,
        "achievement": 93.8
      },
      "grossProfitMargin": {
        "value": 30.5,
        "target": 28.0,
        "achievement": 108.9
      },
      "inventoryTurnover": {
        "value": 4.2,
        "target": 4.0,
        "achievement": 105.0
      }
    },
    "charts": {
      "salesTrend": [
        {"date": "2023-11-01", "sales": 4250.00},
        {"date": "2023-11-02", "sales": 5100.50}
      ],
      "topProducts": [
        {"productId": "123", "productName": "Paracetamol", "sales": 2500.00},
        {"productId": "456", "productName": "Ibuprofen", "sales": 1800.00}
      ],
      "salesByCategory": [
        {"categoryId": "5", "categoryName": "Pain Relief", "sales": 15000.00},
        {"categoryId": "3", "categoryName": "Antibiotics", "sales": 12000.00}
      ]
    },
    "alerts": [
      {
        "type": "LOW_STOCK",
        "message": "5 products are below minimum stock level",
        "severity": "WARNING"
      },
      {
        "type": "EXPIRY",
        "message": "3 products expiring within 30 days",
        "severity": "CRITICAL"
      }
    ]
  }
}
```

### Operations Dashboard
```http
GET /api/dashboard/operations
```

**Query Parameters:**
- `storeId` (optional): Store ID or "all"

**Response:**
```json
{
  "success": true,
  "data": {
    "inventory": {
      "totalValue": 250000.00,
      "lowStockItems": 15,
      "expiringItems": 8,
      "outOfStockItems": 3
    },
    "transactions": {
      "todayCount": 45,
      "todayValue": 5250.00,
      "averageValue": 116.67,
      "byHour": [
        {"hour": 9, "count": 5, "value": 750.00},
        {"hour": 10, "count": 8, "value": 1200.00}
      ]
    },
    "performance": {
      "transactionProcessingTime": 2.5,
      "systemUptime": 99.8,
      "errorRate": 0.2
    }
  }
}
```

### Financial Dashboard
```http
GET /api/dashboard/financial
```

**Query Parameters:**
- `period` (optional): `WEEK|MONTH|QUARTER|YEAR` (default: MONTH)
- `storeId` (optional): Store ID or "all"

**Response:**
```json
{
  "success": true,
  "data": {
    "cashPosition": {
      "cashOnHand": 15000.00,
      "bankBalance": 85000.00,
      "total": 100000.00
    },
    "receivables": {
      "total": 25000.00,
      "current": 15000.00,
      "overdue30": 7500.00,
      "overdue60": 2500.00,
      "overdue90": 0.00
    },
    "payables": {
      "total": 35000.00,
      "current": 20000.00,
      "due30": 10000.00,
      "due60": 5000.00,
      "due90": 0.00
    },
    "profitability": {
      "grossProfit": 37500.15,
      "netProfit": 8000.15,
      "grossMargin": 30.0,
      "netMargin": 6.4
    }
  }
}
```

## Reports API Endpoints

### Generate Report
```http
POST /api/reports/generate
```

**Request Body:**
```json
{
  "reportType": "SALES_SUMMARY|INVENTORY_VALUATION|PROFIT_LOSS|...",
  "parameters": {
    "period": "MONTHLY",
    "startDate": "2023-11-01",
    "endDate": "2023-11-30",
    "storeId": "all",
    "format": "PDF|EXCEL|CSV",
    "includeCharts": true,
    "emailRecipients": ["user@example.com"]
  },
  "template": "STANDARD|DETAILED|SUMMARY"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reportId": "RPT-123456",
    "status": "PROCESSING",
    "estimatedTime": "2 minutes",
    "downloadUrl": "/api/reports/RPT-123456/download"
  }
}
```

### Get Report Status
```http
GET /api/reports/:reportId/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reportId": "RPT-123456",
    "status": "COMPLETED",
    "progress": 100,
    "downloadUrl": "/api/reports/RPT-123456/download",
    "expiresAt": "2023-12-18T12:00:00.000Z"
  }
}
```

### Download Report
```http
GET /api/reports/:reportId/download
```

**Query Parameters:**
- `format` (optional): Override original format (`PDF|EXCEL|CSV`)

**Response:** Binary file content with appropriate Content-Type header

### Get Scheduled Reports
```http
GET /api/reports/scheduled
```

**Query Parameters:**
- `status` (optional): `ACTIVE|INACTIVE|ALL`
- `createdBy` (optional): User ID

**Response:**
```json
{
  "success": true,
  "data": {
    "scheduledReports": [
      {
        "id": "SCH-123",
        "name": "Monthly Sales Report",
        "reportType": "SALES_SUMMARY",
        "parameters": {
          "period": "MONTHLY",
          "format": "PDF"
        },
        "schedule": {
          "frequency": "MONTHLY",
          "dayOfMonth": 1,
          "time": "09:00"
        },
        "recipients": [
          {"email": "manager@example.com", "format": "PDF"}
        ],
        "isActive": true,
        "lastRun": "2023-11-01T09:00:00.000Z",
        "nextRun": "2023-12-01T09:00:00.000Z"
      }
    ]
  }
}
```

### Schedule Report
```http
POST /api/reports/schedule
```

**Request Body:**
```json
{
  "name": "Weekly Inventory Report",
  "reportType": "INVENTORY_VALUATION",
  "parameters": {
    "period": "WEEKLY",
    "storeId": "all",
    "format": "EXCEL"
  },
  "schedule": {
    "frequency": "WEEKLY",
    "dayOfWeek": 1, // Monday
    "time": "08:00"
  },
  "recipients": [
    {
      "email": "manager@example.com",
      "format": "EXCEL"
    },
    {
      "email": "supervisor@example.com",
      "format": "PDF"
    }
  ],
  "isActive": true
}
```

### Update Scheduled Report
```http
PUT /api/reports/schedule/:scheduleId
```

### Delete Scheduled Report
```http
DELETE /api/reports/schedule/:scheduleId
```

## Export API Endpoints

### Export Data
```http
POST /api/export/data
```

**Request Body:**
```json
{
  "dataType": "TRANSACTIONS|PRODUCTS|CUSTOMERS|SUPPLIERS|INVENTORY",
  "filters": {
    "startDate": "2023-11-01",
    "endDate": "2023-11-30",
    "storeId": "all",
    "status": "COMPLETED"
  },
  "fields": ["id", "date", "customer", "items", "total"],
  "format": "CSV|EXCEL|JSON"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "exportId": "EXP-123456",
    "status": "PROCESSING",
    "downloadUrl": "/api/export/EXP-123456/download"
  }
}
```

### Get Export Status
```http
GET /api/export/:exportId/status
```

### Download Export
```http
GET /api/export/:exportId/download
```

## Error Codes

| Error Code | HTTP Status | Description |
|------------|-------------|-------------|
| VALIDATION_ERROR | 400 | Invalid input parameters |
| UNAUTHORIZED | 401 | Authentication required |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |
| REPORT_GENERATION_FAILED | 500 | Report generation failed |
| EXPORT_FAILED | 500 | Data export failed |

## Rate Limiting

- Analytics endpoints: 100 requests per minute per user
- Report generation: 10 requests per hour per user
- Export endpoints: 5 requests per hour per user

## Caching

- Dashboard data: 5 minutes cache
- Report data: 1 hour cache (based on parameters)
- Lookup data: 24 hours cache
- Cache invalidation on data changes

## Pagination

List endpoints support pagination:
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 500)
- `sortBy`: Field to sort by
- `sortOrder`: `ASC|DESC` (default: DESC)

Example:
```http
GET /api/analytics/sales/products?page=2&limit=25&sortBy=revenue&sortOrder=DESC
```

## Webhook Support

For real-time updates:

```http
POST /api/webhooks/register
```

**Request Body:**
```json
{
  "url": "https://your-app.com/webhook",
  "events": ["REPORT_COMPLETED", "DATA_EXPORTED"],
  "secret": "your-webhook-secret"
}
```

Webhook payload format:
```json
{
  "event": "REPORT_COMPLETED",
  "data": {
    "reportId": "RPT-123456",
    "status": "COMPLETED",
    "downloadUrl": "/api/reports/RPT-123456/download"
  },
  "timestamp": "2023-12-17T12:00:00.000Z"
}