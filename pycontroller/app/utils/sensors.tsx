import { useRef, useState, useEffect } from 'react';
import { Magnetometer } from 'expo-sensors';

export interface MagnetometerReading {
  x: number;
  y: number;
  z: number;
}

export interface StabilizedMagnetometerData {
  raw: MagnetometerReading;
  stabilized: MagnetometerReading;
}

/**
 * Calculate the euclidean norm (magnitude) of a 3D vector.
 * Returns sqrt(x^2 + y^2 + z^2) as a scalar value >= 0.
 */
function euclideanNorm(vec: { x: number; y: number; z: number }): number {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z);
}

/**
 * Hook that provides both raw and stabilized magnetometer readings.
 * 
 * The stabilized reading is the euclidean norm (magnitude) of the 3D vector,
 * returned as a scalar value for all three x, y, z components.
 * 
 * @param updateInterval - Update interval in milliseconds (default: 24ms)
 * @param bufferSize - Maximum number of raw samples to keep in buffer (default: 128)
 * @param enabled - Whether the sensor listener should be active (default: true)
 * 
 * @returns Object containing:
 *   - raw: Current raw magnetometer reading
 *   - stabilized: Current stabilized magnetometer reading (euclidean norm for all axes)
 *   - rawBuffer: Array of recent raw readings
 *   - stabilizedBuffer: Array of recent stabilized readings
 */
export function useStabilizedMagnetometer(
  updateInterval: number = 24,
  bufferSize: number = 128,
  enabled: boolean = true
): {
  raw: MagnetometerReading;
  stabilized: MagnetometerReading;
  rawBuffer: Array<MagnetometerReading & { t: number }>;
  stabilizedBuffer: Array<MagnetometerReading>;
} {
  const [raw, setRaw] = useState<MagnetometerReading>({ x: 0, y: 0, z: 0 });
  const [stabilized, setStabilized] = useState<MagnetometerReading>({ x: 0, y: 0, z: 0 });
  const [rawBuffer, setRawBuffer] = useState<Array<MagnetometerReading & { t: number }>>([]);
  const [stabilizedBuffer, setStabilizedBuffer] = useState<Array<MagnetometerReading>>([]);
  
  // Refs for synchronous processing
  const rawBufferRef = useRef<Array<MagnetometerReading & { t: number }>>([]);
  const stabilizedBufferRef = useRef<Array<MagnetometerReading>>([]);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Clear state when disabled
      setRaw({ x: 0, y: 0, z: 0 });
      setStabilized({ x: 0, y: 0, z: 0 });
      setRawBuffer([]);
      setStabilizedBuffer([]);
      rawBufferRef.current = [];
      stabilizedBufferRef.current = [];
      startTimeRef.current = null;
      return;
    }

    // Initialize start time
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }

    const subscription = Magnetometer.addListener((data) => {
      const { x = 0, y = 0, z = 0 } = data;
      const now = Date.now();
      
      // Time relative to start (for buffer timestamps)
      const t = (now - (startTimeRef.current || now)) / 1000;
      
      // Store raw data
      const rawReading: MagnetometerReading & { t: number } = { x, y, z, t };
      rawBufferRef.current.push(rawReading);
      // Keep last N samples of raw data
      if (rawBufferRef.current.length > bufferSize) {
        rawBufferRef.current.shift();
      }
      
      // Calculate euclidean norm (magnitude) of the vector
      const magnitude = euclideanNorm({ x, y, z });
      
      // Return the magnitude for all three axes
      const stabilizedReading: MagnetometerReading = {
        x: magnitude,
        y: magnitude,
        z: magnitude,
      };
      
      // Update stabilized buffer
      stabilizedBufferRef.current.push(stabilizedReading);
      if (stabilizedBufferRef.current.length > bufferSize) {
        stabilizedBufferRef.current.shift();
      }
      
      // Update state
      setRaw({ x, y, z });
      setStabilized(stabilizedReading);
      setRawBuffer([...rawBufferRef.current]);
      setStabilizedBuffer([...stabilizedBufferRef.current]);
    });

    Magnetometer.setUpdateInterval(updateInterval);

    return () => {
      subscription.remove();
      rawBufferRef.current = [];
      stabilizedBufferRef.current = [];
      startTimeRef.current = null;
    };
  }, [updateInterval, bufferSize, enabled]);

  return {
    raw,
    stabilized,
    rawBuffer,
    stabilizedBuffer,
  };
}

/**
 * Simple hook that provides only raw magnetometer readings (no transformations).
 * 
 * @param updateInterval - Update interval in milliseconds (default: 24ms)
 * @param bufferSize - Maximum number of samples to keep in buffer (default: 128)
 * 
 * @returns Object containing:
 *   - reading: Current raw magnetometer reading
 *   - buffer: Array of recent raw readings
 */
export function useRawMagnetometer(
  updateInterval: number = 24,
  bufferSize: number = 128
): {
  reading: MagnetometerReading;
  buffer: Array<MagnetometerReading>;
} {
  const [reading, setReading] = useState<MagnetometerReading>({ x: 0, y: 0, z: 0 });
  const [buffer, setBuffer] = useState<Array<MagnetometerReading>>([]);

  useEffect(() => {
    const subscription = Magnetometer.addListener((data) => {
      const { x = 0, y = 0, z = 0 } = data;
      const rawReading: MagnetometerReading = { x, y, z };
      
      setReading(rawReading);
      setBuffer((prev) => {
        const next = [...prev, rawReading];
        return next.length > bufferSize ? next.slice(next.length - bufferSize) : next;
      });
    });

    Magnetometer.setUpdateInterval(updateInterval);

    return () => {
      subscription.remove();
    };
  }, [updateInterval, bufferSize]);

  return {
    reading,
    buffer,
  };
}


