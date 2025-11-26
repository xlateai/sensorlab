import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TextInput, Keyboard, TouchableOpacity, Pressable, Modal, ScrollView } from 'react-native';
import ZoomSlider from './zoom-slider';

// Frequency range mapping
const MIN_FREQUENCY = 0;

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

// Convert frequency to slider value (0-1) - use absolute value for slider position
const frequencyToSliderValue = (freq: number, maxFreq: number): number => {
  const absFreq = Math.abs(freq);
  return (absFreq - MIN_FREQUENCY) / (maxFreq - MIN_FREQUENCY);
};

interface WaveformSliderGroupProps {
  baseFrequency: number;
  precisionOffset: number;
  frequencySign: boolean;
  frequencyInput: string;
  volume: number; // 0-100 percentage
  maxFrequency: number;
  maxFrequencyInput: string;
  precisionRange: number;
  waveformShape: 'sine' | 'sawtooth';
  onBaseFrequencyChange: (freq: number) => void;
  onPrecisionChange: (offset: number) => void;
  onFrequencySignChange: (sign: boolean) => void;
  onFrequencyInputChange: (text: string) => void;
  onFrequencyInputSubmit: () => void;
  onMaxFrequencyInputChange: (text: string) => void;
  onMaxFrequencyInputSubmit: () => void;
  onVolumeChange: (volume: number) => void;
  onWaveformShapeChange: (shape: 'sine' | 'sawtooth') => void;
}

