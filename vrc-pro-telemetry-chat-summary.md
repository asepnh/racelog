# VRC Pro Telemetry — Project Chat Summary

Summary of the conversation that led to the `asepnh/VRC-Pro-Telemetry-` repo
(branch `ccr-5f1aaf24-684akd`). Captures decisions, research findings, and
what was built, not a verbatim transcript.

## The ask

Build software to capture and review RC car telemetry (position, speed,
throttle/brake, steering, RPM) like MoTeC i2 or iRacing's VRS — both for
VRC Pro (a PC RC-racing sim) and, it turned out, for a real RC car.

## VRC Pro: no public telemetry API

VRC Pro has no documented data-out/UDP/SDK option. GitHub search turned up
nothing relevant either — only two unrelated repos (USB adapters that let
a real transmitter act as a PC joystick for VRC Pro's *input* side, nothing
about reading telemetry back out).

The one real lead: an official VRC Pro news post announced a partnership
with **RC Paddock** (rcpaddock.com), a third-party app that does telemetry
analysis for VRC Pro by **parsing VRC Pro's own replay files** — not
memory reading, not a live API. Key facts from that announcement:

- Replay files save to `Documents\Virtual RC Pro\Replay\*.rpl`.
- Must enable **Replay: ON** in VRC Pro's Other Game Options to record one.
- Event/multiplayer sessions auto-save a replay; practice sessions (event
  mode) need the replay saved manually before exiting.
- The `.rpl` format is undocumented/proprietary — RC Paddock built their
  parser by experimentation, no public spec exists.

**Status:** a `.rpl` parser was *not* built — reverse-engineering it needs
an actual sample file, which wasn't available in this session (no network
access to VRC Pro's own sites, and no file from the user yet). The project
ships with a Windows process-memory-reading source (`sources/memory.py`)
plus a Cheat-Engine-style offset scanner (`scanner.py`) as a working
fallback in the meantime, documented in the repo's README.

## Pivot: real RC car via EdgeTX + GPS sensor

The user has a RadioMaster MT12 (EdgeTX) and asked about using a
RadioMaster ERS-GPS sensor on the car. This turned out to be the more
tractable path:

- EdgeTX has a **native SD-card logger** (Model Setup → Logs / the "SD
  Logs" special function) — no Lua scripting needed. Per EdgeTX's own
  manual, each log row combines **both** the radio's channel/stick output
  values (throttle, steering) **and** telemetry sensor values (GPS
  position, etc.) in one CSV.
- Log write rate is configurable via the **Interval** setting, **0.1s to
  25.5s** (so 10Hz is the fastest EdgeTX will write).
- The ERS-GPS has two modes (hold its button 1s to cycle): **Mode 1**
  (red) = GPS position/altitude; **Mode 2** (blue) = **10Hz** ground
  speed, explicitly recommended by RadioMaster for cars/boats/planes.
  Mode 1's own GPS fix rate is undocumented — could not confirm it
  anywhere searched. Recommendation: use Mode 1 continuously; the
  software derives speed itself from consecutive GPS fixes, so one mode
  covers both position and (derived) speed, avoiding the mode-switch
  tradeoff entirely.
- A real customer review on RadioMaster's own product page (MT12 user)
  said they could get GPS data out as CSV but *"none of them [programs]
  was able to show the real track that was logged before"* — validating
  that this is a real, currently-unmet need.
- RPM needs a separate RPM sensor daisy-chained behind the GPS sensor's
  pass-through port; optional, left blank otherwise.
- No Bluetooth path exists for pulling the log file off the radio — per
  EdgeTX's own manual, Bluetooth is limited to Trainer Mode and live
  Telemetry Streaming, explicitly *not* file transfer. Use the microSD
  card directly, or USB-C (PC, or Android phone via USB-C OTG — the
  radio's USB "Storage" mode is standard USB mass storage, so an
  OTG-capable Android phone should mount it like a flash drive; iPhone
  15+ can too via Files app).

## What was built (`asepnh/VRC-Pro-Telemetry-`, branch `ccr-5f1aaf24-684akd`)

A local Python app (FastAPI backend + browser UI), works fully offline:

- **`vrc_telemetry/models.py`** — shared `Sample` schema (t, pos_x/y/z,
  speed_kph, rpm, throttle, brake, steering, gear, lap, lap_distance).
- **`vrc_telemetry/sources/`** — live capture, pick one in the UI:
  - `mock.py` — synthetic data for development/testing, no game needed.
  - `udp.py` — in case a network telemetry-out option ever surfaces.
  - `memory.py` + `scanner.py` — Windows process-memory reading fallback
    for VRC Pro, with an interactive offset-finding CLI tool.
- **`vrc_telemetry/importers/edgetx_csv.py`** — the real-RC path: parses
  an EdgeTX SD-card log, projects GPS lat/lon to local track-meters,
  derives speed from consecutive fixes (with smoothing), detects laps by
  watching the car leave-then-return to its start point, and normalizes
  whatever raw channel range EdgeTX logged (-1024..1024 etc.) to -1..1.
  Channel-to-field mapping (which column is throttle/steering/etc.) is
  chosen interactively in the UI since naming varies by radio setup.
- **`vrc_telemetry/storage.py`** — SQLite session/sample storage.
- **`vrc_telemetry/server.py`** — FastAPI: recording control, session
  CRUD, file-import endpoints, live WebSocket stream.
- **`web/`** — browser UI, three tabs:
  - **Live** — gauges (speed/RPM/gear/lap), throttle/brake/steering bars,
    live position trail, start/stop recording.
  - **Import** — upload an EdgeTX CSV, map its actual columns to
    throttle/brake/steering/RPM, import.
  - **Review** — MoTeC-style: time-synced Speed/RPM/Inputs charts plus a
    speed-colored track map, session picker, lap filter.
  - Chart.js is vendored locally (`web/vendor/`), not loaded from a CDN,
    so the app works without internet access.

Verified end-to-end (mock source → record → review; synthetic EdgeTX CSV
→ import with channel mapping → review) including real browser
screenshots, which caught and fixed three UI bugs (CDN dependency, a CSS
specificity bug hiding the import form, and Chart.js measuring the wrong
parent element and pushing the track map off-screen).

## Open items

- No `.rpl` (VRC Pro replay) parser yet — needs a real sample file.
- `memory.py` offsets are placeholders — needs the real game's memory
  scanned on a Windows PC with VRC Pro installed.
- EdgeTX CSV importer is built from documented format + a synthetic test
  file, not yet validated against a real MT12 log.
