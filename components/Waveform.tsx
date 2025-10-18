import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { Audio } from 'expo-av';
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

      // Higher update frequency for smoother waveform (similar to Rust tick rate)
      newRecording.setProgressUpdateInterval(16); // ~60fps updates
      
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
    
    // Convert audio level to amplitude similar to Rust implementation
    // Normalize the level from dB to a 0-1 range with more sensitivity
    const normalizedLevel = Math.max(0, Math.min(1, (level + 60) / 60));
    
    // Add the new sample to our buffer
    const newSample = normalizedLevel * (Math.random() * 0.2 + 0.8); // Add slight variation
    
    // Maintain a high-granularity buffer (similar to Rust's sample buffer)
    const maxBufferSize = Math.floor(height / 2); // Match vertical resolution
    audioDataRef.current = [...audioDataRef.current.slice(-(maxBufferSize - 1)), newSample];
    
    if (mountedRef.current) {
      setAudioData([...audioDataRef.current]);
    }
  };

  // Generate vertical waveform path (top to bottom) with line drawing
  const generateVerticalWaveformPath = () => {
    if (audioData.length < 2) return '';

    const samples = audioData;
    const vertical = true; // Always vertical as per Rust code
    const len = height;
    const scale = width * 0.5 * 0.8; // 80% of half width for amplitude scaling
    const center = width * 0.5; // Center horizontally
    
    const step = samples.length > 1 ? samples.length / len : 1;
    const stride = 2; // Sample every 2 pixels for performance
    
    let path = '';
    let prevX: number | null = null;
    let prevY: number | null = null;

    // Iterate through vertical pixels (top to bottom)
    for (let i = 0; i < len; i += stride) {
      const sampleIndex = Math.floor(i * step);
      if (sampleIndex >= samples.length) break;
      
      const sample = samples[sampleIndex];
      const offset = sample * scale;
      
      // Vertical layout: x varies with amplitude, y increases downward
      const x = center + offset;
      const y = i;
      
      if (prevX !== null && prevY !== null) {
        // Draw line from previous point to current point
        if (path === '') {
          path = `M ${prevX} ${prevY}`;
        }
        path += ` L ${x} ${y}`;
      } else {
        path = `M ${x} ${y}`;
      }
      
      prevX = x;
      prevY = y;
    }

    return path;
  };

  // Generate mirrored waveform (both sides) for fuller visualization
  const generateMirroredVerticalWaveform = () => {
    if (audioData.length < 2) return { leftPath: '', rightPath: '', combinedPath: '' };

    const samples = audioData;
    const len = height;
    const scale = width * 0.25 * 0.8; // Reduced scale for mirrored display
    const center = width * 0.5;
    
    const step = samples.length > 1 ? samples.length / len : 1;
    const stride = 1; // Higher granularity for smooth lines
    
    let leftPath = '';
    let rightPath = '';
    
    for (let i = 0; i < len; i += stride) {
      const sampleIndex = Math.floor(i * step);
      if (sampleIndex >= samples.length) break;
      
      const sample = samples[sampleIndex];
      const offset = sample * scale;
      
      // Left side (negative offset)
      const leftX = center - offset;
      // Right side (positive offset)  
      const rightX = center + offset;
      const y = i;
      
      if (i === 0) {
        leftPath = `M ${leftX} ${y}`;
        rightPath = `M ${rightX} ${y}`;
      } else {
        leftPath += ` L ${leftX} ${y}`;
        rightPath += ` L ${rightX} ${y}`;
      }
    }
    
    // Create filled area between the two paths
    const combinedPath = leftPath + ' ' + rightPath.split(' ').reverse().join(' ') + ' Z';
    
    return { leftPath, rightPath, combinedPath };
  };

  // Memoize the waveform data to prevent unnecessary recalculations
  const waveformPaths = generateMirroredVerticalWaveform();

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} style={styles.svg}>
        {/* Main vertical waveform with mirrored sides */}
        <Path
          d={waveformPaths.combinedPath}
          fill="rgba(0, 255, 136, 0.2)"
          stroke="none"
        />
        
        {/* Left side waveform line */}
        <Path
          d={waveformPaths.leftPath}
          fill="none"
          stroke="#00FF88"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Right side waveform line */}
        <Path
          d={waveformPaths.rightPath}
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
});