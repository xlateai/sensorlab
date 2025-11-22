import React, { useState, useRef } from 'react';
import { View } from 'react-native';

type DragMode = 'min' | 'max' | 'range' | null;

export default function RangedSlider({ 
  minValue, 
  maxValue, 
  onRangeChange, 
  trackColor, 
  orientation = 'horizontal' 
}: { 
  minValue: number; 
  maxValue: number; 
  onRangeChange: (min: number, max: number) => void; 
  trackColor: string;
  orientation?: 'horizontal' | 'vertical';
}) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  // Track which touch IDs are active and what they're dragging
  const activeTouchesRef = useRef<Map<number, DragMode>>(new Map());
  const containerRef = useRef<View>(null);
  const dragStartRef = useRef<{ min: number; max: number; touchX: number; touchY: number } | null>(null);

  const isVertical = orientation === 'vertical';
  const thumbSize = isVertical ? 30 : 24;
  const trackThickness = isVertical ? 50 : 32;

  const valueToPosition = (value: number) => {
    if (isVertical) {
      return (1 - value) * (containerHeight - thumbSize);
    } else {
      return value * (containerWidth - thumbSize);
    }
  };

  const positionToValue = (position: number) => {
    if (isVertical) {
      if (containerHeight === 0) return 0;
      return Math.max(0, Math.min(1, 1 - (position / (containerHeight - thumbSize))));
    } else {
      if (containerWidth === 0) return 0;
      return Math.max(0, Math.min(1, position / (containerWidth - thumbSize)));
    }
  };

  const getDragMode = (touchX: number, touchY: number): DragMode => {
    const minPos = valueToPosition(minValue);
    const maxPos = valueToPosition(maxValue);
    
    if (isVertical) {
      const touchPos = touchY;
      const minThumbCenter = minPos + thumbSize / 2;
      const maxThumbCenter = maxPos + thumbSize / 2;
      const thumbHitRadius = thumbSize / 2 + 10; // Add some hit area
      
      // Check if touching min thumb
      if (Math.abs(touchPos - minThumbCenter) < thumbHitRadius) {
        return 'min';
      }
      // Check if touching max thumb
      if (Math.abs(touchPos - maxThumbCenter) < thumbHitRadius) {
        return 'max';
      }
      // Check if touching the range between them
      if (touchPos > minThumbCenter && touchPos < maxThumbCenter) {
        return 'range';
      }
    } else {
      const touchPos = touchX;
      const minThumbCenter = minPos + thumbSize / 2;
      const maxThumbCenter = maxPos + thumbSize / 2;
      const thumbHitRadius = thumbSize / 2 + 10; // Add some hit area
      
      // Check if touching min thumb
      if (Math.abs(touchPos - minThumbCenter) < thumbHitRadius) {
        return 'min';
      }
      // Check if touching max thumb
      if (Math.abs(touchPos - maxThumbCenter) < thumbHitRadius) {
        return 'max';
      }
      // Check if touching the range between them
      if (touchPos > minThumbCenter && touchPos < maxThumbCenter) {
        return 'range';
      }
    }
    
    return null;
  };

  const handleTouchStart = (evt: any) => {
    const { locationX, locationY, identifier } = evt.nativeEvent;
    
    // Check if touch is within slider bounds
    const isWithinBounds = isVertical
      ? containerHeight > 0 && locationY >= 0 && locationY <= containerHeight
      : containerWidth > 0 && locationX >= 0 && locationX <= containerWidth;
    
    if (!isWithinBounds) return;
    
    const dragMode = getDragMode(locationX, locationY);
    if (dragMode) {
      activeTouchesRef.current.set(identifier, dragMode);
      dragStartRef.current = {
        min: minValue,
        max: maxValue,
        touchX: locationX,
        touchY: locationY,
      };
    }
  };

  const handleTouchMove = (evt: any) => {
    const { locationX, locationY, identifier } = evt.nativeEvent;
    const dragMode = activeTouchesRef.current.get(identifier);
    
    if (!dragMode || !dragStartRef.current) return;
    
    if (dragMode === 'min') {
      const newValue = positionToValue(isVertical ? locationY : locationX);
      const clampedValue = Math.max(0, Math.min(newValue, maxValue - 0.01)); // Prevent overlap
      onRangeChange(Number(clampedValue.toFixed(2)), maxValue);
    } else if (dragMode === 'max') {
      const newValue = positionToValue(isVertical ? locationY : locationX);
      const clampedValue = Math.max(minValue + 0.01, Math.min(newValue, 1)); // Prevent overlap
      onRangeChange(minValue, Number(clampedValue.toFixed(2)));
    } else if (dragMode === 'range') {
      // Move both thumbs by the same delta from the original start position
      const currentPos = isVertical ? locationY : locationX;
      const startPos = isVertical ? dragStartRef.current.touchY : dragStartRef.current.touchX;
      const containerSize = isVertical ? (containerHeight - thumbSize) : (containerWidth - thumbSize);
      
      const delta = isVertical
        ? (startPos - currentPos) / containerSize
        : (currentPos - startPos) / containerSize;
      
      const rangeSize = dragStartRef.current.max - dragStartRef.current.min;
      let newMin = dragStartRef.current.min + delta;
      let newMax = dragStartRef.current.max + delta;
      
      // Clamp to bounds
      if (newMin < 0) {
        newMin = 0;
        newMax = rangeSize;
      } else if (newMax > 1) {
        newMax = 1;
        newMin = 1 - rangeSize;
      }
      
      onRangeChange(Number(newMin.toFixed(2)), Number(newMax.toFixed(2)));
    }
  };

  const handleTouchEnd = (evt: any) => {
    const touches = evt.nativeEvent.changedTouches || [];
    for (const touch of touches) {
      activeTouchesRef.current.delete(touch.identifier);
    }
    if (activeTouchesRef.current.size === 0) {
      dragStartRef.current = null;
    }
  };

  const minPos = valueToPosition(minValue);
  const maxPos = valueToPosition(maxValue);

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
        width: isVertical ? trackThickness : '100%',
        height: isVertical ? '100%' : trackThickness,
        backgroundColor: '#222',
        borderRadius: isVertical ? 25 : 16,
        marginVertical: isVertical ? 0 : 8,
        marginHorizontal: isVertical ? 8 : 0,
        justifyContent: 'center',
        position: 'relative',
        minHeight: isVertical ? 100 : trackThickness,
        minWidth: isVertical ? trackThickness : undefined,
      }}
    >
      {/* Active range track between the two thumbs */}
      <View
        pointerEvents="none"
        style={isVertical ? {
          position: 'absolute',
          left: 0,
          top: Math.max(0, Math.min(maxPos, containerHeight - thumbSize)),
          width: trackThickness,
          height: Math.max(thumbSize, Math.abs(minPos - maxPos) + thumbSize),
          borderRadius: 15,
          backgroundColor: trackColor,
        } : {
          position: 'absolute',
          left: Math.max(0, Math.min(minPos, containerWidth - thumbSize)),
          top: 0,
          width: Math.max(thumbSize, maxPos - minPos + thumbSize),
          height: trackThickness,
          borderRadius: 16,
          backgroundColor: trackColor,
        }}
      />
      {/* Min thumb */}
      <View
        pointerEvents="none"
        style={isVertical ? {
          position: 'absolute',
          left: (trackThickness - thumbSize) / 2,
          top: Math.max(0, Math.min(minPos, containerHeight - thumbSize)),
          width: thumbSize,
          height: thumbSize,
          borderRadius: thumbSize / 2,
          backgroundColor: '#fff',
          borderWidth: 2,
          borderColor: trackColor,
        } : {
          position: 'absolute',
          left: Math.max(0, Math.min(minPos, containerWidth - thumbSize)),
          top: (trackThickness - thumbSize) / 2,
          width: thumbSize,
          height: thumbSize,
          borderRadius: thumbSize / 2,
          backgroundColor: '#fff',
          borderWidth: 2,
          borderColor: trackColor,
        }}
      />
      {/* Max thumb */}
      <View
        pointerEvents="none"
        style={isVertical ? {
          position: 'absolute',
          left: (trackThickness - thumbSize) / 2,
          top: Math.max(0, Math.min(maxPos, containerHeight - thumbSize)),
          width: thumbSize,
          height: thumbSize,
          borderRadius: thumbSize / 2,
          backgroundColor: '#fff',
          borderWidth: 2,
          borderColor: trackColor,
        } : {
          position: 'absolute',
          left: Math.max(0, Math.min(maxPos, containerWidth - thumbSize)),
          top: (trackThickness - thumbSize) / 2,
          width: thumbSize,
          height: thumbSize,
          borderRadius: thumbSize / 2,
          backgroundColor: '#fff',
          borderWidth: 2,
          borderColor: trackColor,
        }}
      />
    </View>
  );
}
