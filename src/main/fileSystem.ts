import { dialog, type SaveDialogOptions } from "electron";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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

  if (result.canceled) return null;
  return result.filePaths[0] ?? null;
}

export async function saveFlbPathDialog(defaultPath?: string): Promise<string | null> {
  const options: SaveDialogOptions = {
    title: "Save FreeLinkBoard file",
    filters: flbFilter
  };
  if (defaultPath) options.defaultPath = defaultPath;

  const result = await dialog.showSaveDialog(options);

  if (result.canceled) return null;
  return result.filePath ?? null;
}

export async function loadFlbFromPath(path: string): Promise<BoardState> {
  const content = await readFile(path, "utf8");
  return parseFlbDocument(JSON.parse(content));
}

export async function saveFlbToPath(path: string, state: BoardState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  const content = `${JSON.stringify(serializeFlbDocument(state), null, 2)}\n`;

  try {
    await writeFile(temporaryPath, content, "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}
