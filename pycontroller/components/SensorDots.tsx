import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

interface SensorDotsProps {
  x: number;
  y: number;
  z: number;
  xLow?: number;
  xHigh?: number;
  yLow?: number;
  yHigh?: number;
  zLow?: number;
  zHigh?: number;
}

function getColor(value: number, axis: 'x' | 'y' | 'z', low: number, high: number) {
  // Helper to interpolate between two colors
  function lerp(a: number, b: number, t: number) {
    return Math.round(a + (b - a) * t);
  }

  // Color definitions
  const COLORS = {
    blue: { r: 0, g: 122, b: 255 },
    yellow: { r: 255, g: 204, b: 0 },
    green: { r: 52, g: 199, b: 89 },
    red: { r: 255, g: 59, b: 48 },
    gray: { r: 136, g: 136, b: 136 },
  };

  // Above high: axis color
  if (value > high) {
    if (axis === 'x') return COLORS.blue;
    if (axis === 'y') return COLORS.yellow;
    if (axis === 'z') return COLORS.green;
  }
  // Below low: red
  if (value < low) {
    return COLORS.red;
  }
  // Between low and high: fade between red and gray
  if (value > low && value < high) {
    // t = 0 at low (red), t = 1 at high (axis color)
    let t = (value - low) / (high - low);
    // Fade from red to gray in the middle
    if (t < 0.5) {
      // red to gray
      let t2 = t / 0.5;
      return {
        r: lerp(COLORS.red.r, COLORS.gray.r, t2),
        g: lerp(COLORS.red.g, COLORS.gray.g, t2),
        b: lerp(COLORS.red.b, COLORS.gray.b, t2),
      };
    } else {
      // gray to axis color
      let t2 = (t - 0.5) / 0.5;
      let axisColor = axis === 'x' ? COLORS.blue : axis === 'y' ? COLORS.yellow : COLORS.green;
      return {
        r: lerp(COLORS.gray.r, axisColor.r, t2),
        g: lerp(COLORS.gray.g, axisColor.g, t2),
        b: lerp(COLORS.gray.b, axisColor.b, t2),
      };
    }
  }
  // At high: axis color
  if (value === high) {
    if (axis === 'x') return COLORS.blue;
    if (axis === 'y') return COLORS.yellow;
    if (axis === 'z') return COLORS.green;
  }
  // At low: red
  return COLORS.red;
}

export default function SensorDots({ x, y, z, xLow = -1, xHigh = 1, yLow = -1, yHigh = 1, zLow = -2, zHigh = 0 }: SensorDotsProps) {
  const [colorX, setColorX] = useState({ r: 136, g: 136, b: 136 });
  const [colorY, setColorY] = useState({ r: 136, g: 136, b: 136 });
  const [colorZ, setColorZ] = useState({ r: 136, g: 136, b: 136 });

  useEffect(() => {
    setColorX(getColor(x, 'x', xLow, xHigh));
    setColorY(getColor(y, 'y', yLow, yHigh));
    setColorZ(getColor(z, 'z', zLow, zHigh));
  }, [x, y, z, xLow, xHigh, yLow, yHigh, zLow, zHigh]);

  return (
    <View style={{ marginTop: 32, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 32 }}>
      {/* X axis */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{x.toFixed(2)}</Text>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: `rgb(${colorX.r},${colorX.g},${colorX.b})`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 18, opacity: 0.7 }}>X</Text>
        </View>
      </View>
      {/* Y axis */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{y.toFixed(2)}</Text>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: `rgb(${colorY.r},${colorY.g},${colorY.b})`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 18, opacity: 0.7 }}>Y</Text>
        </View>
      </View>
      {/* Z axis */}
      <View style={{ alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{z.toFixed(2)}</Text>
        <View
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: `rgb(${colorZ.r},${colorZ.g},${colorZ.b})`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 18, opacity: 0.7 }}>Z</Text>
        </View>
      </View>
    </View>
  );
}
