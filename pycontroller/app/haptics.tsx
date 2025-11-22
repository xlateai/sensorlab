/**
 * Play a continuous haptic pattern from a stream of values.
 * @param stream An async iterable yielding { intensity, sharpness, duration } objects.
 */
export async function playContinuousHaptic(
  stream: AsyncIterable<{ intensity: number; sharpness: number; duration: number }>
) {
  if (!Sensorlib || typeof Sensorlib.playHaptic !== 'function') {
    return;
  }
  // Native: play each value as a short continuous haptic
  for await (const { intensity, sharpness, duration } of stream) {
    const pattern: HapticPatternRequest = {
      type: 'continuous',
      intensity,
      sharpness,
      duration,
      curve: [
        { time: 0, intensity, sharpness },
        { time: duration, intensity, sharpness }
      ]
    };
    await Sensorlib.playHaptic(pattern);
  }
}
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


export async function playSimpleHaptic(intensity: number, sharpness: number, duration: number) {
  if (!Sensorlib || typeof Sensorlib.playHaptic !== 'function') {
    await ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
    return;
  }
  const pattern: HapticPatternRequest = {
    type: 'continuous',
    intensity,
    sharpness,
    duration,
    curve: [
      { time: 0, intensity },
      { time: duration, intensity }
    ]
  };
  await Sensorlib.playHaptic(pattern);
}

export async function playChimeHaptic() {
  if (!Sensorlib || typeof Sensorlib.playHaptic !== 'function') {
    // ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
    return;
  }
  // Example: fade in, pulse, fade out
  const pattern: HapticPatternRequest = {
    type: 'continuous',
    // intensity: 1.0,
    // sharpness: 1.0,
    duration: 0.35,
    curve: [
      { time: 0.0, intensity: 0.0, sharpness: 0.0 },
      { time: 0.3, intensity: 0.8, sharpness: 0.3 },
      // { time: 0.7, intensity: 0.0, sharpness: 0.0 }
    ]
  };
  await Sensorlib.playHaptic(pattern);
}

export async function playReverseChime() {
  if (!Sensorlib || typeof Sensorlib.playHaptic !== 'function') {
    // ExpoHaptics.impactAsync(ExpoHaptics.ImpactFeedbackStyle.Medium);
    return;
  }
  // Reverse of playChimeHaptic: fade out instead of fade in
  const pattern: HapticPatternRequest = {
    type: 'continuous',
    duration: 0.3,
    curve: [
      { time: 0.0, intensity: 0.8, sharpness: 0.5 },
      { time: 0.3, intensity: 0.0, sharpness: 0.0 },
    ]
  };
  await Sensorlib.playHaptic(pattern);
}
