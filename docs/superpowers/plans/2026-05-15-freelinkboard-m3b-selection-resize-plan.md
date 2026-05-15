# FreeLinkBoard M3b Selection And Resize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Finish the remaining M3 text-node interactions by adding blank-canvas box selection, multi-node movement, and manual resize that switches text nodes from auto sizing to fixed sizing.

**Architecture:** Keep persistent board mutations in pure `BoardCommand` classes, and keep pointer gesture state inside `BoardCanvas`. Selection-only updates remain history-free through `documentStore.selectNodes`; movement and resize stay history-backed commands. Resize is deliberately limited to a bottom-right handle in M3b so the first fixed-size path is testable without adding a full handle system.

**Tech Stack:** React, Zustand, TypeScript, Vitest, Testing Library, existing `BoardState`, `HistoryService`, viewport helpers, DOM node layer over Canvas2D.

---

## Scope Check

This M3b includes:

- Left-button drag on blank canvas draws a selection rectangle.
- Releasing the rectangle selects all visible nodes whose world bounds intersect it.
- A blank left click without drag clears node selection.
- Dragging any selected node moves the full selected group through `MoveNodesCommand`.
- A selected non-editing node shows a bottom-right resize handle.
- Dragging the resize handle updates node `size`, sets `sizing: "fixed"`, marks the document dirty, and supports undo/redo.
- Editing a fixed-size node preserves its fixed size instead of auto-growing height.

This M3b does not include:

- Shift/Ctrl additive selection.
- Eight-direction resize handles.
- Live resize preview while dragging.
- Tab linked-node creation, Ctrl+L edge creation, edge hit testing, or edge toolbar behavior.

## Task 1: Box Selection And Multi-Select Drag

**Files:**

- Modify: `src/renderer/board/BoardCanvas.tsx`
- Modify: `src/renderer/board/layers/InteractionOverlayLayer.tsx`
- Test: `tests/renderer/board/BoardCanvas.interactions.test.tsx`

- [ ] **Step 1: Write failing interaction tests**

Add tests that cover:

- Blank left drag from `(80, 90)` to `(260, 230)` selects two nodes whose bounds intersect the rectangle.
- Blank left click without meaningful movement clears selection and does not create undo history.
- Dragging one node while two nodes are selected moves both selected nodes by the same world delta.
- With `viewport.zoom = 2`, box selection converts screen rectangle to the correct world rectangle.

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: FAIL because blank left drag currently has no selection gesture.

- [ ] **Step 2: Implement selection rectangle state**

In `BoardCanvas`, add a `selectionBoxRef` plus lightweight React state for rendering:

- `startScreenPoint`
- `currentScreenPoint`
- `hasDragged`

Blank left `pointerdown` starts the selection gesture. `pointermove` updates the rectangle once movement passes a small threshold. `pointerup` converts normalized screen bounds into world bounds via `screenToWorld`, selects intersecting nodes, clears the overlay, and prevents the double-click create path only when the gesture actually dragged.

- [ ] **Step 3: Render the rectangle overlay**

Extend `InteractionOverlayLayer` with an optional `selectionBox` prop and render an absolutely positioned translucent rectangle with `data-testid="selection-box"` when active. Keep `pointerEvents: "none"` so it never interferes with nodes.

- [ ] **Step 4: Verify selection tests**

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: PASS for the new tests and existing interaction tests.

## Task 2: Resize Command And Fixed Sizing

**Files:**

- Modify: `src/application/commands/boardInteractionCommands.ts`
- Modify: `src/renderer/board/BoardCanvas.tsx`
- Modify: `src/renderer/board/layers/NodeDomLayer.tsx`
- Test: `tests/application/commands/boardInteractionCommands.test.ts`
- Test: `tests/renderer/board/BoardCanvas.interactions.test.tsx`

- [ ] **Step 1: Write failing command tests**

Add tests that cover:

- `ResizeNodeCommand` sets a node size, switches `sizing` to `"fixed"`, updates `updatedAt`, and undo restores the previous node and timestamp.
- `ResizeNodeCommand` no-ops when the node id is missing.
- `UpdateTextNodeCommand` preserves `size` for fixed-size nodes while changing `text`.

Run:

```bash
npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts
```

Expected: FAIL because `ResizeNodeCommand` does not exist and fixed-size edit currently auto-updates height.

- [ ] **Step 2: Implement the command behavior**

Add `ResizeNodeCommand` to `boardInteractionCommands.ts`. Clamp size at renderer input time; the command only applies the explicit `Size`, sets `sizing: "fixed"`, stores the previous node, and restores it on undo. Update `UpdateTextNodeCommand` so auto-sized nodes keep current auto-grow behavior, while fixed nodes preserve existing width and height.

- [ ] **Step 3: Write failing renderer tests**

Add tests that cover:

- A selected node renders a resize handle with `data-testid="board-node-resize-node_1"`.
- Dragging that handle changes `node.size`, sets `sizing: "fixed"`, and marks the document dirty.
- `Ctrl+Z` restores the previous auto size and `Ctrl+Y` reapplies the fixed size.
- Double-click editing a fixed-size node and committing longer text preserves the fixed size.

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: FAIL before renderer resize is implemented.

- [ ] **Step 4: Implement resize gesture**

In `NodeDomLayer`, render the bottom-right handle only for selected, non-editing text nodes. The handle stops propagation and calls `onNodeResizePointerDown`.

In `BoardCanvas`, track:

- `nodeId`
- `startScreenPoint`
- `startSize`

On pointer release, convert screen delta by `viewport.zoom`, clamp to minimum `96 x 44`, and dispatch `ResizeNodeCommand`.

- [ ] **Step 5: Verify resize tests**

Run:

```bash
npm.cmd test -- tests/application/commands/boardInteractionCommands.test.ts tests/renderer/board/BoardCanvas.interactions.test.tsx
```

Expected: PASS.

## Task 3: Full Verification And Record

**Files:**

- Create: `Memory/2026-05-15_*-M3b*.md`

- [ ] **Step 1: Run full automated checks**

Run:

```bash
npm.cmd run typecheck
npm.cmd test
npm.cmd audit --audit-level=moderate
npm.cmd run build
```

Expected: all commands exit 0.

- [ ] **Step 2: Browser smoke**

Open the local renderer, then verify:

- Create two nodes.
- Box-select both nodes.
- Drag one selected node and confirm both move.
- Resize one selected node and confirm fixed-size text stays constrained.
- Undo and redo resize/move.

- [ ] **Step 3: Write Memory record**

Record sources, scope, implementation, verification output, remaining M4 work, and any known limitations.

- [ ] **Step 4: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-05-15-freelinkboard-m3b-selection-resize-plan.md src tests Memory
git commit -m "feat: add m3b selection and resize"
```

Expected: commit succeeds and `git status --short --branch` is clean.
