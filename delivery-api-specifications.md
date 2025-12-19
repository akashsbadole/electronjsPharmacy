# PharmaSoft Delivery Management API Specifications

## Overview

This document provides detailed API specifications for the home delivery management system in PharmaSoft. The APIs follow RESTful principles and integrate seamlessly with the existing Express.js backend architecture.

## Base Configuration

- **Base URL**: `/api/delivery`
- **Authentication**: JWT tokens (same as existing system)
- **Content-Type**: `application/json`
- **Rate Limiting**: 100 requests per 15 minutes per user
- **Error Response Format**:
```json
{
  "error": "Error Type",
  "message": "Detailed error message",
  "timestamp": "2023-12-17T10:30:00Z"
}
```

## 1. Delivery Orders API

### 1.1 Create Delivery Order

**Endpoint**: `POST /api/delivery/orders`

**Description**: Creates a new delivery order from an existing transaction

**Request Body**:
```json
{
  "transaction_id": 12345,
  "customer_id": 678,
  "store_id": 1,
  "delivery_address": {
    "address_line1": "123 Main Street",
    "address_line2": "Apt 4B",
    "city": "Mumbai",
    "state": "Maharashtra",
    "pincode": "400001",
    "landmark": "Near City Hospital"
  },
  "delivery_phone": "+919876543210",
  "delivery_instructions": "Call before arrival",
  "priority_level": 1,
  "scheduled_delivery_time": "2023-12-17T14:30:00Z",
  "delivery_fee": 50.00,
  "estimated_distance": 5.2
}
```

**Response**:
```json
{
  "id": 1001,
  "transaction_id": 12345,
  "customer_id": 678,
  "store_id": 1,
  "delivery_address": "123 Main Street, Apt 4B, Mumbai, Maharashtra 400001",
  "delivery_lat": 19.0760,
  "delivery_lng": 72.8777,
  "delivery_phone": "+919876543210",
  "delivery_instructions": "Call before arrival",
  "delivery_status": "PENDING",
  "priority_level": 1,
  "scheduled_delivery_time": "2023-12-17T14:30:00Z",
  "estimated_delivery_time": "2023-12-17T15:00:00Z",
  "delivery_charge": 50.00,
  "distance_km": 5.2,
  "driver_id": null,
  "route_id": null,
  "created_at": "2023-12-17T10:30:00Z",
  "updated_at": "2023-12-17T10:30:00Z"
}
```

### 1.2 Get Delivery Orders List

**Endpoint**: `GET /api/delivery/orders`

**Query Parameters**:
- `store_id` (optional): Filter by store
- `status` (optional): Filter by delivery status
- `driver_id` (optional): Filter by assigned driver
- `customer_id` (optional): Filter by customer
- `date_from` (optional): Filter orders from date
- `date_to` (optional): Filter orders to date
- `page` (optional): Pagination page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response**:
```json
{
  "orders": [
    {
      "id": 1001,
      "transaction_id": 12345,
      "customer": {
        "id": 678,
        "name": "John Doe",
        "phone": "+919876543210"
      },
      "delivery_address": "123 Main Street, Mumbai",
      "delivery_status": "ASSIGNED",
      "scheduled_delivery_time": "2023-12-17T14:30:00Z",
      "estimated_delivery_time": "2023-12-17T15:00:00Z",
      "delivery_charge": 50.00,
      "driver": {
        "id": 15,
        "name": "Raj Kumar",
        "phone": "+919812345678"
      },
      "created_at": "2023-12-17T10:30:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "pages": 8
  }
}
```

### 1.3 Get Delivery Order Details

**Endpoint**: `GET /api/delivery/orders/:id`

**Response**: Single delivery order object with full details including status history

### 1.4 Update Delivery Order

**Endpoint**: `PUT /api/delivery/orders/:id`

**Request Body** (partial update allowed):
```json
{
  "delivery_status": "IN_TRANSIT",
  "driver_id": 15,
  "estimated_delivery_time": "2023-12-17T15:30:00Z",
  "delivery_instructions": "Updated instructions"
}
```

