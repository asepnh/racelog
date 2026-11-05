// Synthetic lap data so the dashboard never looks broken/empty before a
// user has imported a real log. Same circular-track formulas used by the
// local VRC Pro tool's mock capture source, ported here for a consistent
// "this is what it looks like" preview.
import type { Sample } from "./models";

const TRACK_RADIUS_M = 15;
const LAP_TIME_S = 12;
const HZ = 20;
const LAPS = 3;

export function generateDemoSamples(): Sample[] {
  const samples: Sample[] = [];
  const dt = 1 / HZ;
  const totalT = LAPS * LAP_TIME_S;

  for (let t = 0; t < totalT; t += dt) {
    const lap = Math.floor(t / LAP_TIME_S);
    const lapFrac = (t % LAP_TIME_S) / LAP_TIME_S;
    const angle = lapFrac * 2 * Math.PI;
    const x = TRACK_RADIUS_M * Math.cos(angle);
    const y = TRACK_RADIUS_M * Math.sin(angle);

    const throttle = Math.min(1, Math.max(0, Math.sin(lapFrac * 2 * Math.PI) * 0.5 + 0.6));
    const brake = Math.min(1, Math.max(0, -Math.sin(lapFrac * 2 * Math.PI) * 0.5));
    const speed = 10 + 40 * throttle - 30 * brake;
    const rpm = 1500 + speed * 180;
    const steering = Math.sin(angle * 2) * 0.6;

    samples.push({
      t,
      pos_x: x,
      pos_y: y,
      speed_kph: speed,
      rpm,
      throttle,
      brake,
      steering,
      lap,
    });
  }
  return samples;
}
