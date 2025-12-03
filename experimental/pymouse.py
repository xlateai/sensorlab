"""
WebSocket server that receives touch events and controls the mouse.

Requirements:
    pip install websockets pyautogui zeroconf

By default this listens on:
    ws://localhost:8766
    http://localhost:8767/discover (for service discovery)

The server advertises itself via mDNS as "_pymouse._tcp.local" and also
provides an HTTP discovery endpoint at /discover so clients can discover
it automatically without needing to know the IP address.

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
    
    OR
    
    {
        "type": "drag",
        "t": <unix_ms>,
        "action": "start" | "move" | "end",
        "x": <float>,  // normalized 0-1
        "y": <float>,  // normalized 0-1
        "screenWidth": <int>,
        "screenHeight": <int>
    }
    
    OR
    
    {
        "type": "scroll",
        "t": <unix_ms>,
        "deltaY": <float>  // scroll amount (negative = up, positive = down)
    }
    
    OR
    
    {
        "type": "key",
        "t": <unix_ms>,
        "key": <string>  // character to type, or special key name (e.g., "enter", "tab", "backspace", "escape", "space")
    }
    
    OR
    
    {
        "type": "text_batch",
        "t": <unix_ms>,
        "text": <string>  // entire text batch to send at once (Chat Mode)
    }
"""

from __future__ import annotations

import asyncio
import json
import socket
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread
from typing import Any, Dict, Optional, Tuple

import pyautogui
import websockets
from zeroconf import IPVersion, ServiceInfo, Zeroconf

# Disable pyautogui failsafe for smoother control
pyautogui.FAILSAFE = False

HOST = "0.0.0.0"
PORT = 8766
DISCOVERY_PORT = 8767  # HTTP discovery endpoint port

# mDNS service name
SERVICE_TYPE = "_pymouse._tcp.local."
SERVICE_NAME = "pymouse-server._pymouse._tcp.local."

# Mouse movement settings
MOVE_DURATION = 0.05  # Duration for smooth mouse movement (50ms for trackpad-like feel)
# Mouse sensitivity (multiplier for normalized finger movement)
SENSITIVITY = 1.0


def get_local_ip() -> str:
    """Get the local IP address for mDNS advertisement."""
    try:
        # Connect to a remote address to determine local IP
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def register_mdns_service(port: int) -> tuple[Zeroconf, ServiceInfo]:
    """Register the WebSocket service via mDNS."""
    local_ip = get_local_ip()
    print(f"[mDNS] Registering service at {local_ip}:{port}")
    
    info = ServiceInfo(
        SERVICE_TYPE,
        SERVICE_NAME,
        addresses=[socket.inet_aton(local_ip)],
        port=port,
        properties={"version": "1.0"},
    )
    
    zeroconf = Zeroconf(ip_version=IPVersion.V4Only)
    zeroconf.register_service(info)
    print(f"[mDNS] Service registered: {SERVICE_NAME} at {local_ip}:{port}")
    
    # Force immediate announcement by updating the service
    # This helps with faster discovery on iOS
    try:
        # Re-register to force immediate announcement
        zeroconf.update_service(info)
    except Exception as e:
        # If update fails, that's okay - the initial registration should work
        pass
    
    return zeroconf, info


