import { nanoid } from "nanoid";
import { create } from "zustand";
import type { BoardCommand } from "../../application/commands/BoardCommand";
import { HistoryService } from "../../application/commands/HistoryService";
import { createEmptyBoardState } from "../../domain/board/defaults";
import type { BoardSelection, BoardState } from "../../domain/board/types";
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
  runBoardCommand(command: BoardCommand): void;
  undoBoardCommand(): void;
  redoBoardCommand(): void;
  selectNodes(nodeIds: string[]): void;
  selectEdges(edgeIds: string[]): void;
  selectBoardItems(selection: BoardSelection): void;
};

const fileApiUnavailableMessage = "Electron file API is unavailable.";
let boardHistory: HistoryService | null = null;

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

const resetHistory = (board: BoardState | null): void => {
  boardHistory = board ? new HistoryService(board) : null;
};

const ensureHistory = (board: BoardState): HistoryService => {
  if (!boardHistory || boardHistory.current() !== board) {
    boardHistory = new HistoryService(board);
  }
  return boardHistory;
};

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  currentPath: null,
  currentBoard: null,
  recentFiles: [],
  saveStatus: "unsaved",
  fileError: null,

  createNewBoard() {
    const board = createEmptyBoardState(`board_${nanoid()}`, new Date().toISOString());
    resetHistory(board);
    set({
      currentPath: null,
      currentBoard: board,
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
      resetHistory(board);
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

      resetHistory(result.state);
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
  },

  runBoardCommand(command: BoardCommand) {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;

    const nextBoard = ensureHistory(currentBoard).run(command);
    if (nextBoard === currentBoard) {
      return;
    }

    set({ currentBoard: nextBoard, saveStatus: "dirty", fileError: null });
  },

  undoBoardCommand() {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;

    const nextBoard = ensureHistory(currentBoard).undo();
    if (nextBoard !== currentBoard) {
      set({ currentBoard: nextBoard, saveStatus: "dirty", fileError: null });
    }
  },

  redoBoardCommand() {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;

    const nextBoard = ensureHistory(currentBoard).redo();
    if (nextBoard !== currentBoard) {
      set({ currentBoard: nextBoard, saveStatus: "dirty", fileError: null });
    }
  },

  selectNodes(nodeIds: string[]) {
    get().selectBoardItems({ nodeIds, edgeIds: [] });
  },

  selectEdges(edgeIds: string[]) {
    get().selectBoardItems({ nodeIds: [], edgeIds });
  },

  selectBoardItems(selection: BoardSelection) {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;

    const nextBoard = {
      ...currentBoard,
      selection: {
        nodeIds: [...selection.nodeIds],
        edgeIds: [...selection.edgeIds]
      }
    };
    ensureHistory(currentBoard).replaceCurrent(nextBoard);
    set({ currentBoard: nextBoard });
  }
}));
