import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { expect, it } from "vitest";

it("preserves actual GLB controls, scale envelopes, meshopt and per-asset budgets", () => {
  const root = resolve(process.cwd(), "../..");
  expect(() => execFileSync(process.execPath, ["scripts/audit-visual-assets.mjs", "--check"], {
    cwd: root, stdio: "pipe"
  })).not.toThrow();
});
