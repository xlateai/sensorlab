import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer } from 'expo-sensors';

const PIXEL_WIDTH = 256;
const BUFFER_SIZE = 64;

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

  // Prepare normalized RGB from magnetometer
  let r = 128, g = 128, b = 128;
  if (magnetometer !== null) {
    const norm = (val: number, min: number, max: number) => {
      if (max === min) return 0.5;
      return Math.max(0, Math.min(1, (val - min) / (max - min)));
    };
    r = Math.round(norm(magnetometer.x, minMax.minX, minMax.maxX) * 255);
    g = Math.round(norm(magnetometer.y, minMax.minY, minMax.maxY) * 255);
    b = Math.round(norm(magnetometer.z, minMax.minZ, minMax.maxZ) * 255);
  }


  // 8x8 grid setup
  const GRID_SIZE = 8;
  const squareSize = screenWidth / GRID_SIZE;

  // Generate static random multipliers for each square (once per mount)
  const randomMultipliers = useMemo(() => {
    const arr: number[][] = [];
    for (let i = 0; i < GRID_SIZE; i++) {
      arr[i] = [];
      for (let j = 0; j < GRID_SIZE; j++) {
        arr[i][j] = 0.5 + Math.random() * 0.5; // range [0.5, 1.0]
      }
    }
    return arr;
  }, []);

  if (!isFocused) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  // Render grid
  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: screenWidth, height: squareSize * GRID_SIZE, flexDirection: 'column' }}>
        {Array.from({ length: GRID_SIZE }).map((_, row) => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {Array.from({ length: GRID_SIZE }).map((_, col) => {
              const mult = randomMultipliers[row][col];
              const color = `rgb(${Math.round(r * mult)},${Math.round(g * mult)},${Math.round(b * mult)})`;
              return (
                <View
                  key={col}
                  style={{ width: squareSize, height: squareSize, backgroundColor: color }}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}