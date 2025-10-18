import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface WaveformProps {
  width?: number;
  height?: number;
  isActive?: boolean;
  maxAmplitude?: number;
  frequency?: number;
  strokeWidth?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function Waveform({ 
  width = 60,
  height = screenHeight, // Full screen height
  isActive = true,
  maxAmplitude = 30,
  frequency = 2,
  strokeWidth = 2
}: WaveformProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  
  const animationProgress = useSharedValue(0);
  const audioLevel = useSharedValue(0);
  const amplitudeAnimation = useSharedValue(0);
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Request audio permissions
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await Audio.requestPermissionsAsync();
        setHasPermission(status === 'granted');
      }
    })();
  }, []);

  // Start/stop audio monitoring
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

      const recordingOptions: Audio.RecordingOptions = {
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: 44100,
          numberOfChannels: 2,
          bitRate: 128000,
          linearPCMBitDepth: 16,
          linearPCMIsBigEndian: false,
          linearPCMIsFloat: false,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: 128000,
        },
      };

      const { recording: newRecording } = await Audio.Recording.createAsync(recordingOptions);
      setRecording(newRecording);

      // Start monitoring audio levels
      intervalRef.current = setInterval(async () => {
        if (newRecording) {
          const status = await newRecording.getStatusAsync();
          if (status.isRecording && status.metering !== undefined) {
            const normalizedLevel = Math.max(0, Math.min(1, (status.metering + 100) / 100));
            runOnJS(updateAudioLevel)(normalizedLevel);
          }
        }
      }, 50); // Update every 50ms for smooth animation

    } catch (err) {
      console.log('Failed to start recording', err);
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
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
        });
        setRecording(null);
      } catch (err) {
        console.log('Failed to stop recording', err);
      }
    }
  };

  const updateAudioLevel = (level: number) => {
    audioLevel.value = withTiming(level, { duration: 50 });
  };

  useEffect(() => {
    if (isActive) {
      // Start the wave animation
      animationProgress.value = withRepeat(
        withTiming(1, {
          duration: 2000,
          easing: Easing.linear,
        }),
        -1,
        false
      );

      // Animate amplitude for a breathing effect
      amplitudeAnimation.value = withRepeat(
        withTiming(1, {
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
        }),
        -1,
        true
      );
    } else {
      animationProgress.value = withTiming(0, { duration: 500 });
      amplitudeAnimation.value = withTiming(0, { duration: 500 });
      audioLevel.value = withTiming(0, { duration: 500 });
    }
  }, [isActive]);

  const animatedProps = useAnimatedProps(() => {
    const numberOfWaves = frequency;
    const baseAmplitude = interpolate(
      amplitudeAnimation.value,
      [0, 1],
      [maxAmplitude * 0.1, maxAmplitude * 0.3]
    );
    
    // Combine base animation with real audio level
    const currentAmplitude = baseAmplitude + (audioLevel.value * maxAmplitude * 0.7);
    
    let pathData = `M ${width / 2} 0`;

    // Generate smooth wave path from top to bottom
    for (let i = 0; i <= height; i += 2) {
      const progress = i / height;
      const waveOffset = Math.sin(
        (progress * Math.PI * numberOfWaves * 2) + 
        (animationProgress.value * Math.PI * 2)
      ) * currentAmplitude * Math.sin(progress * Math.PI);
      
      const x = width / 2 + waveOffset;
      pathData += ` L ${x} ${i}`;
    }

    return {
      d: pathData,
    };
  });

  const secondaryAnimatedProps = useAnimatedProps(() => {
    const numberOfWaves = frequency;
    const baseAmplitude = interpolate(
      amplitudeAnimation.value,
      [0, 1],
      [maxAmplitude * 0.05, maxAmplitude * 0.2]
    );
    
    // Secondary wave with different audio response
    const currentAmplitude = baseAmplitude + (audioLevel.value * maxAmplitude * 0.5);
    
    let pathData = `M ${width / 2} 0`;

    for (let i = 0; i <= height; i += 2) {
      const progress = i / height;
      const waveOffset = Math.sin(
        (progress * Math.PI * numberOfWaves * 2) + 
        (animationProgress.value * Math.PI * 2) + Math.PI / 3
      ) * currentAmplitude * Math.sin(progress * Math.PI);
      
      const x = width / 2 + waveOffset;
      pathData += ` L ${x} ${i}`;
    }

    return {
      d: pathData,
    };
  });

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height} style={styles.svg}>
        <AnimatedPath
          animatedProps={animatedProps}
          stroke={colors.tint}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
        />
        {/* Secondary wave for depth */}
        <AnimatedPath
          animatedProps={secondaryAnimatedProps}
          stroke={colors.tint}
          strokeWidth={strokeWidth * 0.7}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.4}
        />
      </Svg>
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
    overflow: 'visible',
  },
});