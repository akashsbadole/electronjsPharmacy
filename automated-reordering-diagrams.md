# Automated Reordering System - Architecture Diagrams

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph "PharmaSpot System"
        subgraph "Data Layer"
            DB[(Database Layer)]
            Cache[(Cache Layer)]
        end
        
        subgraph "Core Services"
            IS[Inventory Service]
            SS[Supplier Service]
            PO[Purchase Order Service]
            RS[Reorder Service]
            AS[Analytics Service]
        end
        
        subgraph "AI/ML Layer"
            DM[Demand Prediction Model]
            EOQ[EOQ Calculator]
            BO[Budget Optimizer]
            PA[Price Analyzer]
        end
        
        subgraph "Integration Layer"
            SI[Supplier Integrations]
            EI[External APIs]
            NS[Notification Service]
        end
        
        subgraph "Presentation Layer"
            UI[Dashboard UI]
            API[REST APIs]
            RP[Reports Portal]
        end
    end
    
    subgraph "External Systems"
        SUP[Supplier Systems]
        PAY[Payment Gateway]
        EMAIL[Email Service]
        WEATHER[Weather API]
    end
    
    %% Data Flow
    DB --> IS
    DB --> SS
    DB --> PO
    Cache --> IS
    Cache --> SS
    
    IS --> RS
    SS --> RS
    PO --> RS
    AS --> RS
    
    RS --> DM
    RS --> EOQ
    RS --> BO
    RS --> PA
    
    DM --> RS
    EOQ --> RS
    BO --> RS
    PA --> RS
    
    RS --> SI
    RS --> EI
    RS --> NS
    
    SI --> SUP
    EI --> WEATHER
    NS --> EMAIL
    PO --> PAY
    
    UI --> API
    API --> IS
    API --> SS
    API --> PO
    API --> RS
    API --> AS
    RP --> API
```

## 2. Reorder Trigger System Flow

```mermaid
flowchart TD
    Start([Start]) --> Monitor[Real-time Inventory Monitoring]
    
    Monitor --> Check{Trigger Condition?}
    
    Check -->|Stock Level| StockCheck[Check Stock Levels]
    Check -->|Expiry| ExpiryCheck[Check Batch Expiry]
    Check -->|Seasonal| SeasonalCheck[Analyze Seasonal Demand]
    Check -->|Manual| ManualCheck[Manual Reorder Request]
    Check -->|Emergency| EmergencyCheck[Emergency Reorder]
    
    StockCheck --> Evaluate{Reorder Needed?}
    ExpiryCheck --> Evaluate
    SeasonalCheck --> Evaluate
    ManualCheck --> Evaluate
    EmergencyCheck --> Evaluate
    
    Evaluate -->|Yes| CreateSuggestion[Create Reorder Suggestion]
    Evaluate -->|No| Continue[Continue Monitoring]
    
    CreateSuggestion --> Priority[Calculate Priority]
    Priority --> Optimize[Optimize Order Quantity]
    Optimize --> SelectSupplier[Select Optimal Supplier]
    SelectSupplier --> GeneratePO[Generate Purchase Order]
    
    GeneratePO --> Approve{Approval Required?}
    Approve -->|No| AutoProcess[Auto Process PO]
    Approve -->|Yes| Workflow[Approval Workflow]
    
    Workflow --> Approved{Approved?}
    Approved -->|Yes| ProcessPO[Process Purchase Order]
    Approved -->|No| Cancel[Cancel Request]
    
    AutoProcess --> ProcessPO
    ProcessPO --> UpdateInventory[Update Inventory]
    Cancel --> Continue
    
    UpdateInventory --> Continue
    Continue --> Monitor
