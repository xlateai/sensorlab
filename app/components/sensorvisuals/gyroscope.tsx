import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import SensorDots from '../../components/SensorDots';
import { View, Text } from 'react-native';
import { Gyroscope } from 'expo-sensors';

export default function GyroscopeScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [gyroHistory, setGyroHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const [currentGyro, setCurrentGyro] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const startTimeRef = useRef<number | null>(null);

  React.useEffect(() => {
    const sub = Gyroscope.addListener(data => {
      const { x = 0, y = 0, z = 0 } = data;
      setCurrentGyro({ x, y, z });
      if (recording) {
        const now = Date.now();
        if (startTimeRef.current === null) startTimeRef.current = now;
        const t = (now - startTimeRef.current) / 1000;
        setGyroHistory(prev => {
          const updated = [...prev, { t, x, y, z }];
          return updated.length > 128 ? updated.slice(updated.length - 128) : updated;
        });
      }
    });
    Gyroscope.setUpdateInterval(24);
    return () => {
      sub && sub.remove();
    };
  }, [recording]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <ThreeAxisPlot
          data={gyroHistory}
          width={plotWidth}
          height={plotHeight}
          title="Gyroscope"
          colorX="#4af"
          colorY="#fa4"
          colorZ="#0fa"
        />
        <SensorDots
          x={currentGyro.x}
          y={currentGyro.y}
          z={currentGyro.z}
          xLow={-10}
          xHigh={10}
          yLow={-10}
          yHigh={10}
          zLow={-10}
          zHigh={10}
        />
      </ScrollView>
      <View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' }}>
        <RecordButton
          recording={recording}
          onPressIn={() => {
            setRecording(true);
            if (startTimeRef.current === null && gyroHistory.length > 0) {
              startTimeRef.current = Date.now() - gyroHistory[gyroHistory.length - 1].t * 1000;
            } else {
              startTimeRef.current = null;
            }
          }}
          onPressOut={() => {
            setRecording(false);
          }}
          onClear={() => {
            setGyroHistory([]);
            startTimeRef.current = null;
          }}
          color="#ffd59e"
        />
      </View>
    </SafeAreaView>
  );
}
