import React, { useState, useRef } from 'react';
import { View } from 'react-native';

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
  // Track which touch IDs are active on this slider (supports multiple touches)
  const activeTouchesRef = useRef<Set<number>>(new Set());
  const containerRef = useRef<View>(null);

  const isVertical = orientation === 'vertical';

  const updateValue = (locationX: number, locationY: number) => {
    if (isVertical) {
      if (containerHeight === 0) return;
      // For vertical, value increases from bottom to top (inverted)
      const percent = Math.max(0, Math.min(1, 1 - (locationY / containerHeight)));
      onValueChange(Number(percent.toFixed(2)));
    } else {
      if (containerWidth === 0) return;
      const percent = Math.max(0, Math.min(1, locationX / containerWidth));
      onValueChange(Number(percent.toFixed(2)));
    }
  };

  const handleTouchStart = (evt: any) => {
    const touches = evt.nativeEvent.touches || [];
    for (const touch of touches) {
      if (containerRef.current) {
        containerRef.current.measure((x, y, width, height, pageX, pageY) => {
          const touchX = touch.pageX - pageX;
          const touchY = touch.pageY - pageY;
          
          // Check if touch is within slider bounds
          const isWithinBounds = isVertical
            ? touchY >= 0 && touchY <= height
            : touchX >= 0 && touchX <= width;
          
          if (isWithinBounds) {
            activeTouchesRef.current.add(touch.identifier);
            updateValue(touchX, touchY);
          }
        });
      }
    }
  };

  const handleTouchMove = (evt: any) => {
    const touches = evt.nativeEvent.touches || [];
    for (const touch of touches) {
      // Only process touches that started on this slider
      if (!activeTouchesRef.current.has(touch.identifier)) continue;
      
      if (containerRef.current) {
        containerRef.current.measure((x, y, width, height, pageX, pageY) => {
          const touchX = touch.pageX - pageX;
          const touchY = touch.pageY - pageY;
          updateValue(touchX, touchY);
        });
      }
    }
  };

  const handleTouchEnd = (evt: any) => {
    const touches = evt.nativeEvent.changedTouches || [];
    for (const touch of touches) {
      activeTouchesRef.current.delete(touch.identifier);
    }
  };

  return (
    <View
      ref={containerRef}
      onLayout={e => {
        const { width, height } = e.nativeEvent.layout;
        if (width > 0) setContainerWidth(width);
        if (height > 0) setContainerHeight(height);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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
