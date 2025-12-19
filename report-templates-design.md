# Report Templates and Data Sources Design

## Overview

This document defines the pre-defined report templates and data sources for the PharmaSoft custom report builder. The design focuses on simplicity while providing comprehensive coverage of pharmacy business reporting needs.

## Report Templates

### 1. Sales Reports

#### 1.1 Daily Sales Summary
```javascript
const dailySalesSummaryTemplate = {
  id: "daily_sales_summary",
  name: "Daily Sales Summary",
  description: "Daily sales performance with key metrics and breakdown",
  category: "sales",
  icon: "fa-calendar-day",
  
  dataSource: {
    primary: "transactions",
    collections: ["transactions", "users"],
    joins: [
      {
        from: "transactions",
        to: "users",
        on: "user_id",
        type: "left",
        select: ["users.fullname as cashierName"]
      }
    ]
  },
  
  defaultFilters: {
    dateRange: "today",
    storeId: "current",
    status: "paid"
  },
  
  availableFilters: [
    {
      key: "dateRange",
      type: "date-range",
      label: "Date Range",
      required: true,
      options: ["today", "yesterday", "custom"]
    },
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false
    },
    {
      key: "userId",
      type: "select",
      label: "Cashier",
      required: false
    }
  ],
  
  columns: [
    { key: "date", label: "Date", type: "date", format: "DD/MM/YYYY", width: "100px" },
    { key: "invoiceNumber", label: "Invoice", type: "string", width: "120px" },
    { key: "customerName", label: "Customer", type: "string", width: "150px" },
    { key: "items", label: "Items", type: "number", width: "80px" },
    { key: "subtotal", label: "Subtotal", type: "currency", width: "100px" },
    { key: "tax", label: "Tax", type: "currency", width: "100px" },
    { key: "discount", label: "Discount", type: "currency", width: "100px" },
    { key: "total", label: "Total", type: "currency", width: "100px" },
    { key: "paymentMethod", label: "Payment", type: "string", width: "100px" },
    { key: "cashierName", label: "Cashier", type: "string", width: "120px" }
  ],
  
  summaries: [
    { key: "totalSales", label: "Total Sales", calculation: "sum(total)" },
    { key: "totalTransactions", label: "Transactions", calculation: "count()" },
    { key: "averageTransaction", label: "Average Transaction", calculation: "avg(total)" },
    { key: "totalItems", label: "Total Items", calculation: "sum(items)" },
    { key: "totalTax", label: "Total Tax", calculation: "sum(tax)" },
    { key: "totalDiscount", label: "Total Discount", calculation: "sum(discount)" }
  ],
  
  charts: [
    {
      type: "line",
      title: "Sales Trend",
      xAxis: "hour",
      yAxis: "totalSales"
    },
    {
      type: "pie",
      title: "Payment Methods",
      valueField: "total",
      labelField: "paymentMethod"
    }
  ]
};
```

#### 1.2 Sales by Product
```javascript
const salesByProductTemplate = {
  id: "sales_by_product",
  name: "Sales by Product",
  description: "Product-wise sales analysis with quantity and revenue",
  category: "sales",
  icon: "fa-boxes",
  
  dataSource: {
    primary: "transactions",
    collections: ["transactions", "inventory"],
    joins: [
      {
        from: "transactions",
        to: "inventory",
        on: "items.productId",
        type: "inner",
        select: ["inventory.name as productName", "inventory.barcode"]
      }
    ]
  },
  
  defaultFilters: {
    dateRange: "this-month",
    storeId: "current"
  },
  
  availableFilters: [
    {
      key: "dateRange",
      type: "date-range",
      label: "Date Range",
      required: true
    },
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false
    },
    {
      key: "categoryId",
      type: "select",
      label: "Category",
      required: false
    }
  ],
  
  columns: [
    { key: "productName", label: "Product Name", type: "string", width: "200px" },
    { key: "barcode", label: "Barcode", type: "string", width: "120px" },
    { key: "quantity", label: "Quantity Sold", type: "number", width: "100px" },
    { key: "revenue", label: "Revenue", type: "currency", width: "120px" },
    { key: "cost", label: "Cost", type: "currency", width: "120px" },
    { key: "profit", label: "Profit", type: "currency", width: "120px" },
    { key: "profitMargin", label: "Margin %", type: "percentage", width: "100px" }
  ],
  
  summaries: [
    { key: "totalRevenue", label: "Total Revenue", calculation: "sum(revenue)" },
    { key: "totalProfit", label: "Total Profit", calculation: "sum(profit)" },
    { key: "averageMargin", label: "Average Margin", calculation: "avg(profitMargin)" },
    { key: "topProduct", label: "Top Product", calculation: "max_by(revenue)" }
  ],
  
  charts: [
    {
      type: "bar",
      title: "Top 10 Products",
      xAxis: "productName",
      yAxis: "revenue",
      limit: 10
    }
  ]
};
```

