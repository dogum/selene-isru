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
  flatMat,
  makeBoltRing,
  makeCableRun,
  makeCraterStrata,
  makeEquipmentCluster,
  makeGlowTexture,
  makeHabitat,
  makeLadder,
  makeMonolithStation,
  makePowerLine,
  makeRibBands,
  makeRover,
  makeScuffedRegolith,
  makeTerrain,
  materialMaps,
  materialsOf,
  TankFarm,
  type Habitat,
  type MonolithStation,
  type Rover,
  makeContactShadow,
  makeGreebles,
  makeRockScatter,
  roundedBox
} from "./shared";
import { enableBloom } from "../layers";
import type { Diorama } from "./types";

const FLOOR_Y = -10;
const RIM_R = 57;
const RECEIVER_POS = new THREE.Vector3(0, FLOOR_Y, -6);
const TENTS_POS = new THREE.Vector3(5, FLOOR_Y, -1);
const TANKS_POS = new THREE.Vector3(15, FLOOR_Y, 3);
const HABITAT_POS = new THREE.Vector3(-15, FLOOR_Y, 3);

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** crater profile: shadowed floor, rising wall, rim ridge, falloff outside */
function craterCarve(x: number, z: number, h: number): number {
  const r = Math.hypot(x, z);
  const rise = smoothstep(34, 52, r);
  const rim = 9 * Math.exp(-((r - RIM_R) ** 2) / 42);
  const floor = FLOOR_Y + h * 0.16;
  const wallRelief = h * (0.1 + 0.22 * rise);
  const terraces =
    Math.sin(r * 0.92) *
    0.34 *
    smoothstep(35, 41, r) *
    (1 - smoothstep(53, 59, r));
  const inner = floor + wallRelief + terraces;
  let height = inner + (8 - inner) * rise + rim;
  height += (h - height) * smoothstep(64, 86, r);
  return height;
}

/** rim surface height at radius RIM_R for given angle */
function rimY(): number {
  return 8 + 9;
}

