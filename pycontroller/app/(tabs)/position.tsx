

import React, { useRef, useState } from 'react';
import { TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import Svg, { Polyline, Line, Text as SvgText } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function PositionScreen() {
  const [accel, setAccel] = useState<number | null>(null);
  const [pos, setPos] = useState<number>(0);
  const prevPosRef = useRef<number | null>(null);
  const [delta, setDelta] = useState<number>(0);
  const [displayColor, setDisplayColor] = useState<{ r: number; g: number; b: number }>({ r: 136, g: 136, b: 136 });
  // Recording state
  const [recording, setRecording] = useState(false);
  const [accelHistory, setAccelHistory] = useState<Array<{ t: number; z: number }>>([]);
  const [deltaHistory, setDeltaHistory] = useState<Array<{ t: number; dz: number }>>([]);
  const startTimeRef = useRef<number | null>(null);
  // Removed averaging buffer

  useFocusEffect(
    React.useCallback(() => {
      const sub = DeviceMotion.addListener(data => {
        const a = data.acceleration;
        const currentAccel = a?.z ?? 0;
        setAccel(currentAccel);
        setPos(prev => {
          const newPos = prev + currentAccel;
          // Calculate delta (rate of change)
          if (prevPosRef.current !== null) {
            setDelta(newPos - prevPosRef.current);
          } else {
            setDelta(0);
          }
          prevPosRef.current = newPos;
          return newPos;
        });
        // Recording logic
        if (recording) {
          const now = Date.now();
          if (startTimeRef.current === null) startTimeRef.current = now;
          const t = (now - startTimeRef.current) / 1000;
          setAccelHistory(prev => [...prev, { t, z: currentAccel }]);
          // Delta calculation
          if (prevPosRef.current !== null) {
            setDeltaHistory(prev => [...prev, { t, dz: currentAccel - (prevPosRef.current ?? 0) }]);
          } else {
            setDeltaHistory(prev => [...prev, { t, dz: 0 }]);
          }
        }
      });
      DeviceMotion.setUpdateInterval(24);
      return () => {
        sub && sub.remove();
      };
    }, [recording])
  );

  // Smooth color animation
  React.useEffect(() => {
    // Clamp delta to [-1, 1] for color blending
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const normDelta = clamp(delta / 5, -1, 1);
    const green = { r: 57, g: 255, b: 20 };
    const red = { r: 229, g: 57, b: 53 };
    const gray = { r: 136, g: 136, b: 136 };
    let targetColor;
    if (Math.abs(normDelta) < 0.05) {
      targetColor = gray;
    } else if (normDelta > 0) {
      targetColor = {
        r: Math.round(gray.r + (green.r - gray.r) * normDelta),
        g: Math.round(gray.g + (green.g - gray.g) * normDelta),
        b: Math.round(gray.b + (green.b - gray.b) * normDelta),
      };
    } else {
      targetColor = {
        r: Math.round(gray.r + (red.r - gray.r) * -normDelta),
        g: Math.round(gray.g + (red.g - gray.g) * -normDelta),
        b: Math.round(gray.b + (red.b - gray.b) * -normDelta),
      };
    }
    // Animate towards targetColor
    const step = 0.5; // smoothing factor (higher = faster)
    setDisplayColor(prev => ({
      r: Math.round(prev.r + (targetColor.r - prev.r) * step),
      g: Math.round(prev.g + (targetColor.g - prev.g) * step),
      b: Math.round(prev.b + (targetColor.b - prev.b) * step),
    }));
  }, [delta]);


  // Plotting dimensions
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;

  // Helper to scale data for SVG
  function getPolylinePoints(data: Array<{ t: number; v: number }>) {
    if (data.length === 0) return '';
    const tMin = data[0].t;
    const tMax = data[data.length - 1].t;
    const vMin = Math.min(...data.map(d => d.v));
    const vMax = Math.max(...data.map(d => d.v));
    return data.map(d => {
      const x = ((d.t - tMin) / Math.max(0.001, tMax - tMin)) * plotWidth;
      const y = plotHeight - ((d.v - vMin) / Math.max(0.001, vMax - vMin)) * plotHeight;
      return `${x},${y}`;
    }).join(' ');
  }

  // Prepare data for plots
  const accelPoints = getPolylinePoints(accelHistory.map(d => ({ t: d.t, v: d.z })));
  const deltaPoints = getPolylinePoints(deltaHistory.map(d => ({ t: d.t, v: d.dz })));

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        {/* Smoothly blended color circle based on z rate of change */}
        <View
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: `rgb(${displayColor.r},${displayColor.g},${displayColor.b})`,
          }}
        />
      </View>
      {/* Plots */}
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>z accel over time</Text>
          <Svg width={plotWidth} height={plotHeight} style={{ backgroundColor: '#222', borderRadius: 8 }}>
            <Polyline
              points={accelPoints}
              fill="none"
              stroke="#4af"
              strokeWidth="2"
            />
            {/* Axes */}
            <Line x1={0} y1={plotHeight} x2={plotWidth} y2={plotHeight} stroke="#888" strokeWidth="1" />
            <Line x1={0} y1={0} x2={0} y2={plotHeight} stroke="#888" strokeWidth="1" />
          </Svg>
        </View>
        <View style={{ marginBottom: 12 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>z accel delta over time</Text>
          <Svg width={plotWidth} height={plotHeight} style={{ backgroundColor: '#222', borderRadius: 8 }}>
            <Polyline
              points={deltaPoints}
              fill="none"
              stroke="#fa4"
              strokeWidth="2"
            />
            {/* Axes */}
            <Line x1={0} y1={plotHeight} x2={plotWidth} y2={plotHeight} stroke="#888" strokeWidth="1" />
            <Line x1={0} y1={0} x2={0} y2={plotHeight} stroke="#888" strokeWidth="1" />
          </Svg>
        </View>
      </ScrollView>
      {/* Record button at bottom center */}
      <View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' }}>
        <TouchableOpacity
          style={{
            width: 80,
            height: 80,
            borderRadius: 40,
            backgroundColor: recording ? '#fa4' : '#444',
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#fa4',
            shadowOpacity: recording ? 0.5 : 0.2,
            shadowRadius: 8,
          }}
          activeOpacity={0.7}
          onPressIn={() => {
            setRecording(true);
            setAccelHistory([]);
            setDeltaHistory([]);
            startTimeRef.current = null;
          }}
          onPressOut={() => {
            setRecording(false);
          }}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{recording ? 'Recording...' : 'Hold to Record'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
