# FreeLinkBoard M2 Canvas Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M2 high-performance canvas skeleton: world/screen coordinates, viewport pan/zoom, grid canvas, edge canvas, DOM node layer, interaction overlay, spatial culling, path caching, and deterministic fixture data.

**Architecture:** Keep geometry and indexing pure TypeScript under `src/application/geometry` so it can be tested without React, DOM, Electron, or Canvas. Renderer code composes those pure helpers into a `BoardCanvas` with separate grid, edge, node, and overlay layers. The canvas shell renders existing `BoardState` data only; M3 will add editing and creation interactions.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, Canvas2D, existing domain `BoardState`.

---

## Scope Check

M2 includes:

- World/screen coordinate conversion and visible world rect calculation.
- Viewport panning and wheel zooming around the cursor.
- Background grid Canvas layer.
- Canvas edge layer for visible edges with path cache.
- DOM node layer with viewport culling and basic LOD.
- Interaction overlay showing viewport/visible counts for debugging.
- Spatial index and deterministic large board fixture for performance smoke checks.

M2 does not include:

- Creating, editing, dragging, resizing, or selecting real nodes.
- Tab linked-node creation.
- Ctrl+L edge creation or edge fixed-point editing.
- Search, settings, packaging, or production perf benchmarking.

## Task 1: Pure Geometry, Spatial Index, And Fixtures

**Files:**

- Create: `src/application/geometry/viewportTransform.ts`
- Create: `src/application/geometry/bounds.ts`
- Create: `src/application/geometry/SpatialIndex.ts`
- Create: `src/application/geometry/edgePathCache.ts`
- Create: `src/application/fixtures/createBoardFixture.ts`
- Test: `tests/application/geometry/viewportTransform.test.ts`
- Test: `tests/application/geometry/SpatialIndex.test.ts`
- Test: `tests/application/geometry/edgePathCache.test.ts`
- Test: `tests/application/fixtures/createBoardFixture.test.ts`

- [ ] **Step 1: Write failing geometry tests**

Cover:

- `worldToScreen(point, viewport)` maps board coordinates to CSS pixels.
- `screenToWorld(point, viewport)` is the inverse.
- `getVisibleWorldRect(viewport, size, padding)` expands by padding in screen pixels.
- `zoomViewportAtScreenPoint(viewport, screenPoint, nextZoom)` preserves the world point under the cursor.
- Bounds intersection includes edge-touching objects.

Run:

```bash
npm.cmd test -- tests/application/geometry/viewportTransform.test.ts
```

Expected: FAIL because geometry files do not exist.

- [ ] **Step 2: Implement transform and bounds helpers**

Use this coordinate convention:

- `viewport.x` and `viewport.y` are world coordinates at the top-left of the viewport.
- `screen.x = (world.x - viewport.x) * viewport.zoom`
- `world.x = screen.x / viewport.zoom + viewport.x`

Clamp zoom to `0.1` through `4`.

- [ ] **Step 3: Write failing spatial index tests**

Cover:

- Insert node/edge bounds with ids and query by visible rect.
- Updating an id replaces the old bounds.
- Removing an id removes it from future queries.
- Query returns only intersecting ids.

Run:

```bash
npm.cmd test -- tests/application/geometry/SpatialIndex.test.ts
```

Expected: FAIL before implementation.

- [ ] **Step 4: Implement a simple grid spatial index**

Use a fixed world-cell grid, default `512` world units. Store `id -> bounds` and `cell -> ids`. This is enough for M2 and can later be replaced by R-tree without changing renderer consumers.

- [ ] **Step 5: Write failing path cache tests**

Cover:

- Edge endpoint at node resolves to node center for M2.
- Point endpoint resolves directly.
- Cache returns same path object for unchanged edge/node inputs.
- Cache invalidates when endpoint node position changes.

Run:

```bash
npm.cmd test -- tests/application/geometry/edgePathCache.test.ts
```

Expected: FAIL before implementation.

- [ ] **Step 6: Implement edge path cache**

Expose:

- `resolveEdgeEndpoint(endpoint, nodes)`
- `createEdgePath(edge, nodes)`
- `EdgePathCache.get(edge, nodes)`
- `EdgePathCache.clear()`

For M2, path points can be `start`, optional `fixedPoints`, `end`, and `bounds`.

- [ ] **Step 7: Write failing fixture tests**

