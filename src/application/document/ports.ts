import type { BoardState } from "../../domain/board/types";

export interface DocumentRepository {
  load(path: string): Promise<BoardState>;
  save(path: string, state: BoardState): Promise<void>;
}
