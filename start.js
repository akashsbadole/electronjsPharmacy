// Set environment variable to bypass electron-is-dev check
process.env.ELECTRON_IS_DEV = 1;

const setupEvents = require("./installers/setupEvents");
if (setupEvents.handleSquirrelEvent()) {
    return;
}
const { app, BrowserWindow, ipcMain, screen} = require("electron");

// Set up environment variables after app is ready
const pkg = require("./package.json");
process.env.APPNAME = pkg.name;
const path = require("path");
let Menu, template, menuController, isPackaged, mainWindow;

//stop app from launching multiple times during these squirrel spawning events
if (require('electron-squirrel-startup')) app.quit();

function createWindow() {

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        frame: true,
        webPreferences: {
            nodeIntegration: true,
            enableRemoteModule: false,
            contextIsolation: false,
        },
    });
    menuController.initializeMainWindow(mainWindow);
    mainWindow.maximize();
    mainWindow.show();

    mainWindow.loadURL(`file://${path.join(__dirname, "index.html")}`);

    mainWindow.on("closed", () => {
        mainWindow = null;
    });
    
}

app.whenReady().then(() => {
    // Set up environment variables after app is ready
    process.env.APPDATA = app.getPath('appData');
    isPackaged = app.isPackaged;
    
    // Now require server after environment is set up
    const server = require('./server');
    
    // Initialize menu and menu controller after app is ready
    ({ Menu, template } = require("./assets/js/native_menu/menu"));
    menuController = require('./assets/js/native_menu/menuController.js');
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    
    // Initialize remote module after app is ready
    require("@electron/remote/main").initialize();
    require("electron-store").initRenderer();
    
    // Set up browser window event handler
    app.on("browser-window-created", (_, window) => {
        require("@electron/remote/main").enable(window.webContents);
    });
    
    createWindow();
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("activate", () => {
    if (mainWindow === null) {
        createWindow();
    }
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
});

ipcMain.on("app-quit", (evt, arg) => {
    app.quit();
});

ipcMain.on("app-reload", (event, arg) => {
    mainWindow.reload();
});

ipcMain.on("restart-app", () => {
    autoUpdater.quitAndInstall();
});

//Context menu
app.whenReady().then(() => {
    const contextMenu = require("electron-context-menu");
    contextMenu({
        prepend: (params, browserWindow) => [
            {
                label: "Refresh",
                click() {
                    mainWindow.reload();
                },
            },
        ],
    });
});

//Live reload during development
if (!isPackaged) {
    app.whenReady().then(() => {
        try {
            require("electron-reloader")(module);
        } catch (_) {}
    });
}


