import { NextRequest, NextResponse } from "next/server";
import { inspectHeaders } from "@/lib/edgetxCsv";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  const text = await file.text();
  const headers = inspectHeaders(text);
  return NextResponse.json({ headers });
}
