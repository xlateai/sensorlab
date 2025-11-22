export interface MagnetometerData {
  x: number;
  y: number;
  z: number;
}

interface RGBRange {
  rMin: number;
  rMax: number;
  gMin: number;
  gMax: number;
  bMin: number;
  bMax: number;
}

/**
 * Normalizes a value to [0, 1] range based on min/max
 */
function normalizeValue(val: number, min: number, max: number): number {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (val - min) / (max - min)));
}

/**
 * Calculates min/max values from a buffer of magnetometer readings
 */
function calculateMinMax(buffer: MagnetometerData[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} {
  if (buffer.length === 0) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1, minZ: 0, maxZ: 1 };
  }
  
  let minX = buffer[0].x, maxX = buffer[0].x;
  let minY = buffer[0].y, maxY = buffer[0].y;
  let minZ = buffer[0].z, maxZ = buffer[0].z;
  
  for (const v of buffer) {
    if (v.x < minX) minX = v.x;
    if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z;
    if (v.z > maxZ) maxZ = v.z;
  }
  
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Calculates RGB values from magnetometer data by:
 * 1. Normalizing the current value within the buffer's min/max range
 * 2. Mapping that normalized value to the selected color range [rangeMin, rangeMax]
 */
export function calculateColorFromMagnetometer(
  buffer: MagnetometerData[],
  currentValue: MagnetometerData | null,
  range: RGBRange
): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  
  if (currentValue !== null && buffer.length > 0) {
    // Calculate min/max from buffer
    const minMax = calculateMinMax(buffer);
    
    // Normalize current magnetometer values to [0, 1] within buffer range
    const rNorm = normalizeValue(currentValue.x, minMax.minX, minMax.maxX);
    const gNorm = normalizeValue(currentValue.y, minMax.minY, minMax.maxY);
    const bNorm = normalizeValue(currentValue.z, minMax.minZ, minMax.maxZ);
    
    // Map normalized values to selected color range [rangeMin, rangeMax]
    const rMapped = rNorm * (range.rMax - range.rMin) + range.rMin;
    const gMapped = gNorm * (range.gMax - range.gMin) + range.gMin;
    const bMapped = bNorm * (range.bMax - range.bMin) + range.bMin;
    
    // Convert to [0, 255] range
    r = Math.round(rMapped * 255);
    g = Math.round(gMapped * 255);
    b = Math.round(bMapped * 255);
  }
  
  return { r, g, b };
}