### 1.5 Cancel Delivery Order

**Endpoint**: `DELETE /api/delivery/orders/:id`

**Request Body**:
```json
{
  "cancellation_reason": "Customer requested cancellation",
  "restock_inventory": true
}
```

## 2. Driver Management API

### 2.1 Register New Driver

**Endpoint**: `POST /api/delivery/drivers`

**Request Body**:
```json
{
  "store_id": 1,
  "employee_id": 25,
  "name": "Raj Kumar",
  "phone": "+919812345678",
  "email": "raj.kumar@example.com",
  "license_number": "DL-12345678",
  "license_expiry": "2024-12-31",
  "vehicle_number": "MH-12-AB-1234",
  "vehicle_type": "BIKE",
  "vehicle_capacity": 15,
  "work_schedule": {
    "monday": { "start": "09:00", "end": "18:00" },
    "tuesday": { "start": "09:00", "end": "18:00" },
    "wednesday": { "start": "09:00", "end": "18:00" },
    "thursday": { "start": "09:00", "end": "18:00" },
    "friday": { "start": "09:00", "end": "18:00" },
    "saturday": { "start": "10:00", "end": "16:00" },
    "sunday": null
  }
}
```

**Response**:
```json
{
  "id": 15,
  "store_id": 1,
  "employee_id": 25,
  "name": "Raj Kumar",
  "phone": "+919812345678",
  "email": "raj.kumar@example.com",
  "license_number": "DL-12345678",
  "license_expiry": "2024-12-31",
  "vehicle_number": "MH-12-AB-1234",
  "vehicle_type": "BIKE",
  "vehicle_capacity": 15,
  "is_available": true,
  "performance_rating": 5.0,
  "total_deliveries": 0,
  "successful_deliveries": 0,
  "created_at": "2023-12-17T10:30:00Z"
}
```

### 2.2 Get Available Drivers

**Endpoint**: `GET /api/delivery/drivers/available`

**Query Parameters**:
- `store_id` (required): Store location
- `datetime` (required): Check availability for specific time
- `vehicle_type` (optional): Filter by vehicle type

**Response**:
```json
{
  "available_drivers": [
    {
      "id": 15,
      "name": "Raj Kumar",
      "phone": "+919812345678",
      "vehicle_type": "BIKE",
      "vehicle_capacity": 15,
      "current_location": {
        "lat": 19.0760,
        "lng": 72.8777
      },
      "performance_rating": 4.8,
      "current_orders": 2,
      "distance_from_store": 2.5
    }
  ]
}
```

### 2.3 Update Driver Location

**Endpoint**: `POST /api/delivery/drivers/:id/location`

**Request Body**:
```json
{
  "latitude": 19.0760,
  "longitude": 72.8777,
  "timestamp": "2023-12-17T14:30:00Z",
  "accuracy": 10.0
}
```

### 2.4 Get Driver Performance

**Endpoint**: `GET /api/delivery/drivers/:id/performance`

**Query Parameters**:
- `date_from` (optional): Start date for performance data
- `date_to` (optional): End date for performance data

**Response**:
```json
{
  "driver_id": 15,
  "period": {
    "start": "2023-12-01",
    "end": "2023-12-17"
  },
  "performance": {
    "total_deliveries": 145,
    "successful_deliveries": 142,
    "success_rate": 97.9,
    "average_delivery_time": 28.5,
    "on_time_delivery_rate": 94.5,
    "customer_rating": 4.7,
    "total_distance": 1250.5,
    "fuel_efficiency": 45.2
  },
  "daily_breakdown": [
    {
      "date": "2023-12-17",
      "deliveries": 12,
      "success_rate": 100,
      "average_time": 25.3
    }
  ]
}
```

## 3. Route Management API

### 3.1 Create Delivery Route

**Endpoint**: `POST /api/delivery/routes`

