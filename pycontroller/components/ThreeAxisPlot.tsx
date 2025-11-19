import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Polyline, Line } from 'react-native-svg';

interface DataPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

interface ThreeAxisPlotProps {
  data: DataPoint[];
  width: number;
  height: number;
  title: string;
  colorX?: string;
  colorY?: string;
  colorZ?: string;
}

function getPolylinePoints(data: Array<{ t: number; v: number }>, width: number, height: number) {
  if (data.length === 0) return '';
  const tMin = data[0].t;
  const tMax = data[data.length - 1].t;
  const vMin = Math.min(...data.map(d => d.v));
  const vMax = Math.max(...data.map(d => d.v));
  return data.map(d => {
    const x = ((d.t - tMin) / Math.max(0.001, tMax - tMin)) * width;
    const y = height - ((d.v - vMin) / Math.max(0.001, vMax - vMin)) * height;
    return `${x},${y}`;
  }).join(' ');
}

export default function ThreeAxisPlot({
  data,
  width,
  height,
  title,
  colorX = '#4af',
  colorY = '#fa4',
  colorZ = '#0fa',
}: ThreeAxisPlotProps) {
  const xPoints = getPolylinePoints(data.map(d => ({ t: d.t, v: d.x })), width, height);
  const yPoints = getPolylinePoints(data.map(d => ({ t: d.t, v: d.y })), width, height);
  const zPoints = getPolylinePoints(data.map(d => ({ t: d.t, v: d.z })), width, height);
  const allVals = data.flatMap(d => [d.x, d.y, d.z]);
  const vMin = allVals.length ? Math.min(...allVals) : -1;
  const vMax = allVals.length ? Math.max(...allVals) : 1;
  const tMax = data.length > 0 ? data[data.length - 1].t : 0.0;

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{title}</Text>
        <Text style={{ color: colorX, fontWeight: 'bold', marginLeft: 12, marginRight: 4 }}>x</Text>
        <Text style={{ color: colorY, fontWeight: 'bold', marginHorizontal: 4 }}>y</Text>
        <Text style={{ color: colorZ, fontWeight: 'bold', marginHorizontal: 4 }}>z</Text>
      </View>
      <View style={{ position: 'relative' }}>
        <Svg width={width} height={height} style={{ backgroundColor: '#222', borderRadius: 8 }}>
          <Polyline points={xPoints} fill="none" stroke={colorX} strokeWidth="2" />
          <Polyline points={yPoints} fill="none" stroke={colorY} strokeWidth="2" />
          <Polyline points={zPoints} fill="none" stroke={colorZ} strokeWidth="2" />
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
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>{tMax.toFixed(1)}</Text>
      </View>
    </View>
  );
}
