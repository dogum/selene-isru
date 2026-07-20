import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SCENE_COLORS } from "../bindings";
import { enableBloom } from "../layers";
import { Simplex2 } from "../simplex";
import { getMaterialTextures } from "../textures";

/* ---------------- materials ---------------- */

export interface MatOpts {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  aoMapIntensity?: number;
  envMapIntensity?: number;
  normalScale?: number;
  vertexColors?: boolean;
  roughness?: number;
  metalness?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
}

export function materialMaps(kind: "regolith" | "metal" | "panel"): Pick<
  MatOpts,
  "map" | "normalMap" | "roughnessMap" | "aoMap"
> {
  return getMaterialTextures(kind);
}

export function pbrMat(color: number, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color,
    map: opts.map,
    normalMap: opts.normalMap,
    roughnessMap: opts.roughnessMap,
    aoMap: opts.aoMap,
    aoMapIntensity: opts.aoMapIntensity ?? 0.8,
    envMapIntensity: opts.envMapIntensity ?? 0.32,
    vertexColors: opts.vertexColors ?? false,
    flatShading: false,
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0.1,
    emissive: opts.emissive ?? 0x000000,
    emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1
  });
  if (opts.normalScale !== undefined) {
    mat.normalScale.setScalar(opts.normalScale);
  }
  return mat;
}

export function flatMat(color: number, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  return pbrMat(color, opts);
}

export function facetMat(color: number, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const mat = pbrMat(color, opts);
  mat.flatShading = true;
  return mat;
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Partial<THREE.Mesh> & THREE.Object3D;
    if (mesh.geometry !== undefined) {
      (mesh.geometry as THREE.BufferGeometry).dispose();
    }
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      for (const m of material) {
        m.dispose();
      }
    } else if (material !== undefined) {
      material.dispose();
    }
  });
}

/** Collect every unique material under a root (for crossfades). */
export function materialsOf(root: THREE.Object3D): THREE.Material[] {
  const out = new Set<THREE.Material>();
  root.traverse((obj) => {
    const material = (obj as Partial<THREE.Mesh>).material as
      | THREE.Material
      | THREE.Material[]
      | undefined;
    if (Array.isArray(material)) {
      for (const m of material) {
        out.add(m);
      }
    } else if (material !== undefined) {
      out.add(material);
    }
  });
  return [...out];
}

/* ---------------- sky ---------------- */

