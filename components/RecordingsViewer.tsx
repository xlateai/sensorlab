import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import React, { useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedProps,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

interface RecordingsViewerProps {
  width?: number;
  height?: number;
  isActive?: boolean;
  scale?: number;
  orientation?: 'horizontal' | 'vertical';
  isRecording?: boolean;
  isMuted?: boolean;
  recordingSamples?: number[];
}

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedLine = Animated.createAnimatedComponent(Line);

export default function RecordingsViewer({ 
  width = screenWidth,
  height = screenHeight * 0.25,
  isActive = true,
  scale = 1.6,
  orientation = 'horizontal',
  isRecording = false,
  isMuted = false,
  recordingSamples = [],
}: RecordingsViewerProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  
  const [showHUD, setShowHUD] = useState(false);
  const [xZoomDisplay, setXZoomDisplay] = useState(50);
  const [yZoomDisplay, setYZoomDisplay] = useState(50);
  const [isZooming, setIsZooming] = useState(false);

  // Shared values for zoom controls
  const xZoom = useSharedValue(0.3); // Amplitude zoom
  const yZoom = useSharedValue(0.5); // Speed zoom
  const hudOpacity = useSharedValue(0);
  const zoomButtonScale = useSharedValue(1);
  
  // Recording buffer - this will be populated when recording
  const recordingBuffer = useSharedValue<number[]>([]);
  
  // Update recording buffer when samples change
  React.useEffect(() => {
    if (isRecording && !isMuted && recordingSamples.length > 0) {
      recordingBuffer.value = [...recordingSamples];
    } else if (!isRecording) {
      // Keep the buffer when recording stops to show the final recording
    }
  }, [isRecording, isMuted, recordingSamples]);

  const updateDisplayValues = () => {
    setXZoomDisplay(Math.round(xZoom.value * 100));
    setYZoomDisplay(Math.round((1 - yZoom.value) * 100));
  };

  // Zoom button handlers
  const handleZoomPressIn = () => {
    setIsZooming(true);
    setShowHUD(true);
    hudOpacity.value = withTiming(1, { duration: 200 });
    zoomButtonScale.value = withTiming(1.3, { duration: 150 });
  };

  const stopZooming = () => {
    setIsZooming(false);
    hudOpacity.value = withTiming(0, { duration: 500 });
    setTimeout(() => setShowHUD(false), 500);
    zoomButtonScale.value = withTiming(1, { duration: 150 });
  };

  // Zoom gesture
  const zoomGesture = Gesture.Pan()
    .onBegin(() => {
      if (!isZooming) return;
    })
    .onUpdate((event) => {
      if (!isZooming) return;
      
      const touchX = Math.max(0, Math.min(width, event.absoluteX));
      const touchY = Math.max(0, Math.min(height, event.absoluteY));
      
      if (orientation === 'horizontal') {
        // X position controls speed, Y position controls amplitude
        const xProgress = touchX / width;
        yZoom.value = xProgress;
        
        const centerY = height / 2;
        const maxDistance = height / 2;
        const distanceFromCenter = Math.abs(touchY - centerY);
        const yProgress = Math.min(1, distanceFromCenter / maxDistance);
        xZoom.value = yProgress;
      } else {
        // Y position controls speed, X position controls amplitude
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
      runOnJS(stopZooming)();
    });

  const animatedProps = useAnimatedProps(() => {
    const samples = recordingBuffer.value;
    
    if (samples.length === 0) {
      // Empty waveform - just a flat line
      if (orientation === 'horizontal') {
        return { d: `M 0 ${height / 2} L ${width} ${height / 2}` };
      } else {
        return { d: `M ${width / 2} 0 L ${width / 2} ${height}` };
      }
    }

    // Convert zoom values to scales
    const amplitudeScale = 0.1 + (xZoom.value * xZoom.value * 9.9);
    
    let pathData = '';
    let prevX: number | null = null;
    let prevY: number | null = null;
    
    if (orientation === 'horizontal') {
      const len = width;
      const waveformScale = height * 0.5 * scale * amplitudeScale;
      const center = height * 0.5;
      
      const step = Math.max(1, samples.length) / len;
      const stride = 2;

      for (let i = 0; i < len; i += stride) {
        const sampleIndex = Math.floor(i * step);
        if (sampleIndex >= samples.length) break;
        
        const offset = samples[sampleIndex] * waveformScale;
        const x = i;
        const y = Math.max(0, Math.min(height, center + offset));
        
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
      const len = height;
      const waveformScale = width * 0.5 * scale * amplitudeScale;
      const center = width * 0.5;
      
      const step = Math.max(1, samples.length) / len;
      const stride = 2;

      for (let i = 0; i < len; i += stride) {
        const sampleIndex = Math.floor(i * step);
        if (sampleIndex >= samples.length) break;
        
        const offset = samples[sampleIndex] * waveformScale;
        const x = Math.max(0, Math.min(width, center + offset));
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

  // HUD animation style
  const hudStyle = useAnimatedStyle(() => ({
    opacity: hudOpacity.value,
    pointerEvents: 'none',
  }));

  // Zoom button animation
  const zoomButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomButtonScale.value }],
    backgroundColor: isZooming ? 'rgba(255, 165, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)', // Orange when zooming
  }));

  return (
    <GestureDetector gesture={zoomGesture}>
      <View style={[styles.container, { width, height }]}>
        <View style={[styles.waveformBoundary, { width, height }]}>
          <Svg width={width} height={height}>
            <AnimatedPath
              animatedProps={animatedProps}
              stroke="#888888" // Light gray color
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
          
          {/* Recording indicator */}
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>RECORDING</Text>
            </View>
          )}
          
          {/* HUD Overlay */}
          {showHUD && (
            <Animated.View style={[styles.hudContainer, hudStyle]}>
              <Svg width={width} height={height} style={styles.hudSvg}>
                <AnimatedLine
                  x1={0}
                  y1={height / 2}
                  x2={width}
                  y2={height / 2}
                  stroke="#ff8c00"
                  strokeWidth={1}
                  opacity={0.5}
                />
                <AnimatedLine
                  x1={width / 2}
                  y1={0}
                  x2={width / 2}
                  y2={height}
                  stroke="#ff8c00"
                  strokeWidth={1}
                  opacity={0.5}
                />
              </Svg>
              
              {/* Control Labels */}
              <View style={[styles.xLabel, { left: width / 2 + 10, top: height / 2 - 45 }]}>
                <Text style={[styles.labelText, { color: '#ff8c00' }]}>
                  {orientation === 'horizontal' ? 'Y' : 'X'}: {xZoomDisplay}%
                </Text>
                <Text style={[styles.subLabelText, { color: '#ff8c00' }]}>
                  (amplitude)
                </Text>
              </View>
              
              <View style={[styles.yLabel, { left: width / 2 + 10, top: height / 2 + 5 }]}>
                <Text style={[styles.labelText, { color: '#ff8c00' }]}>
                  {orientation === 'horizontal' ? 'X' : 'Y'}: {yZoomDisplay}%
                </Text>
                <Text style={[styles.subLabelText, { color: '#ff8c00' }]}>
                  (speed)
                </Text>
              </View>
            </Animated.View>
          )}
          

        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8, // Small gap between waveforms
  },
  waveformBoundary: {
    backgroundColor: '#1a1a1a', // Slightly different background
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)', // Light gray border
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  recordingIndicator: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 0, 0.8)',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  recordingDot: {
    width: 8,
    height: 8,
    backgroundColor: '#ffffff',
    borderRadius: 4,
    marginRight: 6,
  },
  recordingText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
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
  zoomButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 40,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.3)',
  },
  buttonTouchArea: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 18,
    color: '#ff8c00',
  },
  titleLabel: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 140, 0, 0.3)',
  },
  titleText: {
    color: '#ff8c00',
    fontSize: 12,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
});