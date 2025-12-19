# Automated Reordering System - API Specifications

## Overview

This document outlines the REST API specifications for the enhanced automated reordering system in PharmaSpot. The APIs are designed to support intelligent inventory replenishment with AI/ML-driven suggestions, supplier integration, and automated purchase order generation.

## Authentication & Authorization

All API endpoints require authentication using JWT tokens or session-based authentication.

```http
Authorization: Bearer <jwt_token>
or
Cookie: session_id=<session_id>
```

## 1. Reorder Trigger System APIs

### 1.1 Real-time Inventory Monitoring

#### GET /api/reorder-triggers/inventory-status

Get current inventory status with trigger analysis for all products.

**Request Parameters:**
- `storeId` (integer, optional): Store ID for multi-store environments
- `productId` (integer, optional): Filter for specific product
- `triggerType` (string, optional): Filter by trigger type (STOCK_LEVEL, EXPIRY, SEASONAL, MANUAL, EMERGENCY)

**Response:**
```json
{
  "success": true,
  "data": {
    "totalProducts": 1250,
    "triggeredProducts": 45,
    "triggers": [
      {
        "productId": 123,
        "productName": "Paracetamol 500mg",
        "storeId": 1,
        "currentQuantity": 15,
        "minStock": 50,
        "maxStock": 200,
        "triggerType": "STOCK_LEVEL",
        "triggerSeverity": "HIGH",
        "triggerData": {
          "stockDeficit": 35,
          "daysOfSupply": 3,
          "urgencyScore": 8.5
        },
        "triggeredAt": "2023-12-18T10:30:00Z"
      }
    ],
    "summary": {
      "criticalTriggers": 5,
      "highTriggers": 12,
      "mediumTriggers": 18,
      "lowTriggers": 10
    }
  }
}
```

#### POST /api/reorder-triggers/evaluate

Manually trigger reorder evaluation for specific products or criteria.

**Request Body:**
```json
{
  "evaluationCriteria": {
    "productIds": [123, 456, 789],
    "storeId": 1,
    "triggerTypes": ["STOCK_LEVEL", "EXPIRY"],
    "forceEvaluation": false
  },
  "context": {
    "reason": "MANUAL_REVIEW",
    "userId": 45,
    "priority": "HIGH"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "evaluationId": "eval_123456789",
    "evaluatedProducts": 3,
    "newSuggestions": 2,
    "updatedSuggestions": 1,
    "recommendations": [
      {
        "productId": 123,
        "suggestionId": "sug_456789",
        "action": "CREATE_PO",
        "confidence": 0.85,
        "reasoning": "Stock level below minimum with seasonal demand increase expected"
      }
    ]
  }
}
```

### 1.2 Expiry-Based Reordering

#### GET /api/reorder-triggers/expiry-analysis

Get products approaching expiry dates that may require reordering.

**Request Parameters:**
- `storeId` (integer, optional): Store ID
- `daysThreshold` (integer, default: 90): Days threshold for expiry analysis
- `includeExpired` (boolean, default: false): Include already expired products

**Response:**
```json
{
  "success": true,
  "data": {
    "expiryAnalysis": {
      "expiringIn30Days": 12,
      "expiringIn60Days": 28,
      "expiringIn90Days": 45,
      "expiredProducts": 8
    },
    "reorderRecommendations": [
      {
        "productId": 234,
        "productName": "Amoxicillin 250mg",
        "batchId": 567,
        "batchNumber": "BATCH123",
        "expiryDate": "2024-02-15",
        "daysToExpiry": 58,
        "currentQuantity": 25,
        "consumptionRate": 2.5,
        "daysOfSupply": 10,
        "reorderRecommended": true,
        "urgency": "MEDIUM",
        "recommendedOrderDate": "2024-01-20",
        "estimatedLoss": 150.00
      }
    ]
  }
}
```

#### POST /api/reorder-triggers/expiry-monitor

Configure expiry monitoring settings.

**Request Body:**
```json
{
  "storeId": 1,
  "expiryThresholds": {
    "critical": 30,
    "high": 60,
    "medium": 90
  },
  "autoEvaluation": true,
  "evaluationFrequency": "DAILY",
  "notificationSettings": {
    "email": true,
    "sms": false,
    "inApp": true
  }
}
```

### 1.3 Seasonal Demand Forecasting

