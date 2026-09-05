// Inspect actual exported GLBs, including stable control transforms and bounds.
// --baseline reads the unmodified milestone parent from Git; no checkout needed.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../packages/app/package.json', import.meta.url));
const { Matrix4, Vector3, Quaternion, Box3 } = require('three');
const baseline = process.argv.includes('--baseline');
const checkOnly = process.argv.includes('--check');
const dir = 'packages/app/src/assets/models';
const results = {};
for (const file of readdirSync(dir).filter(f => f.endsWith('.glb')).sort()) {
  const data = baseline ? execFileSync('git', ['show', `4f21849:${dir}/${file}`], { maxBuffer: 8*1024*1024 }) : readFileSync(`${dir}/${file}`);
  const gltf = JSON.parse(data.subarray(20, 20+data.readUInt32LE(12)).toString());
  if (data.readUInt32LE(0) !== 0x46546c67 || data.readUInt32LE(8) !== data.length) throw new Error(`Invalid GLB ${file}`);
  if (!gltf.extensionsRequired?.includes('EXT_meshopt_compression')) throw new Error(`Uncompressed asset: ${file}`);
  for (const node of gltf.nodes) {
    if (node.name?.includes('FillColumn') && node.mesh === undefined) throw new Error(`Animated fill was batched: ${file} ${node.name}`);
  }
  const bounds = new Box3();
  const controls = {};
  const authoredControlPositions = {};
  const controlParents = {};
  let triangles = 0;
  let primitives = 0;
  const visit = (index, parent, parentName = null) => {
    const node = gltf.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(new Vector3(...(node.translation ?? [0,0,0])), new Quaternion(...(node.rotation ?? [0,0,0,1])), new Vector3(...(node.scale ?? [1,1,1])));
    const world = parent.clone().multiply(local);
    if (node.mesh === undefined && (baseline || node.extras?.selene_bind_world_m !== undefined)) {
      controls[node.name] = world.elements.map(v => Number(v.toFixed(5)));
      controlParents[node.name] = parentName;
      const authored = node.extras?.selene_bind_world_m;
      if (authored) {
        authoredControlPositions[node.name] = [authored[0], authored[2], -authored[1]];
        const actual = new Vector3().setFromMatrixPosition(world).toArray();
        if (actual.some((v, i) => Math.abs(v-authoredControlPositions[node.name][i]) > 0.0001)) throw new Error(`Collapsed or misplaced pivot: ${file} ${node.name}`);
      }
    }
    if (node.mesh !== undefined) for (const primitive of gltf.meshes[node.mesh].primitives) {
      const position = gltf.accessors[primitive.attributes.POSITION];
      const box = new Box3(new Vector3(...position.min), new Vector3(...position.max)).applyMatrix4(world);
      bounds.union(box);
      triangles += gltf.accessors[primitive.indices].count/3;
      primitives++;
    }
    for (const child of node.children ?? []) visit(child, world, node.name);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) visit(root, new Matrix4());
  results[file] = { bytes: data.length, triangles, primitives, boundsM: { min: bounds.min.toArray(), max: bounds.max.toArray() }, controls, controlParents, authoredControlPositions, extensions: gltf.extensionsRequired ?? [] };
}
mkdirSync('docs/performance', { recursive: true });
const path = `docs/performance/visual-assets-${baseline ? 'before' : 'after'}.json`;
if (!baseline) {
  const before = JSON.parse(readFileSync('docs/performance/visual-assets-before.json'));
  if (Object.keys(results).join('|') !== Object.keys(before).sort().join('|')) {
    throw new Error('Equipment library changed: explicitly review and update the asset baseline');
  }
  for (const [file, result] of Object.entries(results)) {
    for (const [name, matrix] of Object.entries(before[file].controls)) {
      if (!result.controls[name]) throw new Error(`Missing control: ${file} ${name}`);
      if (result.controlParents[name] !== before[file].controlParents[name]) throw new Error(`Control hierarchy changed: ${file} ${name}`);
      // Rig v1 accidentally collapsed empties to the origin. v2 preserves
      // names, rotation and scale, while checking translation against the
      // generator's declared world-space mounting point above.
      for (let i=0; i<12; i++) if (Math.abs(matrix[i]-result.controls[name][i]) > 0.0001) throw new Error(`Control basis changed: ${file} ${name}`);
    }
    if (result.bytes > before[file].bytes*1.3) throw new Error(`GLB payload exceeded +30% budget: ${file}`);
    if (result.triangles > before[file].triangles*1.35) throw new Error(`Triangle budget exceeded: ${file}`);
    for (const side of ['min', 'max']) for (let axis=0; axis<3; axis++) {
      if (Math.abs(result.boundsM[side][axis]-before[file].boundsM[side][axis]) > 0.25) throw new Error(`Envelope changed >25cm: ${file} ${side} ${axis}: ${before[file].boundsM[side][axis]} -> ${result.boundsM[side][axis]}`);
    }
  }
}
if (!checkOnly) writeFileSync(path, JSON.stringify(results, null, 2)+'\n');
console.table(Object.entries(results).map(([file, r]) => ({ file, bytes: r.bytes, triangles: r.triangles, primitives: r.primitives })));
