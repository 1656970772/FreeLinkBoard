import { extname } from "node:path";
import type { BoardState } from "../domain/board/types";
import type { SaveDocumentRequest } from "../shared/electronApi";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const hasNumber = (value: Record<string, unknown>, key: string): boolean =>
  typeof value[key] === "number" && Number.isFinite(value[key]);

const isBoardStateLike = (value: unknown): value is BoardState => {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.createdAt !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    return false;
  }

  const viewport = value.viewport;
  if (!isRecord(viewport) || !hasNumber(viewport, "x") || !hasNumber(viewport, "y")) {
    return false;
  }
  if (!hasNumber(viewport, "zoom")) return false;

  const zoom = viewport.zoom;
  if (typeof zoom !== "number" || zoom <= 0) return false;

  return isRecord(value.nodes) && isRecord(value.edges) && isRecord(value.selection);
};

export function assertFlbPath(path: unknown): string {
  if (typeof path !== "string" || path.trim().length === 0 || extname(path).toLowerCase() !== ".flb") {
    throw new Error("Expected a .flb file path");
  }

  return path;
}

export function assertSaveDocumentRequest(request: unknown): SaveDocumentRequest {
  if (!isRecord(request)) throw new Error("Invalid save request payload");

  const path = assertFlbPath(request.path);
  if (!isBoardStateLike(request.state)) {
    throw new Error("Invalid save request payload");
  }

  return { path, state: request.state };
}
