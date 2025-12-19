const { app, BrowserWindow } = require('electron');
app.whenReady().then(() => {
    console.log('Electron is ready');
    app.quit();
});