#### GET /api/reorder-triggers/seasonal-forecast

Get seasonal demand forecasts for products.

**Request Parameters:**
- `productId` (integer, required): Product ID
- `timeframe` (string, default: "90days"): Forecast timeframe (30days, 60days, 90days, 6months, 1year)
- `storeId` (integer, optional): Store ID

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": 123,
    "productName": "Paracetamol 500mg",
    "currentSeason": "WINTER",
    "forecast": {
      "baseDemand": 150,
      "seasonalAdjustment": 1.35,
      "adjustedDemand": 202.5,
      "confidence": 0.82,
      "forecastPeriod": "2024-01-01 to 2024-03-31"
    },
    "seasonalPatterns": {
      "winter": 1.35,
      "spring": 0.95,
      "summer": 0.85,
      "autumn": 1.15
    },
    "trendAnalysis": {
      "direction": "INCREASING",
      "changeRate": 0.08,
      "confidence": 0.75
    }
  }
}
```

#### POST /api/reorder-triggers/seasonal-config

Configure seasonal forecasting parameters.

**Request Body:**
```json
{
  "productId": 123,
  "seasonalFactors": {
    "winter": 1.35,
    "spring": 0.95,
    "summer": 0.85,
    "autumn": 1.15
  },
  "trendAdjustment": {
    "enabled": true,
    "lookbackPeriod": "2years",
    "smoothingFactor": 0.3
  },
  "externalFactors": {
    "weather": true,
    "localEvents": true,
    "holidays": true
  }
}
```

## 2. Enhanced Suggestion Engine APIs

### 2.1 AI/ML Demand Prediction

#### GET /api/suggestions/demand-prediction

Get AI/ML-powered demand predictions for products.

**Request Parameters:**
- `productId` (integer, required): Product ID
- `timeframe` (string, default: "90days"): Prediction timeframe
- `modelType` (string, optional): Specific model to use (ENSEMBLE, LINEAR, RANDOM_FOREST, LSTM)
- `storeId` (integer, optional): Store ID

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": 123,
    "prediction": {
      "predictedDemand": 202.5,
      "confidenceInterval": {
        "lower": 185.2,
        "upper": 219.8,
        "confidenceLevel": 0.95
      },
      "confidence": 0.82,
      "modelUsed": "ENSEMBLE",
      "predictionHorizon": "90days",
      "features": {
        "historicalSales": {
          "weight": 0.35,
          "trend": "INCREASING"
        },
        "seasonality": {
          "weight": 0.25,
          "currentSeason": "WINTER",
          "factor": 1.35
        },
        "externalFactors": {
          "weight": 0.15,
          "weatherImpact": 1.1,
          "localEvents": 0.95
        },
        "marketConditions": {
          "weight": 0.25,
          "competitorPricing": "STABLE",
          "supplyChain": "NORMAL"
        }
      }
    },
    "modelPerformance": {
      "historicalAccuracy": 0.85,
      "lastTrainingDate": "2023-12-01",
      "modelVersion": "v2.3.1"
    }
  }
}
```

#### POST /api/suggestions/prediction-feedback

Submit feedback on prediction accuracy for model improvement.

**Request Body:**
```json
{
  "predictionId": "pred_123456789",
  "productId": 123,
  "storeId": 1,
  "actualDemand": 195,
  "predictedDemand": 202.5,
  "accuracy": 0.96,
  "feedback": {
    "rating": 4,
    "comments": "Prediction was very accurate, slight overestimation due to unexpected weather",
    "externalFactors": {
      "weatherEvent": "UNEXPECTED_STORM",
      "localEvent": "COMMUNITY_FESTIVAL"
    }
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### 2.2 Economic Order Quantity (EOQ) Calculation

#### GET /api/suggestions/eoq-calculation

Get optimized order quantity calculations based on EOQ model.

**Request Parameters:**
- `productId` (integer, required): Product ID
- `supplierId` (integer, optional): Specific supplier ID
- `constraints` (object, optional): Constraint parameters
- `storeId` (integer, optional): Store ID

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": 123,
    "productName": "Paracetamol 500mg",
    "eoqCalculation": {
      "basicEOQ": 180,
      "optimalQuantity": 200,
      "constraints": {
        "minOrderQuantity": 100,
        "maxOrderQuantity": 500,
        "packageSize": 50,
        "budget": 5000,
        "storageSpace": 2.5
      },
      "constraintImpact": {
        "packageSize": "+20 units",
        "budget": "No impact",
        "storage": "No impact"
      },
      "totalCost": {
        "orderingCost": 25.00,
        "holdingCost": 45.50,
        "purchaseCost": 1800.00,
        "totalCost": 1870.50
      },
      "costBreakdown": {
        "unitCost": 9.00,
        "orderingCostPerUnit": 0.125,
        "holdingCostPerUnit": 0.227,
        "totalCostPerUnit": 9.352
      }
    },
    "sensitivity": {
      "demandVariation": {
        "-20%": 179,
        "-10%": 190,
        "+10%": 210,
        "+20%": 219
      },
      "costVariation": {
        "orderingCost": {
          "-20%": 169,
          "+20%": 230
        },
        "holdingCost": {
          "-20%": 226,
          "+20%": 178
        }
      }
    }
  }
}
```

