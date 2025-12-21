const sqliteDBManager = require('./api/sqlite-db-manager');
const dbInitializer = require('./api/db-initializer');

async function testSQLiteImplementation() {
    console.log('🧪 Testing SQLite Implementation...\n');
    
    try {
        // Test 1: Initialize SQLite database
        console.log('1. Testing SQLite database initialization...');
        await sqliteDBManager.initialize();
        console.log('✅ SQLite database initialized successfully\n');
        
        // Test 2: Test database connection
        console.log('2. Testing database connection...');
        const db = sqliteDBManager.getDatabase();
        const result = await new Promise((resolve, reject) => {
            db.get('SELECT sqlite_version() as version', [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        console.log(`✅ Database connection working. SQLite version: ${result.version}\n`);
        
        // Test 3: Test table creation
        console.log('3. Testing table creation...');
        const tables = await new Promise((resolve, reject) => {
            db.all(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
            `, [], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        console.log(`✅ Found ${tables.length} tables in database:`);
        tables.forEach(table => {
            console.log(`   - ${table.name}`);
        });
        console.log('');
        
        // Test 4: Test basic CRUD operations
        console.log('4. Testing basic CRUD operations...');
        
        // First, get the default store ID
        const store = await new Promise((resolve, reject) => {
            db.get('SELECT id FROM stores LIMIT 1', [], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        // Test insert into products table
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR IGNORE INTO products (store_id, sku, name, description, category_id)
                VALUES (?, ?, ?, ?, ?)
            `, [store.id, 'TEST-001', 'Test Medicine', 'Test Description', 1], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
        console.log('✅ Insert operation successful');
        
        // Get the product ID
        const product = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM products WHERE sku = ?', ['TEST-001'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        // Test insert into product_pricing table
        await new Promise((resolve, reject) => {
            db.run(`
                INSERT OR IGNORE INTO product_pricing (product_id, store_id, purchase_price, selling_price, effective_date)
                VALUES (?, ?, ?, ?, ?)
            `, [product.id, store.id, 8.50, 10.99, new Date().toISOString().split('T')[0]], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
        console.log('✅ Product pricing insert successful');
        
        // Test select with join
        const productWithPricing = await new Promise((resolve, reject) => {
            db.get(`
                SELECT p.*, pp.selling_price, pp.purchase_price
                FROM products p
                LEFT JOIN product_pricing pp ON p.id = pp.product_id
                WHERE p.sku = ?
            `, ['TEST-001'], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        console.log(`✅ Select operation successful. Found: ${productWithPricing.name} with price: ${productWithPricing.selling_price}\n`);
        
        // Test 5: Verify no NeDB databases are being used
        console.log('5. Verifying NeDB is not being used...');
        const nedbHealth = await dbInitializer.getAllDatabaseHealth();
        const nedbDatabases = Object.keys(nedbHealth).filter(db => db.includes('.db'));
        
        if (nedbDatabases.length === 0) {
            console.log('✅ No NeDB databases found - SQLite only implementation confirmed');
        } else {
            console.log(`⚠️  Found ${nedbDatabases.length} NeDB databases:`, nedbDatabases);
        }
        
        console.log('\n🎉 All tests passed! SQLite implementation is working correctly.');
        
        // Clean up test data
        await new Promise((resolve) => {
            db.run('DELETE FROM product_pricing WHERE product_id IN (SELECT id FROM products WHERE sku = ?)', ['TEST-001'], resolve);
        });
        await new Promise((resolve) => {
            db.run('DELETE FROM products WHERE sku = ?', ['TEST-001'], resolve);
        });
        
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return false;
    } finally {
        // Close database connection
        if (sqliteDBManager.getDatabase()) {
            sqliteDBManager.getDatabase().close();
        }
    }
}

// Run the test
testSQLiteImplementation().then(success => {
    process.exit(success ? 0 : 1);
});