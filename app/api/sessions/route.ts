import { NextResponse } from "next/server";
import { connection } from "next/server";
import { listSessions } from "@/lib/db";

export async function GET() {
  await connection();
  const sessions = await listSessions();
  return NextResponse.json(sessions);
}
