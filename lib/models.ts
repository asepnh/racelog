// Shared telemetry sample shape. Every field but `t` is optional because a
// given log/sensor combination won't always provide all of them.
export interface Sample {
  t: number;
  pos_x: number | null;
  pos_y: number | null;
  speed_kph: number | null;
  rpm: number | null;
  throttle: number | null;
  brake: number | null;
  steering: number | null;
  lap: number | null;
}

export interface SessionSummary {
  id: number;
  created_at: string;
  name: string | null;
  sample_count: number;
  max_lap: number | null;
}
