

import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import { Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { View } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function AccelerationScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [accelHistory, setAccelHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const [displayColorX, setDisplayColorX] = useState<{ r: number; g: number; b: number }>({ r: 136, g: 136, b: 136 });
  const [displayColorY, setDisplayColorY] = useState<{ r: number; g: number; b: number }>({ r: 136, g: 136, b: 136 });
  const [displayColorZ, setDisplayColorZ] = useState<{ r: number; g: number; b: number }>({ r: 136, g: 136, b: 136 });
  // Color animation for each axis
  React.useEffect(() => {
    let x = 0, y = 0, z = 0;
    if (accelHistory.length) {
      x = accelHistory[accelHistory.length - 1].x;
      y = accelHistory[accelHistory.length - 1].y;
      z = accelHistory[accelHistory.length - 1].z;
    }
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    // X axis color
    const normX = clamp(x / 5, -1, 1);
    const blue = { r: 57, g: 136, b: 255 };
    const red = { r: 229, g: 57, b: 53 };
    const gray = { r: 136, g: 136, b: 136 };
    let targetColorX;
    if (Math.abs(normX) < 0.05) {
      targetColorX = gray;
    } else if (normX > 0) {
      targetColorX = {
        r: Math.round(gray.r + (blue.r - gray.r) * normX),
        g: Math.round(gray.g + (blue.g - gray.g) * normX),
        b: Math.round(gray.b + (blue.b - gray.b) * normX),
      };
    } else {
      targetColorX = {
        r: Math.round(gray.r + (red.r - gray.r) * -normX),
        g: Math.round(gray.g + (red.g - gray.g) * -normX),
        b: Math.round(gray.b + (red.b - gray.b) * -normX),
      };
    }
    setDisplayColorX(prev => ({
      r: Math.round(prev.r + (targetColorX.r - prev.r) * 0.5),
      g: Math.round(prev.g + (targetColorX.g - prev.g) * 0.5),
      b: Math.round(prev.b + (targetColorX.b - prev.b) * 0.5),
    }));
    // Y axis color
    const normY = clamp(y / 5, -1, 1);
    const orange = { r: 255, g: 170, b: 57 };
    let targetColorY;
    if (Math.abs(normY) < 0.05) {
      targetColorY = gray;
    } else if (normY > 0) {
      targetColorY = {
        r: Math.round(gray.r + (orange.r - gray.r) * normY),
        g: Math.round(gray.g + (orange.g - gray.g) * normY),
        b: Math.round(gray.b + (orange.b - gray.b) * normY),
      };
    } else {
      targetColorY = {
        r: Math.round(gray.r + (red.r - gray.r) * -normY),
        g: Math.round(gray.g + (red.g - gray.g) * -normY),
        b: Math.round(gray.b + (red.b - gray.b) * -normY),
      };
    }
    setDisplayColorY(prev => ({
      r: Math.round(prev.r + (targetColorY.r - prev.r) * 0.5),
      g: Math.round(prev.g + (targetColorY.g - prev.g) * 0.5),
      b: Math.round(prev.b + (targetColorY.b - prev.b) * 0.5),
    }));
    // Z axis color
    const normZ = clamp(z / 5, -1, 1);
    const green = { r: 57, g: 255, b: 20 };
    let targetColorZ;
    if (Math.abs(normZ) < 0.05) {
      targetColorZ = gray;
    } else if (normZ > 0) {
      targetColorZ = {
        r: Math.round(gray.r + (green.r - gray.r) * normZ),
        g: Math.round(gray.g + (green.g - gray.g) * normZ),
        b: Math.round(gray.b + (green.b - gray.b) * normZ),
      };
    } else {
      targetColorZ = {
        r: Math.round(gray.r + (red.r - gray.r) * -normZ),
        g: Math.round(gray.g + (red.g - gray.g) * -normZ),
        b: Math.round(gray.b + (red.b - gray.b) * -normZ),
      };
    }
    setDisplayColorZ(prev => ({
      r: Math.round(prev.r + (targetColorZ.r - prev.r) * 0.5),
      g: Math.round(prev.g + (targetColorZ.g - prev.g) * 0.5),
      b: Math.round(prev.b + (targetColorZ.b - prev.b) * 0.5),
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
          min={recording ? undefined : -1}
          max={recording ? undefined : 1}
        />
        {/* Three colored circles for axes */}
        <View style={{ marginTop: 32, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          {/* X axis */}
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: `rgb(${displayColorX.r},${displayColorX.g},${displayColorX.b})`,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, opacity: 0.7 }}>X</Text>
            </View>
          </View>
          {/* Y axis */}
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: `rgb(${displayColorY.r},${displayColorY.g},${displayColorY.b})`,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, opacity: 0.7 }}>Y</Text>
            </View>
          </View>
          {/* Z axis */}
          <View style={{ alignItems: 'center' }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: `rgb(${displayColorZ.r},${displayColorZ.g},${displayColorZ.b})`,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14, opacity: 0.7 }}>Z</Text>
            </View>
          </View>
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