#### POST /api/suggestions/eoq-parameters

Configure EOQ calculation parameters for products.

**Request Body:**
```json
{
  "productId": 123,
  "storeId": 1,
  "parameters": {
    "orderingCost": 25.00,
    "holdingCostPercentage": 0.15,
    "demandVariability": 0.2,
    "leadTimeVariability": 0.1
  },
  "constraints": {
    "minOrderQuantity": 100,
    "maxOrderQuantity": 500,
    "packageSize": 50,
    "budgetLimit": 5000,
    "storageSpaceLimit": 2.5
  },
  "optimizationGoals": {
    "minimizeTotalCost": true,
    "minimizeStockouts": true,
    "maximizeServiceLevel": 0.95
  }
}
```

### 2.3 Budget Constraint Optimization

#### GET /api/suggestions/budget-optimization

Get budget-optimized reorder suggestions across multiple products.

**Request Parameters:**
- `budget` (number, required): Total budget amount
- `productIds` (array, optional): Specific product IDs to consider
- `storeId` (integer, optional): Store ID
- `timeframe` (string, default: "current"): Budget timeframe (current, next_month, quarter)

**Response:**
```json
{
  "success": true,
  "data": {
    "budget": 5000.00,
    "optimization": {
      "algorithm": "KNAPSACK",
      "objective": "MAXIMIZE_COVERAGE",
      "constraints": ["BUDGET", "MIN_STOCK", "PACKAGE_SIZE"]
    },
    "allocation": [
      {
        "productId": 123,
        "productName": "Paracetamol 500mg",
        "priority": "HIGH",
        "currentStock": 15,
        "minStock": 50,
        "recommendedQuantity": 200,
        "unitCost": 9.00,
        "totalCost": 1800.00,
        "urgency": "HIGH",
        "stockoutRisk": 0.85
      },
      {
        "productId": 456,
        "productName": "Amoxicillin 250mg",
        "priority": "MEDIUM",
        "currentStock": 80,
        "minStock": 30,
        "recommendedQuantity": 150,
        "unitCost": 12.50,
        "totalCost": 1875.00,
        "urgency": "MEDIUM",
        "stockoutRisk": 0.45
      }
    ],
    "summary": {
      "totalCost": 3675.00,
      "remainingBudget": 1325.00,
      "productsCovered": 2,
      "stockoutRiskReduced": 0.65,
      "serviceLevel": 0.92
    },
    "alternatives": [
      {
        "type": "REDUCE_QUANTITY",
        "description": "Reduce quantity of product 456 by 25 units to include product 789",
        "impact": "Service level reduces to 0.88"
      },
      {
        "type": "INCREASE_BUDGET",
        "description": "Increase budget by $625 to include all critical items",
        "impact": "Service level improves to 0.96"
      }
    ]
  }
}
```

## 3. Supplier Integration APIs

### 3.1 Supplier Catalog Integration

#### GET /api/suppliers/catalog/:supplierId

Get integrated supplier catalog for a specific supplier.

**Request Parameters:**
- `supplierId` (integer, required): Supplier ID
- `lastSync` (string, optional): Get updates since last sync
- `category` (string, optional): Filter by product category

