import { useState, useEffect, useRef } from 'react';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';

export type Orientation = 'portrait' | 'landscape-left' | 'landscape-right';

interface OrientationState {
  orientation: Orientation;
  rotationDeg: number;
  isLandscape: boolean;
}

/**
 * Custom hook for precise 3D orientation detection using device motion
 * Uses Euler angles and 3D rotation mathematics for accurate detection
 */
export function useDeviceOrientation(isActive: boolean = true): OrientationState {
  const [state, setState] = useState<OrientationState>({
    orientation: 'portrait',
    rotationDeg: 0,
    isLandscape: false,
  });

  const lastOrientationRef = useRef<Orientation>('portrait');
  const smoothingRef = useRef<{ beta: number; gamma: number }>({ beta: 0, gamma: 0 });

  useEffect(() => {
    if (!isActive) {
      setState({
        orientation: 'portrait',
        rotationDeg: 0,
        isLandscape: false,
      });
      lastOrientationRef.current = 'portrait';
      return;
    }

    const subscription = DeviceMotion.addListener((data: DeviceMotionMeasurement) => {
      if (!data.rotation) return;

      const { alpha = 0, beta = 0, gamma = 0 } = data.rotation;

      // Convert to degrees
      const betaDeg = (beta * 180) / Math.PI;
      const gammaDeg = (gamma * 180) / Math.PI;
      const alphaDeg = (alpha * 180) / Math.PI;

      // Apply light smoothing for stability
      const smoothingFactor = 0.3;
      smoothingRef.current.beta = smoothingRef.current.beta * smoothingFactor + betaDeg * (1 - smoothingFactor);
      smoothingRef.current.gamma = smoothingRef.current.gamma * smoothingFactor + gammaDeg * (1 - smoothingFactor);

      const smoothedBeta = smoothingRef.current.beta;
      const smoothedGamma = smoothingRef.current.gamma;

      // Check if device is flat (face up or face down)
      // When flat, beta is close to ±90 and gamma is close to 0
      const isFlat = Math.abs(Math.abs(smoothedBeta) - 90) < 20 && Math.abs(smoothedGamma) < 30;
      
      // For landscape detection, we care about gamma (roll) when device is upright
      // When rotated to landscape:
      // - Landscape right: gamma ≈ 90 (device rotated clockwise)
      // - Landscape left: gamma ≈ -90 (device rotated counterclockwise)
      // - Portrait: gamma ≈ 0 (device upright)
      
      let targetRotation = 0;
      let isLandscape = false;
      let newOrientation: Orientation = 'portrait';

      // Use hysteresis thresholds
      const LANDSCAPE_ENTER_THRESHOLD = 50; // Enter landscape at 50 degrees
      const LANDSCAPE_EXIT_THRESHOLD = 30;  // Exit landscape at 30 degrees

      if (!isFlat) {
        // Device is not flat - check for landscape rotation
        const absGamma = Math.abs(smoothedGamma);
        
        if (lastOrientationRef.current === 'portrait') {
          // Currently in portrait - need high threshold to enter landscape
          if (absGamma > LANDSCAPE_ENTER_THRESHOLD) {
            isLandscape = true;
            if (smoothedGamma > 0) {
              newOrientation = 'landscape-right';
              targetRotation = -90; // Rotate browser -90 to match device
            } else {
              newOrientation = 'landscape-left';
              targetRotation = 90; // Rotate browser +90 to match device
            }
            lastOrientationRef.current = newOrientation;
          } else {
            // Stay in portrait
            targetRotation = 0;
            isLandscape = false;
            newOrientation = 'portrait';
          }
        } else {
          // Currently in landscape - need low threshold to exit (hysteresis)
          if (absGamma < LANDSCAPE_EXIT_THRESHOLD) {
            // Exit to portrait
            targetRotation = 0;
            isLandscape = false;
            newOrientation = 'portrait';
            lastOrientationRef.current = 'portrait';
          } else {
            // Stay in landscape, determine direction
            isLandscape = true;
            if (smoothedGamma > 0) {
              newOrientation = 'landscape-right';
              targetRotation = -90;
            } else {
              newOrientation = 'landscape-left';
              targetRotation = 90;
            }
            lastOrientationRef.current = newOrientation;
          }
        }
      } else {
        // Device is flat - keep current orientation or default to portrait
        if (lastOrientationRef.current === 'portrait') {
          targetRotation = 0;
          isLandscape = false;
          newOrientation = 'portrait';
        } else {
          // Keep landscape orientation when flat
          newOrientation = lastOrientationRef.current;
          isLandscape = true;
          targetRotation = newOrientation === 'landscape-right' ? -90 : 90;
        }
      }
      
      // Always update state for responsive rotation
      setState({
        orientation: lastOrientationRef.current,
        rotationDeg: targetRotation,
        isLandscape,
      });
    });

    // Very fast update interval for maximum responsiveness
    DeviceMotion.setUpdateInterval(16); // ~60Hz updates for smooth, responsive detection

    return () => {
      subscription?.remove();
    };
  }, [isActive]);

  return state;
}
