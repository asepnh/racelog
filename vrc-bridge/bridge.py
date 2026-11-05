"""Records a VRC Pro session from process memory and uploads it to RaceLog.

    python bridge.py --config config.yaml

Starts recording immediately, reading memory at `poll_hz` from
config.yaml. Press Ctrl+C to stop and upload. The whole session is
buffered in memory and sent as one request at the end (not streamed
live) -- simplest thing that works, and sessions are short enough that
buffering isn't a problem.
"""
from __future__ import annotations

import argparse
import signal
import sys
import threading

import requests
import yaml

from memory_source import MemorySource

SAMPLE_FIELDS = [
    "pos_x", "pos_y", "speed_kph", "rpm", "throttle", "brake", "steering", "lap",
]


def load_config(path: str) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default="config.yaml")
    parser.add_argument("--name", default=None, help="Session name (default: timestamp)")
    args = parser.parse_args()

    cfg = load_config(args.config)
    source = MemorySource(
        process_name=cfg["process_name"],
        module_name=cfg.get("module_name"),
        poll_hz=cfg.get("poll_hz", 60),
        fields=cfg["fields"],
    )

    stop_event = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: stop_event.set())

    samples: list[dict] = []
    print(f"Attaching to {cfg['process_name']}... (Ctrl+C to stop recording)")
    try:
        with source:
            print("Recording. Drive!")
            for sample in source.read(stop_event):
                samples.append(sample)
                if len(samples) % (cfg.get("poll_hz", 60) * 5) == 0:
                    print(f"  {len(samples)} samples recorded ({sample['t']:.0f}s)...")
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except KeyboardInterrupt:
        pass

    if not samples:
        print("No samples recorded, nothing to upload.")
        return

    print(f"\nRecorded {len(samples)} samples. Uploading to {cfg['webapp_url']}...")
    upload(cfg, samples, args.name)


def upload(cfg: dict, samples: list[dict], name: str | None) -> None:
    import datetime

    payload = {
        "name": name or f"VRC Pro {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}",
        "source": "vrc_pro_memory",
        "samples": [{k: s.get(k) for k in ["t", *SAMPLE_FIELDS]} for s in samples],
    }
    headers = {"Content-Type": "application/json"}
    if cfg.get("import_token"):
        headers["X-Import-Token"] = cfg["import_token"]

    url = cfg["webapp_url"].rstrip("/") + "/api/import/raw"
    resp = requests.post(url, json=payload, headers=headers, timeout=60)
    if resp.ok:
        data = resp.json()
        print(f"Uploaded. Session #{data['session_id']} ({data['sample_count']} samples).")
        print(f"View it at {cfg['webapp_url'].rstrip('/')}/sessions/{data['session_id']}")
    else:
        print(f"Upload failed: HTTP {resp.status_code}\n{resp.text}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
