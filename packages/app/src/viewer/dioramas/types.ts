import type * as THREE from "three";
import type { SimParams, SimResult, TimeseriesPoint } from "@selene-isru/engine";
import type { TweenManager } from "../tween";

export interface Diorama {
  readonly group: THREE.Group;
  /** named camera/pulse targets, keys per bindings.CAMERA_POSES */
  readonly assets: Record<string, THREE.Object3D>;
  /** idempotent state application; tween durations are 0 when reduced motion */
  apply(result: SimResult, params: SimParams, tweens: TweenManager, reduced: boolean): void;
  /** apply sampled day/night dynamics from simulateTimeseries */
  applyTime(point: TimeseriesPoint, params: SimParams, result: SimResult, cycleHours: number, reduced: boolean): void;
  /** advance continuous animation; returns true while anything is moving */
  tick(dt: number, t: number, reduced: boolean): boolean;
  dispose(): void;
}