export function makeStarfield(count: number, seed = 7): THREE.Group {
  const rand = (() => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // uniform on sphere shell, biased above horizon
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const r = 460 + rand() * 60;
    const sq = Math.sqrt(1 - u * u);
    positions[i * 3] = r * sq * Math.cos(phi);
    positions[i * 3 + 1] = Math.abs(r * u) - 40;
    positions[i * 3 + 2] = r * sq * Math.sin(phi);
    const b = 0.42 + rand() * 0.58;
    const warmth = rand();
    colors[i * 3] = b * (0.9 + warmth * 0.12);
    colors[i * 3 + 1] = b * (0.92 + warmth * 0.08);
    colors[i * 3 + 2] = b * (1.02 - warmth * 0.14);
    sizes[i] = rand() > 0.94 ? 2.2 + rand() * 1.1 : 0.8 + rand() * 1.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float size;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_PointSize = size;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = dot(d, d);
        if (r > 0.25) discard;
        float a = smoothstep(0.25, 0.02, r);
        gl_FragColor = vec4(vColor, a * 0.92);
      }
    `
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(makeMilkyWay(seed + 19));
  group.add(points);
  return group;
}

/** Procedural Earth sphere, low on the horizon (equatorial only). */
export function makeEarthSphere(): THREE.Group {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const simplex = new Simplex2(421);
    const image = ctx.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y++) {
      const v = y / canvas.height;
      for (let x = 0; x < canvas.width; x++) {
        const u = x / canvas.width;
        const lat = Math.abs(v - 0.5) * 2;
        const land =
          simplex.fbm(u * 5.2, v * 2.8, 5) +
          simplex.fbm((u + 8.1) * 14, (v - 3.2) * 8, 2) * 0.22;
        const cloud = simplex.fbm((u - 2.3) * 18, (v + 4.4) * 9, 3);
        const ice = lat > 0.78;
        const i = (y * canvas.width + x) * 4;
        const color = new THREE.Color(0x2b67a6);
        if (land > 0.08) {
          color.set(ice ? 0xf2f6ff : 0x5d7d48).lerp(new THREE.Color(0xb39f69), Math.max(0, land) * 0.45);
        }
        if (cloud > 0.42) {
          color.lerp(new THREE.Color(0xf4f7ff), Math.min(0.5, (cloud - 0.42) * 1.3));
        }
        image.data[i] = Math.round(color.r * 255);
        image.data[i + 1] = Math.round(color.g * 255);
        image.data[i + 2] = Math.round(color.b * 255);
        image.data[i + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(10.8, 48, 28),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.82,
      metalness: 0,
      emissive: 0x102544,
      emissiveIntensity: 0.08
    })
  );
  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(11.25, 48, 28),
    new THREE.MeshBasicMaterial({
      color: 0x7db9ff,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      depthWrite: false
    })
  );
  const group = new THREE.Group();
  group.add(atmosphere);
  group.add(earth);
  group.position.set(-180, 26, -420);
  group.rotation.y = -0.8;
  return group;
}

function makeMilkyWay(seed: number): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const image = ctx.createImageData(canvas.width, canvas.height);
    const simplex = new Simplex2(seed);
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const u = x / canvas.width;
        const v = y / canvas.height;
        const band = Math.exp(-((v - (0.5 + Math.sin(u * Math.PI * 2.1) * 0.12)) ** 2) / 0.018);
        const n = simplex.fbm(u * 18, v * 7, 4) * 0.5 + 0.5;
        const a = Math.round(Math.max(0, band * n - 0.2) * 42);
        const i = (y * canvas.width + x) * 4;
        image.data[i] = 150;
        image.data[i + 1] = 165;
        image.data[i + 2] = 190;
        image.data[i + 3] = a;
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(520, 48, 18),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending
    })
  );
  mesh.rotation.z = 0.38;
  mesh.frustumCulled = false;
  return mesh;
}

/** Soft radial glow texture for wisps / dust sprites. */
export function makeGlowTexture(rgb = "255,255,255"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, `rgba(${rgb},0.85)`);
    g.addColorStop(0.5, `rgba(${rgb},0.25)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function copyUvToAo(geo: THREE.BufferGeometry): void {
  const uv = geo.getAttribute("uv");
  if (uv !== undefined && geo.getAttribute("uv2") === undefined) {
    geo.setAttribute("uv2", uv.clone());
  }
}

export function roundedBox(width: number, height: number, depth: number, radius = 0.08, segments = 1): THREE.BufferGeometry {
  const geo = new RoundedBoxGeometry(width, height, depth, segments, radius);
  copyUvToAo(geo);
  return geo;
}

export function makeContactShadow(radiusX: number, radiusZ: number, opacity = 0.36): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const g = ctx.createRadialGradient(48, 48, 4, 48, 48, 46);
    g.addColorStop(0, "rgba(0,0,0,0.62)");
    g.addColorStop(0.55, "rgba(0,0,0,0.34)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 96, 96);
  }
  const texture = new THREE.CanvasTexture(canvas);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(radiusX * 2, radiusZ * 2), mat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -2;
  return shadow;
}

export interface RockScatterOptions {
  count: number;
  radiusX: number;
  radiusZ: number;
  center?: THREE.Vector3;
  y?: number;
  seed?: number;
  color?: number;
}

