

import React, { useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function PositionScreen() {
  const [accel, setAccel] = useState<number | null>(null);
  const [pos, setPos] = useState<number>(0);
  const prevPosRef = useRef<number | null>(null);
  const [delta, setDelta] = useState<number>(0);
  const [displayColor, setDisplayColor] = useState<{ r: number; g: number; b: number }>({ r: 136, g: 136, b: 136 });
  // Removed averaging buffer

  useFocusEffect(
    React.useCallback(() => {
      const sub = DeviceMotion.addListener(data => {
        const a = data.acceleration;
        const currentAccel = a?.z ?? 0;
        setAccel(currentAccel);
        setPos(prev => {
          const newPos = prev + currentAccel;
          // Calculate delta (rate of change)
          if (prevPosRef.current !== null) {
            setDelta(newPos - prevPosRef.current);
          } else {
            setDelta(0);
          }
          prevPosRef.current = newPos;
          return newPos;
        });
      });
      DeviceMotion.setUpdateInterval(24);
      return () => {
        sub && sub.remove();
      };
    }, [])
  );

  // Smooth color animation
  React.useEffect(() => {
    // Clamp delta to [-1, 1] for color blending
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const normDelta = clamp(delta / 5, -1, 1);
    const green = { r: 57, g: 255, b: 20 };
    const red = { r: 229, g: 57, b: 53 };
    const gray = { r: 136, g: 136, b: 136 };
    let targetColor;
    if (Math.abs(normDelta) < 0.05) {
      targetColor = gray;
    } else if (normDelta > 0) {
      targetColor = {
        r: Math.round(gray.r + (green.r - gray.r) * normDelta),
        g: Math.round(gray.g + (green.g - gray.g) * normDelta),
        b: Math.round(gray.b + (green.b - gray.b) * normDelta),
      };
    } else {
      targetColor = {
        r: Math.round(gray.r + (red.r - gray.r) * -normDelta),
        g: Math.round(gray.g + (red.g - gray.g) * -normDelta),
        b: Math.round(gray.b + (red.b - gray.b) * -normDelta),
      };
    }
    // Animate towards targetColor
    const step = 0.5; // smoothing factor (higher = faster)
    setDisplayColor(prev => ({
      r: Math.round(prev.r + (targetColor.r - prev.r) * step),
      g: Math.round(prev.g + (targetColor.g - prev.g) * step),
      b: Math.round(prev.b + (targetColor.b - prev.b) * step),
    }));
  }, [delta]);


  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      {/* Smoothly blended color circle based on z rate of change */}
      <View
        style={{
          width: 120,
          height: 120,
          borderRadius: 60,
          backgroundColor: `rgb(${displayColor.r},${displayColor.g},${displayColor.b})`,
        }}
      />
    </View>
  );
}
