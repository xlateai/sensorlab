import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Dimensions } from 'react-native';
import { View } from 'react-native';
import { Magnetometer } from 'expo-sensors';

const PIXEL_WIDTH = 256;

export default function VideoScreen() {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  // Calculate pixel height based on aspect ratio
  const pixelHeight = Math.round((screenHeight / screenWidth) * PIXEL_WIDTH);
  // Calculate pixel size to fill viewport
  const pixelSize = screenWidth / PIXEL_WIDTH;
  const canvasHeight = pixelHeight * pixelSize;

  const BUFFER_SIZE = 256;
  // ...existing code...
  // Magnetometer buffer
  const bufferRef = useRef<{x: number, y: number, z: number}[]>([]);
  const [magnetometer, setMagnetometer] = useState<{x: number, y: number, z: number} | null>(null);

  useEffect(() => {
    const sub = Magnetometer.addListener(data => {
      bufferRef.current.push(data);
      if (bufferRef.current.length > BUFFER_SIZE) bufferRef.current.shift();
      setMagnetometer(data);
    });
    Magnetometer.setUpdateInterval(24);
    return () => { sub && sub.remove(); };
  }, []);

  // Compute min/max for normalization
  const [minMax, setMinMax] = useState({
    minX: 0, maxX: 1,
    minY: 0, maxY: 1,
    minZ: 0, maxZ: 1,
  });

  useEffect(() => {
    const buf = bufferRef.current;
    if (buf.length === 0) return;
    let minX = buf[0].x, maxX = buf[0].x;
    let minY = buf[0].y, maxY = buf[0].y;
    let minZ = buf[0].z, maxZ = buf[0].z;
    for (const v of buf) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    setMinMax({ minX, maxX, minY, maxY, minZ, maxZ });
  }, [magnetometer]);

  // Get normalized RGB from latest sample
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
  const color = `rgb(${r},${g},${b})`;

  // Fill every pixel with the same color
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ width: screenWidth, height: canvasHeight, flexDirection: 'column' }}>
        {Array.from({ length: pixelHeight }).map((_, y) => (
          <View key={y} style={{ width: screenWidth, height: pixelSize, backgroundColor: color }} />
        ))}
      </View>
    </View>
  );
}