export function makeRockScatter(opts: RockScatterOptions): THREE.InstancedMesh {
  const rand = seeded(opts.seed ?? 31);
  const geo = new THREE.DodecahedronGeometry(0.42, 0);
  copyUvToAo(geo);
  const mat = facetMat(opts.color ?? SCENE_COLORS.regolithDark, {
    ...materialMaps("regolith"),
    roughness: 1,
    normalScale: 0.55,
    envMapIntensity: 0.12
  });
  const rocks = new THREE.InstancedMesh(geo, mat, opts.count);
  const center = opts.center ?? new THREE.Vector3();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const pos = new THREE.Vector3();
  for (let i = 0; i < opts.count; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    pos.set(
      center.x + Math.cos(a) * opts.radiusX * r,
      opts.y ?? center.y,
      center.z + Math.sin(a) * opts.radiusZ * r
    );
    q.setFromEuler(new THREE.Euler(rand() * Math.PI, rand() * Math.PI, rand() * Math.PI));
    const s = 0.35 + rand() * 0.9;
    scale.set(s * (0.7 + rand() * 0.8), s * (0.45 + rand() * 0.45), s * (0.7 + rand() * 0.7));
    m.compose(pos, q, scale);
    rocks.setMatrixAt(i, m);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  rocks.instanceMatrix.needsUpdate = true;
  return rocks;
}

export interface GreebleOptions {
  count?: number;
  radius?: number;
  height?: number;
  seed?: number;
  color?: number;
}

export function makeGreebles(opts: GreebleOptions = {}): THREE.Group {
  const rand = seeded(opts.seed ?? 71);
  const count = opts.count ?? 18;
  const radius = opts.radius ?? 2.4;
  const height = opts.height ?? 3;
  const boxCount = Math.ceil(count * 0.65);
  const pipeCount = count - boxCount;
  const mat = flatMat(opts.color ?? SCENE_COLORS.metalDark, {
    ...materialMaps("metal"),
    metalness: 0.4,
    roughness: 0.55,
    normalScale: 0.22,
    envMapIntensity: 0.5
  });
  const group = new THREE.Group();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const pos = new THREE.Vector3();

  const boxes = new THREE.InstancedMesh(roundedBox(0.46, 0.18, 0.24, 0.035, 1), mat, boxCount);
  for (let i = 0; i < boxCount; i++) {
    const a = (i / Math.max(1, boxCount)) * Math.PI * 2 + (rand() - 0.5) * 0.35;
    pos.set(Math.cos(a) * radius, 0.45 + rand() * height, Math.sin(a) * radius);
    q.setFromEuler(new THREE.Euler(0, -a, 0));
    s.set(0.7 + rand() * 1.4, 0.55 + rand() * 1.2, 0.65 + rand() * 1.1);
    m.compose(pos, q, s);
    boxes.setMatrixAt(i, m);
  }
  boxes.castShadow = true;
  group.add(boxes);

  const pipes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.055, 0.055, 0.72, 7), mat, pipeCount);
  for (let i = 0; i < pipeCount; i++) {
    const a = (i / Math.max(1, pipeCount)) * Math.PI * 2 + rand() * 0.5;
    pos.set(Math.cos(a) * radius * 1.03, 0.5 + rand() * height, Math.sin(a) * radius * 1.03);
    q.setFromEuler(new THREE.Euler(Math.PI / 2, 0, -a));
    s.setScalar(0.75 + rand() * 0.9);
    m.compose(pos, q, s);
    pipes.setMatrixAt(i, m);
  }
  pipes.castShadow = true;
  group.add(pipes);

  return group;
}

export interface BoltRingOptions {
  radius: number;
  y?: number;
  count: number;
  size?: number;
  color?: number;
}

export function makeBoltRing(opts: BoltRingOptions): THREE.InstancedMesh {
  const size = opts.size ?? 0.11;
  const mat = flatMat(opts.color ?? SCENE_COLORS.metalDark, {
    ...materialMaps("metal"),
    metalness: 0.5,
    roughness: 0.48,
    envMapIntensity: 0.5
  });
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(size, size * 0.82, size * 0.18, 6), mat, opts.count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (let i = 0; i < opts.count; i++) {
    const a = (i / opts.count) * Math.PI * 2;
    p.set(Math.cos(a) * opts.radius, opts.y ?? 0, Math.sin(a) * opts.radius);
    q.setFromEuler(new THREE.Euler(0, -a, 0));
    m.compose(p, q, s);
    bolts.setMatrixAt(i, m);
  }
  bolts.castShadow = true;
  bolts.instanceMatrix.needsUpdate = true;
  return bolts;
}

export function makeRibBands(radius: number, height: number, count: number, color = SCENE_COLORS.metalDark): THREE.Group {
  const group = new THREE.Group();
  const mat = flatMat(color, {
    ...materialMaps("metal"),
    metalness: 0.44,
    roughness: 0.52,
    envMapIntensity: 0.48
  });
  for (let i = 0; i < count; i++) {
    const y = ((i + 1) / (count + 1)) * height;
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 8, 64), mat);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    band.castShadow = true;
    group.add(band);
  }
  return group;
}

