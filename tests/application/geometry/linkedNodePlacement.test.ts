import { describe, expect, it } from "vitest";
import { findLinkedNodePosition } from "../../../src/application/geometry/linkedNodePlacement";
import { defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardNode } from "../../../src/domain/board/types";

function createNode(id: string, x: number, y: number): BoardNode {
  return {
    id,
    type: "text",
    position: { x, y },
    size: defaultBoardSettings.textNodeSize,
    sizing: "fixed",
    text: id,
    style: defaultBoardSettings.textNodeStyle
  };
}

describe("linked node placement", () => {
  it("places the linked node to the right of the source by default", () => {
    const source = createNode("source", 100, 120);

    expect(findLinkedNodePosition(source, { source })).toEqual({ x: 320, y: 120 });
  });

  it("moves downward when the preferred right slot intersects another node", () => {
    const source = createNode("source", 100, 120);
    const blocker = createNode("blocker", 310, 110);

    expect(findLinkedNodePosition(source, { source, blocker })).toEqual({ x: 320, y: 208 });
  });
});
