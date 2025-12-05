# xlate sensorlab

Expo app with custom native modules for sensor processing. Uses a custom dev client (not Expo Go) because we integrate Swift and Rust code.

## Quick Start

**Prerequisites:**
- ✅ Node.js, Xcode, CocoaPods
- ✅ Rust toolchain
- ✅ iOS device with Developer Mode enabled

**Setup:**

```bash
cd pycontroller
npm install
cd ios && pod install && cd ..
sh rustcore/build-ios.sh  # Required - builds Rust libs
```

**Run on device:**

```bash
cd pycontroller
npx expo run:ios --device
```

Requires your iPhone connected via USB with Developer Mode enabled. The custom dev client installs automatically on first run.

## Project Structure

```
pycontroller/
├── app/              # Expo Router app code
├── components/       # React components
├── sensorlib/        # Custom Expo module (Swift/TypeScript)
│   ├── ios/         # Swift implementation
│   └── src/         # TypeScript interfaces
├── rustcore/        # Rust library (required)
│   └── build-ios.sh
└── ios/             # Native iOS config
```

## Common Tasks

**Rebuild CocoaPods:**
```bash
cd pycontroller/ios && pod install
```

**Rebuild Rust libs:**
```bash
sh pycontroller/rustcore/build-ios.sh
```

**Native code changes:** Rebuild the dev client with `npx expo run:ios --device`.

## CI/CD

New GitHub releases trigger `ios.yml` to automatically build and submit to TestFlight.
