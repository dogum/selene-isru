import * as THREE from "three";
import type { SimParams, SimResult, TimeseriesPoint } from "@selene-isru/engine";
import {
  brickCount,
  excavatorLoopPeriodS,
  gridGlowIntensity,
  habitatShellSteps,
  padTileFraction,
  powerLineOpacity,
  radiatorWingScale,
  solarPanelCount,
  boiloffWispRate,
  tankCount,
  tankFillFraction,
  SCENE_COLORS,
  type QualityProfile
} from "../bindings";
import type { TweenManager } from "../tween";
import {
  disposeObject,
  flatMat,
  makeEarthSphere,
  makeGlowTexture,
  makePowerLine,
  makeScuffedRegolith,
  makeTerrain,
  makeTrackLoop,
  materialMaps,
  makeContactShadow,
  makeRockScatter,
  makeTerrainHeightSampler,
  materialsOf,
  roundedBox
} from "./shared";
import { enableBloom } from "../layers";
import type { Diorama } from "./types";
import { MreReactorAsset } from "../assets/MreReactorAsset";
import {
  EquatorialEquipmentAsset,
  type EquatorialEquipmentKey
} from "../assets/EquatorialEquipmentAsset";

const TRENCH_CENTER = new THREE.Vector3(-45, 0, 0);
const TRENCH_RX = 6;
const TRENCH_RZ = 2.6;
const REACTOR_POS = new THREE.Vector3(-20, 0, 0);
const YARD_POS = new THREE.Vector3(-5, 0, 14);
const PAD_POS = new THREE.Vector3(30, 0, -18);
const TANKS_POS = new THREE.Vector3(2, 0, -18);
const STATION_POS = new THREE.Vector3(-30, 0, -22);
const HABITAT_POS = new THREE.Vector3(18, 0, 16);
const PAD_TILES = 16;
const FLAG_CAP = 12;
const SLAG_DROP_CAP = 18;

/** Ballistic lunar dust puff on rover movement (§3.2.2). */
class DustBurst {
  readonly group = new THREE.Group();
  private sprites: THREE.Sprite[] = [];
  private velocities: THREE.Vector3[] = [];
  private life = 0;

  constructor(texture: THREE.Texture, count: number) {
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color: SCENE_COLORS.regolith,
          transparent: true,
          opacity: 0,
          depthWrite: false
        })
      );
      sprite.scale.setScalar(0.55 + (i % 5) * 0.12);
      this.group.add(sprite);
      this.sprites.push(sprite);
      this.velocities.push(new THREE.Vector3());
    }
  }

  emit(at: THREE.Vector3): void {
    this.life = 1.35;
    const count = Math.max(1, this.sprites.length);
    this.sprites.forEach((s, i) => {
      s.position.copy(at);
      const a = (i / count) * Math.PI * 2 + Math.sin(i * 12.9898) * 0.25;
      const speed = 1.05 + (i % 7) * 0.18;
      this.velocities[i].set(Math.cos(a) * speed, 0.24 + (i % 5) * 0.12, Math.sin(a) * speed);
    });
  }

  tick(dt: number): boolean {
    if (this.life <= 0) {
      return false;
    }
    this.life -= dt;
    const u = Math.max(0, this.life / 1.35);
    this.sprites.forEach((s, i) => {
      s.position.addScaledVector(this.velocities[i], dt);
      this.velocities[i].y -= 1.62 * dt;
      s.material.opacity = 0.28 * u;
    });
    return this.life > 0;
  }
}

/** Low-cost cryogenic vapor driven by the calculated boil-off rate. */
class CryoVapor {
  readonly group = new THREE.Group();
  private puffs: THREE.Mesh[] = [];
  private rate = 0;
  private count = 1;

  constructor(count: number) {
    for (let i = 0; i < count; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0xb8e9ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
      puff.scale.setScalar(0.38 + (i % 4) * 0.1);
      this.group.add(puff);
      this.puffs.push(puff);
    }
  }

  setState(count: number, rate: number): void {
    this.count = Math.max(1, Math.min(8, count));
    this.rate = THREE.MathUtils.clamp(rate, 0, 1);
  }

  tick(t: number, reduced: boolean): boolean {
    const tankXZ = [
      [-4.6, 2.25],
      [-1.55, 2.25],
      [1.55, 2.25],
      [4.6, 2.25],
      [-4.6, -2.25],
      [-1.55, -2.25],
      [1.55, -2.25],
      [4.6, -2.25]
    ];
    this.puffs.forEach((puff, i) => {
      const tank = i % this.count;
      const visible = this.rate > 0.015 && i < Math.max(1, Math.round(this.rate * this.puffs.length * 0.28));
      puff.visible = visible;
      if (!visible) {
        return;
      }
      const phase = reduced ? 0.35 : (t * (0.12 + this.rate * 0.2) + i * 0.137) % 1;
      const [x, z] = tankXZ[tank]!;
      puff.position.set(
        x + Math.sin(i * 2.17) * 0.2 + Math.sin(t * 0.45 + i) * 0.12,
        4.15 + phase * 2.3,
        z + Math.cos(i * 1.71) * 0.2
      );
      const material = puff.material as THREE.MeshBasicMaterial;
      material.opacity = this.rate * Math.sin(phase * Math.PI) * 0.085;
      const scale = 0.42 + phase * 0.42;
      puff.scale.setScalar(scale);
    });
    return !reduced && this.rate > 0.015;
  }
}

