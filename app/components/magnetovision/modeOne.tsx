import React, { useRef, useState, useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import Svg, { Circle, Line, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer } from 'expo-sensors';

const PIXEL_WIDTH = 256;
const BUFFER_SIZE = 16;

export default function ModeOne() {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const pixelHeight = Math.round((screenHeight / screenWidth) * PIXEL_WIDTH);
  const pixelSize = screenWidth / PIXEL_WIDTH;
  const canvasHeight = pixelHeight * pixelSize;

  const bufferRef = useRef<{x: number, y: number, z: number}[]>([]);
  const magnetometerRef = useRef<{x: number, y: number, z: number} | null>(null);
  const [buffer, setBuffer] = useState<{x: number, y: number, z: number}[]>([]);
  const [magnetometer, setMagnetometer] = useState<{x: number, y: number, z: number} | null>(null);


  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    React.useCallback(() => {
      setIsFocused(true);
      const sub = Magnetometer.addListener(data => {
        bufferRef.current.push(data);
        if (bufferRef.current.length > BUFFER_SIZE) bufferRef.current.shift();
        magnetometerRef.current = data;
      });
      Magnetometer.setUpdateInterval(24);
      const interval = setInterval(() => {
        setBuffer([...bufferRef.current]);
        setMagnetometer(magnetometerRef.current);
      }, 33);
      return () => {
        setIsFocused(false);
        sub && sub.remove();
        clearInterval(interval);
      };
    }, [])
  );

  const [minMax, setMinMax] = useState({
    minX: 0, maxX: 1,
    minY: 0, maxY: 1,
    minZ: 0, maxZ: 1,
  });

  useEffect(() => {
    if (buffer.length === 0) return;
    let minX = buffer[0].x, maxX = buffer[0].x;
    let minY = buffer[0].y, maxY = buffer[0].y;
    let minZ = buffer[0].z, maxZ = buffer[0].z;
    for (const v of buffer) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    setMinMax({ minX, maxX, minY, maxY, minZ, maxZ });
  }, [buffer]);

  // Interpolate between colors for smooth transitions
  const prevRGBRef = useRef<[number, number, number]>([0, 0, 0]);
  let r = 0, g = 0, b = 0;
  if (magnetometer !== null) {
    const norm = (val: number, min: number, max: number) => {
      if (max === min) return 0.5;
      return Math.max(0, Math.min(1, (val - min) / (max - min)));
    };
    r = Math.round(norm(magnetometer.x, minMax.minX, minMax.maxX) * 255);
    g = Math.round(norm(magnetometer.y, minMax.minY, minMax.maxY) * 255);
    b = Math.round(norm(magnetometer.z, minMax.minZ, minMax.maxZ) * 255);
  }
  // Blend previous and current RGB
  const blend = 0.2; // 0 = no smoothing, 1 = full smoothing
  const prev = prevRGBRef.current;
  const smoothR = Math.round(prev[0] * (1 - blend) + r * blend);
  const smoothG = Math.round(prev[1] * (1 - blend) + g * blend);
  const smoothB = Math.round(prev[2] * (1 - blend) + b * blend);
  prevRGBRef.current = [smoothR, smoothG, smoothB];
  const currentPixel = `rgb(${smoothR},${smoothG},${smoothB})`;


  if (!isFocused) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }
  // Hexagon layout
  const radius = 60;
  const circleSize = 10;
  const svgSize = radius * 2 + circleSize;
  const centerX = svgSize / 2;
  const centerY = svgSize / 2;
  const hexPoints = Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  });

  // All segments use the same color, RGB = normalized XYZ
  const segmentColor = `rgb(${smoothR},${smoothG},${smoothB})`;

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={svgSize} height={svgSize}>
        {/* Draw hexagon links as thick rectangles, all the same color */}
        {hexPoints.map((pt, i) => {
          const nextIdx = (i + 1) % 6;
          const x1 = pt.x;
          const y1 = pt.y;
          const x2 = hexPoints[nextIdx].x;
          const y2 = hexPoints[nextIdx].y;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          // Overlap a bit at the ends for seamless connection
          const overlap = 8;
          const extendedLength = length + overlap;
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          return (
            <Rect
              key={`rect${i}`}
              x={midX - extendedLength / 2}
              y={midY - 5}
              width={extendedLength}
              height={10}
              fill={segmentColor}
              rx={5}
              transform={`rotate(${angle},${midX},${midY})`}
            />
          );
        })}
        {/* Add circles at each hexagon vertex to fill gaps */}
        {hexPoints.map((pt, i) => (
          <Circle
            key={`circle${i}`}
            cx={pt.x}
            cy={pt.y}
            r={5}
            fill={segmentColor}
          />
        ))}
        {/* Draw thin lines from top left, top right, and bottom to center using segmentColor, fully opaque */}
        <Line
          x1={hexPoints[5].x}
          y1={hexPoints[5].y}
          x2={centerX}
          y2={centerY}
          stroke={segmentColor}
          strokeWidth={2}
          opacity={1}
        />
        <Line
          x1={hexPoints[1].x}
          y1={hexPoints[1].y}
          x2={centerX}
          y2={centerY}
          stroke={segmentColor}
          strokeWidth={2}
          opacity={1}
        />
        <Line
          x1={hexPoints[3].x}
          y1={hexPoints[3].y}
          x2={centerX}
          y2={centerY}
          stroke={segmentColor}
          strokeWidth={2}
          opacity={1}
        />
        {/* Add a smaller center dot */}
        <Circle
          cx={centerX}
          cy={centerY}
          r={1}
          fill={segmentColor}
        />
      </Svg>
    </View>
  );
}
