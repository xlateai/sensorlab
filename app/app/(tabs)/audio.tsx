import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button, TextInput, Keyboard, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { playContinuousHaptic } from '../utils/haptics';
import { playPureSine, stopAudio, AudioController } from '../utils/audio-utils';
import Slider from '../../components/ui/slider';
import ZoomSlider from '../../components/ui/zoom-slider';

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
  const audioControllerRef = useRef<AudioController | null>(null);
  const audioParamsRef = useRef({ frequency: 440, volume: 0.3 });
  
  // Use refs to ensure we always have latest values in handlers
  const baseFrequencyRef = useRef(440);
  const precisionOffsetRef = useRef(0);
  const previousBaseFrequencyRef = useRef(440); // Track previous value to detect 0 transition
  
  // Frequency range mapping (20-2000 Hz)
  const MIN_FREQUENCY = 0;
  const MAX_FREQUENCY = 20000;
  const PRECISION_RANGE = 1000; // ±1000 Hz
  
  // Helper function to interpolate between two colors
  const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
  
  // Helper function to interpolate between two hex colors
  const interpolateColor = (color1: string, color2: string, t: number): string => {
    // Parse hex colors to RGB
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    const r1 = parseInt(hex1.substring(0, 2), 16);
    const g1 = parseInt(hex1.substring(2, 4), 16);
    const b1 = parseInt(hex1.substring(4, 6), 16);
    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);
    
    const r = lerp(r1, r2, t);
    const g = lerp(g1, g2, t);
    const b = lerp(b1, b2, t);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  };
  
  // Calculate absolute frequency (for display and slider)
  const absoluteFrequency = baseFrequency + precisionOffset;
  // Calculate actual frequency with sign (for audio)
  const frequency = absoluteFrequency * (frequencySign ? 1 : -1);
  
  // Calculate precision slider knob color based on position
  // Precision slider value: 0 = max negative, 0.5 = center (0), 1 = max positive
  const precisionSliderValue = Math.max(0, Math.min(1, 0.5 + precisionOffset / (2 * PRECISION_RANGE))); // Map -1000 to +1000 to 0 to 1, centered at 0.5
  let precisionSliderKnobColor: string;
  if (precisionSliderValue < 0.5) {
    // Fade from red (at 0) to gray (at 0.5)
    const t = precisionSliderValue / 0.5; // 0 to 1 as we go from 0 to 0.5
    precisionSliderKnobColor = interpolateColor('#ff0000', '#888888', t);
  } else {
    // Fade from gray (at 0.5) to green (at 1)
    const t = (precisionSliderValue - 0.5) / 0.5; // 0 to 1 as we go from 0.5 to 1
    precisionSliderKnobColor = interpolateColor('#888888', '#39ff14', t);
  }
  
  // Calculate main slider knob color based on position and sign
  // Main slider value: 0 = min (0 Hz), 1 = max (20000 Hz)
  const mainSliderValue = Math.max(0, Math.min(1, (absoluteFrequency - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY)));
  // If frequency is negative, fade from gray to red; if positive, fade from gray to green
  const mainSliderKnobColor = frequencySign 
    ? interpolateColor('#888888', '#39ff14', mainSliderValue)
    : interpolateColor('#888888', '#ff0000', mainSliderValue);

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
      audioParamsRef.current = { frequency: absFreq * (frequencySign ? 1 : -1), volume: 0.3 };
      
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
  // Slider value is 0-1, map it to frequency range
  // When main slider moves, set base frequency to the new total and reset precision offset
  const handleBaseFrequencyChange = (sliderValue: number) => {
    const totalFreq = MIN_FREQUENCY + sliderValue * (MAX_FREQUENCY - MIN_FREQUENCY);
    const previousFreq = previousBaseFrequencyRef.current;
    
    // Check if transitioning from >0 to exactly 0, then flip the sign
    let newSign = frequencySign;
    if (previousFreq > 0 && totalFreq === 0) {
      newSign = !frequencySign;
      setFrequencySign(newSign);
    }
    
    // Update previous value before setting new value
    previousBaseFrequencyRef.current = totalFreq;
    
    setBaseFrequency(totalFreq);
    setPrecisionOffset(0);
    baseFrequencyRef.current = totalFreq;
    precisionOffsetRef.current = 0;
    setFrequencyInput(totalFreq.toFixed(1));
    audioParamsRef.current.frequency = totalFreq * (newSign ? 1 : -1);
  };
  
  // Handle precision offset change from precision slider
  // Slider value is 0-1, map it to -PRECISION_RANGE to +PRECISION_RANGE
  const handlePrecisionChange = (sliderValue: number) => {
    // Map 0-1 to -PRECISION_RANGE to +PRECISION_RANGE
    // 0.5 (center) = 0 offset
    const offset = (sliderValue - 0.5) * 2 * PRECISION_RANGE;
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
    if (!isNaN(numValue) && numValue >= MIN_FREQUENCY && numValue <= MAX_FREQUENCY) {
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
  
  // Convert frequency to slider value (0-1) - use absolute value for slider position
  const frequencyToSliderValue = (freq: number): number => {
    const absFreq = Math.abs(freq);
    return (absFreq - MIN_FREQUENCY) / (MAX_FREQUENCY - MIN_FREQUENCY);
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
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <TouchableOpacity
            onPress={() => setFrequencySign(!frequencySign)}
            style={{
              width: 32,
              height: 32,
              backgroundColor: frequencySign ? '#39ff14' : '#ff0000',
              borderRadius: 4,
              justifyContent: 'center',
              alignItems: 'center',
              marginRight: 8,
            }}
          >
            <Text style={{ color: '#000', fontSize: 18, fontWeight: 'bold' }}>
              {frequencySign ? '+' : '-'}
            </Text>
          </TouchableOpacity>
          <TextInput
            style={{
              color: '#fff',
              borderWidth: 1,
              borderColor: frequencySign ? '#39ff14' : '#ff0000',
              borderRadius: 4,
              paddingHorizontal: 8,
              paddingVertical: 4,
              minWidth: 80,
              fontSize: 16,
            }}
            value={frequencyInput}
            onChangeText={handleFrequencyInputChange}
            onSubmitEditing={handleFrequencyInputSubmit}
            onBlur={handleFrequencyInputSubmit}
            keyboardType="numeric"
            returnKeyType="done"
            selectTextOnFocus
          />
          <Text style={{ color: '#fff', marginLeft: 8 }}>Hz</Text>
          <View style={{ flex: 1, marginLeft: 16, height: 32 }}>
            <ZoomSlider
              value={0.5 + precisionOffset / (2 * PRECISION_RANGE)} // Map -1000 to +1000 to 0 to 1, centered at 0.5
              onValueChange={handlePrecisionChange}
              trackColor={precisionSliderKnobColor}
            />
          </View>
        </View>
        <ZoomSlider
          value={frequencyToSliderValue(absoluteFrequency)}
          onValueChange={handleBaseFrequencyChange}
          trackColor={mainSliderKnobColor}
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