#### 1.3 Sales by Category
```javascript
const salesByCategoryTemplate = {
  id: "sales_by_category",
  name: "Sales by Category",
  description: "Category-wise sales performance analysis",
  category: "sales",
  icon: "fa-tags",
  
  dataSource: {
    primary: "transactions",
    collections: ["transactions", "inventory", "categories"],
    joins: [
      {
        from: "transactions",
        to: "inventory",
        on: "items.productId",
        type: "inner"
      },
      {
        from: "inventory",
        to: "categories",
        on: "category",
        type: "inner",
        select: ["categories.name as categoryName"]
      }
    ]
  },
  
  defaultFilters: {
    dateRange: "this-month",
    storeId: "current"
  },
  
  columns: [
    { key: "categoryName", label: "Category", type: "string", width: "150px" },
    { key: "quantity", label: "Quantity", type: "number", width: "100px" },
    { key: "revenue", label: "Revenue", type: "currency", width: "120px" },
    { key: "revenuePercentage", label: "% of Total", type: "percentage", width: "100px" },
    { key: "profit", label: "Profit", type: "currency", width: "120px" },
    { key: "profitMargin", label: "Margin %", type: "percentage", width: "100px" }
  ],
  
  summaries: [
    { key: "totalRevenue", label: "Total Revenue", calculation: "sum(revenue)" },
    { key: "totalCategories", label: "Categories", calculation: "count()" },
    { key: "topCategory", label: "Top Category", calculation: "max_by(revenue)" }
  ],
  
  charts: [
    {
      type: "pie",
      title: "Sales by Category",
      valueField: "revenue",
      labelField: "categoryName"
    }
  ]
};
```

### 2. Inventory Reports

#### 2.1 Current Stock Status
```javascript
const currentStockTemplate = {
  id: "current_stock_status",
  name: "Current Stock Status",
  description: "Current inventory levels with stock alerts",
  category: "inventory",
  icon: "fa-warehouse",
  
  dataSource: {
    primary: "inventory",
    collections: ["inventory", "store-inventory", "categories"],
    joins: [
      {
        from: "inventory",
        to: "store-inventory",
        on: "_id",
        type: "left",
        select: ["store-inventory.quantity as currentQuantity", "store-inventory.minStock"]
      },
      {
        from: "inventory",
        to: "categories",
        on: "category",
        type: "left",
        select: ["categories.name as categoryName"]
      }
    ]
  },
  
  defaultFilters: {
    storeId: "current"
  },
  
  availableFilters: [
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false
    },
    {
      key: "categoryId",
      type: "select",
      label: "Category",
      required: false
    },
    {
      key: "stockStatus",
      type: "select",
      label: "Stock Status",
      required: false,
      options: [
        { value: "all", label: "All Items" },
        { value: "low", label: "Low Stock" },
        { value: "out", label: "Out of Stock" },
        { value: "over", label: "Over Stock" }
      ]
    }
  ],
  
  columns: [
    { key: "name", label: "Product Name", type: "string", width: "200px" },
    { key: "barcode", label: "Barcode", type: "string", width: "120px" },
    { key: "categoryName", label: "Category", type: "string", width: "120px" },
    { key: "currentQuantity", label: "Current Stock", type: "number", width: "100px" },
    { key: "minStock", label: "Min Stock", type: "number", width: "100px" },
    { key: "price", label: "Price", type: "currency", width: "100px" },
    { key: "stockValue", label: "Stock Value", type: "currency", width: "120px" },
    { key: "status", label: "Status", type: "status", width: "100px" }
  ],
  
  summaries: [
    { key: "totalProducts", label: "Total Products", calculation: "count()" },
    { key: "totalStockValue", label: "Total Stock Value", calculation: "sum(stockValue)" },
    { key: "lowStockItems", label: "Low Stock Items", calculation: "count_if(status, 'Low')" },
    { key: "outOfStockItems", label: "Out of Stock", calculation: "count_if(status, 'Out')" }
  ],
  
  charts: [
    {
      type: "pie",
      title: "Stock Status",
      valueField: "count",
      labelField: "status"
    }
  ]
};
```

