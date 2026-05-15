import { describe, expect, it } from "vitest";
import { SpatialIndex } from "../../../src/application/geometry/SpatialIndex";

describe("SpatialIndex", () => {
  it("returns ids whose bounds intersect a query rectangle", () => {
    const index = new SpatialIndex();
    index.upsert("node-a", { x: 0, y: 0, width: 100, height: 100 });
    index.upsert("node-b", { x: 600, y: 0, width: 100, height: 100 });
    index.upsert("edge-a", { x: 90, y: 90, width: 20, height: 20 });

    expect(index.query({ x: 50, y: 50, width: 50, height: 50 }).sort()).toEqual(["edge-a", "node-a"]);
  });

  it("replaces old bounds when updating an existing id", () => {
    const index = new SpatialIndex(128);
    index.upsert("node-a", { x: 0, y: 0, width: 20, height: 20 });
    index.upsert("node-a", { x: 500, y: 500, width: 20, height: 20 });

    expect(index.query({ x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
    expect(index.query({ x: 480, y: 480, width: 100, height: 100 })).toEqual(["node-a"]);
  });

  it("removes ids from future queries", () => {
    const index = new SpatialIndex();
    index.upsert("node-a", { x: 0, y: 0, width: 100, height: 100 });
    index.remove("node-a");

    expect(index.query({ x: 0, y: 0, width: 100, height: 100 })).toEqual([]);
  });

  it("handles bounds spanning multiple grid cells", () => {
    const index = new SpatialIndex(100);
    index.upsert("wide", { x: 50, y: 50, width: 175, height: 25 });

    expect(index.query({ x: 200, y: 60, width: 10, height: 10 })).toEqual(["wide"]);
  });
});
