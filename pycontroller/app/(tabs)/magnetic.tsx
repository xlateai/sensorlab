import React, { useRef, useState } from 'react';
import { TouchableOpacity, Dimensions, ScrollView, SafeAreaView } from 'react-native';
import RecordButton from '../../components/RecordButton';
import SensorDots from '../../components/SensorDots';
import Svg, { Polyline, Line } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text } from 'react-native';
import { Magnetometer } from 'expo-sensors';

export default function MagneticScreen() {
  const { width } = Dimensions.get('window');
  const plotWidth = width - 40;
  const plotHeight = 120;
  const [recording, setRecording] = useState(false);
  const [magHistory, setMagHistory] = useState<Array<{ t: number; x: number; y: number; z: number }>>([]);
  const [buffer, setBuffer] = useState<Array<{ x: number; y: number; z: number }>>([]);
  const [currentMag, setCurrentMag] = useState<{ x: number; y: number; z: number }>({ x: 0, y: 0, z: 0 });
  const startTimeRef = useRef<number | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const sub = Magnetometer.addListener(data => {
        const { x = 0, y = 0, z = 0 } = data;
        setCurrentMag({ x, y, z });
        setBuffer(prev => {
          const next = [...prev, { x, y, z }];
          return next.length > 100 ? next.slice(next.length - 100) : next;
        });
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

  const xPoints = getPolylinePoints(magHistory.map(d => ({ t: d.t, v: d.x })));
  const yPoints = getPolylinePoints(magHistory.map(d => ({ t: d.t, v: d.y })));
  const zPoints = getPolylinePoints(magHistory.map(d => ({ t: d.t, v: d.z })));

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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center' }}>
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Magnetometer</Text>
            <Text style={{ color: '#4af', fontWeight: 'bold', marginLeft: 12, marginRight: 4 }}>x</Text>
            <Text style={{ color: '#fa4', fontWeight: 'bold', marginHorizontal: 4 }}>y</Text>
            <Text style={{ color: '#0fa', fontWeight: 'bold', marginHorizontal: 4 }}>z</Text>
          </View>
          <View>
            <View style={{ position: 'relative' }}>
              <Svg width={plotWidth} height={plotHeight} style={{ backgroundColor: '#222', borderRadius: 8 }}>
                <Polyline points={xPoints} fill="none" stroke="#4af" strokeWidth="2" />
                <Polyline points={yPoints} fill="none" stroke="#fa4" strokeWidth="2" />
                <Polyline points={zPoints} fill="none" stroke="#0fa" strokeWidth="2" />
                {/* Zero line */}
                <Line x1={0} y1={plotHeight/2} x2={plotWidth} y2={plotHeight/2} stroke="#888" strokeDasharray="4 2" strokeWidth="1" />
                {/* Axes */}
                <Line x1={0} y1={plotHeight} x2={plotWidth} y2={plotHeight} stroke="#888" strokeWidth="1" />
                <Line x1={0} y1={0} x2={0} y2={plotHeight} stroke="#888" strokeWidth="1" />
              </Svg>
              {/* Y-axis labels on the far right */}
              {(() => {
                const allVals = magHistory.flatMap(d => [d.x, d.y, d.z]);
                const vMin = allVals.length ? Math.min(...allVals) : -1;
                const vMax = allVals.length ? Math.max(...allVals) : 1;
                return (
                  <>
                    <Text style={{ position: 'absolute', right: 0, top: 0, color: '#fff', fontSize: 12 }}>{vMax.toFixed(2)}</Text>
                    <Text style={{ position: 'absolute', right: 0, top: plotHeight/2 - 8, color: '#fff', fontSize: 12 }}>{'0'}</Text>
                    <Text style={{ position: 'absolute', right: 0, bottom: 0, color: '#fff', fontSize: 12 }}>{vMin.toFixed(2)}</Text>
                  </>
                );
              })()}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>0</Text>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>time</Text>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
                {magHistory.length > 0 ? magHistory[magHistory.length - 1].t.toFixed(1) : '0.0'}
              </Text>
            </View>
          </View>
        </View>
        {/* SensorDots below the plot */}
        <SensorDots
          x={currentMag.x}
          y={currentMag.y}
          z={currentMag.z}
          xLow={xMean - xStd}
          xHigh={xMean + xStd}
          yLow={yMean - yStd}
          yHigh={yMean + yStd}
          zLow={zMean - zStd}
          zHigh={zMean + zStd}
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
