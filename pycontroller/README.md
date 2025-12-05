# xlate sensorlab

A React Native application built with Expo, featuring custom native modules for advanced sensor processing and real-time data visualization.

## Overview

xlate sensorlab leverages Expo's development framework to deliver a cross-platform mobile application with deep native integrations. The project combines React Native's flexibility with custom native code written in Swift and Rust, enabling high-performance sensor data processing and visualization capabilities.

## Architecture

This project requires a **custom Expo development client** rather than the standard Expo Go app. This is necessary because we integrate custom native modules that aren't available in the standard Expo runtime:

- **Custom Swift modules** (`sensorlib`) provide iOS-specific sensor interfaces and native UI components
- **Custom Rust libraries** (`rustcore`) deliver high-performance computational routines compiled to native code

These native modules are compiled and linked directly into the development client, which is installed on your iOS device. This approach provides the performance benefits of native code while maintaining the developer experience of Expo's tooling.

### Repository Structure

```
pycontroller/
├── app/                    # React Native application code (Expo Router)
├── components/             # Reusable React components
├── sensorlib/              # Custom Expo module (Swift/TypeScript)
│   ├── ios/               # Swift implementation for iOS
│   ├── android/           # Kotlin implementation for Android
│   └── src/               # TypeScript interface definitions
├── rustcore/              # Rust library for native computations
│   ├── src/               # Rust source code
│   └── build-ios.sh      # iOS build script
└── ios/                   # Native iOS project configuration
```

## Development Setup

### Prerequisites

- Node.js and npm
- iOS development: Xcode and CocoaPods
- Rust toolchain (for building `rustcore`)
- An iOS device with Developer Mode enabled

### Initial Setup

1. Install dependencies:

   ```bash
   cd pycontroller
   npm install
   ```

2. Install iOS dependencies:

   ```bash
   cd ios
   pod install
   cd ..
   ```

3. Build Rust libraries (if needed):

   ```bash
   sh rustcore/build-ios.sh
   ```

### Running the Application

To launch the app on a connected iOS device:

```bash
cd pycontroller
npx expo run:ios --device
```

**Note:** This command requires:
- Your iOS device to be connected via USB
- Developer Mode to be enabled on your iPhone (Settings → Privacy & Security → Developer Mode)
- A custom development client to be installed on your device (built automatically on first run)

### Common Development Tasks

#### Rebuilding Native Dependencies

If you encounter issues with native modules, you may need to rebuild dependencies:

**iOS CocoaPods:**
```bash
cd pycontroller/ios
pod install
cd ..
```

**Rust Libraries:**
```bash
sh pycontroller/rustcore/build-ios.sh
```

#### Development Workflow

The standard development workflow:
1. Make changes to your code
2. The Expo development server will hot-reload changes automatically
3. For native code changes (Swift/Rust), rebuild the development client using `npx expo run:ios --device`

## Continuous Integration & Deployment

This project uses GitHub Actions for automated builds and releases. When a new GitHub release is created, the `ios.yml` workflow automatically:

1. Builds the iOS application
2. Submits the build to TestFlight for beta testing

This ensures that every tagged release is immediately available for testing through Apple's TestFlight distribution platform.

## Technology Stack

- **Expo** - React Native framework with development tooling
- **React Native** - Cross-platform mobile application framework
- **TypeScript** - Type-safe JavaScript for application logic
- **Swift** - Native iOS modules for sensor interfaces
- **Rust** - High-performance native computations
- **Expo Router** - File-based routing for navigation

## Learn More

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/)
- [Expo Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)
