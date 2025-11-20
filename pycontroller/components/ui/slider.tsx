import React, { useState } from 'react';
import { View, PanResponder } from 'react-native';

export default function Slider({ value, onValueChange, trackColor }: { value: number; onValueChange: (v: number) => void; trackColor: string }) {
  const [containerWidth, setContainerWidth] = useState(0);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (containerWidth === 0) return;
      const percent = Math.max(0, Math.min(1, evt.nativeEvent.locationX / containerWidth));
      onValueChange(Number(percent.toFixed(2)));
    },
    onPanResponderMove: (evt) => {
      if (containerWidth === 0) return;
      const percent = Math.max(0, Math.min(1, evt.nativeEvent.locationX / containerWidth));
      onValueChange(Number(percent.toFixed(2)));
    },
  });

  return (
    <View
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
      {...panResponder.panHandlers}
      style={{
        width: '100%',
        height: 32,
        backgroundColor: '#222',
        borderRadius: 16,
        marginVertical: 8,
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: Math.max(0, Math.min(value * (containerWidth - 24), containerWidth - 24)),
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
