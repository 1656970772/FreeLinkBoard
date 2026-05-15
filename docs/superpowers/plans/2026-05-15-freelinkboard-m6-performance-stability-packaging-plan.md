# FreeLinkBoard M6 性能稳定性与打包实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 M6 的大图性能验收、真实 Electron E2E、Windows 打包与发布门禁，让第一版可以作为本地桌面白板日常使用。

**Architecture:** 先用纯 application/geometry 层建立可重复性能指标，再用 renderer smoke 验证大图裁剪不会退化为全量 DOM，最后补 Electron E2E 与打包脚本。性能测试避免脆弱毫秒断言，优先断言对象规模、裁剪数量、缓存复用和发布命令可复现；真实流畅度保留为手感检查表。

**Tech Stack:** Electron, React, TypeScript, Zustand, Vitest, Testing Library, Electron + Playwright, electron-builder or equivalent Windows packaging.

---

## Scope Check

本计划覆盖设计规格中的 M6：

- 构造 `5,000` 节点、`8,000` 连线测试白板。
- 检查视口裁剪、路径缓存、索引更新、拖动性能和保存大文件体验。
- 跑单元测试、集成测试、端到端测试和性能验收。
- 打包 Windows 桌面版。

本计划不实现云同步、图片/PDF/URL 节点、插件系统、多人协作或 `.flb` 附件包格式。

## File Structure

- Create: `src/application/performance/largeBoardMetrics.ts`
  - 纯函数收集大图规模、视口裁剪和路径缓存指标。
- Create: `tests/application/performance/largeBoardMetrics.test.ts`
  - 验证 `5,000/8,000` fixture 可生成、可索引、可裁剪，并且路径缓存复用。
- Modify: `tests/renderer/board/BoardCanvas.test.tsx`
  - 增加大图渲染 smoke，断言 DOM 只挂载视口内节点。
- Create: `tests/main/fileSystem.large.test.ts`
  - 验证大 `.flb` 保存再读取一致，失败时临时文件清理。
- Create: `tests/e2e/freeLinkBoard.e2e.spec.ts`
  - Electron + Playwright 覆盖核心真实流程。
- Create: `playwright.config.ts`
  - E2E 配置。
- Modify: `package.json`
  - 增加 `perf:large-board`、`test:e2e`、`package:win`、`release:check` 脚本和必要开发依赖。
- Modify: `electron.vite.config.ts` or create packaging config
  - 配置 Windows 打包入口与 files 白名单，避免带入调试产物。
- Create: `docs/release/M6-手感检查表.md`
  - 人工验收清单。
- Create: `Memory/YYYY-MM-DD_HH-mm-ss_M6性能稳定性与打包.md`
  - 记录实现、验证、风险与剩余事项。

## Task 1: Large Board Performance Metrics

