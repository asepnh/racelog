// Parses EdgeTX's native SD-card telemetry log (Model Setup -> Logs). See
// README for the full setup: no Lua/custom radio-side program needed, just
// EdgeTX's built-in "SD Logs" feature with a GPS-capable sensor (e.g. a
// RadioMaster ERS-GPS) in position mode.
//
// A row looks like:
//   Date,Time,GPS,Alt(m),RSSI(dB),CH1,CH2,CH3,...
//   2026-01-05,14:32:01.100,51.045655 -114.057685,312.4,-62,12,-980,712,...
//
// What this does with that:
//  - Parses the GPS column (lat/lon, either combined "lat lon" or split
//    into separate columns depending on firmware) into local x/y meters
//    via an equirectangular projection around the session's first fix.
//  - Derives speed_kph from consecutive GPS fixes (distance / dt, lightly
//    smoothed) instead of relying on a sensor's own ground-speed mode, so
//    one continuous GPS stream gives both position and speed.
//  - Normalizes whatever raw range EdgeTX logged channels in (-1024..1024,
//    -100..100, etc.) down to -1..1 / 0..1, using the mapping the caller
//    chose (which column is throttle/brake/steering/RPM).
//  - Detects laps itself (no lap signal exists in the raw log) by
//    watching the car leave, then return near, its starting GPS fix.

import type { Sample } from "./models";

const EARTH_RADIUS_M = 6371000;
const LAP_FAR_M = 8;
const LAP_NEAR_M = 3;
const MIN_LAP_TIME_S = 3;
const SPEED_SMOOTH_WINDOW = 5;

export interface ImportMapping {
  throttle_channel: string;
  brake_channel?: string | null;
  steering_channel: string;
  rpm_channel?: string | null;
}

export interface ImportResult {
  samples: Sample[];
  warnings: string[];
}

function parseCsv(text: string): string[][] {
  // Minimal RFC4180-ish CSV parser: handles quoted fields, no embedded
  // newlines inside quotes (EdgeTX logs don't produce those).
  return text
    .split(/\r?\n/)
    .filter((line) => line.length > 0)
    .map((line) => {
      const cells: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"') {
            if (line[i + 1] === '"') {
              cur += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          cells.push(cur);
          cur = "";
        } else {
          cur += ch;
        }
      }
      cells.push(cur);
      return cells.map((c) => c.trim());
    });
}

export function inspectHeaders(text: string): string[] {
  const rows = parseCsv(text);
  return rows[0] ?? [];
}

function findGpsColumns(headers: string[]): { lat: number; lon: number } | number | null {
  const lower = headers.map((h) => h.toLowerCase());
  const latIdx = lower.findIndex((h) => h.includes("lat"));
  const lonIdx = lower.findIndex((h) => h.includes("lon"));
  if (latIdx !== -1 && lonIdx !== -1) return { lat: latIdx, lon: lonIdx };
  const gpsIdx = lower.findIndex((h) => h === "gps");
  return gpsIdx !== -1 ? gpsIdx : null;
}

function parseLatLon(cell: string): [number, number] | null {
  const parts = cell.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (parts.length !== 2) return null;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null;
}

function projectLocalXY(lat: number, lon: number, lat0: number, lon0: number): [number, number] {
  const x = ((lon - lon0) * Math.PI / 180) * Math.cos((lat0 * Math.PI) / 180) * EARTH_RADIUS_M;
  const y = ((lat - lat0) * Math.PI) / 180 * EARTH_RADIUS_M;
  return [x, y];
}

function normalizeChannel(values: (number | null)[]): (number | null)[] {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return values;
  const peak = Math.max(1, ...present.map((v) => Math.abs(v)));
  const scale = peak <= 1.5 ? 1 : peak;
  return values.map((v) => (v === null ? null : Math.max(-1, Math.min(1, v / scale))));
}

function smooth(values: (number | null)[], window: number): (number | null)[] {
  const out: (number | null)[] = [];
  const buf: number[] = [];
  for (const v of values) {
    if (v === null) {
      out.push(null);
      continue;
    }
    buf.push(v);
    if (buf.length > window) buf.shift();
    out.push(buf.reduce((a, b) => a + b, 0) / buf.length);
  }
  return out;
}

function toFloat(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const v = parseFloat(cell);
  return Number.isFinite(v) ? v : null;
}

