import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolvePreloadPath(mainBundleDir: string, appRoot = process.cwd()): string {
  const bundledPreloadPath = join(mainBundleDir, "../preload/index.mjs");
  if (existsSync(bundledPreloadPath)) {
    return bundledPreloadPath;
  }

  const devPreloadPath = join(appRoot, "out/preload/index.mjs");
  if (existsSync(devPreloadPath)) {
    return devPreloadPath;
  }

  return bundledPreloadPath;
}
