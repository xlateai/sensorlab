import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions } from 'react-native';
import PlayPauseButton from '@/components/ui/play-pause-button';
import SensorlibModule from 'sensorlib';

const WIDTH = 128;
const HEIGHT = 128;
const CHANNELS = 3;
const KERNEL_SIZE = 3;
const PIXEL_SIZE = 2; // Size of each pixel in the display

// Convert RGB value (0-1) to color string
function rgbToColor(r: number, g: number, b: number): string {
  const r255 = Math.max(0, Math.min(255, Math.round(r * 255)));
  const g255 = Math.max(0, Math.min(255, Math.round(g * 255)));
  const b255 = Math.max(0, Math.min(255, Math.round(b * 255)));
  return `rgb(${r255},${g255},${b255})`;
}

export default function Convolution() {
  const [imageData, setImageData] = useState<number[]>([]);
  const [kernel, setKernel] = useState<number[]>([]);
  const [paused, setPaused] = useState(true);
  const [fps, setFps] = useState(0);
  const frameCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const animationFrameRef = useRef<number | null>(null);

  // Initialize random image and kernel
  const initialize = useCallback(() => {
    // Random RGB image (128x128x3 = 49152 values)
    const newImage = Array.from({ length: WIDTH * HEIGHT * CHANNELS }, () => Math.random());
    setImageData(newImage);
    
    // Random 3x3x3 kernel (-1 to +1)
    const newKernel = Array.from({ length: KERNEL_SIZE * KERNEL_SIZE * CHANNELS }, () => (Math.random() * 2 - 1));
    setKernel(newKernel);
  }, []);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Check if image has died out (sum is 0)
  const checkIfDead = useCallback((data: number[]): boolean => {
    const sum = data.reduce((acc, val) => acc + Math.abs(val), 0);
    return sum < 0.001; // Very small threshold
  }, []);

  // Apply convolution using Rust
  const applyConvolution = useCallback(async (inputImage: number[], inputKernel: number[]): Promise<number[]> => {
    try {
      const input = JSON.stringify({
        image: inputImage,
        kernel: inputKernel,
      });
      
      const resultJson = SensorlibModule.rustcoreConvolution(input);
      const result = JSON.parse(resultJson);
      
      if (result.error) {
        console.error('Convolution error:', result.error);
        return inputImage; // Return original on error
      }
      
      return result.result;
    } catch (error) {
      console.error('Convolution failed:', error);
      return inputImage; // Return original on error
    }
  }, []);

  // Main animation loop - runs as fast as possible
  const processingRef = useRef(false);
  const currentImageRef = useRef<number[]>([]);
  const currentKernelRef = useRef<number[]>([]);

  useEffect(() => {
    currentImageRef.current = imageData;
  }, [imageData]);

  useEffect(() => {
    currentKernelRef.current = kernel;
  }, [kernel]);

  useEffect(() => {
    if (paused) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return;
    }

    let isRunning = true;
    
    const animate = async () => {
      if (!isRunning) return;
      
      const now = Date.now();
      frameCountRef.current++;
      
      // Update FPS every second
      if (now - lastFpsUpdateRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
      
      // Apply convolution as fast as possible (don't wait for previous to finish)
      if (!processingRef.current) {
        processingRef.current = true;
        const imageToProcess = [...currentImageRef.current];
        const kernelToUse = [...currentKernelRef.current];
        
        applyConvolution(imageToProcess, kernelToUse).then((newImage) => {
          processingRef.current = false;
          
          // Check if dead
          if (checkIfDead(newImage)) {
            initialize();
            return;
          }
          
          setImageData(newImage);
        }).catch(() => {
          processingRef.current = false;
        });
      }
      
      if (isRunning) {
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationFrameRef.current = requestAnimationFrame(animate);
    
    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [paused, applyConvolution, checkIfDead, initialize]);

  // Convert image data to rows for rendering
  const imageRows = useMemo(() => {
    if (imageData.length === 0) return [];
    
    const rows: Array<Array<{ r: number; g: number; b: number }>> = [];
    for (let y = 0; y < HEIGHT; y++) {
      const row: Array<{ r: number; g: number; b: number }> = [];
      for (let x = 0; x < WIDTH; x++) {
        const idx = (y * WIDTH + x) * CHANNELS;
        row.push({
          r: imageData[idx] || 0,
          g: imageData[idx + 1] || 0,
          b: imageData[idx + 2] || 0,
        });
      }
      rows.push(row);
    }
    return rows;
  }, [imageData]);

  const renderRow = useCallback(({ item: row, index: y }: { item: Array<{ r: number; g: number; b: number }>, index: number }) => {
    return (
      <View style={styles.row}>
        {row.map((pixel, x) => (
          <View
            key={`${y}-${x}`}
            style={[
              styles.pixel,
              { backgroundColor: rgbToColor(pixel.r, pixel.g, pixel.b) }
            ]}
          />
        ))}
      </View>
    );
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.fpsText}>FPS: {fps}</Text>
      
      <View style={styles.imageContainer}>
        <FlatList
          data={imageRows}
          renderItem={renderRow}
          keyExtractor={(_, index) => `row-${index}`}
          scrollEnabled={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={10}
        />
      </View>
      
      <PlayPauseButton
        paused={paused}
        onToggle={() => setPaused(p => !p)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 16,
  },
  fpsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  imageContainer: {
    width: WIDTH * PIXEL_SIZE,
    height: HEIGHT * PIXEL_SIZE,
    backgroundColor: '#111',
    borderRadius: 8,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
  },
  pixel: {
    width: PIXEL_SIZE,
    height: PIXEL_SIZE,
  },
});
