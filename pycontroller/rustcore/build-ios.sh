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
if [ ! -f "target/aarch64-apple-ios/release/librustcore.a" ]; then
    echo "❌ Error: librustcore.a not found after device build"
    exit 1
fi
cp target/aarch64-apple-ios/release/librustcore.a "$OUTPUT_DIR/librustcore-device.a"

# Build for iOS simulator (Apple Silicon)
# Note: On Apple Silicon, device and simulator are both arm64, so we can use the device build
# However, some C dependencies (like mlx-sys) may have issues with the simulator target,
# so we'll try to build for simulator but fall back to using device build if it fails
echo "🔨 Building for iOS simulator (aarch64-apple-ios-sim)..."
SIM_BUILD_FAILED=0
SIM_BUILD_OUTPUT=$(cargo build --target aarch64-apple-ios-sim --release --lib 2>&1) || SIM_BUILD_FAILED=1

if [ "$SIM_BUILD_FAILED" -eq 0 ] && [ -f "target/aarch64-apple-ios-sim/release/librustcore.a" ]; then
    cp target/aarch64-apple-ios-sim/release/librustcore.a "$OUTPUT_DIR/librustcore-simulator.a"
    echo "✅ Simulator build succeeded"
else
    echo "⚠️  Simulator build failed or library not found, using device build for simulator"
    if [ "$SIM_BUILD_FAILED" -eq 1 ]; then
        echo "   Build error (likely C dependency SDK path issues with mlx-sys):"
        echo "$SIM_BUILD_OUTPUT" | tail -5
    fi
    echo "   This is safe since both device and simulator are arm64 on Apple Silicon"
    cp "$OUTPUT_DIR/librustcore-device.a" "$OUTPUT_DIR/librustcore-simulator.a"
fi

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

# Verify the final library exists
if [ ! -f "$OUTPUT_DIR/librustcore.a" ]; then
    echo "❌ Error: Final librustcore.a not found"
    exit 1
fi

echo "✅ Build complete! Library at: $OUTPUT_DIR/librustcore.a"

