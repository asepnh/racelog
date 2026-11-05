"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Sample, SessionSummary } from "@/lib/models";
import LineChart from "@/components/LineChart";
import TrackMap from "@/components/TrackMap";

export default function Dashboard({
  sessions,
  initialSessionId,
  initialSamples,
  demo,
}: {
  sessions: SessionSummary[];
  initialSessionId: number | null;
  initialSamples: Sample[];
  demo: boolean;
}) {
  const [selected, setSelected] = useState<number | null>(initialSessionId);
  const [samples, setSamples] = useState<Sample[]>(initialSamples);
  const [loadedFor, setLoadedFor] = useState<number | null>(initialSessionId);
  const [lap, setLap] = useState<string>("all");
  const loading = selected !== null && selected !== loadedFor;

  useEffect(() => {
    if (selected === null || selected === loadedFor) return;
    let cancelled = false;
    fetch(`/api/sessions/${selected}/samples`)
      .then((r) => r.json())
      .then((data: Sample[]) => {
        if (cancelled) return;
        setSamples(data);
        setLoadedFor(selected);
        setLap("all");
      });
    return () => {
      cancelled = true;
    };
  }, [selected, loadedFor]);

  const laps = Array.from(
    new Set(samples.map((s) => s.lap).filter((l): l is number => l != null))
  ).sort((a, b) => a - b);

  const filtered = lap === "all" ? samples : samples.filter((s) => s.lap === Number(lap));

  return (
    <div>
      {demo && (
        <div className="hint" style={{ marginBottom: 16 }}>
          Showing sample data so you can see how the dashboard looks.{" "}
          <Link href="/import">Import your own EdgeTX log</Link> to replace it.
        </div>
      )}

      <div className="controls">
        {sessions.length > 0 && (
          <select
            value={selected ?? ""}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.id} {s.name || "(untitled)"}
              </option>
            ))}
          </select>
        )}
        <select value={lap} onChange={(e) => setLap(e.target.value)}>
          <option value="all">All laps</option>
          {laps.map((l) => (
            <option key={l} value={l}>Lap {l}</option>
          ))}
        </select>
        {!demo && selected !== null && (
          <a href={`/api/sessions/${selected}/export/motec`}>
            <button type="button">Export to MoTeC (.ld)</button>
          </a>
        )}
        {loading && <span className="status">Loading...</span>}
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
