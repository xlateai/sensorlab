import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import Animated, {
    useAnimatedProps,
    useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

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
  
  // Simplified zoom values - fixed for consistent display
  const xZoom = useSharedValue(0.3); // Amplitude zoom
  const yZoom = useSharedValue(0.5); // Speed zoom
  
  // Recording buffer - accumulates samples only when recording
  const recordingBuffer = useSharedValue<number[]>([]);
  const [recordingStarted, setRecordingStarted] = React.useState(false);
  
  // Update recording buffer when samples change
  React.useEffect(() => {
    console.log('RecordingsViewer - isRecording:', isRecording, 'isMuted:', isMuted, 'samples length:', recordingSamples.length);
    
    // When recording starts, clear the buffer and start fresh
    if (isRecording && !recordingStarted) {
      console.log('RecordingsViewer - Recording started, clearing buffer');
      recordingBuffer.value = [];
      setRecordingStarted(true);
    }
    
    // When recording stops, keep the buffer and stop accumulating
    if (!isRecording && recordingStarted) {
      console.log('RecordingsViewer - Recording stopped, final buffer has', recordingBuffer.value.length, 'samples');
      setRecordingStarted(false);
    }
    
    // While recording and not muted, copy all current samples from the main waveform
    if (isRecording && !isMuted && recordingSamples.length > 0) {
      recordingBuffer.value = [...recordingSamples];
      console.log('RecordingsViewer - Updated recording buffer with', recordingSamples.length, 'samples');
    }
  }, [isRecording, isMuted, recordingSamples, recordingStarted]);



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

  return (
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
          

          

        </View>
      </View>
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

});