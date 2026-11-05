# RaceLog

A web app for reviewing RC car telemetry — real cars via a RadioMaster
MT12 (EdgeTX) + a GPS sensor (e.g. RadioMaster ERS-GPS), or VRC Pro (the
sim) via a local bridge that reads the game's own memory. Either way you
get MoTeC/VRS-style charts and a speed-colored track map. The webapp
itself is deployable to Vercel; only the import step that needs to touch
your own PC/radio runs locally.

## How it works

**Real car (EdgeTX + GPS sensor):**
1. Enable EdgeTX's native **SD Logs** (Model Setup → Logs) — no custom
   Lua script needed. Put the GPS sensor in **position mode** (continuous
   lat/lon); the app derives speed and laps itself from the GPS trace, so
   one mode covers both position and speed. Set the logging **Interval**
   to 0.1s (10Hz, the fastest EdgeTX supports).
2. Pull the microSD card, or connect via USB-C (to a PC, or an
   OTG-capable Android phone) and copy the `.csv` from `/LOGS/`.
3. Upload it on the **Import** page — it reads the file's actual column
   headers and lets you map which channel is throttle/brake/steering
   (naming varies by radio setup), then imports it.

**VRC Pro (the sim):** VRC Pro has no telemetry API, and its `.rpl`
replay files turned out to be encrypted (confirmed by entropy analysis of
real files, not just an obscure format), so there's no file to parse.
`vrc-bridge/` is a small Python tool you run on the same Windows PC as
the game: it reads the game's live process memory while you drive, then
uploads the finished session to this webapp over HTTPS. See
[`vrc-bridge/README.md`](vrc-bridge/README.md) for setup (it needs
one-time memory-offset discovery, same idea as setting up a Cheat Engine
table).

**Either way, review is the same:** time-synced Speed/RPM/
Throttle-Brake-Steering charts plus a speed-colored track map, with a
per-lap filter, and an **Export to MoTeC (.ld)** button.

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
- **`lib/motecLd.ts`** / **`lib/motecExport.ts`** — exports a session as a
  native MoTeC `.ld` file (button on the Review/Dashboard view). MoTeC's
  `.ld` format is undocumented; the byte layout here is ported from the
  open-source [ldparser](https://github.com/gotzl/ldparser) project,
  whose author validated its writer against real MoTeC i2 Pro and ACC
  output. `motecExport.ts` handles the gap between our data and what
  `.ld` needs: samples can have gaps/nulls and aren't on an exact
  fixed-rate grid, but every `.ld` channel is a flat array at one
  declared frequency with no missing values, so it estimates a sample
  rate, resamples each channel onto a uniform grid (linear
  interpolation), and skips any channel with no real data (e.g. RPM when
  there's no RPM sensor) rather than writing a misleading all-zero one.
  Verified structurally (header/event/channel offsets, file size, and
  channel values all decode correctly when read back byte-by-byte) but
  not yet opened in real MoTeC i2 software — if a generated file doesn't
  import cleanly, the channel metadata layout in `motecLd.ts` is the
  first place to check.
- **`POST /api/import/raw`** — accepts a session as plain JSON
  (`{name, source, samples}`, already in our `Sample` shape) rather than
  parsing a file. This is what `vrc-bridge/` posts to after recording
  from VRC Pro's memory; the EdgeTX importer could in principle use it
  too, but that one already does its own parsing server-side from the
  raw CSV upload. Optionally protected by `IMPORT_TOKEN` — see
  `.env.example`.

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
