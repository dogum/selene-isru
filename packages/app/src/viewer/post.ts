import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { BLOOM_LAYER } from "./layers";

export interface PostOptions {
  mobile: boolean;
  width: number;
  height: number;
  dpr: number;
  ao: boolean;
  bloom: boolean;
  bloomStrength: number;
}

export interface PostEffects {
  ao: boolean;
  bloom: boolean;
  bloomStrength: number;
}

export class PostPipeline {
  private composer: EffectComposer;
  private bloomComposer: EffectComposer;
  private bloom: UnrealBloomPass;
  private bloomMix: ShaderPass;
  private smaa: SMAAPass;
  private gtao: GTAOPass | null = null;
  private camera: THREE.Camera;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, opts: PostOptions) {
    this.camera = camera;
    this.bloomComposer = new EffectComposer(renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(opts.width, opts.height),
      opts.bloomStrength,
      opts.mobile ? 0.28 : 0.42,
      0.02
    );
    this.bloom.enabled = opts.bloom;
    this.bloomComposer.addPass(this.bloom);

    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    if (!opts.mobile) {
      this.gtao = new GTAOPass(scene, camera, opts.width, opts.height);
      this.gtao.enabled = opts.ao;
      this.gtao.blendIntensity = 0.68;
      this.gtao.updateGtaoMaterial({
        radius: 3.2,
        distanceExponent: 1.6,
        thickness: 1.2,
        distanceFallOff: 0.78,
        scale: 0.9,
        samples: 10,
        screenSpaceRadius: false
      });
      this.gtao.updatePdMaterial({
        lumaPhi: 8,
        depthPhi: 2,
        normalPhi: 3,
        radius: 5,
        radiusExponent: 2,
        rings: 2,
        samples: 8
      });
      this.composer.addPass(this.gtao);
    }

    this.bloomMix = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
        bloomStrength: { value: opts.bloom ? 1 : 0 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D bloomTexture;
        uniform float bloomStrength;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tDiffuse, vUv);
          vec3 bloom = texture2D(bloomTexture, vUv).rgb * bloomStrength;
          gl_FragColor = vec4(base.rgb + bloom, base.a);
        }
      `
    });
    this.bloomMix.enabled = opts.bloom;
    this.composer.addPass(this.bloomMix);

    this.smaa = new SMAAPass(opts.width * opts.dpr, opts.height * opts.dpr);
    this.composer.addPass(this.smaa);
    this.composer.addPass(new OutputPass());
    this.setSize(opts.width, opts.height, opts.dpr);
  }

  setSize(width: number, height: number, dpr: number): void {
    this.bloomComposer.setPixelRatio(dpr);
    this.bloomComposer.setSize(width, height);
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(width, height);
  }

  render(dt: number): void {
    const mask = this.camera.layers.mask;
    if (this.bloomMix.enabled) {
      this.camera.layers.set(BLOOM_LAYER);
      this.bloomComposer.render(dt);
    }
    this.camera.layers.set(0);
    this.composer.render(dt);
    this.camera.layers.mask = mask;
  }

  setEffects(effects: PostEffects): void {
    if (this.gtao !== null) {
      this.gtao.enabled = effects.ao;
    }
    this.bloom.enabled = effects.bloom;
    this.bloom.strength = effects.bloomStrength;
    this.bloomMix.enabled = effects.bloom;
    this.bloomMix.uniforms.bloomStrength.value = effects.bloom ? 1 : 0;
  }

  dispose(): void {
    this.bloomComposer.dispose();
    this.composer.dispose();
  }
}
