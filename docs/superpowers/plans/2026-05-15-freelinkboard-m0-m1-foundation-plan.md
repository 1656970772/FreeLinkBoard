# FreeLinkBoard M0-M1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Electron + React + TypeScript foundation, local `.flb` document codec, recent-file shell, and save/open flows for FreeLinkBoard.

**Architecture:** This plan establishes the Clean/Hexagonal boundary from the design spec. Domain and application code have no Electron, React, DOM, or filesystem dependencies; Electron file access is an infrastructure adapter exposed through a typed preload API.

**Tech Stack:** Electron, electron-vite, React, TypeScript, Vitest, Zod, Zustand, nanoid, Node `fs/promises`.

---

## Scope Check

The full 1.0 spec covers multiple subsystems: project foundation, high-performance canvas rendering, node interactions, blueprint-style edge interactions, search/settings, performance packaging. This plan implements M0 and M1 only. It should leave the repository in a working state with a desktop app shell, local JSON `.flb` read/write, recent files, and tested domain/application foundations.

Separate follow-up plans should cover:

1. M2 high-performance viewport, canvas edge layer, spatial index, path cache, and LOD.
2. M3 text node creation, editing, resizing, selection, multi-select, and history integration.
3. M4 Tab linked-node creation, Ctrl+L edge creation, edge styles, floating toolbar, and fixed points.
4. M5 search, settings, shortcuts, close-before-save checks, and final UX polish.
5. M6 performance fixtures, Electron E2E tests, packaging, and release checks.

## File Structure

Create this structure for M0-M1:

```text
package.json
electron.vite.config.ts
tsconfig.json
tsconfig.node.json
vitest.config.ts
src/
  domain/
    board/
      defaults.ts
      types.ts
    document/
      flbSchema.ts
  application/
    commands/
      BoardCommand.ts
      HistoryService.ts
    document/
      flbCodec.ts
      DocumentService.ts
      InMemoryDocumentRepository.ts
      ports.ts
  infrastructure/
    electron/
      ElectronDocumentRepository.ts
  main/
    index.ts
    fileSystem.ts
    recentFiles.ts
  preload/
    index.ts
  renderer/
    main.tsx
    App.tsx
    routes/
      HomePage.tsx
      BoardPage.tsx
    stores/
      documentStore.ts
    styles/
      global.css
  shared/
    electronApi.ts
tests/
  application/
    document/
      flbCodec.test.ts
      DocumentService.test.ts
    commands/
      HistoryService.test.ts
  domain/
    board/
      defaults.test.ts
```

Responsibility map:

- `src/domain`: pure types and default values.
- `src/application`: pure use cases, document codec, repository ports, command/history foundation.
- `src/infrastructure`: adapter implementations that depend on external systems.
- `src/main`: Electron main process, filesystem, recent-file persistence.
- `src/preload`: typed, narrow bridge exposed to the renderer.
- `src/renderer`: React shell, pages, Zustand stores, CSS.
- `src/shared`: types shared between preload, main, and renderer.

## Task 1: Toolchain And Empty App Shell

**Files:**
- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vitest.config.ts`
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles/global.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "freelinkboard",
  "version": "0.1.0",
  "description": "Local whiteboard note app with blueprint-style links.",
  "private": true,
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc -b && electron-vite build",
    "typecheck": "tsc -b --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -b --noEmit"
  },
  "dependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "nanoid": "^5.1.5",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "zod": "^3.25.0",
    "zustand": "^5.0.4"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.3.0",
    "@types/node": "^22.15.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "electron": "^36.0.0",
    "electron-vite": "^3.1.0",
    "jsdom": "^26.1.0",
    "typescript": "^5.8.0",
    "vite": "^6.3.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`

Expected: npm creates `package-lock.json` and exits with code `0`.

- [ ] **Step 3: Create TypeScript and build config**

Create `tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" }
  ],
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true
  }
}
```

Create `tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "composite": true,
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": [
    "electron.vite.config.ts",
    "vitest.config.ts",
    "src/**/*.ts",
    "src/**/*.tsx",
    "tests/**/*.ts",
    "tests/**/*.tsx"
  ]
}
```

Create `electron.vite.config.ts`:

```ts
import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()]
  }
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
});
```

- [ ] **Step 4: Create the empty Electron and React shell**

Create `src/main/index.ts`:

```ts
import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#fffdf8",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

void app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

Create `src/preload/index.ts`:

```ts
import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("freeLinkBoard", {
  platform: process.platform
});
```

Create `src/renderer/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FreeLinkBoard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `src/renderer/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/renderer/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <section className="welcome-panel">
        <p className="eyebrow">FreeLinkBoard</p>
        <h1>Local whiteboard notes</h1>
        <p>Foundation shell is running.</p>
      </section>
    </main>
  );
}
```

