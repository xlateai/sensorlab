import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import Svg, { Polyline, Line } from 'react-native-svg';

interface WaveformPlotProps {
  data: Array<{ t: number; value: number }>;
  width?: number;
  height?: number;
  color?: string;
  duration?: number; // Duration in seconds to display
}

export default function WaveformPlot({
  data,
  width,
  height = 120,
  color = '#39ff14',
  duration = 3,
}: WaveformPlotProps) {
  const screenWidth = Dimensions.get('window').width;
  const plotWidth = width || screenWidth - 48; // Account for padding
  const plotHeight = height;

  // Filter data to only show the last `duration` seconds
  const now = data.length > 0 ? data[data.length - 1]?.t : 0;
  const cutoff = now - duration;
  const filteredData = data.filter(point => point.t >= cutoff);

  // Generate polyline points
  const getPolylinePoints = () => {
    if (filteredData.length === 0) return '';
    
    const values = filteredData.map(d => d.value);
    const vMin = Math.min(...values);
    const vMax = Math.max(...values);
    const range = Math.max(0.001, vMax - vMin);

    return filteredData.map((d, i) => {
      const x = (i / Math.max(1, filteredData.length - 1)) * plotWidth;
      const y = plotHeight - ((d.value - vMin) / range) * plotHeight;
      return `${x},${y}`;
    }).join(' ');
  };

  const points = getPolylinePoints();
  const values = filteredData.map(d => d.value);
  const vMin = filteredData.length > 0 ? Math.min(...values) : 0;
  const vMax = filteredData.length > 0 ? Math.max(...values) : 1;

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Microphone Waveform</Text>
        <Text style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>
          {filteredData.length > 0 ? `${filteredData.length} samples` : 'No data'}
        </Text>
      </View>
      <View style={{ position: 'relative' }}>
        <Svg width={plotWidth} height={plotHeight} style={{ backgroundColor: '#111', borderRadius: 8 }}>
          {points && (
            <Polyline 
              points={points} 
              fill="none" 
              stroke={color} 
              strokeWidth="2" 
            />
          )}
          {/* Zero line */}
          <Line 
            x1={0} 
            y1={plotHeight / 2} 
            x2={plotWidth} 
            y2={plotHeight / 2} 
            stroke="#444" 
            strokeDasharray="4 2" 
            strokeWidth="1" 
          />
          {/* Axes */}
          <Line x1={0} y1={plotHeight} x2={plotWidth} y2={plotHeight} stroke="#444" strokeWidth="1" />
          <Line x1={0} y1={0} x2={0} y2={plotHeight} stroke="#444" strokeWidth="1" />
        </Svg>
        {/* Y-axis labels */}
        {filteredData.length > 0 && (
          <>
            <Text style={{ position: 'absolute', right: 4, top: 0, color: '#888', fontSize: 10 }}>
              {vMax.toFixed(3)}
            </Text>
            <Text style={{ position: 'absolute', right: 4, bottom: 0, color: '#888', fontSize: 10 }}>
              {vMin.toFixed(3)}
            </Text>
          </>
        )}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ color: '#888', fontSize: 10 }}>0s</Text>
        <Text style={{ color: '#888', fontSize: 10 }}>{duration}s</Text>
      </View>
    </View>
  );
}

