import React, { useRef, useState } from 'react';
import { TouchableOpacity, Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import ThreeAxisPlot from '../../components/ThreeAxisPlot';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { Magnetometer } from 'expo-sensors';

export default function AccelerationScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [magHistory, setMagHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const startTimeRef = useRef<number | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const sub = Magnetometer.addListener(data => {
        const { x = 0, y = 0, z = 0 } = data;
        if (recording) {
          const now = Date.now();
          if (startTimeRef.current === null) startTimeRef.current = now;
          const t = (now - startTimeRef.current) / 1000;
          setMagHistory(prev => [...prev, { t, x, y, z }]);
        }
      });
      Magnetometer.setUpdateInterval(24);
      return () => {
        sub && sub.remove();
      };
    }, [recording])
  );



  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <ThreeAxisPlot
          data={magHistory}
          width={plotWidth}
          height={plotHeight}
          title="Magnetometer"
          colorX="#4af"
          colorY="#fa4"
          colorZ="#0fa"
        />
      </ScrollView>
      {/* Record button at bottom center */}
      <View style={{ position: 'absolute', bottom: 32, left: 0, right: 0, alignItems: 'center' }}>
        <RecordButton
          recording={recording}
          onPressIn={() => {
            setRecording(true);
            setMagHistory([]);
            startTimeRef.current = null;
          }}
          onPressOut={() => {
            setRecording(false);
          }}
          onClear={() => {
            setMagHistory([]);
          }}
          color="#4af"
        />
      </View>
    </SafeAreaView>
  );
}
