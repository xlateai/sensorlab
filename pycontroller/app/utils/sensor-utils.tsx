export interface MagnetometerData {
  x: number;
  y: number;
  z: number;
}

/**
 * Normalizes a value to [0, 1] range based on min/max
 */
export function normalizeValue(val: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

/**
 * Calculates min/max values from a buffer of magnetometer readings
 */
export function calculateMinMax(buffer: MagnetometerData[]): {
  min: number;
  max: number;
} {
  if (buffer.length === 0) {
    return { min: 0, max: 1 };
  }
  
  // Calculate sum for each reading
  const sums = buffer.map(v => v.x + v.y + v.z);
  
  let min = sums[0];
  let max = sums[0];
  
  for (const sum of sums) {
    if (sum < min) min = sum;
    if (sum > max) max = sum;
  }
  
  return { min, max };
}

/**
 * Normalizes the sum of magnetometer values (x + y + z) to [0, 1] range
 * based on the min/max values in the buffer
 */
export function normalizeMagnetometerSum(
  buffer: MagnetometerData[],
  currentValue: MagnetometerData | null
): number {
  if (currentValue === null || buffer.length === 0) {
    return 0.5; // Default to middle value
  }
  
  const currentSum = currentValue.x + currentValue.y + currentValue.z;
  const { min, max } = calculateMinMax(buffer);
  
  return normalizeValue(currentSum, min, max);
}
