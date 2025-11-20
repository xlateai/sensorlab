
import React, { useRef, useState, useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import Svg, { Circle, Line, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer } from 'expo-sensors';

const PIXEL_WIDTH = 256;
const BUFFER_SIZE = 16;

export default function ModeZero() {
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
  // Generate 6 permutations of [X, Y, Z] mapped to [R, G, B]
  const permutations: [string, string, string][] = [
    ["x", "y", "z"],
    ["x", "z", "y"],
    ["y", "x", "z"],
    ["y", "z", "x"],
    ["z", "x", "y"],
    ["z", "y", "x"],
  ];

  // Compute RGB for each permutation
  const getRGB = (order: [string, string, string]) => {
    if (!magnetometer) return [128,128,128];
    const norm = (val: number, min: number, max: number) => {
      if (max === min) return 0.5;
      return Math.max(0, Math.min(1, (val - min) / (max - min)));
    };
    const values: Record<string, number> = {
      x: norm(magnetometer.x, minMax.minX, minMax.maxX),
      y: norm(magnetometer.y, minMax.minY, minMax.maxY),
      z: norm(magnetometer.z, minMax.minZ, minMax.maxZ),
    };
    return order.map(axis => Math.round(values[axis] * 255));
  };

  // Hexagon layout
  const radius = 40;
  const circleSize = 28;
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

  // Prepare colors for each vertex
  const colors = permutations.map(getRGB);

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={svgSize} height={svgSize}>
        <Defs>
          {hexPoints.map((pt, i) => {
            const nextIdx = (i + 1) % 6;
            const colorA = colors[i];
            const colorB = colors[nextIdx];
            return (
              <LinearGradient
                key={`grad${i}`}
                id={`grad${i}`}
                x1={pt.x}
                y1={pt.y}
                x2={hexPoints[nextIdx].x}
                y2={hexPoints[nextIdx].y}
              >
                <Stop offset="0%" stopColor={`rgb(${colorA[0]},${colorA[1]},${colorA[2]})`} />
                <Stop offset="100%" stopColor={`rgb(${colorB[0]},${colorB[1]},${colorB[2]})`} />
              </LinearGradient>
            );
          })}
        </Defs>
        {/* Draw hexagon links with blended gradients */}
        {hexPoints.map((pt, i) => {
          const nextIdx = (i + 1) % 6;
          return (
            <Line
              key={`line${i}`}
              x1={pt.x}
              y1={pt.y}
              x2={hexPoints[nextIdx].x}
              y2={hexPoints[nextIdx].y}
              stroke={`url(#grad${i})`}
              strokeWidth={6}
            />
          );
        })}
        {/* Draw circles at vertices */}
        {hexPoints.map((pt, i) => (
          <Circle
            key={`circle${i}`}
            cx={pt.x}
            cy={pt.y}
            r={circleSize / 2}
            fill={`rgb(${colors[i][0]},${colors[i][1]},${colors[i][2]})`}
          />
        ))}
      </Svg>
    </View>
  );
}