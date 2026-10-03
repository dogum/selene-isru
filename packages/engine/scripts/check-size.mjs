import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = fileURLToPath(new URL("../dist", import.meta.url));
// The custom-site engine includes its versioned schema, graph compiler,
// installed-capacity evaluator, and disclosed cable/haul spatial models. It
// remains dependency-free; this narrow post-Milestone-5 increase still catches
// accidental bulk.
// 144 -> 160 KiB (v0.4 model fidelity): the polar capture/heater/extractor
// terms and per-stream storage provenance moved hard-coded property tables
// into constants.json, so their values, units, bounds, and sources now ship
// with the generated metadata. Still zero runtime dependencies.
// 160 -> 176 KiB (v0.6-v0.7 demand and propellant): the polar propellant
// chain, the refuelling-demand model and its tank-drawdown timeline, and the
// cited vehicle, delta-v, and liquefier parameters that ship with them. Still
// zero runtime dependencies.
const limitBytes = 176 * 1024;

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
