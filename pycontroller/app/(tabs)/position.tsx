
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function PositionScreen() {
  const [xyz, setXYZ] = useState<{x: number, y: number, z: number} | null>(null);

  useEffect(() => {
    const sub = DeviceMotion.addListener(data => {
      const accGrav = data.accelerationIncludingGravity;
      setXYZ({
        x: accGrav?.x ?? 0,
        y: accGrav?.y ?? 0,
        z: accGrav?.z ?? 0,
      });
    });
    DeviceMotion.setUpdateInterval(50);
    return () => {
      sub && sub.remove();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>x: {xyz ? xyz.x.toFixed(4) : '-'}</Text>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>y: {xyz ? xyz.y.toFixed(4) : '-'}</Text>
      <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>z: {xyz ? xyz.z.toFixed(4) : '-'}</Text>
    </View>
  );
}
