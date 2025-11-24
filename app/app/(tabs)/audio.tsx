import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playContinuousHaptic } from '../haptics';
import Slider from '../../components/ui/slider';
import { requireNativeModule } from 'expo-modules-core';

const Sensorlib = requireNativeModule('Sensorlib');

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
  const audioCancelledRef = useRef(false);
  const audioInitializedRef = useRef(false);
  const bufferUpdateIntervalRef = useRef<number | null>(null);

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

  // Initialize audio and start streaming constant volume samples
  const startTestAudio = async () => {
    try {
      // Initialize audio engine if not already done
      if (!audioInitializedRef.current) {
        await Sensorlib.initializeAudio({ sampleRate: 44100, channelCount: 1 });
        audioInitializedRef.current = true;
      }
      
      audioCancelledRef.current = false;
      setIsAudioPlaying(true);
      
      // Start updating buffer length display
      bufferUpdateIntervalRef.current = setInterval(() => {
        if (!audioCancelledRef.current) {
          setBufferLength(Sensorlib.getCurrentBufferLength());
        }
      }, 100);
      
      // Generate constant volume samples (440Hz tone at 0.3 volume)
      const sampleRate = 44100;
      const frequency = 440; // A4 note
      const volume = 0.3;
      const batchSize = 4096; // Samples per batch
      
      const generateBatch = (): Float32Array => {
        const samples = new Float32Array(batchSize);
        const phaseIncrement = (2 * Math.PI * frequency) / sampleRate;
        let phase = 0;
        
        for (let i = 0; i < batchSize; i++) {
          samples[i] = Math.sin(phase) * volume;
          phase += phaseIncrement;
          if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
        }
        
        return samples;
      };
      
      // Stream batches continuously
      const streamAudio = async () => {
        while (!audioCancelledRef.current) {
          const batch = generateBatch();
          Sensorlib.playSamplesBatch({ samples: Array.from(batch) });
          
          // Check buffer length and throttle if needed (keep buffer between 8192-16384 samples)
          const bufferLength = Sensorlib.getCurrentBufferLength();
          if (bufferLength > 16384) {
            // Buffer too full, wait a bit
            await new Promise(resolve => setTimeout(resolve, 10));
          } else if (bufferLength < 8192) {
            // Buffer getting low, send more immediately
            continue;
          } else {
            // Normal rate - small delay
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      };
      
      streamAudio().catch((error) => {
        console.error('Audio streaming error:', error);
        setIsAudioPlaying(false);
      });
    } catch (error) {
      console.error('Failed to start test audio:', error);
      setIsAudioPlaying(false);
    }
  };
  
  const stopTestAudio = () => {
    audioCancelledRef.current = true;
    setIsAudioPlaying(false);
    
    // Stop buffer length updates
    if (bufferUpdateIntervalRef.current) {
      clearInterval(bufferUpdateIntervalRef.current);
      bufferUpdateIntervalRef.current = null;
    }
    
    // Clear buffer but keep engine running for quick restart
    Sensorlib.stopAudio().catch((error: unknown) => {
      console.error('Failed to stop audio:', error);
    });
    setBufferLength(0);
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
      if (bufferUpdateIntervalRef.current) {
        clearInterval(bufferUpdateIntervalRef.current);
      }
      audioCancelledRef.current = true;
      Sensorlib.stopAudio().catch(() => {});
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
        <Button
          title={isAudioPlaying ? 'Stop Test Audio' : 'Play Test Audio'}
          color="#39ff14"
          onPress={handleTestAudioToggle}
        />
        {isAudioPlaying && (
          <Text style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
            Buffer: {bufferLength} samples
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}
