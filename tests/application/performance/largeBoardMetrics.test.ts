import { describe, expect, it } from "vitest";
import { createBoardFixture } from "../../../src/application/fixtures/createBoardFixture";
import { collectLargeBoardMetrics } from "../../../src/application/performance/largeBoardMetrics";

describe("large board metrics", () => {
  it("collects stable counts for the M6 large board fixture", () => {
    const board = createBoardFixture({ nodeCount: 5000, edgeCount: 8000 });

    const metrics = collectLargeBoardMetrics(board, {
      screenSize: { width: 1440, height: 900 },
      viewport: { x: 0, y: 0, zoom: 1 }
    });

    expect(metrics.totalNodes).toBe(5000);
    expect(metrics.totalEdges).toBe(8000);
    expect(metrics.visibleNodes).toBeGreaterThan(0);
    expect(metrics.visibleNodes).toBeLessThan(5000);
    expect(metrics.visibleEdges).toBeGreaterThan(0);
    expect(metrics.visibleEdges).toBeLessThan(8000);
  });

  it("reuses cached edge paths on repeated metric collection", () => {
    const board = createBoardFixture({ nodeCount: 500, edgeCount: 800 });

    const first = collectLargeBoardMetrics(board, {
      screenSize: { width: 1440, height: 900 },
      viewport: { x: 0, y: 0, zoom: 1 }
    });
    const second = collectLargeBoardMetrics(board, {
      screenSize: { width: 1440, height: 900 },
      viewport: { x: 0, y: 0, zoom: 1 },
      cache: first.cache
    });

    expect(second.cacheHits).toBeGreaterThan(0);
    expect(second.cacheMisses).toBe(0);
  });
});
