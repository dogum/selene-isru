import * as THREE from "three";
import type { SimParams, SimResult, TimeseriesPoint } from "@selene-isru/engine";
import {
  beamRadius,
  boiloffWispRate,
  excavatorLoopPeriodS,
  habitatShellSteps,
  powerLineOpacity,
  radiatorWingScale,
  tankCount,
  tankFillFraction,
  tentGlowIntensity,
  SCENE_COLORS,
  type QualityProfile
} from "../bindings";
import type { TweenManager } from "../tween";
import {
  disposeObject,
  makeContactShadow,
  makeCraterStrata,
  makeGlowTexture,
  makePowerLine,
  makeRockScatter,
  makeScuffedRegolith,
  makeTerrain,
  makeTerrainHeightSampler
} from "./shared";
import { enableBloom } from "../layers";
import type { Diorama } from "./types";
import {
  PolarEquipmentAsset,
  type PolarEquipmentKey
} from "../assets/PolarEquipmentAsset";

const FLOOR_Y = -10;
const RIM_R = 57;
const RECEIVER_POS = new THREE.Vector3(0, 0, -6);
const TENTS_POS = new THREE.Vector3(6, 0, 1.5);
const TANKS_POS = new THREE.Vector3(17, 0, 5);
const HABITAT_POS = new THREE.Vector3(-17, 0, 5);
const STATION_POS = new THREE.Vector3(Math.sin(0.55) * RIM_R, 0, -Math.cos(0.55) * RIM_R);
const TOWER_WORLD_POSITIONS = [
  new THREE.Vector3(-18, 0, -RIM_R - 3.2),
  new THREE.Vector3(0, 0, -RIM_R),
  new THREE.Vector3(18, 0, -RIM_R - 3.2)
] as const;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Crater profile: cold floor, terraced wall, raised rim, natural exterior. */
function craterCarve(x: number, z: number, h: number): number {
  const r = Math.hypot(x, z);
  const rise = smoothstep(34, 52, r);
  const rim = 9 * Math.exp(-((r - RIM_R) ** 2) / 42);
  const floor = FLOOR_Y + h * 0.16;
  const wallRelief = h * (0.1 + 0.22 * rise);
  const terraces = Math.sin(r * 0.92) * 0.34 * smoothstep(35, 41, r) * (1 - smoothstep(53, 59, r));
  const inner = floor + wallRelief + terraces;
  let height = inner + (8 - inner) * rise + rim;
  height += (h - height) * smoothstep(64, 86, r);
  return height;
}

class PolarDustPuff {
  readonly group = new THREE.Group();
  private sprites: THREE.Sprite[] = [];
  private velocities: THREE.Vector3[] = [];
  private life = 0;

  constructor(texture: THREE.Texture, count: number) {
    for (let i = 0; i < count; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: texture,
          color: 0x66717d,
          transparent: true,
          opacity: 0,
          depthWrite: false
        })
      );
      sprite.scale.setScalar(0.45 + (i % 4) * 0.1);
      this.group.add(sprite);
      this.sprites.push(sprite);
      this.velocities.push(new THREE.Vector3());
    }
  }

  emit(at: THREE.Vector3, dir: number): void {
    this.life = 1.15;
    const count = Math.max(1, this.sprites.length);
    this.sprites.forEach((sprite, i) => {
      const spread = (i / count - 0.5) * 1.1;
      const a = dir + Math.PI + spread;
      const speed = 0.7 + (i % 5) * 0.14;
      sprite.position.copy(at);
      this.velocities[i].set(Math.cos(a) * speed, 0.2 + (i % 4) * 0.1, Math.sin(a) * speed);
    });
  }

  tick(dt: number): boolean {
    if (this.life <= 0) {
      return false;
    }
    this.life -= dt;
    const u = Math.max(0, this.life / 1.15);
    this.sprites.forEach((sprite, i) => {
      sprite.position.addScaledVector(this.velocities[i], dt);
      this.velocities[i].y -= 1.62 * dt;
      sprite.material.opacity = 0.22 * u;
    });
    return this.life > 0;
  }
}

