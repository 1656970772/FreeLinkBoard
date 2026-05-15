import { describe, expect, it } from "vitest";
import { parseFlbDocument, serializeFlbDocument } from "../../../src/application/document/flbCodec";
import { createEmptyBoardState } from "../../../src/domain/board/defaults";

describe("flb codec", () => {
  const validDocument = {
    version: 1,
    id: "board-1",
    title: "Game Systems",
    createdAt: "2026-05-15T01:00:00.000Z",
    updatedAt: "2026-05-15T02:00:00.000Z",
    viewport: { x: 12, y: 34, zoom: 1.25 },
    nodes: [
      {
        id: "node_1",
        type: "text",
        x: 120,
        y: 180,
        width: 160,
        height: 56,
        sizing: "auto",
        text: "Backpack",
        style: {
          borderColor: "#24221f",
          backgroundColor: "#fffdf8",
          textColor: "#24221f"
        }
      }
    ],
    edges: []
  } as const;

  it("parses version 1 JSON DTO into domain state", () => {
    const state = parseFlbDocument(validDocument);

    expect(state.nodes.node_1?.position).toEqual({ x: 120, y: 180 });
    expect(state.nodes.node_1?.size).toEqual({ width: 160, height: 56 });
    expect(state.title).toBe("Game Systems");
  });

  it("serializes domain state into stable version 1 DTO", () => {
    const dto = serializeFlbDocument(createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z"));

    expect(dto).toEqual({
      version: 1,
      id: "board-1",
      title: "Untitled Board",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: []
    });
  });

  it("round-trips fixed-size text node dimensions and sizing", () => {
    const board = {
      ...createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z"),
      nodes: {
        node_fixed: {
          id: "node_fixed",
          type: "text" as const,
          position: { x: 40, y: 80 },
          size: { width: 240, height: 96 },
          sizing: "fixed" as const,
          text: "Fixed box",
          style: {
            borderColor: "#24221f",
            backgroundColor: "#fffdf8",
            textColor: "#24221f"
          }
        }
      }
    };

    const dto = serializeFlbDocument(board);
    const parsed = parseFlbDocument(dto);

    expect(dto.nodes[0]).toMatchObject({
      id: "node_fixed",
      width: 240,
      height: 96,
      sizing: "fixed"
    });
    expect(parsed.nodes.node_fixed?.size).toEqual({ width: 240, height: 96 });
    expect(parsed.nodes.node_fixed?.sizing).toBe("fixed");
  });

  it("throws a readable error for unsupported versions", () => {
    expect(() => parseFlbDocument({ version: 99 })).toThrow("Unsupported .flb version: 99");
  });

  it("rejects duplicate node and edge ids before mapping into records", () => {
    expect(() =>
      parseFlbDocument({
        ...validDocument,
        nodes: [...validDocument.nodes, { ...validDocument.nodes[0] }]
      })
    ).toThrow("Duplicate node id: node_1");

    expect(() =>
      parseFlbDocument({
        ...validDocument,
        edges: [
          {
            id: "edge_1",
            from: { type: "node", id: "node_1" },
            to: { type: "point", x: 300, y: 200 },
            pathType: "bezier",
            arrow: "end",
            stroke: { color: "#2f6f6a", width: 2, dash: "solid" },
            fixedPoints: []
          },
          {
            id: "edge_1",
            from: { type: "node", id: "node_1" },
            to: { type: "point", x: 360, y: 260 },
            pathType: "bezier",
            arrow: "end",
            stroke: { color: "#2f6f6a", width: 2, dash: "solid" },
            fixedPoints: []
          }
        ]
      })
    ).toThrow("Duplicate edge id: edge_1");
  });

  it("rejects edges that reference missing nodes", () => {
    expect(() =>
      parseFlbDocument({
        ...validDocument,
        edges: [
          {
            id: "edge_1",
            from: { type: "node", id: "node_missing" },
            to: { type: "node", id: "node_1" },
            pathType: "bezier",
            arrow: "end",
            stroke: { color: "#2f6f6a", width: 2, dash: "solid" },
            fixedPoints: []
          }
        ]
      })
    ).toThrow("Edge edge_1 references missing node: node_missing");
  });
});