**Response:**
```json
{
  "success": true,
  "data": {
    "supplierId": 123,
    "supplierName": "MediSupply Corp",
    "catalog": {
      "products": [
        {
          "supplierSKU": "PARA500-100",
          "internalProductId": 456,
          "name": "Paracetamol 500mg",
          "description": "Paracetamol tablets 500mg, 100 tablets per bottle",
          "category": "Analgesics",
          "unitPrice": 8.50,
          "currency": "USD",
          "minOrderQuantity": 100,
          "packageSize": 50,
          "leadTimeDays": 7,
          "availability": "IN_STOCK",
          "discounts": [
            {
              "type": "VOLUME",
              "minQuantity": 500,
              "discount": 0.05
            },
            {
              "type": "EARLY_PAYMENT",
              "days": 10,
              "discount": 0.02
            }
          ],
          "lastUpdated": "2023-12-18T09:00:00Z"
        }
      ],
      "totalProducts": 1250,
      "lastSync": "2023-12-18T10:30:00Z"
    },
    "integration": {
      "type": "API",
      "status": "ACTIVE",
      "lastSync": "2023-12-18T10:30:00Z",
      "nextSync": "2023-12-19T10:30:00Z",
      "syncFrequency": "DAILY"
    }
  }
}
```

#### POST /api/suppliers/catalog/sync

Trigger manual catalog synchronization for a supplier.

**Request Body:**
```json
{
  "supplierId": 123,
  "syncOptions": {
    "fullSync": false,
    "categoryFilter": ["Analgesics", "Antibiotics"],
    "priceUpdateOnly": false,
    "forceUpdate": false
  },
  "notificationSettings": {
    "emailOnCompletion": true,
    "notifyOnErrors": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "syncId": "sync_789456123",
    "status": "INITIATED",
    "estimatedDuration": "15 minutes",
    "productsToSync": 1250,
    "lastSync": "2023-12-17T10:30:00Z"
  }
}
```

### 3.2 Price Comparison and Negotiation

#### GET /api/suppliers/price-comparison

Get price comparison across multiple suppliers for a product.

**Request Parameters:**
- `productId` (integer, required): Product ID
- `quantity` (integer, required): Order quantity
- `supplierIds` (array, optional): Specific suppliers to compare
- `includeShipping` (boolean, default: true): Include shipping costs

**Response:**
```json
{
  "success": true,
  "data": {
    "productId": 123,
    "productName": "Paracetamol 500mg",
    "quantity": 200,
    "priceComparison": {
      "bestPrice": {
        "supplierId": 456,
        "supplierName": "MediSupply Corp",
        "unitPrice": 8.50,
        "totalCost": 1700.00,
        "shippingCost": 50.00,
        "taxCost": 85.00,
        "totalLandedCost": 1835.00,
        "leadTimeDays": 7
      },
      "alternatives": [
        {
          "supplierId": 789,
          "supplierName": "PharmaDirect",
          "unitPrice": 8.75,
          "totalCost": 1750.00,
          "shippingCost": 75.00,
          "taxCost": 87.50,
          "totalLandedCost": 1912.50,
          "leadTimeDays": 5,
          "advantages": ["Faster delivery", "Lower minimum order"],
          "disadvantages": ["Higher unit price"]
        }
      ]
    },
    "negotiationOpportunities": [
      {
        "type": "VOLUME_DISCOUNT",
        "potentialSavings": 85.00,
        "minQuantity": 500,
        "recommendedAction": "Increase order to 500 units for 5% discount"
      },
      {
        "type": "EARLY_PAYMENT",
        "potentialSavings": 34.00,
        "paymentTerms": "NET10",
        "recommendedAction": "Pay within 10 days for 2% discount"
      },
      {
        "type": "PRICE_MATCHING",
        "potentialSavings": 50.00,
        "competitorPrice": 8.25,
        "recommendedAction": "Request price match with PharmaDirect"
      }
    ],
    "totalSavings": 169.00,
    "priceHistory": {
      "trend": "STABLE",
      "volatility": 0.05,
      "lastPriceChange": "2023-11-15"
    }
  }
}
```

### 3.3 Lead Time Tracking

#### GET /api/suppliers/lead-time-analysis

Get lead time analysis and predictions for suppliers.

**Request Parameters:**
- `supplierId` (integer, required): Supplier ID
- `productId` (integer, optional): Specific product analysis
- `timeframe` (string, default: "6months"): Analysis timeframe

