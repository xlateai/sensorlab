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
 * Calculates RGB values from magnetometer data using variations within the selected range
 */
export function calculateColorFromMagnetometer(
  magnetometer: MagnetometerData | null,
  minMax: MinMax,
  range: RGBRange
): { r: number; g: number; b: number } {
  let r = 0, g = 0, b = 0;
  
  if (magnetometer !== null) {
    // Calculate center points of magnetometer ranges
    const centerX = (minMax.minX + minMax.maxX) / 2;
    const centerY = (minMax.minY + minMax.maxY) / 2;
    const centerZ = (minMax.minZ + minMax.maxZ) / 2;
    
    // Calculate range sizes for normalization
    const rangeX = minMax.maxX - minMax.minX;
    const rangeY = minMax.maxY - minMax.minY;
    const rangeZ = minMax.maxZ - minMax.minZ;
    
    // Calculate deviation from center, normalized to [-1, 1]
    const deviationX = rangeX !== 0 ? (magnetometer.x - centerX) / rangeX : 0;
    const deviationY = rangeY !== 0 ? (magnetometer.y - centerY) / rangeY : 0;
    const deviationZ = rangeZ !== 0 ? (magnetometer.z - centerZ) / rangeZ : 0;
    
    // Calculate center points of selected ranges
    const rangeCenterR = (range.rMin + range.rMax) / 2;
    const rangeCenterG = (range.gMin + range.gMax) / 2;
    const rangeCenterB = (range.bMin + range.bMax) / 2;
    
    // Calculate range sizes for variation
    const rangeSizeR = range.rMax - range.rMin;
    const rangeSizeG = range.gMax - range.gMin;
    const rangeSizeB = range.bMax - range.bMin;
    
    // Apply variations around center, constrained to selected range
    const rVaried = Math.max(range.rMin, Math.min(range.rMax, rangeCenterR + deviationX * rangeSizeR * 0.5));
    const gVaried = Math.max(range.gMin, Math.min(range.gMax, rangeCenterG + deviationY * rangeSizeG * 0.5));
    const bVaried = Math.max(range.bMin, Math.min(range.bMax, rangeCenterB + deviationZ * rangeSizeB * 0.5));
    
    // Convert to [0, 255] range
    r = Math.round(rVaried * 255);
    g = Math.round(gVaried * 255);
    b = Math.round(bVaried * 255);
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