function makeBeamMotes(count: number, beamLen: number): THREE.BufferGeometry {
  let seed = 0x5e1e9;
  const rand = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.85;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = (rand() - 0.5) * beamLen;
    positions[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geo;
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
          color: 0x56606b,
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

export class PolarDiorama implements Diorama {
  readonly group = new THREE.Group();
  readonly assets: Record<string, THREE.Object3D> = {};

  private rovers: Rover[] = [];
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private beamVolume: THREE.Mesh;
  private beamVolumeMat: THREE.ShaderMaterial;
  private beamCore: THREE.Mesh;
  private beamCoreMat: THREE.MeshBasicMaterial;
  private beamMotes: THREE.Points;
  private beamMotesMat: THREE.PointsMaterial;
  private splash: THREE.Mesh;
  private splashMat: THREE.MeshBasicMaterial;
  private receiverMat: THREE.MeshStandardMaterial;
  private tentMats: THREE.MeshStandardMaterial[] = [];
  private tentWisps: THREE.Sprite[] = [];
  private tanks: TankFarm;
  private monolith: MonolithStation;
  private towersGroup: THREE.Group;
  private habitat: Habitat;
  private lines: THREE.Mesh[] = [];
  private dust: PolarDustPuff;

  private loopPeriod = 60;
  private beamTargetOpacity = 0;
  private lastDustPass = -1;
  private architecture: "solar" | "nuclear" | null = null;

  constructor(quality: QualityProfile) {
    const glowTex = makeGlowTexture("160,220,250");
    const detail = quality.detailLevel;
    const greebleBudget = quality.greebleCap;

    const terrain = makeTerrain({
      carve: craterCarve,
      noiseAmp: 1.6,
      segments: quality.terrainSegments
    });
    this.group.add(terrain);
    const floorScuff = makeScuffedRegolith(46, 32, 91, 0.32);
    floorScuff.position.set(3, FLOOR_Y + 0.11, -2);
    this.group.add(floorScuff);
    this.group.add(makeCraterStrata([37, 41, 45, 49, 53].slice(0, 3 + detail), (radius) => craterCarve(radius, 0, 0)));
    this.group.add(
      makeRockScatter({
        count: Math.round(quality.rockCap * 0.34),
        center: new THREE.Vector3(2, FLOOR_Y + 0.16, -1),
        radiusX: 32,
        radiusZ: 22,
        seed: 91,
        color: 0x333842
      })
    );
    const rimScatter = makeRockScatter({
      count: Math.round(quality.rockCap * 0.22),
      center: new THREE.Vector3(0, rimY() + 0.22, -RIM_R + 2),
      radiusX: 46,
      radiusZ: 7,
      seed: 132,
      color: 0x4b4e52
    });
    rimScatter.castShadow = false;
    this.group.add(rimScatter);

    /* 1. rim arc with solar towers */
    this.towersGroup = new THREE.Group();
    const mastMat = flatMat(SCENE_COLORS.metal, {
      ...materialMaps("metal"),
      metalness: 0.4,
      roughness: 0.55,
      envMapIntensity: 0.5
    });
    const crownMat = flatMat(SCENE_COLORS.solar, {
      ...materialMaps("panel"),
      metalness: 0.6,
      roughness: 0.3,
      emissive: SCENE_COLORS.solar,
      emissiveIntensity: 0.18
    });
    const towerAngles = [-0.32, 0, 0.32];
    for (const a of towerAngles) {
      const tower = new THREE.Group();
      const x = Math.sin(a) * RIM_R;
      const z = -Math.cos(a) * RIM_R;
      tower.position.set(x, rimY(), z);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 14, 18), mastMat);
      mast.position.y = 7;
      mast.castShadow = true;
      tower.add(mast);
      const basePad = new THREE.Mesh(roundedBox(2.0, 0.18, 2.0, 0.06, 1), mastMat);
      basePad.position.y = 0.09;
      basePad.castShadow = true;
      tower.add(basePad);
      tower.add(makeRibBands(0.58, 13.4, 4 + detail, SCENE_COLORS.metalDark));
      tower.add(makeBoltRing({ radius: 0.66, y: 1.0, count: 10 + detail * 2, size: 0.045 }));
      const ladder = makeLadder(10.6, 0.34, 9 + detail * 2);
      ladder.position.set(0, 1.4, 0.63);
      tower.add(ladder);
      for (let p = 0; p < 3; p++) {
        const crown = new THREE.Mesh(roundedBox(4.4, 0.12, 1.6, 0.035, 1), crownMat);
        crown.position.y = 14.2;
        crown.rotation.y = (p / 3) * Math.PI;
        crown.rotation.z = 0.12;
        enableBloom(crown);
        tower.add(crown);
      }
      tower.add(
        makeCableRun(
          [
            new THREE.Vector3(0.42, 2.2, 0.42),
            new THREE.Vector3(0.78, 7.2, 0.2),
            new THREE.Vector3(0.44, 13.2, -0.4),
            new THREE.Vector3(1.5, 14.1, -0.2)
          ],
          SCENE_COLORS.metalDark,
          0.035
        )
      );
      tower.add(makeGreebles({ count: Math.max(6, Math.round(greebleBudget * 0.035)), radius: 0.9, height: 11.5, seed: 30 + Math.round((a + 1) * 100) }));
      this.towersGroup.add(tower);
    }
    this.group.add(this.towersGroup);
    this.assets.towers = this.towersGroup;

    /* 2. the beam — rim crown → floor receiver, additive, solar→cryo gradient */
    const crownWorld = new THREE.Vector3(0, rimY() + 14.2, -RIM_R);
    const beamVec = new THREE.Vector3().subVectors(RECEIVER_POS, crownWorld);
    const beamLen = beamVec.length();
    const beamGeo = new THREE.CylinderGeometry(0.82, 1.16, beamLen, 48, 10, true);
    // vertex colors: +y end (rim) solar, -y end (floor) cryo
    const positions = beamGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const solar = new THREE.Color(SCENE_COLORS.solar);
    const cryo = new THREE.Color(SCENE_COLORS.cryo);
    const mix = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const u = (positions.getY(i) / beamLen + 0.5);
      mix.copy(cryo).lerp(solar, u);
      colors[i * 3] = mix.r;
      colors[i * 3 + 1] = mix.g;
      colors[i * 3 + 2] = mix.b;
    }
    beamGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    this.beamMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.beam.position.copy(crownWorld).add(beamVec.clone().multiplyScalar(0.5));
    this.beam.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      beamVec.clone().normalize().negate()
    );
    this.beam.visible = false;
    this.beamVolumeMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 }
      },
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vColor;
        void main() {
          vUv = uv;
          vColor = color;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        varying vec3 vColor;
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }
        void main() {
          float edge = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));
          float column = smoothstep(0.02, 0.5, abs(vUv.x - 0.5));
          float n = noise(vec2(vUv.x * 7.0 + uTime * 0.18, vUv.y * 18.0 - uTime * 0.55));
          float bands = 0.55 + 0.45 * sin(vUv.y * 42.0 + n * 5.0 - uTime * 2.0);
          float a = uOpacity * edge * column * (0.38 + 0.62 * bands);
          gl_FragColor = vec4(vColor * (0.85 + n * 0.35), a);
        }
      `
    });
    const beamVolumeGeo = new THREE.CylinderGeometry(1.1, 1.42, beamLen, 48, 16, true);
    const volumePositions = beamVolumeGeo.attributes.position as THREE.BufferAttribute;
    const volumeColors = new Float32Array(volumePositions.count * 3);
    for (let i = 0; i < volumePositions.count; i++) {
      const u = volumePositions.getY(i) / beamLen + 0.5;
      mix.copy(cryo).lerp(solar, u);
      volumeColors[i * 3] = mix.r;
      volumeColors[i * 3 + 1] = mix.g;
      volumeColors[i * 3 + 2] = mix.b;
    }
    beamVolumeGeo.setAttribute("color", new THREE.BufferAttribute(volumeColors, 3));
    this.beamVolume = new THREE.Mesh(beamVolumeGeo, this.beamVolumeMat);
    enableBloom(this.beamVolume);
    this.beam.add(this.beamVolume);
    this.beamCoreMat = new THREE.MeshBasicMaterial({
      color: 0xdffbff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, beamLen, 24, 1, true), this.beamCoreMat);
    enableBloom(this.beamCore);
    this.beam.add(this.beamCore);
    this.beamMotesMat = new THREE.PointsMaterial({
      color: 0xe5fbff,
      size: 1.8,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.beamMotes = new THREE.Points(makeBeamMotes(Math.round(quality.effectCap * 0.78), beamLen), this.beamMotesMat);
    enableBloom(this.beamMotes);
    this.beam.add(this.beamMotes);
    this.group.add(this.beam);
    this.assets.beam = this.beam;

    /* 3. floor receiver + sublimation tents */
    const receiver = new THREE.Group();
    receiver.position.copy(RECEIVER_POS);
    this.receiverMat = flatMat(SCENE_COLORS.cryo, {
      ...materialMaps("metal"),
      emissive: SCENE_COLORS.cryo,
      emissiveIntensity: 0.15,
      metalness: 0.4,
      roughness: 0.4,
      envMapIntensity: 0.6
    });
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, 0.5, 40), this.receiverMat);
    dish.position.y = 0.25;
    enableBloom(dish);
    receiver.add(dish);
    const mast2 = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, 16), this.receiverMat);
    mast2.position.y = 1.6;
    enableBloom(mast2);
    receiver.add(mast2);
    const receiverHatch = new THREE.Mesh(
      roundedBox(1.0, 0.14, 0.72, 0.04, 1),
      flatMat(0x26313b, {
        ...materialMaps("metal"),
        metalness: 0.42,
        roughness: 0.48,
        envMapIntensity: 0.5
      })
    );
    receiverHatch.position.set(-1.55, 0.58, 1.55);
    receiverHatch.rotation.y = 0.65;
    receiverHatch.castShadow = true;
    receiver.add(receiverHatch);
    this.splashMat = new THREE.MeshBasicMaterial({
      color: SCENE_COLORS.cryo,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    this.splash = new THREE.Mesh(new THREE.RingGeometry(1.6, 4.2, 64), this.splashMat);
    this.splash.rotation.x = -Math.PI / 2;
    this.splash.position.y = 0.08;
    enableBloom(this.splash);
    receiver.add(this.splash);
    receiver.add(makeBoltRing({ radius: 2.85, y: 0.56, count: 24 + detail * 6, size: 0.075, color: SCENE_COLORS.metal }));
    const receiverBoxes = makeEquipmentCluster({
      count: Math.max(6, Math.round(greebleBudget * 0.055)),
      width: 5.8,
      depth: 2.2,
      seed: 152,
      color: SCENE_COLORS.metal
    });
    receiverBoxes.position.set(0, 0.34, 3.8);
    receiver.add(receiverBoxes);
    receiver.add(
      makeCableRun(
        [
          new THREE.Vector3(-3.4, 0.35, 2.4),
          new THREE.Vector3(-2.2, 0.72, 3.6),
          new THREE.Vector3(1.8, 0.72, 3.8),
          new THREE.Vector3(3.5, 0.35, 2.3)
        ],
        SCENE_COLORS.metalDark,
        0.05
      )
    );
    receiver.add(makeGreebles({ count: Math.max(8, Math.round(greebleBudget * 0.06)), radius: 3.1, height: 1.2, seed: 52, color: SCENE_COLORS.cryo }));
    this.group.add(receiver);
    this.assets.receiver = receiver;
    const receiverShadow = makeContactShadow(4.8, 4, 0.38);
    receiverShadow.position.set(RECEIVER_POS.x, FLOOR_Y + 0.04, RECEIVER_POS.z);
    this.group.add(receiverShadow);

    const tents = new THREE.Group();
    tents.position.copy(TENTS_POS);
    const coldTrap = new THREE.Mesh(
      roundedBox(1.6, 1.2, 1.6, 0.09, 1),
      flatMat(SCENE_COLORS.metalDark, { ...materialMaps("metal"), metalness: 0.5, roughness: 0.5 })
    );
    coldTrap.position.set(5.4, 0.6, 0.5);
    tents.add(coldTrap);
    for (let i = 0; i < 3; i++) {
      const mat = flatMat(0x39424d, {
        ...materialMaps("metal"),
        emissive: SCENE_COLORS.cryo,
        emissiveIntensity: 0.25,
        roughness: 0.7,
        envMapIntensity: 0.38
      });
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(1.9, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2),
        mat
      );
      dome.scale.y = 0.62;
      dome.position.set(i * 3.4 - 2, 0, (i % 2) * 2.2);
      dome.castShadow = true;
      enableBloom(dome);
      tents.add(dome);
      this.tentMats.push(mat);

      const wisp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex,
          color: SCENE_COLORS.cryo,
          transparent: true,
          opacity: 0,
          depthWrite: false
        })
      );
      wisp.scale.setScalar(1);
      wisp.position.copy(dome.position).setY(2);
      enableBloom(wisp);
      tents.add(wisp);
      this.tentWisps.push(wisp);
    }
    const tentGear = makeEquipmentCluster({
      count: Math.max(7, Math.round(greebleBudget * 0.055)),
      width: 8.4,
      depth: 4.2,
      seed: 173,
      color: SCENE_COLORS.metalDark
    });
    tentGear.position.set(1.7, 0.24, 3.8);
    tents.add(tentGear);
    tents.add(
      makeCableRun(
        [
          new THREE.Vector3(-3.4, 0.35, 2.9),
          new THREE.Vector3(0.4, 0.42, 3.6),
          new THREE.Vector3(4.7, 0.5, 2.7),
          new THREE.Vector3(5.4, 0.8, 0.5)
        ],
        SCENE_COLORS.metalDark,
        0.045
      )
    );
    this.group.add(tents);
    this.assets.tents = tents;
    const tentShadow = makeContactShadow(8, 5, 0.34);
    tentShadow.position.set(TENTS_POS.x + 1.5, FLOOR_Y + 0.04, TENTS_POS.z + 1.2);
    this.group.add(tentShadow);

    /* 4. ice hoppers/rovers with torque-dither arm */
    for (let i = 0; i < 2; i++) {
      const rover = makeRover(0x7e8894, true);
      this.group.add(rover.group);
      this.rovers.push(rover);
    }
    this.dust = new PolarDustPuff(glowTex, Math.max(10, Math.round(quality.effectCap * 0.2)));
    this.group.add(this.dust.group);
    this.assets.excavator = this.rovers[0].group;

    /* 5. rim nuclear option — radiators face the 40 K crater floor */
    this.monolith = makeMonolithStation();
    this.monolith.group.position.set(Math.sin(0.55) * RIM_R, rimY(), -Math.cos(0.55) * RIM_R);
    this.monolith.group.lookAt(new THREE.Vector3(0, FLOOR_Y, 0));
    this.monolith.group.rotateY(Math.PI / 2);
    this.monolith.group.add(makeGreebles({ count: Math.max(10, Math.round(greebleBudget * 0.08)), radius: 2.7, height: 5.8, seed: 63 }));
    const stationLadder = makeLadder(5.8, 0.5, 8 + detail);
    stationLadder.position.set(0, 0.4, 1.05);
    this.monolith.group.add(stationLadder);
    this.group.add(this.monolith.group);
    this.assets.station = this.monolith.group;

    /* 6. cryo farm + habitat on the floor, emissive accents light them */
    this.tanks = new TankFarm(8, glowTex);
    this.tanks.group.position.copy(TANKS_POS);
    this.group.add(this.tanks.group);
    this.assets.tanks = this.tanks.group;
    const tankShadow = makeContactShadow(10, 5.5, 0.32);
    tankShadow.position.set(TANKS_POS.x, FLOOR_Y + 0.04, TANKS_POS.z + 2.6);
    this.group.add(tankShadow);

    this.habitat = makeHabitat();
    this.habitat.group.position.copy(HABITAT_POS);
    this.habitat.group.add(makeGreebles({ count: Math.max(8, Math.round(greebleBudget * 0.06)), radius: 3.7, height: 1.1, seed: 79 }));
    this.habitat.group.add(
      makeCableRun(
        [
          new THREE.Vector3(-2.8, 0.34, 2.1),
          new THREE.Vector3(-3.3, 0.78, 0.4),
          new THREE.Vector3(-2.7, 1.05, -1.7)
        ],
        SCENE_COLORS.metalDark,
        0.05
      )
    );
    this.group.add(this.habitat.group);
    this.assets.habitat = this.habitat.group;
    const habitatShadow = makeContactShadow(5.2, 4.6, 0.32);
    habitatShadow.position.set(HABITAT_POS.x, FLOOR_Y + 0.04, HABITAT_POS.z);
    this.group.add(habitatShadow);

    /* accent lights — the PSR floor is lit by its own hardware, not the sun */
    const floorLight = new THREE.PointLight(SCENE_COLORS.cryo, 60, 46, 1.8);
    floorLight.position.set(RECEIVER_POS.x, FLOOR_Y + 6, RECEIVER_POS.z + 2);
    this.group.add(floorLight);
    const trapLight = new THREE.PointLight(SCENE_COLORS.cryo, 25, 30, 1.8);
    trapLight.position.set(TANKS_POS.x, FLOOR_Y + 5, TANKS_POS.z);
    this.group.add(trapLight);
    const crownLight = new THREE.PointLight(SCENE_COLORS.solar, 50, 60, 1.6);
    crownLight.position.set(0, rimY() + 15, -RIM_R + 4);
    this.group.add(crownLight);

    /* power lines: receiver → tents, receiver → cryo */
    const lineY = FLOOR_Y + 0.4;
    const lift = (a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] => [
      new THREE.Vector3(a.x, lineY, a.z),
      new THREE.Vector3((a.x + b.x) / 2, lineY + 1, (a.z + b.z) / 2),
      new THREE.Vector3(b.x, lineY, b.z)
    ];
    this.lines.push(makePowerLine(lift(RECEIVER_POS, TENTS_POS), SCENE_COLORS.cryo));
    this.lines.push(makePowerLine(lift(RECEIVER_POS, TANKS_POS), SCENE_COLORS.cryo));
    for (const line of this.lines) {
      this.group.add(line);
    }
  }

  apply(result: SimResult, params: SimParams, tweens: TweenManager, reduced: boolean): void {
    const ms = reduced ? 0 : 300;

    tweens.add(
      "po.loop",
      this.loopPeriod,
      excavatorLoopPeriodS(result.production.regolithKgPerDay),
      ms,
      (v) => {
        this.loopPeriod = v;
      }
    );

    // the rim towers always feed the beamed-power experiment; the grid
    // station swap (§3.4) fades the nuclear monolith in/out on the rim
    const arch = result.power.architecture;
    if (arch !== this.architecture) {
      const fadeMs = reduced || this.architecture === null ? 0 : 600;
      this.architecture = arch;
      fadeGroup(tweens, "po.arch", this.monolith.group, arch === "nuclear", fadeMs);
    }
    this.monolith.setRadiatorScale(radiatorWingScale(result.power.radiatorM2));

    // beam visibility + radius driven only by beamedFloorPowerW (§3.4 table)
    const radius = beamRadius(result.power.beamedFloorPowerW);
    const beamOn = radius > 0;
    this.beam.visible = beamOn || this.beamMat.opacity > 0.01;
    this.beamVolume.visible = this.beam.visible;
    this.beamCore.visible = this.beam.visible;
    this.beamMotes.visible = this.beam.visible;
    this.splash.visible = beamOn || this.splashMat.opacity > 0.01;
    this.beamTargetOpacity = beamOn ? 0.34 : 0;
    tweens.add("po.beam", this.beamMat.opacity, this.beamTargetOpacity, ms, (v) => {
      this.beamMat.opacity = v;
      this.beam.visible = v > 0.01;
      this.beamVolume.visible = this.beam.visible;
      this.beamCore.visible = this.beam.visible;
      this.beamMotes.visible = this.beam.visible;
      this.beamVolumeMat.uniforms.uOpacity.value = v * 0.58;
      this.beamCoreMat.opacity = v * 0.45;
      this.beamMotesMat.opacity = v * 0.52;
    });
    tweens.add("po.splash", this.splashMat.opacity, beamOn ? 0.42 : 0, ms, (v) => {
      this.splashMat.opacity = v;
      this.splash.visible = v > 0.01;
    });
    if (radius > 0) {
      tweens.add("po.beamR", this.beam.scale.x, radius, ms, (v) => {
        this.beam.scale.x = v;
        this.beam.scale.z = v;
      });
      tweens.add("po.splashR", this.splash.scale.x, 0.8 + radius * 0.32, ms, (v) => {
        this.splash.scale.setScalar(v);
      });
    }
    const receiverGlow = beamOn ? 0.9 : 0.12;
    tweens.add("po.recv", this.receiverMat.emissiveIntensity, receiverGlow, ms, (v) => {
      this.receiverMat.emissiveIntensity = v;
    });

    // tent glow ∝ secSub throughput
    const glow = tentGlowIntensity(result.thermal.secSub_JPerKg);
    for (const mat of this.tentMats) {
      tweens.add(`po.tent.${mat.id}`, mat.emissiveIntensity, glow, ms, (v) => {
        mat.emissiveIntensity = v;
      });
    }

    this.tanks.setCount(tankCount(params));
    this.tanks.setFill(tankFillFraction(result));
    this.tanks.setWispRate(boiloffWispRate(result.cryo.boiloffKgPerDay));

    this.habitat.setShieldSteps(habitatShellSteps(result.construction.shieldDesignM));

    const lineOpacity = powerLineOpacity(result.energy.gridPowerW);
    for (const line of this.lines) {
      const mat = line.material as THREE.MeshBasicMaterial;
      tweens.add(`po.line.${line.id}`, mat.opacity, lineOpacity, ms, (v) => {
        mat.opacity = v;
      });
    }
  }

  applyTime(point: TimeseriesPoint, params: SimParams, result: SimResult, _cycleHours: number): void {
    const reserveKg = Math.max(1, params.reserveDays * result.production.targetKgPerDay);
    const fill = Math.min(1, Math.max(0, point.tankFillKg / reserveKg));
    this.tanks.setFill(fill);
    this.tanks.setWispRate(boiloffWispRate(point.boiloffKgPerDay));

    const loadScale = result.energy.gridPowerW > 0 ? Math.min(1.4, point.loadW / result.energy.gridPowerW) : 1;
    this.receiverMat.emissiveIntensity = (point.daylight ? 0.8 : 0.18) * loadScale;
    for (const mat of this.tentMats) {
      mat.emissiveIntensity = tentGlowIntensity(result.thermal.secSub_JPerKg) * loadScale;
    }

    if (point.daylight && result.power.beamedFloorPowerW !== null && result.power.beamedFloorPowerW > 0) {
      this.beamTargetOpacity = 0.34;
      this.beamMat.opacity = 0.34;
      this.beamVolumeMat.uniforms.uOpacity.value = 0.2;
      this.beamCoreMat.opacity = 0.15;
      this.beamMotesMat.opacity = 0.18;
      this.splashMat.opacity = 0.42;
      this.beam.visible = true;
      this.beamVolume.visible = true;
      this.beamCore.visible = true;
      this.beamMotes.visible = true;
      this.splash.visible = true;
    } else {
      this.beamTargetOpacity = 0;
      this.beamMat.opacity = 0;
      this.beamVolumeMat.uniforms.uOpacity.value = 0;
      this.beamCoreMat.opacity = 0;
      this.beamMotesMat.opacity = 0;
      this.splashMat.opacity = 0;
      this.beam.visible = false;
      this.beamVolume.visible = false;
      this.beamCore.visible = false;
      this.beamMotes.visible = false;
      this.splash.visible = false;
    }

    const lineOpacity = powerLineOpacity(point.loadW);
    for (const line of this.lines) {
      (line.material as THREE.MeshBasicMaterial).opacity = lineOpacity;
    }
  }

  tick(dt: number, t: number, reduced: boolean): boolean {
    let active = false;
    if (!reduced) {
      // ice rovers patrol small loops near the tents; arm torque-dither jitter
      this.rovers.forEach((rover, i) => {
        const dir = i === 0 ? 1 : -1;
        const a = ((t % this.loopPeriod) / this.loopPeriod) * Math.PI * 2 * dir + i * 2.4;
        const cx = -8 + i * 4;
        const cz = 6 - i * 9;
        rover.group.position.set(cx + Math.cos(a) * 4.5, FLOOR_Y, cz + Math.sin(a) * 3);
        rover.group.rotation.y = -a - (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        // 2px-scale dither while digging
        rover.arm.rotation.z = -0.3 + (Math.sin(t * 37 + i * 9) + Math.sin(t * 53)) * 0.02;
        const dustPass = Math.floor((t / Math.max(1, this.loopPeriod)) * 2);
        if (i === 0 && dustPass !== this.lastDustPass) {
          this.lastDustPass = dustPass;
          this.dust.emit(rover.group.position.clone().setY(FLOOR_Y + 0.35), rover.group.rotation.y);
        }
      });

      // beam shimmer via opacity noise
      if (this.beam.visible && this.beamTargetOpacity > 0) {
        this.beamMat.opacity =
          this.beamTargetOpacity * (1 + 0.12 * Math.sin(t * 5.3) * Math.sin(t * 1.7));
        this.beamVolumeMat.uniforms.uTime.value = t;
        this.beamVolumeMat.uniforms.uOpacity.value = this.beamMat.opacity * 0.58;
        this.beamCoreMat.opacity = this.beamMat.opacity * 0.45;
        this.beamMotesMat.opacity = this.beamMat.opacity * 0.52;
        this.beamMotes.rotation.y += dt * 0.18;
        this.beamMotes.position.y = Math.sin(t * 0.6) * 0.18;
        this.splash.rotation.z += dt * 0.28;
        this.splashMat.opacity = 0.34 + 0.08 * Math.sin(t * 4.4);
      }

      // tent vapor wisps → cold trap
      this.tentWisps.forEach((wisp, i) => {
        const u = ((t * 0.3 + i * 0.41) % 1 + 1) % 1;
        wisp.position.y = 1.4 + u * 2.6;
        wisp.position.x += Math.sin(t + i) * 0.002;
        wisp.material.opacity = 0.3 * Math.sin(u * Math.PI);
      });
      active = true;
    }
    if (!reduced && this.dust.tick(dt)) {
      active = true;
    }
    if (this.tanks.tick(t) && !reduced) {
      active = true;
    }
    return active;
  }

  dispose(): void {
    disposeObject(this.group);
  }
}

function fadeGroup(
  tweens: TweenManager,
  key: string,
  group: THREE.Group,
  show: boolean,
  ms: number
): void {
  const mats = materialsOf(group);
  if (ms <= 0) {
    group.visible = show;
    for (const m of mats) {
      m.opacity = 1;
      m.transparent = false;
    }
    return;
  }
  group.visible = true;
  for (const m of mats) {
    m.transparent = true;
  }
  tweens.add(
    key,
    show ? 0 : 1,
    show ? 1 : 0,
    ms,
    (v) => {
      for (const m of mats) {
        m.opacity = v;
      }
    },
    () => {
      group.visible = show;
      for (const m of mats) {
        m.opacity = 1;
        m.transparent = false;
      }
    }
  );
}