**Response:**
```json
{
  "success": true,
  "data": {
    "supplierId": 123,
    "supplierName": "MediSupply Corp",
    "leadTimeAnalysis": {
      "current": {
        "average": 7.2,
        "median": 7,
        "standardDeviation": 1.8,
        "min": 4,
        "max": 12
      },
      "trend": {
        "direction": "STABLE",
        "changeRate": 0.05,
        "confidence": 0.75
      },
      "reliability": {
        "onTimeDeliveryRate": 0.92,
        "earlyDeliveryRate": 0.05,
        "lateDeliveryRate": 0.03,
        "reliabilityScore": 8.5
      },
      "prediction": {
        "nextOrderLeadTime": 7.5,
        "confidence": 0.82,
        "factors": {
          "seasonalAdjustment": 1.1,
          "currentCapacity": 0.95,
          "shippingConditions": 1.0
        }
      }
    },
    "factors": {
      "supplier": {
        "reliability": 8.5,
        "capacity": "HIGH",
        "location": "SAME_REGION",
        "shippingMethods": ["STANDARD", "EXPRESS"]
      },
      "product": {
        "category": "STANDARD",
        "manufacturingComplexity": "LOW",
        "importRequirements": "NONE"
      },
      "external": {
        "seasonality": "WINTER_PEAK",
        "weatherImpact": "MINIMAL",
        "shippingConditions": "NORMAL"
      }
    },
    "recommendations": [
      {
        "type": "BUFFER_STOCK",
        "description": "Maintain 15 days safety stock due to lead time variability",
        "bufferDays": 3
      },
      {
        "type": "ALTERNATIVE_SUPPLIER",
        "description": "Consider backup supplier for critical periods",
        "recommendedSuppliers": [456, 789]
      }
    ]
  }
}
```

## 4. Purchase Order Automation APIs

### 4.1 Automatic PO Generation

#### POST /api/purchase-orders/auto-generate

Generate optimized purchase orders based on reorder suggestions.

**Request Body:**
```json
{
  "suggestionIds": ["sug_123", "sug_456", "sug_789"],
  "storeId": 1,
  "optimizationCriteria": {
    "minimizeCost": true,
    "minimizeLeadTime": false,
    "maximizeSupplierPerformance": true,
    "respectBudget": true,
    "budget": 5000.00
  },
  "groupingOptions": {
    "groupBySupplier": true,
    "groupByDeliveryDate": false,
    "maxOrdersPerSupplier": 1
  },
  "approvalSettings": {
    "autoApproveBelow": 1000.00,
    "requireApprovalForNewSuppliers": true,
    "approvalWorkflow": "MANAGER_DIRECTOR"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "generationId": "gen_987654321",
    "purchaseOrders": [
      {
        "orderId": "po_123456789",
        "orderNumber": "PO20231218001",
        "supplierId": 456,
        "supplierName": "MediSupply Corp",
        "items": [
          {
            "productId": 123,
            "productName": "Paracetamol 500mg",
            "quantity": 200,
            "unitPrice": 8.50,
            "totalPrice": 1700.00,
            "optimization": {
              "eoqAdjusted": true,
              "budgetConstrained": false,
              "seasonalAdjustment": 1.2
            }
          }
        ],
        "totalAmount": 1700.00,
        "expectedDeliveryDate": "2023-12-27",
        "deliverySchedule": [
          {
            "date": "2023-12-27",
            "items": [123]
          }
        ],
        "optimization": {
          "supplierSelection": {
            "reasoning": "Best combination of price, reliability, and lead time",
            "score": 8.7
          },
          "quantityOptimization": {
            "reasoning": "EOQ adjusted for seasonal demand",
            "factors": ["DEMAND", "SEASONALITY", "STORAGE"]
          }
        },
        "confidence": 0.85,
        "status": "PENDING_APPROVAL"
      }
    ],
    "summary": {
      "totalOrders": 1,
      "totalAmount": 1700.00,
      "budgetUtilization": 0.34,
      "expectedSavings": 85.00,
      "optimizationScore": 8.7
    },
    "alternatives": [
      {
        "type": "SPLIT_ORDER",
        "description": "Split order across two suppliers for better risk distribution",
        "impact": "Slightly higher cost but improved reliability"
      }
    ]
  }
}
```

### 4.2 Approval Workflow

#### GET /api/purchase-orders/approval-queue

