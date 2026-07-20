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
  makeBoltRing,
  makeCableRun,
  makeEarthSphere,
  makeEquipmentCluster,
  makeGlowTexture,
  makeHabitat,
  makeLadder,
  makeLander,
  makeMonolithStation,
  makePanelField,
  makePowerLine,
  makeRibBands,
  makeRover,
  makeScuffedRegolith,
  makeTerrain,
  makeTrackLoop,
  materialMaps,
  materialsOf,
  TankFarm,
  type Habitat,
  type MonolithStation,
  type PanelField,
  type Rover,
  makeContactShadow,
  makeGreebles,
  makeRockScatter,
  roundedBox
} from "./shared";
import { enableBloom } from "../layers";
import type { Diorama } from "./types";

const TRENCH_CENTER = new THREE.Vector3(-45, 0, 0);
const TRENCH_RX = 6;
const TRENCH_RZ = 2.6;
const REACTOR_POS = new THREE.Vector3(-20, 0, 0);
const YARD_POS = new THREE.Vector3(-5, 0, 14);
const PAD_POS = new THREE.Vector3(30, 0, -18);
const TANKS_POS = new THREE.Vector3(2, 0, -18);
const STATION_POS = new THREE.Vector3(-30, 0, -22);
const HABITAT_POS = new THREE.Vector3(18, 0, 16);
const SLAG_START = new THREE.Vector3(REACTOR_POS.x + 2.8, 0.42, REACTOR_POS.z + 1.6);
const SLAG_END = new THREE.Vector3(YARD_POS.x - 3.2, 0.42, YARD_POS.z - 1.4);

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

export class EquatorialDiorama implements Diorama {
  readonly group = new THREE.Group();
  readonly assets: Record<string, THREE.Object3D> = {};

  private excavator: Rover;
  private hauler: Rover;
  private haulerLoad: THREE.Mesh;
  private ringMat: THREE.MeshStandardMaterial;
  private heatRibbonMat: THREE.ShaderMaterial;
  private bricks: THREE.InstancedMesh;
  private slagDrops: THREE.InstancedMesh;
  private padTiles: THREE.InstancedMesh;
  private flags: THREE.Mesh[] = [];
  private lander: THREE.Group;
  private landerPlume: THREE.Mesh;
  private landerPlumeMat: THREE.MeshBasicMaterial;
  private tanks: TankFarm;
  private monolith: MonolithStation;
  private panels: PanelField;
  private habitat: Habitat;
  private lines: THREE.Mesh[] = [];
  private dust: DustBurst;

  private loopPeriod = 60;
  private glow = 0.2;
  private departed = false;
  private digPass = -1;
  private architecture: "solar" | "nuclear" | null = null;
  private readonly brickCap: number;
  private readonly panelCap: number;

