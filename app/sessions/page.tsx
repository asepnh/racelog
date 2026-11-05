import Link from "next/link";
import { connection } from "next/server";
import { listSessions } from "@/lib/db";

export default async function SessionsPage() {
  await connection();
  const sessions = await listSessions();

  if (sessions.length === 0) {
    return (
      <div className="empty-state">
        No sessions yet. Go to <Link href="/import">Import</Link> to upload an EdgeTX log.
      </div>
    );
  }

  return (
    <div className="session-list">
      {sessions.map((s) => (
        <Link key={s.id} href={`/sessions/${s.id}`} className="session-row">
          <span>#{s.id} {s.name || "(untitled)"}</span>
          <span className="meta">
            {s.sample_count} samples
            {s.max_lap != null ? ` · ${s.max_lap} laps` : ""}
            {" · "}
            {new Date(s.created_at).toLocaleString()}
          </span>
        </Link>
      ))}
    </div>
  );
}
