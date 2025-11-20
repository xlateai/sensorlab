import React, { useState, useRef } from 'react';
import { View, Text, Button, PanResponder } from 'react-native';
import { playContinuousHaptic } from '../haptics';

// CustomSlider: a simple horizontal slider using PanResponder
function CustomSlider({ value, onValueChange, trackColor }) {
  const sliderWidth = 240;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => {
        const percent = Math.max(0, Math.min(1, evt.nativeEvent.locationX / sliderWidth));
        onValueChange(Number(percent.toFixed(2)));
      },
      onPanResponderMove: (evt) => {
        const percent = Math.max(0, Math.min(1, evt.nativeEvent.locationX / sliderWidth));
        onValueChange(Number(percent.toFixed(2)));
      },
    })
  ).current;
  return (
    <View
      {...panResponder.panHandlers}
      style={{
        width: sliderWidth,
        height: 32,
        backgroundColor: '#222',
        borderRadius: 16,
        marginVertical: 8,
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: value * (sliderWidth - 24),
          top: 0,
          width: 24,
          height: 32,
          borderRadius: 16,
          backgroundColor: trackColor,
        }}
      />
    </View>
  );
}

export default function AudioTab() {
  const [intensity, setIntensity] = useState(1.0);
  const [sharpness, setSharpness] = useState(0.5);
  const duration = 1.0;
  const handlePlay = async () => {
    await playContinuousHaptic(intensity, sharpness, duration);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000', padding: 24 }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Haptic Player</Text>
      <View style={{ marginBottom: 32 }}>
        <Text style={{ color: '#fff', marginBottom: 8 }}>Intensity: {intensity.toFixed(2)}</Text>
        <CustomSlider
          value={intensity}
          onValueChange={setIntensity}
          trackColor="#39ff14"
        />
        <Text style={{ color: '#fff', marginTop: 16, marginBottom: 8 }}>Sharpness: {sharpness.toFixed(2)}</Text>
        <CustomSlider
          value={sharpness}
          onValueChange={setSharpness}
          trackColor="#39ff14"
        />
        <View style={{ marginTop: 24 }}>
          <Button title="Play Haptic" color="#39ff14" onPress={handlePlay} />
        </View>
      </View>
      {/* Leave room for future audio features below */}
      <Text style={{ fontSize: 18, color: '#39ff14' }}>More audio features coming soon...</Text>
    </View>
  );
}
