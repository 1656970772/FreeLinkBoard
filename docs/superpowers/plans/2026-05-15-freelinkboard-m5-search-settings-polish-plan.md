# FreeLinkBoard M5 Search Settings Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement M5 search, settings, shortcut polish, clipboard/delete flows, and local-file safety checks on top of the completed M4 board interactions.

**Architecture:** Keep searchable board logic and destructive board mutations in pure application modules. Keep renderer-only UI state such as search panels, settings, and in-app clipboard in `documentStore` and board shell components. Keep Electron filesystem concerns behind the existing typed preload API.

**Tech Stack:** Electron, React, TypeScript, Zustand, Vitest, Testing Library, Node `fs/promises`.

---

## Scope Check

This plan implements the M5 items from the first-version spec:

- `Ctrl+F` searches current text nodes, shows match count, centers the active result, and highlights matches.
- Settings can switch between `Ctrl+wheel` zoom and direct wheel zoom.
- Settings can define default edge color and width for newly created edges.
- Delete, copy, paste, shortcut hints, `Ctrl+S`, auto-save debounce, and close-before-save checks are completed.

This plan does not implement M6 performance packaging, large-board benchmarks, Electron Playwright E2E, or release packaging.

## File Structure

- Create: `src/application/search/boardSearch.ts`
  - Pure text-node search helpers.
- Create: `tests/application/search/boardSearch.test.ts`
  - Search behavior tests.
- Modify: `src/application/commands/boardInteractionCommands.ts`
  - Add delete and paste commands; allow edge creation to use configurable defaults.
- Modify: `tests/application/commands/boardInteractionCommands.test.ts`
  - Command tests for delete, paste, and configurable edge defaults.
- Modify: `src/renderer/stores/documentStore.ts`
  - Add search state, settings state, clipboard state, save scheduling, `Ctrl+S` helper, and recent-file removal handling.
- Modify: `tests/renderer/stores/documentStore.test.ts`
  - Store tests for search, settings persistence, clipboard, auto-save, and missing recent files.
- Modify: `src/renderer/routes/BoardPage.tsx`
  - Add search panel, compact settings panel, shortcut hints, and save button.
- Modify: `src/renderer/routes/HomePage.tsx`
  - Show missing recent-file errors and allow removing broken recent paths.
- Modify: `src/renderer/board/BoardCanvas.tsx`
  - Wire `Ctrl+F`, delete/copy/paste, direct wheel zoom setting, configurable edge defaults, and active search focus.
- Modify: `src/renderer/board/layers/NodeDomLayer.tsx`
  - Render search highlight state without changing selection.
- Modify: `src/renderer/board/layers/InteractionOverlayLayer.tsx`
  - Show compact shortcut hints.
- Modify: `src/renderer/styles/global.css`
  - Add restrained M5 panel, control, and highlight styling.
- Modify: `src/shared/electronApi.ts`
  - Add close-check and file-exists APIs only if renderer/main implementation needs them.
- Modify: `src/preload/index.ts`
  - Expose any added Electron APIs.
- Modify: `src/main/index.ts`
  - Add close-before-save IPC/window handling if needed.
- Modify: `src/main/fileSystem.ts`
  - Add file existence helper if needed.
- Modify: `tests/main/ipcValidation.test.ts`
  - Cover any new IPC payload validation.
- Create or modify: `Memory/YYYY-MM-DD_HH-mm-ss_M5搜索设置体验收口.md`
  - Record scope, implementation, verification, and remaining M6 work.

## Task 1: Pure Search Helper

**Files:**
- Create: `src/application/search/boardSearch.ts`
- Create: `tests/application/search/boardSearch.test.ts`

- [ ] **Step 1: Write failing search tests**

Create tests for:

