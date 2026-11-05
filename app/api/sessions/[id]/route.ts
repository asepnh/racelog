import { NextResponse } from "next/server";
import { connection } from "next/server";
import { deleteSession, getSession } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]">
) {
  await connection();
  const { id } = await ctx.params;
  const session = await getSession(Number(id));
  if (!session) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(session);
}

export async function DELETE(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]">
) {
  const { id } = await ctx.params;
  await deleteSession(Number(id));
  return NextResponse.json({ deleted: Number(id) });
}
