import * as THREE from "three";
import { SCENE_COLORS, type SiteMode } from "./bindings";
import { Simplex2 } from "./simplex";

export interface MaterialTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  aoMap: THREE.Texture;
}

export interface ProceduralEnvironment {
  texture: THREE.Texture;
  dispose(): void;
}

type TextureKind = "regolith" | "metal" | "panel";

const textureCache = new Map<TextureKind, MaterialTextureSet>();
let textureAnisotropy = 4;

export function setProceduralTextureAnisotropy(max: number): void {
  textureAnisotropy = Math.max(1, Math.min(8, Math.floor(max)));
  for (const set of textureCache.values()) {
    for (const texture of Object.values(set)) {
      texture.anisotropy = textureAnisotropy;
      texture.needsUpdate = true;
    }
  }
}

export function getMaterialTextures(kind: TextureKind): MaterialTextureSet {
  const cached = textureCache.get(kind);
  if (cached !== undefined) {
    return cached;
  }
  const set =
    kind === "regolith" ? makeRegolithTextures() : kind === "metal" ? makeMetalTextures() : makePanelTextures();
  textureCache.set(kind, set);
  return set;
}

export function disposeProceduralTextures(): void {
  for (const set of textureCache.values()) {
    for (const texture of Object.values(set)) {
      texture.dispose();
    }
  }
  textureCache.clear();
}

export function makeProceduralEnvironment(
  renderer: THREE.WebGLRenderer,
  site: SiteMode
): ProceduralEnvironment {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
    sky.addColorStop(0, "#020407");
    sky.addColorStop(0.42, "#060a12");
    sky.addColorStop(0.72, site === "equatorial" ? "#101827" : "#05070c");
    sky.addColorStop(1, "#010205");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const rand = seeded(site === "equatorial" ? 812 : 1217);
    for (let i = 0; i < 900; i++) {
      const x = rand() * canvas.width;
      const y = Math.pow(rand(), 1.7) * canvas.height * 0.78;
      const b = 110 + rand() * 145;
      const alpha = 0.18 + rand() * 0.5;
      ctx.fillStyle = `rgba(${b},${b},${Math.min(255, b + 20)},${alpha})`;
      ctx.fillRect(x, y, rand() < 0.08 ? 1.8 : 1, rand() < 0.08 ? 1.8 : 1);
    }

    if (site === "equatorial") {
      const fill = ctx.createRadialGradient(96, 164, 6, 96, 164, 94);
      fill.addColorStop(0, "rgba(125,170,225,0.42)");
      fill.addColorStop(0.55, "rgba(55,90,145,0.18)");
      fill.addColorStop(1, "rgba(15,25,45,0)");
      ctx.fillStyle = fill;
      ctx.fillRect(0, 70, 220, 170);
    }
  }

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromEquirectangular(source);
  source.dispose();
  pmrem.dispose();
  return {
    texture: target.texture,
    dispose(): void {
      target.dispose();
    }
  };
}

function makeRegolithTextures(): MaterialTextureSet {
  const height = makeHeightField(192, 1969, 9.5, 5);
  return makeSet(
    height,
    (h, n, x, y) => {
      const base = new THREE.Color(SCENE_COLORS.regolith).lerp(new THREE.Color(0x5f5b55), 0.28);
      const dark = new THREE.Color(SCENE_COLORS.regolithDark);
      const c = dark.lerp(base, 0.56 + h * 0.36 + n * 0.08);
      if (((x * 37 + y * 17) & 31) === 0) {
        c.offsetHSL(0, 0, 0.08);
      }
      return c;
    },
    (h, n) => 0.84 + h * 0.13 + n * 0.03,
    (h) => 0.72 + h * 0.22,
    20,
    2.4
  );
}

function makeMetalTextures(): MaterialTextureSet {
  const height = makeHeightField(128, 511, 5.25, 4, (x, y) => Math.sin(x * 80) * 0.035 + Math.sin(y * 17) * 0.02);
  return makeSet(
    height,
    (h, n, x) => {
      const line = ((x % 16) / 16) * 0.08;
      return new THREE.Color(0x808895).lerp(new THREE.Color(0x30353d), 0.34 + (1 - h) * 0.26 + n * 0.08 + line);
    },
    (h, n) => 0.42 + (1 - h) * 0.28 + n * 0.08,
    (h) => 0.82 + h * 0.12,
    5,
    2.2
  );
}