#### 2.2 Expiry Analysis
```javascript
const expiryAnalysisTemplate = {
  id: "expiry_analysis",
  name: "Expiry Analysis",
  description: "Products approaching expiry with risk assessment",
  category: "inventory",
  icon: "fa-clock",
  
  dataSource: {
    primary: "inventory",
    collections: ["inventory", "batches"],
    joins: [
      {
        from: "inventory",
        to: "batches",
        on: "_id",
        type: "inner",
        select: ["batches.expiryDate", "batches.currentQuantity", "batches.batchNumber"]
      }
    ]
  },
  
  defaultFilters: {
    storeId: "current",
    expiryDays: "30"
  },
  
  availableFilters: [
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false
    },
    {
      key: "expiryDays",
      type: "select",
      label: "Expiry Within",
      required: false,
      options: [
        { value: "7", label: "7 Days" },
        { value: "15", label: "15 Days" },
        { value: "30", label: "30 Days" },
        { value: "60", label: "60 Days" },
        { value: "90", label: "90 Days" }
      ]
    },
    {
      key: "categoryId",
      type: "select",
      label: "Category",
      required: false
    }
  ],
  
  columns: [
    { key: "name", label: "Product Name", type: "string", width: "180px" },
    { key: "batchNumber", label: "Batch", type: "string", width: "100px" },
    { key: "expiryDate", label: "Expiry Date", type: "date", width: "120px" },
    { key: "daysToExpiry", label: "Days to Expiry", type: "number", width: "120px" },
    { key: "currentQuantity", label: "Quantity", type: "number", width: "100px" },
    { key: "price", label: "Price", type: "currency", width: "100px" },
    { key: "value", label: "Value", type: "currency", width: "120px" },
    { key: "riskLevel", label: "Risk Level", type: "risk", width: "100px" }
  ],
  
  summaries: [
    { key: "totalItems", label: "Total Items", calculation: "count()" },
    { key: "totalValue", label: "Total Value", calculation: "sum(value)" },
    { key: "expiredItems", label: "Expired Items", calculation: "count_if(riskLevel, 'Expired')" },
    { key: "criticalItems", label: "Critical (7 days)", calculation: "count_if(daysToExpiry, '<= 7')" },
    { key: "warningItems", label: "Warning (30 days)", calculation: "count_if(daysToExpiry, '<= 30')" }
  ],
  
  charts: [
    {
      type: "bar",
      title: "Expiry Risk by Category",
      xAxis: "categoryName",
      yAxis: "value"
    }
  ]
};
```

### 3. Customer Reports