async def handle_touch(websocket) -> None:
    """
    Handle touch events and control the mouse with interpolation.
    Receives coordinates at 30Hz and interpolates between them for smooth movement.
    """
    peer = websocket.remote_address
    print(f"[Mouse] Client connected: {peer}")

    current_target: Optional[Tuple[int, int]] = None
    move_task: Optional[asyncio.Task] = None
    # For relative control: where the finger first touched (normalized 0-1)
    touch_origin_norm: Optional[Tuple[float, float]] = None
    # For relative control: where the mouse was when the finger first touched (absolute pixels)
    mouse_origin_pos: Optional[Tuple[int, int]] = None
    # Drag state
    is_dragging: bool = False
    drag_origin_norm: Optional[Tuple[float, float]] = None
    drag_mouse_origin_pos: Optional[Tuple[int, int]] = None
    # Scroll accumulator for smooth decimal scrolling
    scroll_accumulator: float = 0.0

    try:
        async for message in websocket:
            try:
                data: Dict[str, Any] = json.loads(message)
            except json.JSONDecodeError:
                print("[Mouse] Non-JSON message, skipping")
                continue

            msg_type = data.get("type")
            
            # Handle batch text events (Chat Mode)
            if msg_type == "text_batch":
                text = data.get("text", "")
                try:
                    # Send the entire text batch at once
                    pyautogui.write(text)
                    print(f"[Keyboard] Sent batch text: {text!r}")
                except Exception as e:
                    print(f"[Keyboard] Failed to send batch text: {e}")
                continue
            
            # Handle keyboard events
            if msg_type == "key":
                key = data.get("key", "")
                try:
                    # Map special key names to pyautogui key names
                    special_keys = {
                        "enter": "enter",
                        "return": "enter",
                        "tab": "tab",
                        "backspace": "backspace",
                        "escape": "escape",
                        "esc": "escape",
                        "space": "space",
                    }
                    
                    if key.lower() in special_keys:
                        # Send special key
                        pyautogui.press(special_keys[key.lower()])
                        print(f"[Keyboard] Pressed special key: {key}")
                    elif len(key) == 1:
                        # Single character - type it
                        pyautogui.write(key)
                        print(f"[Keyboard] Typed character: {key!r}")
                    else:
                        print(f"[Keyboard] Unknown key: {key!r}")
                except Exception as e:
                    print(f"[Keyboard] Failed to send key: {e}")
                continue
            
            # Handle scroll events
            if msg_type == "scroll":
                delta_y = data.get("deltaY", 0.0)
                try:
                    # Accumulate fractional scrolls for smooth decimal scrolling
                    # Negative deltaY means scroll up, positive means scroll down
                    # We accumulate fractional scrolls and only execute when >= 1.0
                    # Increased sensitivity multiplier for better responsiveness
                    scroll_accumulator += -delta_y * 3.0  # Scale factor for sensitivity (increased from 2.0)
                    
                    # Execute scroll when accumulated value >= 1.0 or <= -1.0
                    if abs(scroll_accumulator) >= 1.0:
                        scroll_clicks = int(scroll_accumulator)
                        scroll_accumulator -= scroll_clicks  # Keep the remainder
                        if scroll_clicks != 0:
                            pyautogui.scroll(scroll_clicks)
                except Exception as e:
                    print(f"[Mouse] Failed to scroll: {e}")
                continue
            
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
            
            # Handle drag events (double-tap to drag)
            if msg_type == "drag":
                action = data.get("action")
                x = data.get("x")  # normalized 0-1
                y = data.get("y")  # normalized 0-1

                if action is None or x is None or y is None:
                    continue

                screen_width, screen_height = pyautogui.size()

                if action == "start":
                    # Cancel any ongoing movement
                    if move_task and not move_task.done():
                        move_task.cancel()
                        try:
                            await move_task
                        except asyncio.CancelledError:
                            pass

                    # Mouse down at current position
                    mouse_x, mouse_y = pyautogui.position()
                    pyautogui.mouseDown(button='left')
                    is_dragging = True
                    drag_mouse_origin_pos = (mouse_x, mouse_y)
                    drag_origin_norm = (float(x), float(y))
                    current_target = (mouse_x, mouse_y)
                    print(
                        f"[Mouse] Drag started. "
                        f"Mouse origin=({mouse_x}, {mouse_y}), "
                        f"touch origin norm=({float(x):.3f}, {float(y):.3f})"
                    )
                    continue

                elif action == "move":
                    if not is_dragging or drag_mouse_origin_pos is None or drag_origin_norm is None:
                        # If drag wasn't properly started, start it now
                        mouse_x, mouse_y = pyautogui.position()
                        pyautogui.mouseDown(button='left')
                        is_dragging = True
                        drag_mouse_origin_pos = (mouse_x, mouse_y)
                        drag_origin_norm = (float(x), float(y))
                        current_target = (mouse_x, mouse_y)

                    # Compute delta in normalized space from where the drag started
                    dx_norm = float(x) - drag_origin_norm[0]
                    dy_norm = float(y) - drag_origin_norm[1]

                    # Apply linear sensitivity to map finger movement to mouse movement
                    mouse_x = drag_mouse_origin_pos[0]
                    mouse_y = drag_mouse_origin_pos[1]
                    target_x = int(mouse_x + dx_norm * SENSITIVITY * screen_width)
                    target_y = int(mouse_y + dy_norm * SENSITIVITY * screen_height)

                    # Clamp to screen bounds
                    target_x = max(0, min(screen_width - 1, target_x))
                    target_y = max(0, min(screen_height - 1, target_y))

                    # Cancel any ongoing movement
                    if move_task and not move_task.done():
                        move_task.cancel()
                        try:
                            await move_task
                        except asyncio.CancelledError:
                            pass

                    # Use pyautogui's built-in smooth movement with easing
                    move_task = asyncio.create_task(
                        asyncio.to_thread(
                            pyautogui.moveTo,
                            target_x,
                            target_y,
                            duration=MOVE_DURATION,
                            tween=pyautogui.easeInOutQuad,
                        )
                    )
                    current_target = (target_x, target_y)
                    continue

                elif action == "end":
                    # Cancel any ongoing movement
                    if move_task and not move_task.done():
                        move_task.cancel()
                        try:
                            await move_task
                        except asyncio.CancelledError:
                            pass

                    # Mouse up
                    if is_dragging:
                        pyautogui.mouseUp(button='left')
                        is_dragging = False
                    
                    current_target = None
                    drag_origin_norm = None
                    drag_mouse_origin_pos = None
                    print(f"[Mouse] Drag ended")
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

            if action == "start":
                # Cancel any ongoing movement
                if move_task and not move_task.done():
                    move_task.cancel()
                    try:
                        await move_task
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

                # Apply linear sensitivity to map finger movement to mouse movement
                mouse_x = mouse_origin_pos[0]
                mouse_y = mouse_origin_pos[1]
                target_x = int(mouse_x + dx_norm * SENSITIVITY * screen_width)
                target_y = int(mouse_y + dy_norm * SENSITIVITY * screen_height)

                # Clamp to screen bounds (ensures we can always reach edges)
                target_x = max(0, min(screen_width - 1, target_x))
                target_y = max(0, min(screen_height - 1, target_y))

                # Cancel any ongoing movement
                if move_task and not move_task.done():
                    move_task.cancel()
                    try:
                        await move_task
                    except asyncio.CancelledError:
                        pass

                # Use pyautogui's built-in smooth movement with easing
                move_task = asyncio.create_task(
                    asyncio.to_thread(
                        pyautogui.moveTo,
                        target_x,
                        target_y,
                        duration=MOVE_DURATION,
                        tween=pyautogui.easeInOutQuad,
                    )
                )
                current_target = (target_x, target_y)

            elif action == "end":
                # Cancel any ongoing movement
                if move_task and not move_task.done():
                    move_task.cancel()
                    try:
                        await move_task
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
        # Clean up any ongoing movement
        if move_task and not move_task.done():
            move_task.cancel()
            try:
                await move_task
            except asyncio.CancelledError:
                pass
        # Release mouse button if still dragging
        if is_dragging:
            try:
                pyautogui.mouseUp(button='left')
            except:
                pass
        print(f"[Mouse] Connection finished: {peer}")


