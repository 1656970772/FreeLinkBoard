import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/renderer/styles/global.css"), "utf8");

function cssBlock(selector: string): string {
  const match = css.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  return match?.[1] ?? "";
}

describe("global canvas layout styles", () => {
  it("keeps overflow clipping scoped to the board stage", () => {
    expect(cssBlock("body")).not.toMatch(/overflow\s*:\s*hidden/i);
    expect(cssBlock(".board-stage")).toMatch(/overflow\s*:\s*hidden/i);
  });
});