export function makeLadder(height: number, width = 0.62, rungs = 8, color = SCENE_COLORS.metal): THREE.Group {
  const group = new THREE.Group();
  const mat = flatMat(color, {
    ...materialMaps("metal"),
    metalness: 0.46,
    roughness: 0.48,
    envMapIntensity: 0.5
  });
  const railGeo = new THREE.CylinderGeometry(0.035, 0.035, height, 6);
  for (const x of [-width / 2, width / 2]) {
    const rail = new THREE.Mesh(railGeo, mat);
    rail.position.set(x, height / 2, 0);
    rail.castShadow = true;
    group.add(rail);
  }
  const rungGeo = roundedBox(width + 0.18, 0.055, 0.06, 0.018, 1);
  const rungMesh = new THREE.InstancedMesh(rungGeo, mat, rungs);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < rungs; i++) {
    const y = ((i + 1) / (rungs + 1)) * height;
    m.compose(new THREE.Vector3(0, y, 0), q, s);
    rungMesh.setMatrixAt(i, m);
  }
  rungMesh.castShadow = true;
  rungMesh.instanceMatrix.needsUpdate = true;
  group.add(rungMesh);
  return group;
}

export function makeCableRun(points: THREE.Vector3[], color = SCENE_COLORS.metalDark, radius = 0.055): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, Math.max(12, points.length * 10), radius, 6, false);
  const mat = flatMat(color, {
    ...materialMaps("metal"),
    metalness: 0.34,
    roughness: 0.62,
    envMapIntensity: 0.42
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return mesh;
}

export interface EquipmentClusterOptions {
  count: number;
  width: number;
  depth: number;
  seed?: number;
  color?: number;
}

export function makeEquipmentCluster(opts: EquipmentClusterOptions): THREE.InstancedMesh {
  const rand = seeded(opts.seed ?? 101);
  const geo = roundedBox(0.58, 0.32, 0.42, 0.045, 1);
  const mat = flatMat(opts.color ?? SCENE_COLORS.metalDark, {
    ...materialMaps("metal"),
    metalness: 0.38,
    roughness: 0.58,
    normalScale: 0.2,
    envMapIntensity: 0.48
  });
  const cluster = new THREE.InstancedMesh(geo, mat, opts.count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < opts.count; i++) {
    p.set((rand() - 0.5) * opts.width, 0.18, (rand() - 0.5) * opts.depth);
    q.setFromEuler(new THREE.Euler(0, rand() * Math.PI * 2, 0));
    s.set(0.7 + rand() * 1.1, 0.7 + rand() * 1.6, 0.7 + rand() * 1.2);
    m.compose(p, q, s);
    cluster.setMatrixAt(i, m);
  }
  cluster.castShadow = true;
  cluster.instanceMatrix.needsUpdate = true;
  return cluster;
}

export function makeScuffedRegolith(width: number, depth: number, seed = 1, opacity = 0.42): THREE.Mesh {
  const rand = seeded(seed);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 180; i++) {
      const x = rand() * canvas.width;
      const y = rand() * canvas.height;
      const rx = 6 + rand() * 38;
      const ry = 1 + rand() * 8;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((rand() - 0.5) * 0.8);
      ctx.fillStyle = `rgba(20,18,16,${0.035 + rand() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 34; i++) {
      const x = rand() * canvas.width;
      const y = rand() * canvas.height;
      const r = 2 + rand() * 7;
      ctx.fillStyle = `rgba(240,232,210,${0.025 + rand() * 0.05})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = -1;
  return mesh;
}

export interface TrackLoopOptions {
  center: THREE.Vector3;
  radiusX: number;
  radiusZ: number;
  y: number;
  segments: number;
  trackSpacing?: number;
  treadWidth?: number;
  opacity?: number;
}

export function makeTrackLoop(opts: TrackLoopOptions): THREE.InstancedMesh {
  const count = opts.segments * 2;
  const treadWidth = opts.treadWidth ?? 0.32;
  const trackSpacing = opts.trackSpacing ?? 0.82;
  const segmentLen = (Math.PI * (opts.radiusX + opts.radiusZ)) / opts.segments;
  const geo = new THREE.PlaneGeometry(segmentLen * 0.78, treadWidth);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x211f1c,
    transparent: true,
    opacity: opts.opacity ?? 0.34,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const tracks = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let idx = 0;
  for (let i = 0; i < opts.segments; i++) {
    const a = (i / opts.segments) * Math.PI * 2;
    tangent.set(-opts.radiusX * Math.sin(a), 0, opts.radiusZ * Math.cos(a)).normalize();
    normal.set(-tangent.z, 0, tangent.x);
    const yaw = -Math.atan2(tangent.z, tangent.x);
    q.setFromEuler(new THREE.Euler(0, yaw, 0));
    for (const side of [-1, 1]) {
      p.set(
        opts.center.x + Math.cos(a) * opts.radiusX + normal.x * trackSpacing * side * 0.5,
        opts.y,
        opts.center.z + Math.sin(a) * opts.radiusZ + normal.z * trackSpacing * side * 0.5
      );
      m.compose(p, q, s);
      tracks.setMatrixAt(idx, m);
      idx += 1;
    }
  }
  tracks.instanceMatrix.needsUpdate = true;
  tracks.renderOrder = -1;
  return tracks;
}

export function makeCraterStrata(radii: number[], yForRadius: (radius: number) => number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0x0e1118,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  radii.forEach((radius, i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035 + i * 0.004, 5, 160), mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = yForRadius(radius) + 0.08;
    ring.scale.z = 0.96 + i * 0.01;
    ring.renderOrder = -1;
    group.add(ring);
  });
  return group;
}

