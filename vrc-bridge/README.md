# VRC Pro bridge

Records telemetry from a running VRC Pro session by reading the game's
own process memory, then uploads the finished session straight to your
deployed RaceLog webapp. Runs on your Windows PC, next to VRC Pro --
unlike the rest of this repo, this part can't run on Vercel, because it
needs to reach into a process on your machine.

## Why memory-reading

VRC Pro has no official telemetry API (no UDP/"Data Out" option, no SDK).
We also looked at its `.rpl` replay files as a source, but they turned
out to be encrypted (confirmed by entropy/statistical analysis of real
replay files -- not just an obscure format, genuine encryption with no
recoverable key from the file alone), so that path is a dead end without
access to VRC Pro's own code. Reading the running game's memory directly
is the standard fallback every community tool for a sim with no official
API ends up using (same category as Cheat Engine, SimHub's memory
readers, RTSS, etc.) -- done entirely on your own machine, against your
own copy of the game, for your own use.

## Setup

```bash
pip install -r requirements.txt
cp config.example.yaml config.yaml
```

Edit `config.yaml`:
- `webapp_url` -- your deployed RaceLog URL.
- `import_token` -- only needed if you set `IMPORT_TOKEN` as an env var
  on the webapp (see the main README); leave blank otherwise.
- `fields` -- memory offsets, see below. The file ships with placeholder
  zeros that do nothing until you replace them.

## Finding the memory offsets

This is the one-time setup cost, same idea as setting up any Cheat
Engine table:

1. Run VRC Pro, start a practice session.
2. On the same PC, run:
   ```
   python scanner.py "VRC PRO.exe"
   ```
   Follow its prompts: enter the car's current speed as a number, drive
   to change it, enter the new value, repeat 3-5 times until it narrows
   to one or two addresses. Do this once per channel (speed, RPM,
   throttle, brake, steering, position X/Y, lap).
3. The scanner's naive scan only covers the main module's own memory.
   Most game state (anything per-car, per-race) lives on the heap behind
   a pointer, so you'll likely get zero hits from step 2 alone. In that
   case use **Cheat Engine** instead (free, cheatengine.org): its "Scan
   for changed/unknown value" workflow is the same idea but scans the
   whole process, and its **pointer scanner** / "Find out what accesses
   this address" feature gives you a stable base-address + offset chain
   that survives game restarts (a raw address doesn't).
4. Put each channel's chain into `config.yaml` under `fields`, following
   the `base_offset` + `offsets` shape already there.
5. Fields you haven't found yet can stay as placeholders -- they just
   come through as `null`, same as any channel a source can't provide.
   Get speed working first, add the rest incrementally.

This only has to be done once per VRC Pro version -- if an update shifts
the offsets, re-run the scan for whichever channels stop updating.

## Recording a session

```bash
python bridge.py --name "Friday practice"
```

Recording starts immediately. Drive, then press Ctrl+C to stop -- the
whole session is buffered in memory and uploaded as one request at the
end (not streamed live). You'll get back a link to the session on the
webapp.
