import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

interface SensorDotsProps {
  x: number;
  y: number;
  z: number;
}

function getColor(value: number, axis: 'x' | 'y' | 'z') {
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

  // >1: axis color
  if (value > 1) {
    if (axis === 'x') return COLORS.blue;
    if (axis === 'y') return COLORS.yellow;
    if (axis === 'z') return COLORS.green;
  }
  // < -1: red
  if (value < -1) {
    return COLORS.red;
  }
  // Between -1 and 1 (exclusive): fade between red and gray
  if (value > -1 && value < 1) {
    // t = 0 at value = -1 (red), t = 1 at value = 0 (gray), t = 0 at value = 1 (red)
    let t;
    if (value < 0) {
      t = (value + 1) / 1; // -1 to 0
      return {
        r: lerp(COLORS.red.r, COLORS.gray.r, t),
        g: lerp(COLORS.red.g, COLORS.gray.g, t),
        b: lerp(COLORS.red.b, COLORS.gray.b, t),
      };
    } else {
      t = 1 - value / 1; // 0 to 1
      return {
        r: lerp(COLORS.gray.r, COLORS.red.r, 1 - t),
        g: lerp(COLORS.gray.g, COLORS.red.g, 1 - t),
        b: lerp(COLORS.gray.b, COLORS.red.b, 1 - t),
      };
    }
  }
  // >=1: axis color
  if (value >= 1) {
    if (axis === 'x') return COLORS.blue;
    if (axis === 'y') return COLORS.yellow;
    if (axis === 'z') return COLORS.green;
  }
  // <=-1: red
  return COLORS.red;
}

export default function SensorDots({ x, y, z }: SensorDotsProps) {
  const [colorX, setColorX] = useState({ r: 136, g: 136, b: 136 });
  const [colorY, setColorY] = useState({ r: 136, g: 136, b: 136 });
  const [colorZ, setColorZ] = useState({ r: 136, g: 136, b: 136 });

  useEffect(() => {
    setColorX(getColor(x, 'x'));
    setColorY(getColor(y, 'y'));
    setColorZ(getColor(z, 'z'));
  }, [x, y, z]);

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
