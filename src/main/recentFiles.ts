import { app } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RecentFile } from "../shared/electronApi";

const maxRecentFiles = 20;

const recentFilePath = (): string => join(app.getPath("userData"), "recent-files.json");

const isRecentFile = (value: unknown): value is RecentFile => {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<Record<keyof RecentFile, unknown>>;
  return (
    typeof candidate.path === "string" &&
    candidate.path.length > 0 &&
    typeof candidate.title === "string" &&
    typeof candidate.openedAt === "string"
  );
};

async function readRecentFiles(): Promise<RecentFile[]> {
  const path = recentFilePath();
  if (!existsSync(path)) return [];

  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentFile).slice(0, maxRecentFiles);
  } catch {
    return [];
  }
}

async function writeRecentFiles(files: RecentFile[]): Promise<void> {
  const path = recentFilePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(files.slice(0, maxRecentFiles), null, 2)}\n`, "utf8");
}

export async function listRecentFiles(): Promise<RecentFile[]> {
  return readRecentFiles();
}

export async function touchRecentFile(file: RecentFile): Promise<RecentFile[]> {
  const existing = await readRecentFiles();
  const next = [file, ...existing.filter((item) => item.path !== file.path)];
  await writeRecentFiles(next);
  return next.slice(0, maxRecentFiles);
}

export async function removeRecentFile(path: string): Promise<RecentFile[]> {
  const existing = await readRecentFiles();
  const next = existing.filter((item) => item.path !== path);
  await writeRecentFiles(next);
  return next;
}
