import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

interface WaveformProps {
  width?: number;
  height?: number;
  isActive?: boolean;
  scale?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function Waveform({ 
  width = screenWidth,
  height = screenHeight,
  isActive = true,
  scale = 1.6, // 2x default horizontal zoom
}: WaveformProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  
  const audioSamples = useSharedValue<number[]>([]);
  
  // Gesture controls
  const amplitudeScale = useSharedValue(2.0); // 2x default amplitude
  const timeZoom = useSharedValue(1.0); // Default time zoom
  
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
    if (isActive && hasPermission && !isRecording) {
      startAudioMonitoring();
    } else if (!isActive || !hasPermission) {
      stopAudioMonitoring();
    }
    
    return () => {
      // Proper cleanup for hot reload
      stopAudioMonitoring();
    };
  }, [isActive, hasPermission]);

  const startAudioMonitoring = async () => {
    if (isRecording || recording) {
      console.log('Already recording, skipping...');
      return;
    }

    try {
      setIsRecording(true);
      
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
          
          // Generate simulated samples that match natural audio behavior
          const newSamples: number[] = [];
          const samplesPerUpdate = 100;
          
          for (let i = 0; i < samplesPerUpdate; i++) {
            // Create realistic audio variation - silence = tiny, loud = big
            const baseVariation = (Math.random() - 0.5) * 0.05; // Reduced background noise
            const levelVariation = level * (Math.random() - 0.5) * 1.2; // Increased amplification for loud sounds
            const sample = (baseVariation + levelVariation) * (Math.random() > 0.5 ? 1 : -1);
            // Don't clamp - let loud sounds go beyond bounds naturally
            newSamples.push(sample);
          }
          
          // Maintain a rolling buffer of recent samples
          audioBufferRef.current.push(...newSamples);
          
          // 2x slower: Keep twice as many samples for slower movement
          const maxSamples = Math.floor(height * 4 * timeZoom.value); // Adjustable based on time zoom
          if (audioBufferRef.current.length > maxSamples) {
            audioBufferRef.current = audioBufferRef.current.slice(-maxSamples);
          }
          
          runOnJS(updateAudioSamples)([...audioBufferRef.current]);
        }
      }, 16); // ~60fps updates

    } catch (err) {
      console.log('Recording failed:', err);
      setIsRecording(false);
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
      } catch (err) {
        console.log('Stop failed:', err);
      }
      setRecording(null);
    }
    setIsRecording(false);
  };

  const updateAudioSamples = (samples: number[]) => {
    audioSamples.value = samples;
  };

  // Pinch gesture for zoom control
  const savedFocalX = useSharedValue(0);
  const savedFocalY = useSharedValue(0);
  const gestureStarted = useSharedValue(false);
  
  const pinchGesture = Gesture.Pinch()
    .onBegin((event) => {
      savedFocalX.value = event.focalX;
      savedFocalY.value = event.focalY;
      gestureStarted.value = true;
    })
    .onUpdate((event) => {
      if (!gestureStarted.value) return;
      
      // Calculate movement from start position
      const deltaX = Math.abs(event.focalX - savedFocalX.value);
      const deltaY = Math.abs(event.focalY - savedFocalY.value);
      
      // If horizontal movement is greater, it's a horizontal gesture
      const isHorizontal = deltaX > deltaY;
      
      if (isHorizontal) {
        // Horizontal pinch - time zoom control (affects how much timeline we see)
        timeZoom.value = Math.max(0.5, Math.min(5.0, timeZoom.value * event.scale));
      } else {
        // Vertical pinch - amplitude control (affects waveform height)
        amplitudeScale.value = Math.max(0.1, Math.min(10.0, amplitudeScale.value * event.scale));
      }
    })
    .onEnd(() => {
      gestureStarted.value = false;
    });

  const animatedProps = useAnimatedProps(() => {
    const samples = audioSamples.value;
    
    if (samples.length === 0) {
      return { d: `M ${width / 2} 0 L ${width / 2} ${height}` };
    }

    // EXACTLY match Rust implementation with gesture controls
    const len = height;
    const waveformScale = width * 0.5 * scale * amplitudeScale.value; // Apply amplitude scaling
    const center = width * 0.5;
    
    const step = Math.max(1, samples.length) / len;
    const stride = 2;
    
    let pathData = '';
    let prevX: number | null = null;
    let prevY: number | null = null;

    for (let i = 0; i < len; i += stride) {
      const sampleIndex = Math.floor(i * step);
      if (sampleIndex >= samples.length) break;
      
      // DIRECT multiplication with gesture-controlled amplitude
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
    <GestureDetector gesture={pinchGesture}>
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
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});