```

## 3. AI/ML Prediction Pipeline

```mermaid
flowchart LR
    subgraph "Data Collection"
        HD[Historical Data]
        TD[Transaction Data]
        ID[Inventory Data]
        ED[External Data]
    end
    
    subgraph "Data Processing"
        Clean[Data Cleaning]
        Feature[Feature Engineering]
        Split[Train/Test Split]
    end
    
    subgraph "Model Training"
        LR[Linear Regression]
        RF[Random Forest]
        LSTM[LSTM Neural Network]
        SVR[Support Vector Regression]
    end
    
    subgraph "Ensemble & Optimization"
        Ensemble[Ensemble Model]
        Validate[Cross Validation]
        Tune[Hyperparameter Tuning]
    end
    
    subgraph "Prediction & Feedback"
        Predict[Demand Prediction]
        Monitor[Model Monitoring]
        Retrain[Periodic Retraining]
    end
    
    HD --> Clean
    TD --> Clean
    ID --> Clean
    ED --> Clean
    
    Clean --> Feature
    Feature --> Split
    
    Split --> LR
    Split --> RF
    Split --> LSTM
    Split --> SVR
    
    LR --> Ensemble
    RF --> Ensemble
    LSTM --> Ensemble
    SVR --> Ensemble
    
    Ensemble --> Validate
    Validate --> Tune
    Tune --> Predict
    
    Predict --> Monitor
    Monitor --> Retrain
    Retrain --> Feature
```

## 4. Supplier Integration Architecture

```mermaid
graph TB
    subgraph "PharmaSpot System"
        SCM[Supplier Catalog Manager]
        PCM[Price Comparison Engine]
        LTM[Lead Time Tracker]
        SPM[Supplier Performance Monitor]
        PO[Purchase Order Service]
    end
    
    subgraph "Integration Adapters"
        API[API Adapter]
        EDI[EDI Adapter]
        FTP[FTP Adapter]
        EMAIL[Email Adapter]
        MANUAL[Manual Adapter]
    end
    
    subgraph "Supplier Systems"
        S1[Supplier A - API]
        S2[Supplier B - EDI]
        S3[Supplier C - FTP]
        S4[Supplier D - Email]
        S5[Supplier E - Manual]
    end
    
    SCM --> API
    SCM --> EDI
    SCM --> FTP
    SCM --> EMAIL
    SCM --> MANUAL
    
    API --> S1
    EDI --> S2
    FTP --> S3
    EMAIL --> S4
    MANUAL --> S5
    
    S1 --> PCM
    S2 --> PCM
    S3 --> PCM
    S4 --> PCM
    S5 --> PCM
    
    PCM --> PO
    LTM --> PO
    SPM --> PO
```

## 5. Purchase Order Automation Flow

```mermaid
flowchart TD
    Start([Reorder Suggestion]) --> Validate[Validate Suggestion]
    
    Validate --> CheckBudget{Check Budget Constraints}
    CheckBudget -->|Within Budget| Optimize[Optimize Order]
    CheckBudget -->|Exceeds Budget| Split[Split Order]
    
    Optimize --> SelectSuppliers[Select Suppliers]
    Split --> SelectSuppliers
    
    SelectSuppliers --> GeneratePO[Generate PO Draft]
    
    GeneratePO --> CheckApproval{Approval Required?}
    CheckApproval -->|No| AutoApprove[Auto Approve]
    CheckApproval -->|Yes| RouteApproval[Route for Approval]
    
    AutoApprove --> SendPO[Send PO to Supplier]
    RouteApproval --> ApprovalProcess[Approval Process]
    
    ApprovalProcess --> Approved{Approved?}
    Approved -->|Yes| SendPO
    Approved -->|No| RejectPO[Reject PO]
    
    SendPO --> TrackDelivery[Track Delivery]
    RejectPO --> Notify[Notify Requester]
    
    TrackDelivery --> UpdateInventory[Update Inventory]
    UpdateInventory --> Complete[Complete Process]
    
    Notify --> Complete
    Complete --> End([End])
