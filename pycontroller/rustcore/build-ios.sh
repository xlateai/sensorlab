#!/bin/bash
set -e

echo "🦀 Building Rust library for iOS..."

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Install iOS targets if not already installed
echo "📦 Installing iOS targets..."
rustup target add aarch64-apple-ios
rustup target add aarch64-apple-ios-sim
rustup target add x86_64-apple-ios || true  # Optional for Intel simulators

# Create output directory
OUTPUT_DIR="$SCRIPT_DIR/../sensorlib/ios/libs"
mkdir -p "$OUTPUT_DIR"

# Build for iOS device (arm64)
echo "🔨 Building for iOS device (aarch64-apple-ios)..."
cargo build --target aarch64-apple-ios --release --lib
cp target/aarch64-apple-ios/release/librustcore.a "$OUTPUT_DIR/librustcore-device.a"

# Build for iOS simulator (Apple Silicon) - same arch as device, so we'll use device version
echo "🔨 Building for iOS simulator (aarch64-apple-ios-sim)..."
cargo build --target aarch64-apple-ios-sim --release --lib
cp target/aarch64-apple-ios-sim/release/librustcore.a "$OUTPUT_DIR/librustcore-simulator.a"

# Check architectures
DEVICE_ARCH=$(lipo -info "$OUTPUT_DIR/librustcore-device.a" | awk '{print $NF}')
SIM_ARCH=$(lipo -info "$OUTPUT_DIR/librustcore-simulator.a" | awk '{print $NF}')

echo "Device library arch: $DEVICE_ARCH"
echo "Simulator library arch: $SIM_ARCH"

# Create universal library using lipo (only if architectures differ)
if [ "$DEVICE_ARCH" != "$SIM_ARCH" ]; then
    echo "🔗 Creating universal library..."
    lipo -create \
      "$OUTPUT_DIR/librustcore-device.a" \
      "$OUTPUT_DIR/librustcore-simulator.a" \
      -output "$OUTPUT_DIR/librustcore.a"
else
    echo "📦 Architectures are the same, using device library as universal..."
    cp "$OUTPUT_DIR/librustcore-device.a" "$OUTPUT_DIR/librustcore.a"
fi

echo "✅ Build complete! Library at: $OUTPUT_DIR/librustcore.a"