Create `src/renderer/styles/global.css`:

```css
:root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: #24221f;
  background: #fffdf8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 960px;
  min-height: 640px;
}

.app-shell {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: #f7f5f0;
}

.welcome-panel {
  width: min(560px, calc(100vw - 48px));
  padding: 28px;
  border: 1px solid #ddd7cf;
  border-radius: 8px;
  background: #fffdf8;
}

.eyebrow {
  margin: 0 0 8px;
  color: #2f6f6a;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-size: 32px;
  letter-spacing: 0;
}

p {
  line-height: 1.6;
}
```

- [ ] **Step 5: Verify the shell typechecks**

Run: `npm run typecheck`

Expected: command exits with code `0`.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts tsconfig.json tsconfig.node.json vitest.config.ts src
git commit -m "chore: scaffold electron react app"
```

## Task 2: Domain Models And Defaults

**Files:**
- Create: `src/domain/board/types.ts`
- Create: `src/domain/board/defaults.ts`
- Test: `tests/domain/board/defaults.test.ts`

- [ ] **Step 1: Write the failing defaults test**

Create `tests/domain/board/defaults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createEmptyBoardState, defaultBoardSettings } from "../../../src/domain/board/defaults";

describe("board defaults", () => {
  it("creates an empty board with stable default viewport and settings", () => {
    const state = createEmptyBoardState("board-1");

    expect(state.id).toBe("board-1");
    expect(state.title).toBe("Untitled Board");
    expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(state.nodes).toEqual({});
    expect(state.edges).toEqual({});
    expect(state.selection).toEqual({ nodeIds: [], edgeIds: [] });
    expect(defaultBoardSettings.edgeStyle).toEqual({
      pathType: "bezier",
      arrow: "end",
      stroke: { color: "#2f6f6a", width: 2, dash: "solid" }
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/domain/board/defaults.test.ts`

Expected: FAIL because `src/domain/board/defaults.ts` does not exist.

- [ ] **Step 3: Implement domain types and defaults**

Create `src/domain/board/types.ts`:

```ts
export type BoardId = string;
export type NodeId = string;
export type EdgeId = string;

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type Viewport = Point & {
  zoom: number;
};

export type EdgeGeometry =
  | { type: "straight"; points: Point[] }
  | { type: "bezier"; points: Point[] }
  | { type: "roundedElbow"; points: Point[]; radius: number };

export type TextNode = {
  id: NodeId;
  type: "text";
  position: Point;
  size: Size;
  sizing: "auto" | "fixed";
  text: string;
  style: {
    borderColor: string;
    backgroundColor: string;
    textColor: string;
  };
};

export type BoardNode = TextNode;

export type EdgeEndpoint =
  | { type: "node"; nodeId: NodeId }
  | { type: "point"; point: Point };

export type BoardEdge = {
  id: EdgeId;
  from: EdgeEndpoint;
  to: EdgeEndpoint;
  pathType: "bezier" | "straight" | "roundedElbow";
  arrow: "none" | "end" | "both";
  stroke: {
    color: string;
    width: number;
    dash: "solid" | "dashed";
  };
  fixedPoints: Point[];
};

export type BoardSelection = {
  nodeIds: NodeId[];
  edgeIds: EdgeId[];
};

export type BoardState = {
  id: BoardId;
  title: string;
  viewport: Viewport;
  nodes: Record<NodeId, BoardNode>;
  edges: Record<EdgeId, BoardEdge>;
  selection: BoardSelection;
  createdAt: string;
  updatedAt: string;
};

export type BoardDefaults = {
  textNodeSize: Size;
  textNodeStyle: TextNode["style"];
  edgeStyle: Pick<BoardEdge, "pathType" | "arrow" | "stroke">;
};
```

Create `src/domain/board/defaults.ts`:

```ts
import type { BoardDefaults, BoardState, BoardId } from "./types";

export const defaultBoardSettings: BoardDefaults = {
  textNodeSize: { width: 160, height: 56 },
  textNodeStyle: {
    borderColor: "#24221f",
    backgroundColor: "#fffdf8",
    textColor: "#24221f"
  },
  edgeStyle: {
    pathType: "bezier",
    arrow: "end",
    stroke: { color: "#2f6f6a", width: 2, dash: "solid" }
  }
};

export function createEmptyBoardState(id: BoardId, now = "2026-05-15T00:00:00.000Z"): BoardState {
  return {
    id,
    title: "Untitled Board",
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: {},
    edges: {},
    selection: { nodeIds: [], edgeIds: [] },
    createdAt: now,
    updatedAt: now
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/domain/board/defaults.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain tests/domain
git commit -m "feat: add board domain model"
```

## Task 3: `.flb` Codec And Schema

**Files:**
- Create: `src/domain/document/flbSchema.ts`
- Create: `src/application/document/flbCodec.ts`
- Test: `tests/application/document/flbCodec.test.ts`

- [ ] **Step 1: Write failing codec tests**

Create `tests/application/document/flbCodec.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFlbDocument, serializeFlbDocument } from "../../../src/application/document/flbCodec";
import { createEmptyBoardState } from "../../../src/domain/board/defaults";

describe("flb codec", () => {
  it("parses version 1 JSON DTO into domain state", () => {
    const state = parseFlbDocument({
      version: 1,
      id: "board-1",
      title: "Game Systems",
      createdAt: "2026-05-15T01:00:00.000Z",
      updatedAt: "2026-05-15T02:00:00.000Z",
      viewport: { x: 12, y: 34, zoom: 1.25 },
      nodes: [
        {
          id: "node_1",
          type: "text",
          x: 120,
          y: 180,
          width: 160,
          height: 56,
          sizing: "auto",
          text: "Backpack",
          style: {
            borderColor: "#24221f",
            backgroundColor: "#fffdf8",
            textColor: "#24221f"
          }
        }
      ],
      edges: []
    });

    expect(state.nodes.node_1?.position).toEqual({ x: 120, y: 180 });
    expect(state.nodes.node_1?.size).toEqual({ width: 160, height: 56 });
    expect(state.title).toBe("Game Systems");
  });

  it("serializes domain state into stable version 1 DTO", () => {
    const dto = serializeFlbDocument(createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z"));

    expect(dto).toEqual({
      version: 1,
      id: "board-1",
      title: "Untitled Board",
      createdAt: "2026-05-15T00:00:00.000Z",
      updatedAt: "2026-05-15T00:00:00.000Z",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: []
    });
  });

  it("throws a readable error for unsupported versions", () => {
    expect(() => parseFlbDocument({ version: 99 })).toThrow("Unsupported .flb version: 99");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/application/document/flbCodec.test.ts`

Expected: FAIL because codec files do not exist.

- [ ] **Step 3: Implement schema and codec**

Create `src/domain/document/flbSchema.ts`:

```ts
import { z } from "zod";

const pointSchema = z.object({
  x: z.number(),
  y: z.number()
});

const viewportSchema = pointSchema.extend({
  zoom: z.number().positive()
});

const textNodeSchema = z.object({
  id: z.string().min(1),
  type: z.literal("text"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  sizing: z.enum(["auto", "fixed"]),
  text: z.string(),
  style: z.object({
    borderColor: z.string().min(1),
    backgroundColor: z.string().min(1),
    textColor: z.string().min(1)
  })
});

const endpointSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("node"), id: z.string().min(1) }),
  z.object({ type: z.literal("point"), x: z.number(), y: z.number() })
]);

const edgeSchema = z.object({
  id: z.string().min(1),
  from: endpointSchema,
  to: endpointSchema,
  pathType: z.enum(["bezier", "straight", "roundedElbow"]),
  arrow: z.enum(["none", "end", "both"]),
  stroke: z.object({
    color: z.string().min(1),
    width: z.number().positive(),
    dash: z.enum(["solid", "dashed"])
  }),
  fixedPoints: z.array(pointSchema)
});

export const flbDocumentV1Schema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  title: z.string(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  viewport: viewportSchema,
  nodes: z.array(textNodeSchema),
  edges: z.array(edgeSchema)
});

export type FlbDocumentV1 = z.infer<typeof flbDocumentV1Schema>;
```

Create `src/application/document/flbCodec.ts`:

```ts
import { flbDocumentV1Schema, type FlbDocumentV1 } from "../../domain/document/flbSchema";
import type { BoardEdge, BoardNode, BoardState, EdgeEndpoint } from "../../domain/board/types";

type RawFlbDocument = { version?: unknown };

function parseEndpoint(endpoint: FlbDocumentV1["edges"][number]["from"]): EdgeEndpoint {
  if (endpoint.type === "node") return { type: "node", nodeId: endpoint.id };
  return { type: "point", point: { x: endpoint.x, y: endpoint.y } };
}

function serializeEndpoint(endpoint: EdgeEndpoint): FlbDocumentV1["edges"][number]["from"] {
  if (endpoint.type === "node") return { type: "node", id: endpoint.nodeId };
  return { type: "point", x: endpoint.point.x, y: endpoint.point.y };
}

export function parseFlbDocument(raw: unknown): BoardState {
  const version = (raw as RawFlbDocument | null)?.version;
  if (version !== 1) {
    throw new Error(`Unsupported .flb version: ${String(version)}`);
  }

  const parsed = flbDocumentV1Schema.parse(raw);
  const nodes = Object.fromEntries(
    parsed.nodes.map((node): [string, BoardNode] => [
      node.id,
      {
        id: node.id,
        type: "text",
        position: { x: node.x, y: node.y },
        size: { width: node.width, height: node.height },
        sizing: node.sizing,
        text: node.text,
        style: node.style
      }
    ])
  );

  const edges = Object.fromEntries(
    parsed.edges.map((edge): [string, BoardEdge] => [
      edge.id,
      {
        id: edge.id,
        from: parseEndpoint(edge.from),
        to: parseEndpoint(edge.to),
        pathType: edge.pathType,
        arrow: edge.arrow,
        stroke: edge.stroke,
        fixedPoints: edge.fixedPoints
      }
    ])
  );

  return {
    id: parsed.id,
    title: parsed.title,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
    viewport: parsed.viewport,
    nodes,
    edges,
    selection: { nodeIds: [], edgeIds: [] }
  };
}

export function serializeFlbDocument(state: BoardState): FlbDocumentV1 {
  return {
    version: 1,
    id: state.id,
    title: state.title,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    viewport: state.viewport,
    nodes: Object.values(state.nodes).map((node) => ({
      id: node.id,
      type: "text",
      x: node.position.x,
      y: node.position.y,
      width: node.size.width,
      height: node.size.height,
      sizing: node.sizing,
      text: node.text,
      style: node.style
    })),
    edges: Object.values(state.edges).map((edge) => ({
      id: edge.id,
      from: serializeEndpoint(edge.from),
      to: serializeEndpoint(edge.to),
      pathType: edge.pathType,
      arrow: edge.arrow,
      stroke: edge.stroke,
      fixedPoints: edge.fixedPoints
    }))
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/application/document/flbCodec.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/document src/application/document tests/application/document/flbCodec.test.ts
git commit -m "feat: add flb document codec"
```

## Task 4: Document Repository Port And Application Service

**Files:**
- Create: `src/application/document/ports.ts`
- Create: `src/application/document/InMemoryDocumentRepository.ts`
- Create: `src/application/document/DocumentService.ts`
- Test: `tests/application/document/DocumentService.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/application/document/DocumentService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DocumentService } from "../../../src/application/document/DocumentService";
import { InMemoryDocumentRepository } from "../../../src/application/document/InMemoryDocumentRepository";
import { createEmptyBoardState } from "../../../src/domain/board/defaults";

describe("DocumentService", () => {
  it("saves and loads a board through the repository port", async () => {
    const repository = new InMemoryDocumentRepository();
    const service = new DocumentService(repository);
    const board = createEmptyBoardState("board-1", "2026-05-15T00:00:00.000Z");

    await service.save("memory://board.flb", board);
    const loaded = await service.load("memory://board.flb");

    expect(loaded).toEqual(board);
  });

  it("reports missing files through a readable error", async () => {
    const service = new DocumentService(new InMemoryDocumentRepository());

    await expect(service.load("memory://missing.flb")).rejects.toThrow("Document not found: memory://missing.flb");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/application/document/DocumentService.test.ts`

Expected: FAIL because `DocumentService` does not exist.

- [ ] **Step 3: Implement repository port, memory adapter, and service**

Create `src/application/document/ports.ts`:

```ts
import type { BoardState } from "../../domain/board/types";

export interface DocumentRepository {
  load(path: string): Promise<BoardState>;
  save(path: string, state: BoardState): Promise<void>;
}
```

Create `src/application/document/InMemoryDocumentRepository.ts`:

```ts
import type { BoardState } from "../../domain/board/types";
import type { DocumentRepository } from "./ports";

export class InMemoryDocumentRepository implements DocumentRepository {
  private readonly documents = new Map<string, BoardState>();

  async load(path: string): Promise<BoardState> {
    const state = this.documents.get(path);
    if (!state) throw new Error(`Document not found: ${path}`);
    return structuredClone(state);
  }

  async save(path: string, state: BoardState): Promise<void> {
    this.documents.set(path, structuredClone(state));
  }
}
```

Create `src/application/document/DocumentService.ts`:

```ts
import type { BoardState } from "../../domain/board/types";
import type { DocumentRepository } from "./ports";

export class DocumentService {
  constructor(private readonly repository: DocumentRepository) {}

  load(path: string): Promise<BoardState> {
    return this.repository.load(path);
  }

  save(path: string, state: BoardState): Promise<void> {
    return this.repository.save(path, state);
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/application/document/DocumentService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/document tests/application/document/DocumentService.test.ts
git commit -m "feat: add document service port"
```

## Task 5: Command And History Foundation

**Files:**
- Create: `src/application/commands/BoardCommand.ts`
- Create: `src/application/commands/HistoryService.ts`
- Test: `tests/application/commands/HistoryService.test.ts`

- [ ] **Step 1: Write failing history tests**

Create `tests/application/commands/HistoryService.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { BoardCommand } from "../../../src/application/commands/BoardCommand";
import { HistoryService } from "../../../src/application/commands/HistoryService";
import { createEmptyBoardState } from "../../../src/domain/board/defaults";
import type { BoardState } from "../../../src/domain/board/types";

class RenameBoardCommand implements BoardCommand {
  readonly name = "rename-board";

  constructor(private readonly nextTitle: string, private previousTitle = "") {}

  execute(state: BoardState): BoardState {
    this.previousTitle = state.title;
    return { ...state, title: this.nextTitle };
  }

  undo(state: BoardState): BoardState {
    return { ...state, title: this.previousTitle };
  }
}

describe("HistoryService", () => {
  it("runs commands and supports undo and redo", () => {
    const history = new HistoryService(createEmptyBoardState("board-1"));

    const renamed = history.run(new RenameBoardCommand("Systems"));
    expect(renamed.title).toBe("Systems");

    const undone = history.undo();
    expect(undone.title).toBe("Untitled Board");

    const redone = history.redo();
    expect(redone.title).toBe("Systems");
  });

  it("clears redo stack after a new command", () => {
    const history = new HistoryService(createEmptyBoardState("board-1"));

    history.run(new RenameBoardCommand("A"));
    history.undo();
    history.run(new RenameBoardCommand("B"));

    expect(history.redo().title).toBe("B");
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- tests/application/commands/HistoryService.test.ts`

Expected: FAIL because command files do not exist.

- [ ] **Step 3: Implement command and history service**

Create `src/application/commands/BoardCommand.ts`:

```ts
import type { BoardState } from "../../domain/board/types";

export interface BoardCommand {
  readonly name: string;
  execute(state: BoardState): BoardState;
  undo(state: BoardState): BoardState;
}
```

Create `src/application/commands/HistoryService.ts`:

```ts
import type { BoardState } from "../../domain/board/types";
import type { BoardCommand } from "./BoardCommand";

export class HistoryService {
  private state: BoardState;
  private readonly undoStack: BoardCommand[] = [];
  private readonly redoStack: BoardCommand[] = [];

  constructor(initialState: BoardState) {
    this.state = initialState;
  }

  current(): BoardState {
    return this.state;
  }

  run(command: BoardCommand): BoardState {
    this.state = command.execute(this.state);
    this.undoStack.push(command);
    this.redoStack.length = 0;
    return this.state;
  }

  undo(): BoardState {
    const command = this.undoStack.pop();
    if (!command) return this.state;
    this.state = command.undo(this.state);
    this.redoStack.push(command);
    return this.state;
  }

  redo(): BoardState {
    const command = this.redoStack.pop();
    if (!command) return this.state;
    this.state = command.execute(this.state);
    this.undoStack.push(command);
    return this.state;
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- tests/application/commands/HistoryService.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/application/commands tests/application/commands
git commit -m "feat: add command history service"
```

## Task 6: Electron File API, Atomic Save, And Recent Files

**Files:**
- Create: `src/shared/electronApi.ts`
- Modify: `src/preload/index.ts`
- Create: `src/main/fileSystem.ts`
- Create: `src/main/recentFiles.ts`
- Modify: `src/main/index.ts`
- Create: `src/infrastructure/electron/ElectronDocumentRepository.ts`

- [ ] **Step 1: Define shared Electron API types**

Create `src/shared/electronApi.ts`:

```ts
import type { BoardState } from "../domain/board/types";

export type RecentFile = {
  path: string;
  title: string;
  openedAt: string;
};

export type SaveDocumentRequest = {
  path: string;
  state: BoardState;
};

export type ElectronFileApi = {
  platform: NodeJS.Platform;
  openFlbDialog(): Promise<{ canceled: true } | { canceled: false; path: string; state: BoardState }>;
  saveFlb(request: SaveDocumentRequest): Promise<void>;
  loadFlb(path: string): Promise<BoardState>;
  listRecentFiles(): Promise<RecentFile[]>;
  removeRecentFile(path: string): Promise<RecentFile[]>;
};

declare global {
  interface Window {
    freeLinkBoard: ElectronFileApi;
  }
}
```

- [ ] **Step 2: Update preload bridge**

Replace `src/preload/index.ts` with:

```ts
import { contextBridge, ipcRenderer } from "electron";
import type { ElectronFileApi, SaveDocumentRequest } from "../shared/electronApi";

const api: ElectronFileApi = {
  platform: process.platform,
  openFlbDialog: () => ipcRenderer.invoke("flb:open-dialog"),
  saveFlb: (request: SaveDocumentRequest) => ipcRenderer.invoke("flb:save", request),
  loadFlb: (path: string) => ipcRenderer.invoke("flb:load", path),
  listRecentFiles: () => ipcRenderer.invoke("recent:list"),
  removeRecentFile: (path: string) => ipcRenderer.invoke("recent:remove", path)
};

contextBridge.exposeInMainWorld("freeLinkBoard", api);
```

- [ ] **Step 3: Implement filesystem helpers**

Create `src/main/fileSystem.ts`:

```ts
import { dialog } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseFlbDocument, serializeFlbDocument } from "../application/document/flbCodec";
import type { BoardState } from "../domain/board/types";

const flbFilter = [{ name: "FreeLinkBoard", extensions: ["flb"] }];

export async function openFlbPathDialog(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: "Open FreeLinkBoard file",
    filters: flbFilter,
    properties: ["openFile"]
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

export async function loadFlbFromPath(path: string): Promise<BoardState> {
  const content = await readFile(path, "utf8");
  return parseFlbDocument(JSON.parse(content));
}

export async function saveFlbToPath(path: string, state: BoardState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  const content = `${JSON.stringify(serializeFlbDocument(state), null, 2)}\n`;
  await writeFile(temporaryPath, content, "utf8");
  await rename(temporaryPath, path);
}
```

Create `src/main/recentFiles.ts`:

```ts
import { app } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RecentFile } from "../shared/electronApi";

const recentFilePath = (): string => join(app.getPath("userData"), "recent-files.json");

async function readRecentFiles(): Promise<RecentFile[]> {
  const path = recentFilePath();
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(await readFile(path, "utf8")) as RecentFile[];
  return parsed.filter((item) => typeof item.path === "string" && typeof item.title === "string");
}

async function writeRecentFiles(files: RecentFile[]): Promise<void> {
  const path = recentFilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(files.slice(0, 20), null, 2)}\n`, "utf8");
}

export async function listRecentFiles(): Promise<RecentFile[]> {
  return readRecentFiles();
}

export async function touchRecentFile(file: RecentFile): Promise<RecentFile[]> {
  const existing = await readRecentFiles();
  const next = [file, ...existing.filter((item) => item.path !== file.path)];
  await writeRecentFiles(next);
  return next;
}

export async function removeRecentFile(path: string): Promise<RecentFile[]> {
  const existing = await readRecentFiles();
  const next = existing.filter((item) => item.path !== path);
  await writeRecentFiles(next);
  return next;
}
```

- [ ] **Step 4: Wire IPC in main process**

Modify `src/main/index.ts` to register IPC handlers before `app.whenReady()` resolves:

```ts
import { app, BrowserWindow, ipcMain } from "electron";
import { join } from "node:path";
import type { SaveDocumentRequest } from "../shared/electronApi";
import { listRecentFiles, removeRecentFile, touchRecentFile } from "./recentFiles";
import { loadFlbFromPath, openFlbPathDialog, saveFlbToPath } from "./fileSystem";

function registerIpcHandlers(): void {
  ipcMain.handle("flb:open-dialog", async () => {
    const path = await openFlbPathDialog();
    if (!path) return { canceled: true as const };
    const state = await loadFlbFromPath(path);
    await touchRecentFile({ path, title: state.title, openedAt: new Date().toISOString() });
    return { canceled: false as const, path, state };
  });

  ipcMain.handle("flb:load", async (_event, path: string) => {
    const state = await loadFlbFromPath(path);
    await touchRecentFile({ path, title: state.title, openedAt: new Date().toISOString() });
    return state;
  });

  ipcMain.handle("flb:save", async (_event, request: SaveDocumentRequest) => {
    await saveFlbToPath(request.path, request.state);
    await touchRecentFile({ path: request.path, title: request.state.title, openedAt: new Date().toISOString() });
  });

  ipcMain.handle("recent:list", () => listRecentFiles());
  ipcMain.handle("recent:remove", (_event, path: string) => removeRecentFile(path));
}

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#fffdf8",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

void app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 5: Implement Electron repository adapter**

Create `src/infrastructure/electron/ElectronDocumentRepository.ts`:

```ts
import type { DocumentRepository } from "../../application/document/ports";
import type { BoardState } from "../../domain/board/types";
import type { ElectronFileApi } from "../../shared/electronApi";

export class ElectronDocumentRepository implements DocumentRepository {
  constructor(private readonly api: Pick<ElectronFileApi, "loadFlb" | "saveFlb">) {}

  load(path: string): Promise<BoardState> {
    return this.api.loadFlb(path);
  }

  save(path: string, state: BoardState): Promise<void> {
    return this.api.saveFlb({ path, state });
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main src/preload src/shared src/infrastructure
git commit -m "feat: add electron document file api"
```

## Task 7: Renderer Document Store And M1 Pages

**Files:**
- Create: `src/renderer/stores/documentStore.ts`
- Create: `src/renderer/routes/HomePage.tsx`
- Create: `src/renderer/routes/BoardPage.tsx`
- Modify: `src/renderer/App.tsx`
- Modify: `src/renderer/styles/global.css`

- [ ] **Step 1: Create document store**

Create `src/renderer/stores/documentStore.ts`:

```ts
import { create } from "zustand";
import { nanoid } from "nanoid";
import { createEmptyBoardState } from "../../domain/board/defaults";
import type { BoardState } from "../../domain/board/types";
import type { RecentFile } from "../../shared/electronApi";

type SaveStatus = "saved" | "saving" | "dirty" | "unsaved";

type DocumentStore = {
  currentPath: string | null;
  currentBoard: BoardState | null;
  recentFiles: RecentFile[];
  saveStatus: SaveStatus;
  createNewBoard(): void;
  loadRecentFiles(): Promise<void>;
  openBoardDialog(): Promise<void>;
  saveCurrentBoard(path: string): Promise<void>;
};

export const useDocumentStore = create<DocumentStore>((set, get) => ({
  currentPath: null,
  currentBoard: null,
  recentFiles: [],
  saveStatus: "unsaved",

  createNewBoard() {
    set({
      currentPath: null,
      currentBoard: createEmptyBoardState(`board_${nanoid()}`, new Date().toISOString()),
      saveStatus: "unsaved"
    });
  },

  async loadRecentFiles() {
    const recentFiles = await window.freeLinkBoard.listRecentFiles();
    set({ recentFiles });
  },

  async openBoardDialog() {
    const result = await window.freeLinkBoard.openFlbDialog();
    if (result.canceled) return;
    set({
      currentPath: result.path,
      currentBoard: result.state,
      saveStatus: "saved"
    });
    await get().loadRecentFiles();
  },

  async saveCurrentBoard(path: string) {
    const currentBoard = get().currentBoard;
    if (!currentBoard) return;
    set({ saveStatus: "saving" });
    await window.freeLinkBoard.saveFlb({ path, state: currentBoard });
    set({ currentPath: path, saveStatus: "saved" });
    await get().loadRecentFiles();
  }
}));
```

- [ ] **Step 2: Create pages**

Create `src/renderer/routes/HomePage.tsx`:

```tsx
import { useEffect } from "react";
import { useDocumentStore } from "../stores/documentStore";

export function HomePage() {
  const recentFiles = useDocumentStore((state) => state.recentFiles);
  const createNewBoard = useDocumentStore((state) => state.createNewBoard);
  const openBoardDialog = useDocumentStore((state) => state.openBoardDialog);
  const loadRecentFiles = useDocumentStore((state) => state.loadRecentFiles);

  useEffect(() => {
    void loadRecentFiles();
  }, [loadRecentFiles]);

  return (
    <main className="home-page">
      <header className="home-header">
        <p className="eyebrow">FreeLinkBoard</p>
        <h1>Recent whiteboards</h1>
      </header>

      <div className="action-row">
        <button type="button" onClick={createNewBoard}>New board</button>
        <button type="button" onClick={() => void openBoardDialog()}>Open .flb</button>
      </div>

      <section className="recent-list" aria-label="Recent files">
        {recentFiles.length === 0 ? (
          <p className="empty-text">No recent whiteboards yet.</p>
        ) : (
          recentFiles.map((file) => (
            <article key={file.path} className="recent-file">
              <strong>{file.title}</strong>
              <span>{file.path}</span>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
```

Create `src/renderer/routes/BoardPage.tsx`:

```tsx
import { useDocumentStore } from "../stores/documentStore";

export function BoardPage() {
  const board = useDocumentStore((state) => state.currentBoard);
  const currentPath = useDocumentStore((state) => state.currentPath);
  const saveStatus = useDocumentStore((state) => state.saveStatus);

  if (!board) return null;

  return (
    <main className="board-page">
      <header className="board-topbar">
        <div>
          <strong>{board.title}</strong>
          <span>{currentPath ?? "Unsaved board"}</span>
        </div>
        <span className="save-status">{saveStatus}</span>
      </header>
      <section className="board-stage">
        <p>Board canvas foundation is ready.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Wire pages in `App.tsx`**

Replace `src/renderer/App.tsx` with:

```tsx
import { BoardPage } from "./routes/BoardPage";
import { HomePage } from "./routes/HomePage";
import { useDocumentStore } from "./stores/documentStore";

export function App() {
  const currentBoard = useDocumentStore((state) => state.currentBoard);
  return currentBoard ? <BoardPage /> : <HomePage />;
}
```

- [ ] **Step 4: Replace CSS with M1 layout**

Replace `src/renderer/styles/global.css` with:

```css
:root {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: #24221f;
  background: #fffdf8;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 960px;
  min-height: 640px;
}

button {
  height: 36px;
  padding: 0 14px;
  border: 1px solid #cfc8bd;
  border-radius: 6px;
  background: #fffdf8;
  color: #24221f;
  font: inherit;
  cursor: pointer;
}

button:hover {
  border-color: #2f6f6a;
}

.home-page {
  min-height: 100vh;
  padding: 42px;
  background: #f7f5f0;
}

.home-header {
  max-width: 760px;
}

.eyebrow {
  margin: 0 0 8px;
  color: #2f6f6a;
  font-weight: 700;
}

h1 {
  margin: 0;
  font-size: 32px;
  letter-spacing: 0;
}

.action-row {
  display: flex;
  gap: 10px;
  margin-top: 24px;
}

.recent-list {
  display: grid;
  gap: 10px;
  max-width: 860px;
  margin-top: 24px;
}

.recent-file {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid #ddd7cf;
  border-radius: 8px;
  background: #fffdf8;
}

.recent-file span,
.empty-text,
.board-topbar span {
  color: #68625a;
  font-size: 13px;
}

.board-page {
  min-height: 100vh;
  display: grid;
  grid-template-rows: 52px 1fr;
}

.board-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 18px;
  border-bottom: 1px solid #ddd7cf;
  background: #fffdf8;
}

.board-topbar div {
  display: grid;
  gap: 2px;
}

.save-status {
  padding: 4px 8px;
  border-radius: 999px;
  background: #f5f1ea;
}

.board-stage {
  display: grid;
  place-items: center;
  background:
    linear-gradient(#ece8df 1px, transparent 1px),
    linear-gradient(90deg, #ece8df 1px, transparent 1px),
    #f7f5f0;
  background-size: 24px 24px;
}
```

- [ ] **Step 5: Verify typecheck and tests**

Run: `npm run typecheck`

Expected: PASS.

Run: `npm test`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer
git commit -m "feat: add document shell pages"
```

## Task 8: M0-M1 Final Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-14-freelinkboard-design.html` only if M0-M1 implementation uncovers a needed clarification.

- [ ] **Step 1: Run all checks**

Run:

```bash
npm run typecheck
npm test
npm run build
```

Expected: all commands exit with code `0`.

- [ ] **Step 2: Run the app manually**

Run: `npm run dev`

Expected:

- App opens in an Electron window.
- Home page shows `FreeLinkBoard`, `New board`, and `Open .flb`.
- Clicking `New board` opens the board shell.
- Board shell shows `Untitled Board`, `Unsaved board`, and save status `unsaved`.

- [ ] **Step 3: Verify Git state**

Run: `git status --short --branch`

Expected: branch is `main`, tracking `origin/main`, with no unstaged or staged changes except deliberate documentation updates.

- [ ] **Step 4: Commit final M0-M1 verification notes if documentation changed**

If no documentation changed, do not create an empty commit.

If documentation changed:

```bash
git add docs/superpowers/specs/2026-05-14-freelinkboard-design.html
git commit -m "docs: clarify foundation implementation notes"
```

- [ ] **Step 5: Push**

Run: `git push`

Expected: branch pushes to `origin/main`.

## Self-Review Checklist

- Spec coverage: This plan covers M0 engineering foundation and M1 local files/home shell from the design spec.
- Out-of-scope for this plan: M2 high-performance canvas, M3 node interactions, M4 edge interactions, M5 search/settings, M6 packaging.
- Type consistency: `BoardState`, `BoardNode`, `BoardEdge`, `DocumentRepository`, and `.flb` DTO mapping are defined before use.
- Testability: Domain, codec, document service, and history service tests run without Electron or React.
- Dependency direction: Application code depends on ports; Electron code implements adapters.