class PolarCryoVapor {
  readonly group = new THREE.Group();
  private puffs: THREE.Mesh[] = [];
  private rate = 0;
  private count = 1;

  constructor(count: number) {
    for (let i = 0; i < count; i++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 8, 6),
        new THREE.MeshBasicMaterial({
          color: 0xc8f3ff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending
        })
      );
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
      [-4.8, 2.1], [-1.6, 2.1], [1.6, 2.1], [4.8, 2.1],
      [-4.8, -2.1], [-1.6, -2.1], [1.6, -2.1], [4.8, -2.1]
    ];
    this.puffs.forEach((puff, i) => {
      const visible = this.rate > 0.015 && i < Math.max(1, Math.round(this.rate * this.puffs.length * 0.34));
      puff.visible = visible;
      if (!visible) {
        return;
      }
      const phase = reduced ? 0.35 : (t * (0.12 + this.rate * 0.2) + i * 0.137) % 1;
      const [x, z] = tankXZ[i % this.count]!;
      puff.position.set(x + Math.sin(i * 2.17) * 0.16, 4.1 + phase * 2.2, z + Math.cos(i * 1.71) * 0.16);
      (puff.material as THREE.MeshBasicMaterial).opacity = this.rate * Math.sin(phase * Math.PI) * 0.11;
      puff.scale.setScalar(0.42 + phase * 0.42);
    });
    return !reduced && this.rate > 0.015;
  }
}

export class PolarDiorama implements Diorama {
  readonly group = new THREE.Group();
  readonly assets: Record<string, THREE.Object3D> = {};

  private equipment: Record<PolarEquipmentKey, PolarEquipmentAsset>;
  private excavator: PolarEquipmentAsset;
  private tents: PolarEquipmentAsset;
  private receiver: PolarEquipmentAsset;
  private tanks: PolarEquipmentAsset;
  private towers: PolarEquipmentAsset;
  private station: PolarEquipmentAsset;
  private habitat: PolarEquipmentAsset;
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private beamCore: THREE.Mesh;
  private beamCoreMat: THREE.MeshBasicMaterial;
  private splash: THREE.Mesh;
  private splashMat: THREE.MeshBasicMaterial;
  private lines: THREE.Mesh[] = [];
  private tentWisps: THREE.Sprite[] = [];
  private dust: PolarDustPuff;
  private cryoVapor: PolarCryoVapor;
  private sampleTerrain: (x: number, z: number) => number;

  private loopPeriod = 60;
  private beamTargetOpacity = 0;
  private lastDustPass = -1;
  private architecture: "solar" | "nuclear" | null = null;
  private tankCountState = 1;
  private tankFillState = 1;
  private tentGlow = 0.3;
  private receiverGlow = 0.2;
  private gridGlow = 0.2;
  private radiatorScale = 1;
  private shieldSections = 1;
  private sabatierEnabled = false;
  private solarDaylight = true;
  private solarPhase = 0;

