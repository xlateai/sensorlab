import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Slider from '../../../components/ui/slider';

export default function Settings() {
  const [r, setR] = useState(0.5);
  const [g, setG] = useState(0.5);
  const [b, setB] = useState(0.5);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <View style={styles.sliderContainer}>
        <Text style={styles.label}>R</Text>
        <Slider
          value={r}
          onValueChange={setR}
          trackColor="#ff0000"
        />
      </View>
      <View style={styles.sliderContainer}>
        <Text style={styles.label}>G</Text>
        <Slider
          value={g}
          onValueChange={setG}
          trackColor="#00ff00"
        />
      </View>
      <View style={styles.sliderContainer}>
        <Text style={styles.label}>B</Text>
        <Slider
          value={b}
          onValueChange={setB}
          trackColor="#0000ff"
        />
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 24,
  },
  sliderContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 8,
  },
});
