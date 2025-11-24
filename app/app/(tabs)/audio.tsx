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
  const audioStreamingPromiseRef = useRef<Promise<void> | null>(null);
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
    if (isAudioPlaying || audioStreamingPromiseRef.current) {
      return;
    }
    
    try {
      // Always create a new audio object on every play
      await Sensorlib.initializeAudio({ sampleRate: 44100, channelCount: 1 });
      
      audioCancelledRef.current = false;
      setIsAudioPlaying(true);
      
      // Start updating buffer length display
      if (bufferUpdateIntervalRef.current) {
        clearInterval(bufferUpdateIntervalRef.current);
      }
      bufferUpdateIntervalRef.current = setInterval(() => {
        setBufferLength(Sensorlib.getCurrentBufferLength());
      }, 100);
      
      // Generate constant volume samples (440Hz tone at 0.3 volume)
      const sampleRate = 44100;
      const frequency = 440; // A4 note
      const volume = 0.3;
      const phaseIncrement = (2 * Math.PI * frequency) / sampleRate;
      let phase = 0;
      const AUDIO_SAMPLE_BATCH_SIZE = 2048;
      
      // Stream single samples continuously, batching them
      const streamAudio = async () => {
        const sampleBuffer: number[] = [];
        
        while (true) {
          // Check cancellation and break if stopped
          if (audioCancelledRef.current) {
            break;
          }
          
          // Generate single sample
          const sample = Math.sin(phase) * volume;
          phase += phaseIncrement;
          if (phase > 2 * Math.PI) phase -= 2 * Math.PI;
          
          // Add to buffer
          sampleBuffer.push(sample);
          
          // When buffer reaches batch size, send it
          if (sampleBuffer.length >= AUDIO_SAMPLE_BATCH_SIZE) {
            Sensorlib.playSamplesBatch({ samples: sampleBuffer });
            sampleBuffer.length = 0; // Clear the buffer
          }
        }
        setIsAudioPlaying(false);
      };
      
      audioStreamingPromiseRef.current = streamAudio().catch((error) => {
        console.error('Audio streaming error:', error);
        setIsAudioPlaying(false);
      });
    } catch (error) {
      console.error('Failed to start test audio:', error);
      setIsAudioPlaying(false);
    }
  };
  
  const stopTestAudio = async () => {
    audioCancelledRef.current = true;
    setIsAudioPlaying(false);
    
    // Stop updating buffer length
    if (bufferUpdateIntervalRef.current) {
      clearInterval(bufferUpdateIntervalRef.current);
      bufferUpdateIntervalRef.current = null;
    }
    
    // Wait for streaming to stop
    if (audioStreamingPromiseRef.current) {
      try {
        await audioStreamingPromiseRef.current;
      } catch (error) {
        // Ignore errors from cancellation
      }
      audioStreamingPromiseRef.current = null;
    }
    
    // Stop audio engine
    try {
      await Sensorlib.stopAudio();
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
