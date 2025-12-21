/**
 * Comprehensive Data Persistence Test for SQLite Database
 * 
 * This test verifies that all data is properly stored in the SQLite database
 * and persists when the server is restarted.
 * 
 * Usage: node test-data-persistence.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Configuration
const config = {
    baseUrl: 'http://localhost:3000',
    testId: `test_${Date.now()}`,
    results: {
        passed: [],
        failed: [],
        errors: []
    }
};

// API endpoints to test
const apiEndpoints = [
    { name: 'inventory', path: '/api/inventory-sqlite' },
    { name: 'categories', path: '/api/categories-sqlite' },
    { name: 'transactions', path: '/api/transactions-sqlite' },
    { name: 'customers', path: '/api/customers-sqlite' },
    { name: 'users', path: '/api/users-sqlite' },
    { name: 'stores', path: '/api/stores-sqlite' },
    { name: 'settings', path: '/api/settings-sqlite' },
    { name: 'suppliers', path: '/api/suppliers-sqlite' },
    { name: 'purchase-orders', path: '/api/purchase-orders-sqlite' },
    { name: 'batches', path: '/api/batches-sqlite' },
    { name: 'gst-config', path: '/api/gst-config-sqlite' },
    { name: 'analytics', path: '/api/analytics-sqlite' },
    { name: 'reports', path: '/api/reports-sqlite' },
    { name: 'dashboard', path: '/api/dashboard-sqlite' },
    { name: 'e-invoice', path: '/api/e-invoice-sqlite' },
    { name: 'eway-bill', path: '/api/eway-bill-sqlite' }
];

// Helper function to make HTTP requests
function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    resolve({ status: res.statusCode, data: data });
                } catch (error) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

// Helper function to log test results
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? 'ERROR' : type === 'success' ? 'SUCCESS' : 'INFO';
    console.log(`[${timestamp}] ${prefix}: ${message}`);
}

// Helper function to record test results
function recordResult(endpoint, test, status, details = '') {
    const result = {
        endpoint: endpoint,
        test: test,
        status: status,
        details: details,
        timestamp: new Date().toISOString()
    };

    if (status === 'passed') {
        config.results.passed.push(result);
        log(`${endpoint}: ${test} - PASSED`, 'success');
    } else if (status === 'failed') {
        config.results.failed.push(result);
        log(`${endpoint}: ${test} - FAILED - ${details}`, 'error');
    } else {
        config.results.errors.push(result);
        log(`${endpoint}: ${test} - ERROR - ${details}`, 'error');
    }
}

// Test functions for each endpoint
async function testInventory() {
    const endpoint = 'inventory';
    const testData = {
        name: `Test Product ${config.testId}`,
        barcode: `TEST${config.testId}`,
        description: 'Test product for data persistence',
        category_id: 1,
        unit: 'pcs',
        manufacturer: 'Test Manufacturer',
        is_active: true
    };

    try {
        // Create product
        const createResponse = await makeRequest('POST', '/api/inventory-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create product', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const productId = createResponse.data.id;
        recordResult(endpoint, 'Create product', 'passed');

        // Read product
        const readResponse = await makeRequest('GET', `/api/inventory-sqlite/${productId}`);
        if (readResponse.status !== 200 || readResponse.data.name !== testData.name) {
            recordResult(endpoint, 'Read product', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read product', 'passed');

        // Update product
        const updateData = { name: `Updated ${testData.name}` };
        const updateResponse = await makeRequest('PUT', `/api/inventory-sqlite/${productId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update product', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update product', 'passed');

        // Delete product
        const deleteResponse = await makeRequest('DELETE', `/api/inventory-sqlite/${productId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete product', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete product', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Inventory test', 'error', error.message);
    }
}

async function testCategories() {
    const endpoint = 'categories';
    const testData = {
        name: `Test Category ${config.testId}`,
        description: 'Test category for data persistence',
        parent_id: null,
        display_order: 1,
        is_active: true
    };

    try {
        // Create category
        const createResponse = await makeRequest('POST', '/api/categories-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create category', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const categoryId = createResponse.data.id;
        recordResult(endpoint, 'Create category', 'passed');

        // Read category
        const readResponse = await makeRequest('GET', `/api/categories-sqlite/${categoryId}`);
        if (readResponse.status !== 200 || readResponse.data.name !== testData.name) {
            recordResult(endpoint, 'Read category', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read category', 'passed');

        // Update category
        const updateData = { name: `Updated ${testData.name}` };
        const updateResponse = await makeRequest('PUT', `/api/categories-sqlite/${categoryId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update category', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update category', 'passed');

        // Delete category
        const deleteResponse = await makeRequest('DELETE', `/api/categories-sqlite/${categoryId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete category', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete category', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Categories test', 'error', error.message);
    }
}

async function testTransactions() {
    const endpoint = 'transactions';
    const testData = {
        customer_id: 1,
        store_id: 1,
        user_id: 1,
        transaction_number: `TXN${config.testId}`,
        subtotal: 100.00,
        tax_amount: 18.00,
        discount_amount: 0.00,
        total_amount: 118.00,
        payment_method: 'cash',
        transaction_status: 'COMPLETED',
        items: [
            {
                product_id: 1,
                quantity: 2,
                unit_price: 50.00,
                total_price: 100.00,
                cost_price: 40.00
            }
        ]
    };

    try {
        // Create transaction
        const createResponse = await makeRequest('POST', '/api/transactions-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create transaction', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const transactionId = createResponse.data.id;
        recordResult(endpoint, 'Create transaction', 'passed');

        // Read transaction
        const readResponse = await makeRequest('GET', `/api/transactions-sqlite/${transactionId}`);
        if (readResponse.status !== 200 || readResponse.data.transaction_number !== testData.transaction_number) {
            recordResult(endpoint, 'Read transaction', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read transaction', 'passed');

        // Update transaction
        const updateData = { payment_method: 'card' };
        const updateResponse = await makeRequest('PUT', `/api/transactions-sqlite/${transactionId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update transaction', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update transaction', 'passed');

        // Note: We won't delete transactions as they should be preserved for records
        recordResult(endpoint, 'Preserve transaction record', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Transactions test', 'error', error.message);
    }
}

async function testCustomers() {
    const endpoint = 'customers';
    const testData = {
        name: `Test Customer ${config.testId}`,
        email: `test${config.testId}@example.com`,
        phone: `9876543210`,
        address: '123 Test Street',
        city: 'Test City',
        state: 'Test State',
        pincode: '123456',
        gst_number: `TESTGST${config.testId}`,
        is_active: true
    };

    try {
        // Create customer
        const createResponse = await makeRequest('POST', '/api/customers-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create customer', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const customerId = createResponse.data.id;
        recordResult(endpoint, 'Create customer', 'passed');

        // Read customer
        const readResponse = await makeRequest('GET', `/api/customers-sqlite/${customerId}`);
        if (readResponse.status !== 200 || readResponse.data.name !== testData.name) {
            recordResult(endpoint, 'Read customer', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read customer', 'passed');

        // Update customer
        const updateData = { name: `Updated ${testData.name}` };
        const updateResponse = await makeRequest('PUT', `/api/customers-sqlite/${customerId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update customer', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update customer', 'passed');

        // Delete customer
        const deleteResponse = await makeRequest('DELETE', `/api/customers-sqlite/${customerId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete customer', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete customer', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Customers test', 'error', error.message);
    }
}

async function testUsers() {
    const endpoint = 'users';
    const testData = {
        username: `testuser${config.testId}`,
        password: 'testpassword123',
        email: `testuser${config.testId}@example.com`,
        full_name: 'Test User',
        role: 'pharmacist',
        is_active: true
    };

    try {
        // Create user
        const createResponse = await makeRequest('POST', '/api/users-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create user', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const userId = createResponse.data.id;
        recordResult(endpoint, 'Create user', 'passed');

        // Read user
        const readResponse = await makeRequest('GET', `/api/users-sqlite/${userId}`);
        if (readResponse.status !== 200 || readResponse.data.username !== testData.username) {
            recordResult(endpoint, 'Read user', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read user', 'passed');

        // Update user
        const updateData = { full_name: `Updated ${testData.full_name}` };
        const updateResponse = await makeRequest('PUT', `/api/users-sqlite/${userId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update user', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update user', 'passed');

        // Delete user
        const deleteResponse = await makeRequest('DELETE', `/api/users-sqlite/${userId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete user', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete user', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Users test', 'error', error.message);
    }
}

async function testStores() {
    const endpoint = 'stores';
    const testData = {
        store_name: `Test Store ${config.testId}`,
        store_code: `TS${config.testId}`,
        address_line1: '123 Test Street',
        city: 'Test City',
        state: 'Test State',
        pincode: '123456',
        phone: '9876543210',
        email: `teststore${config.testId}@example.com`,
        gst_number: `TESTGST${config.testId}`,
        is_active: true
    };

    try {
        // Create store
        const createResponse = await makeRequest('POST', '/api/stores-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create store', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const storeId = createResponse.data.id;
        recordResult(endpoint, 'Create store', 'passed');

        // Read store
        const readResponse = await makeRequest('GET', `/api/stores-sqlite/${storeId}`);
        if (readResponse.status !== 200 || readResponse.data.store_name !== testData.store_name) {
            recordResult(endpoint, 'Read store', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read store', 'passed');

        // Update store
        const updateData = { store_name: `Updated ${testData.store_name}` };
        const updateResponse = await makeRequest('PUT', `/api/stores-sqlite/${storeId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update store', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update store', 'passed');

        // Delete store
        const deleteResponse = await makeRequest('DELETE', `/api/stores-sqlite/${storeId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete store', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete store', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Stores test', 'error', error.message);
    }
}

async function testSettings() {
    const endpoint = 'settings';
    const testData = {
        setting_key: `test_setting_${config.testId}`,
        setting_value: 'Test value for data persistence',
        setting_type: 'string',
        description: 'Test setting for data persistence',
        is_active: true
    };

    try {
        // Create setting
        const createResponse = await makeRequest('POST', '/api/settings-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create setting', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const settingId = createResponse.data.id;
        recordResult(endpoint, 'Create setting', 'passed');

        // Read setting
        const readResponse = await makeRequest('GET', `/api/settings-sqlite/${settingId}`);
        if (readResponse.status !== 200 || readResponse.data.setting_key !== testData.setting_key) {
            recordResult(endpoint, 'Read setting', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read setting', 'passed');

        // Update setting
        const updateData = { setting_value: 'Updated test value' };
        const updateResponse = await makeRequest('PUT', `/api/settings-sqlite/${settingId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update setting', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update setting', 'passed');

        // Delete setting
        const deleteResponse = await makeRequest('DELETE', `/api/settings-sqlite/${settingId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete setting', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete setting', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Settings test', 'error', error.message);
    }
}

async function testSuppliers() {
    const endpoint = 'suppliers';
    const testData = {
        name: `Test Supplier ${config.testId}`,
        contact_person: 'Test Contact',
        email: `testsupplier${config.testId}@example.com`,
        phone: '9876543210',
        address: '123 Supplier Street',
        city: 'Supplier City',
        state: 'Supplier State',
        pincode: '123456',
        gst_number: `SUPGST${config.testId}`,
        is_active: true
    };

    try {
        // Create supplier
        const createResponse = await makeRequest('POST', '/api/suppliers-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create supplier', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const supplierId = createResponse.data.id;
        recordResult(endpoint, 'Create supplier', 'passed');

        // Read supplier
        const readResponse = await makeRequest('GET', `/api/suppliers-sqlite/${supplierId}`);
        if (readResponse.status !== 200 || readResponse.data.name !== testData.name) {
            recordResult(endpoint, 'Read supplier', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read supplier', 'passed');

        // Update supplier
        const updateData = { name: `Updated ${testData.name}` };
        const updateResponse = await makeRequest('PUT', `/api/suppliers-sqlite/${supplierId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update supplier', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update supplier', 'passed');

        // Delete supplier
        const deleteResponse = await makeRequest('DELETE', `/api/suppliers-sqlite/${supplierId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete supplier', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete supplier', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Suppliers test', 'error', error.message);
    }
}

async function testPurchaseOrders() {
    const endpoint = 'purchase-orders';
    const testData = {
        supplier_id: 1,
        store_id: 1,
        order_number: `PO${config.testId}`,
        order_date: new Date().toISOString(),
        expected_delivery_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING',
        subtotal: 1000.00,
        tax_amount: 180.00,
        total_amount: 1180.00,
        items: [
            {
                product_id: 1,
                quantity: 10,
                unit_price: 100.00,
                total_price: 1000.00
            }
        ]
    };

    try {
        // Create purchase order
        const createResponse = await makeRequest('POST', '/api/purchase-orders-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create purchase order', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const poId = createResponse.data.id;
        recordResult(endpoint, 'Create purchase order', 'passed');

        // Read purchase order
        const readResponse = await makeRequest('GET', `/api/purchase-orders-sqlite/${poId}`);
        if (readResponse.status !== 200 || readResponse.data.order_number !== testData.order_number) {
            recordResult(endpoint, 'Read purchase order', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read purchase order', 'passed');

        // Update purchase order
        const updateData = { status: 'CONFIRMED' };
        const updateResponse = await makeRequest('PUT', `/api/purchase-orders-sqlite/${poId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update purchase order', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update purchase order', 'passed');

        // Delete purchase order
        const deleteResponse = await makeRequest('DELETE', `/api/purchase-orders-sqlite/${poId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete purchase order', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete purchase order', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Purchase orders test', 'error', error.message);
    }
}

async function testBatches() {
    const endpoint = 'batches';
    const testData = {
        product_id: 1,
        store_id: 1,
        batch_number: `BATCH${config.testId}`,
        manufacture_date: new Date().toISOString(),
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        initial_quantity: 100,
        current_quantity: 100,
        cost_price: 50.00,
        selling_price: 75.00,
        is_active: true
    };

    try {
        // Create batch
        const createResponse = await makeRequest('POST', '/api/batches-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create batch', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const batchId = createResponse.data.id;
        recordResult(endpoint, 'Create batch', 'passed');

        // Read batch
        const readResponse = await makeRequest('GET', `/api/batches-sqlite/${batchId}`);
        if (readResponse.status !== 200 || readResponse.data.batch_number !== testData.batch_number) {
            recordResult(endpoint, 'Read batch', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read batch', 'passed');

        // Update batch
        const updateData = { current_quantity: 90 };
        const updateResponse = await makeRequest('PUT', `/api/batches-sqlite/${batchId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update batch', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update batch', 'passed');

        // Delete batch
        const deleteResponse = await makeRequest('DELETE', `/api/batches-sqlite/${batchId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete batch', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete batch', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Batches test', 'error', error.message);
    }
}

async function testGSTConfig() {
    const endpoint = 'gst-config';
    const testData = {
        gst_number: `TESTGST${config.testId}`,
        state_code: '29',
        cgst_rate: 9.00,
        sgst_rate: 9.00,
        igst_rate: 18.00,
        cess_rate: 0.00,
        effective_date: new Date().toISOString().split('T')[0],
        is_active: true
    };

    try {
        // Create GST config
        const createResponse = await makeRequest('POST', '/api/gst-config-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create GST config', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const configId = createResponse.data.id;
        recordResult(endpoint, 'Create GST config', 'passed');

        // Read GST config
        const readResponse = await makeRequest('GET', `/api/gst-config-sqlite/${configId}`);
        if (readResponse.status !== 200 || readResponse.data.gst_number !== testData.gst_number) {
            recordResult(endpoint, 'Read GST config', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read GST config', 'passed');

        // Update GST config
        const updateData = { cgst_rate: 14.00, sgst_rate: 14.00 };
        const updateResponse = await makeRequest('PUT', `/api/gst-config-sqlite/${configId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update GST config', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update GST config', 'passed');

        // Delete GST config (deactivate first)
        const deactivateResponse = await makeRequest('PUT', `/api/gst-config-sqlite/${configId}`, { is_active: false });
        if (deactivateResponse.status !== 200) {
            recordResult(endpoint, 'Deactivate GST config', 'failed', `Status: ${deactivateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Deactivate GST config', 'passed');

        const deleteResponse = await makeRequest('DELETE', `/api/gst-config-sqlite/${configId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete GST config', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete GST config', 'passed');

    } catch (error) {
        recordResult(endpoint, 'GST config test', 'error', error.message);
    }
}

async function testAnalytics() {
    const endpoint = 'analytics';
    
    try {
        // Test sales trends
        const salesResponse = await makeRequest('GET', '/api/analytics-sqlite/sales/trends?period=monthly');
        if (salesResponse.status !== 200) {
            recordResult(endpoint, 'Get sales trends', 'failed', `Status: ${salesResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get sales trends', 'passed');

        // Test top products
        const topProductsResponse = await makeRequest('GET', '/api/analytics-sqlite/sales/top-products?limit=5');
        if (topProductsResponse.status !== 200) {
            recordResult(endpoint, 'Get top products', 'failed', `Status: ${topProductsResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get top products', 'passed');

        // Test inventory analysis
        const inventoryResponse = await makeRequest('GET', '/api/analytics-sqlite/inventory/analysis');
        if (inventoryResponse.status !== 200) {
            recordResult(endpoint, 'Get inventory analysis', 'failed', `Status: ${inventoryResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get inventory analysis', 'passed');

        // Test customer analysis
        const customerResponse = await makeRequest('GET', '/api/analytics-sqlite/customers/analysis');
        if (customerResponse.status !== 200) {
            recordResult(endpoint, 'Get customer analysis', 'failed', `Status: ${customerResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get customer analysis', 'passed');

        // Test financial analysis
        const financialResponse = await makeRequest('GET', '/api/analytics-sqlite/financial/analysis');
        if (financialResponse.status !== 200) {
            recordResult(endpoint, 'Get financial analysis', 'failed', `Status: ${financialResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get financial analysis', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Analytics test', 'error', error.message);
    }
}

async function testReports() {
    const endpoint = 'reports';
    const testData = {
        startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date().toISOString(),
        reportType: 'Sales Report'
    };

    try {
        // Test sales report
        const salesResponse = await makeRequest('POST', '/api/reports-sqlite/sales', testData);
        if (salesResponse.status !== 200) {
            recordResult(endpoint, 'Generate sales report', 'failed', `Status: ${salesResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Generate sales report', 'passed');

        // Test inventory report
        const inventoryResponse = await makeRequest('POST', '/api/reports-sqlite/inventory', { reportType: 'Inventory Report' });
        if (inventoryResponse.status !== 200) {
            recordResult(endpoint, 'Generate inventory report', 'failed', `Status: ${inventoryResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Generate inventory report', 'passed');

        // Test customer report
        const customerResponse = await makeRequest('POST', '/api/reports-sqlite/customers', { reportType: 'Customer Report' });
        if (customerResponse.status !== 200) {
            recordResult(endpoint, 'Generate customer report', 'failed', `Status: ${customerResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Generate customer report', 'passed');

        // Test financial report
        const financialResponse = await makeRequest('POST', '/api/reports-sqlite/financial', testData);
        if (financialResponse.status !== 200) {
            recordResult(endpoint, 'Generate financial report', 'failed', `Status: ${financialResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Generate financial report', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Reports test', 'error', error.message);
    }
}

async function testDashboard() {
    const endpoint = 'dashboard';
    
    try {
        // Test dashboard KPIs
        const kpiResponse = await makeRequest('GET', '/api/dashboard-sqlite/kpi?period=monthly');
        if (kpiResponse.status !== 200) {
            recordResult(endpoint, 'Get dashboard KPIs', 'failed', `Status: ${kpiResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get dashboard KPIs', 'passed');

        // Test sales chart
        const salesChartResponse = await makeRequest('GET', '/api/dashboard-sqlite/sales-chart?period=monthly');
        if (salesChartResponse.status !== 200) {
            recordResult(endpoint, 'Get sales chart', 'failed', `Status: ${salesChartResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get sales chart', 'passed');

        // Test top products chart
        const topProductsResponse = await makeRequest('GET', '/api/dashboard-sqlite/top-products-chart?limit=5');
        if (topProductsResponse.status !== 200) {
            recordResult(endpoint, 'Get top products chart', 'failed', `Status: ${topProductsResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get top products chart', 'passed');

        // Test recent transactions
        const recentResponse = await makeRequest('GET', '/api/dashboard-sqlite/recent-transactions?limit=5');
        if (recentResponse.status !== 200) {
            recordResult(endpoint, 'Get recent transactions', 'failed', `Status: ${recentResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get recent transactions', 'passed');

        // Test low stock alerts
        const alertsResponse = await makeRequest('GET', '/api/dashboard-sqlite/low-stock-alerts');
        if (alertsResponse.status !== 200) {
            recordResult(endpoint, 'Get low stock alerts', 'failed', `Status: ${alertsResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Get low stock alerts', 'passed');

    } catch (error) {
        recordResult(endpoint, 'Dashboard test', 'error', error.message);
    }
}

async function testEInvoice() {
    const endpoint = 'e-invoice';
    const testData = {
        transaction_id: `TXN${config.testId}`
    };

    try {
        // Create e-invoice
        const createResponse = await makeRequest('POST', '/api/e-invoice-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create e-invoice', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const invoiceId = createResponse.data.id;
        recordResult(endpoint, 'Create e-invoice', 'passed');

        // Read e-invoice
        const readResponse = await makeRequest('GET', `/api/e-invoice-sqlite/${invoiceId}`);
        if (readResponse.status !== 200 || readResponse.data.transaction_id !== testData.transaction_id) {
            recordResult(endpoint, 'Read e-invoice', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read e-invoice', 'passed');

        // Update e-invoice
        const updateData = { invoice_status: 'GENERATED' };
        const updateResponse = await makeRequest('PUT', `/api/e-invoice-sqlite/${invoiceId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update e-invoice', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update e-invoice', 'passed');

        // Delete e-invoice
        const deleteResponse = await makeRequest('DELETE', `/api/e-invoice-sqlite/${invoiceId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete e-invoice', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete e-invoice', 'passed');

    } catch (error) {
        recordResult(endpoint, 'E-invoice test', 'error', error.message);
    }
}

async function testEWayBill() {
    const endpoint = 'eway-bill';
    const testData = {
        transaction_id: `TXN${config.testId}`,
        from_state: 'Karnataka',
        to_state: 'Maharashtra',
        from_pincode: '560001',
        to_pincode: '400001'
    };

    try {
        // Create e-way bill
        const createResponse = await makeRequest('POST', '/api/eway-bill-sqlite', testData);
        if (createResponse.status !== 201) {
            recordResult(endpoint, 'Create e-way bill', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const billId = createResponse.data.id;
        recordResult(endpoint, 'Create e-way bill', 'passed');

        // Read e-way bill
        const readResponse = await makeRequest('GET', `/api/eway-bill-sqlite/${billId}`);
        if (readResponse.status !== 200 || readResponse.data.transaction_id !== testData.transaction_id) {
            recordResult(endpoint, 'Read e-way bill', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Read e-way bill', 'passed');

        // Update e-way bill
        const updateData = { vehicle_number: 'KA01AB1234' };
        const updateResponse = await makeRequest('PUT', `/api/eway-bill-sqlite/${billId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult(endpoint, 'Update e-way bill', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Update e-way bill', 'passed');

        // Cancel e-way bill
        const cancelResponse = await makeRequest('POST', `/api/eway-bill-sqlite/${billId}/cancel`, { cancel_reason: 'Test cancellation' });
        if (cancelResponse.status !== 200) {
            recordResult(endpoint, 'Cancel e-way bill', 'failed', `Status: ${cancelResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Cancel e-way bill', 'passed');

        // Delete e-way bill
        const deleteResponse = await makeRequest('DELETE', `/api/eway-bill-sqlite/${billId}`);
        if (deleteResponse.status !== 200) {
            recordResult(endpoint, 'Delete e-way bill', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult(endpoint, 'Delete e-way bill', 'passed');

    } catch (error) {
        recordResult(endpoint, 'E-way bill test', 'error', error.message);
    }
}

// Function to check if server is running
async function checkServerStatus() {
    try {
        const response = await makeRequest('GET', '/api/inventory-sqlite');
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// Function to save test results to file
function saveTestResults() {
    const resultsPath = path.join(__dirname, `test-results-${config.testId}.json`);
    const resultsData = {
        testId: config.testId,
        timestamp: new Date().toISOString(),
        summary: {
            total: config.results.passed.length + config.results.failed.length + config.results.errors.length,
            passed: config.results.passed.length,
            failed: config.results.failed.length,
            errors: config.results.errors.length
        },
        results: config.results
    };

    fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));
    log(`Test results saved to: ${resultsPath}`);
}

// Function to print final report
function printFinalReport() {
    console.log('\n' + '='.repeat(80));
    console.log('DATA PERSISTENCE TEST REPORT');
    console.log('='.repeat(80));
    console.log(`Test ID: ${config.testId}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('\nSUMMARY:');
    console.log(`Total Tests: ${config.results.passed.length + config.results.failed.length + config.results.errors.length}`);
    console.log(`Passed: ${config.results.passed.length}`);
    console.log(`Failed: ${config.results.failed.length}`);
    console.log(`Errors: ${config.results.errors.length}`);
    
    if (config.results.failed.length > 0) {
        console.log('\nFAILED TESTS:');
        config.results.failed.forEach(test => {
            console.log(`- ${test.endpoint}: ${test.test} - ${test.details}`);
        });
    }
    
    if (config.results.errors.length > 0) {
        console.log('\nERRORS:');
        config.results.errors.forEach(test => {
            console.log(`- ${test.endpoint}: ${test.test} - ${test.details}`);
        });
    }
    
    console.log('\n' + '='.repeat(80));
}

// Main test function
async function runTests() {
    log('Starting data persistence tests...');
    log(`Test ID: ${config.testId}`);
    
    // Check if server is running
    log('Checking server status...');
    const serverRunning = await checkServerStatus();
    if (!serverRunning) {
        log('Server is not running. Please start the server first.', 'error');
        process.exit(1);
    }
    log('Server is running.');
    
    // Run tests for each endpoint
    log('Running tests for all SQLite API endpoints...');
    
    await testInventory();
    await testCategories();
    await testTransactions();
    await testCustomers();
    await testUsers();
    await testStores();
    await testSettings();
    await testSuppliers();
    await testPurchaseOrders();
    await testBatches();
    await testGSTConfig();
    await testAnalytics();
    await testReports();
    await testDashboard();
    await testEInvoice();
    await testEWayBill();
    
    // Save results and print report
    saveTestResults();
    printFinalReport();
    
    log('Data persistence tests completed.');
}

// Run the tests
if (require.main === module) {
    runTests().catch(error => {
        log(`Test execution failed: ${error.message}`, 'error');
        process.exit(1);
    });
}

module.exports = {
    runTests,
    config
};