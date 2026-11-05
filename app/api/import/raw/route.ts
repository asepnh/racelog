import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/db";
import type { Sample } from "@/lib/models";

const SAMPLE_KEYS: (keyof Sample)[] = [
  "t", "pos_x", "pos_y", "speed_kph", "rpm", "throttle", "brake", "steering", "lap",
];

function isValidSample(s: unknown): s is Sample {
  if (typeof s !== "object" || s === null) return false;
  const obj = s as Record<string, unknown>;
  if (typeof obj.t !== "number") return false;
  return SAMPLE_KEYS.every((k) => {
    if (k === "t") return true;
    const v = obj[k];
    return v === null || v === undefined || typeof v === "number";
  });
}

/** Accepts a finished session as plain JSON, e.g. from the local VRC Pro
 * memory-reading bridge (vrc-bridge/) -- there's no file to parse here,
 * the caller already has data in our Sample shape. Protected by a shared
 * secret (IMPORT_TOKEN) since, unlike the browser-driven EdgeTX import,
 * this is meant to be hit by an unattended script. */
export async function POST(req: NextRequest) {
  const token = process.env.IMPORT_TOKEN;
  if (token) {
    const given = req.headers.get("x-import-token");
    if (given !== token) {
      return NextResponse.json({ error: "invalid or missing X-Import-Token" }, { status: 401 });
    }
  }

  let body: { name?: string | null; source?: string; samples?: unknown[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.samples) || body.samples.length === 0) {
    return NextResponse.json({ error: "samples must be a non-empty array" }, { status: 400 });
  }
  if (!body.samples.every(isValidSample)) {
    return NextResponse.json(
      { error: `each sample needs a numeric t, and ${SAMPLE_KEYS.slice(1).join("/")} must be numbers or null` },
      { status: 400 }
    );
  }

  const sessionId = await createSession(
    body.samples as Sample[],
    body.name ?? null,
    body.source || "raw"
  );
  return NextResponse.json({ session_id: sessionId, sample_count: body.samples.length });
}
