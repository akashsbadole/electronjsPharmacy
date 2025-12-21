/**
 * Quick utility to check settings in SQLite database
 * Run with: node check-settings-db.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const appName = process.env.APPNAME || 'PharmaSoft';
const appData = process.env.APPDATA || (process.platform === 'win32' ? process.env.USERPROFILE + '/AppData/Roaming' : process.env.HOME + '/.config');
const dbPath = path.join(appData, appName, 'server', 'databases', 'pharmasoft.db');

console.log('Database path:', dbPath);
console.log('');

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    }

    console.log('Connected to database successfully\n');

    // Check stores table
    console.log('=== STORES ===');
    db.all('SELECT * FROM stores', [], (err, rows) => {
        if (err) {
            console.error('Error reading stores:', err.message);
        } else {
            console.log('Found', rows.length, 'stores');
            rows.forEach(row => console.log(row));
        }
        console.log('');

        // Check settings table
        console.log('=== SETTINGS ===');
        db.all('SELECT * FROM settings', [], (err, rows) => {
            if (err) {
                console.error('Error reading settings:', err.message);
            } else {
                console.log('Found', rows.length, 'settings');
                rows.forEach(row => console.log(`  ${row.setting_key}: ${row.setting_value}`));
            }
            console.log('');

            // Check network_settings table
            console.log('=== NETWORK SETTINGS ===');
            db.all('SELECT * FROM network_settings', [], (err, rows) => {
                if (err) {
                    console.error('Error reading network_settings:', err.message);
                } else {
                    console.log('Found', rows.length, 'network settings');
                    rows.forEach(row => console.log(row));
                }

                db.close();
            });
        });
    });
});
