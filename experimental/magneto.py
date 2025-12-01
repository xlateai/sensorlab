"""
Simple WebSocket server + pygame visualizer for live magnetometer data.

Requirements:
    pip install websockets pygame

By default this listens on:
    ws://0.0.0.0:8765

The React Native dev screen in `pycontroller/app/(tabs)/dev.tsx` is
configured to send JSON messages of the form:
    {
        "type": "magnetometer",
        "t": <unix_ms>,
        "x": <float>,
        "y": <float>,
        "z": <float>
    }
"""

import asyncio
import json
import threading
import time
from collections import deque
from typing import Any, Dict
import queue

import pygame
import websockets


HOST = "0.0.0.0"
PORT = 8765

# Thread-safe queue to pass samples from the websocket server (asyncio thread)
# to the pygame visualizer (main thread).
_sample_queue: "queue.Queue[tuple[float, float, float, float]]" = queue.Queue(
    maxsize=2048
)


async def handle_magneto(websocket) -> None:
    """
    Handle a single WebSocket client, pushing incoming magnetometer samples
    onto the shared queue for visualization.
    """
    peer = websocket.remote_address
    print(f"[Magneto] Client connected: {peer}")

    try:
        async for message in websocket:
            try:
                data: Dict[str, Any] = json.loads(message)
            except json.JSONDecodeError:
                print("[Magneto] Non-JSON message, skipping")
                continue

            if data.get("type") != "magnetometer":
                # Ignore other message types
                continue

            x = float(data.get("x", 0.0))
            y = float(data.get("y", 0.0))
            z = float(data.get("z", 0.0))
            t_ms = float(data.get("t", time.time() * 1000.0))

            sample = (t_ms, x, y, z)
            try:
                _sample_queue.put_nowait(sample)
            except queue.Full:
                # Drop one and retry to avoid blocking
                try:
                    _sample_queue.get_nowait()
                except queue.Empty:
                    pass
                try:
                    _sample_queue.put_nowait(sample)
                except queue.Full:
                    pass

    except websockets.ConnectionClosedOK:
        print(f"[Magneto] Client closed: {peer}")
    except websockets.ConnectionClosedError:
        print(f"[Magneto] Client error/closed: {peer}")
    except Exception as exc:
        print(f"[Magneto] Error: {exc}")
    finally:
        print(f"[Magneto] Connection finished: {peer}")


async def _websocket_main() -> None:
    print(f"[Magneto] Listening on ws://{HOST}:{PORT}")
    async with websockets.serve(handle_magneto, HOST, PORT):
        await asyncio.Future()  # run forever


def start_server_in_background() -> None:
    """
    Start the asyncio websocket server in a background daemon thread so
    the main thread is free to run the pygame loop.
    """

    def _runner():
        try:
            asyncio.run(_websocket_main())
        except KeyboardInterrupt:
            pass

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()


def run_visualizer() -> None:
    """
    Simple pygame window that renders a live line plot of x/y/z magnetometer
    values over time on a black background with neon green accents.
    """
    pygame.init()

    width, height = 900, 500
    screen = pygame.display.set_mode((width, height))
    pygame.display.setcaption = pygame.display.set_caption("Magnetometer Stream")

    clock = pygame.time.Clock()

    # Colors (black background, neon green accents)
    BLACK = (0, 0, 0)
    GRID_GREEN = (0, 255, 120)
    X_COLOR = (0, 255, 0)        # bright green
    Y_COLOR = (80, 255, 120)     # softer green
    Z_COLOR = (160, 255, 200)    # pale green/teal

    # Keep history of the last N samples
    max_points = 400
    x_hist = deque(maxlen=max_points)
    y_hist = deque(maxlen=max_points)
    z_hist = deque(maxlen=max_points)

    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        # Drain queue and update history
        try:
            while True:
                _t_ms, x, y, z = _sample_queue.get_nowait()
                x_hist.append(x)
                y_hist.append(y)
                z_hist.append(z)
        except queue.Empty:
            pass

        screen.fill(BLACK)

        # Draw a faint grid / midline
        mid_y = height // 2
        pygame.draw.line(screen, GRID_GREEN, (0, mid_y), (width, mid_y), 1)
        # vertical grid lines
        for gx in range(0, width, 100):
            pygame.draw.line(screen, (0, 80, 40), (gx, 0), (gx, height), 1)

        if not x_hist:
            pygame.display.flip()
            clock.tick(60)
            continue

        # Auto-scale based on recent magnitude so plot stays visible
        all_vals = list(x_hist) + list(y_hist) + list(z_hist)
        max_abs = max(max(abs(v) for v in all_vals), 1e-6)
        scale = (height * 0.4) / max_abs  # use 40% of half-height

        def series_to_points(series):
            pts = []
            n = len(series)
            if n < 2:
                return pts
            step_x = width / max_points
            offset = max_points - n  # right-align
            for i, v in enumerate(series):
                x_px = int((i + offset) * step_x)
                y_px = int(mid_y - v * scale)
                pts.append((x_px, y_px))
            return pts

        for series, color in (
            (x_hist, X_COLOR),
            (y_hist, Y_COLOR),
            (z_hist, Z_COLOR),
        ):
            pts = series_to_points(series)
            if len(pts) >= 2:
                pygame.draw.lines(screen, color, False, pts, 2)

        pygame.display.flip()
        clock.tick(60)

    pygame.quit()


def main() -> None:
    start_server_in_background()
    run_visualizer()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n[Magneto] Server stopped by user")