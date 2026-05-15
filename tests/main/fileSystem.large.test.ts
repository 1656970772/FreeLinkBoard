import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardFixture } from "../../src/application/fixtures/createBoardFixture";
import { createTemporaryFlbSavePath, loadFlbFromPath, saveFlbToPath } from "../../src/main/fileSystem";

vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn()
  }
}));

const tempRoots: string[] = [];

describe("large .flb file system persistence", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempRoots.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  });

  it("round-trips a 5,000 node and 8,000 edge board", async () => {
    const tempRoot = await createTempRoot();
    const targetPath = join(tempRoot, "large-board.flb");
    const board = createBoardFixture({ nodeCount: 5000, edgeCount: 8000 });

    await saveFlbToPath(targetPath, board);
    const loaded = await loadFlbFromPath(targetPath);

    expect(Object.keys(loaded.nodes)).toHaveLength(5000);
    expect(Object.keys(loaded.edges)).toHaveLength(8000);
    expect(loaded).toEqual(board);
  });

  it("removes the temporary file when the final rename fails", async () => {
    const tempRoot = await createTempRoot();
    const targetPath = join(tempRoot, "blocked-target.flb");
    await mkdir(targetPath);

    await expect(saveFlbToPath(targetPath, createBoardFixture({ nodeCount: 25, edgeCount: 40 }))).rejects.toThrow();

    expect((await readdir(tempRoot)).sort()).toEqual(["blocked-target.flb"]);
    expect(existsSync(targetPath)).toBe(true);
  });

  it("uses unique temporary paths for same-millisecond saves to the same target", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890);
    const targetPath = join("F:\\Boards", "parallel.flb");

    const firstTemporaryPath = createTemporaryFlbSavePath(targetPath);
    const secondTemporaryPath = createTemporaryFlbSavePath(targetPath);

    expect(firstTemporaryPath).not.toBe(secondTemporaryPath);
    expect(dirname(firstTemporaryPath)).toBe(dirname(targetPath));
    expect(dirname(secondTemporaryPath)).toBe(dirname(targetPath));
    expect(basename(firstTemporaryPath)).toMatch(/^\.freelinkboard-\d+-1234567890-[0-9a-f-]{36}\.tmp$/u);
    expect(basename(secondTemporaryPath)).toMatch(/^\.freelinkboard-\d+-1234567890-[0-9a-f-]{36}\.tmp$/u);
  });

  it("keeps temporary filenames short for long target filenames", () => {
    const targetFileName = `${"a".repeat(240)}.flb`;
    const targetPath = join("F:\\Boards", targetFileName);

    const temporaryPath = createTemporaryFlbSavePath(targetPath);

    expect(dirname(temporaryPath)).toBe(dirname(targetPath));
    expect(basename(temporaryPath)).not.toContain(targetFileName);
    expect(basename(temporaryPath).length).toBeLessThanOrEqual(128);
    expect(temporaryPath.endsWith(".tmp")).toBe(true);
  });
});

async function createTempRoot(): Promise<string> {
  const tempRoot = await mkdtemp(join(tmpdir(), "freelinkboard-large-flb-"));
  tempRoots.push(tempRoot);
  return tempRoot;
}
