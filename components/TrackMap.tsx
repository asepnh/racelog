"use client";

import { useEffect, useRef } from "react";
import type { Sample } from "@/lib/models";

export default function TrackMap({ samples }: { samples: Sample[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const pts = samples.filter(
      (s): s is Sample & { pos_x: number; pos_y: number } => s.pos_x != null && s.pos_y != null
    );
    if (pts.length === 0) return;

    const xs = pts.map((p) => p.pos_x);
    const ys = pts.map((p) => p.pos_y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const pad = 20;
    const scale = Math.min(
      (canvas.width - 2 * pad) / Math.max(1, maxX - minX || 1),
      (canvas.height - 2 * pad) / Math.max(1, maxY - minY || 1)
    );
    const tx = (px: number) => pad + (px - minX) * scale;
    const ty = (py: number) => canvas.height - pad - (py - minY) * scale;

    const speeds = pts.map((p) => p.speed_kph ?? 0);
    const maxSpeed = Math.max(1, ...speeds);

    for (let i = 1; i < pts.length; i++) {
      const s = pts[i].speed_kph ?? 0;
      const t = s / maxSpeed;
      ctx.strokeStyle = `hsl(${t * 120}, 80%, 55%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tx(pts[i - 1].pos_x), ty(pts[i - 1].pos_y));
      ctx.lineTo(tx(pts[i].pos_x), ty(pts[i].pos_y));
      ctx.stroke();
    }
  }, [samples]);

  return <canvas ref={canvasRef} width={420} height={420} />;
}
