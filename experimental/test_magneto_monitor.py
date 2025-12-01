"""
Live inference script that loads the trained magnetometer monitor model
and predicts 0/1 for each incoming sample from the WebSocket.

Usage (from repo root):
    python -m experimental.test_magneto_monitor \
        --model-path experimental/magneto_monitor.pt
"""

from __future__ import annotations

import argparse
from collections import deque
from pathlib import Path

import numpy as np
import torch
from torch import nn

from magneto import magnetometer_iterator


THIS_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = THIS_DIR / "magneto_monitor.pt"


class MagnetoLSTM(nn.Module):
    """LSTM-based binary classifier (must match training architecture)."""

    def __init__(
        self,
        input_dim: int = 3,
        hidden_dim: int = 32,
        num_layers: int = 1,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=input_dim,
            hidden_size=hidden_dim,
            num_layers=num_layers,
            batch_first=True,
            dropout=dropout if num_layers > 1 else 0.0,
        )
        self.head = nn.Sequential(
            nn.LayerNorm(hidden_dim),
            nn.Linear(hidden_dim, 1),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (batch, seq_len, input_dim)
        out, _ = self.lstm(x)
        # Take last timestep
        last = out[:, -1, :]  # (batch, hidden_dim)
        logits = self.head(last).squeeze(-1)  # (batch,)
        return logits


def load_model(model_path: Path, device: str = "cpu") -> tuple[MagnetoLSTM, dict]:
    """Load the trained model and its metadata."""
    checkpoint = torch.load(model_path, map_location=device)
    
    model = MagnetoLSTM(
        input_dim=checkpoint["input_dim"],
        hidden_dim=checkpoint["hidden_dim"],
        num_layers=checkpoint["num_layers"],
        dropout=checkpoint["dropout"],
    )
    model.load_state_dict(checkpoint["state_dict"])
    model.eval()
    model.to(device)
    
    metadata = {
        "seq_len": checkpoint["seq_len"],
        "feature_mean": checkpoint["feature_mean"],
        "feature_std": checkpoint["feature_std"],
    }
    
    return model, metadata


async def run_inference(model_path: Path = DEFAULT_MODEL_PATH) -> None:
    """Run live inference on incoming magnetometer samples."""
    device = "cuda" if torch.cuda.is_available() else "cpu"
    
    print(f"Loading model from {model_path}...")
    model, metadata = load_model(model_path, device)
    seq_len = metadata["seq_len"]
    feature_mean = torch.from_numpy(metadata["feature_mean"]).to(device)
    feature_std = torch.from_numpy(metadata["feature_std"]).to(device)
    
    print(f"Model loaded. seq_len={seq_len}, device={device}")
    print("Waiting for magnetometer samples...")
    print("Predictions (0 or 1):")
    
    # Maintain a sliding window buffer
    buffer = deque(maxlen=seq_len)
    
    async for x, y, z in magnetometer_iterator():
        # Add new sample to buffer
        buffer.append([x, y, z])
        
        # Only predict once we have enough samples
        if len(buffer) < seq_len:
            continue
        
        # Convert buffer to tensor and normalize
        seq = torch.tensor(list(buffer), dtype=torch.float32).unsqueeze(0).to(device)
        # Normalize: (seq - mean) / std
        seq_norm = (seq - feature_mean) / feature_std
        
        # Run inference
        with torch.no_grad():
            logits = model(seq_norm)
            prob = torch.sigmoid(logits).item()
            pred = 1 if prob > 0.5 else 0
        
        # Print prediction
        print(pred)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run live inference on magnetometer samples."
    )
    parser.add_argument(
        "--model-path",
        type=str,
        default=str(DEFAULT_MODEL_PATH),
        help="Path to saved model checkpoint.",
    )
    
    args = parser.parse_args()
    model_path = Path(args.model_path)
    
    if not model_path.exists():
        print(f"Error: Model file not found at {model_path}")
        return
    
    import asyncio
    try:
        asyncio.run(run_inference(model_path))
    except KeyboardInterrupt:
        print("\n[Monitor] Stopped by user")


if __name__ == "__main__":
    main()

