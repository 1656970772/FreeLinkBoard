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

  it("tries vertical offsets at the preferred x before moving horizontally", () => {
    const source = createNode("source", 100, 120);
    const blocker = createNode("blocker", 310, 110);

    expect(findLinkedNodePosition(source, { source, blocker })).toEqual({ x: 320, y: 208 });
  });

  it("falls back farther down after the preferred vertical column is occupied", () => {
    const source = createNode("source", 100, 120);
    const blockers = Object.fromEntries(
      Array.from({ length: 16 }, (_, index) => {
        const verticalOffset = index === 0 ? 0 : Math.ceil(index / 2) * 88 * (index % 2 === 1 ? 1 : -1);
        const node = createNode(`blocker_${index}`, 320, 120 + verticalOffset);
        return [node.id, node];
      })
    );

    expect(findLinkedNodePosition(source, { source, ...blockers })).toEqual({ x: 320, y: 1528 });
  });
});
