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
 * Calculates the average of magnetometer sum (x + y + z) over the buffer
 */
export function calculateAverageMagnetometerSum(buffer: MagnetometerData[]): number {
  if (buffer.length === 0) {
    return 0;
  }
  
  // Calculate sum for each reading and average them
  const sums = buffer.map(v => v.x + v.y + v.z);
  const total = sums.reduce((acc, sum) => acc + sum, 0);
  
  return total / buffer.length;
}

/**
 * Calculates the standard deviation of magnetometer sums in the buffer
 */
function calculateStandardDeviation(buffer: MagnetometerData[], average: number): number {
  if (buffer.length === 0) {
    return 1; // Default to avoid division by zero
  }
  
  const sums = buffer.map(v => v.x + v.y + v.z);
  const variance = sums.reduce((acc, sum) => acc + Math.pow(sum - average, 2), 0) / buffer.length;
  
  return Math.sqrt(variance);
}

/**
 * Gets the normalized value based on delta (difference) from buffer average
 * Returns a value that can be used for frequency control (0-1 range)
 */
export function getMagnetometerAverageNormalized(
  buffer: MagnetometerData[],
  currentValue: MagnetometerData | null
): number {
  if (currentValue === null || buffer.length === 0) {
    return 0.5; // Default to middle value
  }
  
  const currentSum = currentValue.x + currentValue.y + currentValue.z;
  const average = calculateAverageMagnetometerSum(buffer);
  
  // Calculate delta (difference from average)
  const delta = currentSum - average;
  
  // Calculate standard deviation to normalize the delta
  const stdDev = calculateStandardDeviation(buffer, average);
  
  if (stdDev === 0) {
    return 0.5; // If no variation, return middle value
  }
  
  // Normalize delta by standard deviation (using 2 std devs as the range)
  // This maps: -2*stdDev -> 0, 0 -> 0.5, +2*stdDev -> 1.0
  const normalizedDelta = delta / (2 * stdDev);
  
  // Map to 0-1 range using sigmoid-like function (tanh scaled and shifted)
  // tanh maps -inf to -1, 0 to 0, +inf to +1
  // We want: -2*stdDev -> 0, 0 -> 0.5, +2*stdDev -> 1.0
  // So: normalized = (tanh(normalizedDelta) + 1) / 2
  const normalized = (Math.tanh(normalizedDelta) + 1) / 2;
  
  return normalized;
}

/**
 * Gets the normalized value for a specific magnetometer axis using simple min/max normalization
 * Returns a value that can be used for frequency control (0-1 range)
 * No averaging or deltas - just direct normalization of the raw value
 */
export function getMagnetometerAxisNormalized(
  buffer: MagnetometerData[],
  currentValue: MagnetometerData | null,
  axis: 'x' | 'y' | 'z'
): number {
  if (currentValue === null || buffer.length === 0) {
    return 0.5; // Default to middle value
  }
  
  const currentAxisValue = currentValue[axis];
  
  // Find min and max of this axis in the buffer
  const values = buffer.map(v => v[axis]);
  let min = values[0];
  let max = values[0];
  
  for (const val of values) {
    if (val < min) min = val;
    if (val > max) max = val;
  }
  
  // If no variation, return middle value
  if (max === min) {
    return 0.5;
  }
  
  // Simple linear normalization: map current value from [min, max] to [0, 1]
  const normalized = (currentAxisValue - min) / (max - min);
  
  // Clamp to [0, 1] range
  return Math.max(0, Math.min(1, normalized));
}
