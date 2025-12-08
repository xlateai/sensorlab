import React, { useRef, useState } from 'react';
import { TouchableOpacity, Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import SensorDots from '../../components/SensorDots';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { Magnetometer } from 'expo-sensors';

export default function NonRotMagneticScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [magHistory, setMagHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const [buffer, setBuffer] = useState<Array<{ x: number; y: number; z: number }>>([]);
  const [currentMag, setCurrentMag] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const startTimeRef = useRef<number | null>(null);
  const trendStartTimeRef = useRef<number | null>(null);
  
  // History for trend calculation (longer window for smooth baseline)
  const trendBufferRef = useRef<Array<{ x: number; y: number; z: number; t: number }>>([]);
  
  // Ref to track detrended buffer for normalization (synchronous access)
  const detrendedBufferRef = useRef<Array<{ x: number; y: number; z: number }>>([]);

  // Calculate trend (baseline) for each axis using linear regression on recent history
  // This finds the "curvature" or drift and subtracts it to center around zero
  function calculateTrend(data: Array<{ x: number; y: number; z: number; t: number }>): { x: number; y: number; z: number } {
    if (data.length < 2) return { x: 0, y: 0, z: 0 };
    
    // Use linear regression to find the trend line
    const n = data.length;
    const sumT = data.reduce((sum, d) => sum + d.t, 0);
    const sumT2 = data.reduce((sum, d) => sum + d.t * d.t, 0);
    const sumX = data.reduce((sum, d) => sum + d.x, 0);
    const sumY = data.reduce((sum, d) => sum + d.y, 0);
    const sumZ = data.reduce((sum, d) => sum + d.z, 0);
    const sumTX = data.reduce((sum, d) => sum + d.t * d.x, 0);
    const sumTY = data.reduce((sum, d) => sum + d.t * d.y, 0);
    const sumTZ = data.reduce((sum, d) => sum + d.t * d.z, 0);
    
    const denominator = n * sumT2 - sumT * sumT;
    if (Math.abs(denominator) < 1e-10) {
      // Fallback to simple mean if regression fails
      return {
        x: sumX / n,
        y: sumY / n,
        z: sumZ / n,
      };
    }
    
    // Linear regression: y = a + b*t
    // For the latest time point, calculate the trend value
    const latestT = data[data.length - 1].t;
    
    const slopeX = (n * sumTX - sumT * sumX) / denominator;
    const interceptX = (sumX - slopeX * sumT) / n;
    const trendX = interceptX + slopeX * latestT;
    
    const slopeY = (n * sumTY - sumT * sumY) / denominator;
    const interceptY = (sumY - slopeY * sumT) / n;
    const trendY = interceptY + slopeY * latestT;
    
    const slopeZ = (n * sumTZ - sumT * sumZ) / denominator;
    const interceptZ = (sumZ - slopeZ * sumT) / n;
    const trendZ = interceptZ + slopeZ * latestT;
    
    return { x: trendX, y: trendY, z: trendZ };
  }

  // Detrend: subtract the trend from the current value to center around zero
  function detrend(
    vec: { x: number; y: number; z: number },
    trend: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    return {
      x: vec.x - trend.x,
      y: vec.y - trend.y,
      z: vec.z - trend.z,
    };
  }

  // Normalize values to -1 to +1 range based on last 16 samples
  // This keeps values centered at 0 by using a rolling window
  function normalizeToRange(
    vec: { x: number; y: number; z: number },
    buffer: Array<{ x: number; y: number; z: number }>
  ): { x: number; y: number; z: number } {
    // Use last 16 samples for normalization window
    const windowSize = 16;
    const window = buffer.slice(-windowSize);
    
    if (window.length === 0) return vec;

    // Find min/max for each axis in the window
    const xVals = window.map(d => d.x);
    const yVals = window.map(d => d.y);
    const zVals = window.map(d => d.z);
    
    const xMin = Math.min(...xVals);
    const xMax = Math.max(...xVals);
    const yMin = Math.min(...yVals);
    const yMax = Math.max(...yVals);
    const zMin = Math.min(...zVals);
    const zMax = Math.max(...zVals);
    
    // Calculate ranges
    const xRange = Math.max(0.001, xMax - xMin);
    const yRange = Math.max(0.001, yMax - yMin);
    const zRange = Math.max(0.001, zMax - zMin);
    
    // Normalize to -1 to +1: (value - center) / (range/2)
    // This centers around 0 and scales to ±1
    return {
      x: Math.max(-1, Math.min(1, (vec.x - (xMin + xMax) / 2) / (xRange / 2))),
      y: Math.max(-1, Math.min(1, (vec.y - (yMin + yMax) / 2) / (yRange / 2))),
      z: Math.max(-1, Math.min(1, (vec.z - (zMin + zMax) / 2) / (zRange / 2))),
    };
  }

  // Store raw magnetometer data (unmodified)
  const rawBufferRef = useRef<Array<{ x: number; y: number; z: number; t: number }>>([]);

  // Magnetometer listener - only stores raw data, no processing
  useFocusEffect(
    React.useCallback(() => {
      // Initialize trend start time
      if (trendStartTimeRef.current === null) {
        trendStartTimeRef.current = Date.now();
      }
      
      const sub = Magnetometer.addListener(data => {
        const { x = 0, y = 0, z = 0 } = data;
        const now = Date.now();
        
        // Time relative to trend start (for trend calculation)
        const trendT = (now - (trendStartTimeRef.current || now)) / 1000;
        
        // Store raw data only - no processing here
        rawBufferRef.current.push({ x, y, z, t: trendT });
        // Keep last 128 samples of raw data
        if (rawBufferRef.current.length > 128) {
          rawBufferRef.current.shift();
        }
        
        // Post-processing: Apply detrending and normalization for display only
        // Use last 16 samples for trend calculation
        const trendWindow = rawBufferRef.current.slice(-16);
        const trend = calculateTrend(trendWindow);
        const detrended = detrend({ x, y, z }, trend);
        
        // Update detrended buffer for normalization
        detrendedBufferRef.current.push(detrended);
        if (detrendedBufferRef.current.length > 128) {
          detrendedBufferRef.current.shift();
        }
        
        // Normalize to -1 to +1 range based on last 16 detrended samples
        const normalized = normalizeToRange(detrended, detrendedBufferRef.current);
        
        // Update display state (post-processed data only)
        setCurrentMag(normalized);
        setBuffer([...detrendedBufferRef.current]);
        
        if (recording) {
          if (startTimeRef.current === null) startTimeRef.current = now;
          const recordT = (now - startTimeRef.current) / 1000;
          setMagHistory(prev => {
            const updated = [...prev, { t: recordT, ...normalized }];
            return updated.length > 128 ? updated.slice(updated.length - 128) : updated;
          });
        }
      });
      // Don't set update interval - use whatever is already set globally
      // This avoids interfering with other magnetometer listeners
      return () => {
        sub && sub.remove();
        rawBufferRef.current = [];
        trendBufferRef.current = [];
        detrendedBufferRef.current = [];
        trendStartTimeRef.current = null;
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
          min={-1}
          max={1}
        />
        {/* SensorDots below the plot */}
        <SensorDots
          x={currentMag.x}
          y={currentMag.y}
          z={currentMag.z}
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
            trendBufferRef.current = [];
            detrendedBufferRef.current = [];
            trendStartTimeRef.current = Date.now();
          }}
          color="#4af"
        />
      </View>
    </SafeAreaView>
  );
}
