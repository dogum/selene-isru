export interface BuildInfo {
  /** @selene-isru/app package version */
  app: string;
  /** @selene-isru/engine package version */
  engine: string;
  /** git commit of the build; "-dirty" when built from uncommitted changes */
  commit: string;
}

export const BUILD_INFO: BuildInfo = __SELENE_BUILD__;

/** One-line stamp for reports and file metadata. */
export function buildStamp(info: BuildInfo = BUILD_INFO): string {
  return `app ${info.app} · engine ${info.engine} · ${info.commit}`;
}

/**
 * The model boundary, carried verbatim into every export so a file read out
 * of context still says what it is and is not.
 */
export const MODEL_BOUNDARY =
  "SELENE-ISRU is a conceptual systems and comparative trade tool, not a flight, hardware, safety, cost, or mission-readiness model. TypeScript/Python parity proves implementation agreement, not physical validation.";
