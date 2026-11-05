"""Interactive CLI for finding VRC Pro's telemetry memory addresses.

A minimal, script-friendly stand-in for Cheat Engine's scanning workflow.
Run it on the same Windows PC as VRC Pro (as Administrator -- pymem needs
elevated permissions to open another process), with a race or practice
session active:

    python scanner.py "VRC PRO.exe"

Two ways to narrow down candidates, and you'll want both:

  - **Direction of change** (recommended default -- press Enter to
    snapshot, then after changing the value in-game, tell it whether the
    value went up/down/changed/stayed the same: i/d/c/s). This is the
    only reliable way to find a continuously-varying value like speed:
    VRC Pro's on-screen speed is a rounded whole number, but the actual
    float in memory has decimals, so it almost never exactly equals a
    number you can type -- searching for literal "10" when the real
    value is 10.3 just gets zero hits, every time. Direction-of-change
    sidesteps that entirely since it never needs to know the exact value.

  - **Exact known value** (type a number instead of i/d/c/s) -- works
    fine for something you can read an exact value for, like a lap
    counter, but DON'T use this for speed/RPM/position -- see above.

Repeat narrowing 3-6 rounds until it's down to one address (or a
small handful you can test one at a time), then:
  1. Note the printed offset-from-module-base.
  2. **Verify it**: change the value again and confirm the same address
     still matches -- convergence to one candidate is a good sign, not a
     guarantee.
  3. Put it in config.yaml as `base_offset: 0x<that offset>, offsets: []`
     (see config.example.yaml's comments for what that means).

This only finds *flat* addresses within the main module's own memory
range. Most per-car/per-race game state lives on the heap behind a
pointer and won't show up here at all (you'll converge to 0 candidates
no matter what you try). In that case use **Cheat Engine** instead (free,
cheatengine.org) -- its scanner covers the whole process, and its
**pointer scanner** / "Find out what accesses this address" feature gives
you a stable offset *chain* that survives game restarts, which this tool
doesn't attempt.
"""
from __future__ import annotations

import argparse
import struct
import sys

import pymem
import pymem.process

TYPE_SIZES = {"float": 4, "double": 8, "int32": 4}
TYPE_STRUCT = {"float": "<f", "double": "<d", "int32": "<i"}

DIRECTION_HELP = (
    "  i = increased   d = decreased   c = changed   s = same/unchanged\n"
    "  or type an exact number if you know it (e.g. a lap counter)\n"
    "  r = restart from scratch   q = quit"
)


def _scan_memory(pm: pymem.Pymem, value_type: str) -> dict[int, bytes]:
    """Naive full-range scan of the main module's committed memory."""
    size = TYPE_SIZES[value_type]
    results: dict[int, bytes] = {}
    base = pm.base_address
    module = pymem.process.module_from_name(pm.process_handle, pm.process_base.name)
    region_size = module.SizeOfImage if module else 64 * 1024 * 1024
    chunk = 1 << 16
    addr = base
    end = base + region_size
    while addr < end:
        try:
            data = pm.read_bytes(addr, min(chunk, end - addr))
        except Exception:
            addr += chunk
            continue
        for i in range(0, len(data) - size + 1, size):
            results[addr + i] = data[i : i + size]
        addr += chunk
    return results


def _decode_all(raw: dict[int, bytes], fmt: str) -> dict[int, float]:
    return {addr: struct.unpack(fmt, b)[0] for addr, b in raw.items()}


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("process_name", help='e.g. "VRC PRO.exe"')
    parser.add_argument(
        "--type", choices=list(TYPE_SIZES), default="float",
        help="Value type to scan for (default: float)",
    )
    args = parser.parse_args()

    pm = pymem.Pymem(args.process_name)
    module = pymem.process.module_from_name(pm.process_handle, args.process_name)
    print(f"Attached to {args.process_name}. Module base: 0x{module.lpBaseOfDll:X}")
    print("WARNING: this is a naive scanner over one module's memory range only.")
    print("For values living on the heap (most game state), it will find nothing --")
    print("use Cheat Engine's full-process scan + pointer scan instead.\n")

    fmt = TYPE_STRUCT[args.type]
    size = TYPE_SIZES[args.type]

    candidates: dict[int, float] | None = None
    while True:
        if candidates is None:
            input(
                "\nMake sure the value is currently steady (e.g. car stationary for "
                "speed), then press Enter to snapshot all current values..."
            )
            candidates = _decode_all(_scan_memory(pm, args.type), fmt)
            print(f"Captured {len(candidates)} addresses.")
            continue

        print(f"\n{len(candidates)} candidate(s). Change the value in-game, then:")
        print(DIRECTION_HELP)
        raw = input("> ").strip().lower()

        if raw == "q":
            break
        if raw == "r":
            candidates = None
            continue

        exact_target: float | None = None
        if raw not in ("i", "d", "c", "s"):
            try:
                exact_target = float(raw)
            except ValueError:
                print("Not 'i'/'d'/'c'/'s', 'r', 'q', or a number.")
                continue

        new_candidates: dict[int, float] = {}
        for addr, old_val in candidates.items():
            try:
                cur_val = struct.unpack(fmt, pm.read_bytes(addr, size))[0]
            except Exception:
                continue
            if exact_target is not None:
                keep = abs(cur_val - exact_target) < 1e-4
            elif raw == "i":
                keep = cur_val > old_val
            elif raw == "d":
                keep = cur_val < old_val
            elif raw == "c":
                keep = cur_val != old_val
            else:  # "s"
                keep = cur_val == old_val
            if keep:
                new_candidates[addr] = cur_val
        candidates = new_candidates

        print(f"{len(candidates)} candidate(s) remain.")
        if 0 < len(candidates) <= 20:
            for addr, val in candidates.items():
                print(f"  0x{addr:X}  (offset from module base: 0x{addr - module.lpBaseOfDll:X})  = {val}")
        if len(candidates) == 0:
            print("No candidates left -- 'r' to restart with a fresh snapshot.")
        elif len(candidates) == 1:
            print("Found it (probably). Verify by changing the value again and")
            print("narrowing once more to confirm the same address still matches.")


if __name__ == "__main__":
    if sys.platform != "win32":
        print("The memory scanner only works on Windows (needs pymem + Win32 APIs).")
        sys.exit(1)
    main()
