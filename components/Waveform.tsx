import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const { height: screenHeight } = Dimensions.get('window');

interface WaveformProps {
  width?: number;
  height?: number;
  isActive?: boolean;
  scale?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function Waveform({ 
  width = 80,
  height = screenHeight,
  isActive = true,
  scale = 0.8,
}: WaveformProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const audioSamples = useSharedValue<number[]>([]);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioBufferRef = useRef<number[]>([]);

  // Request permissions
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Start/stop monitoring
  useEffect(() => {
    if (isActive && hasPermission) {
      startAudioMonitoring();
    } else {
      stopAudioMonitoring();
    }
    
    return () => {
      stopAudioMonitoring();
    };
  }, [isActive, hasPermission]);

  const startAudioMonitoring = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: newRecording } = await Audio.Recording.createAsync({
        isMeteringEnabled: true,
        android: {
          extension: '.wav',
          outputFormat: Audio.AndroidOutputFormat.DEFAULT,
          audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
        },
        ios: {
          extension: '.wav',
          outputFormat: Audio.IOSOutputFormat.LINEARPCM,
          audioQuality: Audio.IOSAudioQuality.MAX,
          sampleRate: 44100,
          numberOfChannels: 1,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/wav',
          bitsPerSecond: 128000,
        },
      });
      
      setRecording(newRecording);

      // Simulate fine-grained audio data collection
      // Note: expo-av doesn't provide raw samples, so we'll simulate based on metering
      intervalRef.current = setInterval(async () => {
        const status = await newRecording.getStatusAsync();
        if (status.isRecording && status.metering !== undefined) {
          // Simulate audio samples based on metering level
          const level = Math.max(0, Math.min(1, (status.metering + 40) / 40));
          
          // Generate simulated samples that vary around the current level
          const newSamples: number[] = [];
          const samplesPerUpdate = 100; // Simulate 100 samples per update
          
          for (let i = 0; i < samplesPerUpdate; i++) {
            // Create realistic audio variation around the current level
            const variation = (Math.random() - 0.5) * 0.3;
            const sample = (level + variation) * (Math.random() > 0.5 ? 1 : -1);
            newSamples.push(Math.max(-1, Math.min(1, sample)));
          }
          
          // Maintain a rolling buffer of recent samples
          audioBufferRef.current.push(...newSamples);
          
          // Keep only recent samples (equivalent to buffer_duration in Rust)
          const maxSamples = height * 2; // Keep enough for smooth visualization
          if (audioBufferRef.current.length > maxSamples) {
            audioBufferRef.current = audioBufferRef.current.slice(-maxSamples);
          }
          
          runOnJS(updateAudioSamples)([...audioBufferRef.current]);
        }
      }, 16); // ~60fps updates

    } catch (err) {
      console.log('Recording failed:', err);
    }
  };

  const stopAudioMonitoring = async () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (recording) {
      try {
        await recording.stopAndUnloadAsync();
        setRecording(null);
      } catch (err) {
        console.log('Stop failed:', err);
      }
    }
  };

  const updateAudioSamples = (samples: number[]) => {
    audioSamples.value = samples;
  };

  const animatedProps = useAnimatedProps(() => {
    const samples = audioSamples.value;
    
    if (samples.length === 0) {
      return { d: `M ${width / 2} 0 L ${width / 2} ${height}` };
    }

    // Match Rust implementation: vertical waveform
    const len = height;
    const waveformScale = width * 0.5 * scale;
    const center = width * 0.5;
    
    const step = Math.max(1, samples.length) / len;
    const stride = 2; // Match Rust stride
    
    let pathData = '';
    let prevX: number | null = null;
    let prevY: number | null = null;

    for (let i = 0; i < len; i += stride) {
      const sampleIndex = Math.floor(i * step);
      if (sampleIndex >= samples.length) break;
      
      const offset = samples[sampleIndex] * waveformScale;
      const x = center + offset;
      const y = i;
      
      if (prevX !== null && prevY !== null) {
        if (pathData === '') {
          pathData = `M ${prevX} ${prevY}`;
        }
        pathData += ` L ${x} ${y}`;
      }
      
      prevX = x;
      prevY = y;
    }

    return { d: pathData || `M ${center} 0 L ${center} ${height}` };
  });

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        <AnimatedPath
          animatedProps={animatedProps}
          stroke={colors.tint}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});