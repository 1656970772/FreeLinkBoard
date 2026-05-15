import type { DocumentRepository } from "../../application/document/ports";
import type { BoardState } from "../../domain/board/types";
import type { ElectronFileApi } from "../../shared/electronApi";

export class ElectronDocumentRepository implements DocumentRepository {
  constructor(private readonly api: Pick<ElectronFileApi, "loadFlb" | "saveFlb">) {}

  load(path: string): Promise<BoardState> {
    return this.api.loadFlb(path);
  }

  save(path: string, state: BoardState): Promise<void> {
    return this.api.saveFlb({ path, state });
  }
}