Get purchase orders awaiting approval.

**Request Parameters:**
- `status` (string, optional): Filter by approval status (PENDING, APPROVED, REJECTED)
- `approverId` (integer, optional): Filter by specific approver
- `storeId` (integer, optional): Store ID filter

**Response:**
```json
{
  "success": true,
  "data": {
    "pendingApprovals": [
      {
        "orderId": "po_123456789",
        "orderNumber": "PO20231218001",
        "supplierName": "MediSupply Corp",
        "totalAmount": 2500.00,
        "requestDate": "2023-12-18T10:30:00Z",
        "requestedBy": {
          "userId": 45,
          "name": "John Smith",
          "role": "Pharmacy Manager"
        },
        "approvalRequirements": {
          "requiresApproval": true,
          "approvalLevel": "MANAGER",
          "conditions": [
            {
              "type": "AMOUNT_EXCEEDS_LIMIT",
              "limit": 1000.00,
              "actual": 2500.00
            }
          ]
        },
        "approvers": [
          {
            "userId": 67,
            "name": "Jane Doe",
            "role": "Regional Manager",
            "status": "PENDING",
            "decisionDate": null
          }
        ],
        "status": "PENDING_APPROVAL",
        "urgency": "MEDIUM"
      }
    ],
    "summary": {
      "totalPending": 3,
      "totalAmount": 6750.00,
      "overdueApprovals": 1,
      "averageApprovalTime": "2.5 days"
    }
  }
}
```

#### POST /api/purchase-orders/approve

Approve or reject a purchase order.

**Request Body:**
```json
{
  "orderId": "po_123456789",
  "action": "APPROVE",
  "approverId": 67,
  "comments": "Approved with minor quantity adjustment for product 456",
  "conditions": [
    {
      "type": "QUANTITY_ADJUSTMENT",
      "productId": 456,
      "originalQuantity": 150,
      "adjustedQuantity": 135,
      "reason": "Budget constraint"
    }
  ],
  "approvalLevel": "MANAGER"
}
```

### 4.3 Budget Checking and Alerts

#### GET /api/budget/check

Check budget availability for purchase orders.

