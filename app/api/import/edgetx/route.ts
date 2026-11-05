import { NextRequest, NextResponse } from "next/server";
import { parseEdgeTxCsv } from "@/lib/edgetxCsv";
import { createSession } from "@/lib/db";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const name = (form.get("name") as string | null) || null;
  const mappingRaw = (form.get("mapping") as string | null) ?? "{}";

  let mapping;
  try {
    mapping = JSON.parse(mappingRaw);
  } catch {
    return NextResponse.json({ error: "mapping must be JSON" }, { status: 400 });
  }
  if (!mapping.throttle_channel || !mapping.steering_channel) {
    return NextResponse.json(
      { error: "throttle_channel and steering_channel are required" },
      { status: 400 }
    );
  }

  const text = await file.text();
  const result = parseEdgeTxCsv(text, mapping);
  if (result.samples.length === 0) {
    return NextResponse.json(
      { error: "no samples parsed", warnings: result.warnings },
      { status: 422 }
    );
  }

  const sessionId = await createSession(result.samples, name);
  return NextResponse.json({
    session_id: sessionId,
    sample_count: result.samples.length,
    warnings: result.warnings,
  });
}
