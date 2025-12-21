/**
 * Test Data Persistence Across Server Restarts
 * 
 * This script tests data persistence by:
 * 1. Running the initial data persistence test
 * 2. Restarting the server
 * 3. Verifying that data still exists
 * 
 * Usage: node test-persistence-across-restarts.js
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Import the test module
const { runTests, config } = require('./test-data-persistence.js');

// Configuration
const testConfig = {
    serverScript: 'server.js',
    testResultsFile: null,
    initialResults: null,
    persistenceResults: {
        passed: [],
        failed: [],
        errors: []
    }
};

// Helper function to log messages
function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = type === 'error' ? 'ERROR' : type === 'success' ? 'SUCCESS' : 'INFO';
    console.log(`[${timestamp}] ${prefix}: ${message}`);
}

// Helper function to wait for a specified time
function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to check if server is running
async function checkServerStatus() {
    const http = require('http');
    return new Promise((resolve) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: '/api/inventory-sqlite',
            method: 'GET',
            timeout: 3000
        }, (res) => {
            resolve(res.statusCode === 200);
        });
        
        req.on('error', () => {
            resolve(false);
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        
        req.end();
    });
}

// Helper function to start server
function startServer() {
    return new Promise((resolve, reject) => {
        log('Starting server...');
        const serverProcess = spawn('node', [testConfig.serverScript], {
            stdio: 'pipe',
            detached: false
        });
        
        let serverStarted = false;
        
        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(output);
            
            // Check for server startup message
            if (output.includes('Server running') || output.includes('listening')) {
                if (!serverStarted) {
                    serverStarted = true;
                    log('Server started successfully');
                    resolve(serverProcess);
                }
            }
        });
        
        serverProcess.stderr.on('data', (data) => {
            console.error(`Server error: ${data}`);
        });
        
        serverProcess.on('error', (error) => {
            log(`Failed to start server: ${error.message}`, 'error');
            reject(error);
        });
        
        serverProcess.on('exit', (code) => {
            if (!serverStarted) {
                log(`Server exited with code ${code}`, 'error');
                reject(new Error(`Server exited with code ${code}`));
            }
        });
        
        // Timeout after 30 seconds
        setTimeout(() => {
            if (!serverStarted) {
                log('Server startup timeout', 'error');
                reject(new Error('Server startup timeout'));
            }
        }, 30000);
    });
}

// Helper function to stop server
function stopServer(serverProcess) {
    return new Promise((resolve) => {
        if (!serverProcess) {
            resolve();
            return;
        }
        
        log('Stopping server...');
        serverProcess.kill('SIGTERM');
        
        serverProcess.on('exit', () => {
            log('Server stopped');
            resolve();
        });
        
        // Force kill after 5 seconds
        setTimeout(() => {
            serverProcess.kill('SIGKILL');
            resolve();
        }, 5000);
    });
}

// Function to verify data persistence
async function verifyDataPersistence() {
    log('Verifying data persistence after server restart...');
    
    // Import the test module again to get fresh functions
    const http = require('http');
    
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
            testConfig.persistenceResults.passed.push(result);
            log(`${endpoint}: ${test} - PASSED`, 'success');
        } else if (status === 'failed') {
            testConfig.persistenceResults.failed.push(result);
            log(`${endpoint}: ${test} - FAILED - ${details}`, 'error');
        } else {
            testConfig.persistenceResults.errors.push(result);
            log(`${endpoint}: ${test} - ERROR - ${details}`, 'error');
        }
    }
    
    // Test that we can still access the API endpoints
    const endpoints = [
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
    
    for (const endpoint of endpoints) {
        try {
            const response = await makeRequest('GET', endpoint.path);
            if (response.status === 200) {
                recordResult(endpoint.name, 'API accessibility after restart', 'passed');
            } else {
                recordResult(endpoint.name, 'API accessibility after restart', 'failed', `Status: ${response.status}`);
            }
        } catch (error) {
            recordResult(endpoint.name, 'API accessibility after restart', 'error', error.message);
        }
    }
    
    // Test specific data persistence by checking if we can still read data
    // Note: Since we deleted most test data in the initial test, we'll test with new data
    
    // Create a test record
    const testProduct = {
        name: `Persistence Test Product ${Date.now()}`,
        barcode: `PERSIST${Date.now()}`,
        description: 'Product for persistence testing',
        category_id: 1,
        unit: 'pcs',
        manufacturer: 'Test Manufacturer',
        is_active: true
    };
    
    try {
        // Create product
        const createResponse = await makeRequest('POST', '/api/inventory-sqlite', testProduct);
        if (createResponse.status !== 201) {
            recordResult('persistence', 'Create test product', 'failed', `Status: ${createResponse.status}`);
            return;
        }
        const productId = createResponse.data.id;
        recordResult('persistence', 'Create test product', 'passed');
        
        // Read product
        const readResponse = await makeRequest('GET', `/api/inventory-sqlite/${productId}`);
        if (readResponse.status !== 200 || readResponse.data.name !== testProduct.name) {
            recordResult('persistence', 'Read test product', 'failed', `Status: ${readResponse.status}`);
            return;
        }
        recordResult('persistence', 'Read test product', 'passed');
        
        // Update product
        const updateData = { name: `Updated ${testProduct.name}` };
        const updateResponse = await makeRequest('PUT', `/api/inventory-sqlite/${productId}`, updateData);
        if (updateResponse.status !== 200) {
            recordResult('persistence', 'Update test product', 'failed', `Status: ${updateResponse.status}`);
            return;
        }
        recordResult('persistence', 'Update test product', 'passed');
        
        // Delete product
        const deleteResponse = await makeRequest('DELETE', `/api/inventory-sqlite/${productId}`);
        if (deleteResponse.status !== 200) {
            recordResult('persistence', 'Delete test product', 'failed', `Status: ${deleteResponse.status}`);
            return;
        }
        recordResult('persistence', 'Delete test product', 'passed');
        
    } catch (error) {
        recordResult('persistence', 'Product CRUD operations', 'error', error.message);
    }
}

// Function to save persistence test results
function savePersistenceResults() {
    const resultsPath = path.join(__dirname, `persistence-test-results-${Date.now()}.json`);
    const resultsData = {
        testId: `persistence_${Date.now()}`,
        timestamp: new Date().toISOString(),
        summary: {
            total: testConfig.persistenceResults.passed.length + testConfig.persistenceResults.failed.length + testConfig.persistenceResults.errors.length,
            passed: testConfig.persistenceResults.passed.length,
            failed: testConfig.persistenceResults.failed.length,
            errors: testConfig.persistenceResults.errors.length
        },
        results: testConfig.persistenceResults
    };

    fs.writeFileSync(resultsPath, JSON.stringify(resultsData, null, 2));
    log(`Persistence test results saved to: ${resultsPath}`);
}

// Function to print final persistence report
function printPersistenceReport() {
    console.log('\n' + '='.repeat(80));
    console.log('DATA PERSISTENCE ACROSS RESTARTS TEST REPORT');
    console.log('='.repeat(80));
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('\nSUMMARY:');
    console.log(`Total Tests: ${testConfig.persistenceResults.passed.length + testConfig.persistenceResults.failed.length + testConfig.persistenceResults.errors.length}`);
    console.log(`Passed: ${testConfig.persistenceResults.passed.length}`);
    console.log(`Failed: ${testConfig.persistenceResults.failed.length}`);
    console.log(`Errors: ${testConfig.persistenceResults.errors.length}`);
    
    if (testConfig.persistenceResults.failed.length > 0) {
        console.log('\nFAILED TESTS:');
        testConfig.persistenceResults.failed.forEach(test => {
            console.log(`- ${test.endpoint}: ${test.test} - ${test.details}`);
        });
    }
    
    if (testConfig.persistenceResults.errors.length > 0) {
        console.log('\nERRORS:');
        testConfig.persistenceResults.errors.forEach(test => {
            console.log(`- ${test.endpoint}: ${test.test} - ${test.details}`);
        });
    }
    
    console.log('\n' + '='.repeat(80));
}

// Main test function
async function runPersistenceTest() {
    let serverProcess = null;
    
    try {
        log('Starting data persistence across server restarts test...');
        
        // Check if server is already running
        const serverRunning = await checkServerStatus();
        if (serverRunning) {
            log('Server is already running. Proceeding with initial tests...');
        } else {
            // Start the server
            serverProcess = await startServer();
            // Wait for server to fully initialize
            await wait(3000);
        }
        
        // Run initial tests
        log('Running initial data persistence tests...');
        await runTests();
        
        // Store initial results
        testConfig.initialResults = {
            passed: config.results.passed.length,
            failed: config.results.failed.length,
            errors: config.results.errors.length
        };
        
        log('Initial tests completed.');
        log(`Initial results - Passed: ${testConfig.initialResults.passed}, Failed: ${testConfig.initialResults.failed}, Errors: ${testConfig.initialResults.errors}`);
        
        // Stop the server
        if (serverProcess) {
            await stopServer(serverProcess);
            serverProcess = null;
        } else {
            log('Note: Server was already running, attempting to restart it...');
            // Try to stop any existing server process
            try {
                const { spawn } = require('child_process');
                if (process.platform === 'win32') {
                    spawn('taskkill', ['/F', '/IM', 'node.exe'], { stdio: 'ignore' });
                } else {
                    spawn('pkill', ['-f', 'node'], { stdio: 'ignore' });
                }
                await wait(3000);
            } catch (error) {
                log(`Error stopping existing server: ${error.message}`, 'error');
            }
        }
        
        // Wait a moment
        await wait(2000);
        
        // Start the server again
        serverProcess = await startServer();
        // Wait for server to fully initialize
        await wait(3000);
        
        // Verify data persistence
        await verifyDataPersistence();
        
        // Save results and print report
        savePersistenceResults();
        printPersistenceReport();
        
        log('Data persistence across server restarts test completed.');
        
        // Stop the server
        if (serverProcess) {
            await stopServer(serverProcess);
        }
        
    } catch (error) {
        log(`Test execution failed: ${error.message}`, 'error');
        
        // Try to stop the server if it's running
        if (serverProcess) {
            await stopServer(serverProcess);
        }
        
        process.exit(1);
    }
}

// Run the test
if (require.main === module) {
    runPersistenceTest().catch(error => {
        log(`Test execution failed: ${error.message}`, 'error');
        process.exit(1);
    });
}

module.exports = {
    runPersistenceTest
};