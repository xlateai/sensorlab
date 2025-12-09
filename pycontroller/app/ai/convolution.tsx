import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import PlayPauseButton from '@/components/ui/play-pause-button';
import SensorlibModule from 'sensorlib';

const DEFAULT_RESOLUTION = 32;
const CHANNELS = 3;
const KERNEL_SIZE = 3;
const FIXED_IMAGE_SIZE = 160; // Fixed size in pixels (20% bigger than 32*4 = 128)

// Convert RGB value (0-1) to color string
function rgbToColor(r: number, g: number, b: number): string {
  const r255 = Math.max(0, Math.min(255, Math.round(r * 255)));
  const g255 = Math.max(0, Math.min(255, Math.round(g * 255)));
  const b255 = Math.max(0, Math.min(255, Math.round(b * 255)));
  return `rgb(${r255},${g255},${b255})`;
}

// Settings dropdown component
function SettingsMenu({
  width,
  height,
  backend,
  onWidthChange,
  onHeightChange,
  onBackendChange,
  onApply,
}: {
  width: number;
  height: number;
  backend: 'Rust' | 'Metal';
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onBackendChange: (backend: 'Rust' | 'Metal') => void;
  onApply: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [tempWidth, setTempWidth] = useState(width.toString());
  const [tempHeight, setTempHeight] = useState(height.toString());
  const [tempBackend, setTempBackend] = useState(backend);
  const backends: Array<'Rust' | 'Metal'> = ['Rust', 'Metal'];

  const handleOpen = () => {
    setTempWidth(width.toString());
    setTempHeight(height.toString());
    setTempBackend(backend);
    setShowSettings(true);
  };

  const handleApply = () => {
    const widthNum = parseInt(tempWidth, 10);
    const heightNum = parseInt(tempHeight, 10);
    
    if (!isNaN(widthNum) && widthNum > 0 && widthNum <= 256) {
      onWidthChange(widthNum);
    }
    if (!isNaN(heightNum) && heightNum > 0 && heightNum <= 256) {
      onHeightChange(heightNum);
    }
    onBackendChange(tempBackend);
    onApply();
    setShowSettings(false);
  };

  return (
    <>
      <Pressable
        onPress={handleOpen}
        style={{
          backgroundColor: '#39ff14',
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 8,
        }}
        android_ripple={null}
      >
        <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
          Settings
        </Text>
      </Pressable>
      <Modal
        visible={showSettings}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setShowSettings(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 12,
              padding: 20,
              width: '85%',
              maxHeight: '70%',
              borderWidth: 1,
              borderColor: '#39ff14',
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' }}>
              Settings
            </Text>
            
            {/* Table-like layout */}
            <View style={{ marginBottom: 20 }}>
              {/* Width row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 80 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>Width:</Text>
                </View>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: '#333',
                    color: '#fff',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 4,
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: '#39ff14',
                    marginLeft: 12,
                  }}
                  value={tempWidth}
                  onChangeText={setTempWidth}
                  keyboardType="numeric"
                  selectTextOnFocus
                  placeholder="32"
                  placeholderTextColor="#888"
                />
              </View>
              
              {/* Height row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 80 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>Height:</Text>
                </View>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: '#333',
                    color: '#fff',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 4,
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: '#39ff14',
                    marginLeft: 12,
                  }}
                  value={tempHeight}
                  onChangeText={setTempHeight}
                  keyboardType="numeric"
                  selectTextOnFocus
                  placeholder="32"
                  placeholderTextColor="#888"
                />
              </View>
              
              {/* Backend row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 80 }}>
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '500' }}>Backend:</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  {backends.map((b) => (
                    <Pressable
                      key={b}
                      onPress={() => setTempBackend(b)}
                      style={{
                        backgroundColor: tempBackend === b ? '#39ff14' : '#333',
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: 6,
                        marginBottom: 8,
                      }}
                      android_ripple={null}
                    >
                      <Text
                        style={{
                          color: tempBackend === b ? '#000' : '#fff',
                          textAlign: 'center',
                          fontWeight: '600',
                          fontSize: 14,
                        }}
                      >
                        {b}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            
            {/* Apply button at bottom right */}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <Pressable
                onPress={() => setShowSettings(false)}
                style={{
                  backgroundColor: '#333',
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 8,
                }}
                android_ripple={null}
              >
                <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleApply}
                style={{
                  backgroundColor: '#39ff14',
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  borderRadius: 8,
                }}
                android_ripple={null}
              >
                <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
                  Apply
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function Convolution() {
  const [width, setWidth] = useState(DEFAULT_RESOLUTION);
  const [height, setHeight] = useState(DEFAULT_RESOLUTION);
  const [backend, setBackend] = useState<'Rust' | 'Metal'>('Rust');
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

  // Initialize image and kernel
  const initializeImage = useCallback(() => {
    // Clean up old state first
    try {
      const cleanupInput = JSON.stringify({
        context_id: contextIdRef.current,
      });
      SensorlibModule.rustcoreConvolutionCleanup(cleanupInput);
    } catch (error) {
      // Ignore cleanup errors
    }
    
    // Random RGB image
    const newImage = Array.from({ length: width * height * CHANNELS }, () => Math.random());
    // Random 3x3x3 kernel (-1 to +1)
    const newKernel = Array.from({ length: KERNEL_SIZE * KERNEL_SIZE * CHANNELS }, () => (Math.random() * 2 - 1));
    
    setImageData(newImage);
    setKernel(newKernel);
    
    // Initialize Rust state
    if (initConvolution(newImage, newKernel)) {
      setImageData(newImage);
    }
  }, [width, height, initConvolution]);

  // Initialize on mount or when resolution changes
  useEffect(() => {
    initializeImage();
  }, [initializeImage]);

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
            // Pause and clear image (leave black)
            setPaused(true);
            setImageData(Array(width * height * CHANNELS).fill(0));
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
  }, [paused, applyConvolutionStep, checkIfDead, width, height]);

  // Handle play button - initialize if image is dead/black
  const handlePlayPause = useCallback(() => {
    if (paused) {
      // Check if image is dead/black
      const isDead = imageData.length === 0 || imageData.every(v => Math.abs(v) < 0.001);
      if (isDead) {
        // Re-initialize before starting
        initializeImage();
      }
      setPaused(false);
    } else {
      setPaused(true);
    }
  }, [paused, imageData, initializeImage]);

  // Handle settings apply
  const handleSettingsApply = useCallback(() => {
    // Settings are applied in the SettingsMenu component
    // This callback is just to trigger re-initialization if needed
    initializeImage();
  }, [initializeImage]);

  // Reset button handler
  const handleReset = useCallback(() => {
    setPaused(true);
    initializeImage();
  }, [initializeImage]);

  // Calculate pixel size based on dimensions (to fit in fixed size, maintaining aspect ratio)
  const aspectRatio = width / height;
  const displayWidth = aspectRatio >= 1 ? FIXED_IMAGE_SIZE : FIXED_IMAGE_SIZE * aspectRatio;
  const displayHeight = aspectRatio >= 1 ? FIXED_IMAGE_SIZE / aspectRatio : FIXED_IMAGE_SIZE;
  const pixelSizeX = displayWidth / width;
  const pixelSizeY = displayHeight / height;

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

  // Convert kernel to 3x3 grid for visualization
  const kernelGrid = useMemo(() => {
    if (kernel.length === 0) return [];
    const grid: Array<Array<{ r: number; g: number; b: number }>> = [];
    for (let ky = 0; ky < KERNEL_SIZE; ky++) {
      const row: Array<{ r: number; g: number; b: number }> = [];
      for (let kx = 0; kx < KERNEL_SIZE; kx++) {
        const idx = (ky * KERNEL_SIZE + kx) * CHANNELS;
        row.push({
          r: kernel[idx] || 0,
          g: kernel[idx + 1] || 0,
          b: kernel[idx + 2] || 0,
        });
      }
      grid.push(row);
    }
    return grid;
  }, [kernel]);

  return (
    <View style={styles.container}>
      <Text style={styles.fpsText}>FPS: {fps}</Text>
      
      {/* Image Display */}
      <View style={[styles.imageContainer, { width: displayWidth, height: displayHeight }]}>
        <View style={[styles.pixelGrid, { width: displayWidth, height: displayHeight }]}>
          {pixelColors.map((color, idx) => {
            const y = Math.floor(idx / width);
            const x = idx % width;
            return (
              <View
                key={`pixel-${idx}`}
                style={[
                  {
                    width: pixelSizeX,
                    height: pixelSizeY,
                    backgroundColor: color,
                    position: 'absolute',
                    left: x * pixelSizeX,
                    top: y * pixelSizeY,
                  }
                ]}
              />
            );
          })}
        </View>
      </View>
      
      {/* Kernel Visualization */}
      <View style={styles.kernelContainer}>
        <Text style={styles.kernelLabel}>Kernel (3x3 RGB):</Text>
        <View style={styles.kernelGrid}>
          {kernelGrid.map((row, rowIdx) => (
            <View key={`row-${rowIdx}`} style={styles.kernelRow}>
              {row.map((pixel, colIdx) => (
                <View
                  key={`kernel-${rowIdx}-${colIdx}`}
                  style={[
                    styles.kernelPixel,
                    {
                      backgroundColor: rgbToColor(
                        (pixel.r + 1) / 2, // Normalize from [-1,1] to [0,1]
                        (pixel.g + 1) / 2,
                        (pixel.b + 1) / 2
                      ),
                    }
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>
      
      <View style={styles.buttonRow}>
        <PlayPauseButton
          paused={paused}
          onToggle={handlePlayPause}
        />
        <Pressable
          onPress={handleReset}
          style={styles.resetButton}
          android_ripple={null}
        >
          <Text style={styles.resetButtonIcon}>↻</Text>
        </Pressable>
      </View>
      
      {/* Settings */}
      <SettingsMenu
        width={width}
        height={height}
        backend={backend}
        onWidthChange={setWidth}
        onHeightChange={setHeight}
        onBackendChange={setBackend}
        onApply={handleSettingsApply}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 16,
    padding: 16,
  },
  fpsText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
    justifyContent: 'center',
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  resolutionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resolutionInput: {
    backgroundColor: '#333',
    color: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    minWidth: 50,
    textAlign: 'center',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#39ff14',
  },
  resolutionLabel: {
    color: '#888',
    fontSize: 12,
  },
  submitButton: {
    backgroundColor: '#39ff14',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  submitButtonText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  resetButton: {
    backgroundColor: '#333',
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#39ff14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  resetButtonIcon: {
    color: '#39ff14',
    fontSize: 24,
    fontWeight: 'bold',
  },
  controlsContainer: {
    width: '100%',
    gap: 16,
    marginTop: 8,
  },
  backendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
  },
  imageContainer: {
    backgroundColor: '#111',
    borderRadius: 8,
    overflow: 'hidden',
  },
  pixelGrid: {
    position: 'relative',
  },
  kernelContainer: {
    alignItems: 'center',
    gap: 8,
  },
  kernelLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  kernelGrid: {
    gap: 2,
  },
  kernelRow: {
    flexDirection: 'row',
    gap: 2,
  },
  kernelPixel: {
    width: 24,
    height: 24,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: '#333',
  },
});
