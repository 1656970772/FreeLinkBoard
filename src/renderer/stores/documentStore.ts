import { nanoid } from "nanoid";
import { create } from "zustand";
import type { BoardCommand } from "../../application/commands/BoardCommand";
import { DeleteBoardItemsCommand, PasteBoardItemsCommand } from "../../application/commands/boardInteractionCommands";
import { HistoryService } from "../../application/commands/HistoryService";
import { createEmptyBoardState } from "../../domain/board/defaults";
import type { BoardEdge, BoardNode, BoardSelection, BoardState, EdgeEndpoint, EdgeId, NodeId } from "../../domain/board/types";
import type { ElectronFileApi, RecentFile } from "../../shared/electronApi";

type SaveStatus = "saved" | "saving" | "dirty" | "unsaved";

type BoardClipboard = {
  nodes: BoardNode[];
  edges: BoardEdge[];
} | null;

type DocumentStore = {
  currentPath: string | null;
  currentBoard: BoardState | null;
  recentFiles: RecentFile[];
  saveStatus: SaveStatus;
  fileError: string | null;
  clipboard: BoardClipboard;
  createNewBoard(): void;
  copySelection(): void;
  deleteSelection(): void;
  loadRecentFiles(): Promise<void>;
  loadBoard(path: string): Promise<void>;
  openBoardDialog(): Promise<void>;
  pasteClipboard(): void;
  removeRecentFile(path: string): Promise<void>;
  saveCurrentBoard(path: string): Promise<void>;
  saveCurrentBoardNow(): Promise<void>;
  runBoardCommand(command: BoardCommand): void;
  undoBoardCommand(): void;
  redoBoardCommand(): void;
  selectNodes(nodeIds: string[]): void;
  selectEdges(edgeIds: string[]): void;
  selectBoardItems(selection: BoardSelection): void;
};

const fileApiUnavailableMessage = "Electron file API is unavailable.";
const autoSaveDelayMs = 700;
let boardHistory: HistoryService | null = null;
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
let namedSaveTail: Promise<void> | null = null;

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

const clearAutoSaveTimer = (): void => {
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
};

const ensureHistory = (board: BoardState): HistoryService => {
  if (!boardHistory || boardHistory.current() !== board) {
    boardHistory = new HistoryService(board);
  }
  return boardHistory;
};

const enqueueNamedSave = (saveTask: () => Promise<void>): Promise<void> => {
  const savePromise = namedSaveTail ? namedSaveTail.catch(() => undefined).then(saveTask) : saveTask();
  const tail = savePromise.catch(() => undefined).finally(() => {
    if (namedSaveTail === tail) {
      namedSaveTail = null;
    }
  });
  namedSaveTail = tail;
  return savePromise;
};

const isCurrentNamedDocumentTarget = (get: () => DocumentStore, path: string, board: BoardState): boolean => {
  const state = get();
  return state.currentBoard?.id === board.id && (state.currentPath === path || state.currentPath === null);
};

