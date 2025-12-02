"""
WebSocket server that receives touch events and controls the mouse.

Requirements:
    pip install websockets pyautogui

By default this listens on:
    ws://localhost:8766

The React Native dev screen sends coordinates at 30Hz. This server
interpolates between received coordinates for smooth mouse movement.

Message format:
    {
        "type": "touch",
        "t": <unix_ms>,
        "action": "start" | "move" | "end",
        "x": <float>,  // normalized 0-1
        "y": <float>,  // normalized 0-1
        "screenWidth": <int>,
        "screenHeight": <int>
    }
"""

from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, Optional, Tuple

import pyautogui
import websockets

# Disable pyautogui failsafe for smoother control
pyautogui.FAILSAFE = False

HOST = "0.0.0.0"
PORT = 8766

# Interpolation settings
INTERPOLATION_STEPS = 3  # Number of interpolation steps between received coordinates
INTERPOLATION_DURATION = 0.025  # Duration of interpolation in seconds (~25ms for 30Hz input)


async def interpolate_mouse(
    start_pos: Tuple[int, int],
    end_pos: Tuple[int, int],
    steps: int,
    duration: float,
    screen_width: int,
    screen_height: int,
) -> None:
    """
    Smoothly interpolate mouse movement from start_pos to end_pos.
    """
    if steps <= 1:
        pyautogui.moveTo(end_pos[0], end_pos[1])
        return

    step_duration = duration / steps
    dx = (end_pos[0] - start_pos[0]) / steps
    dy = (end_pos[1] - start_pos[1]) / steps

    for i in range(1, steps + 1):
        x = int(start_pos[0] + dx * i)
        y = int(start_pos[1] + dy * i)
        # Clamp to screen bounds
        x = max(0, min(screen_width - 1, x))
        y = max(0, min(screen_height - 1, y))
        pyautogui.moveTo(x, y)
        await asyncio.sleep(step_duration)


async def handle_touch(websocket) -> None:
    """
    Handle touch events and control the mouse with interpolation.
    Receives coordinates at 30Hz and interpolates between them for smooth movement.
    """
    peer = websocket.remote_address
    print(f"[Mouse] Client connected: {peer}")

    current_target: Optional[Tuple[int, int]] = None
    current_screen_size: Optional[Tuple[int, int]] = None
    interpolation_task: Optional[asyncio.Task] = None

    try:
        async for message in websocket:
            try:
                data: Dict[str, Any] = json.loads(message)
            except json.JSONDecodeError:
                print("[Mouse] Non-JSON message, skipping")
                continue

            if data.get("type") != "touch":
                print(f"[Mouse] Unknown message type: {data.get('type')!r}, skipping")
                continue

            action = data.get("action")
            x = data.get("x")  # normalized 0-1
            y = data.get("y")  # normalized 0-1
            screen_width = data.get("screenWidth")
            screen_height = data.get("screenHeight")

            if action is None or x is None or y is None:
                continue

            # Get current screen size if not provided
            if screen_width is None or screen_height is None:
                screen_width, screen_height = pyautogui.size()

            current_screen_size = (screen_width, screen_height)

            # Convert normalized coordinates (0-1) to absolute screen coordinates
            target_x = int(float(x) * screen_width)
            target_y = int(float(y) * screen_height)

            # Clamp to screen bounds
            target_x = max(0, min(screen_width - 1, target_x))
            target_y = max(0, min(screen_height - 1, target_y))
            target_pos = (target_x, target_y)

            if action == "start":
                # Cancel any ongoing interpolation
                if interpolation_task and not interpolation_task.done():
                    interpolation_task.cancel()
                    try:
                        await interpolation_task
                    except asyncio.CancelledError:
                        pass

                # Move immediately to start position
                pyautogui.moveTo(target_x, target_y)
                current_target = target_pos
                print(f"[Mouse] Touch started at ({target_x}, {target_y}) [normalized: {x:.3f}, {y:.3f}]")

            elif action == "move":
                if current_target is None:
                    # Shouldn't happen, but handle gracefully
                    current_target = target_pos
                    pyautogui.moveTo(target_x, target_y)
                    continue

                # Cancel any ongoing interpolation
                if interpolation_task and not interpolation_task.done():
                    interpolation_task.cancel()
                    try:
                        await interpolation_task
                    except asyncio.CancelledError:
                        pass

                # Start interpolation from current position to target
                start_pos = current_target
                interpolation_task = asyncio.create_task(
                    interpolate_mouse(
                        start_pos,
                        target_pos,
                        INTERPOLATION_STEPS,
                        INTERPOLATION_DURATION,
                        screen_width,
                        screen_height,
                    )
                )
                current_target = target_pos

            elif action == "end":
                # Cancel any ongoing interpolation
                if interpolation_task and not interpolation_task.done():
                    interpolation_task.cancel()
                    try:
                        await interpolation_task
                    except asyncio.CancelledError:
                        pass

                current_target = None
                print(f"[Mouse] Touch ended")

    except websockets.ConnectionClosedOK:
        print(f"[Mouse] Client closed: {peer}")
    except websockets.ConnectionClosedError:
        print(f"[Mouse] Client error/closed: {peer}")
    except Exception as exc:
        print(f"[Mouse] Error: {exc}")
    finally:
        # Clean up any ongoing interpolation
        if interpolation_task and not interpolation_task.done():
            interpolation_task.cancel()
            try:
                await interpolation_task
            except asyncio.CancelledError:
                pass
        print(f"[Mouse] Connection finished: {peer}")


async def main() -> None:
    """
    Standalone server entrypoint for mouse control.
    """
    print(f"[Mouse] Listening on ws://{HOST}:{PORT}")
    async with websockets.serve(handle_touch, HOST, PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Mouse] Server stopped by user")