/* ---------------- terrain ---------------- */

export interface TerrainOpts {
  /** extra carve applied after noise: return height delta for (x, z) */
  carve?: (x: number, z: number, h: number) => number;
  noiseAmp?: number;
  noiseScale?: number;
  /** plane subdivisions per side (quality-driven) */
  segments?: number;
}

export type TerrainHeightSampler = (x: number, z: number) => number;

/** Deterministic height function shared by terrain geometry and grounded assets. */
export function makeTerrainHeightSampler(opts: TerrainOpts = {}): TerrainHeightSampler {
  const simplex = new Simplex2(1969);
  const amp = opts.noiseAmp ?? 1.2;
  const scale = opts.noiseScale ?? 0.018;
  return (x: number, z: number): number => {
    let h = simplex.fbm(x * scale, z * scale, 4) * amp;
    h += simplex.fbm(x * scale * 6, z * scale * 6, 2) * amp * 0.18;
    return opts.carve?.(x, z, h) ?? h;
  };
}

export function makeTerrain(opts: TerrainOpts = {}): THREE.Mesh {
  const sampleHeight = makeTerrainHeightSampler(opts);
  const segments = opts.segments ?? 200;
  const geo = new THREE.PlaneGeometry(240, 240, segments, segments);
  geo.rotateX(-Math.PI / 2);
  copyUvToAo(geo);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, sampleHeight(x, z));
  }
  geo.computeVertexNormals();

  // Vertex colors act as a neutral slope tint; the generated albedo map carries the regolith color.
  const base = new THREE.Color(0xe0ddd6);
  const dark = new THREE.Color(0xb2aba1);
  const colors = new Float32Array(pos.count * 3);
  const normals = geo.attributes.normal as THREE.BufferAttribute;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const slope = 1 - Math.abs(normals.getY(i));
    c.copy(base).lerp(dark, Math.min(0.62, slope * 1.7));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mat = pbrMat(0xffffff, {
    ...materialMaps("regolith"),
    vertexColors: true,
    roughness: 1,
    metalness: 0,
    normalScale: 0.48,
    aoMapIntensity: 0.2,
    envMapIntensity: 0.14
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

/* ---------------- rovers ---------------- */

export interface Rover {
  group: THREE.Group;
  /** articulated tool (bucket-drum / digging arm) for jitter or spin */
  arm: THREE.Object3D;
}

export function makeRover(bodyColor: number, withDrum: boolean): Rover {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    roundedBox(2.4, 0.9, 1.5, 0.16, 2),
    flatMat(bodyColor, { ...materialMaps("metal"), metalness: 0.3, roughness: 0.7, normalScale: 0.2 })
  );
  body.position.y = 0.95;
  body.castShadow = true;
  group.add(body);

  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 18);
  wheelGeo.rotateX(Math.PI / 2);
  const wheelMat = flatMat(SCENE_COLORS.metalDark, {
    ...materialMaps("metal"),
    roughness: 0.95,
    normalScale: 0.35
  });
  for (const sx of [-0.85, 0.85]) {
    for (const sz of [-0.85, 0.85]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(sx, 0.42, sz);
      group.add(wheel);
    }
  }

  const arm = new THREE.Group();
  if (withDrum) {
    const boom = new THREE.Mesh(
      roundedBox(1.3, 0.18, 0.3, 0.05, 1),
      flatMat(SCENE_COLORS.metal, { ...materialMaps("metal"), metalness: 0.35, roughness: 0.58 })
    );
    boom.position.set(0.65, 0, 0);
    arm.add(boom);
    const drumGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.3, 10);
    drumGeo.rotateX(Math.PI / 2);
    const drum = new THREE.Mesh(
      drumGeo,
      flatMat(SCENE_COLORS.metal, { ...materialMaps("metal"), metalness: 0.4, roughness: 0.6 })
    );
    drum.position.set(1.45, -0.25, 0);
    drum.castShadow = true;
    arm.add(drum);
  } else {
    const bed = new THREE.Mesh(
      roundedBox(1.6, 0.4, 1.2, 0.08, 1),
      flatMat(SCENE_COLORS.metalDark, { ...materialMaps("metal"), metalness: 0.28, roughness: 0.64 })
    );
    bed.position.set(-0.2, 0.35, 0);
    arm.add(bed);
  }
  arm.position.set(1.1, 0.95, 0);
  group.add(arm);
  return { group, arm };
}

