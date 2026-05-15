import { nanoid } from "nanoid";
import { create } from "zustand";
import { createEmptyBoardState } from "../../domain/board/defaults";
import type { BoardState } from "../../domain/board/types";
import type { ElectronFileApi, RecentFile } from "../../shared/electronApi";

type SaveStatus = "saved" | "saving" | "dirty" | "unsaved";

type DocumentStore = {
  currentPath: string | null;
  currentBoard: BoardState | null;
  recentFiles: RecentFile[];
  saveStatus: SaveStatus;
  fileError: string | null;
  createNewBoard(): void;
  loadRecentFiles(): Promise<void>;
  loadBoard(path: string): Promise<void>;
  openBoardDialog(): Promise<void>;
  saveCurrentBoard(path: string): Promise<void>;
};

const fileApiUnavailableMessage = "Electron file API is unavailable.";

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

const getFileApi = (set: (state: Partial<DocumentStore>) => void): ElectronFileApi | null => {
  const api = window.freeLinkBoard;
  if (!api) {
    set({ fileError: fileApiUnavailableMessage });
    return null;
  }
  return api;
};

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  currentPath: null,
  currentBoard: null,
  recentFiles: [],
  saveStatus: "unsaved",
  fileError: null,

  createNewBoard() {
    set({
      currentPath: null,
      currentBoard: createEmptyBoardState(`board_${nanoid()}`, new Date().toISOString()),
      saveStatus: "unsaved",
      fileError: null
    });
  },

  async loadRecentFiles() {
    const api = getFileApi(set);
    if (!api) {
      set({ recentFiles: [] });
      return;
    }

    try {
      const recentFiles = await api.listRecentFiles();
      set({ recentFiles, fileError: null });
    } catch (error) {
      set({ fileError: getErrorMessage(error) });
    }
  },

  async loadBoard(path: string) {
    const api = getFileApi(set);
    if (!api) return;

    try {
      const board = await api.loadFlb(path);
      set({
        currentPath: path,
        currentBoard: board,
        saveStatus: "saved",
        fileError: null
      });
      await get().loadRecentFiles();
    } catch (error) {
      set({ fileError: getErrorMessage(error) });
    }
  },

  async openBoardDialog() {
    const api = getFileApi(set);
    if (!api) return;

    try {
      const result = await api.openFlbDialog();
      if (result.canceled) return;

      set({
        currentPath: result.path,
        currentBoard: result.state,
        saveStatus: "saved",
        fileError: null
      });
      await get().loadRecentFiles();
    } catch (error) {
      set({ fileError: getErrorMessage(error) });
    }
  },

  async saveCurrentBoard(path: string) {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;
    const api = getFileApi(set);
    if (!api) return;

    set({ saveStatus: "saving", fileError: null });
    try {
      await api.saveFlb({ path, state: currentBoard });
      set({ currentPath: path, saveStatus: "saved", fileError: null });
      await get().loadRecentFiles();
    } catch (error) {
      set({ saveStatus: "dirty", fileError: getErrorMessage(error) });
    }
  }
}));
