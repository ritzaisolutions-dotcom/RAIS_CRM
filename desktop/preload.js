const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("raisDesktop", {
  newTab: () => ipcRenderer.invoke("rais:new-tab"),
});