/* ---------------- lander ---------------- */

export function makeLander(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = flatMat(0xb9bec7, {
    ...materialMaps("metal"),
    metalness: 0.5,
    roughness: 0.45,
    envMapIntensity: 0.62,
    normalScale: 0.18
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 4.6, 32), bodyMat);
  body.position.y = 3.4;
  body.castShadow = true;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1.4, 32), bodyMat);
  nose.position.y = 6.4;
  group.add(nose);
  const nozzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.95, 1.1, 32, 1, true),
    flatMat(SCENE_COLORS.metalDark, {
      ...materialMaps("metal"),
      metalness: 0.6,
      roughness: 0.5,
      envMapIntensity: 0.5
    })
  );
  nozzle.position.y = 0.65;
  group.add(nozzle);
  const legMat = flatMat(SCENE_COLORS.metal, { ...materialMaps("metal"), metalness: 0.42, roughness: 0.5 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), legMat);
    leg.position.set(Math.cos(a) * 1.9, 1.25, Math.sin(a) * 1.9);
    leg.rotation.z = Math.cos(a) * 0.5;
    leg.rotation.x = -Math.sin(a) * 0.5;
    group.add(leg);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 8), legMat);
    foot.position.set(Math.cos(a) * 2.6, 0.06, Math.sin(a) * 2.6);
    group.add(foot);
  }
  return group;
}

/* ---------------- habitat ---------------- */

export interface Habitat {
  group: THREE.Group;
  setShieldSteps(steps: number): void;
}

export function makeHabitat(): Habitat {
  const group = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 40, 22, 0, Math.PI * 2, 0, Math.PI / 2),
    flatMat(0xc9cdd4, {
      ...materialMaps("metal"),
      metalness: 0.35,
      roughness: 0.55,
      envMapIntensity: 0.5,
      normalScale: 0.15
    })
  );
  dome.castShadow = true;
  group.add(dome);
  const door = new THREE.Mesh(
    roundedBox(1.2, 1.5, 0.5, 0.08, 1),
    flatMat(SCENE_COLORS.metalDark, { ...materialMaps("metal"), metalness: 0.35, roughness: 0.6 })
  );
  door.position.set(0, 0.75, 3.1);
  group.add(door);

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(3.5, 40, 22, 0, Math.PI * 2, 0, Math.PI / 2.6),
    flatMat(SCENE_COLORS.regolithDark, {
      ...materialMaps("regolith"),
      roughness: 1,
      normalScale: 0.65,
      envMapIntensity: 0.12
    })
  );
  shell.castShadow = true;
  group.add(shell);

  let currentSteps = -1;
  return {
    group,
    setShieldSteps(steps: number): void {
      if (steps === currentSteps) {
        return;
      }
      currentSteps = steps;
      const scale = 1 + steps * 0.055;
      shell.scale.setScalar(scale);
    }
  };
}

