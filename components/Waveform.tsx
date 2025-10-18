import React from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

interface WaveformProps {
  width?: number;
  height?: number;
}

export default function Waveform({ 
  width = screenWidth * 0.8, 
  height = screenHeight * 0.8 
}: WaveformProps) {
  return (
    <View style={[styles.container, { width, height }]} />
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
});