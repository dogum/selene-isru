import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { disposeProceduralTextures, getMaterialTextures } from "../src/viewer/textures";
import { makeRockScatter, makeTerrain, makeTerrainHeightSampler, makeTrackLoop } from "../src/viewer/dioramas/shared";

function canvasStub(): void {
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = { width: 0, height: 0, pixels: new Uint8ClampedArray(), getContext: () => ({
        createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width*height*4) }),
        putImageData: (image: { data: Uint8ClampedArray }) => { canvas.pixels = new Uint8ClampedArray(image.data); }
      }) };
      return canvas;
    }
  });
}

afterEach(() => { disposeProceduralTextures(); vi.unstubAllGlobals(); });

describe("procedural surface contract", () => {
  it("encodes tangent normals facing outward, separately from sRGB albedo", () => {
    canvasStub();
    const textures = getMaterialTextures("regolith");
    expect(textures.map.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.normalMap.colorSpace).toBe(THREE.NoColorSpace);
    const pixels = (textures.normalMap.image as { pixels: Uint8ClampedArray }).pixels;
    let x = 0, y = 0, z = 0;
    for (let i=0; i<pixels.length; i+=4) {
      x += pixels[i]; y += pixels[i+1]; z += pixels[i+2];
    }
    const count = pixels.length/4;
    expect(x/count).toBeCloseTo(127.5, 0);
    expect(y/count).toBeCloseTo(127.5, 0);
    expect(z/count).toBeGreaterThan(245);
    const albedo = (textures.map.image as { pixels: Uint8ClampedArray }).pixels;
    expect(albedo[0]).toBeGreaterThan(60); // catch accidental double sRGB decoding
  });

  it("uses exactly the same seeded elevation for terrain vertices and placements", () => {
    canvasStub();
    const opts = { segments: 16, noiseAmp: 1.2, carve: (x: number, z: number, h: number) => Math.hypot(x,z)<20 ? 0.4 : h };
    const sample = makeTerrainHeightSampler(opts);
    const terrain = makeTerrain(opts);
    const positions = terrain.geometry.attributes.position;
    for (let i=0; i<positions.count; i++) {
      expect(positions.getY(i)).toBeCloseTo(sample(positions.getX(i), positions.getZ(i)), 5);
    }
    expect(terrain.castShadow).toBe(true);
    expect(terrain.receiveShadow).toBe(true);
    terrain.geometry.dispose();
    (terrain.material as THREE.Material).dispose();
  });

  it("grounds rocks and track marks on sloped terrain without growing instance caps", () => {
    canvasStub();
    const sample = (x: number, z: number) => 0.1*x-0.2*z;
    const rocks = makeRockScatter({ count: 12, radiusX: 10, radiusZ: 8, sampleHeight: sample });
    const tracks = makeTrackLoop({ center: new THREE.Vector3(), radiusX: 8, radiusZ: 5, y: 0, segments: 12, sampleHeight: sample });
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    for (const [mesh, offset] of [[rocks, 0.03], [tracks, 0.035]] as const) {
      for (let i=0; i<mesh.count; i++) {
        mesh.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
        expect(point.y).toBeCloseTo(sample(point.x, point.z)+offset, 5);
      }
      mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose();
    }
    expect(rocks.count).toBe(12);
    expect(tracks.count).toBe(24);
  });
});
