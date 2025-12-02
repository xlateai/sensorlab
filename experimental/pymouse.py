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
    
    OR
    
    {
        "type": "click",
        "t": <unix_ms>,
        "button": "left" | "right" | "middle"
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
    # For relative control: where the finger first touched (normalized 0-1)
    touch_origin_norm: Optional[Tuple[float, float]] = None
    # For relative control: where the mouse was when the finger first touched (absolute pixels)
    mouse_origin_pos: Optional[Tuple[int, int]] = None

    try:
        async for message in websocket:
            try:
                data: Dict[str, Any] = json.loads(message)
            except json.JSONDecodeError:
                print("[Mouse] Non-JSON message, skipping")
                continue

            msg_type = data.get("type")
            
            # Handle click events
            if msg_type == "click":
                button = data.get("button", "left")
                
                # Perform the click at current mouse position (no movement)
                if button == "left":
                    pyautogui.click()
                elif button == "right":
                    pyautogui.rightClick()
                elif button == "middle":
                    pyautogui.middleClick()
                else:
                    print(f"[Mouse] Unknown button type: {button!r}, using left click")
                    pyautogui.click()
                
                mouse_x, mouse_y = pyautogui.position()
                print(f"[Mouse] {button} click at ({mouse_x}, {mouse_y})")
                continue
            
            # Handle touch events
            if msg_type != "touch":
                print(f"[Mouse] Unknown message type: {msg_type!r}, skipping")
                continue

            action = data.get("action")
            x = data.get("x")  # normalized 0-1
            y = data.get("y")  # normalized 0-1

            if action is None or x is None or y is None:
                continue

            # Always use the actual computer screen size (ignore phone screen dimensions)
            screen_width, screen_height = pyautogui.size()
            current_screen_size = (screen_width, screen_height)

            if action == "start":
                # Cancel any ongoing interpolation
                if interpolation_task and not interpolation_task.done():
                    interpolation_task.cancel()
                    try:
                        await interpolation_task
                    except asyncio.CancelledError:
                        pass

                # Set up relative control:
                #   - Remember where on the screen the mouse currently is
                #   - Remember where on the phone the finger first touched
                mouse_x, mouse_y = pyautogui.position()
                mouse_origin_pos = (mouse_x, mouse_y)
                touch_origin_norm = (float(x), float(y))
                current_target = mouse_origin_pos
                print(
                    f"[Mouse] Touch started (relative mode). "
                    f"Mouse origin=({mouse_x}, {mouse_y}), "
                    f"touch origin norm=({float(x):.3f}, {float(y):.3f})"
                )

            elif action == "move":
                if mouse_origin_pos is None or touch_origin_norm is None:
                    # If for some reason we never got a proper start event,
                    # treat this move as a new start.
                    mouse_x, mouse_y = pyautogui.position()
                    mouse_origin_pos = (mouse_x, mouse_y)
                    touch_origin_norm = (float(x), float(y))
                    current_target = mouse_origin_pos

                # Compute delta in normalized space from where the finger first touched
                dx_norm = float(x) - touch_origin_norm[0]
                dy_norm = float(y) - touch_origin_norm[1]

                # Calculate dynamic sensitivity based on available movement range
                # This ensures the full finger range maps to the full mouse range from current position to edges
                
                # X axis: calculate sensitivity for left and right movement separately
                mouse_x = mouse_origin_pos[0]
                touch_origin_x = touch_origin_norm[0]
                
                # Available mouse movement ranges
                mouse_range_right = (screen_width - 1) - mouse_x  # Distance to right edge
                mouse_range_left = mouse_x  # Distance to left edge
                
                # Available finger movement ranges
                finger_range_right = 1.0 - touch_origin_x  # Distance to right edge
                finger_range_left = touch_origin_x  # Distance to left edge
                
                # Calculate sensitivity based on direction
                if dx_norm > 0:  # Moving right
                    if finger_range_right > 0:
                        sensitivity_x = mouse_range_right / finger_range_right
                    else:
                        sensitivity_x = screen_width  # Fallback if at right edge
                else:  # Moving left (dx_norm <= 0)
                    if finger_range_left > 0:
                        sensitivity_x = mouse_range_left / finger_range_left
                    else:
                        sensitivity_x = screen_width  # Fallback if at left edge
                
                # Y axis: same logic
                mouse_y = mouse_origin_pos[1]
                touch_origin_y = touch_origin_norm[1]
                
                mouse_range_down = (screen_height - 1) - mouse_y
                mouse_range_up = mouse_y
                
                finger_range_down = 1.0 - touch_origin_y
                finger_range_up = touch_origin_y
                
                if dy_norm > 0:  # Moving down
                    if finger_range_down > 0:
                        sensitivity_y = mouse_range_down / finger_range_down
                    else:
                        sensitivity_y = screen_height  # Fallback if at bottom edge
                else:  # Moving up (dy_norm <= 0)
                    if finger_range_up > 0:
                        sensitivity_y = mouse_range_up / finger_range_up
                    else:
                        sensitivity_y = screen_height  # Fallback if at top edge
                
                # Apply sensitivity to map finger movement to mouse movement
                target_x = int(mouse_x + dx_norm * sensitivity_x)
                target_y = int(mouse_y + dy_norm * sensitivity_y)

                # Clamp to screen bounds (ensures we can always reach edges)
                target_x = max(0, min(screen_width - 1, target_x))
                target_y = max(0, min(screen_height - 1, target_y))
                target_pos = (target_x, target_y)

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
                touch_origin_norm = None
                mouse_origin_pos = None
                print(f"[Mouse] Touch ended (relative mode reset)")

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
