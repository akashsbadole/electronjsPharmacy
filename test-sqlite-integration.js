// Comprehensive integration test for SQLite database operations
const http = require('http');
const sqliteDBManager = require('./api/sqlite-db-manager');

// Test configuration
const SERVER_HOST = 'localhost';
let SERVER_PORT = 3000; // Default, will be updated if server is on different port
const API_BASE = `http://${SERVER_HOST}:${SERVER_PORT}/api`;

// Test results tracking
let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
    details: []
};

// Helper function to make HTTP requests
function makeRequest(path, method = 'GET', data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: SERVER_HOST,
            port: SERVER_PORT,
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
                    const response = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body ? JSON.parse(body) : null
                    };
                    resolve(response);
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
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

// Helper function to run a test
async function runTest(testName, testFunction) {
    testResults.total++;
    try {
        await testFunction();
        testResults.passed++;
        testResults.details.push({ name: testName, status: 'PASSED', error: null });
        console.log(`✅ ${testName}`);
    } catch (error) {
        testResults.failed++;
        testResults.details.push({ name: testName, status: 'FAILED', error: error.message });
        console.log(`❌ ${testName}: ${error.message}`);
    }
}

// Test 1: Check if server is running
async function testServerHealth() {
    // Try common ports that server might be running on
    const possiblePorts = [3000, 3001, 8000, 8080, 5000];
    
    for (const port of possiblePorts) {
        try {
            const response = await makeRequestWithPort('/', 'GET', null, port);
            if (response.statusCode === 200) {
                SERVER_PORT = port; // Update the global port variable
                console.log(`Found server running on port ${port}`);
                return;
            }
        } catch (error) {
            // Continue to next port
        }
    }
    
    throw new Error('Server not found on any common port (3000, 3001, 8000, 8080, 5000)');
}

