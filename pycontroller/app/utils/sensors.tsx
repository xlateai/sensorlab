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
 * Calculate trend (baseline) for each axis using linear regression on recent history.
 * This finds the "curvature" or drift and subtracts it to center around zero.
 */
function calculateTrend(data: Array<{ x: number; y: number; z: number; t: number }>): { x: number; y: number; z: number } {
  if (data.length < 2) return { x: 0, y: 0, z: 0 };
  
  // Use linear regression to find the trend line
  const n = data.length;
  const sumT = data.reduce((sum, d) => sum + d.t, 0);
  const sumT2 = data.reduce((sum, d) => sum + d.t * d.t, 0);
  const sumX = data.reduce((sum, d) => sum + d.x, 0);
  const sumY = data.reduce((sum, d) => sum + d.y, 0);
  const sumZ = data.reduce((sum, d) => sum + d.z, 0);
  const sumTX = data.reduce((sum, d) => sum + d.t * d.x, 0);
  const sumTY = data.reduce((sum, d) => sum + d.t * d.y, 0);
  const sumTZ = data.reduce((sum, d) => sum + d.t * d.z, 0);
  
  const denominator = n * sumT2 - sumT * sumT;
  if (Math.abs(denominator) < 1e-10) {
    // Fallback to simple mean if regression fails
    return {
      x: sumX / n,
      y: sumY / n,
      z: sumZ / n,
    };
  }
  
  // Linear regression: y = a + b*t
  // For the latest time point, calculate the trend value
  const latestT = data[data.length - 1].t;
  
  const slopeX = (n * sumTX - sumT * sumX) / denominator;
  const interceptX = (sumX - slopeX * sumT) / n;
  const trendX = interceptX + slopeX * latestT;
  
  const slopeY = (n * sumTY - sumT * sumY) / denominator;
  const interceptY = (sumY - slopeY * sumT) / n;
  const trendY = interceptY + slopeY * latestT;
  
  const slopeZ = (n * sumTZ - sumT * sumZ) / denominator;
  const interceptZ = (sumZ - slopeZ * sumT) / n;
  const trendZ = interceptZ + slopeZ * latestT;
  
  return { x: trendX, y: trendY, z: trendZ };
}

/**
 * Detrend: subtract the trend from the current value to center around zero.
 */
function detrend(
  vec: { x: number; y: number; z: number },
  trend: { x: number; y: number; z: number }
): { x: number; y: number; z: number } {
  return {
    x: vec.x - trend.x,
    y: vec.y - trend.y,
    z: vec.z - trend.z,
  };
}

/**
 * Normalize values to -1 to +1 range based on recent samples.
 * This keeps values centered at 0 by using a rolling window.
 */
function normalizeToRange(
  vec: { x: number; y: number; z: number },
  buffer: Array<{ x: number; y: number; z: number }>,
  windowSize: number = 16
): { x: number; y: number; z: number } {
  // Use last N samples for normalization window
  const window = buffer.slice(-windowSize);
  
  if (window.length === 0) return vec;

  // Find min/max for each axis in the window
  const xVals = window.map(d => d.x);
  const yVals = window.map(d => d.y);
  const zVals = window.map(d => d.z);
  
  const xMin = Math.min(...xVals);
  const xMax = Math.max(...xVals);
  const yMin = Math.min(...yVals);
  const yMax = Math.max(...yVals);
  const zMin = Math.min(...zVals);
  const zMax = Math.max(...zVals);
  
  // Calculate ranges
  const xRange = Math.max(0.001, xMax - xMin);
  const yRange = Math.max(0.001, yMax - yMin);
  const zRange = Math.max(0.001, zMax - zMin);
  
  // Normalize to -1 to +1: (value - center) / (range/2)
  // This centers around 0 and scales to ±1
  return {
    x: Math.max(-1, Math.min(1, (vec.x - (xMin + xMax) / 2) / (xRange / 2))),
    y: Math.max(-1, Math.min(1, (vec.y - (yMin + yMax) / 2) / (yRange / 2))),
    z: Math.max(-1, Math.min(1, (vec.z - (zMin + zMax) / 2) / (zRange / 2))),
  };
}

/**
 * Hook that provides both raw and stabilized (movement-robust) magnetometer readings.
 * 
 * The stabilized reading uses:
 * 1. Detrending: Removes linear drift/baseline using linear regression
 * 2. Normalization: Scales to -1 to +1 range based on recent window
 * 
 * @param updateInterval - Update interval in milliseconds (default: 24ms)
 * @param trendWindowSize - Number of samples to use for trend calculation (default: 16)
 * @param normalizationWindowSize - Number of samples to use for normalization (default: 16)
 * @param bufferSize - Maximum number of raw samples to keep in buffer (default: 128)
 * 
 * @returns Object containing:
 *   - raw: Current raw magnetometer reading
 *   - stabilized: Current stabilized magnetometer reading (detrended and normalized)
 *   - rawBuffer: Array of recent raw readings
 *   - stabilizedBuffer: Array of recent stabilized readings
 */
export function useStabilizedMagnetometer(
  updateInterval: number = 24,
  trendWindowSize: number = 16,
  normalizationWindowSize: number = 16,
  bufferSize: number = 128
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
  const detrendedBufferRef = useRef<Array<MagnetometerReading>>([]);
  const trendStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialize trend start time
    if (trendStartTimeRef.current === null) {
      trendStartTimeRef.current = Date.now();
    }

    const subscription = Magnetometer.addListener((data) => {
      const { x = 0, y = 0, z = 0 } = data;
      const now = Date.now();
      
      // Time relative to trend start (for trend calculation)
      const trendT = (now - (trendStartTimeRef.current || now)) / 1000;
      
      // Store raw data
      const rawReading: MagnetometerReading & { t: number } = { x, y, z, t: trendT };
      rawBufferRef.current.push(rawReading);
      // Keep last N samples of raw data
      if (rawBufferRef.current.length > bufferSize) {
        rawBufferRef.current.shift();
      }
      
      // Post-processing: Apply detrending and normalization for stabilized reading
      // Use last N samples for trend calculation
      const trendWindow = rawBufferRef.current.slice(-trendWindowSize);
      const trend = calculateTrend(trendWindow);
      const detrended = detrend({ x, y, z }, trend);
      
      // Update detrended buffer for normalization
      detrendedBufferRef.current.push(detrended);
      if (detrendedBufferRef.current.length > bufferSize) {
        detrendedBufferRef.current.shift();
      }
      
      // Normalize to -1 to +1 range based on last N detrended samples
      const normalized = normalizeToRange(detrended, detrendedBufferRef.current, normalizationWindowSize);
      
      // Update state
      setRaw({ x, y, z });
      setStabilized(normalized);
      setRawBuffer([...rawBufferRef.current]);
      setStabilizedBuffer([...detrendedBufferRef.current]);
    });

    Magnetometer.setUpdateInterval(updateInterval);

    return () => {
      subscription.remove();
      rawBufferRef.current = [];
      detrendedBufferRef.current = [];
      trendStartTimeRef.current = null;
    };
  }, [updateInterval, trendWindowSize, normalizationWindowSize, bufferSize]);

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
