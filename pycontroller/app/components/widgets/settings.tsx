import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Slider from '../../../components/ui/slider';

const screenHeight = Dimensions.get('window').height;

export default function Settings() {
  const [r, setR] = useState(0.5);
  const [g, setG] = useState(0.5);
  const [b, setB] = useState(0.5);

  return (
    <View style={styles.container}>
      <View style={styles.sliderRow}>
        <View style={styles.sliderContainer}>
          <Slider
            value={r}
            onValueChange={setR}
            trackColor="#ff0000"
            orientation="vertical"
          />
        </View>
        <View style={styles.sliderContainer}>
          <Slider
            value={g}
            onValueChange={setG}
            trackColor="#00ff00"
            orientation="vertical"
          />
        </View>
        <View style={styles.sliderContainer}>
          <Slider
            value={b}
            onValueChange={setB}
            trackColor="#0000ff"
            orientation="vertical"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: '300',
    fontFamily: 'System',
    color: '#fff',
    marginBottom: 32,
    letterSpacing: 0.5,
  },
  sliderRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
    height: screenHeight * 0.3,
  },
  sliderContainer: {
    flex: 1,
    maxWidth: 50,
    height: '100%',
  },
});
