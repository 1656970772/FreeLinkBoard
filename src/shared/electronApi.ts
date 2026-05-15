import type { BoardState } from "../domain/board/types";

export type RecentFile = {
  path: string;
  title: string;
  openedAt: string;
};

export type SaveDocumentRequest = {
  path: string;
  state: BoardState;
};

export type OpenFlbDialogResult =
  | { canceled: true }
  | { canceled: false; path: string; state: BoardState };

export type SaveFlbAsResult = { canceled: true } | { canceled: false; path: string };

export type ElectronFileApi = {
  platform: NodeJS.Platform;
  openFlbDialog(): Promise<OpenFlbDialogResult>;
  saveFlb(request: SaveDocumentRequest): Promise<void>;
  saveFlbAs(state: BoardState): Promise<SaveFlbAsResult>;
  loadFlb(path: string): Promise<BoardState>;
  listRecentFiles(): Promise<RecentFile[]>;
  removeRecentFile(path: string): Promise<RecentFile[]>;
};

declare global {
  interface Window {
    freeLinkBoard?: ElectronFileApi;
  }
}