export default function WaveformSliderGroup({
  baseFrequency,
  precisionOffset,
  frequencySign,
  frequencyInput,
  volume,
  maxFrequency,
  maxFrequencyInput,
  precisionRange,
  waveformShape,
  onBaseFrequencyChange,
  onPrecisionChange,
  onFrequencySignChange,
  onFrequencyInputChange,
  onFrequencyInputSubmit,
  onMaxFrequencyInputChange,
  onMaxFrequencyInputSubmit,
  onVolumeChange,
  onWaveformShapeChange,
}: WaveformSliderGroupProps) {
  const previousBaseFrequencyRef = useRef(baseFrequency);
  
  // Sync previous frequency ref when baseFrequency changes from outside (e.g., text input)
  useEffect(() => {
    previousBaseFrequencyRef.current = baseFrequency;
  }, [baseFrequency]);

  // Calculate absolute frequency (for display and slider)
  const absoluteFrequency = baseFrequency + precisionOffset;

  // Calculate precision slider knob color based on position
  // Precision slider value: 0 = max negative, 0.5 = center (0), 1 = max positive
  const precisionSliderValue = Math.max(0, Math.min(1, 0.5 + precisionOffset / (2 * precisionRange)));
  let precisionSliderKnobColor: string;
  if (precisionSliderValue < 0.5) {
    // Fade from red (at 0) to gray (at 0.5)
    const t = precisionSliderValue / 0.5;
    precisionSliderKnobColor = interpolateColor('#ff0000', '#888888', t);
  } else {
    // Fade from gray (at 0.5) to green (at 1)
    const t = (precisionSliderValue - 0.5) / 0.5;
    precisionSliderKnobColor = interpolateColor('#888888', '#39ff14', t);
  }

  // Calculate main slider knob color based on position and sign
  const mainSliderValue = Math.max(0, Math.min(1, (absoluteFrequency - MIN_FREQUENCY) / (maxFrequency - MIN_FREQUENCY)));
  // If frequency is negative, fade from gray to red; if positive, fade from gray to green
  const mainSliderKnobColor = frequencySign 
    ? interpolateColor('#888888', '#39ff14', mainSliderValue)
    : interpolateColor('#888888', '#ff0000', mainSliderValue);

  // Handle base frequency change from main slider
  const handleBaseFrequencyChange = (sliderValue: number) => {
    // Calculate frequency from slider value
    const rawFreq = MIN_FREQUENCY + sliderValue * (maxFrequency - MIN_FREQUENCY);
    // Round to nearest integer (1 Hz increment)
    const totalFreq = Math.round(rawFreq);
    
    const previousFreq = previousBaseFrequencyRef.current;
    
    // Only update if the frequency actually changed (avoid unnecessary updates)
    if (totalFreq === previousFreq) {
      return;
    }
    
    // Check if transitioning from >0 to exactly 0, then flip the sign
    let newSign = frequencySign;
    if (previousFreq > 0 && totalFreq === 0) {
      newSign = !frequencySign;
      onFrequencySignChange(newSign);
    }
    
    // Update previous value
    previousBaseFrequencyRef.current = totalFreq;
    
    // Call parent handler with the new frequency
    onBaseFrequencyChange(totalFreq);
  };

  // Handle precision offset change from precision slider
  const handlePrecisionChange = (sliderValue: number) => {
    // Map 0-1 to -precisionRange to +precisionRange
    // 0.5 (center) = 0 offset
    // Calculate raw offset
    const rawOffset = (sliderValue - 0.5) * 2 * precisionRange;
    // Round to nearest integer (1 Hz increment)
    const offset = Math.round(rawOffset);
    
    // Only update if the offset actually changed (avoid unnecessary updates)
    if (offset === precisionOffset) {
      return;
    }
    
    onPrecisionChange(offset);
  };

  // Handle volume change from volume slider
  const handleVolumeChange = (sliderValue: number) => {
    // Map 0-1 to 0-100 percentage, round to nearest integer
    const volumePercent = Math.round(sliderValue * 100);
    
    // Only update if the volume actually changed (avoid unnecessary updates)
    if (volumePercent === volume) {
      return;
    }
    
    onVolumeChange(volumePercent);
  };

  // Calculate volume slider knob color - fade from gray (0%) to green (100%)
  const volumeSliderValue = volume / 100;
  const volumeSliderKnobColor = interpolateColor('#888888', '#39ff14', volumeSliderValue);

  const [showShapePicker, setShowShapePicker] = useState(false);
  const waveformShapes: Array<'sine' | 'sawtooth'> = ['sine', 'sawtooth'];

  const handleShapeSelect = (shape: 'sine' | 'sawtooth') => {
    onWaveformShapeChange(shape);
    setShowShapePicker(false);
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <TouchableOpacity
          onPress={() => onFrequencySignChange(!frequencySign)}
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
          onChangeText={onFrequencyInputChange}
          onSubmitEditing={onFrequencyInputSubmit}
          onBlur={onFrequencyInputSubmit}
          keyboardType="numeric"
          returnKeyType="done"
          selectTextOnFocus
        />
        <Text style={{ color: '#fff', marginLeft: 8 }}>Hz</Text>
        <View style={{ flex: 1, marginLeft: 16, height: 32 }}>
          <ZoomSlider
            value={0.5 + precisionOffset / (2 * precisionRange)}
            onValueChange={handlePrecisionChange}
            trackColor={precisionSliderKnobColor}
            precision={5}
          />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <ZoomSlider
            value={frequencyToSliderValue(absoluteFrequency, maxFrequency)}
            onValueChange={handleBaseFrequencyChange}
            trackColor={mainSliderKnobColor}
            precision={5}
          />
        </View>
        <Text style={{ color: '#fff', marginRight: 8 }}>Max:</Text>
        <TextInput
          style={{
            color: '#fff',
            borderWidth: 1,
            borderColor: '#39ff14',
            borderRadius: 4,
            paddingHorizontal: 8,
            paddingVertical: 4,
            minWidth: 80,
            fontSize: 16,
          }}
          value={maxFrequencyInput}
          onChangeText={onMaxFrequencyInputChange}
          onSubmitEditing={onMaxFrequencyInputSubmit}
          onBlur={onMaxFrequencyInputSubmit}
          keyboardType="numeric"
          returnKeyType="done"
          selectTextOnFocus
        />
        <Text style={{ color: '#fff', marginLeft: 8 }}>Hz</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <ZoomSlider
            value={volumeSliderValue}
            onValueChange={handleVolumeChange}
            trackColor={volumeSliderKnobColor}
            precision={2}
          />
        </View>
        <Text style={{ color: '#fff', marginRight: 12 }}>{volume}% volume</Text>
        <Pressable
          onPress={() => setShowShapePicker(true)}
          style={{
            backgroundColor: '#39ff14',
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 8,
          }}
          android_ripple={null}
        >
          <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
            {waveformShape === 'sine' ? 'Sine' : 'Sawtooth'}
          </Text>
        </Pressable>
      </View>
      <Modal
        visible={showShapePicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowShapePicker(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setShowShapePicker(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 12,
              padding: 20,
              width: '80%',
              maxHeight: '60%',
              borderWidth: 1,
              borderColor: '#39ff14',
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>
              Select Waveform
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {waveformShapes.map((shape) => (
                <Pressable
                  key={shape}
                  onPress={() => handleShapeSelect(shape)}
                  style={{
                    backgroundColor: waveformShape === shape ? '#39ff14' : '#333',
                    paddingVertical: 16,
                    paddingHorizontal: 20,
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                  android_ripple={null}
                >
                  <Text
                    style={{
                      color: waveformShape === shape ? '#000' : '#fff',
                      textAlign: 'center',
                      fontWeight: '600',
                      fontSize: 16,
                      textTransform: 'capitalize',
                    }}
                  >
                    {shape}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setShowShapePicker(false)}
              style={{
                backgroundColor: '#333',
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: 8,
                marginTop: 16,
              }}
              android_ripple={null}
            >
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