#### 3.1 Customer Sales History
```javascript
const customerSalesHistoryTemplate = {
  id: "customer_sales_history",
  name: "Customer Sales History",
  description: "Detailed purchase history for specific customers",
  category: "customers",
  icon: "fa-users",
  
  dataSource: {
    primary: "transactions",
    collections: ["transactions", "customers"],
    joins: [
      {
        from: "transactions",
        to: "customers",
        on: "customer",
        type: "inner",
        select: ["customers.name as customerName", "customers.phone", "customers.email"]
      }
    ]
  },
  
  defaultFilters: {
    dateRange: "this-month",
    storeId: "current"
  },
  
  availableFilters: [
    {
      key: "dateRange",
      type: "date-range",
      label: "Date Range",
      required: true
    },
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false
    },
    {
      key: "customerId",
      type: "select",
      label: "Customer",
      required: false,
      options: "customers"
    },
    {
      key: "customerType",
      type: "select",
      label: "Customer Type",
      required: false,
      options: [
        { value: "all", label: "All Customers" },
        { value: "regular", label: "Regular" },
        { value: "loyal", label: "Loyal" },
        { value: "new", label: "New" }
      ]
    }
  ],
  
  columns: [
    { key: "date", label: "Date", type: "date", width: "100px" },
    { key: "invoiceNumber", label: "Invoice", type: "string", width: "120px" },
    { key: "customerName", label: "Customer", type: "string", width: "150px" },
    { key: "items", label: "Items", type: "number", width: "80px" },
    { key: "total", label: "Total", type: "currency", width: "120px" },
    { key: "paymentMethod", label: "Payment", type: "string", width: "100px" }
  ],
  
  summaries: [
    { key: "totalSales", label: "Total Sales", calculation: "sum(total)" },
    { key: "totalTransactions", label: "Transactions", calculation: "count()" },
    { key: "averageTransaction", label: "Average Transaction", calculation: "avg(total)" },
    { key: "uniqueCustomers", label: "Unique Customers", calculation: "count_distinct(customerId)" }
  ],
  
  charts: [
    {
      type: "line",
      title: "Sales Trend",
      xAxis: "date",
      yAxis: "total"
    }
  ]
};
```

#### 3.2 Top Customers
```javascript
const topCustomersTemplate = {
  id: "top_customers",
  name: "Top Customers",
  description: "Best performing customers by revenue and frequency",
  category: "customers",
  icon: "fa-trophy",
  
  dataSource: {
    primary: "transactions",
    collections: ["transactions", "customers"],
    joins: [
      {
        from: "transactions",
        to: "customers",
        on: "customer",
        type: "inner",
        select: ["customers.name as customerName", "customers.phone"]
      }
    ]
  },
  
  defaultFilters: {
    dateRange: "this-month",
    storeId: "current"
  },
  
  availableFilters: [
    {
      key: "dateRange",
      type: "date-range",
      label: "Date Range",
      required: true
    },
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false
    },
    {
      key: "limit",
      type: "select",
      label: "Show Top",
      required: false,
      options: [
        { value: "10", label: "Top 10" },
        { value: "25", label: "Top 25" },
        { value: "50", label: "Top 50" },
        { value: "100", label: "Top 100" }
      ]
    }
  ],
  
  columns: [
    { key: "customerName", label: "Customer", type: "string", width: "180px" },
    { key: "phone", label: "Phone", type: "string", width: "120px" },
    { key: "totalTransactions", label: "Transactions", type: "number", width: "100px" },
    { key: "totalSpent", label: "Total Spent", type: "currency", width: "120px" },
    { key: "averageTransaction", label: "Average", type: "currency", width: "120px" },
    { key: "firstTransaction", label: "First Purchase", type: "date", width: "100px" },
    { key: "lastTransaction", label: "Last Purchase", type: "date", width: "100px" }
  ],
  
  summaries: [
    { key: "totalCustomers", label: "Total Customers", calculation: "count()" },
    { key: "totalRevenue", label: "Total Revenue", calculation: "sum(totalSpent)" },
    { key: "averageRevenue", label: "Average Revenue", calculation: "avg(totalSpent)" }
  ],
  
  charts: [
    {
      type: "bar",
      title: "Top Customers by Revenue",
      xAxis: "customerName",
      yAxis: "totalSpent",
      limit: 10
    }
  ]
};
```