  constructor(quality: QualityProfile) {
    this.brickCap = quality.brickCap;
    this.panelCap = quality.panelCap;
    const glowTex = makeGlowTexture();
    const detail = quality.detailLevel;
    const greebleBudget = quality.greebleCap;

    // terrain with a shallow elliptical trench ring carved at the excavation loop
    const terrain = makeTerrain({
      segments: quality.terrainSegments,
      carve: (x, z, h) => {
        const e = Math.hypot((x - TRENCH_CENTER.x) / TRENCH_RX, (z - TRENCH_CENTER.z) / TRENCH_RZ);
        const d = Math.abs(e - 1);
        if (d < 0.45) {
          return h - 0.8 * (1 - d / 0.45);
        }
        return h;
      }
    });
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

    /* 1. excavator on its loop */
    this.excavator = makeRover(SCENE_COLORS.regolith, true);
    this.group.add(this.excavator.group);
    this.assets.excavator = this.excavator.group;

    /* 2. hauler */
    this.hauler = makeRover(SCENE_COLORS.metal, false);
    this.haulerLoad = new THREE.Mesh(
      roundedBox(1.25, 0.48, 0.95, 0.07, 1),
      flatMat(SCENE_COLORS.regolithDark, {
        ...materialMaps("regolith"),
        roughness: 1,
        normalScale: 0.55,
        envMapIntensity: 0.12
      })
    );
    this.haulerLoad.position.set(-0.2, 0.75, 0);
    this.haulerLoad.visible = false;
    this.hauler.arm.add(this.haulerLoad);
    this.group.add(this.hauler.group);
    this.assets.hauler = this.hauler.group;

    /* 3. MRE reactor: squat cylinder + dome + emissive waist ring */
    const reactor = new THREE.Group();
    reactor.position.copy(REACTOR_POS);
    const shellMat = flatMat(0x596170, {
      ...materialMaps("metal"),
      metalness: 0.45,
      roughness: 0.5,
      envMapIntensity: 0.55,
      normalScale: 0.18
    });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 3, 48), shellMat);
    body.position.y = 1.5;
    body.castShadow = true;
    reactor.add(body);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      shellMat
    );
    dome.position.y = 3;
    dome.castShadow = true;
    reactor.add(dome);
    this.ringMat = flatMat(SCENE_COLORS.melt, {
      emissive: SCENE_COLORS.melt,
      emissiveIntensity: 0.6,
      roughness: 0.4
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.78, 0.18, 16, 64), this.ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.5;
    enableBloom(ring);
    reactor.add(ring);
    const hatchMat = flatMat(0x2b3038, {
      ...materialMaps("metal"),
      metalness: 0.38,
      roughness: 0.54,
      envMapIntensity: 0.46
    });
    const hatch = new THREE.Mesh(roundedBox(0.84, 1.05, 0.09, 0.035, 1), hatchMat);
    hatch.position.set(2.88, 1.45, -0.72);
    hatch.rotation.y = Math.PI / 2;
    hatch.castShadow = true;
    reactor.add(hatch);
    const footPadGeo = roundedBox(1.18, 0.16, 0.78, 0.05, 1);
    const footPadMat = flatMat(SCENE_COLORS.metalDark, {
      ...materialMaps("metal"),
      metalness: 0.36,
      roughness: 0.62
    });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pad = new THREE.Mesh(footPadGeo, footPadMat);
      pad.position.set(Math.cos(a) * 3.05, 0.1, Math.sin(a) * 3.05);
      pad.rotation.y = -a;
      pad.castShadow = true;
      reactor.add(pad);
    }
    reactor.add(makeRibBands(2.91, 3.1, 2 + detail));
    reactor.add(makeBoltRing({ radius: 2.88, y: 0.22, count: 24 + detail * 8, size: 0.095 }));
    reactor.add(makeBoltRing({ radius: 2.55, y: 3.08, count: 20 + detail * 8, size: 0.08 }));
    const reactorLadder = makeLadder(3.2, 0.64, 7 + detail * 2);
    reactorLadder.position.set(0.15, 0.2, 2.98);
    reactor.add(reactorLadder);
    const reactorDeck = makeEquipmentCluster({
      count: Math.max(7, Math.round(greebleBudget * 0.07)),
      width: 4.2,
      depth: 1.2,
      seed: 74
    });
    reactorDeck.position.set(0, 0.3, -3.0);
    reactor.add(reactorDeck);
    reactor.add(
      makeCableRun(
        [
          new THREE.Vector3(-2.4, 0.7, -2.5),
          new THREE.Vector3(-3.2, 1.2, -1.2),
          new THREE.Vector3(-3.0, 2.2, 0.8),
          new THREE.Vector3(-2.3, 2.6, 2.1)
        ],
        SCENE_COLORS.metalDark,
        0.055
      )
    );
    reactor.add(makeGreebles({ count: Math.max(16, Math.round(greebleBudget * 0.2)), radius: 2.95, height: 2.4, seed: 4 }));
    this.group.add(reactor);
    this.assets.reactor = reactor;
    const reactorShadow = makeContactShadow(4.5, 3.8, 0.34);
    reactorShadow.position.set(REACTOR_POS.x, 0.05, REACTOR_POS.z);
    this.group.add(reactorShadow);

    // glowing slag channel reactor → casting yard
    const channelDir = new THREE.Vector3().subVectors(YARD_POS, REACTOR_POS);
    const channelLen = channelDir.length() - 6;
    const channel = new THREE.Mesh(
      roundedBox(channelLen, 0.16, 0.7, 0.045, 1),
      flatMat(SCENE_COLORS.meltDeep, { emissive: SCENE_COLORS.meltDeep, emissiveIntensity: 1.1 })
    );
    channel.position.copy(REACTOR_POS).add(channelDir.multiplyScalar(0.5)).setY(0.32);
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

    /* 4. casting yard — instanced slag bricks with cooling gradient */
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
        0.35 + layer * 0.5,
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
    this.assets.castingYard = this.bricks;
    const yardShadow = makeContactShadow(8, 5.5, 0.28);
    yardShadow.position.set(YARD_POS.x, 0.05, YARD_POS.z + 1.2);
    this.group.add(yardShadow);

    /* 5. landing pad — ring of wedge tiles + lander + mission flags */
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
      tilePos.set(PAD_POS.x + Math.cos(a) * 6.4, 0.2, PAD_POS.z + Math.sin(a) * 6.4);
      tileQ.setFromEuler(new THREE.Euler(0, -a, 0));
      m.compose(tilePos, tileQ, one);
      this.padTiles.setMatrixAt(i, m);
    }
    this.padTiles.count = 0;
    this.padTiles.instanceMatrix.needsUpdate = true;
    this.group.add(this.padTiles);
    this.assets.pad = this.padTiles;

    this.lander = makeLander();
    this.lander.position.copy(PAD_POS);
    this.lander.visible = false;
    this.landerPlumeMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.melt,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.landerPlume = new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.2, 20, 1, true), this.landerPlumeMat);
    this.landerPlume.position.y = -1.25;
    this.landerPlume.visible = false;
    enableBloom(this.landerPlume);
    this.lander.add(this.landerPlume);
    this.group.add(this.lander);
    const padShadow = makeContactShadow(8.5, 8.5, 0.24);
    padShadow.position.set(PAD_POS.x, 0.05, PAD_POS.z);
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
      flag.position.set(PAD_POS.x + Math.cos(a) * 9.4, 0.8, PAD_POS.z + Math.sin(a) * 9.4);
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      banner.position.set(0.36, 0.55, 0);
      flag.add(banner);
      flag.visible = false;
      this.group.add(flag);
      this.flags.push(flag);
    }

    /* 6. cryo tank farm */
    this.tanks = new TankFarm(8, glowTex);
    this.tanks.group.position.copy(TANKS_POS);
    this.group.add(this.tanks.group);
    this.assets.tanks = this.tanks.group;
    const tankShadow = makeContactShadow(12, 6.5, 0.3);
    tankShadow.position.set(TANKS_POS.x, 0.05, TANKS_POS.z + 2.6);
    this.group.add(tankShadow);

    /* 7. power station — exclusive per architecture */
    const station = new THREE.Group();
    station.position.copy(STATION_POS);
    this.monolith = makeMonolithStation();
    this.panels = makePanelField(quality.panelCap, (55 * Math.PI) / 180);
    this.panels.group.position.z = -4;
    station.add(this.monolith.group);
    station.add(this.panels.group);
    station.add(makeGreebles({ count: Math.max(12, Math.round(greebleBudget * 0.12)), radius: 3.2, height: 2.2, seed: 11 }));
    const switchgear = makeEquipmentCluster({
      count: Math.max(8, Math.round(greebleBudget * 0.08)),
      width: 6.5,
      depth: 3.6,
      seed: 118,
      color: SCENE_COLORS.metal
    });
    switchgear.position.set(0, 0.26, 2.2);
    station.add(switchgear);
    station.add(
      makeCableRun(
        [
          new THREE.Vector3(-2.8, 0.55, 2.4),
          new THREE.Vector3(-1.2, 0.8, 1.2),
          new THREE.Vector3(1.1, 0.8, 1.1),
          new THREE.Vector3(2.7, 0.55, 2.6)
        ],
        SCENE_COLORS.metalDark,
        0.065
      )
    );
    this.group.add(station);
    this.assets.station = station;
    const stationShadow = makeContactShadow(13, 9, 0.24);
    stationShadow.position.set(STATION_POS.x, 0.05, STATION_POS.z);
    this.group.add(stationShadow);

    /* 8. habitat */
    this.habitat = makeHabitat();
    this.habitat.group.position.copy(HABITAT_POS);
    this.habitat.group.add(makeGreebles({ count: Math.max(8, Math.round(greebleBudget * 0.08)), radius: 3.7, height: 1.1, seed: 19 }));
    const habLadder = makeLadder(2.1, 0.58, 5 + detail);
    habLadder.position.set(-2.4, 0.1, 2.45);
    habLadder.rotation.y = 0.45;
    this.habitat.group.add(habLadder);
    this.habitat.group.add(
      makeCableRun(
        [
          new THREE.Vector3(2.9, 0.35, 1.7),
          new THREE.Vector3(3.4, 0.9, 0.2),
          new THREE.Vector3(2.8, 1.2, -1.8)
        ],
        SCENE_COLORS.metalDark,
        0.05
      )
    );
    this.group.add(this.habitat.group);
    this.assets.habitat = this.habitat.group;
    const habitatShadow = makeContactShadow(5.2, 4.6, 0.28);
    habitatShadow.position.set(HABITAT_POS.x, 0.05, HABITAT_POS.z);
    this.group.add(habitatShadow);

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

    this.lander.visible = result.logistics.nMissions >= 1;
    this.flags.forEach((flag, i) => {
      flag.visible = i < Math.min(FLAG_CAP, result.logistics.nMissions);
    });

    this.tanks.setCount(tankCount(params));
    this.tanks.setFill(tankFillFraction(result));
    this.tanks.setWispRate(boiloffWispRate(result.cryo.boiloffKgPerDay));

    // architecture crossfade (600ms)
    const arch = result.power.architecture;
    if (arch !== this.architecture) {
      const fadeMs = reduced || this.architecture === null ? 0 : 600;
      this.architecture = arch;
      const inGroup = arch === "nuclear" ? this.monolith.group : this.panels.group;
      const outGroup = arch === "nuclear" ? this.panels.group : this.monolith.group;
      crossfade(tweens, "eq.arch", outGroup, inGroup, fadeMs);
    }
    this.monolith.setRadiatorScale(radiatorWingScale(result.power.radiatorM2));
    this.panels.setCount(solarPanelCount(result.power.solarArrayM2, this.panelCap));

    this.habitat.setShieldSteps(habitatShellSteps(result.construction.shieldDesignM));

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
    this.tanks.setFill(fill);
    this.tanks.setWispRate(boiloffWispRate(point.boiloffKgPerDay));
    this.glow = gridGlowIntensity(point.loadW);

    const lineOpacity = powerLineOpacity(point.loadW);
    for (const line of this.lines) {
      (line.material as THREE.MeshBasicMaterial).opacity = lineOpacity;
    }

    const phase = ((point.tHours / Math.max(1, cycleHours)) % 1 + 1) % 1;
    this.panels.group.rotation.y = point.daylight ? phase * Math.PI * 2 : 0;
    const panelMat = this.panels.mesh.material as THREE.MeshStandardMaterial;
    panelMat.transparent = !point.daylight;
    panelMat.opacity = point.daylight ? 1 : 0.32;
  }

  tick(dt: number, t: number, reduced: boolean): boolean {
    let active = false;
    if (!reduced) {
      // excavator closed loop in the trench
      const a = ((t % this.loopPeriod) / this.loopPeriod) * Math.PI * 2;
      this.excavator.group.position.set(
        TRENCH_CENTER.x + Math.cos(a) * TRENCH_RX,
        0,
        TRENCH_CENTER.z + Math.sin(a) * TRENCH_RZ
      );
      this.excavator.group.rotation.y = -a - Math.PI / 2;
      const digStroke = Math.max(0, Math.cos(a));
      this.excavator.arm.rotation.z = -0.22 - digStroke * 0.32 + Math.sin(t * 9) * 0.035;
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
      this.hauler.group.rotation.y = s > 0 && s < 1 ? 0 : Math.PI;
      const loadFill =
        u < PAUSE ? u / PAUSE : u < 0.5 ? 1 : u < 0.5 + PAUSE ? 1 - (u - 0.5) / PAUSE : 0;
      this.haulerLoad.visible = loadFill > 0.04;
      this.haulerLoad.scale.set(1, Math.max(0.08, loadFill), 1);
      this.haulerLoad.position.y = 0.55 + loadFill * 0.22;

      // reactor 0.5 Hz pulse around the bound glow level
      this.ringMat.emissiveIntensity = this.glow * (1 + 0.12 * Math.sin(t * Math.PI));
      this.heatRibbonMat.uniforms.uTime.value = t;
      this.heatRibbonMat.uniforms.uOpacity.value = 0.16 + 0.07 * Math.sin(t * 1.9) ** 2;
      this.updateSlagStream(t);
      this.updateBrickCooling(t);
      this.updateLanderEvent(t);
      active = true;
    } else {
      this.ringMat.emissiveIntensity = this.glow;
      this.heatRibbonMat.uniforms.uOpacity.value = 0.12;
      this.landerPlume.visible = false;
    }
    if (this.dust.tick(dt)) {
      active = true;
    }
    if (this.tanks.tick(t) && !reduced) {
      active = true;
    }
    return active;
  }

  private updateSlagStream(t: number): void {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < SLAG_DROP_CAP; i++) {
      const u = ((t * 0.18 + i / SLAG_DROP_CAP) % 1 + 1) % 1;
      p.lerpVectors(SLAG_START, SLAG_END, u);
      p.y = 0.38 + Math.sin(u * Math.PI) * 0.16 + Math.sin(t * 3 + i) * 0.018;
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
    if (!this.lander.visible) {
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
    this.lander.position.set(PAD_POS.x, PAD_POS.y + altitude, PAD_POS.z);
    this.landerPlume.visible = plume > 0.03;
    this.landerPlumeMat.opacity = plume * 0.58;
    this.landerPlume.scale.setScalar(0.75 + plume * 0.85);
  }

  dispose(): void {
    disposeObject(this.group);
  }
}

/** 600ms station crossfade (§3.4 power.architecture mapping) */
function crossfade(
  tweens: TweenManager,
  key: string,
  outGroup: THREE.Group,
  inGroup: THREE.Group,
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
