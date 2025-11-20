import React, { useRef, useState, useEffect } from 'react';
import { Dimensions, View } from 'react-native';
import { Text } from 'react-native';
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

  // Kernel is last 9 magnetometer samples (flattened)
  const KERNEL_SIZE = 3;
  // No need for random kernel, will use convBuffer

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

  // Initial randomized grid
  const [imageGrid, setImageGrid] = useState<number[][]>(() => {
    return Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => Math.random())
    );
  });

  // On each update, apply convolution using convBuffer as kernel
  useEffect(() => {
    if (convBuffer.length < 9) return;
    // Flatten kernel: use normalized magnetometer samples
    const flatKernel = convBuffer.map((sample, i) => {
      // Use x channel for kernel value, normalized
      return norm(sample.x, minMax.minX, minMax.maxX);
    });
    // Slide over imageGrid and apply convolution
    setImageGrid(prevGrid => {
      // For each cell, apply 3x3 conv with kernel
      const newGrid = prevGrid.map((row, r) =>
        row.map((val, c) => {
          let acc = 0;
          let k = 0;
          for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
              const rr = r + dr;
              const cc = c + dc;
              if (rr >= 0 && rr < GRID_SIZE && cc >= 0 && cc < GRID_SIZE) {
                acc += prevGrid[rr][cc] * flatKernel[k];
              }
              k++;
            }
          }
          // Clamp and normalize
          return Math.max(0, Math.min(1, acc));
        })
      );
      return newGrid;
    });
  }, [convBuffer, minMax]);

  if (!isFocused) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }

  // Map [0, 1] to [0, 255] for display
  const mapColor = (v: number) => Math.round(v * 255);

  // Render grid
  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      {/* Main grid */}
      <View style={{ width: screenWidth, height: squareSize * GRID_SIZE, flexDirection: 'column' }}>
        {imageGrid.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {row.map((val, c) => {
              // Use grayscale for now, could extend to RGB
              const color = `rgb(${mapColor(val)},${mapColor(val)},${mapColor(val)})`;
              return (
                <View
                  key={c}
                  style={{
                    width: squareSize,
                    height: squareSize,
                    backgroundColor: color,
                    borderWidth: 0.25,
                    borderColor: 'rgba(0,0,0,1.0)',
                  }}
                />
              );
            })}
          </View>
        ))}
      </View>
      {/* Kernel grid below main grid */}
      <View style={{ marginTop: 16 }}>
        <View style={{ flexDirection: 'column', alignItems: 'center' }}>
          {/* Show kernel as 3x3 grid of last 9 magnetometer x values */}
          {convBuffer.length === 9 && (
            <View>
              {Array.from({ length: 3 }).map((_, row) => (
                <View key={row} style={{ flexDirection: 'row' }}>
                  {Array.from({ length: 3 }).map((_, col) => {
                    const idx = row * 3 + col;
                    const sample = convBuffer[idx];
                    return (
                      <View
                        key={col}
                        style={{
                          width: 32,
                          height: 32,
                          backgroundColor: '#222',
                          borderWidth: 1,
                          borderColor: 'rgba(0,0,0,0.3)',
                          justifyContent: 'center',
                          alignItems: 'center',
                          margin: 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 10, textAlign: 'center' }}>{sample.x.toFixed(2)}</Text>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}