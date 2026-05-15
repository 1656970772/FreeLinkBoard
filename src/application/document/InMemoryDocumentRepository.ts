import type { BoardState } from "../../domain/board/types";
import type { DocumentRepository } from "./ports";

export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, BoardState>();

  async load(path: string): Promise<BoardState> {
    const state = this.documents.get(path);
    if (!state) {
      throw new Error(`Document not found: ${path}`);
    }

    return structuredClone(state);
  }

  async save(path: string, state: BoardState): Promise<void> {
    this.documents.set(path, structuredClone(state));
  }
}
