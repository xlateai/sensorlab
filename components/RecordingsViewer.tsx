import { useRecordingsActions, useRecordingsState } from '@/components/RecordingsData';
import { Audio } from 'expo-av';
import React from 'react';
import { Dimensions, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import Animated, {
    useAnimatedProps,
    useSharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

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
  
  // Get recordings state and actions
  const recordingsState = useRecordingsState();
  const recordingsActions = useRecordingsActions();
  
  // Simplified zoom values - fixed for consistent display
  const xZoom = useSharedValue(0.3); // Amplitude zoom
  const yZoom = useSharedValue(0.5); // Speed zoom
  
  // Use the global recordings state instead of local state
  const recordingBuffer = useSharedValue<number[]>([]);
  
  // Update recording buffer from global state
  React.useEffect(() => {
    // Get the current recording with dividers between sessions
    const samplesWithDividers = recordingsActions.getCurrentRecordingWithDividers();
    recordingBuffer.value = samplesWithDividers;
  }, [recordingsState.currentRecording, recordingsActions]);

  // Completed recordings list for simple playback reference
  const [completed, setCompleted] = React.useState(recordingsActions.getAllRecordings());
  React.useEffect(() => {
    setCompleted(recordingsActions.getAllRecordings());
  }, [recordingsState.allRecordings, recordingsActions]);

  // Playback state
  const [playingIndex, setPlayingIndex] = React.useState<number | null>(null);
  const soundRef = React.useRef<Audio.Sound | null>(null);

  const playRecording = async (idx: number) => {
    const rec = recordingsActions.getAllRecordings()[idx];
    if (!rec) return;

    // If already playing this index, stop
    if (playingIndex === idx) {
      try {
        await soundRef.current?.stopAsync();
        await soundRef.current?.unloadAsync();
      } catch (e) {
        // ignore
      }
      soundRef.current = null;
      setPlayingIndex(null);
      return;
    }

    // Stop previous sound
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch (e) {}
      soundRef.current = null;
      setPlayingIndex(null);
    }

    if (!rec.uri) {
      // No file URI available
      console.warn('No URI for recording', rec.id);
      return;
    }

    try {
      const { sound } = await Audio.Sound.createAsync({ uri: rec.uri });
      soundRef.current = sound;
      setPlayingIndex(idx);
      await sound.playAsync();
      // When finished, reset index
      sound.setOnPlaybackStatusUpdate((status) => {
        // Only act when loaded and finished
        // @ts-ignore - status typing varies between SDKs
        if (status && status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          setPlayingIndex(null);
        }
      });
    } catch (err) {
      console.warn('Failed to play recording', err);
    }
  };



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
          

          

          

        </View>
        {/* Completed recordings as play buttons */}
        <View style={styles.recordingsList}>
          {completed.map((recording, i) => (
            <TouchableOpacity
              key={recording.id}
              style={styles.recordingButton}
              onPress={() => playRecording(i)}
            >
              <Ionicons 
                name={playingIndex === i ? "stop" : "play"} 
                size={16} 
                color="#00ff00" 
              />
              <Text style={styles.recordingText}>
                {Math.round((recording.duration || 0) / 1000 * 100) / 100}s
              </Text>
            </TouchableOpacity>
          ))}
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
  recordingsList: {
    padding: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recordingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  recordingText: {
    color: '#00ff00',
    fontSize: 12,
    marginLeft: 6,
    fontFamily: 'monospace',
  },
});