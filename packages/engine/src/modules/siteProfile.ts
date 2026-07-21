import type { PolarProfilePoint, PolarProfileSummary, SimParams, Warning } from "../types";

interface ImportedProfile {
  version?: number;
  name?: string;
  points?: Array<{
    hour?: number;
    illumination?: number;
    receiverVisibility?: number;
    surfaceTemperatureK?: number;
  }>;
}

export interface SiteProfileResult {
  profile: PolarProfileSummary;
  warnings: Warning[];
}

function scalarProfile(params: SimParams): PolarProfileSummary {
  const equatorial = params.site === "equatorial";
  const shadow = equatorial ? 354 : params.polarLongestShadowHours;
  const fraction = equatorial ? 0.5 : params.polarIlluminationFraction;
  const day = shadow * fraction / (1 - fraction);
  const cycle = day + shadow;
  const transition = Math.min(1e-6, shadow / 1000);
  return {
    mode: "scalar",
    name: equatorial ? "Equatorial lunar day/night cycle" : "Scalar polar assumptions",
    cycleHours: cycle,
    averageIllumination: fraction,
    averageReceiverVisibility: 1,
    averageDeliveredFraction: fraction,
    longestShadowHours: shadow,
    longestReceiverOutageHours: shadow,
    minimumSurfaceTemperatureK: params.Tpsr,
    maximumSurfaceTemperatureK: params.Tsurface,
    points: [
      { hour: 0, illumination: 1, receiverVisibility: 1, surfaceTemperatureK: params.Tsurface },
      { hour: day, illumination: 1, receiverVisibility: 1, surfaceTemperatureK: params.Tsurface },
      { hour: day + transition, illumination: 0, receiverVisibility: 1, surfaceTemperatureK: params.Tpsr },
      { hour: cycle, illumination: 0, receiverVisibility: 1, surfaceTemperatureK: params.Tpsr }
    ]
  };
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseImported(params: SimParams): PolarProfileSummary | null {
  if (params.polarProfileData.length === 0 || params.polarProfileData.length > 100_000) {
    return null;
  }
  let parsed: ImportedProfile;
  try {
    parsed = JSON.parse(params.polarProfileData) as ImportedProfile;
  } catch {
    return null;
  }
  if (!Array.isArray(parsed.points) || parsed.points.length < 2 || parsed.points.length > 512) {
    return null;
  }
  const points: PolarProfilePoint[] = [];
  for (const raw of parsed.points) {
    if (!finite(raw.hour) || !finite(raw.illumination)) {
      return null;
    }
    const receiverVisibility = raw.receiverVisibility ?? 1;
    const surfaceTemperatureK = raw.surfaceTemperatureK ?? params.Tsurface;
    if (!finite(receiverVisibility) || !finite(surfaceTemperatureK)) {
      return null;
    }
    if (
      raw.hour < 0 || raw.illumination < 0 || raw.illumination > 1 ||
      receiverVisibility < 0 || receiverVisibility > 1 ||
      surfaceTemperatureK < 20 || surfaceTemperatureK > 450
    ) {
      return null;
    }
    if (points.length > 0 && raw.hour <= points[points.length - 1]!.hour) {
      return null;
    }
    points.push({ hour: raw.hour, illumination: raw.illumination, receiverVisibility, surfaceTemperatureK });
  }
  if (Math.abs(points[0]!.hour) > 1e-9 || points.at(-1)!.hour <= 0) {
    return null;
  }

  const cycleHours = points.at(-1)!.hour;
  let illumIntegral = 0;
  let visibilityIntegral = 0;
  let deliveredIntegral = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index]!;
    const b = points[index + 1]!;
    const dt = b.hour - a.hour;
    illumIntegral += 0.5 * (a.illumination + b.illumination) * dt;
    visibilityIntegral += 0.5 * (a.receiverVisibility + b.receiverVisibility) * dt;
    // Exact integral of the product of two linearly interpolated fractions.
    deliveredIntegral += dt / 6 * (
      2 * a.illumination * a.receiverVisibility +
      a.illumination * b.receiverVisibility +
      b.illumination * a.receiverVisibility +
      2 * b.illumination * b.receiverVisibility
    );
  }
  const longestShadowHours = longestCircularOutage(points, false);
  const longestReceiverOutageHours = longestCircularOutage(points, true);
  return {
    mode: "profile",
    name: typeof parsed.name === "string" && parsed.name.trim().length > 0
      ? parsed.name.trim().slice(0, 80)
      : "Imported polar profile",
    cycleHours,
    averageIllumination: illumIntegral / cycleHours,
    averageReceiverVisibility: visibilityIntegral / cycleHours,
    averageDeliveredFraction: deliveredIntegral / cycleHours,
    longestShadowHours,
    longestReceiverOutageHours,
    minimumSurfaceTemperatureK: Math.min(...points.map((point) => point.surfaceTemperatureK)),
    maximumSurfaceTemperatureK: Math.max(...points.map((point) => point.surfaceTemperatureK)),
    points
  };
}

function longestCircularOutage(points: PolarProfilePoint[], includeVisibility: boolean): number {
  const cycle = points.at(-1)!.hour;
  const bins = 1024;
  const dark: boolean[] = [];
  for (let index = 0; index < bins; index += 1) {
    const point = samplePoints(points, ((index + 0.5) / bins) * cycle);
    const delivered = point.illumination * (includeVisibility ? point.receiverVisibility : 1);
    dark.push(delivered <= 0.05);
  }
  let longest = 0;
  let run = 0;
  for (let index = 0; index < bins * 2; index += 1) {
    if (dark[index % bins]!) {
      run = Math.min(bins, run + 1);
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  return (longest / bins) * cycle;
}

function samplePoints(points: PolarProfilePoint[], hour: number): PolarProfilePoint {
  const cycle = points.at(-1)!.hour;
  const t = ((hour % cycle) + cycle) % cycle;
  let index = 0;
  while (index < points.length - 2 && points[index + 1]!.hour < t) {
    index += 1;
  }
  const a = points[index]!;
  const b = points[index + 1] ?? a;
  const span = Math.max(1e-12, b.hour - a.hour);
  const fraction = Math.min(1, Math.max(0, (t - a.hour) / span));
  const lerp = (x: number, y: number): number => x + (y - x) * fraction;
  return {
    hour: t,
    illumination: lerp(a.illumination, b.illumination),
    receiverVisibility: lerp(a.receiverVisibility, b.receiverVisibility),
    surfaceTemperatureK: lerp(a.surfaceTemperatureK, b.surfaceTemperatureK)
  };
}

export function resolvePolarProfile(params: SimParams): SiteProfileResult {
  if (params.site !== "polar" || params.polarProfileMode === "scalar") {
    return { profile: scalarProfile(params), warnings: [] };
  }
  const imported = parseImported(params);
  if (imported !== null) {
    return { profile: imported, warnings: [] };
  }
  return {
    profile: scalarProfile(params),
    warnings: [{
      id: "polar-profile-invalid",
      severity: "alarm",
      module: "power",
      message: "The imported polar site profile is invalid; scalar assumptions are active.",
      value: 0,
      limit: 1
    }]
  };
}

export function samplePolarProfile(profile: PolarProfileSummary, hour: number): PolarProfilePoint {
  return samplePoints(profile.points, hour);
}
