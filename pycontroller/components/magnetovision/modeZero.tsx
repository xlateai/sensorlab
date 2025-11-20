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

  // Helper to normalize magnetometer values to [-1, +1]
  const norm = (val: number, min: number, max: number) => {
    if (max === min) return 0;
    // Map val from [min, max] to [-1, +1]
    return ((val - min) / (max - min)) * 2 - 1;
  };

  // 3x3 kernel (static random values)
  const KERNEL_SIZE = 3;
  const kernel = useMemo(() => {
    const arr: number[][] = [];
    for (let i = 0; i < KERNEL_SIZE; i++) {
      arr[i] = [];
      for (let j = 0; j < KERNEL_SIZE; j++) {
        arr[i][j] = Math.random();
      }
    }
    return arr;
  }, []);

  // Buffer for last 9 magnetometer readings
  const [convBuffer, setConvBuffer] = useState<{x: number, y: number, z: number}[]>([]);

  // On each magnetometer update, add to convBuffer, keep last 9
  useEffect(() => {
    if (magnetometer) {
      setConvBuffer(prev => {
        const next = [...prev, magnetometer];
        if (next.length > 9) next.shift();
        return next;
      });
    }
  }, [magnetometer]);


  // 8x8 grid setup
  const GRID_SIZE = 8;
  const squareSize = screenWidth / GRID_SIZE;

  if (!isFocused) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  // Convolve kernel with last 9 magnetometer readings
  // For each grid square, use the convolution result as RGB
  // If not enough history, use gray
  const getConvolvedRGB = () => {
    if (convBuffer.length < 9) return [0, 0, 0];
    // Flatten kernel and buffer
    const flatKernel = kernel.flat();
    const flatBuffer = convBuffer;
    // Convolve for each channel, normalized to [-1, +1]
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 9; i++) {
      r += flatKernel[i] * norm(flatBuffer[i].x, minMax.minX, minMax.maxX);
      g += flatKernel[i] * norm(flatBuffer[i].y, minMax.minY, minMax.maxY);
      b += flatKernel[i] * norm(flatBuffer[i].z, minMax.minZ, minMax.maxZ);
    }
    // Weighted average (sum of kernel weights)
    const kernelSum = flatKernel.reduce((a, b) => a + b, 0) || 1;
    r /= kernelSum;
    g /= kernelSum;
    b /= kernelSum;
    return [r, g, b]; // still in [-1, +1]
  };

  // For plotting, scale all grid squares relative to each other
  // Here, all squares use the same value, but we could extend to per-square convolution
  const [convR, convG, convB] = getConvolvedRGB();

  // Map [-1, +1] to [0, 255] for display
  const mapColor = (v: number) => Math.round((v + 1) * 0.5 * 255);

  // Render grid
  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <View style={{ width: screenWidth, height: squareSize * GRID_SIZE, flexDirection: 'column' }}>
        {Array.from({ length: GRID_SIZE }).map((_, row) => (
          <View key={row} style={{ flexDirection: 'row' }}>
            {Array.from({ length: GRID_SIZE }).map((_, col) => {
              // All squares use the same convolved color for now
              const color = `rgb(${mapColor(convR)},${mapColor(convG)},${mapColor(convB)})`;
              return (
                <View
                  key={col}
                  style={{
                    width: squareSize,
                    height: squareSize,
                    backgroundColor: color,
                    borderWidth: 1,
                    borderColor: 'rgba(0,0,0,1.0)', // faint black grid line
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}