### 4. Financial Reports

#### 4.1 Profit & Loss Summary
```javascript
const profitLossSummaryTemplate = {
  id: "profit_loss_summary",
  name: "Profit & Loss Summary",
  description: "Financial performance with revenue, costs and profitability",
  category: "financial",
  icon: "fa-money-bill",
  
  dataSource: {
    primary: "transactions",
    collections: ["transactions", "inventory"],
    joins: [
      {
        from: "transactions",
        to: "inventory",
        on: "items.productId",
        type: "inner",
        select: ["inventory.price as costPrice"]
      }
    ]
  },
  
  defaultFilters: {
    dateRange: "this-month",
    storeId: "current"
  },
  
  availableFilters: [
    {
      key: "dateRange",
      type: "date-range",
      label: "Date Range",
      required: true
    },
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false
    },
    {
      key: "groupBy",
      type: "select",
      label: "Group By",
      required: false,
      options: [
        { value: "day", label: "Daily" },
        { value: "week", label: "Weekly" },
        { value: "month", label: "Monthly" }
      ]
    }
  ],
  
  columns: [
    { key: "date", label: "Date", type: "date", width: "100px" },
    { key: "revenue", label: "Revenue", type: "currency", width: "120px" },
    { key: "cost", label: "Cost", type: "currency", width: "120px" },
    { key: "grossProfit", label: "Gross Profit", type: "currency", width: "120px" },
    { key: "tax", label: "Tax", type: "currency", width: "100px" },
    { key: "netProfit", label: "Net Profit", type: "currency", width: "120px" },
    { key: "profitMargin", label: "Margin %", type: "percentage", width: "100px" }
  ],
  
  summaries: [
    { key: "totalRevenue", label: "Total Revenue", calculation: "sum(revenue)" },
    { key: "totalCost", label: "Total Cost", calculation: "sum(cost)" },
    { key: "grossProfit", label: "Gross Profit", calculation: "sum(grossProfit)" },
    { key: "netProfit", label: "Net Profit", calculation: "sum(netProfit)" },
    { key: "averageMargin", label: "Average Margin", calculation: "avg(profitMargin)" }
  ],
  
  charts: [
    {
      type: "line",
      title: "Profit Trend",
      xAxis: "date",
      yAxis: "netProfit"
    },
    {
      type: "pie",
      title: "Revenue vs Cost",
      valueField: "amount",
      labelField: "type"
    }
  ]
};
```

#### 4.2 Tax Summary
```javascript
const taxSummaryTemplate = {
  id: "tax_summary",
  name: "Tax Summary",
  description: "Tax collected on sales with breakdown",
  category: "financial",
  icon: "fa-receipt",
  
  dataSource: {
    primary: "transactions",
    collections: ["transactions"]
  },
  
  defaultFilters: {
    dateRange: "this-month",
    storeId: "current"
  },
  
  availableFilters: [
    {
      key: "dateRange",
      type: "date-range",
      label: "Date Range",
      required: true
    },
    {
      key: "storeId",
      type: "select",
      label: "Store",
      required: false
    },
    {
      key: "taxRate",
      type: "select",
      label: "Tax Rate",
      required: false,
      options: "dynamic" // Load from store settings
    }
  ],
  
  columns: [
    { key: "date", label: "Date", type: "date", width: "100px" },
    { key: "totalSales", label: "Total Sales", type: "currency", width: "120px" },
    { key: "taxableSales", label: "Taxable Sales", type: "currency", width: "120px" },
    { key: "taxRate", label: "Tax Rate", type: "percentage", width: "100px" },
    { key: "taxAmount", label: "Tax Amount", type: "currency", width: "120px" },
    { key: "exemptSales", label: "Exempt Sales", type: "currency", width: "120px" }
  ],
  
  summaries: [
    { key: "totalSales", label: "Total Sales", calculation: "sum(totalSales)" },
    { key: "totalTax", label: "Total Tax", calculation: "sum(taxAmount)" },
    { key: "effectiveTaxRate", label: "Effective Rate", calculation: "avg(taxRate)" }
  ],
  
  charts: [
    {
      type: "line",
      title: "Tax Collection Trend",
      xAxis: "date",
      yAxis: "taxAmount"
    }
  ]
};
```

