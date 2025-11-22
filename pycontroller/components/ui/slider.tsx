import React, { useState } from 'react';
import { View, PanResponder } from 'react-native';

export default function Slider({ 
  value, 
  onValueChange, 
  trackColor, 
  orientation = 'horizontal' 
}: { 
  value: number; 
  onValueChange: (v: number) => void; 
  trackColor: string;
  orientation?: 'horizontal' | 'vertical';
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  const isVertical = orientation === 'vertical';

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (isVertical) {
        if (containerHeight === 0) return;
        // For vertical, value increases from bottom to top (inverted)
        const percent = Math.max(0, Math.min(1, 1 - (evt.nativeEvent.locationY / containerHeight)));
        onValueChange(Number(percent.toFixed(2)));
      } else {
        if (containerWidth === 0) return;
        const percent = Math.max(0, Math.min(1, evt.nativeEvent.locationX / containerWidth));
        onValueChange(Number(percent.toFixed(2)));
      }
    },
    onPanResponderMove: (evt) => {
      if (isVertical) {
        if (containerHeight === 0) return;
        // For vertical, value increases from bottom to top (inverted)
        const percent = Math.max(0, Math.min(1, 1 - (evt.nativeEvent.locationY / containerHeight)));
        onValueChange(Number(percent.toFixed(2)));
      } else {
        if (containerWidth === 0) return;
        const percent = Math.max(0, Math.min(1, evt.nativeEvent.locationX / containerWidth));
        onValueChange(Number(percent.toFixed(2)));
      }
    },
  });

  return (
    <View
      onLayout={e => {
        setContainerWidth(e.nativeEvent.layout.width);
        setContainerHeight(e.nativeEvent.layout.height);
      }}
      {...panResponder.panHandlers}
      style={{
        width: isVertical ? 32 : '100%',
        height: isVertical ? '100%' : 32,
        backgroundColor: '#222',
        borderRadius: 16,
        marginVertical: isVertical ? 0 : 8,
        marginHorizontal: isVertical ? 8 : 0,
        justifyContent: 'center',
        position: 'relative',
      }}
    >
      <View
        pointerEvents="none"
        style={isVertical ? {
          position: 'absolute',
          left: 0,
          top: Math.max(0, Math.min((1 - value) * (containerHeight - 24), containerHeight - 24)),
          width: 32,
          height: 24,
          borderRadius: 12,
          backgroundColor: trackColor,
        } : {
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