export class EquatorialDiorama implements Diorama {
  readonly group = new THREE.Group();
  readonly assets: Record<string, THREE.Object3D> = {};

  private equipment: Record<EquatorialEquipmentKey, EquatorialEquipmentAsset>;
  private excavator: EquatorialEquipmentAsset;
  private hauler: EquatorialEquipmentAsset;
  private haulerLoad: THREE.Mesh;
  private reactor: MreReactorAsset;
  private castingAsset: EquatorialEquipmentAsset;
  private landingAsset: EquatorialEquipmentAsset;
  private cryoAsset: EquatorialEquipmentAsset;
  private powerAsset: EquatorialEquipmentAsset;
  private habitatAsset: EquatorialEquipmentAsset;
  private heatRibbonMat: THREE.ShaderMaterial;
  private bricks: THREE.InstancedMesh;
  private slagDrops: THREE.InstancedMesh;
  private padTiles: THREE.InstancedMesh;
  private flags: THREE.Mesh[] = [];
  private landerPlume: THREE.Mesh;
  private landerPlumeMat: THREE.MeshBasicMaterial;
  private cryoVapor: CryoVapor;
  private lines: THREE.Mesh[] = [];
  private dust: DustBurst;
  private sampleTerrain: (x: number, z: number) => number;
  private slagStart = new THREE.Vector3();
  private slagEnd = new THREE.Vector3();

  private loopPeriod = 60;
  private glow = 0.2;
  private departed = false;
  private digPass = -1;
  private architecture: "solar" | "nuclear" | null = null;
  private currentTankCount = 1;
  private currentTankFill = 1;
  private currentWispRate = 0;
  private currentPanelRacks = 1;
  private currentRadiatorScale = 1;
  private currentShieldSections = 1;
  private landerVisible = false;
  private solarPhase = 0;
  private solarDaylight = true;
  private readonly brickCap: number;
  private readonly panelCap: number;

