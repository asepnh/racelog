import { connection } from "next/server";
import { getSamples, getSession } from "@/lib/db";
import { sessionToMotecLd } from "@/lib/motecExport";

export async function GET(
  _req: Request,
  ctx: RouteContext<"/api/sessions/[id]/export/motec">
) {
  await connection();
  const { id } = await ctx.params;
  const sessionId = Number(id);

  const session = await getSession(sessionId);
  if (!session) {
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const samples = await getSamples(sessionId);
  let ldFile: Buffer;
  try {
    ldFile = sessionToMotecLd(samples, { name: session.name });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 422,
      headers: { "Content-Type": "application/json" },
    });
  }

  const filename = `${session.name || `session-${sessionId}`}.ld`.replace(/[^\w.-]+/g, "_");
  return new Response(new Uint8Array(ldFile), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
