# Enhanced Reports and Analytics System Architecture Diagram

## System Architecture Overview

```mermaid
graph TB
    subgraph "Data Sources"
        A[Transactions DB]
        B[Inventory DB]
        C[Customers DB]
        D[Suppliers DB]
        E[Store Inventory DB]
        F[Payments DB]
        G[Purchase Orders DB]
    end

    subgraph "Analytics Processing Layer"
        H[Data Aggregation Service]
        I[Report Generation Service]
        J[Cache Manager]
        K[Scheduler Service]
    end

    subgraph "Analytics Data Stores"
        L[Sales Summaries DB]
        M[Product Performance DB]
        N[Customer Analytics DB]
        O[Financial Summaries DB]
        P[Report Templates DB]
        Q[Scheduled Reports DB]
    end

    subgraph "API Layer"
        R[Analytics API]
        S[Dashboard API]
        T[Reports API]
        U[Export API]
    end

    subgraph "Frontend Components"
        V[Executive Dashboard]
        W[Operations Dashboard]
        X[Financial Dashboard]
        Y[Report Builder]
        Z[Report Viewer]
    end

    subgraph "External Services"
        AA[Email Service]
        BB[File Storage]
    end

    %% Data Flow Connections
    A --> H
    B --> H
    C --> H
    D --> H
    E --> H
    F --> H
    G --> H

    H --> L
    H --> M
    H --> N
    H --> O

    L --> I
    M --> I
    N --> I
    O --> I

    I --> R
    R --> S
    R --> T
    R --> U

    S --> V
    S --> W
    S --> X

    T --> Y
    T --> Z

    U --> BB

    K --> Q
    Q --> I
    I --> AA

    J --> L
    J --> M
    J --> N
    J --> O
```

## Report Generation Flow

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant AnalyticsService
    participant Cache
    participant DB
    participant EmailService

    User->>Frontend: Request Report
    Frontend->>API: GET /api/reports/generate
    API->>AnalyticsService: Process Report Request
    
    alt Cache Hit
        AnalyticsService->>Cache: Check Cache
        Cache-->>AnalyticsService: Return Cached Data
        AnalyticsService-->>API: Return Report Data
    else Cache Miss
        AnalyticsService->>DB: Query Raw Data
        DB-->>AnalyticsService: Return Raw Data
        AnalyticsService->>AnalyticsService: Process & Aggregate
        AnalyticsService->>Cache: Store in Cache
        AnalyticsService-->>API: Return Report Data
    end

    API-->>Frontend: Return Report Data
    Frontend-->>User: Display Report

    alt Scheduled Report
        User->>Frontend: Schedule Report
        Frontend->>API: POST /api/reports/schedule
        API->>AnalyticsService: Schedule Report
        AnalyticsService->>EmailService: Configure Email Delivery
        
        Note over EmailService: Report delivered at scheduled time
        EmailService->>User: Email Report
    end
```

## Dashboard Data Flow

```mermaid
flowchart TD
    A[User Opens Dashboard] --> B{Dashboard Type}
    
    B -->|Executive| C[Load Executive KPIs]
    B -->|Operations| D[Load Operations Metrics]
    B -->|Financial| E[Load Financial Data]
    
    C --> F[API: /dashboard/executive]
    D --> G[API: /dashboard/operations]
    E --> H[API: /dashboard/financial]
    
    F --> I[Sales Summaries]
    F --> J[Top Products]
    F --> K[Customer Metrics]
    
    G --> L[Inventory Status]
    G --> M[Stock Alerts]
    G --> N[Transaction Analytics]
    
    H --> O[Profit & Loss]
    H --> P[Cash Flow]
    H --> Q[Tax Summaries]
    
    I --> R[Display Widgets]
    J --> R
    K --> R
    L --> R
    M --> R
    N --> R
    O --> R
    P --> R
    Q --> R
    
    R --> S[Interactive Dashboard]
    S --> T[User Interactions]
    T --> U{Action Type}
    
    U -->|Drill Down| V[Load Detailed Data]
    U -->|Change Date Range| W[Refresh with New Period]
    U -->|Export| X[Generate Export]
    
    V --> F
    W --> F
    X --> Y[Download File]
```

## Multi-Store Data Architecture

```mermaid
graph LR
    subgraph "Store 1"
        A1[Local Transactions]
        B1[Local Inventory]
        C1[Local Analytics]
    end
    
    subgraph "Store 2"
        A2[Local Transactions]
        B2[Local Inventory]
        C2[Local Analytics]
    end
    
    subgraph "Store N"
        AN[Local Transactions]
        BN[Local Inventory]
        CN[Local Analytics]
    end
    
    subgraph "Central Analytics"
        D[Aggregated Data]
        E[Cross-Store Reports]
        F[Comparative Analytics]
    end
    
    A1 --> D
    B1 --> D
    C1 --> D
    
    A2 --> D
    B2 --> D
    C2 --> D
    
    AN --> D
    BN --> D
    CN --> D
    
    D --> E
    D --> F
```

## Caching Strategy

```mermaid
graph TB
    subgraph "Cache Layers"
        A[Memory Cache<br/>NodeCache]
        B[Persistent Cache<br/>NeDB Collections]
        C[Browser Cache<br/>LocalStorage]
    end
    
    subgraph "Cache Types"
        D[KPI Data<br/>5-15 min TTL]
        E[Report Data<br/>1-24 hr TTL]
        F[Lookup Data<br/>1-7 day TTL]
    end
    
    subgraph "Invalidation Triggers"
        G[New Transaction]
        H[Inventory Update]
        I[Manual Refresh]
        J[Scheduled Updates]
    end
    
    A --> D
    B --> E
    C --> F
    
    G --> A
    G --> B
    H --> A
    H --> B
    I --> A
    I --> B
    I --> C
    J --> B
```

## Security Architecture

```mermaid
graph TB
    subgraph "Authentication Layer"
        A[User Login]
        B[JWT Token]
        C[Session Management]
    end
    
    subgraph "Authorization Layer"
        D[Role-Based Access]
        E[Permission Matrix]
        F[Resource-Level Security]
    end
    
    subgraph "Data Protection"
        G[PII Masking]
        H[Audit Logging]
        I[Data Encryption]
    end
    
    A --> B
    B --> C
    C --> D
    
    D --> E
    E --> F
    
    F --> G
    F --> H
    F --> I
```

## Performance Optimization

```mermaid
graph TD
    A[Report Request] --> B{Complexity Check}
    
    B -->|Simple| C[Direct Query]
    B -->|Complex| D[Background Processing]
    
    C --> E[Memory Cache Check]
    E -->|Hit| F[Return Cached Result]
    E -->|Miss| G[Query Database]
    
    D --> H[Worker Thread]
    H --> I[Process in Background]
    I --> J[Store Result]
    I --> K[Notify Client]
    
    G --> L[Update Cache]
    L --> M[Return Result]
    
    J --> N[Update Cache]
    K --> O[Fetch Result]
    
    F --> P[Return Result]
    M --> P
    O --> P