import React, { useRef, useState } from 'react';
import { TouchableOpacity, Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import SensorDots from '../../components/SensorDots';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { Magnetometer } from 'expo-sensors';

export default function MagneticScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [magHistory, setMagHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const [buffer, setBuffer] = useState<Array<{ x: number; y: number; z: number }>>([]);
  const [currentMag, setCurrentMag] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const startTimeRef = useRef<number | null>(null);

    useFocusEffect(
      React.useCallback(() => {
        const sub = Magnetometer.addListener(data => {
          const { x = 0, y = 0, z = 0 } = data;
          setCurrentMag({ x, y, z });
          setBuffer(prev => {
            const next = [...prev, { x, y, z }];
            return next.length > 128 ? next.slice(next.length - 128) : next;
          });
          if (recording) {
            const now = Date.now();
            if (startTimeRef.current === null) startTimeRef.current = now;
            const t = (now - startTimeRef.current) / 1000;
            setMagHistory(prev => {
              const updated = [...prev, { t, x, y, z }];
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <ThreeAxisPlot
          data={magHistory}
          width={plotWidth}
          height={plotHeight}
          title="Magnetometer"
          colorX="#4af"
          colorY="#fa4"
          colorZ="#0fa"
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