```ts
import { describe, expect, it } from "vitest";
import { createEmptyBoardState, defaultBoardSettings } from "../../../src/domain/board/defaults";
import type { BoardState } from "../../../src/domain/board/types";
import { searchTextNodes } from "../../../src/application/search/boardSearch";

function boardWithTexts(texts: string[]): BoardState {
  const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");
  return {
    ...board,
    nodes: Object.fromEntries(
      texts.map((text, index) => [
        `node-${index + 1}`,
        {
          id: `node-${index + 1}`,
          type: "text" as const,
          position: { x: index * 180, y: 0 },
          size: defaultBoardSettings.textNodeSize,
          sizing: "auto" as const,
          text,
          style: defaultBoardSettings.textNodeStyle
        }
      ])
    )
  };
}

describe("board search", () => {
  it("finds text nodes case-insensitively and preserves board order", () => {
    const results = searchTextNodes(boardWithTexts(["Alpha map", "beta", "ALPHA note"]), "alpha");

    expect(results.map((result) => result.nodeId)).toEqual(["node-1", "node-3"]);
  });

  it("trims empty queries to no results", () => {
    expect(searchTextNodes(boardWithTexts(["Alpha"]), "   ")).toEqual([]);
  });

  it("includes match ranges for highlighting labels", () => {
    const results = searchTextNodes(boardWithTexts(["Alpha alpha"]), "alpha");

    expect(results[0]).toMatchObject({
      nodeId: "node-1",
      matchCount: 2,
      ranges: [
        { start: 0, end: 5 },
        { start: 6, end: 11 }
      ]
    });
  });
});
```

Run: `npm.cmd test -- tests/application/search/boardSearch.test.ts`
Expected: FAIL because the module does not exist.

- [ ] **Step 2: Implement `searchTextNodes`**

Implement a pure helper that trims the query, searches only text nodes, compares case-insensitively, returns stable board-order results, and records all ranges.

- [ ] **Step 3: Verify focused tests pass**

Run: `npm.cmd test -- tests/application/search/boardSearch.test.ts`
Expected: PASS.

## Task 2: Commands For Delete, Paste, And Edge Defaults

**Files:**
- Modify: `src/application/commands/boardInteractionCommands.ts`
- Modify: `tests/application/commands/boardInteractionCommands.test.ts`

- [ ] **Step 1: Write failing command tests**

Add tests that prove:

- `DeleteBoardItemsCommand` removes selected nodes and connected edges, restores them on undo, and clears selection.
- `PasteBoardItemsCommand` inserts provided cloned nodes/edges with an offset, selects pasted nodes, and undoes cleanly.
- `CreateEdgeCommand` and `CreateLinkedTextNodeCommand` accept optional `edgeStyle` defaults and clone them.

Run: `npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts`
Expected: FAIL because commands/input fields do not exist.

- [ ] **Step 2: Implement minimal commands**

Add:

- `DeleteBoardItemsCommand`
- `PasteBoardItemsCommand`
- optional `edgeStyle` on `CreateEdgeCommandInput` and `CreateLinkedTextNodeCommandInput`

Keep all behavior pure and undoable.

- [ ] **Step 3: Verify command tests pass**

Run: `npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts`
Expected: PASS.

## Task 3: Document Store Search, Settings, Clipboard, And Save Scheduling