function parseTimestamp(dateCell: string, timeCell: string): number | null {
  const iso = `${dateCell}T${timeCell}`;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function parseEdgeTxCsv(text: string, mapping: ImportMapping): ImportResult {
  const warnings: string[] = [];
  const rows = parseCsv(text);
  if (rows.length === 0) return { samples: [], warnings: ["Empty file"] };

  const headers = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.length === headers.length);
  const colIndex = new Map(headers.map((h, i) => [h, i]));
  const gpsCols = findGpsColumns(headers);
  if (gpsCols === null) {
    warnings.push("No GPS column found -- position, speed and lap detection will be blank");
  }

  const channelIdx = (name: string | null | undefined): number | null => {
    if (!name) return null;
    const idx = colIndex.get(name);
    if (idx === undefined) {
      warnings.push(`Mapped column ${JSON.stringify(name)} not found in file`);
      return null;
    }
    return idx;
  };

  const throttleI = channelIdx(mapping.throttle_channel);
  const brakeI = channelIdx(mapping.brake_channel);
  const steeringI = channelIdx(mapping.steering_channel);
  const rpmI = channelIdx(mapping.rpm_channel);

  const timestamps: number[] = [];
  const latlon: ([number, number] | null)[] = [];
  const rawThrottle: (number | null)[] = [];
  const rawBrake: (number | null)[] = [];
  const rawSteering: (number | null)[] = [];
  const rpmVals: (number | null)[] = [];

  let t0: number | null = null;
  for (const r of dataRows) {
    const ms = parseTimestamp(r[0], r[1]);
    if (ms === null) continue;
    if (t0 === null) t0 = ms;
    timestamps.push((ms - t0) / 1000);

    let pos: [number, number] | null = null;
    if (gpsCols !== null && typeof gpsCols === "object") {
      const lat = toFloat(r[gpsCols.lat]);
      const lon = toFloat(r[gpsCols.lon]);
      if (lat !== null && lon !== null) pos = [lat, lon];
    } else if (typeof gpsCols === "number") {
      pos = parseLatLon(r[gpsCols]);
    }
    latlon.push(pos);

    rawThrottle.push(throttleI !== null ? toFloat(r[throttleI]) : null);
    rawBrake.push(brakeI !== null ? toFloat(r[brakeI]) : null);
    rawSteering.push(steeringI !== null ? toFloat(r[steeringI]) : null);
    rpmVals.push(rpmI !== null ? toFloat(r[rpmI]) : null);
  }

  if (timestamps.length === 0) {
    return { samples: [], warnings: ["No parseable rows (check Date/Time columns)"] };
  }

  const firstFix = latlon.find((p) => p !== null) ?? null;
  const xy: ([number, number] | null)[] = latlon.map((p) =>
    p && firstFix ? projectLocalXY(p[0], p[1], firstFix[0], firstFix[1]) : null
  );

  let speedKph: (number | null)[] = new Array(xy.length).fill(null);
  let lastI: number | null = null;
  for (let i = 0; i < xy.length; i++) {
    const p = xy[i];
    if (p === null) continue;
    if (lastI !== null) {
      const dt = timestamps[i] - timestamps[lastI];
      const prev = xy[lastI] as [number, number];
      if (dt > 0) {
        const dist = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        speedKph[i] = (dist / dt) * 3.6;
      }
    }
    lastI = i;
  }
  speedKph = smooth(speedKph, SPEED_SMOOTH_WINDOW);

  const laps: (number | null)[] = new Array(xy.length).fill(null);
  if (firstFix) {
    let lap = 0;
    let away = false;
    let lastLapT = timestamps[0];
    for (let i = 0; i < xy.length; i++) {
      const p = xy[i];
      if (p === null) {
        laps[i] = lap;
        continue;
      }
      const distToStart = Math.hypot(p[0], p[1]);
      if (!away && distToStart > LAP_FAR_M) {
        away = true;
      } else if (away && distToStart < LAP_NEAR_M && timestamps[i] - lastLapT > MIN_LAP_TIME_S) {
        lap += 1;
        lastLapT = timestamps[i];
        away = false;
      }
      laps[i] = lap;
    }
  }

  let throttleFinal: (number | null)[];
  let brakeFinal: (number | null)[];
  if (brakeI !== null) {
    throttleFinal = normalizeChannel(rawThrottle).map((v) => (v === null ? null : Math.max(0, v)));
    brakeFinal = normalizeChannel(rawBrake).map((v) => (v === null ? null : Math.max(0, v)));
  } else {
    const norm = normalizeChannel(rawThrottle);
    throttleFinal = norm.map((v) => (v === null ? null : Math.max(0, v)));
    brakeFinal = norm.map((v) => (v === null ? null : Math.max(0, -v)));
  }
  const steeringFinal = normalizeChannel(rawSteering);

  const samples: Sample[] = timestamps.map((t, i) => ({
    t,
    pos_x: xy[i]?.[0] ?? null,
    pos_y: xy[i]?.[1] ?? null,
    speed_kph: speedKph[i],
    rpm: rpmVals[i],
    throttle: throttleFinal[i],
    brake: brakeFinal[i],
    steering: steeringFinal[i],
    lap: laps[i],
  }));

  return { samples, warnings };
}
