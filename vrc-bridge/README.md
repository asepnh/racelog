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

1. Run VRC Pro, start a practice session. Check Task Manager's
   **Details** tab for the game's actual process name -- it isn't
   necessarily `VRC PRO.exe` (one real install turned out to be
   `Game_s.exe`).
2. **Run your terminal as Administrator.** `pymem` needs elevated
   permissions to open another process's memory; without it you'll get
   `pymem.exception.CouldNotOpenProcess` immediately.
3. Run:
   ```
   python scanner.py "<the real process name>.exe"
   ```
   Press Enter to snapshot, then narrow by **direction of change**
   (`i`ncreased / `d`ecreased / `c`hanged / `s`ame) rather than typing an
   exact number -- this matters: VRC Pro's on-screen speed is a rounded
   whole number, but the real float in memory has decimals, so searching
   for the literal displayed value (e.g. `10`) almost never matches the
   actual stored value (e.g. `10.3`) and just gets 0 hits every round.
   Direction-of-change sidesteps that entirely. Accelerate, then tell it
   `i`; brake, then tell it `d`; repeat 3-6 rounds until it narrows to one
   address. Do this once per continuous channel (speed, RPM, throttle,
   brake, steering, position X/Y). An exact-value search (type the number
   instead of i/d/c/s) still works fine for something like a lap counter,
   where you know the precise integer.
4. When it converges to one address, that value lives directly at a
   fixed offset from the module's base -- in config.yaml terms, that's
   `base_offset: 0x<the printed offset>, offsets: []` (see the comments
   in `config.example.yaml` for what an empty vs. non-empty `offsets`
   list means). **Verify it before trusting it**: change the value
   in-game once more and confirm the same address still matches --
   convergence to one candidate from a small scan is a good sign but not
   a guarantee.
5. Not every channel will be this easy -- some game state (especially
   anything allocated per-car or per-race) lives on the heap behind a
   pointer, which this scanner's module-only range won't find at all
   (you'll get zero hits even after several narrowing rounds). In that
   case use **Cheat Engine** instead (free, cheatengine.org): its "Scan
   for changed/unknown value" workflow is the same idea but scans the
   whole process, and its **pointer scanner** / "Find out what accesses
   this address" feature gives you a stable base-address + offset chain
   that survives game restarts (a raw address doesn't) -- that's the
   non-empty `offsets: [a, b, …]` case in config.yaml.
6. Fields you haven't found yet can stay as placeholders -- they just
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
