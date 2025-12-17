# Multi-Store Inventory Management Architecture Diagrams

## 1. System Architecture Overview

```mermaid
graph TB
    subgraph "Central Server"
        CS[Central Database]
        CS_API[Central API Server]
        CS_SYNC[Sync Service]
    end
    
    subgraph "Store 1"
        S1_DB[Store 1 Database]
        S1_API[Store 1 API]
        S1_UI[Store 1 UI]
        S1_SYNC[Local Sync Service]
    end
    
    subgraph "Store 2"
        S2_DB[Store 2 Database]
        S2_API[Store 2 API]
        S2_UI[Store 2 UI]
        S2_SYNC[Local Sync Service]
    end
    
    subgraph "Store N"
        SN_DB[Store N Database]
        SN_API[Store N API]
        SN_UI[Store N UI]
        SN_SYNC[Local Sync Service]
    end
    
    CS_API --> CS
    CS_SYNC --> CS
    
    S1_API --> S1_DB
    S1_UI --> S1_API
    S1_SYNC <--> CS_SYNC
    S1_SYNC --> S1_DB
    
    S2_API --> S2_DB
    S2_UI --> S2_API
    S2_SYNC <--> CS_SYNC
    S2_SYNC --> S2_DB
    
    SN_API --> SN_DB
    SN_UI --> SN_API
    SN_SYNC <--> CS_SYNC
    SN_SYNC --> SN_DB
    
    S1_SYNC -.-> S2_SYNC
    S2_SYNC -.-> S1_SYNC
```

## 2. Database Schema Relationship

```mermaid
erDiagram
    stores ||--o{ store_inventory : has
    stores ||--o{ store_product_pricing : has
    stores ||--o{ product_batches : has
    stores ||--o{ transactions : has
    stores ||--o{ users : has
    stores ||--o{ inter_store_transfers_from : transfers_from
    stores ||--o{ inter_store_transfers_to : transfers_to
    stores ||--o{ sync_logs : generates
    stores ||--o{ sync_queue : queues
    
    products ||--o{ store_inventory : tracked_in
    products ||--o{ store_product_pricing : priced_in
    products ||--o{ product_batches : batched_in
    products ||--o{ inter_store_transfer_items : transferred
    
    users ||--o{ user_store_permissions : granted
    users ||--o{ transactions : creates
    users ||--o{ inter_store_transfers : manages
    
    inter_store_transfers ||--o{ inter_store_transfer_items : contains
    inter_store_transfers }o--|| stores : from_store
    inter_store_transfers }o--|| stores : to_store
```

## 3. API Layer Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Interface]
        MOBILE[Mobile App]
    end
    
    subgraph "API Gateway"
        GATEWAY[API Gateway]
        AUTH[Authentication Service]
        RATE[Rate Limiting]
    end
    
    subgraph "Service Layer"
        STORE_SVC[Store Service]
        INV_SVC[Inventory Service]
        TRANSFER_SVC[Transfer Service]
        SYNC_SVC[Sync Service]
        USER_SVC[User Service]
        REPORT_SVC[Report Service]
    end
    
    subgraph "Data Layer"
        STORE_DB[(Store Database)]
        CACHE[(Redis Cache)]
        QUEUE[(Message Queue)]
    end
    
    WEB --> GATEWAY
    MOBILE --> GATEWAY
    
    GATEWAY --> AUTH
    GATEWAY --> RATE
    
    AUTH --> STORE_SVC
    AUTH --> INV_SVC
    AUTH --> TRANSFER_SVC
    AUTH --> SYNC_SVC
    AUTH --> USER_SVC
    AUTH --> REPORT_SVC
    
    STORE_SVC --> STORE_DB
    INV_SVC --> STORE_DB
    TRANSFER_SVC --> STORE_DB
    SYNC_SVC --> STORE_DB
    USER_SVC --> STORE_DB
    REPORT_SVC --> STORE_DB
    
    STORE_SVC --> CACHE
    INV_SVC --> CACHE
    TRANSFER_SVC --> CACHE
    SYNC_SVC --> QUEUE
