export interface ImportedSiteProfile {
  version: 1;
  name: string;
  points: Array<{
    hour: number;
    illumination: number;
    receiverVisibility: number;
    surfaceTemperatureK: number;
  }>;
}

function number(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a finite number`);
  return parsed;
}

function canonical(name: string, rawPoints: Array<Record<string, unknown>>): ImportedSiteProfile {
  if (rawPoints.length < 2 || rawPoints.length > 512) throw new Error("Profile requires 2–512 points");
  const points = rawPoints.map((row, index) => {
    const hour = number(row.hour, `Row ${index + 1} hour`);
    const illumination = number(row.illumination, `Row ${index + 1} illumination`);
    const receiverVisibility = row.receiverVisibility === undefined ? 1 : number(row.receiverVisibility, `Row ${index + 1} receiver visibility`);
    const surfaceTemperatureK = row.surfaceTemperatureK === undefined ? 200 : number(row.surfaceTemperatureK, `Row ${index + 1} surface temperature`);
    if (hour < 0 || illumination < 0 || illumination > 1 || receiverVisibility < 0 || receiverVisibility > 1 || surfaceTemperatureK < 20 || surfaceTemperatureK > 450) {
      throw new Error(`Row ${index + 1} is outside the supported profile bounds`);
    }
    return { hour, illumination, receiverVisibility, surfaceTemperatureK };
  });
  if (Math.abs(points[0]!.hour) > 1e-9) throw new Error("The first profile hour must be 0");
  for (let index = 1; index < points.length; index += 1) {
    if (points[index]!.hour <= points[index - 1]!.hour) throw new Error("Profile hours must increase strictly");
  }
  return { version: 1, name: name.trim().slice(0, 80) || "Imported polar profile", points };
}

export function parseSiteProfileText(text: string, filename = "Imported polar profile"): ImportedSiteProfile {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as { name?: unknown; points?: unknown };
    if (!Array.isArray(parsed.points)) throw new Error("JSON profile must contain a points array");
    return canonical(typeof parsed.name === "string" ? parsed.name : filename, parsed.points as Array<Record<string, unknown>>);
  }
  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 3) throw new Error("CSV profile requires a header and at least two data rows");
  const headers = lines[0]!.split(",").map((header) => header.trim());
  const rows = lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, line.split(",")[index]?.trim()])));
  return canonical(filename.replace(/\.(csv|json)$/i, ""), rows);
}

export const SAMPLE_POLAR_PROFILE: ImportedSiteProfile = {
  version: 1,
  name: "Illustrative 72-hour ridge/receiver cycle",
  points: [
    { hour: 0, illumination: 1, receiverVisibility: 1, surfaceTemperatureK: 210 },
    { hour: 8, illumination: 0.9, receiverVisibility: 1, surfaceTemperatureK: 205 },
    { hour: 16, illumination: 0.55, receiverVisibility: 0.8, surfaceTemperatureK: 165 },
    { hour: 24, illumination: 0, receiverVisibility: 0, surfaceTemperatureK: 80 },
    { hour: 40, illumination: 0, receiverVisibility: 0, surfaceTemperatureK: 50 },
    { hour: 52, illumination: 0.35, receiverVisibility: 0.65, surfaceTemperatureK: 120 },
    { hour: 62, illumination: 0.85, receiverVisibility: 1, surfaceTemperatureK: 190 },
    { hour: 72, illumination: 1, receiverVisibility: 1, surfaceTemperatureK: 210 }
  ]
};

export function canonicalProfileJson(profile: ImportedSiteProfile): string {
  return JSON.stringify(profile);
}
