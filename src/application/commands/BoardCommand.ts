import type { BoardState } from "../../domain/board/types";

export interface BoardCommand {
  readonly name: string;
  execute(state: BoardState): BoardState;
  undo(state: BoardState): BoardState;
}
