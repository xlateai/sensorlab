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
"""

import asyncio
import json
from typing import Any, Dict

import websockets


HOST = "0.0.0.0"
PORT = 8765


async def handle_magneto(websocket) -> None:
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
      t = data.get("t")

      # print(f"[Magneto] sample t={t}  x={x}  y={y}  z={z}")
      print(z)

  except websockets.ConnectionClosedOK:
    print(f"[Magneto] Client closed: {peer}")
  except websockets.ConnectionClosedError:
    print(f"[Magneto] Client error/closed: {peer}")
  except Exception as exc:
    print(f"[Magneto] Error: {exc}")
  finally:
    print(f"[Magneto] Connection finished: {peer}")


async def main() -> None:
  print(f"[Magneto] Listening on ws://{HOST}:{PORT}")
  async with websockets.serve(handle_magneto, HOST, PORT):
    await asyncio.Future()  # run forever


if __name__ == "__main__":
  try:
    asyncio.run(main())
  except KeyboardInterrupt:
    print("\n[Magneto] Server stopped by user")