// Helper function to make HTTP requests with custom port
function makeRequestWithPort(path, method = 'GET', data = null, port = SERVER_PORT) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: SERVER_HOST,
            port: port,
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
                    const response = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body ? JSON.parse(body) : null
                    };
                    resolve(response);
                } catch (error) {
                    resolve({
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: body
                    });
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

// Test 2: Test SQLite database initialization
async function testSQLiteInitialization() {
    try {
        await sqliteDBManager.initialize();
        const db = sqliteDBManager.getDatabase();
        if (!db) {
            throw new Error('SQLite database not initialized');
        }
    } catch (error) {
        throw new Error(`SQLite initialization failed: ${error.message}`);
    }
}

// Test 3: Test Categories API (SQLite)
async function testCategoriesAPI() {
    // Test GET all categories
    const getResponse = await makeRequestWithPort('/api/categories/all', 'GET', null, SERVER_PORT);
    if (getResponse.statusCode !== 200) {
        throw new Error(`GET categories failed with status ${getResponse.statusCode}`);
    }

    // Test POST new category
    const newCategory = {
        name: 'Test Category',
        description: 'Test category description',
        parent_id: null
    };
    const postResponse = await makeRequestWithPort('/api/categories/new', 'POST', newCategory, SERVER_PORT);
    if (postResponse.statusCode !== 200) {
        throw new Error(`POST category failed with status ${postResponse.statusCode}`);
    }
}

// Test 4: Test Inventory API (SQLite)
async function testInventoryAPI() {
    // Test GET all products
    const getResponse = await makeRequestWithPort('/api/inventory/all', 'GET', null, SERVER_PORT);
    if (getResponse.statusCode !== 200) {
        throw new Error(`GET inventory failed with status ${getResponse.statusCode}`);
    }

    // Verify response is an array
    if (!Array.isArray(getResponse.body)) {
        throw new Error('Inventory API did not return an array');
    }

    // Test POST new product
    const newProduct = {
        name: 'Test Product',
        sku: 'TEST-001',
        barcode: '1234567890',
        description: 'Test product description',
        category_id: 1,
        unit_price: 10.99,
        cost_price: 5.99,
        reorder_level: 10,
        quantity: 100
    };
    const postResponse = await makeRequestWithPort('/api/inventory/new', 'POST', newProduct, SERVER_PORT);
    if (postResponse.statusCode !== 200) {
        throw new Error(`POST inventory failed with status ${postResponse.statusCode}`);
    }
}

// Test 5: Test Transactions API (SQLite)
async function testTransactionsAPI() {
    // Test GET all transactions
    const getResponse = await makeRequestWithPort('/api/transactions/all', 'GET', null, SERVER_PORT);
    if (getResponse.statusCode !== 200) {
        throw new Error(`GET transactions failed with status ${getResponse.statusCode}`);
    }

    // Test POST new transaction
    const newTransaction = {
        customer: 1,
        user_id: 1,
        items: [
            {
                id: 1,
                quantity: 2,
                price: 10.99,
                total: 21.98
            }
        ],
        subtotal: 21.98,
        total_amount: 21.98,
        paid_amount: 21.98,
        payment_method: 'CASH'
    };
    const postResponse = await makeRequestWithPort('/api/transactions/new', 'POST', newTransaction, SERVER_PORT);
    if (postResponse.statusCode !== 200) {
        throw new Error(`POST transaction failed with status ${postResponse.statusCode}`);
    }
}

// Test 6: Test data integrity in SQLite
async function testDataIntegrity() {
    // Test that data is properly stored and retrieved
    const testCategory = {
        name: 'Integrity Test Category',
        description: 'Testing data integrity'
    };
    
    // Create category
    const createResponse = await makeRequestWithPort('/api/categories/new', 'POST', testCategory, SERVER_PORT);
    if (createResponse.statusCode !== 200) {
        throw new Error('Failed to create test category');
    }
    
    // Retrieve all categories and verify our test category exists
    const getResponse = await makeRequestWithPort('/api/categories/all', 'GET', null, SERVER_PORT);
    if (getResponse.statusCode !== 200) {
        throw new Error('Failed to retrieve categories');
    }
    
    const categories = getResponse.body;
    const foundCategory = categories.find(cat => cat.name === testCategory.name);
    if (!foundCategory) {
        throw new Error('Test category not found in database');
    }
    
    if (foundCategory.description !== testCategory.description) {
        throw new Error('Category description does not match');
    }
}

// Test 7: Test error handling
async function testErrorHandling() {
    // Test invalid category creation
    const invalidCategory = {
        // Missing required 'name' field
        description: 'Invalid category'
    };
    const response = await makeRequestWithPort('/api/categories/new', 'POST', invalidCategory, SERVER_PORT);
    
    // Should return an error status code (400-500)
    if (response.statusCode < 400 || response.statusCode >= 600) {
        throw new Error('Error handling failed - should return error status code');
    }
}

// Test 8: Test concurrent requests
async function testConcurrentRequests() {
    const promises = [];
    const numRequests = 10;
    
    // Make multiple concurrent requests
    for (let i = 0; i < numRequests; i++) {
        promises.push(makeRequestWithPort('/api/categories/all', 'GET', null, SERVER_PORT));
    }
    
    const results = await Promise.all(promises);
    
    // All requests should succeed
    for (let i = 0; i < results.length; i++) {
        if (results[i].statusCode !== 200) {
            throw new Error(`Concurrent request ${i} failed with status ${results[i].statusCode}`);
        }
    }
}

// Main test runner
async function runAllTests() {
    console.log('🧪 SQLite Integration Test Suite');
    console.log('=====================================\n');
    
    console.log('Checking server status...\n');
    
    try {
        // Check if server is running
        await runTest('Server Health Check', testServerHealth);
        
        // Initialize SQLite
        await runTest('SQLite Database Initialization', testSQLiteInitialization);
        
        // API Tests
        await runTest('Categories API (SQLite)', testCategoriesAPI);
        await runTest('Inventory API (SQLite)', testInventoryAPI);
        await runTest('Transactions API (SQLite)', testTransactionsAPI);
        
        // Data integrity tests
        await runTest('Data Integrity Test', testDataIntegrity);
        
        // Error handling tests
        await runTest('Error Handling Test', testErrorHandling);
        
        // Performance tests
        await runTest('Concurrent Requests Test', testConcurrentRequests);
        
    } catch (error) {
        console.error('\n❌ Test suite failed:', error.message);
        process.exit(1);
    }
    
    // Print test results
    console.log('\n📊 Test Results:');
    console.log('================');
    console.log(`Total Tests: ${testResults.total}`);
    console.log(`Passed: ${testResults.passed}`);
    console.log(`Failed: ${testResults.failed}`);
    console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(2)}%`);
    
    if (testResults.failed > 0) {
        console.log('\n❌ Failed Tests:');
        testResults.details
            .filter(test => test.status === 'FAILED')
            .forEach(test => {
                console.log(`   - ${test.name}: ${test.error}`);
            });
        process.exit(1);
    } else {
        console.log('\n✅ All tests passed! SQLite integration is working correctly.');
    }
}

// Run the tests
runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});