## Data Sources Configuration

### 1. Primary Data Collections

#### Transactions Collection
```javascript
const transactionsDataSource = {
  collection: "transactions",
  description: "All sales and return transactions",
  
  fields: [
    { name: "_id", type: "string", description: "Transaction ID" },
    { name: "date", type: "date", description: "Transaction date" },
    { name: "invoiceNumber", type: "string", description: "Invoice number" },
    { name: "customer", type: "string", description: "Customer ID" },
    { name: "user_id", type: "string", description: "User/Cashier ID" },
    { name: "storeId", type: "string", description: "Store ID" },
    { name: "till", type: "string", description: "Till/POS ID" },
    { name: "status", type: "number", description: "Transaction status (1=paid, 0=unpaid)" },
    { name: "subtotal", type: "number", description: "Subtotal before tax" },
    { name: "taxAmount", type: "number", description: "Tax amount" },
    { name: "discountAmount", type: "number", description: "Discount amount" },
    { name: "total", type: "number", description: "Total amount" },
    { name: "paid", type: "number", description: "Amount paid" },
    { name: "paymentMethod", type: "string", description: "Payment method" },
    { name: "items", type: "array", description: "Transaction items" }
  ],
  
  indexes: [
    { fields: ["date"], description: "For date range queries" },
    { fields: ["status"], description: "For filtering paid transactions" },
    { fields: ["storeId"], description: "For store-specific reports" },
    { fields: ["customer"], description: "For customer reports" },
    { fields: ["date", "storeId"], description: "Composite for performance" }
  ]
};
```

#### Inventory Collection
```javascript
const inventoryDataSource = {
  collection: "inventory",
  description: "Product master data",
  
  fields: [
    { name: "_id", type: "string", description: "Product ID" },
    { name: "name", type: "string", description: "Product name" },
    { name: "barcode", type: "string", description: "Product barcode" },
    { name: "category", type: "string", description: "Category ID" },
    { name: "price", type: "number", description: "Selling price" },
    { name: "quantity", type: "number", description: "Available quantity" },
    { name: "minStock", type: "number", description: "Minimum stock level" },
    { name: "expiryDate", type: "date", description: "Expiry date" },
    { name: "supplier", type: "string", description: "Primary supplier" }
  ],
  
  indexes: [
    { fields: ["category"], description: "For category filtering" },
    { fields: ["barcode"], description: "For barcode lookups" },
    { fields: ["quantity"], description: "For stock level queries" }
  ]
};
```

#### Customers Collection
```javascript
const customersDataSource = {
  collection: "customers",
  description: "Customer master data",
  
  fields: [
    { name: "_id", type: "string", description: "Customer ID" },
    { name: "name", type: "string", description: "Customer name" },
    { name: "phone", type: "string", description: "Phone number" },
    { name: "email", type: "string", description: "Email address" },
    { name: "address", type: "string", description: "Address" },
    { name: "totalPurchases", type: "number", description: "Total purchase amount" },
    { name: "customerType", type: "string", description: "Customer type" },
    { name: "createdAt", type: "date", description: "Customer since date" }
  ],
  
  indexes: [
    { fields: ["name"], description: "For name searches" },
    { fields: ["phone"], description: "For phone lookups" },
    { fields: ["customerType"], description: "For customer segmentation" }
  ]
};
```

### 2. Supporting Data Collections

