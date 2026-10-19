/**
 * RAIS CRM desktop shell — same idea as Close's Electron wrapper:
 * open your own CRM URL in a window with tabs; each tab keeps its session.
 */
const { app, BrowserWindow, BrowserView, Menu, ipcMain } = require("electron");
const path = require("node:path");

const CRM_URL =
  process.env.RAIS_CRM_URL?.trim() || "http://localhost:3000/liste";

/** @type {{ win: Electron.BrowserWindow, tabs: { view: Electron.BrowserView, title: string }[], active: number } | null} */
let state = null;

function layout() {
  if (!state) return;
  const { win, tabs, active } = state;
  const [width, height] = win.getContentSize();
  const tabBar = 40;
  const tab = tabs[active];
  if (!tab) return;
  tab.view.setBounds({
    x: 0,
    y: tabBar,
    width,
    height: Math.max(0, height - tabBar),
  });
  win.setBrowserView(tab.view);
}

function addTab(url = CRM_URL) {
  if (!state) return;
  const view = new BrowserView({
    webPreferences: {
      partition: `persist:rais-tab-${Date.now()}`,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  view.webContents.loadURL(url);
  view.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    addTab(openUrl);
    return { action: "deny" };
  });
  state.tabs.push({ view, title: "RAIS CRM" });
  state.active = state.tabs.length - 1;
  layout();
  rebuildMenu();
}

function rebuildMenu() {
  if (!state) return;
  const tabItems = state.tabs.map((tab, index) => ({
    label: `Tab ${index + 1}`,
    type: "radio",
    checked: index === state.active,
    click: () => {
      if (!state) return;
      state.active = index;
      layout();
      rebuildMenu();
    },
  }));

  const template = [
    {
      label: "Datei",
      submenu: [
        {
          label: "Neuer Tab",
          accelerator: "CmdOrCtrl+T",
          click: () => addTab(),
        },
        {
          label: "Tab schließen",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            if (!state || state.tabs.length <= 1) return;
            const [removed] = state.tabs.splice(state.active, 1);
            removed.view.webContents.close();
            state.active = Math.max(0, state.active - 1);
            layout();
            rebuildMenu();
          },
        },
        { type: "separator" },
        { role: "quit", label: "Beenden" },
      ],
    },
    {
      label: "Tabs",
      submenu: tabItems,
    },
    {
      label: "Ansicht",
      submenu: [
        { role: "reload", label: "Neu laden" },
        { role: "toggleDevTools", label: "Entwicklertools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 576,
    title: "RAIS CRM",
    backgroundColor: "#f5f2ec",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Lightweight chrome for tab bar labels
  win.loadFile(path.join(__dirname, "chrome.html"));
  state = { win, tabs: [], active: 0 };
  addTab(CRM_URL);
  win.on("resize", layout);
  rebuildMenu();
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("rais:new-tab", () => {
  addTab();
});
