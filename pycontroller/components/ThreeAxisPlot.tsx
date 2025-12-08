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
  min?: number;
  max?: number;
  averageData?: DataPoint[];
  colorAverage?: string;
}

function getPolylinePoints(data: Array<{ v: number }>, width: number, height: number, vMin?: number, vMax?: number) {
  if (data.length === 0) return '';
  const min = vMin !== undefined ? vMin : Math.min(...data.map(d => d.v));
  const max = vMax !== undefined ? vMax : Math.max(...data.map(d => d.v));
  return data.map((d, i) => {
    const x = (i / Math.max(1, data.length - 1)) * width;
    const y = height - ((d.v - min) / Math.max(0.001, max - min)) * height;
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
  min,
  max,
  averageData,
  colorAverage = '#fff',
}: ThreeAxisPlotProps) {
  const tMax = data.length > 0 ? data.length - 1 : 0;
  // For axis labels, use min/max across all axes (including average if present)
  const allVals = data.flatMap(d => [d.x, d.y, d.z]);
  const avgVals = averageData ? averageData.map(d => (d.x + d.y + d.z) / 3) : [];
  const allValsWithAvg = [...allVals, ...avgVals];
  const vMin = typeof min === 'number' ? min : (allValsWithAvg.length ? Math.min(...allValsWithAvg) : -1);
  const vMax = typeof max === 'number' ? max : (allValsWithAvg.length ? Math.max(...allValsWithAvg) : 1);
  
  const xPoints = getPolylinePoints(data.map(d => ({ v: d.x })), width, height, vMin, vMax);
  const yPoints = getPolylinePoints(data.map(d => ({ v: d.y })), width, height, vMin, vMax);
  const zPoints = getPolylinePoints(data.map(d => ({ v: d.z })), width, height, vMin, vMax);
  
  // Average line points (average of x, y, z at each time point)
  const avgPoints = averageData 
    ? getPolylinePoints(averageData.map(d => ({ v: (d.x + d.y + d.z) / 3 })), width, height, vMin, vMax)
    : '';

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 24 }}>{title}</Text>
        <Text style={{ color: colorX, fontWeight: 'bold', marginLeft: 12, marginRight: 4 }}>x</Text>
        <Text style={{ color: colorY, fontWeight: 'bold', marginHorizontal: 4 }}>y</Text>
        <Text style={{ color: colorZ, fontWeight: 'bold', marginHorizontal: 4 }}>z</Text>
        {averageData && (
          <Text style={{ color: colorAverage, fontWeight: 'bold', marginHorizontal: 4, fontSize: 16 }}>avg</Text>
        )}
      </View>
      <View style={{ position: 'relative' }}>
        <Svg width={width} height={height} style={{ backgroundColor: '#222', borderRadius: 8 }}>
          <Polyline points={xPoints} fill="none" stroke={colorX} strokeWidth="2" />
          <Polyline points={yPoints} fill="none" stroke={colorY} strokeWidth="2" />
          <Polyline points={zPoints} fill="none" stroke={colorZ} strokeWidth="2" />
          {avgPoints && (
            <Polyline points={avgPoints} fill="none" stroke={colorAverage} strokeWidth="2" strokeDasharray="4 2" opacity={0.8} />
          )}
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