class DiscoveryHandler(BaseHTTPRequestHandler):
    """HTTP handler for service discovery."""
    
    def do_GET(self):
        if self.path == "/discover":
            local_ip = get_local_ip()
            response_data = json.dumps({
                "service": "pymouse",
                "ws_url": f"ws://{local_ip}:{PORT}",
                "port": PORT,
                "ip": local_ip,
            })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(response_data.encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass


def run_discovery_server() -> HTTPServer:
    """Run HTTP discovery server in a separate thread."""
    server = HTTPServer((HOST, DISCOVERY_PORT), DiscoveryHandler)
    local_ip = get_local_ip()
    print(f"[Discovery] HTTP discovery server at http://{local_ip}:{DISCOVERY_PORT}/discover")
    
    def serve():
        server.serve_forever()
    
    thread = Thread(target=serve, daemon=True)
    thread.start()
    return server


async def main() -> None:
    """
    Standalone server entrypoint for mouse control.
    """
    print(f"[Mouse] Listening on ws://{HOST}:{PORT}")
    
    # Register mDNS service
    zeroconf = None
    service_info = None
    try:
        zeroconf, service_info = register_mdns_service(PORT)
    except Exception as e:
        print(f"[mDNS] Warning: Failed to register mDNS service: {e}")
        print("[mDNS] Server will still work, but clients will need to know the IP address")
    
    # Start HTTP discovery server
    discovery_server = None
    try:
        discovery_server = run_discovery_server()
    except Exception as e:
        print(f"[Discovery] Warning: Failed to start HTTP discovery server: {e}")
    
    try:
        async with websockets.serve(handle_touch, HOST, PORT):
            await asyncio.Future()  # run forever
    finally:
        # Unregister mDNS service on shutdown
        if zeroconf and service_info:
            try:
                zeroconf.unregister_service(service_info)
                zeroconf.close()
                print("[mDNS] Service unregistered")
            except Exception as e:
                print(f"[mDNS] Error unregistering service: {e}")
        # Shutdown discovery server
        if discovery_server:
            try:
                discovery_server.shutdown()
            except Exception as e:
                print(f"[Discovery] Error shutting down discovery server: {e}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[Mouse] Server stopped by user")
