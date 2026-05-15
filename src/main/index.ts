import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import { loadFlbFromPath, openFlbPathDialog, saveFlbToPath } from "./fileSystem";
import { assertFlbPath, assertSaveDocumentRequest } from "./ipcValidation";
import { listRecentFiles, removeRecentFile, touchRecentFile } from "./recentFiles";

function registerIpcHandlers(): void {
  ipcMain.handle("flb:open-dialog", async () => {
    const path = await openFlbPathDialog();
    if (!path) return { canceled: true as const };

    const flbPath = assertFlbPath(path);
    const state = await loadFlbFromPath(flbPath);
    await touchRecentFile({ path, title: state.title, openedAt: new Date().toISOString() });
    return { canceled: false as const, path: flbPath, state };
  });

  ipcMain.handle("flb:load", async (_event, path: unknown) => {
    const flbPath = assertFlbPath(path);
    const state = await loadFlbFromPath(flbPath);
    await touchRecentFile({ path: flbPath, title: state.title, openedAt: new Date().toISOString() });
    return state;
  });

  ipcMain.handle("flb:save", async (_event, payload: unknown) => {
    const request = assertSaveDocumentRequest(payload);
    await saveFlbToPath(request.path, request.state);
    await touchRecentFile({
      path: request.path,
      title: request.state.title,
      openedAt: new Date().toISOString()
    });
  });

  ipcMain.handle("recent:list", () => listRecentFiles());
  ipcMain.handle("recent:remove", (_event, path: unknown) => removeRecentFile(assertFlbPath(path)));
}

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#fffdf8",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

registerIpcHandlers();

void app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