/* ---------------- cryo tank farm ---------------- */

interface Tank {
  shell: THREE.Mesh;
  fill: THREE.Mesh;
  wisps: THREE.Sprite[];
  phase: number;
}

export class TankFarm {
  readonly group = new THREE.Group();
  private tanks: Tank[] = [];
  private wispRate = 0;
  private fillMat: THREE.MeshStandardMaterial;
  private visibleCount = 0;

  constructor(cap: number, glowTexture: THREE.Texture) {
    const shellMat = flatMat(0xd4d8de, {
      ...materialMaps("metal"),
      metalness: 0.45,
      roughness: 0.4,
      transparent: true,
      opacity: 0.55,
      envMapIntensity: 0.65
    });
    this.fillMat = flatMat(SCENE_COLORS.cryo, {
      emissive: SCENE_COLORS.cryo,
      emissiveIntensity: 0.4,
      roughness: 0.5
    });
    const cradleMat = flatMat(SCENE_COLORS.metalDark, {
      ...materialMaps("metal"),
      metalness: 0.3,
      roughness: 0.7
    });
    for (let i = 0; i < cap; i++) {
      const x = (i % 4) * 5.2 - 7.8;
      const z = Math.floor(i / 4) * 5.2;
      const tank = new THREE.Group();
      tank.position.set(x, 0, z);

      const cradle = new THREE.Mesh(roundedBox(3.4, 0.8, 3.4, 0.14, 1), cradleMat);
      cradle.position.y = 0.4;
      tank.add(cradle);

      const shell = new THREE.Mesh(new THREE.SphereGeometry(2, 36, 22), shellMat);
      shell.position.y = 2.9;
      shell.castShadow = true;
      tank.add(shell);

      const fill = new THREE.Mesh(new THREE.SphereGeometry(1.82, 32, 20), this.fillMat);
      fill.position.y = 2.9;
      enableBloom(fill);
      tank.add(fill);

      const band = makeRibBands(2.02, 0.1, 1, SCENE_COLORS.metalDark);
      band.position.y = 2.88;
      tank.add(band);
      const valve = makeEquipmentCluster({ count: 3, width: 1.5, depth: 0.45, seed: 210 + i });
      valve.position.set(0, 4.82, 1.62);
      tank.add(valve);

      const wisps: THREE.Sprite[] = [];
      for (let w = 0; w < 2; w++) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: glowTexture,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            color: SCENE_COLORS.cryo
          })
        );
        sprite.scale.setScalar(1.2);
        sprite.position.set(0, 5.2 + w * 1.4, 0);
        enableBloom(sprite);
        tank.add(sprite);
        wisps.push(sprite);
      }

      this.group.add(tank);
      this.tanks.push({ shell, fill, wisps, phase: i * 1.37 });
      tank.visible = false;
    }
  }

  setCount(n: number): void {
    if (n === this.visibleCount) {
      return;
    }
    this.visibleCount = n;
    this.tanks.forEach((t, i) => {
      t.shell.parent!.visible = i < n;
    });
  }

  setFill(fraction: number): void {
    const s = Math.max(0.06, fraction);
    for (const t of this.tanks) {
      t.fill.scale.setScalar(s);
      t.fill.position.y = 2.9 - (1 - s) * 1.5;
    }
  }

  setWispRate(rate: number): void {
    this.wispRate = rate;
  }

  /** returns true while wisps are animating */
  tick(t: number): boolean {
    if (this.wispRate <= 0.01) {
      for (const tank of this.tanks) {
        for (const w of tank.wisps) {
          w.material.opacity = 0;
        }
      }
      return false;
    }
    for (const tank of this.tanks) {
      tank.wisps.forEach((w, i) => {
        const u = ((t * 0.25 + tank.phase + i * 0.5) % 1 + 1) % 1;
        w.position.y = 5 + u * 3.2;
        w.material.opacity = this.wispRate * 0.5 * Math.sin(u * Math.PI);
      });
    }
    return true;
  }
}

