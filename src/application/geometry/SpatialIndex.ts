import { boundsIntersect, type Bounds } from "./bounds";

type CellRange = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export class SpatialIndex {
  private readonly boundsById = new Map<string, Bounds>();
  private readonly cellsById = new Map<string, string[]>();
  private readonly idsByCell = new Map<string, Set<string>>();

  constructor(private readonly cellSize = 512) {}

  upsert(id: string, bounds: Bounds): void {
    this.remove(id);

    const cells = this.cellKeysForBounds(bounds);
    this.boundsById.set(id, bounds);
    this.cellsById.set(id, cells);

    for (const cellKey of cells) {
      let ids = this.idsByCell.get(cellKey);
      if (!ids) {
        ids = new Set<string>();
        this.idsByCell.set(cellKey, ids);
      }
      ids.add(id);
    }
  }

  remove(id: string): void {
    const cells = this.cellsById.get(id);
    if (!cells) {
      return;
    }

    for (const cellKey of cells) {
      const ids = this.idsByCell.get(cellKey);
      ids?.delete(id);
      if (ids?.size === 0) {
        this.idsByCell.delete(cellKey);
      }
    }

    this.cellsById.delete(id);
    this.boundsById.delete(id);
  }

  query(bounds: Bounds): string[] {
    const candidates = new Set<string>();

    for (const cellKey of this.cellKeysForBounds(bounds)) {
      const ids = this.idsByCell.get(cellKey);
      if (!ids) {
        continue;
      }
      for (const id of ids) {
        candidates.add(id);
      }
    }

    return [...candidates]
      .filter((id) => {
        const indexedBounds = this.boundsById.get(id);
        return indexedBounds ? boundsIntersect(indexedBounds, bounds) : false;
      })
      .sort();
  }

  private cellKeysForBounds(bounds: Bounds): string[] {
    const range = this.cellRangeForBounds(bounds);
    const keys: string[] = [];

    for (let x = range.minX; x <= range.maxX; x += 1) {
      for (let y = range.minY; y <= range.maxY; y += 1) {
        keys.push(`${x}:${y}`);
      }
    }

    return keys;
  }

  private cellRangeForBounds(bounds: Bounds): CellRange {
    return {
      minX: Math.floor(bounds.x / this.cellSize),
      maxX: Math.floor((bounds.x + bounds.width) / this.cellSize),
      minY: Math.floor(bounds.y / this.cellSize),
      maxY: Math.floor((bounds.y + bounds.height) / this.cellSize)
    };
  }
}
