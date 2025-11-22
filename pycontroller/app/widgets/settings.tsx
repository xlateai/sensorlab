import React from 'react';
import { View, StyleSheet, Dimensions, Text } from 'react-native';
import RangedSlider from '../../components/ui/ranged-slider';
import Slider from '../../components/ui/slider';
import { useRGBRange } from '../RGBRangeContext';
import { useBufferSize } from '../BufferSizeContext';

const screenHeight = Dimensions.get('window').height;

export default function Settings() {
  const { range, setRange } = useRGBRange();
  const { bufferSize, setBufferSize } = useBufferSize();
  
  // Convert buffer size (1-128) to slider value (0-1)
  const bufferSliderValue = (bufferSize - 1) / 127;
  
  const handleBufferSizeChange = (value: number) => {
    // Convert slider value (0-1) to buffer size (1-128)
    const newSize = Math.round(value * 127) + 1;
    setBufferSize(newSize);
  };

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
      <View style={styles.bufferSizeContainer}>
        <Text style={styles.label}>Buffer Size: {bufferSize}</Text>
        <Text style={styles.description}>This should change the speed/frequency of color deviations.</Text>
        <View style={styles.bufferSliderContainer}>
          <Slider
            value={bufferSliderValue}
            onValueChange={handleBufferSizeChange}
            trackColor="#888"
            orientation="horizontal"
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
  bufferSizeContainer: {
    marginTop: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  description: {
    color: '#888',
    fontSize: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  bufferSliderContainer: {
    width: '100%',
    maxWidth: 400,
    height: 32,
  },
});