#### Categories Collection
```javascript
const categoriesDataSource = {
  collection: "categories",
  description: "Product categories",
  
  fields: [
    { name: "_id", type: "string", description: "Category ID" },
    { name: "name", type: "string", description: "Category name" },
    { name: "description", type: "string", description: "Category description" },
    { name: "parentCategory", type: "string", description: "Parent category ID" }
  ],
  
  indexes: [
    { fields: ["name"], description: "For category lookups" },
    { fields: ["parentCategory"], description: "For hierarchical queries" }
  ]
};
```

#### Stores Collection
```javascript
const storesDataSource = {
  collection: "stores",
  description: "Store information",
  
  fields: [
    { name: "_id", type: "string", description: "Store ID" },
    { name: "name", type: "string", description: "Store name" },
    { name: "address", type: "string", description: "Store address" },
    { name: "phone", type: "string", description: "Store phone" },
    { name: "isActive", type: "boolean", description: "Store status" }
  ],
  
  indexes: [
    { fields: ["name"], description: "For store lookups" },
    { fields: ["isActive"], description: "For active store filtering" }
  ]
};
```

#### Users Collection
```javascript
const usersDataSource = {
  collection: "users",
  description: "System users",
  
  fields: [
    { name: "_id", type: "string", description: "User ID" },
    { name: "username", type: "string", description: "Username" },
    { name: "fullname", type: "string", description: "Full name" },
    { name: "role", type: "string", description: "User role" },
    { name: "permissions", type: "array", description: "User permissions" },
    { name: "storeId", type: "string", description: "Assigned store" }
  ],
  
  indexes: [
    { fields: ["username"], description: "For authentication" },
    { fields: ["role"], description: "For role-based filtering" }
  ]
};
```

## Data Processing Rules

### 1. Join Processing
```javascript
class JoinProcessor {
  static processJoins(data, joins) {
    let result = data.primary;
    
    joins.forEach(join => {
      const joinData = data[join.to] || [];
      const joinKey = join.on;
      
      if (join.type === 'inner') {
        result = result.map(item => {
          const matchingItem = joinData.find(j => 
            this.getNestedValue(j, joinKey) === this.getNestedValue(item, joinKey)
          );
          
          if (matchingItem) {
            return {
              ...item,
              ...(join.select || {}).reduce((acc, field) => {
                const [alias, fieldName] = field.split(' as ');
                acc[alias || fieldName] = matchingItem[fieldName];
                return acc;
              }, {})
            };
          }
          
          return null; // Inner join - exclude non-matching
        }).filter(item => item !== null);
      } else {
        // Left join - keep all primary items
        result = result.map(item => {
          const matchingItem = joinData.find(j => 
            this.getNestedValue(j, joinKey) === this.getNestedValue(item, joinKey)
          );
          
          return {
            ...item,
            ...(matchingItem ? (join.select || {}).reduce((acc, field) => {
              const [alias, fieldName] = field.split(' as ');
              acc[alias || fieldName] = matchingItem[fieldName];
              return acc;
            }, {}) : {})
          };
        });
      }
    });
    
    return result;
  }
  
  static getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current && current[key], obj);
  }
}
```