**Files:**
- Create: `src/application/performance/largeBoardMetrics.ts`
- Create: `tests/application/performance/largeBoardMetrics.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing metrics tests**

Create `tests/application/performance/largeBoardMetrics.test.ts`:

```ts
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
```

Run:

```powershell
npm.cmd test -- tests/application/performance/largeBoardMetrics.test.ts
```

Expected: FAIL because `largeBoardMetrics` does not exist.

- [ ] **Step 2: Implement `collectLargeBoardMetrics`**

Create a pure helper that:

- Uses `viewportToWorldBounds` to compute visible world bounds.
- Indexes nodes with `SpatialIndex`.
- Builds edge paths with `EdgePathCache`.
- Returns total counts, visible counts, cache hits/misses, and the reusable cache instance.

- [ ] **Step 3: Add a script alias**

Modify `package.json`:

```json
{
  "scripts": {
    "perf:large-board": "vitest run tests/application/performance/largeBoardMetrics.test.ts"
  }
}
```

- [ ] **Step 4: Verify focused tests pass**

Run:

```powershell
npm.cmd run perf:large-board
```

Expected: PASS.

## Task 2: Renderer Large Board Smoke

**Files:**
- Modify: `tests/renderer/board/BoardCanvas.test.tsx`

- [ ] **Step 1: Write failing renderer smoke**

Add a test that renders `createBoardFixture({ nodeCount: 1000, edgeCount: 1600 })` into `BoardCanvas` with `size={{ width: 1440, height: 900 }}` and asserts:

- `board-node-fixture-node-00000` is present.
- A far-away node such as `board-node-fixture-node-09999` is absent when the fixture size supports it, or use `fixture-node-00999` for the 1,000-node smoke.
- DOM node count matching `[data-testid^="board-node-"]` is less than `150`.
- `SpatialIndex.prototype.query` is called.

Run:

```powershell
npm.cmd test -- tests/renderer/board/BoardCanvas.test.tsx
```

Expected: FAIL until the test imports the fixture and the selector assumptions match current test IDs.

- [ ] **Step 2: Make the smoke pass without changing renderer behavior**

Prefer adjusting only the test if existing culling already works. Only change production rendering if the smoke proves a real regression.

- [ ] **Step 3: Verify focused renderer smoke**

Run:

```powershell
npm.cmd test -- tests/renderer/board/BoardCanvas.test.tsx
```

Expected: PASS.

## Task 3: Large File Save Stability

**Files:**
- Create: `tests/main/fileSystem.large.test.ts`

- [ ] **Step 1: Write failing large save tests**

Create tests that:

- Save a `5,000/8,000` fixture to a temp `.flb`.
- Load it back with `loadFlbFromPath`.
- Assert node and edge counts match.
- Mock a failed write or use an invalid directory case to assert temporary files are cleaned when practical.

Run:

```powershell
npm.cmd test -- tests/main/fileSystem.large.test.ts
```

Expected: FAIL until the test helper and temp path setup are complete.

- [ ] **Step 2: Implement minimal test helpers**

Use Node temp directories from `node:os` and `node:fs/promises`. Do not change production save logic unless the tests expose a bug.

- [ ] **Step 3: Verify focused save tests**

Run:

```powershell
npm.cmd test -- tests/main/fileSystem.large.test.ts
```

Expected: PASS.

## Task 4: Electron E2E Harness

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/freeLinkBoard.e2e.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Install E2E dependency**

Run:

```powershell
npm.cmd install -D @playwright/test
```

- [ ] **Step 2: Add failing E2E smoke**

Create an Electron E2E smoke that launches the app, verifies `window.freeLinkBoard` exists, creates a new board, creates text nodes, uses `Ctrl+F`, and closes cleanly.

Run:

```powershell
npm.cmd run test:e2e
```

Expected: FAIL until `test:e2e` and the Playwright Electron bootstrap exist.

- [ ] **Step 3: Implement E2E config and script**

Add scripts:

```json
{
  "scripts": {
    "test:e2e": "playwright test"
  }
}
```

Configure Playwright to run Electron in a deterministic temp user data directory.

- [ ] **Step 4: Verify E2E smoke**

Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

Expected: PASS or documented environment limitation with exact error.

## Task 5: Windows Packaging

**Files:**
- Modify: `package.json`
- Modify or create packaging config

- [ ] **Step 1: Install packaging dependency**

Run:

```powershell
npm.cmd install -D electron-builder
```

- [ ] **Step 2: Add package config with files whitelist**

Configure packaging so it includes only:

- `out/**`
- `package.json`
- production dependencies needed by Electron runtime

It must exclude `Memory/`, `docs/`, `tests/`, `node_modules/.vite`, `NUL.heapsnapshot`, logs, and worktrees.

- [ ] **Step 3: Add Windows packaging script**

Modify `package.json`:

```json
{
  "scripts": {
    "package:win": "npm run build && electron-builder --win --dir"
  }
}
```

- [ ] **Step 4: Verify package command**

Run:

```powershell
npm.cmd run package:win
```

Expected: PASS and a Windows unpacked app in `dist/`.

## Task 6: Release Check And Memory

**Files:**
- Modify: `package.json`
- Create: `docs/release/M6-手感检查表.md`
- Create: `Memory/YYYY-MM-DD_HH-mm-ss_M6性能稳定性与打包.md`

- [ ] **Step 1: Add release check script**

Modify `package.json`:

```json
{
  "scripts": {
    "release:check": "npm run typecheck && npm test && npm run build && npm run perf:large-board && npm run test:e2e && npm run package:win"
  }
}
```

- [ ] **Step 2: Create hand-feel checklist**

Create `docs/release/M6-手感检查表.md` with:

- Double-click create text node.
- Continuous `Tab` linked node flow.
- `Ctrl+L` edge creation.
- Fixed point hit and drag.
- Box select, multi-drag, undo/redo.
- Search highlight and centering.
- Save, close, reopen recent file.

- [ ] **Step 3: Run full release check**

Run:

```powershell
npm.cmd run release:check
git diff --check
```

Expected: PASS or documented environment limitation with exact command output.

- [ ] **Step 4: Write Memory record**

Record:

- Sources used.
- Implemented M6 scope.
- Verification commands and results.
- Packaging artifact path.
- Remaining risks.

## Self-Review Checklist

- Spec coverage: M6 performance, stability, E2E, packaging, and release check all map to tasks.
- Placeholder scan: no task uses TBD/TODO without exact command or expected outcome.
- Risk note: Playwright/Electron and Windows packaging may require environment-specific fixes; those belong in Task 4 and Task 5, not earlier pure performance tasks.
