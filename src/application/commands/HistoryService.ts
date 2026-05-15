import type { BoardState } from "../../domain/board/types";
import type { BoardCommand } from "./BoardCommand";

export class HistoryService {
  private state: BoardState;
  private readonly undoStack: BoardCommand[] = [];
  private readonly redoStack: BoardCommand[] = [];

  constructor(initialState: BoardState) {
    this.state = initialState;
  }

  current(): BoardState {
    return this.state;
  }

  replaceCurrent(state: BoardState): void {
    this.state = state;
  }

  run(command: BoardCommand): BoardState {
    const nextState = command.execute(this.state);
    if (nextState === this.state) {
      return this.state;
    }

    this.state = nextState;
    this.undoStack.push(command);
    this.redoStack.length = 0;
    return this.state;
  }

  undo(): BoardState {
    const command = this.undoStack.pop();
    if (!command) {
      return this.state;
    }

    this.state = command.undo(this.state);
    this.redoStack.push(command);
    return this.state;
  }

  redo(): BoardState {
    const command = this.redoStack.pop();
    if (!command) {
      return this.state;
    }

    this.state = command.execute(this.state);
    this.undoStack.push(command);
    return this.state;
  }
}
