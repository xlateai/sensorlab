import React, { useRef, useState } from 'react';
import { TouchableOpacity, Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import SensorDots from '../../components/SensorDots';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function AccelerationWithGravityScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [magHistory, setMagHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const [currentAccel, setCurrentAccel] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const startTimeRef = useRef<number | null>(null);

  React.useEffect(() => {
    const sub = DeviceMotion.addListener(data => {
      const { x = 0, y = 0, z = 0 } = data.accelerationIncludingGravity || {};
      setCurrentAccel({ x, y, z });
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
    DeviceMotion.setUpdateInterval(24);
    return () => {
      sub && sub.remove();
    };
  }, [recording]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <ThreeAxisPlot
          data={magHistory}
          width={plotWidth}
          height={plotHeight}
          title="Acceleration + Gravity"
          colorX="#4af"
          colorY="#fa4"
          colorZ="#0fa"
        />
        <SensorDots
          x={currentAccel.x}
          y={currentAccel.y}
          z={currentAccel.z}
          xLow={-1.25}
          xHigh={1.25}
          yLow={-1.25}
          yHigh={1.25}
          zLow={-1.25}
          zHigh={1.25}
        />
      </ScrollView>
      <View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' }}>
        <RecordButton
          recording={recording}
          onPressIn={() => {
            setRecording(true);
            if (startTimeRef.current === null && magHistory.length > 0) {
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
