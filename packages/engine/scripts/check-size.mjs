import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
const limitBytes = 50 * 1024;

function jsSize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      total += jsSize(path);
    } else if (path.endsWith(".js")) {
      const source = readFileSync(path, "utf8");
      total += source.replace(/\/\/.*$/gm, "").replace(/\s+/g, "").length;
    }
  }
  return total;
}

const total = jsSize(dist);
if (total > limitBytes) {
  throw new Error(`engine JavaScript output is ${total} bytes, above ${limitBytes}`);
}

console.log(`engine estimated minified JavaScript output: ${total} bytes`);