**Files:**
- Modify: `src/renderer/stores/documentStore.ts`
- Modify: `tests/renderer/stores/documentStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Add tests that prove:

- `setSearchQuery("x")` populates `searchResults`, sets active index to the first result, and `goToNextSearchResult()` wraps.
- Clearing search removes highlights and active result.
- `updateSettings()` changes `wheelZoomMode`, `defaultEdgeColor`, and `defaultEdgeWidth`, and persists to `localStorage`.
- `copySelection()` stores selected nodes and selected/incident edges without marking the board dirty.
- `pasteClipboard()` creates new IDs, offsets pasted content, selects the pasted nodes, and marks the board dirty.
- `deleteSelection()` removes selected nodes/edges and marks the board dirty.
- `saveCurrentBoardNow()` calls the file API for named boards.
- Dirty named boards schedule a debounced auto-save.
- `removeRecentFile()` updates the recent list after a missing recent file error.

Run: `npm.cmd test -- tests/renderer/stores/documentStore.test.ts`
Expected: FAIL because store actions/state do not exist.

- [ ] **Step 2: Implement store state and actions**

Add M5 store state:

- `settings`
- `searchQuery`
- `searchResults`
- `activeSearchResultIndex`
- `clipboard`
- `autoSaveTimer`

Add actions:

- `setSearchQuery`
- `goToNextSearchResult`
- `goToPreviousSearchResult`
- `clearSearch`
- `updateSettings`
- `copySelection`
- `pasteClipboard`
- `deleteSelection`
- `saveCurrentBoardNow`
- `removeRecentFile`

Use existing `runBoardCommand` for undoable board mutations. Keep selection-only changes clean.

- [ ] **Step 3: Verify store tests pass**

Run: `npm.cmd test -- tests/renderer/stores/documentStore.test.ts`
Expected: PASS.

## Task 4: Board UI And Canvas Shortcuts

**Files:**
- Modify: `src/renderer/routes/BoardPage.tsx`
- Modify: `src/renderer/routes/HomePage.tsx`
- Modify: `src/renderer/board/BoardCanvas.tsx`
- Modify: `src/renderer/board/layers/NodeDomLayer.tsx`
- Modify: `src/renderer/board/layers/InteractionOverlayLayer.tsx`
- Modify: `src/renderer/styles/global.css`
- Modify: `tests/renderer/board/BoardCanvas.interactions.test.tsx`
- Modify: `tests/renderer/styles/globalCss.test.ts`

- [ ] **Step 1: Write failing renderer tests**

Add focused tests proving:

- `Ctrl+F` opens/focuses search input without creating a browser find dialog.
- Search result activation centers the matching node and marks it with `data-search-highlight="true"`.
- Direct wheel zoom setting allows plain wheel zoom and still blocks browser page zoom.
- `Ctrl+S` calls the store save action.
- `Delete` removes selected board items.
- `Ctrl+C` then `Ctrl+V` pastes copied selection.
- Shortcut hints render in the overlay.

Run: `npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx tests/renderer/styles/globalCss.test.ts`
Expected: FAIL because UI wiring does not exist.

- [ ] **Step 2: Implement UI wiring**

Implement:

- Board topbar search panel with query, count, next/previous, close.
- Compact settings controls for wheel zoom mode, default edge color, default edge width.
- Save button and readable save status labels.
- Home recent-file missing removal affordance.
- Canvas keyboard shortcuts for `Ctrl+F`, `Ctrl+S`, `Delete`, `Ctrl+C`, `Ctrl+V`.
- Canvas direct wheel zoom setting.
- Search highlight data attributes and visual ring.

- [ ] **Step 3: Verify renderer tests pass**

Run: `npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx tests/renderer/styles/globalCss.test.ts`
Expected: PASS.

## Task 5: Close-Before-Save And Local File Safety

**Files:**
- Modify: `src/shared/electronApi.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/fileSystem.ts`
- Modify: `tests/main/ipcValidation.test.ts`

- [ ] **Step 1: Write failing main/preload tests where practical**

If the chosen implementation needs new IPC validation, add tests before code. If close-before-save is renderer event driven with no new validation, document why focused store/UI tests cover it.

- [ ] **Step 2: Implement close safety**

Named dirty boards should save immediately on `Ctrl+S` and by debounce. On close, if the renderer reports unsaved/dirty state, the app should prompt before quitting. If this is too costly to automate in M5 without Electron E2E, implement the typed IPC surface and renderer handler, then record manual smoke coverage.

- [ ] **Step 3: Verify focused tests pass**

Run any added tests plus `npm.cmd test -- tests/main/ipcValidation.test.ts`.

## Task 6: Full Verification And Memory

**Files:**
- Create: `Memory/YYYY-MM-DD_HH-mm-ss_M5搜索设置体验收口.md`

- [ ] **Step 1: Run full automated checks**

Run:

```powershell
npm.cmd test
npm.cmd run typecheck
npm.cmd run build
git diff --check
```

Expected: all pass.

- [ ] **Step 2: Browser/manual smoke**

Use Browser or a local app smoke to verify:

- Create nodes, search text, next/previous result centers and highlights.
- Switch wheel mode and zoom with plain wheel.
- Change default edge style, create a new edge, confirm style.
- Select, copy, paste, delete, undo/redo.
- Save named board and verify status.

- [ ] **Step 3: Write Memory record**

Record:

- Sources used.
- M5 implemented scope.
- Verification commands and results.
- Any remaining M6 work or manual-only risks.

## Self-Review Checklist

- Spec coverage: M5 spec items map to tasks 1-5.
- Out-of-scope check: M6 performance, E2E, packaging, and release checks remain outside this plan.
- Risk: `BoardCanvas.tsx` is already large; M5 should keep pure logic in helpers/store/commands where possible.
- Risk: keyboard shortcuts must not fire while editing text or during IME composition.
- Risk: search highlight must not mutate board selection or dirty state.