```

## 4. Data Synchronization Flow

```mermaid
sequenceDiagram
    participant S1 as Store 1
    participant S1_SYNC as Store 1 Sync
    participant CS as Central Server
    participant S2 as Store 2
    participant S2_SYNC as Store 2 Sync
    
    Note over S1,S2: Offline Operation
    S1->>S1: Create Transaction
    S1->>S1: Update Inventory
    
    Note over S1,S2: Sync Initiation
    S1->>S1_SYNC: Queue Changes
    S1_SYNC->>CS: Push Changes
    
    CS->>CS: Process Changes
    CS->>CS: Update Central DB
    
    CS->>S2_SYNC: Pull Changes
    S2_SYNC->>S2: Update Local DB
    
    Note over S1,S2: Conflict Resolution
    CS->>S1_SYNC: Conflict Detected
    S1_SYNC->>S1: Manual Resolution Required
    
    Note over S1,S2: Sync Complete
    CS->>S1_SYNC: Sync Confirmation
    CS->>S2_SYNC: Sync Confirmation
```

## 5. Inter-Store Transfer Flow

```mermaid
flowchart TD
    START[Start Transfer Request]
    SELECT_STORES[Select Source & Destination Stores]
    SELECT_PRODUCTS[Select Products & Batches]
    VALIDATE[Validate Availability]
    
    VALIDATE -->|Available| CREATE_REQUEST[Create Transfer Request]
    VALIDATE -->|Insufficient| ERROR[Error: Insufficient Stock]
    
    CREATE_REQUEST --> APPROVAL[Manager Approval Required?]
    APPROVAL -->|Yes| WAIT_APPROVAL[Wait for Approval]
    APPROVAL -->|No| PREPARE[Prepare Shipment]
    
    WAIT_APPROVAL -->|Approved| PREPARE
    WAIT_APPROVAL -->|Rejected| CANCEL[Cancel Transfer]
    
    PREPARE --> UPDATE_SOURCE[Update Source Inventory]
    UPDATE_SOURCE --> SHIP[Mark as Shipped]
    SHIP --> TRANSIT[In Transit]
    
    TRANSIT --> RECEIVE[Receive at Destination]
    RECEIVE --> VERIFY[Verify Received Items]
    
    VERIFY -->|Match| UPDATE_DEST[Update Destination Inventory]
    VERIFY -->|Mismatch| RESOLVE[Resolve Discrepancies]
    
    RESOLVE --> UPDATE_DEST
    UPDATE_DEST --> COMPLETE[Mark Transfer Complete]
    COMPLETE --> END[End]
    
    CANCEL --> END
    ERROR --> END
