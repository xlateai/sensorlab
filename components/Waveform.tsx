import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface WaveformProps {
  width?: number;
  height?: number;
}

export default function Waveform({ 
  width = screenWidth * 0.8, 
  height = screenHeight * 0.8 
}: WaveformProps) {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [audioData, setAudioData] = useState<number[]>([]);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = default, higher = faster/zoomed
  const animationRef = useRef<number>(0);
  const audioDataRef = useRef<number[]>([]);
  const bufferSizeRef = useRef<number>(1024); // High granularity buffer
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    console.log('🔊 Initializing audio waveform...');
    mountedRef.current = true;
    
    // Add a small delay to ensure component is fully mounted
    const initTimer = setTimeout(() => {
      if (mountedRef.current) {
        startRecording();
      }
    }, 100);

    return () => {
      mountedRef.current = false;
      clearTimeout(initTimer);
      stopRecording();
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // Restart recording when zoom level changes to apply new update interval
  useEffect(() => {
    if (recording && mountedRef.current) {
      const restartRecording = async () => {
        await stopRecording();
        setTimeout(() => {
          if (mountedRef.current) {
            startRecording();
          }
        }, 100);
      };
      restartRecording();
    }
  }, [zoomLevel]);

  const startRecording = async () => {
    try {
      // Prevent multiple recordings
      if (isRecording || recording) {
        console.log('🔊 Recording already in progress, skipping...');
        return;
      }

      const permission = await Audio.requestPermissionsAsync();
      
      if (permission.status !== 'granted') {
        console.log('⚠️ Permission to access microphone denied');
        return;
      }

      // Ensure any previous recording is cleaned up
      await stopRecording();

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Higher quality recording options for better audio data
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 1, // Mono recording like Rust implementation
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 1, // Mono recording like Rust implementation
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
      };

      if (!mountedRef.current) return;

      const { recording: newRecording } = await Audio.Recording.createAsync(recordingOptions);
      
      if (!mountedRef.current) {
        // Component unmounted during async operation
        await newRecording.stopAndUnloadAsync();
        return;
      }

      setRecording(newRecording);
      setIsRecording(true);
      
      // Start monitoring audio levels with higher frequency updates
      newRecording.setOnRecordingStatusUpdate((status) => {
        if (mountedRef.current && status.isRecording && status.metering !== undefined) {
          // Convert dB to normalized amplitude (similar to Rust audio processing)
          const dbLevel = status.metering;
          updateWaveform(dbLevel);
        }
      });

      // Higher update frequency for ultra-responsive waveform
      const updateInterval = Math.max(4, Math.floor(8 / zoomLevel)); // Much faster updates
      newRecording.setProgressUpdateInterval(updateInterval);
      
      console.log('🎵 Recording started successfully');
      
    } catch (err) {
      console.error('⚠️ Failed to start recording', err);
      setIsRecording(false);
      setRecording(null);
    }
  };

  const stopRecording = async () => {
    try {
      if (recording) {
        console.log('🛑 Stopping recording...');
        await recording.stopAndUnloadAsync();
        setRecording(null);
        setIsRecording(false);
        console.log('✅ Recording stopped');
      }
    } catch (err) {
      console.error('⚠️ Error stopping recording:', err);
      // Force cleanup even if there's an error
      setRecording(null);
      setIsRecording(false);
    }
  };

  const updateWaveform = (level: number) => {
    if (!mountedRef.current) return;
    
    // Validate input level
    if (!isFinite(level) || isNaN(level)) return;
    
    // Convert audio level to amplitude - more responsive, no momentum
    // Direct conversion without smoothing for instant response
    const normalizedLevel = Math.max(0, Math.min(1, (level + 50) / 50)); // More sensitive range
    
    // Validate normalized level
    if (!isFinite(normalizedLevel) || isNaN(normalizedLevel)) return;
    
    // Direct sample without smoothing - instant response
    const newSample = normalizedLevel;
    
    // Final validation of the sample
    if (!isFinite(newSample) || isNaN(newSample)) return;
    
    // Smaller buffer for more responsive updates
    const maxBufferSize = Math.floor(height / 4); // Smaller buffer = more responsive
    audioDataRef.current = [...audioDataRef.current.slice(-(maxBufferSize - 1)), newSample];
    
    if (mountedRef.current) {
      setAudioData([...audioDataRef.current]);
    }
  };

  // Generate single center waveform that oscillates around center line (like Rust)
  const generateCenterWaveform = () => {
    if (audioData.length < 2) return '';

    const samples = audioData;
    const len = height;
    const scale = width * 0.3; // Amplitude scaling for oscillation
    const center = width * 0.5;
    
    // Apply zoom level - higher zoom = faster movement through samples
    const step = samples.length > 1 ? (samples.length * zoomLevel) / len : 1;
    const stride = Math.max(1, Math.floor(2 / zoomLevel)); // Adjust stride based on zoom
    
    let path = '';
    
    for (let i = 0; i < len; i += stride) {
      const sampleIndex = Math.floor(i * step) % samples.length; // Wrap around for zoom
      if (sampleIndex >= samples.length) break;
      
      const sample = samples[sampleIndex];
      if (!isFinite(sample) || isNaN(sample)) continue;
      
      // Oscillate around center line - like Rust implementation
      const offset = (sample - 0.5) * scale * 2; // Center around 0, then scale
      const x = center + offset;
      const y = i;
      
      // Validate coordinates
      if (!isFinite(x) || !isFinite(y) || isNaN(x) || isNaN(y)) continue;
      
      if (i === 0) {
        path = `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      } else {
        path += ` L ${x.toFixed(2)} ${y.toFixed(2)}`;
      }
    }
    
    return path;
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} style={styles.svg}>
        {/* Single center waveform that oscillates around center line */}
        <Path
          d={generateCenterWaveform()}
          fill="none"
          stroke="#00FF88"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Center line for reference */}
        <Path
          d={`M ${width / 2} 0 L ${width / 2} ${height}`}
          fill="none"
          stroke="#00FF88"
          strokeWidth="1"
          opacity={0.3}
        />
      </Svg>
      
      {/* Settings Button - lowered position */}
      <TouchableOpacity 
        style={[styles.settingsButton, { bottom: 10, left: width / 2 - 25 }]}
        onPress={() => setShowSettings(true)}
      >
        <Ionicons name="settings" size={24} color="#00FF88" />
      </TouchableOpacity>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>WAVEFORM CONTROL</Text>
            
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>ZOOM LEVEL</Text>
              <Text style={styles.sliderValue}>{zoomLevel.toFixed(1)}x</Text>
            </View>
            
            {/* Custom Slider */}
            <View style={styles.customSlider}>
              <TouchableOpacity 
                style={styles.sliderTrack}
                onPress={(event) => {
                  const { locationX } = event.nativeEvent;
                  const sliderWidth = 200;
                  const newValue = Math.max(0.5, Math.min(5, (locationX / sliderWidth) * 4.5 + 0.5));
                  setZoomLevel(newValue);
                }}
              >
                <View 
                  style={[
                    styles.sliderThumb, 
                    { left: ((zoomLevel - 0.5) / 4.5) * 200 - 10 }
                  ]} 
                />
              </TouchableOpacity>
            </View>
            
            <View style={styles.sliderLabels}>
              <Text style={styles.minLabel}>0.5x</Text>
              <Text style={styles.maxLabel}>5.0x</Text>
            </View>
            
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => setShowSettings(false)}
            >
              <Text style={styles.closeButtonText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Outer glow effect */}
      <View style={[styles.glowOverlay, { width, height }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  svg: {
    position: 'absolute',
  },
  glowOverlay: {
    position: 'absolute',
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 20,
  },
  // Settings Button
  settingsButton: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 16, 24, 0.8)',
    borderWidth: 1,
    borderColor: '#00FF88',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 10,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#0a0f14',
    borderRadius: 12,
    padding: 30,
    width: '85%',
    maxWidth: 350,
    borderWidth: 1,
    borderColor: '#00FF88',
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#00FF88',
    textAlign: 'center',
    marginBottom: 25,
    letterSpacing: 2,
    fontFamily: 'monospace',
  },
  // Slider Styles
  sliderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sliderLabel: {
    fontSize: 14,
    color: '#00FF88',
    fontWeight: '600',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  sliderValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  customSlider: {
    marginVertical: 20,
    alignItems: 'center',
  },
  sliderTrack: {
    width: 200,
    height: 6,
    backgroundColor: 'rgba(0, 255, 136, 0.2)',
    borderRadius: 3,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 136, 0.3)',
  },
  sliderThumb: {
    position: 'absolute',
    top: -7,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#00FF88',
    borderWidth: 2,
    borderColor: '#ffffff',
    shadowColor: '#00FF88',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 200,
    alignSelf: 'center',
  },
  minLabel: {
    fontSize: 12,
    color: 'rgba(0, 255, 136, 0.7)',
    fontFamily: 'monospace',
  },
  maxLabel: {
    fontSize: 12,
    color: 'rgba(0, 255, 136, 0.7)',
    fontFamily: 'monospace',
  },
  // Close Button
  closeButton: {
    marginTop: 25,
    paddingVertical: 12,
    paddingHorizontal: 25,
    backgroundColor: 'rgba(0, 255, 136, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#00FF88',
    alignSelf: 'center',
  },
  closeButtonText: {
    color: '#00FF88',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
});