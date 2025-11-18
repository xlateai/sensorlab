

import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function PositionScreen() {
  // Bias estimation state
  const [biasMode, setBiasMode] = useState(false);
  const [biasSamples, setBiasSamples] = useState<Array<{accel: [number, number, number], rotAdj: [number, number, number]}>>([]);
  const [bias, setBias] = useState<{accel: [number, number, number], rotAdj: [number, number, number]} | null>(null);
  const [accel, setAccel] = useState<number | null>(null);
  const [rotAdjAccel, setRotAdjAccel] = useState<number | null>(null);
  const [pos, setPos] = useState<number>(0);
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    const sub = DeviceMotion.addListener(data => {
      const a = data.acceleration;
      setAccel(a?.z ?? 0);

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
        rotAdj = v[2];
        setRotAdjAccel(rotAdj);
      } else {
        setRotAdjAccel(null);
      }

      // Estimate position by accumulating rot adj accel minus bias (if available and not currently estimating)
      let bz = 0;
      if (!biasMode && bias && bias.rotAdj) {
        bz = bias.rotAdj[2];
      }
      setPos(prev => prev + (rotAdj !== null ? rotAdj - bz : 0));

      // Bias estimation logic
      if (biasMode && a && rotAdj !== null) {
        setBiasSamples(samples => [...samples, {
          accel: [0, 0, a.z ?? 0],
          rotAdj: [0, 0, rotAdj],
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
      const sumAccel = biasSamples.reduce((acc, s) => acc + s.accel[2], 0);
      const sumRotAdj = biasSamples.reduce((acc, s) => acc + s.rotAdj[2], 0);
      setBias({
        accel: [0, 0, sumAccel/n],
        rotAdj: [0, 0, sumRotAdj/n],
      });
    } else {
      setBias(null);
    }
  }, [biasSamples]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Text
        style={{
          color: pos > 1 ? '#39ff14' : pos < -1 ? '#e53935' : '#888',
          fontSize: 28,
          fontWeight: 'bold',
        }}
      >
        z: {pos.toFixed(2)}
      </Text>
      <View style={{ marginTop: 24 }}>
        <Text
          style={{
            color: accel !== null && accel > 1 ? '#39ff14' : accel !== null && accel < -1 ? '#e53935' : '#888',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          accel z: {accel !== null ? accel.toFixed(1) : '-'}
        </Text>
      </View>
      <View style={{ marginTop: 8 }}>
        <Text
          style={{
            color: rotAdjAccel !== null && rotAdjAccel > 1 ? '#39ff14' : rotAdjAccel !== null && rotAdjAccel < -1 ? '#e53935' : '#888',
            fontSize: 14,
            textAlign: 'center',
          }}
        >
          rot adj accel z: {rotAdjAccel !== null ? rotAdjAccel.toFixed(1) : '-'}
        </Text>
      </View>
      <View style={{ marginTop: 32 }}>
        <Text
          onPress={() => setPos(0)}
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
          <Text
            style={{
              color: bias.accel[2] * 1e4 > 1 ? '#39ff14' : bias.accel[2] * 1e4 < -1 ? '#e53935' : '#888',
              fontSize: 14,
              textAlign: 'center',
            }}
          >
            accel z: {(bias.accel[2] * 1e4).toFixed(1)}
          </Text>
          <Text
            style={{
              color: bias.rotAdj[2] * 1e4 > 1 ? '#39ff14' : bias.rotAdj[2] * 1e4 < -1 ? '#e53935' : '#888',
              fontSize: 14,
              textAlign: 'center',
              marginTop: 8,
            }}
          >
            rot adj accel z: {(bias.rotAdj[2] * 1e4).toFixed(1)}
          </Text>
        </View>
      )}
    </View>
  );
}