/* ---------------- power station (nuclear monolith) ---------------- */

export interface MonolithStation {
  group: THREE.Group;
  setRadiatorScale(s: number): void;
}

export function makeMonolithStation(): MonolithStation {
  const group = new THREE.Group();
  const monolith = new THREE.Mesh(
    roundedBox(2.4, 9, 1.8, 0.18, 2),
    flatMat(0x14161c, {
      ...materialMaps("metal"),
      metalness: 0.6,
      roughness: 0.35,
      envMapIntensity: 0.64
    })
  );
  monolith.position.y = 4.5;
  monolith.castShadow = true;
  group.add(monolith);

  const edge = new THREE.Mesh(
    roundedBox(2.5, 0.12, 1.9, 0.035, 1),
    flatMat(SCENE_COLORS.fission, { emissive: SCENE_COLORS.fission, emissiveIntensity: 0.9 })
  );
  edge.position.y = 9.05;
  enableBloom(edge);
  group.add(edge);

  const wingMat = flatMat(0x16181d, {
    ...materialMaps("metal"),
    metalness: 0.5,
    roughness: 0.5,
    emissive: SCENE_COLORS.fission,
    emissiveIntensity: 0.03
  });
  wingMat.side = THREE.DoubleSide;
  const edgeMat = flatMat(SCENE_COLORS.fission, {
    emissive: SCENE_COLORS.fission,
    emissiveIntensity: 0.7
  });
  const wings: THREE.Mesh[] = [];
  const WING_W = 5.6;
  for (const dir of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(WING_W, 4.6), wingMat);
    wing.position.set(dir * 4.2, 5.6, 0);
    wing.castShadow = true;
    const tip = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 4.6), edgeMat);
    tip.position.x = (dir * WING_W) / 2;
    enableBloom(tip);
    wing.add(tip);
    group.add(wing);
    wings.push(wing);
  }

  return {
    group,
    setRadiatorScale(s: number): void {
      for (const wing of wings) {
        wing.scale.x = s;
        const dir = Math.sign(wing.position.x);
        wing.position.x = dir * (1.3 + (WING_W * s) / 2);
        // keep the tip edge unstretched
        const tip = wing.children[0];
        tip.scale.x = 1 / s;
      }
    }
  };
}

/* ---------------- solar panel field ---------------- */

export interface PanelField {
  group: THREE.Group;
  mesh: THREE.InstancedMesh;
  setCount(n: number): void;
}

export function makePanelField(cap: number, sunElevationRad: number): PanelField {
  const geo = roundedBox(2.6, 0.08, 1.6, 0.025, 1);
  const mat = flatMat(0xffffff, {
    ...materialMaps("panel"),
    metalness: 0.55,
    roughness: 0.28,
    envMapIntensity: 0.7,
    normalScale: 0.35
  });
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.castShadow = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-(Math.PI / 2 - sunElevationRad) * 0.6, 0, 0)
  );
  const s = new THREE.Vector3(1, 1, 1);
  const cols = 20;
  for (let i = 0; i < cap; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const pos = new THREE.Vector3(
      (col - cols / 2) * 3.1 + ((row % 2) * 1.4),
      1.05,
      row * 2.6
    );
    m.compose(pos, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.count = 0;
  mesh.instanceMatrix.needsUpdate = true;

  const group = new THREE.Group();
  group.add(mesh);
  // pole supports are implied at this scale; keep draw calls low
  return {
    group,
    mesh,
    setCount(n: number): void {
      if (mesh.count !== n) {
        mesh.count = n;
      }
    }
  };
}

/* ---------------- emissive power line ---------------- */

export function makePowerLine(points: THREE.Vector3[], color: number): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, 24, 0.07, 5, false);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.4,
    depthWrite: false
  });
  const line = new THREE.Mesh(geo, mat);
  enableBloom(line);
  return line;
}
