import { useRecordingsActions } from '@/components/RecordingsData';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
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

interface WaveformProps {
  width?: number;
  height?: number;
  isActive?: boolean;
  scale?: number;
  orientation?: 'horizontal' | 'vertical';
  onRecordingStateChange?: (isRecording: boolean) => void;
  onMutedStateChange?: (isMuted: boolean) => void;
  onRecordingSamplesChange?: (samples: number[]) => void;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);



export default function Waveform({ 
  width = screenWidth, // Full screen width by default
  height = screenHeight * 0.25, // 25% of screen height by default
  isActive = true,
  scale = 1.6, // 2x default horizontal zoom
  orientation: initialOrientation = 'horizontal', // horizontal mode by default
  onRecordingStateChange,
  onMutedStateChange,
  onRecordingSamplesChange,
}: WaveformProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [showHUD, setShowHUD] = useState(false);
  const [xZoomDisplay, setXZoomDisplay] = useState(50);
  const [yZoomDisplay, setYZoomDisplay] = useState(50);
  const [orientation, setOrientation] = useState(initialOrientation);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [originalOrientation, setOriginalOrientation] = useState(initialOrientation);
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pushToTalkEnabled, setPushToTalkEnabled] = useState(false);
  const [isPushingToTalk, setIsPushingToTalk] = useState(false);
  const [isZooming, setIsZooming] = useState(false);
  const [isRecordingMode, setIsRecordingMode] = useState(false);
  const [isActivelyRecording, setIsActivelyRecording] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isPushingToMic, setIsPushingToMic] = useState(false);

  
  const audioSamples = useSharedValue<number[]>([]);
  
  // Back to shared values for zoom to work with worklets
  // Start with reasonable defaults so waveform is visible
  const xZoom = useSharedValue(0.3); // Some amplitude by default
  const yZoom = useSharedValue(0.5); // Medium speed by default
  const hudOpacity = useSharedValue(0);
  const mutedSharedValue = useSharedValue(false);
  const micButtonScale = useSharedValue(1);
  const micButtonOpacity = useSharedValue(1);
  const settingsOpacity = useSharedValue(0);
  const zoomButtonScale = useSharedValue(1);
  const recordButtonScale = useSharedValue(1);
  const recordButtonOpacity = useSharedValue(1);
  const minimizeOpacity = useSharedValue(1);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioBufferRef = useRef<number[]>([]);
  const currentRecordingSessionId = useRef<string | null>(null);
  
  // Get recordings actions
  const recordingsActions = useRecordingsActions();

  // Request permissions
  useEffect(() => {
    (async () => {
      const { status } = await Audio.requestPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Notify parent of recording state changes
  useEffect(() => {
    const isRecording = isActivelyRecording || isRecordingMode;
    onRecordingStateChange?.(isRecording);
  }, [isActivelyRecording, isRecordingMode, onRecordingStateChange]);

  // Notify parent of muted state changes
  useEffect(() => {
    onMutedStateChange?.(isMuted);
  }, [isMuted, onMutedStateChange]);



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
            const shouldShowAudio = !mutedSharedValue.value;
            
            if (shouldShowAudio) {
              // Create realistic audio variation - silence = tiny, loud = big
              const baseVariation = (Math.random() - 0.5) * 0.05; // Reduced background noise
              const levelVariation = level * (Math.random() - 0.5) * 1.2; // Increased amplification for loud sounds
              const sample = (baseVariation + levelVariation) * (Math.random() > 0.5 ? 1 : -1);
              // Don't clamp - let loud sounds go beyond bounds naturally
              newSamples.push(sample);
            } else {
              // When muted or not recording, add silence (zeros) to the buffer
              newSamples.push(0);
            }
          }
          
          // Maintain a rolling buffer of recent samples
          audioBufferRef.current.push(...newSamples);
          
          // When recording, limit buffer to recording duration, otherwise use zoom controls
          if (isRecordingMode || isActivelyRecording) {
            // Keep all samples from recording start - no rolling window
            // The waveform will show the full recording from start to current time
          } else {
            // Convert yZoom (0-1) to timeZoom for duration control
            // Y axis controls how much timeline/duration we see
            const timeZoomValue = 0.5 + (yZoom.value * 4.5); // 0->0.5, 1->5.0
            const currentWidth = isFullscreen ? screenWidth : width;
            const currentHeight = isFullscreen ? screenHeight : height;
            const dimensionForSamples = orientation === 'horizontal' ? currentWidth : currentHeight;
            const maxSamples = Math.floor(dimensionForSamples * 4 * timeZoomValue);
            if (audioBufferRef.current.length > maxSamples) {
              audioBufferRef.current = audioBufferRef.current.slice(-maxSamples);
            }
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
    
    // If we're actively recording, update the current session in global state
    if (isActivelyRecording && currentRecordingSessionId.current) {
      recordingsActions.updateCurrentSessionSamples(samples);
    }
    
    // Always send the current audio buffer to RecordingsViewer - let it decide what to do
    if (samples.length > 0) {
      onRecordingSamplesChange?.(samples);
    }
  };

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    mutedSharedValue.value = newMutedState;
    // No need to clear the waveform immediately - let the buffer continue with silence
  };

  const handleMicPressIn = () => {
    micPressStartTime.current = Date.now();
    if (pushToTalkEnabled) {
      setIsPushingToTalk(true);
      mutedSharedValue.value = false; // Allow audio when pressing
      micButtonScale.value = withTiming(1.3, { duration: 150 });
    } else if (isMuted) {
      // When muted and not in push-to-talk mode, start push-to-unmute
      setIsPushingToMic(true);
      mutedSharedValue.value = false; // Allow audio when pressing
      micButtonScale.value = withTiming(1.3, { duration: 150 });
    }
  };

  const handleMicPressOut = () => {
    const pressDuration = micPressStartTime.current ? Date.now() - micPressStartTime.current : 0;
    
    if (pushToTalkEnabled) {
      setIsPushingToTalk(false);
      mutedSharedValue.value = true; // Mute when releasing
      micButtonScale.value = withTiming(1, { duration: 150 });
    } else if (isMuted && isPushingToMic) {
      if (pressDuration < 250) { // 0.25 second grace period
        // Quick tap - toggle mute state permanently
        setIsMuted(false);
        mutedSharedValue.value = false;
        micButtonScale.value = withTiming(1, { duration: 100 });
      } else {
        // Long press - return to muted state
        mutedSharedValue.value = true;
        micButtonScale.value = withTiming(1, { duration: 150 });
      }
      setIsPushingToMic(false);
    }
  };

  const toggleSettings = () => {
    const newShowSettings = !showSettings;
    setShowSettings(newShowSettings);
    settingsOpacity.value = withTiming(newShowSettings ? 1 : 0, { duration: 100 }); // 3x faster (300ms -> 100ms)
  };

  const toggleMinimize = () => {
    const newMinimized = !isMinimized;
    setIsMinimized(newMinimized);
    // No opacity animation needed since we removed the fade effect
  };

  const updateDisplayValues = () => {
    setXZoomDisplay(Math.round(xZoom.value * 100));
    // Invert Y display so 100% is at top (fastest) and 0% is at bottom (slowest)
    setYZoomDisplay(Math.round((1 - yZoom.value) * 100));
  };

  // Zoom button handlers
  const handleZoomPressIn = () => {
    setIsZooming(true);
    setShowHUD(true);
    hudOpacity.value = withTiming(1, { duration: 200 });
    zoomButtonScale.value = withTiming(1.3, { duration: 150 });
  };

  const handleZoomPressOut = () => {
    // Don't stop zooming on press out - let the gesture handle it
    // This allows dragging away from the button while still zooming
  };

  const stopZooming = () => {
    setIsZooming(false);
    hudOpacity.value = withTiming(0, { duration: 500 });
    setTimeout(() => setShowHUD(false), 500);
    zoomButtonScale.value = withTiming(1, { duration: 150 });
  };

  // Record button handlers
  const recordPressStartTime = useRef<number | null>(null);
  
  // Mic button handlers
  const micPressStartTime = useRef<number | null>(null);
  
  const handleRecordPressIn = () => {
    recordPressStartTime.current = Date.now();
    recordButtonScale.value = withTiming(1.3, { duration: 150 });
    
    // Start hold recording immediately
    if (!isActivelyRecording) {
      startHoldRecording();
    }
  };

  const handleRecordPressOut = () => {
    const pressDuration = recordPressStartTime.current ? Date.now() - recordPressStartTime.current : 0;
    
    if (pressDuration < 250) {
      // Quick tap - stop current recording and toggle to persistent mode
      recordButtonScale.value = withTiming(1, { duration: 100 });
      if (isActivelyRecording && !isRecordingMode) {
        // Convert hold recording to persistent recording
        setIsRecordingMode(true);
      } else if (isRecordingMode) {
        // Stop persistent recording
        finishRecording();
      }
    } else {
      // Long press - stop hold recording
      recordButtonScale.value = withTiming(1, { duration: 150 });
      if (isActivelyRecording && !isRecordingMode) {
        finishRecording();
      }
    }
  };

  const handleRecordLongPress = () => {
    // This is no longer needed since we start immediately on press in
    // But keep it for compatibility
  };

  // Remove this function since we're handling recording logic in press handlers

  const startHoldRecording = () => {
    if (!isActivelyRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setRecordingStartTime(Date.now());
      setIsActivelyRecording(true);
      // Start a new recording session ONLY if we don't already have one
      if (!currentRecordingSessionId.current) {
        currentRecordingSessionId.current = recordingsActions.startNewRecordingSession();
      }
      // Button stays enlarged while holding to record
    }
  };

  const stopHoldRecording = () => {
    if (isActivelyRecording && !isRecordingMode) {
      // Return to normal scale when stopping hold recording
      recordButtonScale.value = withTiming(1, { duration: 150 });
      finishRecording();
    }
  };

  const finishRecording = () => {
    if (recordingStartTime && isActivelyRecording) {
      const recordingDuration = Date.now() - recordingStartTime;
      const recordingSamples = [...audioBufferRef.current]; // Copy current samples
      
      // Strong haptic feedback when recording ends
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      
      // Stop & unload the expo recording (if present) and capture URI
      (async () => {
        let uri: string | undefined = undefined;
        try {
          if (recording) {
            await recording.stopAndUnloadAsync();
            // @ts-ignore - some SDKs place uri on recording.getURI()
            // prefer getURI if available
            // recording.getURI() may be async in some versions; use property when present
            // Fallback to recording.getURI?.() if available
            // Try both options safely
            // @ts-ignore
            if (typeof recording.getURI === 'function') {
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore
              const maybeUri = recording.getURI();
              if (typeof maybeUri === 'string') uri = maybeUri;
              else if (maybeUri && typeof (maybeUri as any).then === 'function') {
                // promise
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                uri = await (maybeUri as Promise<string>);
              }
            } else if ((recording as any).getURI) {
              // @ts-ignore
              uri = (recording as any).getURI();
            }
          }
        } catch (err) {
          console.warn('Failed to stop recording cleanly:', err);
        }

        // End the recording session in our global state with URI
        recordingsActions.endCurrentRecordingSession(uri);
        currentRecordingSessionId.current = null;
      })();
      
      // Recording completed successfully
      setIsRecordingMode(false);
      setIsActivelyRecording(false);
      setRecordingStartTime(null);
      
      // Don't reset the waveform - keep it showing the recorded audio
      // audioBufferRef.current = [];
      // audioSamples.value = [];
    }
  };

  // Zoom gesture - active across the entire waveform when zoom button is pressed
  const zoomGesture = Gesture.Pan()
    .onBegin(() => {
      // Only handle if we're in zoom mode
      if (!isZooming) return;
    })
    .onUpdate((event) => {
      if (!isZooming) return;
      
      const currentWidth = isFullscreen ? screenWidth : width;
      const currentHeight = isFullscreen ? screenHeight : height;
      
      // Use absolute position for better tracking
      const touchX = Math.max(0, Math.min(currentWidth, event.absoluteX));
      const touchY = Math.max(0, Math.min(currentHeight, event.absoluteY));
      
      if (orientation === 'horizontal') {
        // Horizontal mode: X position controls speed, Y position controls amplitude
        const xProgress = touchX / currentWidth;
        yZoom.value = xProgress;
        
        const centerY = currentHeight / 2;
        const maxDistance = currentHeight / 2;
        const distanceFromCenter = Math.abs(touchY - centerY);
        const yProgress = Math.min(1, distanceFromCenter / maxDistance);
        xZoom.value = yProgress;
      } else {
        // Vertical mode: Y position controls speed, X position controls amplitude
        const yProgress = touchY / currentHeight;
        yZoom.value = yProgress;
        
        const centerX = currentWidth / 2;
        const maxDistance = currentWidth / 2;
        const distanceFromCenter = Math.abs(touchX - centerX);
        const xProgress = Math.min(1, distanceFromCenter / maxDistance);
        xZoom.value = xProgress;
      }
      
      runOnJS(updateDisplayValues)();
    })
    .onEnd(() => {
      // Stop zooming when gesture ends
      runOnJS(stopZooming)();
    });

  const animatedProps = useAnimatedProps(() => {
    const samples = audioSamples.value;
    const currentWidth = isFullscreen ? screenWidth : width;
    const currentHeight = isFullscreen ? screenHeight : height;
    
    if (samples.length === 0) {
      if (orientation === 'horizontal') {
        return { d: `M 0 ${currentHeight / 2} L ${currentWidth} ${currentHeight / 2}` };
      } else {
        return { d: `M ${currentWidth / 2} 0 L ${currentWidth / 2} ${currentHeight}` };
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
      const len = currentWidth;
      const waveformScale = currentHeight * 0.5 * scale * amplitudeScale;
      const center = currentHeight * 0.5;
      
      const step = Math.max(1, samples.length) / len;
      const stride = 2;

      for (let i = 0; i < len; i += stride) {
        const sampleIndex = Math.floor(i * step);
        if (sampleIndex >= samples.length) break;
        
        // DIRECT multiplication with gesture-controlled amplitude
        const offset = samples[sampleIndex] * waveformScale;
        const x = i;
        const y = Math.max(0, Math.min(currentHeight, center + offset)); // Constrain to screen bounds
        
        if (prevX !== null && prevY !== null) {
          if (pathData === '') {
            pathData = `M ${prevX} ${prevY}`;
          }
          pathData += ` L ${x} ${y}`;
        }
        
        prevX = x;
        prevY = y;
      }
      
      return { d: pathData || `M 0 ${center} L ${currentWidth} ${center}` };
    } else {
      // Vertical mode: waveform goes from top to bottom (original behavior)
      const len = currentHeight;
      const waveformScale = currentWidth * 0.5 * scale * amplitudeScale;
      const center = currentWidth * 0.5;
      
      const step = Math.max(1, samples.length) / len;
      const stride = 2;

      for (let i = 0; i < len; i += stride) {
        const sampleIndex = Math.floor(i * step);
        if (sampleIndex >= samples.length) break;
        
        // DIRECT multiplication with gesture-controlled amplitude
        const offset = samples[sampleIndex] * waveformScale;
        const x = Math.max(0, Math.min(currentWidth, center + offset)); // Constrain to screen bounds
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

      return { d: pathData || `M ${center} 0 L ${center} ${currentHeight}` };
    }
  });

  // HUD animations
  const hudStyle = useAnimatedStyle(() => ({
    opacity: hudOpacity.value,
    pointerEvents: 'none',
  }));

  // Animated styles for mic button
  const micButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: micButtonScale.value }],
    opacity: micButtonOpacity.value,
    backgroundColor: (isPushingToTalk || isPushingToMic)
      ? 'rgba(0, 255, 0, 0.8)' 
      : 'rgba(0, 0, 0, 0.7)',
  }));

  // Settings overlay animation
  const settingsOverlayStyle = useAnimatedStyle(() => ({
    opacity: settingsOpacity.value,
    pointerEvents: settingsOpacity.value > 0 ? 'auto' : 'none',
  }));

  // Zoom button animation
  const zoomButtonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: zoomButtonScale.value }],
    backgroundColor: isZooming ? 'rgba(0, 255, 0, 0.8)' : 'rgba(0, 0, 0, 0.7)',
  }));

  // Record button animation
  const recordButtonAnimatedStyle = useAnimatedStyle(() => {
    const samples = audioSamples.value;
    let volumeLevel = 0;
    
    if (isActivelyRecording && samples.length > 0) {
      // Calculate current volume level from recent samples
      const recentSamples = samples.slice(-50); // Last 50 samples
      const avgVolume = recentSamples.reduce((sum, sample) => sum + Math.abs(sample), 0) / recentSamples.length;
      volumeLevel = Math.min(1, avgVolume * 10); // Scale and clamp
    }
    
    // Slight vibration effect when recording
    const vibrationOffset = isActivelyRecording ? (Math.sin(Date.now() * 0.01) * volumeLevel * 2) : 0;
    
    return {
      transform: [
        { scale: recordButtonScale.value },
        { translateX: vibrationOffset },
        { translateY: vibrationOffset * 0.7 }
      ],
      backgroundColor: isActivelyRecording ? 'rgba(255, 0, 0, 1)' : 'rgba(0, 255, 0, 0.4)', // Solid red when recording
      shadowColor: isActivelyRecording ? '#ff0000' : 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: isActivelyRecording ? 0.6 + (volumeLevel * 0.4) : 0, // Glow intensity based on volume
      shadowRadius: isActivelyRecording ? 8 + (volumeLevel * 12) : 0, // Glow size based on volume
      elevation: isActivelyRecording ? 8 + (volumeLevel * 8) : 0,
    };
  });

  // Minimize animation style
  const minimizeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: 1, // Remove fade effect - always full opacity
  }));

  const AnimatedText = Animated.createAnimatedComponent(Text);
  const AnimatedLine = Animated.createAnimatedComponent(Line);

  // Calculate actual dimensions based on fullscreen state
  const actualWidth = isFullscreen ? screenWidth : width;
  const actualHeight = isFullscreen ? screenHeight : height;

  return (
    <GestureDetector gesture={zoomGesture}>
      <Animated.View style={[{ width: actualWidth, height: 'auto' }, minimizeAnimatedStyle]}>
        <View style={[
          styles.container, 
          isFullscreen ? styles.fullscreenContainer : styles.waveformBoundary, 
          { 
            width: actualWidth, 
            height: isMinimized ? 60 : actualHeight, // Minimize to just show top bar with buttons
            ...(isFullscreen ? {} : {
              marginTop: insets.top,
              marginLeft: insets.left,
              marginRight: insets.right 
            })
          }
        ]}>
          {!isMinimized && (
            <Svg width={actualWidth} height={actualHeight}>
              <AnimatedPath
                animatedProps={animatedProps}
                stroke="#00ff00"
                strokeWidth={2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          )}
          
          {/* HUD Overlay */}
          {showHUD && !isMinimized && (
            <Animated.View style={[styles.hudContainer, hudStyle]}>
              <Svg width={actualWidth} height={actualHeight} style={styles.hudSvg}>
                {/* Crosshair lines */}
                <AnimatedLine
                  x1={0}
                  y1={actualHeight / 2}
                  x2={actualWidth}
                  y2={actualHeight / 2}
                  stroke="#00ff00"
                  strokeWidth={1}
                  opacity={0.5}
                />
                <AnimatedLine
                  x1={actualWidth / 2}
                  y1={0}
                  x2={actualWidth / 2}
                  y2={actualHeight}
                  stroke="#00ff00"
                  strokeWidth={1}
                  opacity={0.5}
                />
              </Svg>
              
              {/* Control Labels */}
              <View style={[styles.xLabel, { left: actualWidth / 2 + 10, top: actualHeight / 2 - 45 }]}>
                <Text style={[styles.labelText, { color: '#00ff00' }]}>
                  {orientation === 'horizontal' ? 'Y' : 'X'}: {xZoomDisplay}%
                </Text>
                <Text style={[styles.subLabelText, { color: '#00ff00' }]}>
                  (amplitude)
                </Text>
              </View>
              
              <View style={[styles.yLabel, { left: actualWidth / 2 + 10, top: actualHeight / 2 + 5 }]}>
                <Text style={[styles.labelText, { color: '#00ff00' }]}>
                  {orientation === 'horizontal' ? 'X' : 'Y'}: {yZoomDisplay}%
                </Text>
                <Text style={[styles.subLabelText, { color: '#00ff00' }]}>
                  (speed)
                </Text>
              </View>
            </Animated.View>
          )}
          
          {/* Settings Button - Top Left */}
          {!isMinimized && (
            <TouchableOpacity 
              style={[
                styles.settingsButton,
                isFullscreen && {
                  top: Math.max(16, insets.top + 16),
                  left: Math.max(16, insets.left + 16),
                }
              ]}
              onPress={toggleSettings}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={showSettings ? "close" : "settings"} 
                size={18} 
                color="#00ff00" 
              />
            </TouchableOpacity>
          )}

          {/* Minimize Button - Top Center (hidden when maximized) */}
          {!isFullscreen && (
            <TouchableOpacity 
              style={styles.minimizeButton}
              onPress={toggleMinimize}
              activeOpacity={0.7}
            >
              <Ionicons 
                name={isMinimized ? "chevron-down" : "remove"} 
                size={18} 
                color="#00ff00" 
              />
            </TouchableOpacity>
          )}

          {/* Recording Dot - To the right of minimize button */}
          {isActivelyRecording && (
            <View style={[
              styles.recordingDot,
              isFullscreen && {
                top: Math.max(30, insets.top + 30), // Updated for larger 40px buttons
                left: '50%',
                marginLeft: -6, // Center the dot when fullscreen
              }
            ]}>
              <View style={styles.recordingDotInner} />
            </View>
          )}

          {/* Zoom Button - Top Right */}
          {!isMinimized && (
            <Animated.View style={[
              styles.zoomButton,
              isFullscreen && {
                top: Math.max(16, insets.top + 16),
                right: Math.max(16, insets.right + 16),
              },
              zoomButtonAnimatedStyle
            ]}>
              <TouchableOpacity 
                style={styles.buttonTouchArea}
                onPressIn={handleZoomPressIn}
                onPressOut={handleZoomPressOut}
                delayPressOut={0} // Allow immediate response when dragging off
                activeOpacity={0.7}
              >
                <Ionicons 
                  name="search" 
                  size={18} 
                  color="#00ff00" 
                />
              </TouchableOpacity>
            </Animated.View>
          )}

          {/* Settings Overlay */}
          {!isMinimized && (
            <Animated.View style={[styles.settingsOverlay, settingsOverlayStyle]} pointerEvents="box-none">
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Push to Talk</Text>
              <Switch
                value={pushToTalkEnabled}
                onValueChange={(value) => {
                  setPushToTalkEnabled(value);
                  if (value) {
                    // When enabling push-to-talk, start in muted state
                    setIsMuted(true);
                    mutedSharedValue.value = true;
                  } else {
                    // When disabling push-to-talk, unmute
                    setIsMuted(false);
                    mutedSharedValue.value = false;
                  }
                }}
                trackColor={{ false: '#767577', true: '#00ff0060' }}
                thumbColor={pushToTalkEnabled ? '#00ff00' : '#f4f3f4'}
                ios_backgroundColor="#3e3e3e"
              />
            </View>
          </Animated.View>
          )}

          {/* Control Overlay Bar */}
          {!isMinimized && (
            <View style={[
              styles.controlOverlay,
              isFullscreen && {
                paddingBottom: Math.max(12, insets.bottom + 12),
                paddingLeft: Math.max(16, insets.left + 16),
                paddingRight: Math.max(16, insets.right + 16),
              }
            ]}>
              {/* Mic Button - Bottom Left */}
              <Animated.View style={[
                styles.controlButton,
                micButtonAnimatedStyle
              ]}>
                <TouchableOpacity 
                  style={styles.buttonTouchArea}
                  onPress={pushToTalkEnabled || isMuted ? undefined : toggleMute}
                  onPressIn={pushToTalkEnabled || isMuted ? handleMicPressIn : undefined}
                  onPressOut={pushToTalkEnabled || isMuted ? handleMicPressOut : undefined}
                  activeOpacity={0.7}
                  delayPressOut={0} // Allow immediate response when dragging off
                >
                  <Ionicons 
                    name={pushToTalkEnabled 
                      ? (isPushingToTalk ? 'mic' : 'mic-off')
                      : (isMuted ? (isPushingToMic ? 'mic' : 'mic-off') : 'mic')
                    } 
                    size={18} 
                    color="#00ff00" 
                  />
                </TouchableOpacity>
              </Animated.View>
              
              {/* Fullscreen/Maximize Button - Bottom Right */}
              <TouchableOpacity 
                style={styles.controlButton}
                onPress={() => {
                  if (!isFullscreen) {
                    // Maximizing: save current orientation and switch to vertical
                    setOriginalOrientation(orientation);
                    setOrientation('vertical');
                    setIsFullscreen(true);
                  } else {
                    // Minimizing: restore original orientation
                    setOrientation(originalOrientation);
                    setIsFullscreen(false);
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons 
                  name={isFullscreen ? 'contract' : 'expand'} 
                  size={isFullscreen ? 22 : 18} 
                  color="#00ff00" 
                />
              </TouchableOpacity>
            </View>
          )}
        </View>
        
        {/* Record Button Container */}
        {!isMinimized && (
          <View style={[styles.recordContainer, { 
            width: actualWidth,
            marginLeft: isFullscreen ? 0 : insets.left,
            marginRight: isFullscreen ? 0 : insets.right 
          }]}>
            <Animated.View style={[
              styles.recordButton, 
              recordButtonAnimatedStyle,
              isActivelyRecording && styles.recordButtonRecording
            ]}>
              <TouchableOpacity
                style={styles.recordButtonTouchArea}
                onPressIn={handleRecordPressIn}
                onPressOut={handleRecordPressOut}
                onLongPress={handleRecordLongPress}
                delayLongPress={500}
                delayPressOut={0} // Allow immediate response when dragging off
                activeOpacity={0.9}
              />
            </Animated.View>
          </View>
        )}


      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    // Remove flex: 1 to allow explicit width/height control
  },
  waveformBoundary: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: 1,
    borderBottomWidth: 0, // Remove bottom border to connect with recorder
    borderColor: 'rgba(0, 255, 0, 0.3)',
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
  fullscreenContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#121212',
    zIndex: 1000,
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
  controlOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    pointerEvents: 'box-none', // Allow touches to pass through except for button
  },
  controlButton: {
    width: 40, // 10% larger than 36px (36 * 1.1 ≈ 40)
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },

  buttonTouchArea: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40, // 10% larger
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    zIndex: 300, // Higher than settings overlay
  },
  minimizeButton: {
    position: 'absolute',
    top: 16,
    left: '50%',
    marginLeft: -20, // Half of width to center (40/2)
    width: 40, // 10% larger
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    zIndex: 250, // Between settings and zoom
  },
  recordingDot: {
    position: 'absolute',
    top: 30, // Vertically centered with 40px buttons at top: 16 (16 + 20 - 6 = 30)
    left: '50%',
    marginLeft: 30, // To the right of minimize button (20 + 10 spacing)
    width: 12,
    height: 12,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 260, // Above minimize button
  },
  recordingDotInner: {
    width: 8,
    height: 8,
    backgroundColor: '#ff0000',
    borderRadius: 4,
    shadowColor: '#ff0000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  zoomButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 40, // 10% larger
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    zIndex: 100,
  },
  settingsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18, 18, 18, 0.85)', // Back to original glassy background
    justifyContent: 'center',
    alignItems: 'center', // Perfectly centered
    paddingHorizontal: 40,
    paddingVertical: 80,
    zIndex: 200,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30, // Margin around the sides
    paddingVertical: 12,
    minWidth: 250, // Ensure proper width for spacing
  },
  settingLabel: {
    fontSize: 17, // System font size
    color: '#ffffff', // System text color
    fontWeight: '400', // System font weight
    textAlign: 'left', // Left aligned text
  },

  fullscreenButton: {
    width: 48,
    height: 48,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  // Record button container - connected to waveform container
  recordContainer: {
    height: 80,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftColor: 'rgba(0, 255, 0, 0.3)',
    borderRightColor: 'rgba(0, 255, 0, 0.3)',
    borderBottomColor: 'rgba(0, 255, 0, 0.3)',
    borderTopColor: 'rgba(128, 128, 128, 0.4)', // Gray separator line
    borderTopWidth: 1,
    marginHorizontal: 16,
    marginTop: 0, // Remove gap between containers
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  recordButton: {
    width: 50, // 10% larger than 45 (45 * 1.1 ≈ 50)
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonTouchArea: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonInner: {
    // Remove inner design - button itself is now the visual element
    display: 'none',
  },
  recordButtonRecording: {
    // No glow effect when recording - just the color change
  },

});