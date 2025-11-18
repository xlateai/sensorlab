

import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function PositionScreen() {
  // Bias estimation state
  const [biasMode, setBiasMode] = useState(false);
  const [biasSamples, setBiasSamples] = useState<Array<{accel: [number, number, number], rotAdj: [number, number, number]}>>([]);
  const [bias, setBias] = useState<{accel: [number, number, number], rotAdj: [number, number, number]} | null>(null);
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
      const rot = data.rotation;
      let rotAdj = null;
      if (a && rot) {
        const ax = a.x ?? 0;
        const ay = a.y ?? 0;
        const az = a.z ?? 0;
        const alpha = rot.alpha ?? 0; // z (yaw)
        const beta = rot.beta ?? 0;  // x (pitch)
        const gamma = rot.gamma ?? 0; // y (roll)

        // Build rotation matrices
        const Rz = [
          [Math.cos(alpha), -Math.sin(alpha), 0],
          [Math.sin(alpha),  Math.cos(alpha), 0],
          [0, 0, 1],
        ];
        const Ry = [
          [Math.cos(gamma), 0, Math.sin(gamma)],
          [0, 1, 0],
          [-Math.sin(gamma), 0, Math.cos(gamma)],
        ];
        const Rx = [
          [1, 0, 0],
          [0, Math.cos(beta), -Math.sin(beta)],
          [0, Math.sin(beta), Math.cos(beta)],
        ];

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
        rotAdj = { x: v[0], y: v[1], z: v[2] };
        setRotAdjAccel(rotAdj);
      } else {
        setRotAdjAccel(null);
      }

      // Estimate position by accumulating rot adj accel (no rounding)
      setPos(prev => ({
        x: prev.x + (rotAdj ? rotAdj.x : 0),
        y: prev.y + (rotAdj ? rotAdj.y : 0),
        z: prev.z + (rotAdj ? rotAdj.z : 0),
      }));

      // Bias estimation logic
      if (biasMode && a && rotAdj) {
        setBiasSamples(samples => [...samples, {
          accel: [a.x ?? 0, a.y ?? 0, a.z ?? 0],
          rotAdj: [rotAdj.x, rotAdj.y, rotAdj.z],
        }]);
      }
    });
    DeviceMotion.setUpdateInterval(50);
    return () => {
      sub && sub.remove();
    };
  }, [biasMode]);

  // Compute bias when samples change
  useEffect(() => {
    if (biasSamples.length > 0) {
      const n = biasSamples.length;
      const sumAccel = biasSamples.reduce((acc, s) => [acc[0]+s.accel[0], acc[1]+s.accel[1], acc[2]+s.accel[2]], [0,0,0]);
      const sumRotAdj = biasSamples.reduce((acc, s) => [acc[0]+s.rotAdj[0], acc[1]+s.rotAdj[1], acc[2]+s.rotAdj[2]], [0,0,0]);
      setBias({
        accel: [sumAccel[0]/n, sumAccel[1]/n, sumAccel[2]/n],
        rotAdj: [sumRotAdj[0]/n, sumRotAdj[1]/n, sumRotAdj[2]/n],
      });
    } else {
      setBias(null);
    }
  }, [biasSamples]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
  <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>x: {pos.x.toFixed(1)}</Text>
  <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>y: {pos.y.toFixed(1)}</Text>
  <Text style={{ color: '#fff', fontSize: 28, fontWeight: 'bold' }}>z: {pos.z.toFixed(1)}</Text>
      <View style={{ marginTop: 24 }}>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          accel x: {accel ? accel.x.toFixed(1) : '-'}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          accel y: {accel ? accel.y.toFixed(1) : '-'}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          accel z: {accel ? accel.z.toFixed(1) : '-'}
        </Text>
      </View>
      <View style={{ marginTop: 8 }}>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          rot adj accel x: {rotAdjAccel ? rotAdjAccel.x.toFixed(1) : '-'}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          rot adj accel y: {rotAdjAccel ? rotAdjAccel.y.toFixed(1) : '-'}
        </Text>
        <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
          rot adj accel z: {rotAdjAccel ? rotAdjAccel.z.toFixed(1) : '-'}
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
            marginBottom: 16,
          }}
        >
          Set Origin
        </Text>
        <Text
          onPress={() => {
            if (!biasMode) {
              setBiasSamples([]);
              setBias(null);
            }
            setBiasMode(b => !b);
          }}
          style={{
            backgroundColor: biasMode ? '#e53935' : '#222',
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
          {biasMode ? 'Stop Bias Estimation' : 'Play Bias Estimation'}
        </Text>
      </View>
      {bias && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center', fontWeight: 'bold' }}>
            Estimated Bias (avg delta × 1e4, scaling factor)
          </Text>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
            accel x: {(bias.accel[0] * 1e4).toFixed(1)}
          </Text>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
            accel y: {(bias.accel[1] * 1e4).toFixed(1)}
          </Text>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
            accel z: {(bias.accel[2] * 1e4).toFixed(1)}
          </Text>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
            rot adj accel x: {(bias.rotAdj[0] * 1e4).toFixed(1)}
          </Text>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
            rot adj accel y: {(bias.rotAdj[1] * 1e4).toFixed(1)}
          </Text>
          <Text style={{ color: '#888', fontSize: 14, textAlign: 'center' }}>
            rot adj accel z: {(bias.rotAdj[2] * 1e4).toFixed(1)}
          </Text>
        </View>
      )}
    </View>
  );
}