  constructor(quality: QualityProfile, onAssetReady: () => void = () => undefined) {
    const glowTex = makeGlowTexture("160,220,250");
    const detail = quality.detailLevel;

    const baseSampler = makeTerrainHeightSampler({ carve: craterCarve, noiseAmp: 1.6 });
    const gradeSpecs = [
      { position: RECEIVER_POS, radius: 8.0 },
      { position: TENTS_POS, radius: 8.4 },
      { position: TANKS_POS, radius: 8.5 },
      { position: HABITAT_POS, radius: 7.8 },
      { position: STATION_POS, radius: 8.5 },
      ...TOWER_WORLD_POSITIONS.map((position) => ({ position, radius: 3.6 }))
    ];
    const grades = gradeSpecs.map(({ position, radius }) => ({
      position,
      radius,
      y: baseSampler(position.x, position.z)
    }));
    const terrainOpts = {
      noiseAmp: 1.6,
      segments: quality.terrainSegments,
      carve: (x: number, z: number, h: number): number => {
        let height = craterCarve(x, z, h);
        for (const grade of grades) {
          const distance = Math.hypot(x - grade.position.x, z - grade.position.z);
          if (distance < grade.radius) {
            const blend = THREE.MathUtils.smoothstep(grade.radius - distance, 0, 1.8);
            height = THREE.MathUtils.lerp(height, grade.y, blend);
          }
        }
        return height;
      }
    };
    this.sampleTerrain = makeTerrainHeightSampler(terrainOpts);
    const groundAt = (position: THREE.Vector3): number => this.sampleTerrain(position.x, position.z);

    const terrain = makeTerrain(terrainOpts);
    const terrainMaterial = terrain.material as THREE.MeshStandardMaterial;
    terrainMaterial.emissive.setHex(0x20272d);
    terrainMaterial.emissiveIntensity = 0.72;
    this.group.add(terrain);
    // A cold, non-directional bounce keeps the permanently shadowed floor
    // legible without pretending it is sunlit.
    this.group.add(new THREE.HemisphereLight(0x8fa9be, 0x313940, 0.62));
    const floorScuff = makeScuffedRegolith(48, 34, 91, 0.3);
    floorScuff.position.set(3, groundAt(RECEIVER_POS) + 0.08, -2);
    this.group.add(floorScuff);
    this.group.add(makeCraterStrata([37, 41, 45, 49, 53].slice(0, 3 + detail), (radius) => craterCarve(radius, 0, 0)));
    this.group.add(
      makeRockScatter({
        count: Math.round(quality.rockCap * 0.34),
        center: new THREE.Vector3(2, FLOOR_Y + 0.16, -1),
        radiusX: 32,
        radiusZ: 22,
        seed: 91,
        color: 0x3a424b
      })
    );

    const equipmentReady = (): void => {
      this.bindLoadedEquipment();
      onAssetReady();
    };

    this.towers = new PolarEquipmentAsset("towers", equipmentReady);
    this.towers.group.position.set(0, groundAt(TOWER_WORLD_POSITIONS[1]) + 0.015, -RIM_R);
    this.group.add(this.towers.group);
    this.assets.towers = this.towers.group;

    const crownWorld = new THREE.Vector3(0, groundAt(TOWER_WORLD_POSITIONS[1]) + 14.3, -RIM_R);
    const receiverGround = groundAt(RECEIVER_POS);
    const beamTarget = new THREE.Vector3(RECEIVER_POS.x, receiverGround + 1.0, RECEIVER_POS.z);
    const beamVec = new THREE.Vector3().subVectors(beamTarget, crownWorld);
    const beamLen = beamVec.length();
    this.beamMat = new THREE.MeshBasicMaterial({
      color: 0xaeefff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.55, beamLen, 32, 4, true), this.beamMat);
    this.beam.position.copy(crownWorld).addScaledVector(beamVec, 0.5);
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), beamVec.clone().normalize());
    this.beam.visible = false;
    enableBloom(this.beam);
    this.beamCoreMat = new THREE.MeshBasicMaterial({
      color: 0xf1fdff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, beamLen, 16, 1, true), this.beamCoreMat);
    this.beam.add(this.beamCore);
    enableBloom(this.beamCore);
    this.group.add(this.beam);
    this.assets.beam = this.beam;

    this.splashMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.cryo,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.splash = new THREE.Mesh(new THREE.RingGeometry(1.8, 4.3, 56), this.splashMat);
    this.splash.rotation.x = -Math.PI / 2;
    this.splash.position.set(RECEIVER_POS.x, receiverGround + 0.07, RECEIVER_POS.z);
    this.splash.visible = false;
    enableBloom(this.splash);
    this.group.add(this.splash);

    this.receiver = new PolarEquipmentAsset("receiver", equipmentReady);
    this.receiver.group.position.set(RECEIVER_POS.x, receiverGround + 0.015, RECEIVER_POS.z);
    this.group.add(this.receiver.group);
    this.assets.receiver = this.receiver.group;

    this.tents = new PolarEquipmentAsset("tents", equipmentReady);
    this.tents.group.position.set(TENTS_POS.x, groundAt(TENTS_POS) + 0.015, TENTS_POS.z);
    this.group.add(this.tents.group);
    this.assets.tents = this.tents.group;

    this.excavator = new PolarEquipmentAsset("excavator", equipmentReady);
    const excavatorStart = new THREE.Vector3(-11, 0, -10);
    this.excavator.group.position.set(excavatorStart.x, groundAt(excavatorStart) + 0.045, excavatorStart.z);
    this.group.add(this.excavator.group);
    this.assets.excavator = this.excavator.group;

    this.station = new PolarEquipmentAsset("station", equipmentReady);
    this.station.group.position.set(STATION_POS.x, groundAt(STATION_POS) + 0.015, STATION_POS.z);
    this.station.group.rotation.y = -0.55;
    this.group.add(this.station.group);
    this.assets.station = this.station.group;

    this.tanks = new PolarEquipmentAsset("tanks", equipmentReady);
    this.tanks.group.position.set(TANKS_POS.x, groundAt(TANKS_POS) + 0.015, TANKS_POS.z);
    this.group.add(this.tanks.group);
    this.assets.tanks = this.tanks.group;

    this.habitat = new PolarEquipmentAsset("habitat", equipmentReady);
    this.habitat.group.position.set(HABITAT_POS.x, groundAt(HABITAT_POS) + 0.015, HABITAT_POS.z);
    this.group.add(this.habitat.group);
    this.assets.habitat = this.habitat.group;

    const shadows: Array<[THREE.Vector3, number, number]> = [
      [RECEIVER_POS, 7, 6], [TENTS_POS, 7, 5], [TANKS_POS, 12, 7], [HABITAT_POS, 6, 5], [STATION_POS, 8, 6]
    ];
    for (const [position, width, depth] of shadows) {
      const shadow = makeContactShadow(width, depth, 0.28);
      shadow.position.set(position.x, groundAt(position) + 0.025, position.z);
      this.group.add(shadow);
    }

    this.cryoVapor = new PolarCryoVapor(Math.max(10, Math.round(quality.effectCap * 0.18)));
    this.cryoVapor.group.position.copy(this.tanks.group.position);
    this.group.add(this.cryoVapor.group);
    this.dust = new PolarDustPuff(glowTex, Math.max(10, Math.round(quality.effectCap * 0.2)));
    this.group.add(this.dust.group);

    for (let i = 0; i < 3; i++) {
      const wisp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glowTex, color: SCENE_COLORS.cryo, transparent: true, opacity: 0, depthWrite: false })
      );
      wisp.scale.setScalar(1.15);
      wisp.position.set(TENTS_POS.x + i * 3.5 - 3.5, groundAt(TENTS_POS) + 2.8, TENTS_POS.z + (i % 2) * 2.8);
      enableBloom(wisp);
      this.group.add(wisp);
      this.tentWisps.push(wisp);
    }

    const floorLight = new THREE.PointLight(SCENE_COLORS.cryo, 48, 44, 1.8);
    floorLight.position.set(RECEIVER_POS.x, receiverGround + 6, RECEIVER_POS.z + 2);
    this.group.add(floorLight);
    const campLight = new THREE.PointLight(SCENE_COLORS.cryo, 20, 28, 1.8);
    campLight.position.set(TENTS_POS.x, groundAt(TENTS_POS) + 4, TENTS_POS.z);
    this.group.add(campLight);
    const crownLight = new THREE.PointLight(SCENE_COLORS.solar, 42, 58, 1.6);
    crownLight.position.copy(crownWorld).add(new THREE.Vector3(0, 1, 3));
    this.group.add(crownLight);

    const lifted = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] => {
      const ay = groundAt(a) + 0.42;
      const by = groundAt(b) + 0.42;
      return [
        new THREE.Vector3(a.x, ay, a.z),
        new THREE.Vector3((a.x + b.x) / 2, Math.max(ay, by) + 1, (a.z + b.z) / 2),
        new THREE.Vector3(b.x, by, b.z)
      ];
    };
    this.lines.push(makePowerLine(lifted(RECEIVER_POS, TENTS_POS), SCENE_COLORS.cryo));
    this.lines.push(makePowerLine(lifted(RECEIVER_POS, TANKS_POS), SCENE_COLORS.cryo));
    this.lines.push(makePowerLine(lifted(RECEIVER_POS, HABITAT_POS), SCENE_COLORS.cryo));
    for (const line of this.lines) {
      this.group.add(line);
    }

    this.equipment = {
      excavator: this.excavator,
      tents: this.tents,
      receiver: this.receiver,
      tanks: this.tanks,
      towers: this.towers,
      station: this.station,
      habitat: this.habitat
    };
  }

  apply(result: SimResult, params: SimParams, tweens: TweenManager, reduced: boolean): void {
    const ms = reduced ? 0 : 300;
    tweens.add("po.loop", this.loopPeriod, excavatorLoopPeriodS(result.production.regolithKgPerDay), ms, (v) => {
      this.loopPeriod = v;
    });

    const architecture = result.power.architecture;
    this.architecture = architecture;
    this.station.group.visible = true;

    const radius = beamRadius(result.power.beamedFloorPowerW);
    this.setBeamState(radius > 0, radius, ms, tweens);
    this.tentGlow = tentGlowIntensity(result.thermal.secSub_JPerKg);
    this.receiverGlow = radius > 0 ? 1 : 0.18;
    this.gridGlow = Math.min(2.8, 0.6 + powerLineOpacity(result.energy.gridPowerW) * 2.5);
    this.tankCountState = tankCount(params);
    this.tankFillState = tankFillFraction(result);
    this.cryoVapor.setState(this.tankCountState, boiloffWispRate(result.cryo.boiloffKgPerDay));
    this.radiatorScale = radiatorWingScale(result.power.radiatorM2);
    this.shieldSections = Math.max(1, Math.min(6, Math.ceil(habitatShellSteps(result.construction.shieldDesignM) / 7)));
    this.sabatierEnabled = params.enableSabatier;
    this.applyEquipmentVisualState();

    const lineOpacity = powerLineOpacity(result.energy.gridPowerW);
    for (const line of this.lines) {
      const mat = line.material as THREE.MeshBasicMaterial;
      tweens.add(`po.line.${line.id}`, mat.opacity, lineOpacity, ms, (v) => {
        mat.opacity = v;
      });
    }
  }

  applyTime(point: TimeseriesPoint, params: SimParams, result: SimResult, cycleHours: number): void {
    const reserveKg = Math.max(1, params.reserveDays * result.production.targetKgPerDay);
    this.tankFillState = Math.min(1, Math.max(0, point.tankFillKg / reserveKg));
    this.cryoVapor.setState(this.tankCountState, boiloffWispRate(point.boiloffKgPerDay));
    const loadScale = result.energy.gridPowerW > 0 ? Math.min(1.4, point.loadW / result.energy.gridPowerW) : 1;
    this.tentGlow = tentGlowIntensity(result.thermal.secSub_JPerKg) * loadScale;
    this.receiverGlow = point.daylight && result.power.beamedFloorPowerW !== null ? 1.1 * loadScale : 0.16;
    this.gridGlow = Math.min(2.8, 0.6 + powerLineOpacity(point.loadW) * 2.5);
    this.solarDaylight = point.daylight;
    this.solarPhase = ((point.tHours / Math.max(1, cycleHours)) % 1 + 1) % 1;
    this.setBeamImmediate(point.daylight && (result.power.beamedFloorPowerW ?? 0) > 0);
    this.applyEquipmentVisualState();
    for (const line of this.lines) {
      (line.material as THREE.MeshBasicMaterial).opacity = powerLineOpacity(point.loadW);
    }
  }

  tick(dt: number, t: number, reduced: boolean): boolean {
    let active = false;
    if (!reduced) {
      const a = ((t % this.loopPeriod) / this.loopPeriod) * Math.PI * 2;
      const x = -11 + Math.cos(a) * 4.5;
      const z = -10 + Math.sin(a) * 3.0;
      this.excavator.group.position.set(x, this.sampleTerrain(x, z) + 0.045, z);
      this.excavator.group.rotation.y = -a - Math.PI / 2;
      const boom = this.excavator.node("PolarExcavator_BoomPivot");
      const auger = this.excavator.node("PolarExcavator_AugerPivot");
      if (boom !== null) {
        boom.rotation.z = -0.08 - Math.max(0, Math.cos(a)) * 0.2 + Math.sin(t * 4.2) * 0.015;
      }
      if (auger !== null) {
        auger.rotation.z -= dt * (1.4 + 14 / Math.max(8, this.loopPeriod));
      }
      const dustPass = Math.floor((t / Math.max(1, this.loopPeriod)) * 2);
      if (dustPass !== this.lastDustPass) {
        this.lastDustPass = dustPass;
        this.dust.emit(this.excavator.group.position.clone().add(new THREE.Vector3(3.4, 0.4, 0)), this.excavator.group.rotation.y);
      }

      const dish = this.receiver.node("Receiver_DishPivot");
      const valve = this.receiver.node("Receiver_SabatierValvePivot");
      if (dish !== null) {
        dish.rotation.y = Math.sin(t * 0.22) * 0.035;
      }
      if (valve !== null && this.sabatierEnabled) {
        valve.rotation.y = Math.sin(t * 0.45) * 0.28;
      }
      for (let i = 1; i <= 3; i++) {
        const tentValve = this.tents.node(`Sublimation_ValvePivot_${String(i).padStart(2, "0")}`);
        if (tentValve !== null) {
          tentValve.rotation.y = Math.sin(t * 0.38 + i) * 0.18;
        }
      }
      for (let i = 1; i <= 3; i++) {
        const tracker = this.towers.node(`PolarPower_Tracker_${String(i).padStart(2, "0")}`);
        if (tracker !== null) {
          tracker.rotation.y = this.solarDaylight ? Math.sin(this.solarPhase * Math.PI * 2) * 0.42 : 0;
        }
      }
      if (this.beam.visible && this.beamTargetOpacity > 0) {
        this.beamMat.opacity = this.beamTargetOpacity * (0.9 + 0.1 * Math.sin(t * 5.1) * Math.sin(t * 1.7));
        this.beamCoreMat.opacity = this.beamMat.opacity * 0.48;
        this.splash.rotation.z += dt * 0.24;
        this.splashMat.opacity = 0.24 + 0.08 * Math.sin(t * 4.4);
      }
      this.tentWisps.forEach((wisp, i) => {
        const u = ((t * 0.24 + i * 0.37) % 1 + 1) % 1;
        wisp.position.y = this.tents.group.position.y + 2.5 + u * 2.5;
        wisp.material.opacity = Math.min(0.34, this.tentGlow * 0.18) * Math.sin(u * Math.PI);
      });
      active = true;
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
    const towerBase = this.towers.group.position.y;
    for (let i = 1; i <= 3; i++) {
      const tower = this.towers.node(`PolarPower_Tower_${String(i).padStart(2, "0")}`);
      if (tower !== null) {
        tower.position.y = this.sampleTerrain(TOWER_WORLD_POSITIONS[i - 1]!.x, TOWER_WORLD_POSITIONS[i - 1]!.z) - towerBase;
      }
    }
    this.applyEquipmentVisualState();
  }

  private applyEquipmentVisualState(): void {
    for (let i = 1; i <= 8; i++) {
      const suffix = String(i).padStart(2, "0");
      const tank = this.tanks.node(`PolarCryo_Tank_${suffix}`);
      if (tank !== null) {
        tank.visible = i <= this.tankCountState;
      }
      const fill = this.tanks.node(`PolarCryo_FillColumn_${suffix}`);
      if (fill !== null) {
        fill.scale.y = 0.12 + this.tankFillState * 0.88;
      }
    }
    const sabatier = this.receiver.node("Receiver_SabatierRoot");
    if (sabatier !== null) {
      sabatier.visible = this.sabatierEnabled;
    }
    const radiators = this.station.node("PolarNuclear_RadiatorRoot");
    if (radiators !== null) {
      radiators.scale.x = this.radiatorScale;
    }
    for (let i = 1; i <= 6; i++) {
      const shield = this.habitat.node(`PolarHabitat_Shield_${String(i).padStart(2, "0")}`);
      if (shield !== null) {
        shield.visible = i <= this.shieldSections;
      }
    }
    const materialStates: Array<[PolarEquipmentAsset, string, number]> = [
      [this.excavator, "POLAR_EXC_StatusLight", 1.2 + 36 / Math.max(8, this.loopPeriod)],
      [this.tents, "SUB_StatusLight", 0.8 + this.tentGlow * 1.6],
      [this.receiver, "RECV_StatusLight", 0.8 + this.receiverGlow * 2.1],
      [this.receiver, "RECV_WarmLight", this.sabatierEnabled ? 2.6 : 0.18],
      [this.tanks, "POLAR_CRYO_StatusLight", 0.8 + this.tankFillState * 2.2],
      [this.towers, "POLAR_POWER_StatusLight", 0.8 + this.gridGlow],
      [this.station, "POLAR_NUC_StatusLight", 0.8 + this.gridGlow],
      [this.habitat, "POLAR_HAB_StatusLight", 1.5]
    ];
    for (const [asset, materialName, intensity] of materialStates) {
      for (const material of asset.materials(materialName)) {
        material.emissiveIntensity = intensity;
      }
    }
    for (const material of this.towers.materials("POLAR_POWER_Photovoltaic")) {
      material.transparent = !this.solarDaylight;
      material.opacity = this.solarDaylight ? 1 : 0.42;
    }
    for (const material of this.station.group.children.flatMap((child) => collectMaterials(child))) {
      const active = this.architecture === "nuclear";
      material.transparent = !active;
      material.opacity = active ? 1 : 0.34;
    }
  }

  private setBeamState(on: boolean, radius: number, ms: number, tweens: TweenManager): void {
    this.beamTargetOpacity = on ? 0.22 : 0;
    this.beam.visible = on || this.beamMat.opacity > 0.01;
    this.splash.visible = on || this.splashMat.opacity > 0.01;
    tweens.add("po.beam", this.beamMat.opacity, this.beamTargetOpacity, ms, (value) => {
      this.beamMat.opacity = value;
      this.beamCoreMat.opacity = value * 0.48;
      this.beam.visible = value > 0.01;
    });
    tweens.add("po.splash", this.splashMat.opacity, on ? 0.3 : 0, ms, (value) => {
      this.splashMat.opacity = value;
      this.splash.visible = value > 0.01;
    });
    if (radius > 0) {
      const scale = Math.max(0.5, radius * 0.42);
      tweens.add("po.beamR", this.beam.scale.x, scale, ms, (value) => {
        this.beam.scale.x = value;
        this.beam.scale.z = value;
      });
      this.splash.scale.setScalar(0.82 + radius * 0.24);
    }
  }

  private setBeamImmediate(on: boolean): void {
    this.beamTargetOpacity = on ? 0.22 : 0;
    this.beamMat.opacity = this.beamTargetOpacity;
    this.beamCoreMat.opacity = this.beamTargetOpacity * 0.48;
    this.splashMat.opacity = on ? 0.3 : 0;
    this.beam.visible = on;
    this.splash.visible = on;
  }

  dispose(): void {
    for (const asset of Object.values(this.equipment)) {
      asset.dispose();
    }
    disposeObject(this.group);
  }
}

function collectMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials = new Set<THREE.MeshStandardMaterial>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }
    const assigned = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of assigned) {
      if (material instanceof THREE.MeshStandardMaterial) {
        materials.add(material);
      }
    }
  });
  return [...materials];
}
