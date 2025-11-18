

import React, { useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function PositionScreen() {
  const [accel, setAccel] = useState<number | null>(null);
  const [pos, setPos] = useState<number>(0);
  const prevPosRef = useRef<number | null>(null);
  const [delta, setDelta] = useState<number>(0);
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


  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      {/* Blended color circle based on z rate of change */}
      {(() => {
        // Clamp delta to [-1, 1] for color blending
        const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
        const normDelta = clamp(delta / 5, -1, 1); // scale factor for sensitivity
        // Colors: green #39ff14, red #e53935, gray #888
        // Blend between green and red, pass through gray at zero
        // We'll interpolate RGB
        const green = { r: 57, g: 255, b: 20 };
        const red = { r: 229, g: 57, b: 53 };
        const gray = { r: 136, g: 136, b: 136 };

        let color;
        if (Math.abs(normDelta) < 0.05) {
          // Near zero, use gray
          color = gray;
        } else if (normDelta > 0) {
          // Blend gray to green
          color = {
            r: Math.round(gray.r + (green.r - gray.r) * normDelta),
            g: Math.round(gray.g + (green.g - gray.g) * normDelta),
            b: Math.round(gray.b + (green.b - gray.b) * normDelta),
          };
        } else {
          // Blend gray to red
          color = {
            r: Math.round(gray.r + (red.r - gray.r) * -normDelta),
            g: Math.round(gray.g + (red.g - gray.g) * -normDelta),
            b: Math.round(gray.b + (red.b - gray.b) * -normDelta),
          };
        }
        const colorStr = `rgb(${color.r},${color.g},${color.b})`;
        return (
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: colorStr,
            }}
          />
        );
      })()}
    </View>
  );
}