### 2. Calculation Engine
```javascript
class CalculationEngine {
  static executeCalculation(data, calculation) {
    const match = calculation.match(/^(\w+)\(([^)]+)\)$/);
    
    if (!match) {
      return 0;
    }
    
    const [, func, param] = match;
    
    switch (func) {
      case 'sum':
        return this.sum(data, param);
      case 'avg':
        return this.average(data, param);
      case 'count':
        return this.count(data);
      case 'max_by':
        return this.maxBy(data, param);
      case 'min_by':
        return this.minBy(data, param);
      case 'count_distinct':
        return this.countDistinct(data, param);
      case 'count_if':
        return this.countIf(data, param);
      default:
        return 0;
    }
  }
  
  static sum(data, field) {
    return data.reduce((sum, item) => sum + (this.getValue(item, field) || 0), 0);
  }
  
  static average(data, field) {
    const sum = this.sum(data, field);
    return data.length > 0 ? sum / data.length : 0;
  }
  
  static count(data) {
    return data.length;
  }
  
  static maxBy(data, field) {
    if (data.length === 0) return null;
    
    return data.reduce((max, item) => {
      const value = this.getValue(item, field);
      return value > (this.getValue(max, field) || 0) ? item : max;
    });
  }
  
  static countIf(data, condition) {
    const [, field, operator, value] = condition.match(/(\w+)\s*([<>=!]+)\s*(.+)/);
    
    return data.filter(item => {
      const itemValue = this.getValue(item, field);
      
      switch (operator) {
        case '<=':
          return itemValue <= parseFloat(value);
        case '<':
          return itemValue < parseFloat(value);
        default:
          return false;
      }
    }).length;
  }
  
  static getValue(item, field) {
    if (!field) return item;
    return field.split('.').reduce((current, key) => current && current[key], item);
  }
}
```

## Template Management

### 1. Template Registration
```javascript
class TemplateRegistry {
  constructor() {
    this.templates = new Map();
    this.initializeSystemTemplates();
  }
  
  initializeSystemTemplates() {
    // Register all system templates
    this.registerTemplate(dailySalesSummaryTemplate);
    this.registerTemplate(salesByProductTemplate);
    this.registerTemplate(salesByCategoryTemplate);
    this.registerTemplate(currentStockTemplate);
    this.registerTemplate(expiryAnalysisTemplate);
    this.registerTemplate(customerSalesHistoryTemplate);
    this.registerTemplate(topCustomersTemplate);
    this.registerTemplate(profitLossSummaryTemplate);
    this.registerTemplate(taxSummaryTemplate);
  }
  
  registerTemplate(template) {
    this.templates.set(template.id, template);
  }
  
  getTemplate(templateId) {
    return this.templates.get(templateId);
  }
  
  getTemplatesByCategory(category) {
    return Array.from(this.templates.values())
      .filter(template => template.category === category);
  }
  
  getAllTemplates() {
    return Array.from(this.templates.values());
  }
}
```

### 2. Dynamic Template Loading
```javascript
class DynamicTemplateLoader {
  constructor() {
    this.templateDB = new Datastore({ 
      filename: path.join(appData, appName, 'server', 'databases', 'report-templates.db'),
      autoload: true 
    });
  }
  
  async loadUserTemplates() {
    return new Promise((resolve, reject) => {
      this.templateDB.find({ isSystem: false }, (err, templates) => {
        if (err) reject(err);
        else resolve(templates);
      });
    });
  }
  
  async saveUserTemplate(template) {
    return new Promise((resolve, reject) => {
      const templateData = {
        ...template,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      this.templateDB.insert(templateData, (err, newTemplate) => {
        if (err) reject(err);
        else resolve(newTemplate);
      });
    });
  }
  
  async updateUserTemplate(templateId, updates) {
    return new Promise((resolve, reject) => {
      this.templateDB.update(
        { _id: templateId },
        { $set: { ...updates, updatedAt: new Date() } },
        {},
        (err, numUpdated) => {
          if (err) reject(err);
          else resolve(numUpdated);
        }
      );
    });
  }
}
```

## Conclusion

This report templates and data sources design provides a comprehensive foundation for the PharmaSoft custom report builder. The design emphasizes:

1. **Pre-defined Templates**: Essential pharmacy reports ready to use
2. **Flexible Data Sources**: Support for complex joins and calculations
3. **Simple Filtering**: Date ranges and basic selectors for ease of use
4. **Extensible Architecture**: Framework for adding new templates and data sources
5. **Performance Optimized**: Efficient data processing and caching strategies

The templates cover all major pharmacy business areas including sales, inventory, customers, and financial reporting, providing users with immediate access to critical business insights.