**Request Parameters:**
- `orderId` (integer, required): Purchase order ID
- `storeId` (integer, optional): Store ID

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "po_123456789",
    "orderAmount": 2500.00,
    "budgetAnalysis": {
      "departmentBudget": {
        "allocated": 10000.00,
        "spent": 7500.00,
        "remaining": 2500.00,
        "utilization": 0.75
      },
      "categoryBudget": {
        "allocated": 5000.00,
        "spent": 3200.00,
        "remaining": 1800.00,
        "utilization": 0.64
      },
      "periodBudget": {
        "allocated": 20000.00,
        "spent": 15000.00,
        "remaining": 5000.00,
        "daysRemaining": 12,
        "utilization": 0.75
      }
    },
    "withinBudget": true,
    "alerts": [
      {
        "type": "HIGH_UTILIZATION",
        "severity": "MEDIUM",
        "message": "Department budget utilization at 75%",
        "recommendation": "Monitor remaining budget carefully"
      }
    ],
    "alternatives": [
      {
        "type": "DEFER_NON_CRITICAL",
        "description": "Defer non-critical items to next budget period",
        "potentialSavings": 500.00
      }
    ]
  }
}
```

#### POST /api/budget/alert-configuration

Configure budget alert settings.

**Request Body:**
```json
{
  "storeId": 1,
  "alertThresholds": {
    "utilizationWarning": 0.8,
    "utilizationCritical": 0.95,
    "periodEndWarning": 7, // days
    "overBudgetAlert": true
  },
  "notificationChannels": {
    "email": ["manager@pharmacy.com", "finance@pharmacy.com"],
    "inApp": true,
    "sms": false
  },
  "escalationRules": {
    "criticalEscalation": ["regional_manager@pharmacy.com"],
    "overBudgetEscalation": ["cfo@pharmacy.com"]
  }
}
```

## 5. Analytics and Reporting APIs

### 5.1 Reorder Performance Metrics

#### GET /api/analytics/reorder-performance

Get comprehensive reorder performance analytics.

**Request Parameters:**
- `timeframe` (string, default: "30days"): Analysis timeframe
- `storeId` (integer, optional): Store ID
- `productId` (integer, optional): Specific product analysis
- `groupBy` (string, default: "day"): Grouping (day, week, month, quarter)

**Response:**
```json
{
  "success": true,
  "data": {
    "summary": {
      "totalReorders": 45,
      "successfulReorders": 42,
      "successRate": 0.93,
      "averageProcessingTime": "2.3 days",
      "totalValue": 125000.00,
      "averageOrderValue": 2777.78
    },
    "efficiency": {
      "orderProcessingTime": {
        "average": "2.3 days",
        "median": "2.1 days",
        "target": "< 3 days",
        "achievement": 0.87
      },
      "fulfillmentRate": {
        "onTime": 0.92,
        "complete": 0.95,
        "partial": 0.03,
        "target": "> 0.90",
        "achievement": 0.96
      },
      "stockoutPrevention": {
        "preventedStockouts": 8,
        "potentialStockouts": 12,
        "preventionRate": 0.67,
        "estimatedSavings": 2500.00
      },
      "inventoryTurnover": {
        "current": 8.5,
        "target": "8-10",
        "achievement": 0.85
      },
      "carryingCost": {
        "average": 1250.00,
        "target": "< 1500.00",
        "achievement": 0.92
      }
    },
    "accuracy": {
      "forecastAccuracy": {
        "mape": 0.12,
        "mae": 15.5,
        "rmse": 22.3,
        "bias": 0.05,
        "target": "< 0.15",
        "achievement": 0.92
      },
      "modelPerformance": {
        "linearRegression": 0.78,
        "randomForest": 0.85,
        "lstm": 0.82,
        "ensemble": 0.88
      }
    },
    "trends": {
      "processingTime": "DECREASING",
      "accuracy": "IMPROVING",
      "costSavings": "INCREASING"
    },
    "improvement": [
      {
        "area": "FORECAST_ACCURACY",
        "current": 0.88,
        "target": 0.90,
        "recommendation": "Retrain LSTM model with additional weather data",
        "potentialImpact": "5% accuracy improvement"
      },
      {
        "area": "PROCESSING_TIME",
        "current": "2.3 days",
        "target": "< 2 days",
        "recommendation": "Implement auto-approval for orders < $1000",
        "potentialImpact": "20% time reduction"
      }
    ]
  }
}
```

### 5.2 Forecast Accuracy Tracking

#### GET /api/analytics/forecast-accuracy

Get detailed forecast accuracy metrics and trends.

**Request Parameters:**
- `productId` (integer, optional): Specific product analysis
- `modelType` (string, optional): Specific model analysis
- `timeframe` (string, default: "90days"): Analysis period
- `storeId` (integer, optional): Store ID

**Response:**
```json
{
  "success": true,
  "data": {
    "accuracyMetrics": {
      "overallAccuracy": 0.87,
      "mae": 14.2,
      "mape": 0.13,
      "rmse": 19.8,
      "bias": 0.03,
      "fva": 0.15
    },
    "modelComparison": {
      "linearRegression": {
        "accuracy": 0.78,
        "mape": 0.18,
        "trend": "STABLE"
      },
      "randomForest": {
        "accuracy": 0.85,
        "mape": 0.14,
        "trend": "IMPROVING"
      },
      "lstm": {
        "accuracy": 0.82,
        "mape": 0.16,
        "trend": "IMPROVING"
      },
      "ensemble": {
        "accuracy": 0.87,
        "mape": 0.13,
        "trend": "IMPROVING"
      }
    },
    "accuracyTrend": {
      "direction": "IMPROVING",
      "rate": 0.02,
      "confidence": 0.75,
      "periods": [
        {
          "period": "2023-10",
          "accuracy": 0.82
        },
        {
          "period": "2023-11",
          "accuracy": 0.84
        },
        {
          "period": "2023-12",
          "accuracy": 0.87
        }
      ]
    },
    "recommendations": [
      {
        "type": "MODEL_RETRAINING",
        "priority": "HIGH",
        "description": "Retrain ensemble model with latest 3 months data",
        "expectedImprovement": "3-5% accuracy"
      },
      {
        "type": "FEATURE_ENGINEERING",
        "priority": "MEDIUM",
        "description": "Add local events as feature for seasonal products",
        "expectedImprovement": "2-3% accuracy"
      }
    ]
  }
}
```

## 6. System Configuration APIs

### 6.1 Reorder System Configuration

#### GET /api/config/reorder-system

Get current reorder system configuration.

**Response:**
```json
{
  "success": true,
  "data": {
    "triggers": {
      "stockLevelMonitoring": {
        "enabled": true,
        "frequency": "REAL_TIME",
        "criticalThreshold": 0.1,
        "warningThreshold": 0.25
      },
      "expiryMonitoring": {
        "enabled": true,
        "criticalDays": 30,
        "warningDays": 60,
        "autoReorder": true
      },
      "seasonalForecasting": {
        "enabled": true,
        "models": ["ENSEMBLE", "SEASONAL_DECOMPOSITION"],
        "lookbackPeriod": "2years"
      }
    },
    "suggestions": {
      "demandPrediction": {
        "enabled": true,
        "defaultModel": "ENSEMBLE",
        "confidenceThreshold": 0.7
      },
      "eoqCalculation": {
        "enabled": true,
        "defaultConstraints": true,
        "optimizationGoals": ["MINIMIZE_TOTAL_COST"]
      },
      "budgetOptimization": {
        "enabled": true,
        "algorithm": "KNAPSACK",
        "maximizeCoverage": true
      }
    },
    "automation": {
      "poGeneration": {
        "enabled": true,
        "autoApproveBelow": 1000.00,
        "groupingStrategy": "SUPPLIER"
      },
      "approvalWorkflow": {
        "enabled": true,
        "levels": ["MANAGER", "DIRECTOR"],
        "timeoutHours": 48
      }
    }
  }
}
```

#### PUT /api/config/reorder-system

Update reorder system configuration.

**Request Body:**
```json
{
  "triggers": {
    "stockLevelMonitoring": {
      "enabled": true,
      "frequency": "REAL_TIME",
      "criticalThreshold": 0.15,
      "warningThreshold": 0.3
    },
    "expiryMonitoring": {
      "enabled": true,
      "criticalDays": 25,
      "warningDays": 45,
      "autoReorder": true
    }
  },
  "suggestions": {
    "demandPrediction": {
      "enabled": true,
      "defaultModel": "ENSEMBLE",
      "confidenceThreshold": 0.75,
      "retrainFrequency": "MONTHLY"
    }
  },
  "automation": {
    "poGeneration": {
      "enabled": true,
      "autoApproveBelow": 1500.00,
      "groupingStrategy": "SUPPLIER_PRIORITY"
    }
  }
}
```

## Error Response Format

All APIs return consistent error response format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid product ID provided",
    "details": {
      "field": "productId",
      "value": "invalid",
      "expected": "integer"
    }
  },
  "timestamp": "2023-12-18T10:30:00Z",
  "requestId": "req_123456789"
}
```

