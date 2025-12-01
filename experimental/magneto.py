"""
Simple WebSocket server that receives magnetometer samples.

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

This module also provides an async iterator `magnetometer_iterator` which
you can use like:

    from magneto import magnetometer_iterator

    async for x, y, z in magnetometer_iterator():
        ...
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, AsyncIterator, Dict, Tuple

import websockets


HOST = "0.0.0.0"
PORT = 8765

COUNT = 1

# Global queue used by the iterator interface
_magneto_queue: asyncio.Queue[Tuple[float, float, float] | None] | None = None


async def _iter_connection_handler(websocket) -> None:
    """
    Internal handler used by `magnetometer_iterator`.

    It pushes each (x, y, z) sample into the global queue and also prints
    basic logging so you can see traffic.
    """
    global COUNT, _magneto_queue
    peer = websocket.remote_address
    print(f"[Magneto] (iterator) Client connected: {peer}")

    try:
        async for message in websocket:
            try:
                data: Dict[str, Any] = json.loads(message)
            except json.JSONDecodeError:
                # Keep iterator quiet on malformed messages.
                continue

            if data.get("type") != "magnetometer":
                continue

            x = data.get("x")
            y = data.get("y")
            z = data.get("z")

            if x is None or y is None or z is None:
                continue

            sample = (float(x), float(y), float(z))

            # Feed the iterator queue if it's active.
            if _magneto_queue is not None:
                await _magneto_queue.put(sample)

            # Also log a simple counter so you see activity.
            COUNT += 1
            print(
                f"[Magneto] (iterator) #{COUNT} "
                f"x={sample[0]:.3f} y={sample[1]:.3f} z={sample[2]:.3f}"
            )

    except (websockets.ConnectionClosedOK, websockets.ConnectionClosedError):
        print(f"[Magneto] (iterator) Client closed: {peer}")
    except Exception as exc:
        print(f"[Magneto] (iterator) Error: {exc}")
    finally:
        print(f"[Magneto] (iterator) Connection finished: {peer}")
        # Signal end-of-stream to the iterator.
        if _magneto_queue is not None:
            await _magneto_queue.put(None)


async def magnetometer_iterator(
    host: str = HOST, port: int = PORT
) -> AsyncIterator[Tuple[float, float, float]]:
    """
    Async iterator that yields (x, y, z) tuples from incoming WebSocket messages.

    This sets up its own WebSocket server on (host, port), so you should NOT
    run `main()` at the same time on the same port.

    Usage:
        async for x, y, z in magnetometer_iterator():
            # Do live inference here
            ...
    """
    global _magneto_queue

    if _magneto_queue is not None:
        raise RuntimeError("magnetometer_iterator already running in this process.")

    _magneto_queue = asyncio.Queue()

    async with websockets.serve(_iter_connection_handler, host, port):
        print(f"[Magneto] iterator listening on ws://{host}:{port}")

        try:
            while True:
                sample = await _magneto_queue.get()
                if sample is None:
                    # Connection closed; end the iterator.
                    break
                yield sample
        finally:
            _magneto_queue = None


async def handle_magneto(websocket) -> None:
    """
    Original demo handler: just prints incoming magnetometer samples.
    """
    global COUNT
    peer = websocket.remote_address
    print(f"[Magneto] Client connected: {peer}")

    try:
        async for message in websocket:
            # print(f"[Magneto] raw message: {message!r}")
            try:
                data: Dict[str, Any] = json.loads(message)
            except json.JSONDecodeError:
                print("[Magneto] Non-JSON message, skipping")
                continue

            if data.get("type") != "magnetometer":
                print(
                    f"[Magneto] Unknown message type: {data.get('type')!r}, skipping"
                )
                continue

            x = data.get("x")
            y = data.get("y")
            z = data.get("z")
            t = data.get("t")

            # print(f"[Magneto] sample t={t}  x={x}  y={y}  z={z}")
            print(x, y, z, COUNT)
            COUNT += 1

    except websockets.ConnectionClosedOK:
        print(f"[Magneto] Client closed: {peer}")
    except websockets.ConnectionClosedError:
        print(f"[Magneto] Client error/closed: {peer}")
    except Exception as exc:
        print(f"[Magneto] Error: {exc}")
    finally:
        print(f"[Magneto] Connection finished: {peer}")


async def main() -> None:
    """
    Standalone server entrypoint that just prints samples.
    """
    print(f"[Magneto] Listening on ws://{HOST}:{PORT}")
    async with websockets.serve(handle_magneto, HOST, PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Magneto] Server stopped by user")