**Request Body**:
```json
{
  "store_id": 1,
  "route_name": "Morning Central Mumbai",
  "driver_id": 15,
  "route_date": "2023-12-17",
  "delivery_orders": [1001, 1002, 1003],
  "estimated_duration_minutes": 180
}
```

**Response**:
```json
{
  "id": 50,
  "store_id": 1,
  "route_name": "Morning Central Mumbai",
  "driver_id": 15,
  "route_date": "2023-12-17",
  "route_status": "PLANNED",
  "estimated_duration_minutes": 180,
  "total_distance_km": 25.5,
  "total_orders": 3,
  "waypoints": [
    {
      "id": 1,
      "waypoint_order": 1,
      "delivery_order_id": 1001,
      "location_name": "123 Main Street",
      "location_lat": 19.0760,
      "location_lng": 72.8777,
      "estimated_arrival_time": "2023-12-17T10:30:00Z",
      "status": "PENDING"
    }
  ],
  "created_at": "2023-12-17T08:00:00Z"
}
```

### 3.2 Optimize Route

**Endpoint**: `POST /api/delivery/routes/:id/optimize`

**Request Body**:
```json
{
  "optimization_preferences": {
    "priority": "TIME", // TIME, DISTANCE, COST
    "consider_traffic": true,
    "avoid_tolls": false,
    "max_waypoints": 20
  }
}
```

**Response**:
```json
{
  "route_id": 50,
  "optimization_results": {
    "original_distance": 25.5,
    "optimized_distance": 22.3,
    "distance_saved": 3.2,
    "original_duration": 180,
    "optimized_duration": 165,
    "time_saved": 15,
    "optimization_score": 0.87
  },
  "optimized_waypoints": [
    {
      "waypoint_order": 1,
      "delivery_order_id": 1002,
      "estimated_arrival_time": "2023-12-17T10:15:00Z"
    },
    {
      "waypoint_order": 2,
      "delivery_order_id": 1001,
      "estimated_arrival_time": "2023-12-17T10:45:00Z"
    },
    {
      "waypoint_order": 3,
      "delivery_order_id": 1003,
      "estimated_arrival_time": "2023-12-17T11:15:00Z"
    }
  ]
}
```

### 3.3 Update Route Status

**Endpoint**: `PUT /api/delivery/routes/:id/status`

**Request Body**:
```json
{
  "route_status": "ACTIVE",
  "actual_start_time": "2023-12-17T09:00:00Z",
  "notes": "Route started on time"
}
```

## 4. Tracking and Status Updates API

### 4.1 Get Tracking Information

**Endpoint**: `GET /api/delivery/tracking/:orderId`

**Response**:
```json
{
  "order_id": 1001,
  "customer_info": {
    "name": "John Doe",
    "phone": "+919876543210"
  },
  "delivery_status": "IN_TRANSIT",
  "current_status": {
    "status": "IN_TRANSIT",
    "timestamp": "2023-12-17T11:30:00Z",
    "location": {
      "lat": 19.0850,
      "lng": 72.8750
    },
    "notes": "Driver is 5 minutes away"
  },
  "driver_info": {
    "name": "Raj Kumar",
    "phone": "+919812345678",
    "vehicle_number": "MH-12-AB-1234"
  },
  "timeline": [
    {
      "status": "PENDING",
      "timestamp": "2023-12-17T09:00:00Z",
      "description": "Order received and processing"
    },
    {
      "status": "ASSIGNED",
      "timestamp": "2023-12-17T09:15:00Z",
      "description": "Driver assigned to your order"
    },
    {
      "status": "PICKED",
      "timestamp": "2023-12-17T10:00:00Z",
      "description": "Order picked up from store"
    },
    {
      "status": "IN_TRANSIT",
      "timestamp": "2023-12-17T10:30:00Z",
      "description": "Order is out for delivery"
    }
  ],
  "estimated_delivery_time": "2023-12-17T12:00:00Z",
  "tracking_url": "https://pharmasoft.example.com/track/1001"
}
```

