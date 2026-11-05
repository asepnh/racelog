"""Reads telemetry out of VRC Pro's process memory while it's running.

Ported from the earlier local VRC-Pro-Telemetry- project's
sources/memory.py. See that project's README (or scanner.py here) for how
the pointer-chain offsets in config.yaml are found in the first place --
VRC Pro has no official telemetry API, so this is the fallback every
community tool for a closed sim with no API ends up using (same idea as
Cheat Engine, SimHub's memory readers, etc.), reading your own copy of
the game for your own personal use.

Addresses move between runs (ASLR, dynamic allocation), so each field is
a static base_offset (from the module's own base, which IS stable) plus a
pointer chain of offsets to follow down to the value -- exactly what Cheat
Engine's pointer scanner produces.
"""
from __future__ import annotations

import time
from collections.abc import Iterator
from dataclasses import dataclass

import pymem
import pymem.process

_TYPE_READERS = {
    "float": "read_float",
    "int": "read_int",
    "double": "read_double",
}


@dataclass
class FieldSpec:
    name: str
    base_offset: int
    offsets: list[int]
    type: str = "float"


class Sample(dict):
    """A plain dict works fine here -- this just needs to be JSON-ready
    with the same keys the webapp's Sample schema expects."""


class MemorySource:
    def __init__(self, process_name: str, fields: dict[str, dict], module_name: str | None = None, poll_hz: int = 60):
        self.process_name = process_name
        self.module_name = module_name or process_name
        self.poll_hz = poll_hz
        self.fields = [FieldSpec(name=name, **spec) for name, spec in fields.items()]
        self._pm: pymem.Pymem | None = None
        self._module_base = 0

    def __enter__(self) -> "MemorySource":
        self._pm = pymem.Pymem(self.process_name)
        module = pymem.process.module_from_name(self._pm.process_handle, self.module_name)
        if module is None:
            raise RuntimeError(
                f"Could not find module {self.module_name!r} in process {self.process_name!r}. "
                "Is VRC Pro running?"
            )
        self._module_base = module.lpBaseOfDll
        return self

    def __exit__(self, *exc) -> None:
        self._pm = None

    def _resolve(self, spec: FieldSpec) -> int:
        """base_offset + an empty offsets list means the value sits directly
        at module_base + base_offset (a static/global address found within
        the module's own scanned range -- no pointer to follow). A non-empty
        offsets list means base_offset points at the first pointer in a
        chain: dereference through every offset but the last, then add the
        last one without dereferencing (the field offset inside the final
        struct) -- the shape Cheat Engine's pointer scanner produces for
        heap-allocated game state.
        """
        assert self._pm is not None
        addr = self._module_base + spec.base_offset
        if not spec.offsets:
            return addr
        addr = self._pm.read_longlong(addr)
        for off in spec.offsets[:-1]:
            addr = self._pm.read_longlong(addr + off)
        return addr + spec.offsets[-1]

    def _read_field(self, spec: FieldSpec):
        assert self._pm is not None
        addr = self._resolve(spec)
        reader = getattr(self._pm, _TYPE_READERS[spec.type])
        return reader(addr)

    def read(self, stop_event) -> Iterator[dict]:
        """Yields one Sample dict per tick until stop_event is set."""
        t0 = time.perf_counter()
        period = 1.0 / self.poll_hz
        next_tick = t0
        while not stop_event.is_set():
            now = time.perf_counter()
            values: dict = {"t": now - t0}
            for spec in self.fields:
                try:
                    values[spec.name] = self._read_field(spec)
                except Exception:
                    # Address chain momentarily invalid (loading screen,
                    # car respawn, etc.) -- skip this field this tick
                    # rather than killing the whole session.
                    values[spec.name] = None
            yield values

            next_tick += period
            sleep_for = next_tick - time.perf_counter()
            if sleep_for > 0:
                time.sleep(sleep_for)
