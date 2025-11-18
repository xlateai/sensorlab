

import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function PositionScreen() {
  const [accel, setAccel] = useState<{x: number, y: number, z: number} | null>(null);
  const [pos, setPos] = useState<{x: number, y: number, z: number}>({x: 0, y: 0, z: 0});
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    const sub = DeviceMotion.addListener(data => {
      const a = data.acceleration;
      setAccel({
        x: a?.x ?? 0,
        y: a?.y ?? 0,
        z: a?.z ?? 0,
      });
      // Estimate position by rounding accel and accumulating
      setPos(prev => ({
        x: prev.x + Math.round(a?.x ?? 0),
        y: prev.y + Math.round(a?.y ?? 0),
        z: prev.z + Math.round(a?.z ?? 0),
      }));
    });
    DeviceMotion.setUpdateInterval(50);
    return () => {
      sub && sub.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>x: {pos.x}</Text>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>y: {pos.y}</Text>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>z: {pos.z}</Text>
      <View style={{ marginTop: 24 }}>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          accel x: {accel ? accel.x.toFixed(4) : '-'}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          accel y: {accel ? accel.y.toFixed(4) : '-'}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          accel z: {accel ? accel.z.toFixed(4) : '-'}
        </Text>
      </View>
      <View style={{ marginTop: 32 }}>
        <Text
          onPress={() => setPos({ x: 0, y: 0, z: 0 })}
          style={{
            backgroundColor: '#222',
            color: '#fff',
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 16,
            fontWeight: 'bold',
            fontSize: 18,
            textAlign: 'center',
            overflow: 'hidden',
          }}
        >
          Set Origin
        </Text>
      </View>
    </View>
  );
}
