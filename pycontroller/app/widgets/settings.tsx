import React, { useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import RangedSlider from '../../components/ui/ranged-slider';

const screenHeight = Dimensions.get('window').height;

export default function Settings() {
  const [rMin, setRMin] = useState(0);
  const [rMax, setRMax] = useState(1);
  const [gMin, setGMin] = useState(0);
  const [gMax, setGMax] = useState(1);
  const [bMin, setBMin] = useState(0);
  const [bMax, setBMax] = useState(1);

  return (
    <View style={styles.container}>
      <View style={styles.sliderRow}>
        <View style={styles.sliderContainer}>
          <RangedSlider
            minValue={rMin}
            maxValue={rMax}
            onRangeChange={(min, max) => {
              setRMin(min);
              setRMax(max);
            }}
            trackColor="#ff0000"
            orientation="vertical"
          />
        </View>
        <View style={styles.sliderContainer}>
          <RangedSlider
            minValue={gMin}
            maxValue={gMax}
            onRangeChange={(min, max) => {
              setGMin(min);
              setGMax(max);
            }}
            trackColor="#00ff00"
            orientation="vertical"
          />
        </View>
        <View style={styles.sliderContainer}>
          <RangedSlider
            minValue={bMin}
            maxValue={bMax}
            onRangeChange={(min, max) => {
              setBMin(min);
              setBMax(max);
            }}
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
    justifyContent: 'center',
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
});
