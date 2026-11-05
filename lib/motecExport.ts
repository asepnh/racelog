// Turns a session's samples into a MoTeC .ld file. Handles the two gaps
// between our data and what .ld needs: samples may have gaps/nulls (a
// GPS fix that didn't land that tick) and aren't necessarily on an exact
// fixed-rate grid, but every .ld channel is a flat array at one declared
// frequency with no missing values.
import type { Sample } from "./models";
import { buildLdFile, type MotecChannel } from "./motecLd";

type FieldKey = "pos_x" | "pos_y" | "speed_kph" | "rpm" | "throttle" | "brake" | "steering";

const CHANNEL_DEFS: Record<FieldKey, { name: string; shortName: string; unit: string; scale?: number }> = {
  speed_kph: { name: "Ground Speed", shortName: "Speed", unit: "km/h" },
  rpm: { name: "Engine RPM", shortName: "RPM", unit: "rpm" },
  throttle: { name: "Throttle Pos", shortName: "Throttle", unit: "%", scale: 100 },
  brake: { name: "Brake Pos", shortName: "Brake", unit: "%", scale: 100 },
  // Normalized -1..1 steering input, not a measured wheel angle in
  // degrees -- there's no known steering ratio to convert with, so this
  // is left as a dimensionless ratio rather than inventing one.
  steering: { name: "Steering Ratio", shortName: "Steer", unit: "ratio" },
  pos_x: { name: "GPS Pos X", shortName: "PosX", unit: "m" },
  pos_y: { name: "GPS Pos Y", shortName: "PosY", unit: "m" },
};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function estimateFreq(samples: Sample[]): number {
  if (samples.length < 2) return 10;
  const dts: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt > 0) dts.push(dt);
  }
  if (dts.length === 0) return 10;
  const hz = Math.round(1 / median(dts));
  return Math.min(100, Math.max(1, hz));
}

/** Linear interpolation of a sparse (t, value) series onto a uniform grid.
 * Returns null if fewer than 2 real values exist (channel not usable). */
function resampleField(samples: Sample[], key: FieldKey, grid: number[]): number[] | null {
  const points = samples
    .map((s) => ({ t: s.t, v: s[key] }))
    .filter((p): p is { t: number; v: number } => p.v !== null && p.v !== undefined && Number.isFinite(p.v));
  if (points.length < 2) return null;

  const out: number[] = [];
  let i = 0;
  for (const t of grid) {
    while (i < points.length - 2 && points[i + 1].t < t) i++;
    const a = points[i];
    const b = points[Math.min(i + 1, points.length - 1)];
    if (a.t === b.t) {
      out.push(a.v);
    } else {
      const frac = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
      out.push(a.v + (b.v - a.v) * frac);
    }
  }
  return out;
}

export function sessionToMotecLd(
  samples: Sample[],
  meta: { name?: string | null; vehicleId?: string }
): Buffer {
  if (samples.length === 0) {
    throw new Error("No samples to export");
  }
  const freq = estimateFreq(samples);
  const duration = samples[samples.length - 1].t;
  const stepCount = Math.max(1, Math.floor(duration * freq));
  const grid = Array.from({ length: stepCount + 1 }, (_, i) => i / freq);

  const channels: MotecChannel[] = [];
  for (const key of Object.keys(CHANNEL_DEFS) as FieldKey[]) {
    const resampled = resampleField(samples, key, grid);
    if (resampled === null) continue;
    const def = CHANNEL_DEFS[key];
    const data = def.scale ? resampled.map((v) => v * def.scale!) : resampled;
    channels.push({ name: def.name, shortName: def.shortName, unit: def.unit, freq, data });
  }

  if (channels.length === 0) {
    throw new Error("No channels with usable data to export");
  }

  return buildLdFile({
    eventName: meta.name ?? "RaceLog session",
    vehicleId: meta.vehicleId ?? "",
    shortComment: "Exported from RaceLog",
    channels,
  });
}
