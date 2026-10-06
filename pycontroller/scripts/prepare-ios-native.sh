#!/usr/bin/env bash
set -euo pipefail

rustup target add aarch64-apple-ios
rustup component add llvm-tools
cargo build --locked --manifest-path rustcore/Cargo.toml --target aarch64-apple-ios --release --lib

mkdir -p sensorlib/ios/libs
cp rustcore/target/aarch64-apple-ios/release/librustcore.a sensorlib/ios/libs/librustcore.a

rust_host="$(rustc -vV | sed -n 's/^host: //p')"
llvm_nm="$(rustc --print sysroot)/lib/rustlib/$rust_host/bin/llvm-nm"
"$llvm_nm" --defined-only sensorlib/ios/libs/librustcore.a | grep -q rustcore_convolution
