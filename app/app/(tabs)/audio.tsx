import React, { useState } from 'react';
import { View, Text, Button } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playContinuousHaptic } from '../haptics';
import Slider from '../../components/ui/slider';

export default function AudioTab() {
  const [intensity, setIntensity] = useState(1.0);
  const [sharpness, setSharpness] = useState(0.5);
  // Use refs to hold live values for haptic stream
  const valuesRef = React.useRef({ intensity: 1.0, sharpness: 0.5 });
  const duration = 0.5;
  const [isPlaying, setIsPlaying] = useState(false);
  const controllerRef = React.useRef<{ cancel: () => void } | null>(null);

  // Stream generator for continuous haptic
  async function* hapticStream() {
    while (true) {
      // Always yield the latest values from ref
      yield { intensity: valuesRef.current.intensity, sharpness: valuesRef.current.sharpness, duration };
      await new Promise(resolve => setTimeout(resolve, duration * 1000));
    }
  }

  // Store the current haptic runner
  const hapticRunnerRef = React.useRef<Promise<void> | null>(null);

  const startHaptic = () => {
    let cancelled = false;
    controllerRef.current = {
      cancel: () => { cancelled = true; }
    };
    // Wrap the stream to allow cancellation
    async function* cancellableStream() {
      for await (const value of hapticStream()) {
        if (cancelled) break;
        yield value;
      }
    }
    hapticRunnerRef.current = playContinuousHaptic(cancellableStream()).then(() => {
      setIsPlaying(false);
    });
  };

  const stopHaptic = () => {
    controllerRef.current?.cancel();
    hapticRunnerRef.current = null;
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      stopHaptic();
      return;
    }
    setIsPlaying(true);
    startHaptic();
  };

  // Update ref and state on slider change
  const handleIntensityChange = (val: number) => {
    setIntensity(val);
    valuesRef.current.intensity = val;
  };
  const handleSharpnessChange = (val: number) => {
    setSharpness(val);
    valuesRef.current.sharpness = val;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Haptic Player</Text>
      <View style={{ marginBottom: 32 }}>
        <Text style={{ color: '#fff', marginBottom: 8 }}>Intensity: {intensity.toFixed(2)}</Text>
        <Slider
          value={intensity}
          onValueChange={handleIntensityChange}
          trackColor="#39ff14"
          minimumValue={0}
          maximumValue={1}
          defaultValue={1.0}
        />
        <Text style={{ color: '#fff', marginTop: 16, marginBottom: 8 }}>Sharpness: {sharpness.toFixed(2)}</Text>
        <Slider
          value={sharpness}
          onValueChange={handleSharpnessChange}
          trackColor="#39ff14"
          minimumValue={0}
          maximumValue={1}
          defaultValue={0.5}
        />
        <View style={{ marginTop: 24 }}>
          <Button
            title={isPlaying ? 'Pause' : 'Play Haptic'}
            color="#39ff14"
            onPress={handlePlayPause}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}