  constructor(quality: QualityProfile, onAssetReady: () => void = () => undefined) {
    this.brickCap = quality.brickCap;
    this.panelCap = quality.panelCap;
    const glowTex = makeGlowTexture();
    const detail = quality.detailLevel;

    // Terrain and all equipment use the same deterministic height function. Every
    // fixed facility receives a compact graded bench with natural shoulders.
    const ungradedHeight = makeTerrainHeightSampler();
    const grades = [
      { position: REACTOR_POS, radius: 7.2, y: ungradedHeight(REACTOR_POS.x, REACTOR_POS.z) },
      { position: YARD_POS, radius: 7.4, y: ungradedHeight(YARD_POS.x, YARD_POS.z) },
      { position: PAD_POS, radius: 10.2, y: ungradedHeight(PAD_POS.x, PAD_POS.z) },
      { position: TANKS_POS, radius: 8.0, y: ungradedHeight(TANKS_POS.x, TANKS_POS.z) },
      { position: STATION_POS, radius: 10.2, y: ungradedHeight(STATION_POS.x, STATION_POS.z) },
      { position: HABITAT_POS, radius: 7.4, y: ungradedHeight(HABITAT_POS.x, HABITAT_POS.z) }
    ];
    const terrainOpts = {
      segments: quality.terrainSegments,
      carve: (x: number, z: number, h: number) => {
        const e = Math.hypot((x - TRENCH_CENTER.x) / TRENCH_RX, (z - TRENCH_CENTER.z) / TRENCH_RZ);
        const d = Math.abs(e - 1);
        if (d < 0.45) {
          h -= 0.8 * (1 - d / 0.45);
        }
        for (const grade of grades) {
          const distance = Math.hypot(x - grade.position.x, z - grade.position.z);
          if (distance < grade.radius) {
            const blend = THREE.MathUtils.smoothstep(grade.radius - distance, 0, 2.2);
            h = THREE.MathUtils.lerp(h, grade.y, blend);
          }
        }
        return h;
      }
    };
    this.sampleTerrain = makeTerrainHeightSampler(terrainOpts);
    const groundAt = (position: THREE.Vector3): number => this.sampleTerrain(position.x, position.z);
    const reactorGroundY = groundAt(REACTOR_POS);
    const yardGroundY = groundAt(YARD_POS);
    const padGroundY = groundAt(PAD_POS);
    const tanksGroundY = groundAt(TANKS_POS);
    const stationGroundY = groundAt(STATION_POS);
    const habitatGroundY = groundAt(HABITAT_POS);
    const terrain = makeTerrain(terrainOpts);
    this.group.add(terrain);
    this.group.add(
      makeTrackLoop({
        center: TRENCH_CENTER,
        radiusX: TRENCH_RX,
        radiusZ: TRENCH_RZ,
        y: 0.09,
        segments: 32 + detail * 12,
        opacity: 0.36
      })
    );
    const haulScuff = makeScuffedRegolith(34, 4.6, 44, 0.42);
    haulScuff.position.set(-33, 0.1, 2.8);
    this.group.add(haulScuff);
    const padScuff = makeScuffedRegolith(17, 17, 58, 0.38);
    padScuff.position.set(PAD_POS.x, 0.11, PAD_POS.z);
    this.group.add(padScuff);
    const yardScuff = makeScuffedRegolith(18, 12, 66, 0.36);
    yardScuff.position.set(YARD_POS.x - 0.5, 0.1, YARD_POS.z + 1.4);
    this.group.add(yardScuff);
    this.group.add(makeEarthSphere());
    this.group.add(
      makeRockScatter({
        count: Math.round(quality.rockCap * 0.42),
        center: new THREE.Vector3(-24, 0.12, 2),
        radiusX: 46,
        radiusZ: 24,
        seed: 24
      })
    );

    const equipmentReady = (): void => {
      this.bindLoadedEquipment();
      onAssetReady();
    };

    /* 1. excavation fleet — original Blender assets with named articulation. */
    this.excavator = new EquatorialEquipmentAsset("excavator", equipmentReady);
    this.group.add(this.excavator.group);
    this.assets.excavator = this.excavator.group;

    /* 2. hauler */
    this.hauler = new EquatorialEquipmentAsset("hauler", equipmentReady);
    this.haulerLoad = new THREE.Mesh(
      roundedBox(2.25, 0.52, 1.42, 0.09, 1),
      flatMat(SCENE_COLORS.regolithDark, {
        ...materialMaps("regolith"),
        roughness: 1,
        normalScale: 0.55,
        envMapIntensity: 0.12
      })
    );
    this.haulerLoad.position.set(0, 0.18, 0);
    this.haulerLoad.visible = false;
    this.group.add(this.hauler.group);
    this.assets.hauler = this.hauler.group;

    /* 3. MRE reactor: reproducible Blender asset with grounded service area. */
    this.reactor = new MreReactorAsset(onAssetReady);
    this.reactor.group.position.set(REACTOR_POS.x, reactorGroundY + 0.015, REACTOR_POS.z);
    this.group.add(this.reactor.group);
    this.assets.reactor = this.reactor.group;
    const reactorShadow = makeContactShadow(5.15, 4.8, 0.3);
    reactorShadow.position.set(REACTOR_POS.x, reactorGroundY + 0.025, REACTOR_POS.z);
    this.group.add(reactorShadow);

    // glowing slag channel reactor → casting yard
    const channelDir = new THREE.Vector3().subVectors(YARD_POS, REACTOR_POS);
    const channelLen = channelDir.length() - 6;
    const channel = new THREE.Mesh(
      roundedBox(channelLen, 0.16, 0.7, 0.045, 1),
      flatMat(SCENE_COLORS.meltDeep, { emissive: SCENE_COLORS.meltDeep, emissiveIntensity: 1.1 })
    );
    channel.position
      .copy(REACTOR_POS)
      .add(channelDir.multiplyScalar(0.5))
      .setY((reactorGroundY + yardGroundY) * 0.5 + 0.32);
    channel.rotation.y = -Math.atan2(YARD_POS.z - REACTOR_POS.z, YARD_POS.x - REACTOR_POS.x);
    enableBloom(channel);
    this.group.add(channel);

    this.heatRibbonMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0.2 }
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z += sin((uv.x * 8.0 + uTime * 1.7)) * 0.035 * sin(uv.y * 3.14159);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          float band = smoothstep(0.0, 0.22, vUv.y) * (1.0 - smoothstep(0.38, 1.0, vUv.y));
          float thread = 0.55 + 0.45 * sin(vUv.x * 42.0 + vUv.y * 8.0);
          gl_FragColor = vec4(vec3(1.0, 0.42, 0.13) * thread, uOpacity * band * 0.32);
        }
      `
    });
    const heatRibbon = new THREE.Mesh(new THREE.PlaneGeometry(channelLen, 1.2, 48, 2), this.heatRibbonMat);
    heatRibbon.position.copy(channel.position).setY(0.82);
    heatRibbon.rotation.y = channel.rotation.y;
    this.group.add(heatRibbon);

    this.slagDrops = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      flatMat(SCENE_COLORS.meltDeep, {
        emissive: SCENE_COLORS.meltDeep,
        emissiveIntensity: 1.3,
        roughness: 0.35
      }),
      SLAG_DROP_CAP
    );
    this.slagDrops.count = SLAG_DROP_CAP;
    enableBloom(this.slagDrops);
    this.group.add(this.slagDrops);

    this.slagStart.set(REACTOR_POS.x + 2.8, reactorGroundY + 0.42, REACTOR_POS.z + 1.6);
    this.slagEnd.set(YARD_POS.x - 3.2, yardGroundY + 0.78, YARD_POS.z - 1.4);

    /* 4. casting yard — generated process machinery plus instanced output. */
    this.castingAsset = new EquatorialEquipmentAsset("castingYard", equipmentReady);
    this.castingAsset.group.position.set(YARD_POS.x, yardGroundY + 0.015, YARD_POS.z);
    this.group.add(this.castingAsset.group);
    this.assets.castingYard = this.castingAsset.group;
    const brickGeo = roundedBox(1.1, 0.45, 0.55, 0.055, 1);
    const brickMat = flatMat(0xffffff, {
      ...materialMaps("regolith"),
      roughness: 0.88,
      metalness: 0,
      normalScale: 0.42,
      envMapIntensity: 0.1
    });
    this.bricks = new THREE.InstancedMesh(brickGeo, brickMat, quality.brickCap);
    this.bricks.castShadow = true;
    const m = new THREE.Matrix4();
    const cols = 12;
    const hot = new THREE.Color(SCENE_COLORS.meltDeep);
    const cold = new THREE.Color(0x55524e);
    const c = new THREE.Color();
    for (let i = 0; i < quality.brickCap; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols) % 10;
      const layer = Math.floor(i / (cols * 10));
      m.makeTranslation(
        YARD_POS.x - 6 + col * 1.25 + (row % 2) * 0.3,
        yardGroundY + 0.48 + layer * 0.5,
        YARD_POS.z - 3 + row * 0.75
      );
      this.bricks.setMatrixAt(i, m);
      c.copy(hot).lerp(cold, Math.min(1, row / 4 + layer * 0.4));
      this.bricks.setColorAt(i, c);
    }
    this.bricks.count = 0;
    this.bricks.instanceMatrix.needsUpdate = true;
    if (this.bricks.instanceColor !== null) {
      this.bricks.instanceColor.needsUpdate = true;
    }
    this.group.add(this.bricks);
    const yardShadow = makeContactShadow(8, 5.5, 0.28);
    yardShadow.position.set(YARD_POS.x, yardGroundY + 0.025, YARD_POS.z + 1.2);
    this.group.add(yardShadow);

    /* 5. landing system — generated lander/core apron + scalable tile ring. */
    const tileGeo = roundedBox(3.2, 0.28, 2.4, 0.09, 1);
    const tileMat = flatMat(0x6e6a64, {
      ...materialMaps("regolith"),
      roughness: 0.84,
      normalScale: 0.45,
      envMapIntensity: 0.14
    });
    this.padTiles = new THREE.InstancedMesh(tileGeo, tileMat, PAD_TILES);
    const tilePos = new THREE.Vector3();
    const tileQ = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < PAD_TILES; i++) {
      const a = (i / PAD_TILES) * Math.PI * 2;
      tilePos.set(PAD_POS.x + Math.cos(a) * 7.1, padGroundY + 0.2, PAD_POS.z + Math.sin(a) * 7.1);
      tileQ.setFromEuler(new THREE.Euler(0, -a, 0));
      m.compose(tilePos, tileQ, one);
      this.padTiles.setMatrixAt(i, m);
    }
    this.padTiles.count = 0;
    this.padTiles.instanceMatrix.needsUpdate = true;
    this.group.add(this.padTiles);

    this.landingAsset = new EquatorialEquipmentAsset("pad", equipmentReady);
    this.landingAsset.group.position.set(PAD_POS.x, padGroundY + 0.015, PAD_POS.z);
    this.group.add(this.landingAsset.group);
    this.assets.pad = this.landingAsset.group;
    this.landerPlumeMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.melt,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.landerPlume = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 20, 1, true), this.landerPlumeMat);
    this.landerPlume.position.y = -1.45;
    this.landerPlume.visible = false;
    enableBloom(this.landerPlume);
    const padShadow = makeContactShadow(8.5, 8.5, 0.24);
    padShadow.position.set(PAD_POS.x, padGroundY + 0.025, PAD_POS.z);
    this.group.add(padShadow);

    const flagGeo = roundedBox(0.06, 1.6, 0.06, 0.018, 1);
    const bannerGeo = new THREE.PlaneGeometry(0.7, 0.4);
    const flagMat = flatMat(SCENE_COLORS.metal, {
      ...materialMaps("metal"),
      metalness: 0.42,
      roughness: 0.52
    });
    const bannerMat = flatMat(SCENE_COLORS.melt, { emissive: SCENE_COLORS.melt, emissiveIntensity: 0.3 });
    bannerMat.side = THREE.DoubleSide;
    for (let i = 0; i < FLAG_CAP; i++) {
      const a = (i / FLAG_CAP) * Math.PI * 2;
      const flag = new THREE.Mesh(flagGeo, flagMat);
      flag.position.set(PAD_POS.x + Math.cos(a) * 9.4, padGroundY + 0.8, PAD_POS.z + Math.sin(a) * 9.4);
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.set(0.36, 0.55, 0);
      flag.add(banner);
      flag.visible = false;
      this.group.add(flag);
      this.flags.push(flag);
    }

    /* 6. cryogenic farm — eight individually addressable tanks and valves. */
    this.cryoAsset = new EquatorialEquipmentAsset("tanks", equipmentReady);
    this.cryoAsset.group.position.set(TANKS_POS.x, tanksGroundY + 0.015, TANKS_POS.z);
    this.group.add(this.cryoAsset.group);
    this.assets.tanks = this.cryoAsset.group;
    this.cryoVapor = new CryoVapor(Math.max(10, Math.round(quality.effectCap * 0.18)));
    this.cryoVapor.group.position.set(TANKS_POS.x, tanksGroundY, TANKS_POS.z);
    this.group.add(this.cryoVapor.group);
    const tankShadow = makeContactShadow(12, 6.5, 0.3);
    tankShadow.position.set(TANKS_POS.x, tanksGroundY + 0.025, TANKS_POS.z);
    this.group.add(tankShadow);

    /* 7. power hub — one authored system with solar and nuclear branches. */
    this.powerAsset = new EquatorialEquipmentAsset("station", equipmentReady);
    this.powerAsset.group.position.set(STATION_POS.x, stationGroundY + 0.015, STATION_POS.z);
    this.group.add(this.powerAsset.group);
    this.assets.station = this.powerAsset.group;
    const stationShadow = makeContactShadow(13, 9, 0.24);
    stationShadow.position.set(STATION_POS.x, stationGroundY + 0.025, STATION_POS.z);
    this.group.add(stationShadow);

    /* 8. pressure habitat with simulator-scaled regolith shielding. */
    this.habitatAsset = new EquatorialEquipmentAsset("habitat", equipmentReady);
    this.habitatAsset.group.position.set(HABITAT_POS.x, habitatGroundY + 0.015, HABITAT_POS.z);
    this.group.add(this.habitatAsset.group);
    this.assets.habitat = this.habitatAsset.group;
    const habitatShadow = makeContactShadow(5.2, 4.6, 0.28);
    habitatShadow.position.set(HABITAT_POS.x, habitatGroundY + 0.025, HABITAT_POS.z);
    this.group.add(habitatShadow);

    this.equipment = {
      excavator: this.excavator,
      hauler: this.hauler,
      castingYard: this.castingAsset,
      tanks: this.cryoAsset,
      station: this.powerAsset,
      pad: this.landingAsset,
      habitat: this.habitatAsset
    };

    /* 9. power lines station → reactor → cryo */
    const lineY = 0.5;
    const lift = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] => [
      new THREE.Vector3(a.x, lineY, a.z),
      new THREE.Vector3((a.x + b.x) / 2, lineY + 1.4, (a.z + b.z) / 2),
      new THREE.Vector3(b.x, lineY, b.z)
    ];
    this.lines.push(makePowerLine(lift(STATION_POS, REACTOR_POS), SCENE_COLORS.melt));
    this.lines.push(makePowerLine(lift(REACTOR_POS, TANKS_POS), SCENE_COLORS.melt));
    for (const line of this.lines) {
      this.group.add(line);
    }

    this.dust = new DustBurst(glowTex, Math.max(14, Math.round(quality.effectCap * 0.28)));
    this.group.add(this.dust.group);
  }

  apply(result: SimResult, params: SimParams, tweens: TweenManager, reduced: boolean): void {
    const ms = reduced ? 0 : 300;

    tweens.add(
      "eq.loop",
      this.loopPeriod,
      excavatorLoopPeriodS(result.production.regolithKgPerDay),
      ms,
      (v) => {
        this.loopPeriod = v;
      }
    );

    tweens.add("eq.glow", this.glow, gridGlowIntensity(result.energy.gridPowerW), ms, (v) => {
      this.glow = v;
    });
    this.reactor.apply(result, params, gridGlowIntensity(result.energy.gridPowerW));

    tweens.add(
      "eq.bricks",
      this.bricks.count,
      brickCount(result.construction.slagPerYearT, this.brickCap),
      ms,
      (v) => {
        this.bricks.count = Math.round(v);
      }
    );

    tweens.add(
      "eq.pad",
      this.padTiles.count,
      Math.round(padTileFraction(result.construction.padsPerYear) * PAD_TILES),
      ms,
      (v) => {
        this.padTiles.count = Math.round(v);
      }
    );

    this.landerVisible = result.logistics.nMissions >= 1;
    this.flags.forEach((flag, i) => {
      flag.visible = i < Math.min(FLAG_CAP, result.logistics.nMissions);
    });

    this.currentTankCount = tankCount(params);
    this.currentTankFill = tankFillFraction(result);
    this.currentWispRate = boiloffWispRate(result.cryo.boiloffKgPerDay);
    this.cryoVapor.setState(this.currentTankCount, this.currentWispRate);

    // Generated solar/nuclear branches share the authored switchgear deck.
    const arch = result.power.architecture;
    const previousArchitecture = this.architecture;
    this.architecture = arch;
    const nuclear = this.powerAsset.node("Power_NuclearRoot");
    const solar = this.powerAsset.node("Power_SolarRoot");
    if (nuclear !== null && solar !== null) {
      if (arch !== previousArchitecture) {
        const inGroup = arch === "nuclear" ? nuclear : solar;
        const outGroup = arch === "nuclear" ? solar : nuclear;
        crossfade(tweens, "eq.arch", outGroup, inGroup, reduced || previousArchitecture === null ? 0 : 600);
      } else {
        nuclear.visible = arch === "nuclear";
        solar.visible = arch === "solar";
      }
    }
    this.currentRadiatorScale = radiatorWingScale(result.power.radiatorM2);
    const panelInstances = solarPanelCount(result.power.solarArrayM2, this.panelCap);
    this.currentPanelRacks = Math.max(
      1,
      Math.min(12, Math.ceil(panelInstances / Math.max(1, this.panelCap / 12)))
    );

    this.currentShieldSections = Math.max(
      1,
      Math.min(6, Math.ceil(habitatShellSteps(result.construction.shieldDesignM) / 7))
    );
    this.applyEquipmentVisualState(arch === previousArchitecture || nuclear === null || solar === null);

    const lineOpacity = powerLineOpacity(result.energy.gridPowerW);
    for (const line of this.lines) {
      const mat = line.material as THREE.MeshBasicMaterial;
      tweens.add(`eq.line.${line.id}`, mat.opacity, lineOpacity, ms, (v) => {
        mat.opacity = v;
      });
    }
  }

  applyTime(point: TimeseriesPoint, params: SimParams, result: SimResult, cycleHours: number): void {
    const reserveKg = Math.max(1, params.reserveDays * result.production.targetKgPerDay);
    const fill = Math.min(1, Math.max(0, point.tankFillKg / reserveKg));
    this.currentTankFill = fill;
    this.currentWispRate = boiloffWispRate(point.boiloffKgPerDay);
    this.cryoVapor.setState(this.currentTankCount, this.currentWispRate);
    this.glow = gridGlowIntensity(point.loadW);
    this.reactor.apply(result, params, this.glow);

    const lineOpacity = powerLineOpacity(point.loadW);
    for (const line of this.lines) {
      (line.material as THREE.MeshBasicMaterial).opacity = lineOpacity;
    }

    const phase = ((point.tHours / Math.max(1, cycleHours)) % 1 + 1) % 1;
    this.solarPhase = phase;
    this.solarDaylight = point.daylight;
    this.applyEquipmentVisualState();
  }

  tick(dt: number, t: number, reduced: boolean): boolean {
    let active = false;
    if (!reduced) {
      // excavator closed loop in the trench
      const a = ((t % this.loopPeriod) / this.loopPeriod) * Math.PI * 2;
      const excavatorX = TRENCH_CENTER.x + Math.cos(a) * TRENCH_RX;
      const excavatorZ = TRENCH_CENTER.z + Math.sin(a) * TRENCH_RZ;
      this.excavator.group.position.set(excavatorX, this.sampleTerrain(excavatorX, excavatorZ) + 0.045, excavatorZ);
      this.excavator.group.rotation.y = -a - Math.PI / 2;
      const digStroke = Math.max(0, Math.cos(a));
      const boom = this.excavator.node("Excavator_BoomPivot");
      const bucket = this.excavator.node("Excavator_BucketPivot");
      if (boom !== null) {
        boom.rotation.z = -0.08 - digStroke * 0.23 + Math.sin(t * 4.5) * 0.018;
      }
      if (bucket !== null) {
        bucket.rotation.z = 0.1 + digStroke * 0.28;
      }
      const pass = Math.floor(t / this.loopPeriod);
      if (a < 0.18 && pass !== this.digPass) {
        this.digPass = pass;
        this.dust.emit(this.excavator.group.position.clone().setY(0.35));
      }

      // hauler shuttle trench → reactor with end pauses
      const cycle = Math.max(10, this.loopPeriod * 0.5);
      const u = (t % cycle) / cycle;
      const PAUSE = 0.12;
      let s: number;
      if (u < PAUSE) {
        s = 0;
        this.departed = false;
      } else if (u < 0.5) {
        s = (u - PAUSE) / (0.5 - PAUSE);
        if (!this.departed) {
          this.departed = true;
          this.dust.emit(this.hauler.group.position.clone().setY(0.4));
        }
      } else if (u < 0.5 + PAUSE) {
        s = 1;
      } else {
        s = 1 - (u - 0.5 - PAUSE) / (0.5 - PAUSE);
      }
      const from = new THREE.Vector3(TRENCH_CENTER.x + TRENCH_RX + 1.5, 0, 3);
      const to = new THREE.Vector3(REACTOR_POS.x - 4.5, 0, 3);
      this.hauler.group.position.lerpVectors(from, to, s);
      this.hauler.group.position.y = this.sampleTerrain(this.hauler.group.position.x, this.hauler.group.position.z) + 0.045;
      this.hauler.group.rotation.y = u < 0.5 + PAUSE ? 0 : Math.PI;
      const loadFill =
        u < PAUSE ? u / PAUSE : u < 0.5 ? 1 : u < 0.5 + PAUSE ? 1 - (u - 0.5) / PAUSE : 0;
      this.haulerLoad.visible = loadFill > 0.04;
      this.haulerLoad.scale.set(1, Math.max(0.08, loadFill), 1);
      this.haulerLoad.position.y = 0.12 + loadFill * 0.18;
      const bed = this.hauler.node("Hauler_BedPivot");
      if (bed !== null) {
        const dump = u >= 0.5 && u < 0.5 + PAUSE ? Math.sin(((u - 0.5) / PAUSE) * Math.PI) : 0;
        bed.rotation.z = -dump * 0.48;
      }

      const pour = this.castingAsset.node("Casting_PourPivot");
      if (pour !== null) {
        pour.rotation.z = Math.sin(t * 0.65) * 0.16;
      }
      const ramp = this.landingAsset.node("Landing_RampPivot");
      if (ramp !== null) {
        ramp.rotation.z = -0.08 + Math.sin(t * 0.22) * 0.025;
      }

      this.reactor.tick(t, false);
      this.heatRibbonMat.uniforms.uTime.value = t;
      this.heatRibbonMat.uniforms.uOpacity.value = 0.16 + 0.07 * Math.sin(t * 1.9) ** 2;
      this.updateSlagStream(t);
      this.updateBrickCooling(t);
      this.updateLanderEvent(t);
      active = true;
    } else {
      this.reactor.tick(t, true);
      this.heatRibbonMat.uniforms.uOpacity.value = 0.12;
      this.landerPlume.visible = false;
    }
    if (this.dust.tick(dt)) {
      active = true;
    }
    if (this.cryoVapor.tick(t, reduced)) {
      active = true;
    }
    return active;
  }

  private bindLoadedEquipment(): void {
    const loadAnchor = this.hauler?.node("Hauler_LoadAnchor");
    if (loadAnchor !== null && loadAnchor !== undefined && this.haulerLoad.parent !== loadAnchor) {
      loadAnchor.add(this.haulerLoad);
    }
    const lander = this.landingAsset?.node("Landing_Lander");
    if (lander !== null && lander !== undefined && this.landerPlume.parent !== lander) {
      lander.add(this.landerPlume);
    }
    this.applyEquipmentVisualState(true);
  }

  private applyEquipmentVisualState(applyArchitecture = true): void {
    if (this.cryoAsset !== undefined) {
      for (let i = 1; i <= 8; i++) {
        const suffix = String(i).padStart(2, "0");
        const tank = this.cryoAsset.node(`Cryo_Tank_${suffix}`);
        if (tank !== null) {
          tank.visible = i <= this.currentTankCount;
        }
        const fill = this.cryoAsset.node(`Cryo_FillColumn_${suffix}`);
        if (fill !== null) {
          fill.scale.y = 0.12 + this.currentTankFill * 0.88;
        }
      }
      for (const material of this.cryoAsset.materials("CRYO_StatusLight")) {
        material.emissiveIntensity = 0.8 + this.currentTankFill * 2.2;
      }
    }

    if (this.powerAsset !== undefined) {
      const nuclear = this.powerAsset.node("Power_NuclearRoot");
      const solar = this.powerAsset.node("Power_SolarRoot");
      if (applyArchitecture && this.architecture !== null) {
        if (nuclear !== null) {
          nuclear.visible = this.architecture === "nuclear";
        }
        if (solar !== null) {
          solar.visible = this.architecture === "solar";
        }
      }
      const radiators = this.powerAsset.node("Power_RadiatorRoot");
      if (radiators !== null) {
        radiators.scale.x = this.currentRadiatorScale;
      }
      for (let i = 1; i <= 12; i++) {
        const suffix = String(i).padStart(2, "0");
        const rack = this.powerAsset.node(`Power_SolarRack_${suffix}`);
        if (rack !== null) {
          rack.visible = i <= this.currentPanelRacks;
        }
        const tracker = this.powerAsset.node(`Power_SolarTracker_${suffix}`);
        if (tracker !== null) {
          tracker.rotation.z = this.solarDaylight ? -0.22 + Math.sin(this.solarPhase * Math.PI * 2) * 0.42 : 0;
        }
      }
      for (const material of this.powerAsset.materials("POWER_Photovoltaic")) {
        material.transparent = !this.solarDaylight;
        material.opacity = this.solarDaylight ? 1 : 0.42;
      }
      for (const material of this.powerAsset.materials("POWER_StatusLight")) {
        material.emissiveIntensity = 1.1 + this.glow * 1.4;
      }
    }

    if (this.habitatAsset !== undefined) {
      for (let i = 1; i <= 6; i++) {
        const shield = this.habitatAsset.node(`Habitat_Shield_${String(i).padStart(2, "0")}`);
        if (shield !== null) {
          shield.visible = i <= this.currentShieldSections;
        }
      }
    }

    const lander = this.landingAsset?.node("Landing_Lander");
    if (lander !== null && lander !== undefined) {
      lander.visible = this.landerVisible;
    }
    for (const material of this.landingAsset?.materials("LAND_StatusLight") ?? []) {
      material.emissiveIntensity = this.landerVisible ? 2.6 : 0.45;
    }
    for (const material of this.castingAsset?.materials("CAST_WarmLight") ?? []) {
      material.emissiveIntensity = 1.4 + this.glow * 0.8;
    }
  }

  private updateSlagStream(t: number): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < SLAG_DROP_CAP; i++) {
      const u = ((t * 0.18 + i / SLAG_DROP_CAP) % 1 + 1) % 1;
      p.lerpVectors(this.slagStart, this.slagEnd, u);
      p.y += Math.sin(u * Math.PI) * 0.16 + Math.sin(t * 3 + i) * 0.018;
      q.setFromEuler(new THREE.Euler(t * 0.7 + i, u * Math.PI * 2, Math.sin(t + i) * 0.35));
      const scale = 0.58 + Math.sin(u * Math.PI) * 0.62;
      s.set(scale * (1 + 0.18 * Math.sin(t * 2 + i)), scale * 0.76, scale * 0.82);
      m.compose(p, q, s);
      this.slagDrops.setMatrixAt(i, m);
    }
    this.slagDrops.instanceMatrix.needsUpdate = true;
  }

  private updateBrickCooling(t: number): void {
    const count = this.bricks.count;
    if (count <= 0 || this.bricks.instanceColor === null) {
      return;
    }
    const hot = new THREE.Color(SCENE_COLORS.meltDeep);
    const cold = new THREE.Color(0x55524e);
    const c = new THREE.Color();
    const lead = Math.floor(t * 1.6) % count;
    for (let i = 0; i < count; i++) {
      const age = (lead - i + count) % count;
      const heat = Math.max(0, 1 - age / 10);
      c.copy(cold).lerp(hot, heat);
      this.bricks.setColorAt(i, c);
    }
    this.bricks.instanceColor.needsUpdate = true;
  }

  private updateLanderEvent(t: number): void {
    const lander = this.landingAsset.node("Landing_Lander");
    if (lander === null || !this.landerVisible) {
      this.landerPlume.visible = false;
      return;
    }
    const u = (t % 32) / 32;
    let altitude = 0;
    let plume = 0;
    if (u < 0.18) {
      const q = 1 - u / 0.18;
      altitude = 14 * q * q;
      plume = Math.sin((u / 0.18) * Math.PI);
    } else if (u > 0.86) {
      const q = (u - 0.86) / 0.14;
      altitude = 14 * q * q;
      plume = Math.sin(q * Math.PI);
    }
    lander.position.y = altitude;
    this.landerPlume.visible = plume > 0.03;
    this.landerPlumeMat.opacity = plume * 0.58;
    this.landerPlume.scale.setScalar(0.75 + plume * 0.85);
  }

  dispose(): void {
    this.reactor.dispose();
    for (const asset of Object.values(this.equipment)) {
      asset.dispose();
    }
    disposeObject(this.group);
  }
}

/** 600ms station crossfade (§3.4 power.architecture mapping) */
function crossfade(
  tweens: TweenManager,
  key: string,
  outGroup: THREE.Object3D,
  inGroup: THREE.Object3D,
  ms: number
): void {
  const outMats = materialsOf(outGroup);
  const inMats = materialsOf(inGroup);
  inGroup.visible = true;
  if (ms <= 0) {
    outGroup.visible = false;
    for (const m of inMats) {
      m.opacity = 1;
      m.transparent = false;
    }
    return;
  }
  for (const m of [...outMats, ...inMats]) {
    m.transparent = true;
  }
  tweens.add(
    key,
    0,
    1,
    ms,
    (v) => {
      for (const m of outMats) {
        m.opacity = 1 - v;
      }
      for (const m of inMats) {
        m.opacity = v;
      }
    },
    () => {
      outGroup.visible = false;
      for (const m of inMats) {
        m.opacity = 1;
        m.transparent = false;
      }
    }
  );
}
