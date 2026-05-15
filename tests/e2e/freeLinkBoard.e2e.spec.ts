import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test.describe("FreeLinkBoard Electron smoke", () => {
  let electronApp: ElectronApplication | null = null;
  let userDataDir: string | null = null;

  test.afterEach(async () => {
    if (electronApp) {
      const closePromise = electronApp.waitForEvent("close", { timeout: 10000 });
      await electronApp.evaluate(({ app }) => app.exit(0));
      await closePromise;
      electronApp = null;
    }

    if (userDataDir) {
      await removeDirectoryWithRetries(userDataDir);
      userDataDir = null;
    }
  });

  test("launches with isolated user data, creates a board, and searches a text node", async () => {
    userDataDir = await mkdtemp(join(tmpdir(), "freelinkboard-e2e-"));
    electronApp = await electron.launch({
      args: [resolve("out/main/index.js")],
      cwd: process.cwd(),
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        FREELINKBOARD_USER_DATA_DIR: userDataDir,
        NODE_ENV: "test"
      },
      executablePath: resolve("node_modules/electron/dist", electronExecutableName())
    });

    const page = await electronApp.firstWindow();
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByRole("heading", { name: "Recent whiteboards" })).toBeVisible();
    await expect(page.getByText("No recent whiteboards yet.")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => Boolean(window.freeLinkBoard)))
      .toBe(true);
    await expect(await electronApp.evaluate(({ app }) => app.getPath("userData"))).toBe(userDataDir);

    await page.getByRole("button", { name: "New board" }).click();
    await expect(page.getByText("Unsaved board")).toBeVisible();
    await expect(page.getByTestId("board-canvas")).toBeVisible();

    await page.getByTestId("board-canvas").dblclick({ position: { x: 240, y: 220 } });
    await page.getByRole("textbox", { name: "Node text" }).fill("E2E alpha note");
    await page.keyboard.press("Escape");

    await page.keyboard.press("Control+F");
    await page.getByRole("searchbox", { name: "Search current board" }).fill("alpha");

    await expect(page.getByText("1 / 1")).toBeVisible();
    await expect(page.locator('[data-search-highlight="active"]')).toContainText("E2E alpha note");
  });
});

function electronExecutableName(): string {
  if (process.platform === "win32") {
    return "electron.exe";
  }

  if (process.platform === "darwin") {
    return "Electron.app/Contents/MacOS/Electron";
  }

  return "electron";
}

async function removeDirectoryWithRetries(path: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(path, { force: true, recursive: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    }
  }

  throw lastError;
}
