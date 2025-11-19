import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';

interface SensorDotsProps {
  x: number;
  y: number;
  z: number;
}

function getColor(value: number, axis: 'x' | 'y' | 'z') {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const norm = clamp(value / 5, -1, 1);
  const blue = { r: 57, g: 136, b: 255 };
  const red = { r: 229, g: 57, b: 53 };
  const gray = { r: 136, g: 136, b: 136 };
  const orange = { r: 255, g: 170, b: 57 };
  const green = { r: 57, g: 255, b: 20 };
  let target;
  if (Math.abs(norm) < 0.05) {
    target = gray;
  } else if (norm > 0) {
    if (axis === 'x') target = blue;
    else if (axis === 'y') target = orange;
    else target = green;
  } else {
    target = red;
  }
  // Linear blend between gray and target
  const blend = Math.abs(norm);
  return {
    r: Math.round(gray.r + (target.r - gray.r) * blend),
    g: Math.round(gray.g + (target.g - gray.g) * blend),
    b: Math.round(gray.b + (target.b - gray.b) * blend),
  };
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
    <View style={{ marginTop: 32, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
      {/* X axis */}
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: `rgb(${colorX.r},${colorX.g},${colorX.b})`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, opacity: 0.7 }}>X</Text>
        </View>
      </View>
      {/* Y axis */}
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: `rgb(${colorY.r},${colorY.g},${colorY.b})`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, opacity: 0.7 }}>Y</Text>
        </View>
      </View>
      {/* Z axis */}
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            width: 60,
            height: 60,
            borderRadius: 30,
            backgroundColor: `rgb(${colorZ.r},${colorZ.g},${colorZ.b})`,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, opacity: 0.7 }}>Z</Text>
        </View>
      </View>
    </View>
  );
}
