"""
WebSocket server that receives touch events and controls the mouse.

Requirements:
    pip install websockets pyautogui

By default this listens on:
    ws://localhost:8766

The React Native dev screen in `pycontroller/app/(tabs)/dev.tsx` is
configured to send JSON messages of the form:
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
from typing import Any, Dict

import pyautogui
import websockets

# Disable pyautogui failsafe for smoother control
pyautogui.FAILSAFE = False

HOST = "0.0.0.0"
PORT = 8766

# Track the initial touch position for relative movement
_initial_touch: tuple[float, float] | None = None
_initial_mouse_pos: tuple[int, int] | None = None


async def handle_touch(websocket) -> None:
    """
    Handle touch events and control the mouse.
    """
    global _initial_touch, _initial_mouse_pos
    peer = websocket.remote_address
    print(f"[Mouse] Client connected: {peer}")

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

            if action == "start":
                # Store initial touch position and current mouse position
                _initial_touch = (float(x), float(y))
                _initial_mouse_pos = pyautogui.position()
                print(f"[Mouse] Touch started at ({x:.3f}, {y:.3f}), mouse at {_initial_mouse_pos}")

            elif action == "move":
                if _initial_touch is None or _initial_mouse_pos is None:
                    continue

                # Calculate relative movement from initial touch
                dx = (float(x) - _initial_touch[0]) * screen_width
                dy = (float(y) - _initial_touch[1]) * screen_height

                # Move mouse relative to initial position
                new_x = int(_initial_mouse_pos[0] + dx)
                new_y = int(_initial_mouse_pos[1] + dy)

                # Clamp to screen bounds
                new_x = max(0, min(screen_width - 1, new_x))
                new_y = max(0, min(screen_height - 1, new_y))

                pyautogui.moveTo(new_x, new_y)
                print(f"[Mouse] Moved to ({new_x}, {new_y}) [dx={dx:.1f}, dy={dy:.1f}]")

            elif action == "end":
                # Reset tracking
                _initial_touch = None
                _initial_mouse_pos = None
                print(f"[Mouse] Touch ended")

    except websockets.ConnectionClosedOK:
        print(f"[Mouse] Client closed: {peer}")
    except websockets.ConnectionClosedError:
        print(f"[Mouse] Client error/closed: {peer}")
    except Exception as exc:
        print(f"[Mouse] Error: {exc}")
    finally:
        print(f"[Mouse] Connection finished: {peer}")
        # Reset tracking on disconnect
        _initial_touch = None
        _initial_mouse_pos = None


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
