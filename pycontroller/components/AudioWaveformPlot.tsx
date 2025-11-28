import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Polyline, Line } from 'react-native-svg';

interface AudioDataPoint {
  t: number;
  amplitude: number;
}

interface AudioWaveformPlotProps {
  data: AudioDataPoint[];
  width: number;
  height: number;
  title: string;
  color?: string;
  min?: number;
  max?: number;
}

function getPolylinePoints(data: Array<{ amplitude: number }>, width: number, height: number, min: number, max: number) {
  if (data.length === 0) return '';
  return data.map((d, i) => {
    const x = (i / Math.max(1, data.length - 1)) * width;
    const y = height - ((d.amplitude - min) / Math.max(0.001, max - min)) * height;
    return `${x},${y}`;
  }).join(' ');
}

export default function AudioWaveformPlot({
  data,
  width,
  height,
  title,
  color = '#39ff14',
  min,
  max,
}: AudioWaveformPlotProps) {
  const tMax = data.length > 0 ? data.length - 1 : 0;
  const points = getPolylinePoints(
    data.map(d => ({ amplitude: d.amplitude })),
    width,
    height,
    typeof min === 'number' ? min : (data.length ? Math.min(...data.map(d => d.amplitude)) : -1),
    typeof max === 'number' ? max : (data.length ? Math.max(...data.map(d => d.amplitude)) : 1)
  );
  
  const allVals = data.map(d => d.amplitude);
  const vMin = typeof min === 'number' ? min : (allVals.length ? Math.min(...allVals) : -1);
  const vMax = typeof max === 'number' ? max : (allVals.length ? Math.max(...allVals) : 1);

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 24 }}>{title}</Text>
        <Text style={{ color: color, fontWeight: 'bold', marginLeft: 12 }}>amplitude</Text>
      </View>
      <View style={{ position: 'relative' }}>
        <Svg width={width} height={height} style={{ backgroundColor: '#222', borderRadius: 8 }}>
          <Polyline points={points} fill="none" stroke={color} strokeWidth="2" />
          {/* Zero line */}
          <Line x1={0} y1={height/2} x2={width} y2={height/2} stroke="#888" strokeDasharray="4 2" strokeWidth="1" />
          {/* Axes */}
          <Line x1={0} y1={height} x2={width} y2={height} stroke="#888" strokeWidth="1" />
          <Line x1={0} y1={0} x2={0} y2={height} stroke="#888" strokeWidth="1" />
        </Svg>
        {/* Y-axis labels on the far right */}
        <Text style={{ position: 'absolute', right: 0, top: 0, color: '#fff', fontSize: 12 }}>{vMax.toFixed(2)}</Text>
        <Text style={{ position: 'absolute', right: 0, top: height/2 - 8, color: '#fff', fontSize: 12 }}>{'0'}</Text>
        <Text style={{ position: 'absolute', right: 0, bottom: 0, color: '#fff', fontSize: 12 }}>{vMin.toFixed(2)}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>0</Text>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>time</Text>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{tMax}</Text>
      </View>
    </View>
  );
}
