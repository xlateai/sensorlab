import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions } from 'react-native';
import PlayPauseButton from '@/components/ui/play-pause-button';
import SensorlibModule from 'sensorlib';

const WIDTH = 32;
const HEIGHT = 32;
const CHANNELS = 3;
const KERNEL_SIZE = 3;
const PIXEL_SIZE = 4; // Size of each pixel in the display

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
  const contextIdRef = useRef(1); // Simple context ID

  // Initialize convolution state
  const initConvolution = useCallback((image: number[], kernel: number[]) => {
    try {
      const input = JSON.stringify({
        context_id: contextIdRef.current,
        image,
        kernel,
      });
      
      const resultJson = SensorlibModule.rustcoreConvolutionInit(input);
      if (!resultJson) {
        console.error('Convolution init returned null');
        return false;
      }
      
      const result = JSON.parse(resultJson);
      
      if (result.error) {
        console.error('Convolution init error:', result.error);
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Convolution init failed:', error);
      return false;
    }
  }, []);

  // Apply convolution step (stateful, no serialization overhead)
  const applyConvolutionStep = useCallback((): number[] | null => {
    try {
      const input = JSON.stringify({
        context_id: contextIdRef.current,
      });
      
      const resultJson = SensorlibModule.rustcoreConvolutionStep(input);
      if (!resultJson) {
        console.error('Convolution step returned null');
        return null;
      }
      
      const result = JSON.parse(resultJson);
      
      if (result.error) {
        console.error('Convolution step error:', result.error);
        return null;
      }
      
      if (!result.result || !Array.isArray(result.result)) {
        console.error('Convolution step returned invalid result:', result);
        return null;
      }
      
      return result.result;
    } catch (error) {
      console.error('Convolution step failed:', error);
      return null;
    }
  }, []);

  // Check if image has died out (sum is 0)
  const checkIfDead = useCallback((data: number[]): boolean => {
    const sum = data.reduce((acc, val) => acc + Math.abs(val), 0);
    return sum < 0.001; // Very small threshold
  }, []);

  // Initialize on mount
  useEffect(() => {
    const init = () => {
      // Random RGB image
      const newImage = Array.from({ length: WIDTH * HEIGHT * CHANNELS }, () => Math.random());
      // Random 3x3x3 kernel (-1 to +1)
      const newKernel = Array.from({ length: KERNEL_SIZE * KERNEL_SIZE * CHANNELS }, () => (Math.random() * 2 - 1));
      
      setImageData(newImage);
      setKernel(newKernel);
      
      // Initialize Rust state
      if (initConvolution(newImage, newKernel)) {
        setImageData(newImage);
      }
    };
    
    init();
  }, [initConvolution]);

  // Cleanup convolution state
  useEffect(() => {
    return () => {
      try {
        const input = JSON.stringify({
          context_id: contextIdRef.current,
        });
        SensorlibModule.rustcoreConvolutionCleanup(input);
      } catch (error) {
        console.error('Convolution cleanup failed:', error);
      }
    };
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
      
      // Apply convolution step (stateful, no serialization overhead)
      if (!processingRef.current) {
        processingRef.current = true;
        
        const newImage = applyConvolutionStep();
        processingRef.current = false;
        
        if (newImage) {
          // Check if dead
          if (checkIfDead(newImage)) {
            // Re-initialize
            const newImageData = Array.from({ length: WIDTH * HEIGHT * CHANNELS }, () => Math.random());
            const newKernelData = Array.from({ length: KERNEL_SIZE * KERNEL_SIZE * CHANNELS }, () => (Math.random() * 2 - 1));
            setKernel(newKernelData);
            if (initConvolution(newImageData, newKernelData)) {
              setImageData(newImageData);
            }
            return;
          }
          
          setImageData(newImage);
        }
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
  }, [paused, applyConvolutionStep, checkIfDead, initConvolution]);

  // Convert image data to a single flat array of pixel colors for faster rendering
  const pixelColors = useMemo(() => {
    if (imageData.length === 0) return [];
    const colors: string[] = [];
    for (let i = 0; i < imageData.length; i += CHANNELS) {
      colors.push(rgbToColor(
        imageData[i] || 0,
        imageData[i + 1] || 0,
        imageData[i + 2] || 0
      ));
    }
    return colors;
  }, [imageData]);

  return (
    <View style={styles.container}>
      <Text style={styles.fpsText}>FPS: {fps}</Text>
      
      <View style={styles.imageContainer}>
        <View style={styles.pixelGrid}>
          {pixelColors.map((color, idx) => {
            const y = Math.floor(idx / WIDTH);
            const x = idx % WIDTH;
            return (
              <View
                key={`pixel-${idx}`}
                style={[
                  styles.pixel,
                  {
                    backgroundColor: color,
                    position: 'absolute',
                    left: x * PIXEL_SIZE,
                    top: y * PIXEL_SIZE,
                  }
                ]}
              />
            );
          })}
        </View>
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
  pixelGrid: {
    width: WIDTH * PIXEL_SIZE,
    height: HEIGHT * PIXEL_SIZE,
    position: 'relative',
  },
  pixel: {
    width: PIXEL_SIZE,
    height: PIXEL_SIZE,
  },
});