### 4.2 Update Delivery Status

**Endpoint**: `POST /api/delivery/status-updates`

**Request Body**:
```json
{
  "delivery_order_id": 1001,
  "status": "DELIVERED",
  "location_lat": 19.0760,
  "location_lng": 72.8777,
  "notes": "Delivered successfully",
  "photo_url": "https://example.com/photos/delivery_1001.jpg",
  "signature_url": "https://example.com/signatures/delivery_1001.png",
  "recipient_name": "John Doe",
  "timestamp": "2023-12-17T12:00:00Z"
}
```

### 4.3 Get Estimated Arrival Time

**Endpoint**: `GET /api/delivery/eta/:orderId`

**Response**:
```json
{
  "order_id": 1001,
  "estimated_arrival_time": "2023-12-17T12:00:00Z",
  "time_window": {
    "start": "2023-12-17T11:45:00Z",
    "end": "2023-12-17T12:15:00Z"
  },
  "driver_location": {
    "lat": 19.0800,
    "lng": 72.8780,
    "last_updated": "2023-12-17T11:30:00Z"
  },
  "distance_remaining": 2.5,
  "estimated_duration_minutes": 25,
  "traffic_conditions": "MODERATE"
}
```

## 5. Customer Experience API

### 5.1 Get Customer Delivery Preferences

**Endpoint**: `GET /api/delivery/customers/:id/preferences`

**Response**:
```json
{
  "customer_id": 678,
  "delivery_preferences": {
    "preferred_time_slots": ["10:00-12:00", "14:00-16:00"],
    "preferred_instructions": "Please call before arrival",
    "emergency_contact": "+919876543211",
    "access_instructions": "Use intercom #123",
    "special_requirements": "Wheelchair access needed"
  },
  "notification_preferences": {
    "sms": true,
    "email": true,
    "whatsapp": true,
    "push_notifications": false
  },
  "delivery_addresses": [
    {
      "id": 1,
      "type": "HOME",
      "address": "123 Main Street, Apt 4B, Mumbai, Maharashtra 400001",
      "is_default": true
    }
  ]
}
```

### 5.2 Submit Delivery Feedback

**Endpoint**: `POST /api/delivery/feedback`

**Request Body**:
```json
{
  "delivery_order_id": 1001,
  "customer_id": 678,
  "ratings": {
    "overall_experience": 5,
    "driver_professionalism": 5,
    "delivery_speed": 4,
    "packaging_quality": 5
  },
  "comments": "Excellent service, delivered on time",
  "issues_reported": [],
  "would_recommend": true,
  "timestamp": "2023-12-17T13:00:00Z"
}
```

### 5.3 Get Delivery History

**Endpoint**: `GET /api/delivery/customers/:id/history`

**Query Parameters**:
- `date_from` (optional): Start date for history
- `date_to` (optional): End date for history
- `page` (optional): Pagination page number
- `limit` (optional): Items per page

**Response**:
```json
{
  "customer_id": 678,
  "delivery_history": [
    {
      "order_id": 1001,
      "order_date": "2023-12-17T09:00:00Z",
      "delivery_address": "123 Main Street, Mumbai",
      "items_count": 3,
      "total_amount": 1250.50,
      "delivery_charge": 50.00,
      "delivery_status": "DELIVERED",
      "delivery_time": "2023-12-17T12:00:00Z",
      "driver_name": "Raj Kumar",
      "rating": 5
    }
  ],
  "summary": {
    "total_deliveries": 45,
    "total_spent": 15420.75,
    "average_rating": 4.7
  },
  "pagination": {
    "total": 45,
    "page": 1,
    "limit": 10,
    "pages": 5
  }
}
```

## 6. Analytics and Reporting API

### 6.1 Get Delivery Analytics

**Endpoint**: `GET /api/delivery/analytics`

**Query Parameters**:
- `store_id` (optional): Filter by store
- `date_from` (optional): Start date for analytics
- `date_to` (optional): End date for analytics
- `group_by` (optional): Group results by (day, week, month, driver)

