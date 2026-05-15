import type { BoardState } from "../../domain/board/types";
import type { DocumentRepository } from "./ports";

export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  load(path: string): Promise<BoardState> {
    return this.repository.load(path);
  }

  save(path: string, state: BoardState): Promise<void> {
    return this.repository.save(path, state);
  }
}
