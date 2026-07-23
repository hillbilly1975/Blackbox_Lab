// ======================================================
// BLACKBOX LAB — PRELOAD
// ======================================================
//
// Exposes a minimal, safe bridge to the renderer:
// reading the bundled sample flights (so "Try a sample"
// works with one click, no file dialog).
//
// ======================================================

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("blackboxLab", {
  readSampleLog: (name) => ipcRenderer.invoke("read-sample-log", name),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  listSampleLogs: () => ipcRenderer.invoke("list-sample-logs")
});
