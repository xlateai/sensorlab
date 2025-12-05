import React from 'react';
import { StyleSheet, View, Text, Dimensions } from 'react-native';
import Slider from '@/components/ui/slider';
import RangedSlider from '@/components/ui/ranged-slider';

const screenHeight = Dimensions.get('window').height;

const uiStyles = StyleSheet.create({
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

interface UIUXShowcaseProps {
  r: number;
  setR: (value: number) => void;
  g: number;
  setG: (value: number) => void;
  b: number;
  setB: (value: number) => void;
  rangeMin: number;
  setRangeMin: (value: number) => void;
  rangeMax: number;
  setRangeMax: (value: number) => void;
  verticalRangeMin: number;
  setVerticalRangeMin: (value: number) => void;
  verticalRangeMax: number;
  setVerticalRangeMax: (value: number) => void;
}

export default function UIUXShowcase({
  r,
  setR,
  g,
  setG,
  b,
  setB,
  rangeMin,
  setRangeMin,
  rangeMax,
  setRangeMax,
  verticalRangeMin,
  setVerticalRangeMin,
  verticalRangeMax,
  setVerticalRangeMax,
}: UIUXShowcaseProps) {
  return (
    <View style={uiStyles.container}>
      <View style={uiStyles.sliderRow}>
        <View style={uiStyles.sliderContainer}>
          <Slider
            value={r}
            onValueChange={setR}
            trackColor="#ff0000"
            orientation="vertical"
          />
        </View>
        <View style={uiStyles.sliderContainer}>
          <Slider
            value={g}
            onValueChange={setG}
            trackColor="#00ff00"
            orientation="vertical"
          />
        </View>
        <View style={uiStyles.sliderContainer}>
          <Slider
            value={b}
            onValueChange={setB}
            trackColor="#0000ff"
            orientation="vertical"
          />
        </View>
        <View style={uiStyles.sliderContainer}>
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
      <View style={uiStyles.horizontalRangeContainer}>
        <Text style={uiStyles.label}>Range: {rangeMin.toFixed(2)} - {rangeMax.toFixed(2)}</Text>
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

