interface MagnetometerData {
  x: number;
  y: number;
  z: number;
}

interface MinMax {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
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
 * Calculates RGB values from magnetometer data by mapping to the selected range
 */
export function calculateColorFromMagnetometer(
  magnetometer: MagnetometerData | null,
  minMax: MinMax,
  range: RGBRange
): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  
  if (magnetometer !== null) {
    // Normalize magnetometer values to [0, 1]
    const rNorm = normalizeValue(magnetometer.x, minMax.minX, minMax.maxX);
    const gNorm = normalizeValue(magnetometer.y, minMax.minY, minMax.maxY);
    const bNorm = normalizeValue(magnetometer.z, minMax.minZ, minMax.maxZ);
    
    // Map normalized values to selected range [rangeMin, rangeMax]
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

/**
 * Blends current RGB values with previous values for smooth transitions
 */
export function blendRGB(
  current: { r: number; g: number; b: number },
  previous: [number, number, number],
  blendFactor: number = 0.2
): { r: number; g: number; b: number; rgbString: string } {
  const smoothR = Math.round(previous[0] * (1 - blendFactor) + current.r * blendFactor);
  const smoothG = Math.round(previous[1] * (1 - blendFactor) + current.g * blendFactor);
  const smoothB = Math.round(previous[2] * (1 - blendFactor) + current.b * blendFactor);
  
  return {
    r: smoothR,
    g: smoothG,
    b: smoothB,
    rgbString: `rgb(${smoothR},${smoothG},${smoothB})`,
  };
}
