import React, { useRef, useState, useEffect } from 'react';
import { Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../RecordButton';
import SensorDots from '../SensorDots';
import ThreeAxisPlot from '../ThreeAxisPlot';
import { View } from 'react-native';
import { useStabilizedMagnetometer } from '@/app/utils/sensors';

export default function NonRotMagneticScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [magHistory, setMagHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const startTimeRef = useRef<number | null>(null);

  // Track all-time min/max values for the current session
  const [minMax, setMinMax] = useState<{
    min: number;
    max: number;
  }>({
    min: Infinity,
    max: -Infinity,
  });

  // Use the stabilized magnetometer hook - provides both raw and stabilized readings
  const { stabilized, stabilizedBuffer } = useStabilizedMagnetometer(
    24, // updateInterval: 24ms
    128 // bufferSize: 128 samples
  );

  // Update all-time min/max values from stabilized readings
  useEffect(() => {
    // Since stabilized values are all the same (euclidean norm), we can use any axis
    const value = stabilized.x; // x, y, z are all the same
    
    // Skip if value is zero (initial state)
    if (value === 0 && minMax.min === Infinity) return;
    
    setMinMax(prev => ({
      min: prev.min === Infinity ? value : Math.min(prev.min, value),
      max: prev.max === -Infinity ? value : Math.max(prev.max, value),
    }));
  }, [stabilized]);

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

  // Calculate plot min/max (all-time values)
  const plotMin = minMax.min === Infinity ? 0 : minMax.min;
  const plotMax = minMax.max === -Infinity ? 100 : minMax.max;

  // Calculate 10th and 90th percentile thresholds for SensorDots
  const range = plotMax - plotMin;
  const lowThreshold = plotMin + range * 0.1;  // Bottom 10%
  const highThreshold = plotMax - range * 0.1;  // Top 10%

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <ThreeAxisPlot
          data={magHistory}
          width={plotWidth}
          height={plotHeight}
          colorX="#4af"
          title="Stable EMF"
          colorY="#fa4"
          colorZ="#0fa"
          averageData={averageData}
          colorAverage="#fff"
          min={plotMin}
          max={plotMax}
        />
        {/* SensorDots below the plot */}
        <SensorDots
          x={stabilized.x}
          y={stabilized.y}
          z={stabilized.z}
          xLow={lowThreshold}
          xHigh={highThreshold}
          yLow={lowThreshold}
          yHigh={highThreshold}
          zLow={lowThreshold}
          zHigh={highThreshold}
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
            // Reset min/max values
            setMinMax({
              min: Infinity,
              max: -Infinity,
            });
          }}
          color="#4af"
        />
      </View>
    </SafeAreaView>
  );
}
