# FreeLinkBoard M3 Text Node Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Turn the M2 render-only board into a usable text-node board: create nodes by double-clicking blank canvas, select nodes, edit text, drag nodes, and undo/redo changes.

**Architecture:** Keep board mutations as pure `BoardCommand` classes under `src/application/commands` and let the renderer dispatch those commands through `documentStore`. Keep hit conversion in the renderer using existing viewport helpers. M3a deliberately excludes linked-node Tab, Ctrl+L edges, edge editing, resize handles, and production auto-save throttling; those stay for M3b/M4/M5.

**Tech Stack:** React, Zustand, TypeScript, Vitest, Testing Library, existing `BoardState`, `HistoryService`, geometry helpers, Canvas2D/DOM hybrid renderer.

---

## Scope Check

This M3a includes:

- Double-click blank canvas creates a text node at the clicked world position and immediately enters editing.
- Text nodes support single-click selection and double-click editing.
- Text edits update the board through history-backed commands.
- Left-button dragging moves selected text nodes.
- `Ctrl+Z` / `Ctrl+Y` run undo/redo for command-backed changes.
- Board changes mark the document dirty.
- The M2 pan/zoom/grid/edge/node culling behavior remains intact.

This M3a does not include:

- Resize handles or fixed-size transition.
- Box selection and group drag.
- Tab linked-node creation.
- Ctrl+L edge creation.
- Edge hit testing, edge selection, fixed points, or line style toolbar.
- Save throttling or deep Electron auto-save behavior.

## Task 1: Pure Board Commands

**Files:**

- Create: `src/application/commands/boardInteractionCommands.ts`
- Test: `tests/application/commands/boardInteractionCommands.test.ts`

- [ ] **Step 1: Write failing tests for text-node commands**

Cover:

- `CreateTextNodeCommand` creates a text node at a point, selects it, and can undo it.
- `UpdateTextNodeCommand` updates text and node height, preserves previous value on undo.
- `MoveNodesCommand` moves one or more selected nodes by a world delta and can undo.
- Commands update `updatedAt` through an injected clock string.

Run:

```bash
npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts
```

Expected: FAIL because the command file does not exist.

- [ ] **Step 2: Implement command classes**

Use existing domain types and `defaultBoardSettings`. IDs are passed into `CreateTextNodeCommand`; do not call `nanoid` inside application commands.

Suggested exports:

- `estimateTextNodeSize(text: string)`
- `CreateTextNodeCommand`
- `UpdateTextNodeCommand`
- `MoveNodesCommand`
- `SelectNodesCommand` only if needed for history-free selection tests; selection-only updates may also stay in store.

- [ ] **Step 3: Verify command tests**

Run:

```bash
npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts
```

Expected: PASS.

## Task 2: Document Store History Integration

**Files:**

- Modify: `src/renderer/stores/documentStore.ts`
- Test: `tests/renderer/stores/documentStore.test.ts`

- [ ] **Step 1: Write failing store tests**

Cover:

- `runBoardCommand(command)` applies a command, updates `currentBoard`, and marks `saveStatus` as `dirty`.
- `undoBoardCommand()` and `redoBoardCommand()` restore command-backed node changes.
- `selectNodes(ids)` updates selection without marking the file dirty.
- Creating/loading/opening a board resets the per-document history.

Run:

```bash
npm.cmd test -- tests/renderer/stores/documentStore.test.ts
```

Expected: FAIL because the store has no command/history API yet.

- [ ] **Step 2: Implement store command/history API**

Add to `DocumentStore`:

- `runBoardCommand(command: BoardCommand): void`
- `undoBoardCommand(): void`
- `redoBoardCommand(): void`
- `selectNodes(nodeIds: string[]): void`

Keep `HistoryService` private in the store module. Reset it whenever `currentBoard` is replaced by create/load/open. If no board exists, command actions are no-ops.

- [ ] **Step 3: Verify store tests**

Run:

```bash
npm.cmd test -- tests/renderer/stores/documentStore.test.ts
```

Expected: PASS.

## Task 3: Board Canvas Node Interaction UI

**Files:**

- Modify: `src/renderer/board/BoardCanvas.tsx`
- Modify: `src/renderer/board/layers/NodeDomLayer.tsx`
- Modify: `src/renderer/styles/global.css`
- Test: `tests/renderer/board/BoardCanvas.interactions.test.tsx`
- Test: update `tests/renderer/board/BoardCanvas.test.tsx` if props change

- [ ] **Step 1: Write failing renderer interaction tests**

Cover:

- Double-clicking blank board calls the store through real UI and renders a selected editable node.
- Typing into the active textarea and blurring updates the node text.
- Clicking a node selects it.
- Dragging a selected node changes its screen position after command commit.
- Pressing `Ctrl+Z` after creating a node removes it; `Ctrl+Y` restores it.

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: FAIL before UI interaction wiring exists.

- [ ] **Step 2: Implement interaction state and node editor**

Guidelines:

- Keep transient edit id and drag state inside `BoardCanvas`.
- Use `screenToWorld` for blank double-click and drag deltas.
- Dispatch board mutations through `useDocumentStore.getState().runBoardCommand(...)`.
- Node layer should accept callbacks for click, double-click, pointer down, text commit, and active edit id.
- Render editable text as a `textarea` inside the node when active.
- Stop propagation from node events so blank double-click does not also create another node.
- Do not add resize handles in M3a.

- [ ] **Step 3: Verify renderer tests**

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx tests/renderer/board/BoardCanvas.test.tsx
```

Expected: PASS.

## Task 4: Integration Verification And Review

**Files:**

- Create or update: `Memory/2026-05-15_*-M3*.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit --audit-level=moderate
```

Expected: all pass.

- [ ] **Step 2: Browser smoke**

Run `npm.cmd run dev`, open `http://localhost:5173/`, click `New board`.

Expected:

- Double-click blank canvas creates an editable text node.
- Enter text, blur, and the node shows the new text.
- Click selects the node.
- Drag moves the node.
- `Ctrl+Z` removes the created node and `Ctrl+Y` restores it.
- Console has no errors.

- [ ] **Step 3: Request independent review**

Ask a fresh reviewer to inspect M3a against this plan and the design spec. Fix any P1/P2 issues before committing.

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat: add m3 text node interactions"
```
