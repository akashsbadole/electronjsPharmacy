# Data Persistence Tests for SQLite Database

This directory contains comprehensive test files to verify data persistence across application restarts in the Electron.js pharmacy application.

## Files

1. **test-data-persistence.js** - Main test file that verifies all SQLite API endpoints
2. **test-persistence-across-restarts.js** - Additional script to test data persistence across server restarts
3. **README-data-persistence-tests.md** - This documentation file

## Features

### test-data-persistence.js

This comprehensive test file verifies that all data is properly stored in the SQLite database by:

- Testing all 16 SQLite API endpoints:
  - inventory-sqlite.js
  - categories-sqlite.js
  - transactions-sqlite.js
  - customers-sqlite.js
  - users-sqlite.js
  - stores-sqlite.js
  - settings-sqlite.js
  - suppliers-sqlite.js
  - purchase-orders-sqlite.js
  - batches-sqlite.js
  - gst-config-sqlite.js
  - analytics-sqlite.js
  - reports-sqlite.js
  - dashboard-sqlite.js
  - e-invoice-sqlite.js
  - eway-bill-sqlite.js

- For each endpoint, it performs:
  - Create sample data
  - Verify the data was saved correctly
  - Read the data back to confirm it exists
  - Update the data and verify the update
  - Delete some data and verify the deletion

- Includes:
  - Unique identifier tracking for test data
  - Error handling for failed operations
  - Clear output showing what was tested
  - Final reporting of which endpoints passed/failed

### test-persistence-across-restarts.js

This script tests data persistence across server restarts by:

1. Running the initial data persistence test
2. Stopping the server
3. Restarting the server
4. Verifying that data still exists and APIs are accessible

## Usage

### Prerequisites

1. Make sure the server is not running (or the script will handle it)
2. Ensure all dependencies are installed
3. Make sure you have sufficient permissions to start/stop processes

### Running the Basic Data Persistence Test

```bash
node test-data-persistence.js
```

This will:
- Check if the server is running
- Run tests for all SQLite API endpoints
- Save results to a file named `test-results-[timestamp].json`
- Display a summary report in the console

### Running the Persistence Across Restarts Test

```bash
node test-persistence-across-restarts.js
```

This will:
- Check if the server is running
- Run the initial data persistence test
- Stop the server
- Restart the server
- Verify that data persists
- Save results to a file named `persistence-test-results-[timestamp].json`
- Display a summary report in the console

## Test Results

Both scripts generate detailed JSON reports with:

- Test ID and timestamp
- Summary of total tests, passed, failed, and errors
- Detailed results for each test case
- Error messages for any failures

## Understanding the Output

### Success Indicators

- **PASSED** - The test completed successfully
- **Server is running** - The server is accessible
- **Test results saved to** - Results were written to a file

### Error Indicators

- **FAILED** - The test did not complete as expected
- **ERROR** - An unexpected error occurred
- **Server is not running** - The server could not be accessed

## Troubleshooting

### Server Issues

If you encounter server-related errors:

1. Check if the server is already running on port 3000
2. Make sure no other processes are using the port
3. Verify that server.js exists and is executable
4. Check that all required dependencies are installed

### Test Failures

If tests fail:

1. Check the server logs for any errors
2. Verify that the SQLite database is properly initialized
3. Ensure all API endpoints are correctly implemented
4. Check that the database file has proper write permissions

### Permission Issues

If you encounter permission errors:

1. Make sure you have permission to start/stop processes
2. Check that you can write to the current directory
3. Verify that the database file is accessible

## Customization

### Modifying Test Data

You can customize the test data by modifying the `testData` objects in each test function.

### Changing Server Configuration

Update the `config` object at the top of the files if your server runs on a different port or host.

### Adding New Tests

To add tests for new endpoints:

1. Create a new test function following the existing pattern
2. Add the endpoint to the `apiEndpoints` array
3. Call the new test function in the `runTests` function

## Notes

- The tests use unique identifiers based on timestamps to avoid conflicts
- Test data is cleaned up after each test (except for transactions which are preserved)
- The scripts handle both Windows and Unix-like systems for process management
- All HTTP requests include proper error handling and timeout management

## Support

For issues with these tests:

1. Check the console output for specific error messages
2. Review the generated JSON result files for detailed information
3. Verify that the server implementation matches the expected API structure
4. Ensure the SQLite database is properly initialized and accessible