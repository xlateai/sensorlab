import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer } from 'expo-sensors';

const PIXEL_WIDTH = 256;
const BUFFER_SIZE = 64;

export default function ModeThree() {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const pixelHeight = Math.round((screenHeight / screenWidth) * PIXEL_WIDTH);
  const pixelSize = screenWidth / PIXEL_WIDTH;
  const canvasHeight = pixelHeight * pixelSize;

  const bufferRef = useRef<{x: number, y: number, z: number}[]>([]);
  const magnetometerRef = useRef<{x: number, y: number, z: number} | null>(null);
  const [buffer, setBuffer] = useState<{x: number, y: number, z: number}[]>([]);
  const [magnetometer, setMagnetometer] = useState<{x: number, y: number, z: number} | null>(null);

  // Cache of previous pixel colors for upward flow
  const pixelCacheRef = useRef<string[]>([]);
  const [pixelCache, setPixelCache] = useState<string[]>([]);

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

  // Calculate current pixel color
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
  const currentPixel = `rgb(${r},${g},${b})`;

  // Update pixel cache for upward flow
  useEffect(() => {
    if (!isFocused) return;
    // Only update cache if pixel value actually changed
    if (pixelCacheRef.current[pixelCacheRef.current.length - 1] !== currentPixel) {
      pixelCacheRef.current.push(currentPixel);
      if (pixelCacheRef.current.length > pixelHeight) pixelCacheRef.current.shift();
      setPixelCache([...pixelCacheRef.current]);
    }
  }, [currentPixel, pixelHeight, isFocused]);

  if (!isFocused) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }
  // Render exactly pixelHeight rows, filling from the most recent pixelCache values
  const bandSize = 16;
  const bands: string[] = [];
  for (let i = 0; i < pixelHeight; i += bandSize) {
    const cacheIdx = pixelCache.length - 1 - Math.floor(i / bandSize);
    bands.push(pixelCache[cacheIdx] || '#000');
  }

  // Helper to parse rgb string to array
  function parseRGB(rgb: string): [number, number, number] {
    const m = rgb.match(/rgb\((\d+),(\d+),(\d+)\)/);
    if (!m) return [0, 0, 0];
    return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  }
  // Helper to blend two rgb colors
  function blendRGB(rgb1: string, rgb2: string, t: number): string {
    const c1 = parseRGB(rgb1);
    const c2 = parseRGB(rgb2);
    const blended = c1.map((v, i) => Math.round(v * (1 - t) + c2[i] * t));
    return `rgb(${blended[0]},${blended[1]},${blended[2]})`;
  }

  return (
    <View style={{ width: screenWidth, height: canvasHeight, flexDirection: 'column' }}>
      {Array.from({ length: pixelHeight }).map((_, y) => {
        const bandIdx = Math.floor(y / bandSize);
        const bandColor = bands[bandIdx];
        const prevBandColor = bands[bandIdx - 1] || bandColor;
  // t=0 at top of band (bandColor), t=1 at bottom (prevBandColor)
  const t = 1 - ((y % bandSize) / (bandSize - 1));
  const color = blendRGB(bandColor, prevBandColor, t);
        return (
          <View
            key={y}
            style={{
              width: screenWidth,
              height: pixelSize,
              backgroundColor: color,
            }}
          />
        );
      })}
    </View>
  );
}
