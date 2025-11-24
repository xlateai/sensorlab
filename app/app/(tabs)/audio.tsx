import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playContinuousHaptic } from '../utils/haptics';
import { playPureSine, stopAudio, AudioController } from '../utils/audio-utils';
import Slider from '../../components/ui/slider';

export default function AudioTab() {
  const [intensity, setIntensity] = useState(1.0);
  const [sharpness, setSharpness] = useState(0.5);
  // Use refs to hold live values for haptic stream
  const valuesRef = React.useRef({ intensity: 1.0, sharpness: 0.5 });
  const duration = 0.5;
  const [isPlaying, setIsPlaying] = useState(false);
  const controllerRef = React.useRef<{ cancel: () => void } | null>(null);
  
  // Audio test state
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [bufferLength, setBufferLength] = useState(0);
  const [frequency, setFrequency] = useState(440); // Default to A4 note
  const audioControllerRef = useRef<AudioController | null>(null);
  const audioParamsRef = useRef({ frequency: 440, volume: 0.3 });
  
  // Frequency range mapping (20-2000 Hz)
  const MIN_FREQUENCY = 20;
  const MAX_FREQUENCY = 2000;

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
    // Don't start if already playing
    if (isPlaying || hapticRunnerRef.current) {
      return;
    }
    
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
      hapticRunnerRef.current = null;
      controllerRef.current = null;
    }).catch(() => {
      setIsPlaying(false);
      hapticRunnerRef.current = null;
      controllerRef.current = null;
    });
  };

  const stopHaptic = async () => {
    controllerRef.current?.cancel();
    setIsPlaying(false);
    
    // Wait for the promise to complete
    if (hapticRunnerRef.current) {
      try {
        await hapticRunnerRef.current;
      } catch (error) {
        // Ignore errors from cancellation
      }
      hapticRunnerRef.current = null;
    }
    controllerRef.current = null;
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      await stopHaptic();
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

  // Initialize audio and start streaming constant volume samples
  const startTestAudio = async () => {
    // Don't start if already playing
    if (isAudioPlaying || audioControllerRef.current) {
      return;
    }
    
    try {
      setIsAudioPlaying(true);
      
      // Update ref with current values
      audioParamsRef.current = { frequency, volume: 0.3 };
      
      // Play pure sine wave with dynamic frequency and volume
      // Using getter functions so we can update frequency/volume during playback
      const controller = await playPureSine(
        () => audioParamsRef.current.frequency, // getter for frequency
        () => audioParamsRef.current.volume,    // getter for volume
        (length) => setBufferLength(length)      // buffer length update callback
      );
      
      audioControllerRef.current = controller;
      
      // Wait for the promise to complete (or be cancelled)
      controller.promise.finally(() => {
        setIsAudioPlaying(false);
        audioControllerRef.current = null;
      });
    } catch (error) {
      console.error('Failed to start test audio:', error);
      setIsAudioPlaying(false);
      audioControllerRef.current = null;
    }
  };
  
  // Handle frequency change - update ref so it affects playback in real-time
  // Slider value is 0-1, map it to frequency range
  const handleFrequencyChange = (sliderValue: number) => {
    const freq = MIN_FREQUENCY + sliderValue * (MAX_FREQUENCY - MIN_FREQUENCY);
    setFrequency(freq);
    audioParamsRef.current.frequency = freq;
  };
  
  // Convert frequency to slider value (0-1)
  const frequencyToSliderValue = (freq: number): number => {
    return (freq - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY);
  };
  
  const stopTestAudio = async () => {
    setIsAudioPlaying(false);
    
    // Cancel the audio controller
    if (audioControllerRef.current) {
      audioControllerRef.current.cancel();
      
      // Wait for streaming to stop
      try {
        await audioControllerRef.current.promise;
      } catch (error) {
        // Ignore errors from cancellation
      }
      audioControllerRef.current = null;
    }
    
    // Stop audio engine
    try {
      await stopAudio();
      setBufferLength(0);
    } catch (error) {
      console.error('Failed to stop audio:', error);
    }
  };
  
  const handleTestAudioToggle = () => {
    if (isAudioPlaying) {
      stopTestAudio();
    } else {
      startTestAudio();
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioControllerRef.current) {
        audioControllerRef.current.cancel();
      }
      stopAudio().catch(() => {});
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Haptic Player</Text>
      <View style={{ marginBottom: 32 }}>
        <Text style={{ color: '#fff', marginBottom: 8 }}>Intensity: {intensity.toFixed(2)}</Text>
        <Slider
          value={intensity}
          onValueChange={handleIntensityChange}
          trackColor="#39ff14"
        />
        <Text style={{ color: '#fff', marginTop: 16, marginBottom: 8 }}>Sharpness: {sharpness.toFixed(2)}</Text>
        <Slider
          value={sharpness}
          onValueChange={handleSharpnessChange}
          trackColor="#39ff14"
        />
        <View style={{ marginTop: 24 }}>
          <Button
            title={isPlaying ? 'Pause' : 'Play Haptic'}
            color="#39ff14"
            onPress={handlePlayPause}
          />
        </View>
      </View>
      
      <View style={{ marginTop: 32, paddingTop: 32, borderTopWidth: 1, borderTopColor: '#333' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Audio Test</Text>
        <Text style={{ color: '#fff', marginBottom: 8 }}>
          Frequency: {frequency.toFixed(1)} Hz
        </Text>
        <Slider
          value={frequencyToSliderValue(frequency)}
          onValueChange={handleFrequencyChange}
          trackColor="#39ff14"
        />
        <Button
          title={isAudioPlaying ? 'Stop' : 'Start Test Audio'}
          color="#39ff14"
          onPress={handleTestAudioToggle}
        />
        <Text style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
          Buffer: {bufferLength} samples
        </Text>
      </View>
    </SafeAreaView>
  );
}
