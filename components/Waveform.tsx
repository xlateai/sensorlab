import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface WaveformProps {
  width?: number;
  height?: number;
  isActive?: boolean;
  amplitude?: number;
  frequency?: number;
  strokeWidth?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function Waveform({ 
  width = 60,
  height = screenHeight * 0.6,
  isActive = true,
  amplitude = 20,
  frequency = 2,
  strokeWidth = 2
}: WaveformProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  
  const animationProgress = useSharedValue(0);
  const amplitudeAnimation = useSharedValue(0);

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
    }
  }, [isActive]);

  const animatedProps = useAnimatedProps(() => {
    const numberOfWaves = frequency;
    const currentAmplitude = interpolate(
      amplitudeAnimation.value,
      [0, 1],
      [amplitude * 0.3, amplitude]
    );
    
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
          animatedProps={useAnimatedProps(() => {
            const numberOfWaves = frequency;
            const currentAmplitude = interpolate(
              amplitudeAnimation.value,
              [0, 1],
              [amplitude * 0.2, amplitude * 0.6]
            );
            
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
          })}
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