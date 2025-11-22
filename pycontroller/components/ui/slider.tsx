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
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      if (isVertical) {
        if (containerHeight === 0) return;
        // For vertical, value increases from bottom to top (inverted)
        const y = evt.nativeEvent.locationY;
        const percent = Math.max(0, Math.min(1, 1 - (y / containerHeight)));
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
        const y = evt.nativeEvent.locationY;
        const percent = Math.max(0, Math.min(1, 1 - (y / containerHeight)));
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
        const { width, height } = e.nativeEvent.layout;
        if (width > 0) setContainerWidth(width);
        if (height > 0) setContainerHeight(height);
      }}
      {...panResponder.panHandlers}
      style={{
        width: isVertical ? 50 : '100%',
        height: isVertical ? '100%' : 32,
        backgroundColor: '#222',
        borderRadius: isVertical ? 25 : 16,
        marginVertical: isVertical ? 0 : 8,
        marginHorizontal: isVertical ? 8 : 0,
        justifyContent: 'center',
        position: 'relative',
        minHeight: isVertical ? 100 : 32,
        minWidth: isVertical ? 50 : undefined,
      }}
    >
      <View
        pointerEvents="none"
        style={isVertical ? {
          position: 'absolute',
          left: 0,
          top: containerHeight > 0 ? Math.max(0, Math.min((1 - value) * (containerHeight - 30), containerHeight - 30)) : 0,
          width: 50,
          height: 30,
          borderRadius: 15,
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