const isCurrentUnnamedDocumentTarget = (get: () => DocumentStore, board: BoardState): boolean => {
  const state = get();
  return state.currentBoard?.id === board.id && state.currentPath === null;
};

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  currentPath: null,
  currentBoard: null,
  recentFiles: [],
  saveStatus: "unsaved",
  fileError: null,
  clipboard: null,

  createNewBoard() {
    clearAutoSaveTimer();
    const board = createEmptyBoardState(`board_${nanoid()}`, new Date().toISOString());
    resetHistory(board);
    set({
      currentPath: null,
      currentBoard: board,
      saveStatus: "unsaved",
      fileError: null
    });
  },

  copySelection() {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;

    const selectedNodeIds = new Set(currentBoard.selection.nodeIds);
    const selectedEdgeIds = new Set(currentBoard.selection.edgeIds);
    const nodes = currentBoard.selection.nodeIds
      .map((nodeId) => currentBoard.nodes[nodeId])
      .filter((node): node is BoardNode => Boolean(node))
      .map(cloneNode);
    const edges = Object.values(currentBoard.edges)
      .filter((edge) => selectedEdgeIds.has(edge.id) || isIncidentEdge(edge, selectedNodeIds))
      .map(cloneEdge);

    if (nodes.length === 0 && edges.length === 0) {
      set({ clipboard: null });
      return;
    }

    set({ clipboard: { nodes, edges } });
  },

  deleteSelection() {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;

    get().runBoardCommand(
      new DeleteBoardItemsCommand({
        clock: new Date().toISOString(),
        selection: currentBoard.selection
      })
    );
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
      clearAutoSaveTimer();
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
      clearAutoSaveTimer();
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

  pasteClipboard() {
    const currentBoard = get().currentBoard;
    const clipboard = get().clipboard;
    if (!currentBoard || !clipboard) return;

    const pasted = createPastedItems(clipboard);
    if (pasted.nodes.length === 0 && pasted.edges.length === 0) {
      return;
    }

    get().runBoardCommand(
      new PasteBoardItemsCommand({
        clock: new Date().toISOString(),
        edges: pasted.edges,
        nodes: pasted.nodes,
        selection: pasted.selection
      })
    );
  },

  async removeRecentFile(path: string) {
    const api = getFileApi(set);
    if (!api) return;

    try {
      const recentFiles = await api.removeRecentFile(path);
      set({ recentFiles, fileError: null });
    } catch (error) {
      set({ fileError: getErrorMessage(error) });
    }
  },

  async saveCurrentBoard(path: string) {
    const targetBoard = get().currentBoard;
    if (!targetBoard) return;
    const targetBoardId = targetBoard.id;

    return enqueueNamedSave(async () => {
      const currentBoard = get().currentBoard;
      if (!currentBoard) return;
      if (currentBoard.id !== targetBoardId) return;
      const currentPath = get().currentPath;
      if (currentPath !== path && currentPath !== null) return;
      const api = getFileApi(set);
      if (!api) return;

      clearAutoSaveTimer();
      set({ saveStatus: "saving", fileError: null });
      try {
        await api.saveFlb({ path, state: currentBoard });
        const isSavedBoardStillCurrent = get().currentBoard === currentBoard;
        const isCurrentDocumentStillTarget = isCurrentNamedDocumentTarget(get, path, currentBoard);

        if (isSavedBoardStillCurrent) {
          set({ currentPath: path, saveStatus: "saved", fileError: null });
        } else if (isCurrentDocumentStillTarget) {
          set({ currentPath: path, saveStatus: "dirty", fileError: null });
          scheduleAutoSave(get);
        }

        await get().loadRecentFiles();
      } catch (error) {
        if (isCurrentNamedDocumentTarget(get, path, currentBoard)) {
          set({ saveStatus: "dirty", fileError: getErrorMessage(error) });
        }
      }
    });
  },

  async saveCurrentBoardNow() {
    const currentPath = get().currentPath;
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;
    clearAutoSaveTimer();
    if (currentPath) {
      await get().saveCurrentBoard(currentPath);
      return;
    }

    const api = getFileApi(set);
    if (!api) return;

    const previousSaveStatus = get().saveStatus;
    set({ saveStatus: "saving", fileError: null });
    try {
      const result = await api.saveFlbAs(currentBoard);
      if (result.canceled) {
        set({ saveStatus: previousSaveStatus, fileError: null });
        return;
      }

      const isSavedBoardStillCurrent = get().currentBoard === currentBoard;
      const isCurrentDocumentStillTarget = get().currentPath === null && get().currentBoard?.id === currentBoard.id;
      if (isSavedBoardStillCurrent) {
        set({ currentPath: result.path, saveStatus: "saved", fileError: null });
      } else if (isCurrentDocumentStillTarget) {
        set({ currentPath: result.path, saveStatus: "dirty", fileError: null });
      }

      await get().loadRecentFiles();
      if (!isSavedBoardStillCurrent && isCurrentDocumentStillTarget) {
        scheduleAutoSave(get);
      }
    } catch (error) {
      if (isCurrentUnnamedDocumentTarget(get, currentBoard)) {
        set({ saveStatus: "dirty", fileError: getErrorMessage(error) });
      }
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
    scheduleAutoSave(get);
  },

  undoBoardCommand() {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;

    const nextBoard = ensureHistory(currentBoard).undo();
    if (nextBoard !== currentBoard) {
      set({ currentBoard: nextBoard, saveStatus: "dirty", fileError: null });
      scheduleAutoSave(get);
    }
  },

  redoBoardCommand() {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;

    const nextBoard = ensureHistory(currentBoard).redo();
    if (nextBoard !== currentBoard) {
      set({ currentBoard: nextBoard, saveStatus: "dirty", fileError: null });
      scheduleAutoSave(get);
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

function scheduleAutoSave(get: () => DocumentStore): void {
  clearAutoSaveTimer();
  if (!get().currentPath) {
    return;
  }

  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    void get().saveCurrentBoardNow();
  }, autoSaveDelayMs);
}

function createPastedItems(clipboard: NonNullable<BoardClipboard>): {
  nodes: BoardNode[];
  edges: BoardEdge[];
  selection: BoardSelection;
} {
  const idMap = new Map<NodeId, NodeId>();
  const nodes = clipboard.nodes.map((node) => {
    const nextId = `node_${nanoid()}`;
    idMap.set(node.id, nextId);
    return {
      ...cloneNode(node),
      id: nextId,
      position: {
        x: node.position.x + 32,
        y: node.position.y + 32
      }
    };
  });

  const edges = clipboard.edges.map((edge) => ({
    ...cloneEdge(edge),
    id: `edge_${nanoid()}`,
    from: remapEndpoint(edge.from, idMap),
    to: remapEndpoint(edge.to, idMap)
  }));

  return {
    nodes,
    edges,
    selection: {
      nodeIds: nodes.map((node) => node.id),
      edgeIds: edges.map((edge) => edge.id)
    }
  };
}

function isIncidentEdge(edge: BoardEdge, selectedNodeIds: Set<NodeId>): boolean {
  return endpointReferencesSelectedNode(edge.from, selectedNodeIds) || endpointReferencesSelectedNode(edge.to, selectedNodeIds);
}

function endpointReferencesSelectedNode(endpoint: EdgeEndpoint, selectedNodeIds: Set<NodeId>): boolean {
  return endpoint.type === "node" && selectedNodeIds.has(endpoint.nodeId);
}

function remapEndpoint(endpoint: EdgeEndpoint, idMap: Map<NodeId, NodeId>): EdgeEndpoint {
  if (endpoint.type === "point") {
    return { type: "point", point: { ...endpoint.point, x: endpoint.point.x + 32, y: endpoint.point.y + 32 } };
  }

  return {
    type: "node",
    nodeId: idMap.get(endpoint.nodeId) ?? endpoint.nodeId
  };
}

function cloneNode(node: BoardNode): BoardNode {
  return {
    ...node,
    position: { ...node.position },
    size: { ...node.size },
    style: { ...node.style }
  };
}

function cloneEdge(edge: BoardEdge): BoardEdge {
  return {
    ...edge,
    from: cloneEndpoint(edge.from),
    to: cloneEndpoint(edge.to),
    fixedPoints: edge.fixedPoints.map((point) => ({ ...point })),
    stroke: { ...edge.stroke }
  };
}

function cloneEndpoint(endpoint: EdgeEndpoint): EdgeEndpoint {
  if (endpoint.type === "point") {
    return { type: "point", point: { ...endpoint.point } };
  }

  return { type: "node", nodeId: endpoint.nodeId };
}
