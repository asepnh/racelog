# RaceLog

A web app for reviewing RC car GPS telemetry logged by a RadioMaster MT12
(EdgeTX) + a GPS telemetry sensor (e.g. RadioMaster ERS-GPS) — upload a log,
get MoTeC/VRS-style charts and a speed-colored track map. Deployable to
Vercel; no local install needed to use it.

## How it works

1. **On the radio:** enable EdgeTX's native **SD Logs** (Model Setup →
   Logs) — no custom Lua script needed. Put the GPS sensor in **position
   mode** (continuous lat/lon); the app derives speed and laps itself from
   the GPS trace, so one mode covers both position and speed. Set the
   logging **Interval** to 0.1s (10Hz, the fastest EdgeTX supports).
2. **Get the file off the radio:** pull the microSD card, or connect via
   USB-C (to a PC, or an OTG-capable Android phone) and copy the `.csv`
   from `/LOGS/`.
3. **Upload it here:** the Import page reads the file's actual column
   headers and lets you map which channel is throttle/brake/steering
   (naming varies by radio setup), then imports it.
4. **Review:** time-synced Speed/RPM/Throttle-Brake-Steering charts plus a
   speed-colored track map, with a per-lap filter.

This only handles the EdgeTX CSV log path — there's no VRC Pro / sim
integration here (that's a separate, local-only project, since it needs
to read a running game's process memory or local save files, which only
makes sense running on the same PC as the game).

## Stack

- **Next.js (App Router)** — pages + API routes, deployed on Vercel.
- **Postgres** — session/sample storage. Any standard Postgres works
  (Vercel Postgres, Neon, Supabase, a local instance for dev); nothing
  here is tied to one provider. Vercel's serverless functions have no
  persistent local disk, which is why this isn't SQLite.
- **Chart.js**, bundled via npm (not a CDN `<script>` tag) so it's part
  of the normal build/deploy and doesn't depend on an external host being
  reachable at runtime.
- **`lib/edgetxCsv.ts`** — the actual parser: reads the EdgeTX CSV,
  projects GPS lat/lon to local track-meters, derives speed from
  consecutive fixes (smoothed), detects laps by watching the car leave
  and return to its start point, and normalizes whatever raw channel
  range EdgeTX logged (e.g. -1024..1024) down to -1..1 / 0..1.

## Local development

```bash
npm install
cp .env.example .env.local   # point DATABASE_URL at a Postgres instance
npm run dev
```

Tables are created automatically on first query (see `lib/db.ts`,
`ensureSchema()`) — no separate migration step for this v1.

## Deploying to Vercel

1. Push this repo to GitHub, import it in Vercel.
2. Provision a Postgres database (Vercel's own Postgres integration, or
   Neon/Supabase/etc.) and set `DATABASE_URL` in the project's
   Environment Variables.
3. Deploy. Framework preset: **Next.js** (auto-detected).

## Roadmap

- **Accounts + subscription.** Currently every session is global/anonymous
  — there's no auth yet. Sessions already live in their own Postgres rows
  (`sessions` table), so adding a `user_id` column + an auth provider
  (e.g. NextAuth) and scoping the existing queries is the natural next
  step when that's ready to build, rather than a rearchitecture.
- **Lap comparison view** — overlay two laps' traces instead of one at a
  time.
- Real-file validation of the EdgeTX CSV importer — it's built from the
  documented log format plus a synthetic test file, not yet checked
  against an actual MT12 log.
