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

`target` is a synthetic label that can be 0 or 1 in runs of
length between 10 and 30 samples. Whenever a new run starts, the next target
value (0 or 1) is printed on its own line in the console.
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
TARGET_STATE: str  # "0" or "1"
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
    TARGET_STATE = random.choice(["0", "1"])
    TARGET_REMAINING = random.randint(10, 30)
    # Print initial target value ("0" or "1").
    print(TARGET_STATE)


def _next_target_label() -> str:
    """
    Advance/run the target state machine and return the current label ("T"/"F").

    The label is constant for TARGET_REMAINING samples; when the run ends,
    a new state is chosen at random (0 or 1) and a new run length
    [10, 30] is chosen.
    """
    global TARGET_STATE, TARGET_REMAINING

    if TARGET_REMAINING <= 0:
        # Start a new run with a randomly selected state (0 or 1),
        # different from the current state.
        choices = ["0", "1"]
        if TARGET_STATE in choices:
            choices = [c for c in choices if c != TARGET_STATE]
        TARGET_STATE = random.choice(choices)
        TARGET_REMAINING = random.randint(10, 30)
        # Print only the new target value ("0" or "1") on its own line.
        print(TARGET_STATE)

    label = TARGET_STATE
    TARGET_REMAINING -= 1
    return label


async def handle_magneto(websocket) -> None:
    global COUNT
    """
    Handle a single WebSocket client, printing incoming magnetometer samples.
    """
    # We intentionally avoid printing connection info to keep the console
    # restricted to target value changes only.

    try:
        async for message in websocket:
            try:
                data: Dict[str, Any] = json.loads(message)
            except json.JSONDecodeError:
                continue

            if data.get("type") != "magnetometer":
                continue

            x = data.get("x")
            y = data.get("y")
            z = data.get("z")
            t = data.get("t")  # currently unused but kept for completeness

            # Determine synthetic target label for this sample ("0" or "1").
            target_label = _next_target_label()

            COUNT += 1

            # Write to CSV.
            try:
                CSV_WRITER.writerow([x, y, z, target_label])
                CSV_FILE.flush()
            except Exception as exc:
                # Swallow CSV write errors to keep console clean.
                pass

    except (websockets.ConnectionClosedOK, websockets.ConnectionClosedError):
        # No logging; keep console reserved for target flips.
        pass
    except Exception:
        # Unexpected errors are suppressed to avoid extra console output.
        pass


async def main() -> None:
    global CSV_WRITER, CSV_FILE, CSV_FILE_PATH

    CSV_WRITER, CSV_FILE, CSV_FILE_PATH = _init_csv_writer()
    _init_target_state()

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
        # Suppress shutdown print to keep console clean.
        pass