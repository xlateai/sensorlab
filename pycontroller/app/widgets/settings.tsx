import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Slider from '../../components/ui/slider';
import RangedSlider from '../../components/ui/ranged-slider';

const screenHeight = Dimensions.get('window').height;

export default function Settings() {
  const [r, setR] = useState(0.5);
  const [g, setG] = useState(0.5);
  const [b, setB] = useState(0.5);
  
  // Ranged slider states
  const [rangeMin, setRangeMin] = useState(0.2);
  const [rangeMax, setRangeMax] = useState(0.8);
  const [verticalRangeMin, setVerticalRangeMin] = useState(0.3);
  const [verticalRangeMax, setVerticalRangeMax] = useState(0.7);

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
        <View style={styles.sliderContainer}>
          <RangedSlider
            minValue={verticalRangeMin}
            maxValue={verticalRangeMax}
            onRangeChange={(min, max) => {
              setVerticalRangeMin(min);
              setVerticalRangeMax(max);
            }}
            trackColor="#ff00ff"
            orientation="vertical"
          />
        </View>
      </View>
      <View style={styles.horizontalRangeContainer}>
        <Text style={styles.label}>Range: {rangeMin.toFixed(2)} - {rangeMax.toFixed(2)}</Text>
        <RangedSlider
          minValue={rangeMin}
          maxValue={rangeMax}
          onRangeChange={(min, max) => {
            setRangeMin(min);
            setRangeMax(max);
          }}
          trackColor="#ffff00"
          orientation="horizontal"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
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
    maxWidth: 60,
    height: '100%',
    alignItems: 'center',
  },
  horizontalRangeContainer: {
    marginTop: 40,
    paddingHorizontal: 20,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
    textAlign: 'center',
  },
});
