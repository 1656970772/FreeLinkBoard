import { contextBridge, ipcRenderer } from "electron";
import type {
  ElectronFileApi,
  OpenFlbDialogResult,
  RecentFile,
  SaveDocumentRequest,
  SaveFlbAsResult
} from "../shared/electronApi";
import type { BoardState } from "../domain/board/types";

const invoke = <T>(channel: string, ...args: unknown[]): Promise<T> =>
  ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: ElectronFileApi = {
  platform: process.platform,
  openFlbDialog: () => invoke<OpenFlbDialogResult>("flb:open-dialog"),
  saveFlb: (request: SaveDocumentRequest) => invoke<void>("flb:save", request),
  saveFlbAs: (state: BoardState) => invoke<SaveFlbAsResult>("flb:save-as", state),
  loadFlb: (path: string) => invoke<BoardState>("flb:load", path),
  listRecentFiles: () => invoke<RecentFile[]>("recent:list"),
  removeRecentFile: (path: string) => invoke<RecentFile[]>("recent:remove", path)
};

contextBridge.exposeInMainWorld("freeLinkBoard", api);
