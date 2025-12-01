"""
Simple WebSocket server that receives magnetometer samples and prints them.

Requirements:
    pip install websockets

By default this listens on:
    ws://localhost:8765

The React Native dev screen in `pycontroller/app/(tabs)/dev.tsx` is
configured to send JSON messages of the form:
    {
        "type": "magnetometer",
        "t": <unix_ms>,
        "x": <float>,
        "y": <float>,
        "z": <float>
    }

This script also logs each sample to a CSV file whose name is the current
short git commit hash (e.g. `abc1234.csv`) with columns:
    x, y, z, target

`target` is a synthetic label that alternates between "T" and "F" in runs of
length between 10 and 30 samples. Whenever a new run starts, the next target
value is printed to the console.
"""

import asyncio
import csv
import json
import random
import subprocess
from pathlib import Path
from typing import Any, Dict, IO, Tuple

import websockets


HOST = "0.0.0.0"
PORT = 8765

COUNT = 1

# Global CSV + target-state bookkeeping
CSV_WRITER: csv.writer
CSV_FILE: IO[str]
CSV_FILE_PATH: Path
TARGET_STATE: bool  # True => "T", False => "F"
TARGET_REMAINING: int


def _get_short_commit_hash() -> str:
    """
    Return the current short git commit hash, or a fallback name if unavailable.
    """
    try:
        out = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return out.strip() or "nohash"
    except Exception:
        return "nohash"


def _init_csv_writer() -> Tuple[csv.writer, IO[str], Path]:
    """
    Initialize a CSV writer for the current short commit hash.
    If the file is new/empty, write a header row.
    """
    commit = _get_short_commit_hash()
    # Place CSV next to this script, named "<hash>.csv"
    base_dir = Path(__file__).resolve().parent
    csv_path = base_dir / f"{commit}.csv"

    file_exists = csv_path.exists() and csv_path.stat().st_size > 0
    f = csv_path.open("a", newline="")
    writer = csv.writer(f)

    if not file_exists:
        writer.writerow(["x", "y", "z", "target"])
        f.flush()

    return writer, f, csv_path


def _init_target_state() -> None:
    """
    Initialize the synthetic target label state.
    """
    global TARGET_STATE, TARGET_REMAINING
    TARGET_STATE = bool(random.getrandbits(1))
    TARGET_REMAINING = random.randint(10, 30)
    label = "T" if TARGET_STATE else "F"
    print(f"\n[Magneto] Next target: {label} (for next {TARGET_REMAINING} samples)")


def _next_target_label() -> str:
    """
    Advance/run the target state machine and return the current label ("T"/"F").

    The label is constant for TARGET_REMAINING samples; when the run ends,
    the state flips and a new run length [10, 30] is chosen.
    """
    global TARGET_STATE, TARGET_REMAINING

    if TARGET_REMAINING <= 0:
        # Start a new run with the opposite state.
        TARGET_STATE = not TARGET_STATE
        TARGET_REMAINING = random.randint(10, 30)
        label = "T" if TARGET_STATE else "F"
        print(f"\n[Magneto] Next target: {label} (for next {TARGET_REMAINING} samples)")

    label = "T" if TARGET_STATE else "F"
    TARGET_REMAINING -= 1
    return label


async def handle_magneto(websocket) -> None:
    global COUNT
    """
    Handle a single WebSocket client, printing incoming magnetometer samples.
    """
    peer = websocket.remote_address
    print(f"[Magneto] Client connected: {peer}")

    try:
        async for message in websocket:
            # print(f"[Magneto] raw message: {message!r}")
            try:
                data: Dict[str, Any] = json.loads(message)
            except json.JSONDecodeError:
                print(f"[Magneto] Non-JSON message, skipping")
                continue

            if data.get("type") != "magnetometer":
                print(f"[Magneto] Unknown message type: {data.get('type')!r}, skipping")
                continue

            x = data.get("x")
            y = data.get("y")
            z = data.get("z")
            t = data.get("t")  # currently unused but kept for completeness

            # Determine synthetic target label for this sample.
            target_label = _next_target_label()

            # Log to console (x, y, z, T/F, count).
            print(x, y, z, target_label, COUNT)
            COUNT += 1

            # Write to CSV.
            try:
                CSV_WRITER.writerow([x, y, z, target_label])
                CSV_FILE.flush()
            except Exception as exc:
                print(f"[Magneto] Failed to write CSV row: {exc}")

    except websockets.ConnectionClosedOK:
        print(f"[Magneto] Client closed: {peer}")
    except websockets.ConnectionClosedError:
        print(f"[Magneto] Client error/closed: {peer}")
    except Exception as exc:
        print(f"[Magneto] Error: {exc}")
    finally:
        print(f"[Magneto] Connection finished: {peer}")


async def main() -> None:
    global CSV_WRITER, CSV_FILE, CSV_FILE_PATH

    CSV_WRITER, CSV_FILE, CSV_FILE_PATH = _init_csv_writer()
    _init_target_state()

    print(f"[Magneto] Logging to CSV: {CSV_FILE_PATH}")
    print(f"[Magneto] Listening on ws://{HOST}:{PORT}")

    async with websockets.serve(handle_magneto, HOST, PORT):
        try:
            await asyncio.Future()  # run forever
        finally:
            # Best effort to close the CSV file when the server shuts down.
            try:
                CSV_FILE.close()
            except Exception:
                pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Magneto] Server stopped by user")