import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line, Path } from 'react-native-svg';

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
  
  // Normalized zoom controls (0-1 range)
  const xZoom = useSharedValue(0.5); // Time zoom (horizontal)
  const yZoom = useSharedValue(0.5); // Amplitude zoom (vertical)
  
  // HUD visibility
  const showHUD = useSharedValue(false);
  const hudOpacity = useSharedValue(0);
  
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
          // Convert xZoom (0-1) to timeZoom (0.5-5.0)
          const timeZoomValue = 0.5 + (xZoom.value * 4.5); // 0->0.5, 1->5.0
          const maxSamples = Math.floor(height * 4 * timeZoomValue);
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

  // Touch and gesture handling
  const savedFocalX = useSharedValue(0);
  const savedFocalY = useSharedValue(0);
  const gestureStarted = useSharedValue(false);
  
  const hideHUD = () => {
    showHUD.value = false;
  };

  // Single tap gesture to show HUD
  const tapGesture = Gesture.Tap()
    .onBegin(() => {
      showHUD.value = true;
      hudOpacity.value = withTiming(1, { duration: 200 });
    })
    .onEnd(() => {
      hudOpacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => runOnJS(hideHUD)(), 500);
    });
  
  // Pinch gesture for zoom control
  const pinchGesture = Gesture.Pinch()
    .onBegin((event) => {
      savedFocalX.value = event.focalX;
      savedFocalY.value = event.focalY;
      gestureStarted.value = true;
      showHUD.value = true;
      hudOpacity.value = withTiming(1, { duration: 200 });
    })
    .onUpdate((event) => {
      if (!gestureStarted.value) return;
      
      // Calculate movement from start position
      const deltaX = Math.abs(event.focalX - savedFocalX.value);
      const deltaY = Math.abs(event.focalY - savedFocalY.value);
      
      // If horizontal movement is greater, it's a horizontal gesture
      const isHorizontal = deltaX > deltaY;
      
      if (isHorizontal) {
        // Horizontal pinch - time zoom control (X axis)
        const scaleFactor = (event.scale - 1) * 0.1; // Reduce sensitivity
        xZoom.value = Math.max(0, Math.min(1, xZoom.value + scaleFactor));
      } else {
        // Vertical pinch - amplitude control (Y axis)
        const scaleFactor = (event.scale - 1) * 0.1; // Reduce sensitivity
        yZoom.value = Math.max(0, Math.min(1, yZoom.value + scaleFactor));
      }
    })
    .onEnd(() => {
      gestureStarted.value = false;
      hudOpacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => runOnJS(hideHUD)(), 500);
    });
  
  const composedGesture = Gesture.Race(tapGesture, pinchGesture);

  const animatedProps = useAnimatedProps(() => {
    const samples = audioSamples.value;
    
    if (samples.length === 0) {
      return { d: `M ${width / 2} 0 L ${width / 2} ${height}` };
    }

    // Convert normalized zoom values to actual scales
    // yZoom: 0->0.1, 0.5->2.0, 1->10.0 (amplitude scale)
    const amplitudeScale = 0.1 + (yZoom.value * yZoom.value * 9.9); // Quadratic for better feel
    
    // EXACTLY match Rust implementation with gesture controls
    const len = height;
    const waveformScale = width * 0.5 * scale * amplitudeScale;
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

  // HUD animations
  const hudStyle = useAnimatedStyle(() => ({
    opacity: hudOpacity.value,
    pointerEvents: showHUD.value ? 'none' : 'none',
  }));

  const AnimatedText = Animated.createAnimatedComponent(Text);
  const AnimatedLine = Animated.createAnimatedComponent(Line);

  return (
    <GestureDetector gesture={composedGesture}>
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
        
        {/* HUD Overlay */}
        <Animated.View style={[styles.hudContainer, hudStyle]}>
          <Svg width={width} height={height} style={styles.hudSvg}>
            {/* Crosshair - Horizontal line */}
            <AnimatedLine
              x1={0}
              y1={height / 2}
              x2={width}
              y2={height / 2}
              stroke={colors.tint}
              strokeWidth={1}
              opacity={0.5}
            />
            {/* Crosshair - Vertical line */}
            <AnimatedLine
              x1={width / 2}
              y1={0}
              x2={width / 2}
              y2={height}
              stroke={colors.tint}
              strokeWidth={1}
              opacity={0.5}
            />
          </Svg>
          
          {/* X Zoom Label */}
          <Animated.View style={[styles.xLabel, { left: width / 2 + 10, top: height / 2 - 25 }]}>
            <AnimatedText style={[styles.labelText, { color: colors.tint }]}>
              X: {(xZoom.value * 100).toFixed(0)}%
            </AnimatedText>
          </Animated.View>
          
          {/* Y Zoom Label */}
          <Animated.View style={[styles.yLabel, { left: width / 2 + 10, top: height / 2 + 5 }]}>
            <AnimatedText style={[styles.labelText, { color: colors.tint }]}>
              Y: {(yZoom.value * 100).toFixed(0)}%
            </AnimatedText>
          </Animated.View>
        </Animated.View>
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
  hudContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
  },
  hudSvg: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  xLabel: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  yLabel: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  labelText: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});