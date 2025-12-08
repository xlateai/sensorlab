import React, { useRef, useState, useEffect } from 'react';
import { Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import SensorDots from '../../components/SensorDots';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import { View } from 'react-native';
import { useStabilizedMagnetometer } from '@/app/utils/sensors';

export default function NonRotMagneticScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [magHistory, setMagHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const startTimeRef = useRef<number | null>(null);

  // Use the stabilized magnetometer hook - provides both raw and stabilized readings
  const { stabilized, stabilizedBuffer } = useStabilizedMagnetometer(
    24, // updateInterval: 24ms
    16, // trendWindowSize: 16 samples
    16, // normalizationWindowSize: 16 samples
    128 // bufferSize: 128 samples
  );

  // Record stabilized readings when recording is active
  useEffect(() => {
    if (recording) {
      const now = Date.now();
      if (startTimeRef.current === null) {
        startTimeRef.current = now;
      }
      const recordT = (now - startTimeRef.current) / 1000;
      setMagHistory(prev => {
        const updated = [...prev, { t: recordT, ...stabilized }];
        return updated.length > 128 ? updated.slice(updated.length - 128) : updated;
      });
    }
  }, [stabilized, recording]);

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
          min={-1}
          max={1}
        />
        {/* SensorDots below the plot */}
        <SensorDots
          x={stabilized.x}
          y={stabilized.y}
          z={stabilized.z}
          xLow={-1}
          xHigh={1}
          yLow={-1}
          yHigh={1}
          zLow={-1}
          zHigh={1}
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
