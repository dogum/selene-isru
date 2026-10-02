import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("CSS custom properties", () => {
  it("defines every variable that is referenced without a fallback", () => {
    const sources = files(SRC).filter((path) => /\.(css|tsx?)$/.test(path));
    const defined = new Set<string>();
    const used = new Map<string, string>();
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      // Declarations in CSS (`--name:`) and inline React styles (`"--name":`).
      for (const match of text.matchAll(/(?:^|[\s{;"'])(--[a-z0-9-]+)["']?\s*:/gm)) defined.add(match[1]!);
      for (const match of text.matchAll(/setProperty\(\s*["'](--[a-z0-9-]+)/g)) defined.add(match[1]!);
      // A var() with a fallback may be deliberately optional; one without has
      // no value at all when the property is missing (e.g. a border vanishes).
      for (const match of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
        if (!used.has(match[1]!)) used.set(match[1]!, path.slice(SRC.length + 1));
      }
    }
    const undefinedVars = [...used].filter(([name]) => !defined.has(name)).map(([name, file]) => `${name} (${file})`);
    expect(undefinedVars).toEqual([]);
  });
});
