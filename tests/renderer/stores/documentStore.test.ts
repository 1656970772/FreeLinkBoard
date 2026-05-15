import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptyBoardState } from "../../../src/domain/board/defaults";
import { useDocumentStore } from "../../../src/renderer/stores/documentStore";
import type { ElectronFileApi } from "../../../src/shared/electronApi";

const resetStore = (): void => {
  useDocumentStore.setState({
    currentPath: null,
    currentBoard: null,
    recentFiles: [],
    saveStatus: "unsaved",
    fileError: null
  });
};

describe("documentStore", () => {
  beforeEach(() => {
    resetStore();
    Reflect.deleteProperty(window, "freeLinkBoard");
  });

  it("treats a missing Electron file API as unavailable without throwing", async () => {
    await expect(useDocumentStore.getState().loadRecentFiles()).resolves.toBeUndefined();

    expect(useDocumentStore.getState().recentFiles).toEqual([]);
    expect(useDocumentStore.getState().fileError).toBe("Electron file API is unavailable.");
  });

  it("loads a recent board through the Electron API", async () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const api = {
      loadFlb: vi.fn<ElectronFileApi["loadFlb"]>().mockResolvedValue(board),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;

    await useDocumentStore.getState().loadBoard("F:\\Boards\\systems.flb");

    expect(api.loadFlb).toHaveBeenCalledWith("F:\\Boards\\systems.flb");
    expect(useDocumentStore.getState().currentPath).toBe("F:\\Boards\\systems.flb");
    expect(useDocumentStore.getState().currentBoard).toEqual(board);
    expect(useDocumentStore.getState().saveStatus).toBe("saved");
  });

  it("restores dirty status when saving fails", async () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
    const api = {
      saveFlb: vi.fn<ElectronFileApi["saveFlb"]>().mockRejectedValue(new Error("disk full")),
      listRecentFiles: vi.fn<ElectronFileApi["listRecentFiles"]>().mockResolvedValue([])
    } as Partial<ElectronFileApi> as ElectronFileApi;
    window.freeLinkBoard = api;
    useDocumentStore.setState({ currentBoard: board, saveStatus: "unsaved" });

    await useDocumentStore.getState().saveCurrentBoard("F:\\Boards\\systems.flb");

    expect(useDocumentStore.getState().saveStatus).toBe("dirty");
    expect(useDocumentStore.getState().fileError).toBe("disk full");
  });
});
