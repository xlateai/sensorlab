

import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function AccelerationScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [accelHistory, setAccelHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const [displayColor, setDisplayColor] = useState<{ r: number; g: number; b: number }>({ r: 136, g: 136, b: 136 });
  // Color animation based on live z-axis acceleration
  React.useEffect(() => {
    let z = 0;
    if (accelHistory.length) {
      z = accelHistory[accelHistory.length - 1].z;
    }
    // Clamp z to [-1, 1] for color blending
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const normZ = clamp(z / 5, -1, 1);
    const green = { r: 57, g: 255, b: 20 };
    const red = { r: 229, g: 57, b: 53 };
    const gray = { r: 136, g: 136, b: 136 };
    let targetColor;
    if (Math.abs(normZ) < 0.05) {
      targetColor = gray;
    } else if (normZ > 0) {
      targetColor = {
        r: Math.round(gray.r + (green.r - gray.r) * normZ),
        g: Math.round(gray.g + (green.g - gray.g) * normZ),
        b: Math.round(gray.b + (green.b - gray.b) * normZ),
      };
    } else {
      targetColor = {
        r: Math.round(gray.r + (red.r - gray.r) * -normZ),
        g: Math.round(gray.g + (red.g - gray.g) * -normZ),
        b: Math.round(gray.b + (red.b - gray.b) * -normZ),
      };
    }
    // Animate towards targetColor
    const step = 0.5; // smoothing factor
    setDisplayColor(prev => ({
      r: Math.round(prev.r + (targetColor.r - prev.r) * step),
      g: Math.round(prev.g + (targetColor.g - prev.g) * step),
      b: Math.round(prev.b + (targetColor.b - prev.b) * step),
    }));
  }, [accelHistory]);
  const startTimeRef = useRef<number | null>(null);

  // Always update accelHistory with latest value, but only show plot when recording
  useFocusEffect(
    React.useCallback(() => {
      const sub = DeviceMotion.addListener(data => {
        const a = data.acceleration ?? { x: 0, y: 0, z: 0 };
        const now = Date.now();
        if (recording) {
          if (startTimeRef.current === null) startTimeRef.current = now;
          const t = (now - startTimeRef.current) / 1000;
          setAccelHistory(prev => [...prev, { t, x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 }]);
        } else {
          // When not recording, just keep latest value for color
          setAccelHistory(prev => {
            if (!prev.length) return [{ t: 0, x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 }];
            return [{ t: prev[prev.length - 1].t, x: a.x ?? 0, y: a.y ?? 0, z: a.z ?? 0 }];
          });
        }
      });
      DeviceMotion.setUpdateInterval(24);
      return () => {
        sub && sub.remove();
      };
    }, [recording])
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <ThreeAxisPlot
          data={recording ? accelHistory : accelHistory.length ? [accelHistory[accelHistory.length - 1]] : []}
          width={plotWidth}
          height={plotHeight}
          title="Acceleration"
          colorX="#4af"
          colorY="#fa4"
          colorZ="#0fa"
        />
        {/* Colored circle below plot */}
        <View style={{ marginTop: 32, alignItems: 'center' }}>
          <View
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: `rgb(${displayColor.r},${displayColor.g},${displayColor.b})`,
            }}
          />
        </View>
      </ScrollView>
      {/* Record button at bottom center */}
      <View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' }}>
        <RecordButton
          recording={recording}
          onPressIn={() => {
            setRecording(true);
            setAccelHistory([]);
            startTimeRef.current = null;
          }}
          onPressOut={() => {
            setRecording(false);
          }}
          onClear={() => {
            setAccelHistory([]);
          }}
          color="#fa4"
        />
      </View>
    </SafeAreaView>
  );
}
