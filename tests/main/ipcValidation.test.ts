import { describe, expect, it } from "vitest";
import { createEmptyBoardState } from "../../src/domain/board/defaults";
import { assertBoardState, assertFlbPath, assertSaveDocumentRequest, normalizeFlbSavePath } from "../../src/main/ipcValidation";

describe("ipc validation", () => {
  it("accepts .flb paths and rejects non-FreeLinkBoard paths", () => {
    expect(() => assertFlbPath("F:\\Boards\\systems.flb")).not.toThrow();
    expect(() => assertFlbPath("F:\\Boards\\systems.txt")).toThrow("Expected a .flb file path");
  });

  it("adds a .flb extension to save paths without one", () => {
    expect(normalizeFlbSavePath("F:\\Boards\\systems")).toBe("F:\\Boards\\systems.flb");
    expect(normalizeFlbSavePath("F:\\Boards\\systems.flb")).toBe("F:\\Boards\\systems.flb");
    expect(() => normalizeFlbSavePath("F:\\Boards\\systems.txt")).toThrow("Expected a .flb file path");
  });

  it("accepts a save request with a board state and rejects malformed payloads", () => {
    const request = {
      path: "F:\\Boards\\systems.flb",
      state: createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z")
    };

    expect(assertSaveDocumentRequest(request)).toEqual(request);
    expect(() => assertSaveDocumentRequest({ path: "F:\\Boards\\systems.flb" })).toThrow(
      "Invalid save request payload"
    );
  });

  it("validates board states for save-as payloads", () => {
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");

    expect(assertBoardState(board)).toBe(board);
    expect(() => assertBoardState({ title: "missing fields" })).toThrow("Invalid board state payload");
  });
});
