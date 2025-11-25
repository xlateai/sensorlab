import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button, Keyboard, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playContinuousHaptic } from '../utils/haptics';
import { playPureSine, stopAudio, AudioController } from '../utils/audio-utils';
import Slider from '../../components/ui/slider';
import WaveformSliderGroup from '../../components/ui/waveform-slider-group';

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
  const [baseFrequency, setBaseFrequency] = useState(440); // Base frequency from main slider
  const [precisionOffset, setPrecisionOffset] = useState(0); // Precision offset in Hz (-1000 to +1000)
  const [frequencyInput, setFrequencyInput] = useState('440'); // For text input
  const [frequencySign, setFrequencySign] = useState(true); // true for positive, false for negative
  const [volume, setVolume] = useState(50); // Volume percentage (0-100), default 50%
  const audioControllerRef = useRef<AudioController | null>(null);
  const audioParamsRef = useRef({ frequency: 440, volume: 0.5 }); // 0.5 = 50%
  
  // Use refs to ensure we always have latest values in handlers
  const baseFrequencyRef = useRef(440);
  const precisionOffsetRef = useRef(0);
  const previousBaseFrequencyRef = useRef(440); // Track previous value to detect 0 transition
  
  // Frequency range mapping
  const MIN_FREQUENCY = 0;
  const [maxFrequency, setMaxFrequency] = useState(20000);
  const [maxFrequencyInput, setMaxFrequencyInput] = useState('20000');
  // Precision range is 10% of max frequency
  const PRECISION_RANGE = maxFrequency * 0.1;
  
  // Calculate absolute frequency (for display and slider)
  const absoluteFrequency = baseFrequency + precisionOffset;
  // Calculate actual frequency with sign (for audio)
  const frequency = absoluteFrequency * (frequencySign ? 1 : -1);

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
      
      // Update ref with current values (apply sign)
      const absFreq = baseFrequencyRef.current + precisionOffsetRef.current;
      audioParamsRef.current = { frequency: absFreq * (frequencySign ? 1 : -1), volume: volume / 100 };
      
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
  
  // Handle base frequency change from main slider - update ref so it affects playback in real-time
  // When main slider moves, set base frequency to the new total and reset precision offset
  const handleBaseFrequencyChange = (totalFreq: number) => {
    setBaseFrequency(totalFreq);
    setPrecisionOffset(0);
    baseFrequencyRef.current = totalFreq;
    precisionOffsetRef.current = 0;
    setFrequencyInput(totalFreq.toFixed(1));
    audioParamsRef.current.frequency = totalFreq * (frequencySign ? 1 : -1);
  };
  
  // Handle precision offset change from precision slider
  const handlePrecisionChange = (offset: number) => {
    setPrecisionOffset(offset);
    precisionOffsetRef.current = offset;
    const actualFreq = baseFrequencyRef.current + offset;
    setFrequencyInput(actualFreq.toFixed(1));
    audioParamsRef.current.frequency = actualFreq * (frequencySign ? 1 : -1);
  };
  
  // Handle frequency input from text field
  const handleFrequencyInputChange = (text: string) => {
    setFrequencyInput(text);
  };
  
  // Validate and apply frequency from text input
  const handleFrequencyInputSubmit = () => {
    Keyboard.dismiss();
    const numValue = parseFloat(frequencyInput);
    if (!isNaN(numValue) && numValue >= MIN_FREQUENCY && numValue <= maxFrequency) {
      // Update base frequency and reset precision offset
      previousBaseFrequencyRef.current = baseFrequencyRef.current; // Update previous before changing
      setBaseFrequency(numValue);
      setPrecisionOffset(0);
      baseFrequencyRef.current = numValue;
      precisionOffsetRef.current = 0;
      audioParamsRef.current.frequency = numValue * (frequencySign ? 1 : -1);
    } else {
      // Invalid input, reset to current absolute frequency
      setFrequencyInput(absoluteFrequency.toFixed(1));
    }
  };

  // Handle max frequency input change
  const handleMaxFrequencyInputChange = (text: string) => {
    setMaxFrequencyInput(text);
  };

  // Validate and apply max frequency from text input
  const handleMaxFrequencyInputSubmit = () => {
    Keyboard.dismiss();
    const numValue = parseFloat(maxFrequencyInput);
    if (!isNaN(numValue) && numValue > 0) {
      setMaxFrequency(numValue);
      // If current frequency exceeds new max, clamp it
      if (baseFrequency > numValue) {
        setBaseFrequency(numValue);
        baseFrequencyRef.current = numValue;
        setFrequencyInput(numValue.toFixed(1));
        audioParamsRef.current.frequency = numValue * (frequencySign ? 1 : -1);
      }
      // If precision offset exceeds new range, clamp it
      const newPrecisionRange = numValue * 0.1;
      if (Math.abs(precisionOffset) > newPrecisionRange) {
        const clampedOffset = Math.sign(precisionOffset) * newPrecisionRange;
        setPrecisionOffset(clampedOffset);
        precisionOffsetRef.current = clampedOffset;
      }
    } else {
      // Invalid input, reset to current max frequency
      setMaxFrequencyInput(maxFrequency.toString());
    }
  };
  
  // Handle frequency sign change
  const handleFrequencySignChange = (sign: boolean) => {
    setFrequencySign(sign);
  };

  // Handle volume change
  const handleVolumeChange = (volumePercent: number) => {
    setVolume(volumePercent);
    // Update audio volume in real-time (0-100% maps to 0.0-1.0)
    audioParamsRef.current.volume = volumePercent / 100;
  };
  
  // Update input text when absolute frequency changes from slider
  useEffect(() => {
    setFrequencyInput(absoluteFrequency.toFixed(1));
    audioParamsRef.current.frequency = frequency;
  }, [absoluteFrequency, frequency]);
  
  // Update audio frequency when sign changes
  useEffect(() => {
    audioParamsRef.current.frequency = frequency;
  }, [frequencySign, frequency]);

  // Update audio volume when volume changes
  useEffect(() => {
    audioParamsRef.current.volume = volume / 100;
  }, [volume]);
  
  // Keep refs in sync with state
  useEffect(() => {
    baseFrequencyRef.current = baseFrequency;
  }, [baseFrequency]);
  
  useEffect(() => {
    precisionOffsetRef.current = precisionOffset;
  }, [precisionOffset]);
  
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
        <WaveformSliderGroup
          baseFrequency={baseFrequency}
          precisionOffset={precisionOffset}
          frequencySign={frequencySign}
          frequencyInput={frequencyInput}
          volume={volume}
          maxFrequency={maxFrequency}
          maxFrequencyInput={maxFrequencyInput}
          precisionRange={PRECISION_RANGE}
          onBaseFrequencyChange={handleBaseFrequencyChange}
          onPrecisionChange={handlePrecisionChange}
          onFrequencySignChange={handleFrequencySignChange}
          onFrequencyInputChange={handleFrequencyInputChange}
          onFrequencyInputSubmit={handleFrequencyInputSubmit}
          onMaxFrequencyInputChange={handleMaxFrequencyInputChange}
          onMaxFrequencyInputSubmit={handleMaxFrequencyInputSubmit}
          onVolumeChange={handleVolumeChange}
        />
        <Pressable
          onPress={handleTestAudioToggle}
          style={{
            backgroundColor: '#39ff14',
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 8,
            marginTop: 16,
          }}
          android_ripple={null}
        >
          <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600' }}>
            {isAudioPlaying ? 'Stop' : 'Start Test Audio'}
          </Text>
        </Pressable>
        <Text style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
          Buffer: {bufferLength} samples
        </Text>
      </View>
    </SafeAreaView>
  );
}
