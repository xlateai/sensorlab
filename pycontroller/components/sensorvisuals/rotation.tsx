import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import SensorDots from '../../components/SensorDots';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function RotationScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [rotHistory, setRotHistory] = useState<Array<{ t: number; alpha: number; beta: number; gamma: number }>>([]);
  const [currentRot, setCurrentRot] = useState<{ alpha: number; beta: number; gamma: number }>({ alpha: 0, beta: 0, gamma: 0 });
  const startTimeRef = useRef<number | null>(null);

  React.useEffect(() => {
    const sub = DeviceMotion.addListener(data => {
      const { alpha = 0, beta = 0, gamma = 0 } = data.rotation || {};
      setCurrentRot({ alpha, beta, gamma });
      if (recording) {
        const now = Date.now();
        if (startTimeRef.current === null) startTimeRef.current = now;
        const t = (now - startTimeRef.current) / 1000;
        setRotHistory(prev => {
          const updated = [...prev, { t, alpha, beta, gamma }];
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
          data={rotHistory.map(({ t, alpha, beta, gamma }) => ({ t, x: alpha, y: beta, z: gamma }))}
          width={plotWidth}
          height={plotHeight}
          title="Rotation (DeviceMotion)"
          colorX="#4af"
          colorY="#fa4"
          colorZ="#0fa"
        />
        <SensorDots
          x={currentRot.alpha}
          y={currentRot.beta}
          z={currentRot.gamma}
          xLow={-180}
          xHigh={180}
          yLow={-180}
          yHigh={180}
          zLow={-180}
          zHigh={180}
        />
      </ScrollView>
      <View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' }}>
        <RecordButton
          recording={recording}
          onPressIn={() => {
            setRecording(true);
            if (startTimeRef.current === null && rotHistory.length > 0) {
              startTimeRef.current = Date.now() - rotHistory[rotHistory.length - 1].t * 1000;
            } else {
              startTimeRef.current = null;
            }
          }}
          onPressOut={() => {
            setRecording(false);
          }}
          onClear={() => {
            setRotHistory([]);
            startTimeRef.current = null;
          }}
          color="#fa4"
        />
      </View>
    </SafeAreaView>
  );
}
