import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getSamples } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]/samples">
) {
  await connection();
  const { id } = await ctx.params;
  const samples = await getSamples(Number(id));
  return NextResponse.json(samples);
}
