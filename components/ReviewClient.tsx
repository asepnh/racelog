"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Sample } from "@/lib/models";
import LineChart from "@/components/LineChart";
import TrackMap from "@/components/TrackMap";

export default function ReviewClient({ sessionId }: { sessionId: number }) {
  const router = useRouter();
  const [samples, setSamples] = useState<Sample[]>([]);
  const [lap, setLap] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sessions/${sessionId}/samples`)
      .then((r) => r.json())
      .then((data: Sample[]) => {
        if (cancelled) return;
        setSamples(data);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const laps = Array.from(
    new Set(samples.map((s) => s.lap).filter((l): l is number => l != null))
  ).sort((a, b) => a - b);

  const filtered =
    lap === "all" ? samples : samples.filter((s) => s.lap === Number(lap));

  async function onDelete() {
    await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
    router.push("/sessions");
  }

  if (loading) return <div className="empty-state">Loading...</div>;

  return (
    <div>
      <div className="controls">
        <select value={lap} onChange={(e) => setLap(e.target.value)}>
          <option value="all">All laps</option>
          {laps.map((l) => (
            <option key={l} value={l}>Lap {l}</option>
          ))}
        </select>
        <a href={`/api/sessions/${sessionId}/export/motec`}>
          <button type="button">Export to MoTeC (.ld)</button>
        </a>
        <button onClick={onDelete}>Delete Session</button>
      </div>

      <div className="review-grid">
        <div className="chart-box">
          <LineChart
            samples={filtered}
            series={[{ key: "speed_kph", label: "Speed (km/h)", color: "#3fb6ff" }]}
          />
        </div>
        <div className="chart-box">
          <LineChart
            samples={filtered}
            series={[{ key: "rpm", label: "RPM", color: "#ff9f40" }]}
          />
        </div>
        <div className="chart-box">
          <LineChart
            samples={filtered}
            series={[
              { key: "throttle", label: "Throttle", color: "#3fd17a" },
              { key: "brake", label: "Brake", color: "#ff4f4f" },
              { key: "steering", label: "Steering", color: "#ffcc3f" },
            ]}
          />
        </div>
        <div className="track-map-box">
          <TrackMap samples={filtered} />
        </div>
      </div>
    </div>
  );
}
