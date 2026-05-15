import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, normalize } from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePreloadPath } from "../../src/main/windowPaths";

describe("window path helpers", () => {
  it("points BrowserWindow at the bundled preload module", async () => {
    const fixtureRoot = await createPreloadFixture("bundled");

    try {
      const preloadPath = resolvePreloadPath(join(fixtureRoot, "out/main"), fixtureRoot);

      expect(basename(preloadPath)).toBe("index.mjs");
      expect(normalize(dirname(preloadPath))).toBe(normalize(join(fixtureRoot, "out/preload")));
      expect(existsSync(preloadPath)).toBe(true);
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("falls back to the dev preload output when main is not running from out/main", async () => {
    const fixtureRoot = await createPreloadFixture("dev");
    const sourceMainDir = join(fixtureRoot, "src/main");
    await mkdir(sourceMainDir, { recursive: true });

    try {
      const preloadPath = resolvePreloadPath(sourceMainDir, fixtureRoot);

      expect(normalize(preloadPath)).toBe(normalize(join(fixtureRoot, "out/preload/index.mjs")));
      expect(existsSync(preloadPath)).toBe(true);
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("returns the bundled path when no preload file exists yet", async () => {
    const fixtureRoot = await mkdtemp(join(tmpdir(), "freelinkboard-window-paths-"));

    try {
      const mainDir = join(fixtureRoot, "out/main");

      expect(normalize(resolvePreloadPath(mainDir, fixtureRoot))).toBe(
        normalize(join(fixtureRoot, "out/preload/index.mjs"))
      );
    } finally {
      await rm(fixtureRoot, { force: true, recursive: true });
    }
  });
});

async function createPreloadFixture(label: string): Promise<string> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), `freelinkboard-${label}-`));
  const preloadPath = join(fixtureRoot, "out/preload/index.mjs");

  await mkdir(dirname(preloadPath), { recursive: true });
  await mkdir(join(fixtureRoot, "out/main"), { recursive: true });
  await writeFile(preloadPath, "contextBridge.exposeInMainWorld('freeLinkBoard', {});\n", "utf8");

  return fixtureRoot;
}