```

## 6. Database Schema Relationships

```mermaid
erDiagram
    PRODUCTS {
        int id PK
        string name
        string category
        decimal price
        int min_stock
        int max_stock
    }
    
    SUPPLIERS {
        int id PK
        string name
        string contact_info
        string integration_type
        json api_config
    }
    
    REORDER_SUGGESTIONS {
        int id PK
        int product_id FK
        int store_id FK
        string trigger_type
        decimal predicted_demand
        int suggested_quantity
        int suggested_supplier_id FK
        string status
        timestamp created_at
    }
    
    FORECAST_MODELS {
        int id PK
        string name
        string type
        json parameters
        decimal training_accuracy
        string status
    }
    
    FORECAST_RESULTS {
        int id PK
        int model_id FK
        int product_id FK
        date forecast_date
        decimal predicted_value
        decimal actual_value
        decimal accuracy_score
    }
    
    SUPPLIER_PERFORMANCE {
        int id PK
        int supplier_id FK
        date period_start
        decimal on_time_delivery_rate
        decimal quality_score
        decimal overall_score
    }
    
    PURCHASE_ORDERS {
        int id PK
        int supplier_id FK
        string order_number
        date order_date
        decimal total_amount
        string status
    }
    
    PRODUCTS ||--o{ REORDER_SUGGESTIONS : "generates"
    SUPPLIERS ||--o{ REORDER_SUGGESTIONS : "suggested"
    FORECAST_MODELS ||--o{ FORECAST_RESULTS : "produces"
    PRODUCTS ||--o{ FORECAST_RESULTS : "forecasts"
    SUPPLIERS ||--o{ SUPPLIER_PERFORMANCE : "evaluated"
    SUPPLIERS ||--o{ PURCHASE_ORDERS : "receives"
```

## 7. Real-Time Monitoring Architecture

```mermaid
graph TB
    subgraph "Data Sources"
        IDB[Inventory Database]
        TDB[Transaction Database]
        BDB[Batches Database]
        SDB[Suppliers Database]
    end
    
    subgraph "Event Stream"
        ES[Event Stream Processor]
        KQ[Message Queue]
    end
    
    subgraph "Processing Layer"
        RTM[Real-time Monitor]
        AD[Anomaly Detector]
        TA[Trend Analyzer]
        AA[Alert Aggregator]
    end
    
    subgraph "Action Layer"
        RE[Reorder Engine]
        NS[Notification Service]
        UI[Dashboard Updates]
    end
    
    subgraph "Storage"
        Cache[(Redis Cache)]
        TS[(Time Series DB)]
    end
    
    %% Event Flow
    IDB --> ES
    TDB --> ES
    BDB --> ES
    SDB --> ES
    
    ES --> KQ
    KQ --> RTM
    KQ --> AD
    KQ --> TA
    
    RTM --> Cache
    RTM --> TS
    AD --> AA
    TA --> AA
    
    AA --> RE
    AA --> NS
    AA --> UI
    
    RE --> Cache
    NS --> UI
    UI --> Cache
```

## 8. Multi-Store Reordering Architecture

```mermaid
graph TB
    subgraph "Central System"
        CS[Central Server]
        CDW[Central Data Warehouse]
        GML[Global ML Models]
        SPM[Supplier Pool Manager]
    end
    
    subgraph "Store A"
        SA1[Local Inventory]
        SA2[Local Reorder Engine]
        SA3[Local Analytics]
        SA4[Store Manager UI]
    end
    
    subgraph "Store B"
        SB1[Local Inventory]
        SB2[Local Reorder Engine]
        SB3[Local Analytics]
        SB4[Store Manager UI]
    end
    
    subgraph "Store C"
        SC1[Local Inventory]
        SC2[Local Reorder Engine]
        SC3[Local Analytics]
        SC4[Store Manager UI]
    end
    
    subgraph "Supplier Systems"
        SUP1[Supplier A]
        SUP2[Supplier B]
        SUP3[Supplier C]
    end
    
    %% Sync Flows
    SA1 <--> CS
    SB1 <--> CS
    SC1 <--> CS
    
    SA2 <--> CDW
    SB2 <--> CDW
    SC2 <--> CDW
    
    GML <--> SA2
    GML <--> SB2
    GML <--> SC2
    
    SPM --> SUP1
    SPM --> SUP2
    SPM --> SUP3
    
    SA2 --> SUP1
    SB2 --> SUP2
    SC2 --> SUP3
```

## 9. Microservices Architecture

```mermaid
graph TB
    subgraph "API Gateway"
        GW[API Gateway]
        LB[Load Balancer]
        AUTH[Authentication Service]
    end
    
    subgraph "Core Services"
        IS[Inventory Service]
        RS[Reorder Service]
        SS[Supplier Service]
        PO[Purchase Order Service]
        AS[Analytics Service]
        NS[Notification Service]
    end
    
    subgraph "AI/ML Services"
        DM[Demand Prediction Service]
        EOQ[EOQ Calculation Service]
        PA[Price Analysis Service]
        BO[Budget Optimization Service]
    end
    
    subgraph "Data Services"
        UD[User Database]
        ID[Inventory Database]
        SD[Supplier Database]
        FD[Financial Database]
        AD[Analytics Database]
    end
    
    subgraph "External Integrations"
        EXT1[Supplier APIs]
        EXT2[Payment Gateway]
        EXT3[Email Service]
        EXT4[Weather API]
    end
    
    %% Service Communication
    GW --> IS
    GW --> RS
    GW --> SS
    GW --> PO
    GW --> AS
    GW --> NS
    
    RS --> DM
    RS --> EOQ
    RS --> PA
    RS --> BO
    
    IS --> ID
    SS --> SD
    PO --> FD
    AS --> AD
    
    DM --> AD
    EOQ --> AD
    PA --> AD
    BO --> AD
    
    SS --> EXT1
    PO --> EXT2
    NS --> EXT3
    AS --> EXT4
```

## 10. Deployment Architecture

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Web Tier"
            ALB[Application Load Balancer]
            WEB1[Web Server 1]
            WEB2[Web Server 2]
        end
        
        subgraph "Application Tier"
            APP1[App Server 1]
            APP2[App Server 2]
            APP3[App Server 3]
        end
        
        subgraph "AI/ML Tier"
            ML1[ML Processing Server 1]
            ML2[ML Processing Server 2]
        end
        
        subgraph "Data Tier"
            DB1[(Primary Database)]
            DB2[(Replica Database)]
            CACHE[(Redis Cache)]
        end
    end
    
    subgraph "Development Environment"
        DEV_APP[Dev App Server]
        DEV_DB[(Dev Database)]
        DEV_CACHE[(Dev Cache)]
    end
    
    subgraph "Testing Environment"
        TEST_APP[Test App Server]
        TEST_DB[(Test Database)]
        TEST_CACHE[(Test Cache)]
    end
    
    subgraph "External Services"
        MONITORING[Monitoring Service]
        LOGGING[Logging Service]
        BACKUP[Backup Service]
    end
    
    %% Connections
    ALB --> WEB1
    ALB --> WEB2
    
    WEB1 --> APP1
    WEB1 --> APP2
    WEB2 --> APP2
    WEB2 --> APP3
    
    APP1 --> DB1
    APP2 --> DB1
    APP3 --> DB1
    
    APP1 --> CACHE
    APP2 --> CACHE
    APP3 --> CACHE
    
    DB1 --> DB2
    
    APP1 --> ML1
    APP2 --> ML1
    APP3 --> ML2
    
    MONITORING --> ALB
    MONITORING --> APP1
    MONITORING --> APP2
    MONITORING --> APP3
    
    LOGGING --> APP1
    LOGGING --> APP2
    LOGGING --> APP3
    
    BACKUP --> DB1
```

These diagrams provide a comprehensive visual representation of the automated reordering system architecture, covering all major components and their interactions. The system is designed to be scalable, maintainable, and capable of handling complex reordering scenarios with AI/ML-driven decision making.