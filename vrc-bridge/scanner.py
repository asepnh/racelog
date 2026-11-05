"""Interactive CLI for finding VRC Pro's telemetry memory addresses.

A minimal, script-friendly stand-in for Cheat Engine's "scan for changed
value" workflow. Run it on the same Windows PC as VRC Pro, with a race or
practice session active:

    python scanner.py "VRC PRO.exe"

Workflow for finding e.g. speed:
  1. Start a scan while the car is roughly stationary (or any known
     speed), enter that value as the initial guess.
  2. Drive, let the value change, then re-run the scan telling it the new
     value.
  3. Repeat narrowing 3-5 times until only a handful of addresses remain.
  4. Note the surviving address, subtract the module base (printed at
     start) to get a static offset, then use "Find out what accesses this
     address" in Cheat Engine (or re-run this scan after a game restart to
     check the raw offset still resolves) to confirm it's stable enough
     to hardcode in config.yaml.

This only finds *flat* addresses. For values that move between runs
(because they live behind a pointer -- most game state does), pair this
with Cheat Engine's pointer scanner -- this tool is for getting you to a
first hit fast, not a full replacement.
"""
from __future__ import annotations

import argparse
import struct
import sys

import pymem
import pymem.process

TYPE_SIZES = {"float": 4, "double": 8, "int32": 4}
TYPE_STRUCT = {"float": "<f", "double": "<d", "int32": "<i"}


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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
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
    print("use Cheat Engine's full-process scan + pointer scan instead, and treat")
    print("this tool as a quick first pass.\n")

    fmt = TYPE_STRUCT[args.type]
    size = TYPE_SIZES[args.type]

    candidates: dict[int, bytes] | None = None
    while True:
        raw = input(
            "\nEnter a known current value to scan for (or 'q' to quit): "
        ).strip()
        if raw.lower() == "q":
            break
        try:
            target = float(raw)
        except ValueError:
            print("Not a number.")
            continue
        target_bytes = struct.pack(fmt, target)

        if candidates is None:
            all_values = _scan_memory(pm, args.type)
            candidates = {
                addr: b for addr, b in all_values.items() if b == target_bytes
            }
        else:
            still_valid = {}
            for addr in candidates:
                try:
                    current = pm.read_bytes(addr, size)
                except Exception:
                    continue
                if current == target_bytes:
                    still_valid[addr] = current
            candidates = still_valid

        print(f"{len(candidates)} candidate address(es) remain.")
        if 0 < len(candidates) <= 20:
            for addr in candidates:
                print(f"  0x{addr:X}  (offset from module base: 0x{addr - module.lpBaseOfDll:X})")
        if len(candidates) == 0:
            print("No candidates left -- restart the scan with a fresh value.")
            candidates = None
        elif len(candidates) == 1:
            print("Found it (probably). Verify by changing the value in-game and")
            print("re-running this scan once more with the new value to confirm.")


if __name__ == "__main__":
    if sys.platform != "win32":
        print("The memory scanner only works on Windows (needs pymem + Win32 APIs).")
        sys.exit(1)
    main()