function makePanelTextures(): MaterialTextureSet {
  const height = makeHeightField(128, 904, 3.5, 3, (x, y) => {
    const gx = Math.min(x % 0.125, 0.125 - (x % 0.125));
    const gy = Math.min(y % 0.25, 0.25 - (y % 0.25));
    return gx < 0.008 || gy < 0.008 ? 0.18 : 0;
  });
  return makeSet(
    height,
    (h, n, x, y) => {
      const grid = x % 16 === 0 || y % 32 === 0 ? 0.55 : 0;
      return new THREE.Color(0x262b33).lerp(new THREE.Color(SCENE_COLORS.solar), 0.18 + h * 0.12 + grid + n * 0.04);
    },
    (h) => 0.22 + (1 - h) * 0.18,
    (h) => 0.9 + h * 0.08,
    4,
    2.8
  );
}

function makeSet(
  height: Float32Array,
  albedo: (h: number, n: number, x: number, y: number) => THREE.Color,
  roughness: (h: number, n: number, x: number, y: number) => number,
  ao: (h: number, n: number, x: number, y: number) => number,
  repeat: number,
  normalStrength: number
): MaterialTextureSet {
  const size = Math.sqrt(height.length);
  const noise = makeHeightField(size, 3001, 24, 2);
  const map = imageTexture(size, THREE.SRGBColorSpace, repeat, (data, x, y, i) => {
    const h = height[i];
    const n = noise[i] - 0.5;
    const color = albedo(h, n, x, y);
    data[i * 4] = Math.round(color.r * 255);
    data[i * 4 + 1] = Math.round(color.g * 255);
    data[i * 4 + 2] = Math.round(color.b * 255);
    data[i * 4 + 3] = 255;
  });
  const normalMap = imageTexture(size, THREE.NoColorSpace, repeat, (data, x, y, i) => {
    const l = height[y * size + ((x - 1 + size) % size)];
    const r = height[y * size + ((x + 1) % size)];
    const d = height[((y - 1 + size) % size) * size + x];
    const u = height[((y + 1) % size) * size + x];
    const normal = new THREE.Vector3((l - r) * normalStrength, 2, (d - u) * normalStrength).normalize();
    data[i * 4] = Math.round((normal.x * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((normal.y * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round((normal.z * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  });
  const roughnessMap = scalarTexture(size, repeat, (x, y, i) => roughness(height[i], noise[i] - 0.5, x, y));
  const aoMap = scalarTexture(size, repeat, (x, y, i) => ao(height[i], noise[i] - 0.5, x, y));
  return { map, normalMap, roughnessMap, aoMap };
}

function imageTexture(
  size: number,
  colorSpace: THREE.ColorSpace,
  repeat: number,
  fill: (data: Uint8ClampedArray, x: number, y: number, i: number) => void
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx !== null) {
    const image = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        fill(image.data, x, y, y * size + x);
      }
    }
    ctx.putImageData(image, 0, 0);
  }
  return configureTexture(new THREE.CanvasTexture(canvas), colorSpace, repeat);
}

function scalarTexture(size: number, repeat: number, sample: (x: number, y: number, i: number) => number): THREE.CanvasTexture {
  return imageTexture(size, THREE.NoColorSpace, repeat, (data, x, y, i) => {
    const v = Math.round(THREE.MathUtils.clamp(sample(x, y, i), 0, 1) * 255);
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
}

function configureTexture(texture: THREE.CanvasTexture, colorSpace: THREE.ColorSpace, repeat: number): THREE.CanvasTexture {
  texture.colorSpace = colorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = textureAnisotropy;
  texture.needsUpdate = true;
  return texture;
}

function makeHeightField(
  size: number,
  seed: number,
  scale: number,
  octaves: number,
  detail: (x: number, y: number) => number = () => 0
): Float32Array {
  const simplex = new Simplex2(seed);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const h =
        simplex.fbm(u * scale, v * scale, octaves) * 0.5 +
        simplex.fbm((u + 10.31) * scale * 4, (v - 5.91) * scale * 4, 2) * 0.12 +
        detail(u, v);
      out[y * size + x] = THREE.MathUtils.clamp(0.5 + h, 0, 1);
    }
  }
  return out;
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
