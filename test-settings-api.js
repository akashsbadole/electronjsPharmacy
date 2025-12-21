/**
 * Test script for Settings API
 * Run with: node test-settings-api.js
 */

const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

function makeRequest(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: HOST,
            port: PORT,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };

        const req = http.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(body);
                    resolve({ status: res.statusCode, data: json });
                } catch (e) {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });

        req.on('error', reject);

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

async function testSettingsAPI() {
    console.log('Testing Settings API...\n');

    try {
        // Test 1: Get current settings
        console.log('1. GET /api/settings/get');
        const getResult = await makeRequest('GET', '/api/settings/get');
        console.log('   Status:', getResult.status);
        console.log('   Data:', JSON.stringify(getResult.data, null, 2));
        console.log('');

        // Test 2: Health check
        console.log('2. GET /api/health');
        const healthResult = await makeRequest('GET', '/api/health');
        console.log('   Status:', healthResult.status);
        console.log('   Data:', JSON.stringify(healthResult.data, null, 2));
        console.log('');

        console.log('Tests completed!');
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

// Check if server is running first
const checkServer = http.request({
    hostname: HOST,
    port: PORT,
    path: '/',
    method: 'GET'
}, (res) => {
    console.log(`Server is running on port ${PORT}\n`);
    testSettingsAPI();
});

checkServer.on('error', (e) => {
    console.error(`Server is not running on port ${PORT}`);
    console.log('Please start the server first with: npm start');
});

checkServer.end();