Cover deterministic board generation:

- `createBoardFixture({ nodeCount: 100, edgeCount: 160 })` returns exact counts.
- First node and first edge ids are stable.
- Generated edges reference existing nodes.

Run:

```bash
npm.cmd test -- tests/application/fixtures/createBoardFixture.test.ts
```

Expected: FAIL before implementation.

- [ ] **Step 8: Implement deterministic fixture generator**

Use existing `BoardState`, text nodes, and default styles. Do not add random values. Keep it pure and fast enough for `5000` nodes and `8000` edges.

## Task 2: Renderer Canvas Layers

**Files:**

- Create: `src/renderer/board/BoardCanvas.tsx`
- Create: `src/renderer/board/useCanvasViewport.ts`
- Create: `src/renderer/board/layers/GridCanvasLayer.tsx`
- Create: `src/renderer/board/layers/EdgeCanvasLayer.tsx`
- Create: `src/renderer/board/layers/NodeDomLayer.tsx`
- Create: `src/renderer/board/layers/InteractionOverlayLayer.tsx`
- Test: `tests/renderer/board/BoardCanvas.test.tsx`
- Test: `tests/renderer/board/useCanvasViewport.test.ts`

- [ ] **Step 1: Write failing viewport hook tests**

Cover:

- Panning updates `viewport.x` and `viewport.y` in world units.
- Wheel zoom clamps zoom.
- Wheel zoom around a screen point preserves that world point.

Run:

```bash
npm.cmd test -- tests/renderer/board/useCanvasViewport.test.ts
```

Expected: FAIL before hook exists.

- [ ] **Step 2: Implement `useCanvasViewport`**

Expose a hook that owns local viewport state initialized from `board.viewport`. It should return `viewport`, `setViewport`, `panByScreenDelta`, and `zoomAtScreenPoint`.

- [ ] **Step 3: Write failing BoardCanvas tests**

Cover:

- `BoardCanvas` renders layer roots with stable test ids.
- Given a viewport and several nodes, `NodeDomLayer` only renders visible nodes.
- At zoom below `0.35`, node text is simplified to a title line and hides full detail.

Run:

```bash
npm.cmd test -- tests/renderer/board/BoardCanvas.test.tsx
```

Expected: FAIL before components exist.

- [ ] **Step 4: Implement board layers**

Requirements:

- `GridCanvasLayer` draws grid lines on a canvas using viewport and devicePixelRatio.
- `EdgeCanvasLayer` draws only visible edge paths from the path cache.
- `NodeDomLayer` positions HTML nodes with CSS transform using world/screen conversion and culls by visible world rect.
- `InteractionOverlayLayer` is lightweight and shows visible node/edge counts.
- `BoardCanvas` composes layers and supports right-button or middle-button panning plus wheel zoom.

Keep M3 interactions out of scope.

## Task 3: BoardPage Integration And Visual Smoke

**Files:**

- Modify: `src/renderer/routes/BoardPage.tsx`
- Modify: `src/renderer/styles/global.css`
- Modify: `src/renderer/stores/documentStore.ts` only if a small helper is needed
- Test: update existing renderer tests if needed

- [ ] **Step 1: Replace placeholder stage with `BoardCanvas`**

`BoardPage` should keep the topbar and pass the current board into `BoardCanvas`.

- [ ] **Step 2: Add M2 canvas CSS**

Add full-bleed board stage styles, canvas stacking, node styles, and overlay styles. Keep text non-overlapping and use `letter-spacing: 0`.

- [ ] **Step 3: Verify**

Run:

```bash
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd audit
```

Expected: all pass.

- [ ] **Step 4: Browser smoke**

Run `npm.cmd run dev`, open `http://localhost:5173/`, click `New board`.

Expected:

- Home page still shows `FreeLinkBoard`, `New board`, and `Open .flb`.
- Board page shows `Untitled Board`, `Unsaved board`, `unsaved`.
- Board stage shows a grid canvas with overlay count text.
- Console has no error or warning.

## Review Checklist

- `src/application/geometry` has no React, DOM, Electron, or filesystem imports.
- Canvas and DOM layers share the same viewport transform helpers.
- Node DOM layer culls viewport-outside nodes.
- Edge canvas layer queries visible edges before drawing.
- Path cache has deterministic invalidation keys.
- New tests prove red/green behavior for geometry, index, cache, fixture, and renderer culling.