## Rate Limiting

API endpoints are rate-limited to prevent abuse:

- Standard endpoints: 100 requests per minute
- ML-intensive endpoints: 20 requests per minute
- Bulk operations: 10 requests per minute

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640425400
```

## Pagination

List endpoints support pagination with these parameters:
- `page` (integer, default: 1): Page number
- `limit` (integer, default: 20): Items per page (max: 100)
- `sort` (string, optional): Sort field
- `order` (string, default: "asc"): Sort order (asc, desc)

Pagination response format:
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "total": 1250,
    "page": 1,
    "limit": 20,
    "pages": 63,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Webhooks

Configure webhooks for real-time notifications:

### POST /api/webhooks/register

Register a webhook endpoint.

**Request Body:**
```json
{
  "url": "https://your-pharmacy.com/webhooks/reorder",
  "events": ["REORDER_SUGGESTED", "PO_GENERATED", "APPROVAL_REQUIRED"],
  "secret": "webhook_secret_key",
  "active": true
}
```

### Webhook Event Format

```json
{
  "eventId": "evt_123456789",
  "eventType": "REORDER_SUGGESTED",
  "timestamp": "2023-12-18T10:30:00Z",
  "data": {
    "suggestionId": "sug_456789",
    "productId": 123,
    "urgency": "HIGH",
    "reason": "Stock level below minimum threshold"
  },
  "signature": "sha256_hash"
}
```

These API specifications provide a comprehensive foundation for implementing the automated reordering system with enhanced suggestions in PharmaSpot. The APIs are designed to be RESTful, consistent, and extensible for future enhancements.