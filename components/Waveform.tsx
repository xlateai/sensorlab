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
  orientation?: 'horizontal' | 'vertical';
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function Waveform({ 
  width = screenWidth, // Full screen width by default
  height = screenHeight * 0.4, // 40% of screen height by default
  isActive = true,
  scale = 1.6, // 2x default horizontal zoom
  orientation = 'horizontal', // horizontal mode by default
}: WaveformProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showHUD, setShowHUD] = useState(false);
  const [xZoomDisplay, setXZoomDisplay] = useState(50);
  const [yZoomDisplay, setYZoomDisplay] = useState(50);
  
  const audioSamples = useSharedValue<number[]>([]);
  
  // Back to shared values for zoom to work with worklets
  // Start with reasonable defaults so waveform is visible
  const xZoom = useSharedValue(0.3); // Some amplitude by default
  const yZoom = useSharedValue(0.5); // Medium speed by default
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
          
          // Convert yZoom (0-1) to timeZoom for duration control
          // Y axis controls how much timeline/duration we see
          const timeZoomValue = 0.5 + (yZoom.value * 4.5); // 0->0.5, 1->5.0
          const dimensionForSamples = orientation === 'horizontal' ? width : height;
          const maxSamples = Math.floor(dimensionForSamples * 4 * timeZoomValue);
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

  const updateDisplayValues = () => {
    setXZoomDisplay(Math.round(xZoom.value * 100));
    // Invert Y display so 100% is at top (fastest) and 0% is at bottom (slowest)
    setYZoomDisplay(Math.round((1 - yZoom.value) * 100));
  };

  // Touch and gesture handling
  
  // Combined touch detection for reliable HUD display
  const touchGesture = Gesture.Manual()
    .onTouchesDown((event) => {
      runOnJS(setShowHUD)(true);
      hudOpacity.value = withTiming(1, { duration: 200 });
    })
    .onTouchesMove((event) => {
      const touch = event.allTouches[0];
      if (touch) {
        // Ensure coordinates are within bounds and valid
        const touchX = Math.max(0, Math.min(width, touch.x));
        const touchY = Math.max(0, Math.min(height, touch.y));
        
        if (orientation === 'horizontal') {
          // Horizontal mode: X position controls speed, Y position controls amplitude
          const xProgress = touchX / width;
          yZoom.value = xProgress;
          
          const centerY = height / 2;
          const maxDistance = height / 2;
          const distanceFromCenter = Math.abs(touchY - centerY);
          const yProgress = Math.min(1, distanceFromCenter / maxDistance);
          xZoom.value = yProgress;
        } else {
          // Vertical mode: Y position controls speed, X position controls amplitude
          const yProgress = touchY / height;
          yZoom.value = yProgress;
          
          const centerX = width / 2;
          const maxDistance = width / 2;
          const distanceFromCenter = Math.abs(touchX - centerX);
          const xProgress = Math.min(1, distanceFromCenter / maxDistance);
          xZoom.value = xProgress;
        }
        
        runOnJS(updateDisplayValues)();
      }
    })
    .onTouchesUp(() => {
      hudOpacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => runOnJS(setShowHUD)(false), 500);
    });

  // Fallback pan gesture for additional reliability
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      runOnJS(setShowHUD)(true);
      hudOpacity.value = withTiming(1, { duration: 200 });
    })
    .onUpdate((event) => {
      // Ensure coordinates are within bounds
      const touchX = Math.max(0, Math.min(width, event.x));
      const touchY = Math.max(0, Math.min(height, event.y));
      
      if (orientation === 'horizontal') {
        // Horizontal mode: X position controls speed, Y position controls amplitude
        const xProgress = touchX / width;
        yZoom.value = xProgress;
        
        const centerY = height / 2;
        const maxDistance = height / 2;
        const distanceFromCenter = Math.abs(touchY - centerY);
        const yProgress = Math.min(1, distanceFromCenter / maxDistance);
        xZoom.value = yProgress;
      } else {
        // Vertical mode: Y position controls speed, X position controls amplitude
        const yProgress = touchY / height;
        yZoom.value = yProgress;
        
        const centerX = width / 2;
        const maxDistance = width / 2;
        const distanceFromCenter = Math.abs(touchX - centerX);
        const xProgress = Math.min(1, distanceFromCenter / maxDistance);
        xZoom.value = xProgress;
      }
      
      runOnJS(updateDisplayValues)();
    })
    .onEnd(() => {
      hudOpacity.value = withTiming(0, { duration: 500 });
      setTimeout(() => runOnJS(setShowHUD)(false), 500);
    });
  
  const composedGesture = Gesture.Race(touchGesture, panGesture);

  const animatedProps = useAnimatedProps(() => {
    const samples = audioSamples.value;
    
    if (samples.length === 0) {
      if (orientation === 'horizontal') {
        return { d: `M 0 ${height / 2} L ${width} ${height / 2}` };
      } else {
        return { d: `M ${width / 2} 0 L ${width / 2} ${height}` };
      }
    }

    // Convert normalized zoom values to actual scales
    // xZoom: 0->0.1, 0.5->2.0, 1->10.0 (amplitude scale)
    // X axis controls amplitude (waveform height)
    const amplitudeScale = 0.1 + (xZoom.value * xZoom.value * 9.9); // Quadratic for better feel
    
    let pathData = '';
    let prevX: number | null = null;
    let prevY: number | null = null;
    
    if (orientation === 'horizontal') {
      // Horizontal mode: waveform goes from left to right
      const len = width;
      const waveformScale = height * 0.5 * scale * amplitudeScale;
      const center = height * 0.5;
      
      const step = Math.max(1, samples.length) / len;
      const stride = 2;

      for (let i = 0; i < len; i += stride) {
        const sampleIndex = Math.floor(i * step);
        if (sampleIndex >= samples.length) break;
        
        // DIRECT multiplication with gesture-controlled amplitude
        const offset = samples[sampleIndex] * waveformScale;
        const x = i;
        const y = Math.max(0, Math.min(height, center + offset)); // Constrain to screen bounds
        
        if (prevX !== null && prevY !== null) {
          if (pathData === '') {
            pathData = `M ${prevX} ${prevY}`;
          }
          pathData += ` L ${x} ${y}`;
        }
        
        prevX = x;
        prevY = y;
      }
      
      return { d: pathData || `M 0 ${center} L ${width} ${center}` };
    } else {
      // Vertical mode: waveform goes from top to bottom (original behavior)
      const len = height;
      const waveformScale = width * 0.5 * scale * amplitudeScale;
      const center = width * 0.5;
      
      const step = Math.max(1, samples.length) / len;
      const stride = 2;

      for (let i = 0; i < len; i += stride) {
        const sampleIndex = Math.floor(i * step);
        if (sampleIndex >= samples.length) break;
        
        // DIRECT multiplication with gesture-controlled amplitude
        const offset = samples[sampleIndex] * waveformScale;
        const x = Math.max(0, Math.min(width, center + offset)); // Constrain to screen bounds
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
    }
  });

  // HUD animations
  const hudStyle = useAnimatedStyle(() => ({
    opacity: hudOpacity.value,
    pointerEvents: 'none',
  }));

  const AnimatedText = Animated.createAnimatedComponent(Text);
  const AnimatedLine = Animated.createAnimatedComponent(Line);

  return (
    <GestureDetector gesture={composedGesture}>
      <View style={[styles.container, styles.waveformBoundary, { width, height }]}>
        <Svg width={width} height={height}>
          <AnimatedPath
            animatedProps={animatedProps}
            stroke="#00ff00"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        
        {/* HUD Overlay */}
        {showHUD && (
          <Animated.View style={[styles.hudContainer, hudStyle]}>
            <Svg width={width} height={height} style={styles.hudSvg}>
              {/* Crosshair lines */}
              <AnimatedLine
                x1={0}
                y1={height / 2}
                x2={width}
                y2={height / 2}
                stroke="#00ff00"
                strokeWidth={1}
                opacity={0.5}
              />
              <AnimatedLine
                x1={width / 2}
                y1={0}
                x2={width / 2}
                y2={height}
                stroke="#00ff00"
                strokeWidth={1}
                opacity={0.5}
              />
            </Svg>
            
            {/* Control Labels */}
            <View style={[styles.xLabel, { left: width / 2 + 10, top: height / 2 - 45 }]}>
              <Text style={[styles.labelText, { color: '#00ff00' }]}>
                {orientation === 'horizontal' ? 'Y' : 'X'}: {xZoomDisplay}%
              </Text>
              <Text style={[styles.subLabelText, { color: '#00ff00' }]}>
                (amplitude)
              </Text>
            </View>
            
            <View style={[styles.yLabel, { left: width / 2 + 10, top: height / 2 + 5 }]}>
              <Text style={[styles.labelText, { color: '#00ff00' }]}>
                {orientation === 'horizontal' ? 'X' : 'Y'}: {yZoomDisplay}%
              </Text>
              <Text style={[styles.subLabelText, { color: '#00ff00' }]}>
                (speed)
              </Text>
            </View>
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    // Remove flex: 1 to allow explicit width/height control
  },
  waveformBoundary: {
    borderWidth: 2,
    borderColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
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
  subLabelText: {
    fontSize: 10,
    fontWeight: 'normal',
    fontFamily: 'monospace',
    opacity: 0.7,
    textAlign: 'center',
  },
});