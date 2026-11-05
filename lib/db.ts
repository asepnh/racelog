import { Pool } from "pg";
import type { Sample } from "./models";

// A single pooled connection, reused across warm serverless invocations.
// DATABASE_URL points at any standard Postgres instance (Vercel Postgres,
// Neon, Supabase, Railway, etc.) -- nothing here is tied to one provider.
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Provision a Postgres database and set it " +
          "in your environment (see README)."
      );
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=disable")
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool().query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        name TEXT,
        source TEXT NOT NULL DEFAULT 'edgetx_csv'
      );

      CREATE TABLE IF NOT EXISTS samples (
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        t DOUBLE PRECISION NOT NULL,
        pos_x DOUBLE PRECISION,
        pos_y DOUBLE PRECISION,
        speed_kph DOUBLE PRECISION,
        rpm DOUBLE PRECISION,
        throttle DOUBLE PRECISION,
        brake DOUBLE PRECISION,
        steering DOUBLE PRECISION,
        lap INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_samples_session_t ON samples(session_id, t);
    `).then(() => undefined);
  }
  return schemaReady;
}

export async function createSession(
  samples: Sample[],
  name: string | null,
  source = "edgetx_csv"
): Promise<number> {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>(
      "INSERT INTO sessions (name, source) VALUES ($1, $2) RETURNING id",
      [name, source]
    );
    const sessionId = rows[0].id;

    // Batch insert via unnest() -- far fewer round trips than one INSERT
    // per sample, which matters once a session has thousands of rows.
    const cols = [
      "t", "pos_x", "pos_y", "speed_kph", "rpm", "throttle", "brake", "steering", "lap",
    ] as const;
    const arrays: Record<(typeof cols)[number], unknown[]> = {
      t: [], pos_x: [], pos_y: [], speed_kph: [], rpm: [], throttle: [], brake: [], steering: [], lap: [],
    };
    for (const s of samples) {
      for (const c of cols) arrays[c].push(s[c]);
    }
    await client.query(
      `INSERT INTO samples (session_id, t, pos_x, pos_y, speed_kph, rpm, throttle, brake, steering, lap)
       SELECT $1, * FROM unnest(
         $2::float8[], $3::float8[], $4::float8[], $5::float8[],
         $6::float8[], $7::float8[], $8::float8[], $9::float8[], $10::int[]
       )`,
      [
        sessionId,
        arrays.t, arrays.pos_x, arrays.pos_y, arrays.speed_kph,
        arrays.rpm, arrays.throttle, arrays.brake, arrays.steering, arrays.lap,
      ]
    );
    await client.query("COMMIT");
    return sessionId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listSessions() {
  await ensureSchema();
  const { rows } = await getPool().query(`
    SELECT s.id, s.created_at, s.name,
           COUNT(sm.t)::int AS sample_count,
           MAX(sm.lap) AS max_lap
    FROM sessions s
    LEFT JOIN samples sm ON sm.session_id = s.id
    GROUP BY s.id
    ORDER BY s.created_at DESC
  `);
  return rows;
}

export async function getSession(id: number) {
  await ensureSchema();
  const { rows } = await getPool().query(
    "SELECT * FROM sessions WHERE id = $1",
    [id]
  );
  return rows[0] ?? null;
}

export async function getSamples(id: number): Promise<Sample[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    `SELECT t, pos_x, pos_y, speed_kph, rpm, throttle, brake, steering, lap
     FROM samples WHERE session_id = $1 ORDER BY t`,
    [id]
  );
  return rows;
}

export async function deleteSession(id: number) {
  await ensureSchema();
  await getPool().query("DELETE FROM sessions WHERE id = $1", [id]);
}
