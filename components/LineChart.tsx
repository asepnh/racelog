"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from "chart.js";
import type { Sample } from "@/lib/models";

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

interface Series {
  key: keyof Sample;
  label: string;
  color: string;
}

export default function LineChart({ samples, series }: { samples: Sample[]; series: Series[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, {
      type: "line",
      data: {
        labels: samples.map((s) => s.t.toFixed(1)),
        datasets: series.map((s) => ({
          label: s.label,
          data: samples.map((sample) => sample[s.key] as number | null),
          borderColor: s.color,
          pointRadius: 0,
          borderWidth: 1.5,
          tension: 0.1,
        })),
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: { ticks: { maxTicksLimit: 10, color: "#8a93a6" } },
          y: { ticks: { color: "#8a93a6" } },
        },
        plugins: { legend: { labels: { color: "#e6e9ef" } } },
      },
    });
    return () => chartRef.current?.destroy();
  }, [samples, series]);

  return <canvas ref={canvasRef} />;
}