**Response**:
```json
{
  "period": {
    "start": "2023-12-01",
    "end": "2023-12-17"
  },
  "summary": {
    "total_orders": 1250,
    "successful_deliveries": 1215,
    "failed_deliveries": 35,
    "success_rate": 97.2,
    "average_delivery_time": 32.5,
    "total_revenue": 125000.00,
    "total_delivery_fees": 6250.00
  },
  "performance_by_driver": [
    {
      "driver_id": 15,
      "driver_name": "Raj Kumar",
      "orders_delivered": 85,
      "success_rate": 98.8,
      "average_time": 28.3,
      "customer_rating": 4.8
    }
  ],
  "delivery_trends": [
    {
      "date": "2023-12-17",
      "orders": 75,
      "successful": 73,
      "revenue": 7500.00
    }
  ]
}
```

### 6.2 Get Delivery Zones Performance

**Endpoint**: `GET /api/delivery/zones/performance`

**Response**:
```json
{
  "zones": [
    {
      "zone_id": 1,
      "zone_name": "Central Mumbai",
      "pincode_ranges": ["400001", "400002", "400003"],
      "total_orders": 450,
      "average_delivery_time": 25.5,
      "success_rate": 98.2,
      "popular_time_slots": ["10:00-12:00", "14:00-16:00"],
      "average_order_value": 850.75
    }
  ]
}
```

## 7. Integration Webhooks

### 7.1 Transaction Webhook

**Endpoint**: `POST /api/delivery/webhooks/transaction`

**Description**: Receives transaction updates from POS system

**Request Body**:
```json
{
  "event": "transaction.created",
  "data": {
    "transaction_id": 12345,
    "customer_id": 678,
    "amount": 1200.50,
    "items": [...],
    "is_delivery": true,
    "timestamp": "2023-12-17T09:00:00Z"
  }
}
```

### 7.2 Inventory Webhook

**Endpoint**: `POST /api/delivery/webhooks/inventory`

**Description**: Receives inventory updates for delivery order processing

**Request Body**:
```json
{
  "event": "inventory.reserved",
  "data": {
    "transaction_id": 12345,
    "items": [
      {
        "product_id": 1001,
        "quantity": 2,
        "batch_id": 501
      }
    ],
    "timestamp": "2023-12-17T09:00:00Z"
  }
}
```

## 8. Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| DEL001 | Invalid delivery order ID | 404 |
| DEL002 | Driver not available | 400 |
| DEL003 | Invalid delivery address | 400 |
| DEL004 | Insufficient inventory for delivery | 400 |
| DEL005 | Route optimization failed | 500 |
| DEL006 | Driver location update failed | 400 |
| DEL007 | Invalid status transition | 400 |
| DEL008 | Delivery time slot unavailable | 400 |
| DEL009 | Duplicate delivery order | 409 |
| DEL010 | Driver license expired | 400 |

## 9. Rate Limiting

- **General API**: 100 requests per 15 minutes
- **Location Updates**: 1000 requests per hour (for driver tracking)
- **Bulk Operations**: 10 requests per minute

## 10. Authentication & Authorization

### 10.1 Required Permissions

| Endpoint | Required Permission |
|----------|-------------------|
| POST /orders | perm_delivery_create |
| PUT /orders | perm_delivery_update |
| DELETE /orders | perm_delivery_cancel |
| POST /drivers | perm_driver_manage |
| POST /routes | perm_route_manage |
| GET /analytics | perm_delivery_reports |

### 10.2 JWT Token Structure

```json
{
  "user_id": 25,
  "username": "manager",
  "permissions": [
    "perm_delivery_create",
    "perm_delivery_update",
    "perm_delivery_reports"
  ],
  "store_id": 1,
  "exp": 1703123456,
  "iat": 1703123456
}
```

This API specification provides comprehensive endpoints for implementing all delivery management features while maintaining consistency with the existing PharmaSoft architecture and security patterns.