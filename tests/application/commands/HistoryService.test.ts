import { describe, expect, it } from "vitest";
import type { BoardCommand } from "../../../src/application/commands/BoardCommand";
import { HistoryService } from "../../../src/application/commands/HistoryService";
import { createEmptyBoardState } from "../../../src/domain/board/defaults";
import type { BoardState } from "../../../src/domain/board/types";

class RenameBoardCommand implements BoardCommand {
  readonly name = "rename-board";

  constructor(private readonly nextTitle: string, private previousTitle = "") {}

  execute(state: BoardState): BoardState {
    this.previousTitle = state.title;
    return { ...state, title: this.nextTitle };
  }

  undo(state: BoardState): BoardState {
    return { ...state, title: this.previousTitle };
  }
}

describe("HistoryService", () => {
  it("runs commands and supports undo and redo", () => {
    const history = new HistoryService(createEmptyBoardState("board-1"));

    const renamed = history.run(new RenameBoardCommand("Systems"));
    expect(renamed.title).toBe("Systems");

    const undone = history.undo();
    expect(undone.title).toBe("Untitled Board");

    const redone = history.redo();
    expect(redone.title).toBe("Systems");
  });

  it("clears redo stack after a new command", () => {
    const history = new HistoryService(createEmptyBoardState("board-1"));

    history.run(new RenameBoardCommand("A"));
    history.undo();
    history.run(new RenameBoardCommand("B"));

    expect(history.redo().title).toBe("B");
  });
});
