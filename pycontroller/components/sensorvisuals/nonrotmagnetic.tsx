import React, { useRef, useState } from 'react';
import { TouchableOpacity, Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import SensorDots from '../../components/SensorDots';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { Magnetometer, DeviceMotion } from 'expo-sensors';

export default function NonRotMagneticScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [magHistory, setMagHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const [buffer, setBuffer] = useState<Array<{ x: number; y: number; z: number }>>([]);
  const [currentMag, setCurrentMag] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const [currentRotation, setCurrentRotation] = useState<{ alpha: number; beta: number; gamma: number }>({ alpha: 0, beta: 0, gamma: 0 });
  const rotationRef = useRef<{ alpha: number; beta: number; gamma: number }>({ alpha: 0, beta: 0, gamma: 0 });
  const initialRotationRef = useRef<{ alpha: number; beta: number; gamma: number } | null>(null);
  const startTimeRef = useRef<number | null>(null);

  // Helper function to compute rotation matrix from Euler angles (ZXY order)
  // Returns a 3x3 rotation matrix as an array of 9 elements [m00, m01, m02, m10, m11, m12, m20, m21, m22]
  function eulerToRotationMatrix(alpha: number, beta: number, gamma: number): number[] {
    const ca = Math.cos(alpha);
    const sa = Math.sin(alpha);
    const cb = Math.cos(beta);
    const sb = Math.sin(beta);
    const cg = Math.cos(gamma);
    const sg = Math.sin(gamma);

    // ZXY order: R = R_z(alpha) * R_x(beta) * R_y(gamma)
    return [
      ca * cg - sa * sb * sg,  -ca * sg - sa * sb * cg,  sa * cb,  // row 0
      sa * cg + ca * sb * sg,  -sa * sg + ca * sb * cg,  -ca * cb, // row 1
      cb * sg,                  cb * cg,                  sb       // row 2
    ];
  }

  // Multiply rotation matrix by vector
  function multiplyMatrixVector(matrix: number[], vec: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    return {
      x: matrix[0] * vec.x + matrix[1] * vec.y + matrix[2] * vec.z,
      y: matrix[3] * vec.x + matrix[4] * vec.y + matrix[5] * vec.z,
      z: matrix[6] * vec.x + matrix[7] * vec.y + matrix[8] * vec.z
    };
  }

  // Transpose a 3x3 rotation matrix
  function transposeMatrix(matrix: number[]): number[] {
    return [
      matrix[0], matrix[3], matrix[6],
      matrix[1], matrix[4], matrix[7],
      matrix[2], matrix[5], matrix[8]
    ];
  }

  // Multiply two 3x3 matrices
  function multiplyMatrices(a: number[], b: number[]): number[] {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6],  a[0] * b[1] + a[1] * b[4] + a[2] * b[7],  a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6],  a[3] * b[1] + a[4] * b[4] + a[5] * b[7],  a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6],  a[6] * b[1] + a[7] * b[4] + a[8] * b[7],  a[6] * b[2] + a[7] * b[5] + a[8] * b[8]
    ];
  }

  // Transform vector from current device frame to initial reference frame
  // R_initial: transforms from initial frame to world
  // R_current: transforms from current frame to world
  // To go from current to initial: v_initial = R_initial^T * R_current * v_current
  function rotateVectorToInitialFrame(
    vec: { x: number; y: number; z: number },
    currentRot: { alpha: number; beta: number; gamma: number },
    initialRot: { alpha: number; beta: number; gamma: number }
  ): { x: number; y: number; z: number } {
    if (!initialRot) return vec;

    const R_initial = eulerToRotationMatrix(initialRot.alpha, initialRot.beta, initialRot.gamma);
    const R_current = eulerToRotationMatrix(currentRot.alpha, currentRot.beta, currentRot.gamma);
    const R_initial_T = transposeMatrix(R_initial);
    
    // R_delta = R_initial^T * R_current transforms from current frame to initial frame
    const R_delta = multiplyMatrices(R_initial_T, R_current);
    return multiplyMatrixVector(R_delta, vec);
  }

  // DeviceMotion listener for rotation data
  useFocusEffect(
    React.useCallback(() => {
      const motionSub = DeviceMotion.addListener(data => {
        const { alpha = 0, beta = 0, gamma = 0 } = data.rotation || {};
        const rot = { alpha, beta, gamma };
        
        // Set initial rotation on first measurement
        if (initialRotationRef.current === null) {
          initialRotationRef.current = { ...rot };
        }
        
        rotationRef.current = rot;
        setCurrentRotation(rot);
      });
      DeviceMotion.setUpdateInterval(24);
      return () => {
        motionSub && motionSub.remove();
        // Reset initial rotation when component unmounts
        initialRotationRef.current = null;
      };
    }, [])
  );

  // Magnetometer listener - applies rotation compensation
  useFocusEffect(
    React.useCallback(() => {
      const sub = Magnetometer.addListener(data => {
        const { x = 0, y = 0, z = 0 } = data;
        
        // Get current rotation from ref (always up-to-date)
        const currentRot = rotationRef.current;
        const initialRot = initialRotationRef.current;
        
        // Apply rotation to transform from current device frame to initial reference frame
        const stabilized = initialRot 
          ? rotateVectorToInitialFrame({ x, y, z }, currentRot, initialRot)
          : { x, y, z }; // If no initial rotation set yet, return raw values
        
        setCurrentMag(stabilized);
        setBuffer(prev => {
          const next = [...prev, stabilized];
          return next.length > 128 ? next.slice(next.length - 128) : next;
        });
        if (recording) {
          const now = Date.now();
          if (startTimeRef.current === null) startTimeRef.current = now;
          const t = (now - startTimeRef.current) / 1000;
          setMagHistory(prev => {
            const updated = [...prev, { t, ...stabilized }];
            return updated.length > 128 ? updated.slice(updated.length - 128) : updated;
          });
        }
      });
      Magnetometer.setUpdateInterval(24);
      return () => {
        sub && sub.remove();
      };
    }, [recording])
  );

  // Helper to calculate mean and stddev
  function getMeanStd(arr: number[]) {
    if (arr.length === 0) return { mean: 0, std: 1 };
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const std = Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length);
    return { mean, std };
  }

  const xArr = buffer.map(d => d.x);
  const yArr = buffer.map(d => d.y);
  const zArr = buffer.map(d => d.z);
  const { mean: xMean, std: xStd } = getMeanStd(xArr);
  const { mean: yMean, std: yStd } = getMeanStd(yArr);
  const { mean: zMean, std: zStd } = getMeanStd(zArr);

  // Calculate average data for plotting (average of x, y, z at each time point)
  const averageData = magHistory.map(d => ({
    t: d.t,
    x: (d.x + d.y + d.z) / 3,
    y: (d.x + d.y + d.z) / 3,
    z: (d.x + d.y + d.z) / 3,
  }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <ThreeAxisPlot
          data={magHistory}
          width={plotWidth}
          height={plotHeight}
          colorX="#4af"
          title="No-Rotation Magneto"
          colorY="#fa4"
          colorZ="#0fa"
          averageData={averageData}
          colorAverage="#fff"
        />
        {/* SensorDots below the plot */}
        <SensorDots
          x={currentMag.x}
          y={currentMag.y}
          z={currentMag.z}
          xLow={xMean - xStd}
          xHigh={xMean + xStd}
          yLow={yMean - yStd}
          yHigh={yMean + yStd}
          zLow={zMean - zStd}
          zHigh={zMean + zStd}
        />
      </ScrollView>
      {/* Record button at bottom center */}
      <View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' }}>
        <RecordButton
          recording={recording}
          onPressIn={() => {
            setRecording(true);
            if (startTimeRef.current === null && magHistory.length > 0) {
              // continue time from last sample
              startTimeRef.current = Date.now() - magHistory[magHistory.length - 1].t * 1000;
            } else {
              startTimeRef.current = null;
            }
          }}
          onPressOut={() => {
            setRecording(false);
          }}
          onClear={() => {
            setMagHistory([]);
            startTimeRef.current = null;
          }}
          color="#4af"
        />
      </View>
    </SafeAreaView>
  );
}
