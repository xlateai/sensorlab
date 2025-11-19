import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import SensorDots from '../../components/SensorDots';
import { View, Text } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function RotationDeltaScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [rotRateHistory, setRotRateHistory] = useState<Array<{ t: number; alpha: number; beta: number; gamma: number }>>([]);
  const [currentRotRate, setCurrentRotRate] = useState<{ alpha: number; beta: number; gamma: number }>({ alpha: 0, beta: 0, gamma: 0 });
  const startTimeRef = useRef<number | null>(null);

  React.useEffect(() => {
    const sub = DeviceMotion.addListener(data => {
      const { alpha = 0, beta = 0, gamma = 0 } = data.rotationRate || {};
      setCurrentRotRate({ alpha, beta, gamma });
      if (recording) {
        const now = Date.now();
        if (startTimeRef.current === null) startTimeRef.current = now;
        const t = (now - startTimeRef.current) / 1000;
        setRotRateHistory(prev => {
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
          data={rotRateHistory.map(({ t, alpha, beta, gamma }) => ({ t, x: alpha, y: beta, z: gamma }))}
          width={plotWidth}
          height={plotHeight}
          title="Rotation Rate (Δ)"
          colorX="#4af"
          colorY="#fa4"
          colorZ="#0fa"
        />
        <SensorDots
          x={currentRotRate.alpha}
          y={currentRotRate.beta}
          z={currentRotRate.gamma}
          xLow={-360}
          xHigh={360}
          yLow={-360}
          yHigh={360}
          zLow={-360}
          zHigh={360}
        />
      </ScrollView>
      <View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' }}>
        <RecordButton
          recording={recording}
          onPressIn={() => {
            setRecording(true);
            if (startTimeRef.current === null && rotRateHistory.length > 0) {
              startTimeRef.current = Date.now() - rotRateHistory[rotRateHistory.length - 1].t * 1000;
            } else {
              startTimeRef.current = null;
            }
          }}
          onPressOut={() => {
            setRecording(false);
          }}
          onClear={() => {
            setRotRateHistory([]);
            startTimeRef.current = null;
          }}
          color="#0fa"
        />
      </View>
    </SafeAreaView>
  );
}
