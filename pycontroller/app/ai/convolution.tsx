import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, Modal, Pressable, ScrollView, TextInput } from 'react-native';
import PlayPauseButton from '@/components/ui/play-pause-button';
import SensorlibModule from 'sensorlib';

// Try to import ConvolutionPixelView, with fallback if not available
let ConvolutionPixelView: React.ComponentType<any> | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - ConvolutionPixelView exported from sensorlib
  const sensorlib = require('sensorlib');
  ConvolutionPixelView = sensorlib.ConvolutionPixelView;
} catch (e) {
  // Native view not available yet - will use JavaScript fallback
  console.warn('ConvolutionPixelView not available, using JavaScript rendering');
}

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
  resolution,
  backend,
  onResolutionChange,
  onBackendChange,
  onApply,
}: {
  resolution: number;
  backend: 'Rust' | 'Metal';
  onResolutionChange: (resolution: number) => void;
  onBackendChange: (backend: 'Rust' | 'Metal') => void;
  onApply: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [tempResolution, setTempResolution] = useState(resolution.toString());
  const [tempBackend, setTempBackend] = useState(backend);
  const backends: Array<'Rust' | 'Metal'> = ['Rust', 'Metal'];

  const handleOpen = () => {
    setTempResolution(resolution.toString());
    setTempBackend(backend);
    setShowSettings(true);
  };

  const handleApply = () => {
    const resolutionNum = parseInt(tempResolution, 10);
    
    if (!isNaN(resolutionNum) && resolutionNum > 0 && resolutionNum <= 256) {
      onResolutionChange(resolutionNum);
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
              borderRadius: 16,
              padding: 24,
              width: '90%',
              maxWidth: 400,
              borderWidth: 1,
              borderColor: '#333',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ 
              color: '#fff', 
              fontSize: 20, 
              fontWeight: '700', 
              marginBottom: 24, 
              textAlign: 'center',
              letterSpacing: 0.5,
            }}>
              Settings
            </Text>
            
            {/* Settings rows */}
            <View style={{ marginBottom: 24, gap: 20 }}>
              {/* Resolution row */}
              <View>
                <Text style={{ 
                  color: '#aaa', 
                  fontSize: 12, 
                  fontWeight: '600', 
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}>
                  Resolution
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput
                    style={{
                      flex: 1,
                      backgroundColor: '#0a0a0a',
                      color: '#fff',
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderRadius: 8,
                      fontSize: 16,
                      borderWidth: 1,
                      borderColor: '#333',
                      fontWeight: '500',
                    }}
                    value={tempResolution}
                    onChangeText={setTempResolution}
                    keyboardType="numeric"
                    selectTextOnFocus
                    placeholder="32"
                    placeholderTextColor="#555"
                  />
                  <Text style={{ 
                    color: '#888', 
                    fontSize: 14, 
                    fontWeight: '500',
                    minWidth: 40,
                  }}>
                    × {tempResolution}
                  </Text>
                </View>
              </View>
              
              {/* Backend row */}
              <View>
                <Text style={{ 
                  color: '#aaa', 
                  fontSize: 12, 
                  fontWeight: '600', 
                  marginBottom: 8,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}>
                  Backend
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {backends.map((b) => (
                    <Pressable
                      key={b}
                      onPress={() => setTempBackend(b)}
                      style={{
                        flex: 1,
                        backgroundColor: tempBackend === b ? '#39ff14' : '#0a0a0a',
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: tempBackend === b ? '#39ff14' : '#333',
                      }}
                      android_ripple={null}
                    >
                      <Text
                        style={{
                          color: tempBackend === b ? '#000' : '#fff',
                          textAlign: 'center',
                          fontWeight: '600',
                          fontSize: 15,
                          letterSpacing: 0.3,
                        }}
                      >
                        {b}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </View>
            
            {/* Action buttons */}
            <View style={{ 
              flexDirection: 'row', 
              justifyContent: 'flex-end', 
              gap: 12,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: '#222',
            }}>
              <Pressable
                onPress={() => setShowSettings(false)}
                style={{
                  backgroundColor: 'transparent',
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#333',
                }}
                android_ripple={null}
              >
                <Text style={{ 
                  color: '#aaa', 
                  textAlign: 'center', 
                  fontWeight: '600', 
                  fontSize: 14,
                }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleApply}
                style={{
                  backgroundColor: '#39ff14',
                  paddingVertical: 12,
                  paddingHorizontal: 28,
                  borderRadius: 8,
                  shadowColor: '#39ff14',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.3,
                  shadowRadius: 4,
                  elevation: 4,
                }}
                android_ripple={null}
              >
                <Text style={{ 
                  color: '#000', 
                  textAlign: 'center', 
                  fontWeight: '700', 
                  fontSize: 14,
                  letterSpacing: 0.5,
                }}>
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
  const [resolution, setResolution] = useState(DEFAULT_RESOLUTION);
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
      if (backend === 'Metal') {
        // Metal backend
        const input = JSON.stringify({
          context_id: contextIdRef.current,
          image,
          kernel,
        });
        const resultJson = SensorlibModule.metalConvolutionInit(input);
        const result = JSON.parse(resultJson);
        if (result.error) {
          console.error('Metal convolution init error:', result.error);
          return false;
        }
        return result.success === true;
      } else {
        // Rust backend
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
      }
    } catch (error) {
      console.error('Convolution init failed:', error);
      return false;
    }
  }, [backend]);

  // Apply convolution step (stateful, no serialization overhead)
  const applyConvolutionStep = useCallback((): number[] | null => {
    try {
      if (backend === 'Metal') {
        // Metal backend
        const input = JSON.stringify({
          context_id: contextIdRef.current,
        });
        const resultJson = SensorlibModule.metalConvolutionStep(input);
        if (!resultJson) {
          console.error('Metal convolution step returned null');
          return null;
        }
        const result = JSON.parse(resultJson);
        if (result.error) {
          console.error('Metal convolution step error:', result.error);
          return null;
        }
        if (!result.result || !Array.isArray(result.result)) {
          console.error('Metal convolution step returned invalid result:', result);
          return null;
        }
        return result.result;
      } else {
        // Rust backend
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
      }
    } catch (error) {
      console.error('Convolution step failed:', error);
      return null;
    }
  }, [backend]);

  // Check if image has died out (sum is 0)
  const checkIfDead = useCallback((data: number[]): boolean => {
    const sum = data.reduce((acc, val) => acc + Math.abs(val), 0);
    return sum < 0.001; // Very small threshold
  }, []);

  // Initialize image and kernel
  const initializeImage = useCallback(() => {
    // Clean up old state first
    try {
      if (backend === 'Metal') {
        const cleanupInput = JSON.stringify({
          context_id: contextIdRef.current,
        });
        SensorlibModule.metalConvolutionCleanup(cleanupInput);
      } else {
        const cleanupInput = JSON.stringify({
          context_id: contextIdRef.current,
        });
        SensorlibModule.rustcoreConvolutionCleanup(cleanupInput);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
    
    // Random RGB image (square)
    const newImage = Array.from({ length: resolution * resolution * CHANNELS }, () => Math.random());
    // Random 3x3x3 kernel (-1 to +1)
    const newKernel = Array.from({ length: KERNEL_SIZE * KERNEL_SIZE * CHANNELS }, () => (Math.random() * 2 - 1));
    
    setImageData(newImage);
    setKernel(newKernel);
    
    // Initialize convolution state (Rust or Metal)
    if (initConvolution(newImage, newKernel)) {
      setImageData(newImage);
    }
  }, [resolution, backend, initConvolution]);

  // Initialize on mount or when resolution changes
  useEffect(() => {
    initializeImage();
  }, [initializeImage]);

  // Cleanup convolution state
  useEffect(() => {
    return () => {
      try {
        if (backend === 'Metal') {
          const input = JSON.stringify({
            context_id: contextIdRef.current,
          });
          SensorlibModule.metalConvolutionCleanup(input);
        } else {
          const input = JSON.stringify({
            context_id: contextIdRef.current,
          });
          SensorlibModule.rustcoreConvolutionCleanup(input);
        }
      } catch (error) {
        console.error('Convolution cleanup failed:', error);
      }
    };
  }, [backend]);

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
    // If using native view with autoRefresh, it handles the animation loop internally
    // We only need the JavaScript loop for the fallback rendering
    if (ConvolutionPixelView) {
      // Native view handles everything - just track FPS if needed
      // For now, we'll skip the JS loop when native view is available
      return;
    }
    
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
            setImageData(Array(resolution * resolution * CHANNELS).fill(0));
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
  }, [paused, applyConvolutionStep, checkIfDead, resolution, ConvolutionPixelView]);

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

  // Calculate pixel size based on resolution (square, fits in fixed size)
  const pixelSize = FIXED_IMAGE_SIZE / resolution;

  // Convert image data to a single flat array of pixel colors for faster rendering (fallback for when native view isn't available)
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
      
      {/* Image Display - Use native Swift rendering if available, otherwise fallback to JavaScript */}
      {ConvolutionPixelView ? (
        <ConvolutionPixelView
          contextId={contextIdRef.current}
          backend={backend}
          resolution={resolution}
          autoRefresh={!paused}
          style={[styles.imageContainer, { width: FIXED_IMAGE_SIZE, height: FIXED_IMAGE_SIZE }]}
        />
      ) : (
        <View style={[styles.imageContainer, { width: FIXED_IMAGE_SIZE, height: FIXED_IMAGE_SIZE }]}>
          <View style={[styles.pixelGrid, { width: FIXED_IMAGE_SIZE, height: FIXED_IMAGE_SIZE }]}>
            {pixelColors.map((color, idx) => {
              const y = Math.floor(idx / resolution);
              const x = idx % resolution;
              return (
                <View
                  key={`pixel-${idx}`}
                  style={[
                    {
                      width: pixelSize,
                      height: pixelSize,
                      backgroundColor: color,
                      position: 'absolute',
                      left: x * pixelSize,
                      top: y * pixelSize,
                    }
                  ]}
                />
              );
            })}
          </View>
        </View>
      )}
      
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
        resolution={resolution}
        backend={backend}
        onResolutionChange={setResolution}
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

