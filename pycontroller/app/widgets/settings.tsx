import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import RangedSlider from '../../components/ui/ranged-slider';
import { useRGBRange } from '../RGBRangeContext';

const screenHeight = Dimensions.get('window').height;

export default function Settings() {
  const { range, setRange } = useRGBRange();

  return (
    <View style={styles.container}>
      <View style={styles.sliderRow}>
        <View style={styles.sliderContainer}>
          <RangedSlider
            minValue={range.rMin}
            maxValue={range.rMax}
            onRangeChange={(min, max) => {
              setRange({ ...range, rMin: min, rMax: max });
            }}
            trackColor="#ff0000"
            orientation="vertical"
          />
        </View>
        <View style={styles.sliderContainer}>
          <RangedSlider
            minValue={range.gMin}
            maxValue={range.gMax}
            onRangeChange={(min, max) => {
              setRange({ ...range, gMin: min, gMax: max });
            }}
            trackColor="#00ff00"
            orientation="vertical"
          />
        </View>
        <View style={styles.sliderContainer}>
          <RangedSlider
            minValue={range.bMin}
            maxValue={range.bMax}
            onRangeChange={(min, max) => {
              setRange({ ...range, bMin: min, bMax: max });
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
