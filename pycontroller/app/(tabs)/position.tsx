

import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function PositionScreen() {
  const [accel, setAccel] = useState<{x: number, y: number, z: number} | null>(null);
  const [rotAdjAccel, setRotAdjAccel] = useState<{x: number, y: number, z: number} | null>(null);
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

      // Rotation adjustment (normalize accel to world axes)
      // DeviceMotion rotation: alpha (z), beta (x), gamma (y) in radians
      // We'll apply ZYX rotation order (yaw, pitch, roll)
      const rot = data.rotation;
      if (a && rot) {
        const ax = a.x ?? 0;
        const ay = a.y ?? 0;
        const az = a.z ?? 0;
        const alpha = rot.alpha ?? 0; // z (yaw)
        const beta = rot.beta ?? 0;  // x (pitch)
        const gamma = rot.gamma ?? 0; // y (roll)

        // Build rotation matrices
        // Rotation around Z (yaw)
        const Rz = [
          [Math.cos(alpha), -Math.sin(alpha), 0],
          [Math.sin(alpha),  Math.cos(alpha), 0],
          [0, 0, 1],
        ];
        // Rotation around Y (roll)
        const Ry = [
          [Math.cos(gamma), 0, Math.sin(gamma)],
          [0, 1, 0],
          [-Math.sin(gamma), 0, Math.cos(gamma)],
        ];
        // Rotation around X (pitch)
        const Rx = [
          [1, 0, 0],
          [0, Math.cos(beta), -Math.sin(beta)],
          [0, Math.sin(beta), Math.cos(beta)],
        ];

        // Apply rotation: worldAccel = Rz * Ry * Rx * accel
        // Matrix multiply: v' = Rz * Ry * Rx * v
        function matMul(m: number[][], v: number[]): number[] {
          return [
            m[0][0]*v[0] + m[0][1]*v[1] + m[0][2]*v[2],
            m[1][0]*v[0] + m[1][1]*v[1] + m[1][2]*v[2],
            m[2][0]*v[0] + m[2][1]*v[1] + m[2][2]*v[2],
          ];
        }
        let v = [ax, ay, az];
        v = matMul(Rx, v);
        v = matMul(Ry, v);
        v = matMul(Rz, v);
        setRotAdjAccel({ x: v[0], y: v[1], z: v[2] });
      } else {
        setRotAdjAccel(null);
      }

      // Estimate position by dividing accel by 2, rounding, and accumulating
      setPos(prev => ({
        x: prev.x + Math.round((a?.x ?? 0) / 2),
        y: prev.y + Math.round((a?.y ?? 0) / 2),
        z: prev.z + Math.round((a?.z ?? 0) / 2),
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
      <View style={{ marginTop: 8 }}>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          rot adj accel x: {rotAdjAccel ? rotAdjAccel.x.toFixed(4) : '-'}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          rot adj accel y: {rotAdjAccel ? rotAdjAccel.y.toFixed(4) : '-'}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          rot adj accel z: {rotAdjAccel ? rotAdjAccel.z.toFixed(4) : '-'}
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
