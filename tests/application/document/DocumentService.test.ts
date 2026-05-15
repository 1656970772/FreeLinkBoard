import { describe, expect, it } from "vitest";
import { DocumentService } from "../../../src/application/document/DocumentService";
import { InMemoryDocumentRepository } from "../../../src/application/document/InMemoryDocumentRepository";
import { createEmptyBoardState } from "../../../src/domain/board/defaults";

describe("DocumentService", () => {
  it("saves and loads a board through the repository port", async () => {
    const repository = new InMemoryDocumentRepository();
    const service = new DocumentService(repository);
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");

    await service.save("memory://board.flb", board);
    const loaded = await service.load("memory://board.flb");

    expect(loaded).toEqual(board);
  });

  it("reports missing files through a readable error", async () => {
    const service = new DocumentService(new InMemoryDocumentRepository());

    await expect(service.load("memory://missing.flb")).rejects.toThrow(
      "Document not found: memory://missing.flb"
    );
  });
});
