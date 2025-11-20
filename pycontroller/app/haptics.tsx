import { requireNativeModule } from 'expo-modules-core';

export type HapticCurvePoint = {
  time: number;
  intensity?: number;
  sharpness?: number;
};

export type HapticPatternRequest = {
  type: 'continuous' | 'transient';
  intensity?: number;
  sharpness?: number;
  duration?: number;
  curve?: HapticCurvePoint[];
};

import * as ExpoHaptics from 'expo-haptics';

let Sensorlib: any = null;
try {
  Sensorlib = requireNativeModule('Sensorlib');
} catch {
  Sensorlib = null;
}


export async function playContinuousHaptic(intensity: number, sharpness: number, duration: number) {
  if (!Sensorlib || typeof Sensorlib.playHaptic !== 'function') {
    await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
    return;
  }

  const pattern: HapticPatternRequest = {
    type: 'continuous',
    intensity,
    sharpness,
    duration
  };
}

export async function playLongHaptic() {
  if (!Sensorlib || typeof Sensorlib.playHaptic !== 'function') {
    // ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
    return;
  }
  // Example: fade in, pulse, fade out
  const pattern: HapticPatternRequest = {
    type: 'continuous',
    intensity: 1.0,
    sharpness: 0.5,
    duration: 0.7,
    curve: [
      { time: 0, intensity: 0.0 },
      { time: 0.1, intensity: 1.0 },
      { time: 0.5, intensity: 0.7 },
      { time: 0.7, intensity: 0.0 }
    ]
  };
  await Sensorlib.playHaptic(pattern);
}