```

## 6. User Permission Flow

```mermaid
flowchart TD
    LOGIN[User Login]
    AUTHENTICATE[Authenticate Credentials]
    GET_STORES[Get User's Store Access]
    SELECT_STORE[Select Store to Work With]
    CHECK_PERMISSIONS[Check Store-Specific Permissions]
    
    AUTHENTICATE -->|Success| GET_STORES
    AUTHENTICATE -->|Failure| LOGIN_ERROR[Login Failed]
    
    GET_STORES -->|Multiple Stores| SELECT_STORE
    GET_STORES -->|Single Store| CHECK_PERMISSIONS
    
    SELECT_STORE --> CHECK_PERMISSIONS
    CHECK_PERMISSIONS -->|Has Access| LOAD_UI[Load Store-Specific UI]
    CHECK_PERMISSIONS -->|No Access| PERMISSION_ERROR[Permission Denied]
    
    LOAD_UI --> DASHBOARD[Store Dashboard]
    DASHBOARD --> PERFORM_ACTIONS[Perform Store Actions]
    
    LOGIN_ERROR --> END[End]
    PERMISSION_ERROR --> END
    PERFORM_ACTIONS --> END
```

## 7. Offline Operation Flow

```mermaid
stateDiagram-v2
    [*] --> Online: System Online
    Online --> Offline: Connection Lost
    Offline --> Queueing: Queue Changes
    Queueing --> Queueing: Continue Operations
    Queueing --> Syncing: Connection Restored
    Syncing --> Resolving: Conflicts Detected?
    Resolving --> Online: No Conflicts
    Resolving --> ManualResolution: Manual Resolution Required
    ManualResolution --> Syncing: Conflicts Resolved
    Syncing --> Online: Sync Complete
```

## 8. Component Interaction Diagram

```mermaid
graph TB
    subgraph "Frontend Components"
        STORE_SELECTOR[Store Selector]
        INVENTORY_DASHBOARD[Inventory Dashboard]
        TRANSFER_UI[Transfer Interface]
        REPORTS_UI[Reports Dashboard]
    end
    
    subgraph "Backend Services"
        STORE_SERVICE[Store Service]
        INVENTORY_SERVICE[Inventory Service]
        TRANSFER_SERVICE[Transfer Service]
        SYNC_SERVICE[Sync Service]
        REPORT_SERVICE[Report Service]
    end
    
    subgraph "Data Components"
        STORE_DB[(Store Database)]
        CENTRAL_DB[(Central Database)]
        CACHE[(Cache Layer)]
        QUEUE[(Sync Queue)]
    end
    
    STORE_SELECTOR --> STORE_SERVICE
    INVENTORY_DASHBOARD --> INVENTORY_SERVICE
    TRANSFER_UI --> TRANSFER_SERVICE
    REPORTS_UI --> REPORT_SERVICE
    
    STORE_SERVICE --> STORE_DB
    INVENTORY_SERVICE --> STORE_DB
    TRANSFER_SERVICE --> STORE_DB
    REPORT_SERVICE --> STORE_DB
    
    SYNC_SERVICE --> CENTRAL_DB
    SYNC_SERVICE --> QUEUE
    
    INVENTORY_SERVICE --> CACHE
    TRANSFER_SERVICE --> CACHE
    
    SYNC_SERVICE <--> INVENTORY_SERVICE
    SYNC_SERVICE <--> TRANSFER_SERVICE
```

## 9. Deployment Architecture

```mermaid
graph TB
    subgraph "Production Environment"
        subgraph "Load Balancer"
            LB[Load Balancer]
        end
        
        subgraph "Application Servers"
            APP1[App Server 1]
            APP2[App Server 2]
            APP3[App Server N]
        end
        
        subgraph "Database Cluster"
            DB_MASTER[(Master Database)]
            DB_SLAVE1[(Slave Database 1)]
            DB_SLAVE2[(Slave Database 2)]
        end
        
        subgraph "Cache Cluster"
            REDIS1[(Redis Master)]
            REDIS2[(Redis Slave)]
        end
    end
    
    subgraph "Store Locations"
        STORE1[Store 1]
        STORE2[Store 2]
        STOREN[Store N]
    end
    
    LB --> APP1
    LB --> APP2
    LB --> APP3
    
    APP1 --> DB_MASTER
    APP2 --> DB_MASTER
    APP3 --> DB_MASTER
    
    DB_MASTER --> DB_SLAVE1
    DB_MASTER --> DB_SLAVE2
    
    APP1 --> REDIS1
    APP2 --> REDIS1
    APP3 --> REDIS1
    
    REDIS1 --> REDIS2
    
    STORE1 --> LB
    STORE2 --> LB
    STOREN --> LB
```

## 10. Data Flow Architecture

```mermaid
flowchart LR
    subgraph "Data Sources"
        USER_INPUT[User Input]
        API_CALLS[API Calls]
        SYNC_DATA[Sync Data]
    end
    
    subgraph "Processing Layer"
        VALIDATION[Data Validation]
        BUSINESS_LOGIC[Business Logic]
        PERMISSION_CHECK[Permission Check]
    end
    
    subgraph "Data Storage"
        TRANSACTION_DB[(Transaction DB)]
        INVENTORY_DB[(Inventory DB)]
        SYNC_QUEUE[(Sync Queue)]
    end
    
    subgraph "Data Output"
        RESPONSES[API Responses]
        UI_UPDATES[UI Updates]
        REPORTS[Reports]
    end
    
    USER_INPUT --> VALIDATION
    API_CALLS --> VALIDATION
    SYNC_DATA --> VALIDATION
    
    VALIDATION --> PERMISSION_CHECK
    PERMISSION_CHECK --> BUSINESS_LOGIC
    
    BUSINESS_LOGIC --> TRANSACTION_DB
    BUSINESS_LOGIC --> INVENTORY_DB
    BUSINESS_LOGIC --> SYNC_QUEUE
    
    TRANSACTION_DB --> RESPONSES
    INVENTORY_DB --> UI_UPDATES
    SYNC_QUEUE --> REPORTS
```

These diagrams provide a visual representation of the multi-store inventory management architecture, complementing the detailed technical documentation. They illustrate the relationships between components, data flows, and operational processes that will be implemented as part of the multi-store enhancement to PharmaSpot.