import { connection } from "next/server";
import { listSessions, getSamples } from "@/lib/db";
import { generateDemoSamples } from "@/lib/demoData";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  await connection();
  const sessions = await listSessions();

  if (sessions.length === 0) {
    return (
      <Dashboard
        sessions={[]}
        initialSessionId={null}
        initialSamples={generateDemoSamples()}
        demo
      />
    );
  }

  const latest = sessions[0];
  const samples = await getSamples(latest.id);

  return (
    <Dashboard
      sessions={sessions}
      initialSessionId={latest.id}
      initialSamples={samples}
      demo={false}
    />
  );
}
