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
  // Match single slider dimensions
  const thumbWidth = isVertical ? 50 : 24;
  const thumbHeight = isVertical ? 30 : 32;
  const trackThickness = isVertical ? 50 : 32;

  // Calculate minimum distance between knobs (thumb size + small gap)
  // This ensures there's always space to pull them apart
  const getMinDistance = (): number => {
    if (isVertical) {
      if (containerHeight === 0) return 0.05; // Default fallback
      // Minimum distance = thumb height + small gap (about 10% more)
      return (thumbHeight * 1.1) / (containerHeight - thumbHeight);
    } else {
      if (containerWidth === 0) return 0.05; // Default fallback
      // Minimum distance = thumb width + small gap (about 10% more)
      return (thumbWidth * 1.1) / (containerWidth - thumbWidth);
    }
  };

  const valueToPosition = (value: number) => {
    if (isVertical) {
      return (1 - value) * (containerHeight - thumbHeight);
    } else {
      return value * (containerWidth - thumbWidth);
    }
  };

  const positionToValue = (position: number) => {
    if (isVertical) {
      if (containerHeight === 0) return 0;
      return Math.max(0, Math.min(1, 1 - (position / (containerHeight - thumbHeight))));
    } else {
      if (containerWidth === 0) return 0;
      return Math.max(0, Math.min(1, position / (containerWidth - thumbWidth)));
    }
  };

  const getDragMode = (touchX: number, touchY: number): DragMode => {
    const minPos = valueToPosition(minValue);
    const maxPos = valueToPosition(maxValue);
    
    if (isVertical) {
      const touchPos = touchY;
      // For vertical: minValue is at bottom (higher Y), maxValue is at top (lower Y)
      // So minPos > maxPos
      const minThumbCenter = minPos + thumbHeight / 2;
      const maxThumbCenter = maxPos + thumbHeight / 2;
      const thumbHitRadius = Math.max(thumbHeight / 2, thumbWidth / 2) + 10; // Add some hit area
      
      // Check if touching min thumb (bottom, higher Y)
      if (Math.abs(touchPos - minThumbCenter) < thumbHitRadius) {
        return 'min';
      }
      // Check if touching max thumb (top, lower Y)
      if (Math.abs(touchPos - maxThumbCenter) < thumbHitRadius) {
        return 'max';
      }
      // Check if touching the range between them (maxPos is top, minPos is bottom)
      if (touchPos > maxThumbCenter && touchPos < minThumbCenter) {
        return 'range';
      }
    } else {
      const touchPos = touchX;
      const minThumbCenter = minPos + thumbWidth / 2;
      const maxThumbCenter = maxPos + thumbWidth / 2;
      const thumbHitRadius = Math.max(thumbWidth / 2, thumbHeight / 2) + 10; // Add some hit area
      
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
    
    let dragMode = getDragMode(locationX, locationY);
    
    // If no drag mode detected, check if clicking outside the range
    // This allows snapping knobs to the touch position
    let snappedMin = minValue;
    let snappedMax = maxValue;
    
    if (!dragMode) {
      const minPos = valueToPosition(minValue);
      const maxPos = valueToPosition(maxValue);
      const minDistance = getMinDistance();
      
      if (isVertical) {
        const touchPos = locationY;
        const minThumbCenter = minPos + thumbHeight / 2;
        const maxThumbCenter = maxPos + thumbHeight / 2;
        
        // Clicking above the max thumb (lower Y) - snap max thumb up
        if (touchPos < maxThumbCenter) {
          const newValue = positionToValue(touchPos);
          snappedMax = Math.max(minValue + minDistance, Math.min(newValue, 1));
          onRangeChange(minValue, Number(snappedMax.toFixed(2)));
          dragMode = 'max';
        }
        // Clicking below the min thumb (higher Y) - snap min thumb down
        else if (touchPos > minThumbCenter) {
          const newValue = positionToValue(touchPos);
          snappedMin = Math.max(0, Math.min(newValue, maxValue - minDistance));
          onRangeChange(Number(snappedMin.toFixed(2)), maxValue);
          dragMode = 'min';
        }
      } else {
        const touchPos = locationX;
        const minThumbCenter = minPos + thumbWidth / 2;
        const maxThumbCenter = maxPos + thumbWidth / 2;
        
        // Clicking before the min thumb (lower X) - snap min thumb left
        if (touchPos < minThumbCenter) {
          const newValue = positionToValue(touchPos);
          snappedMin = Math.max(0, Math.min(newValue, maxValue - minDistance));
          onRangeChange(Number(snappedMin.toFixed(2)), maxValue);
          dragMode = 'min';
        }
        // Clicking after the max thumb (higher X) - snap max thumb right
        else if (touchPos > maxThumbCenter) {
          const newValue = positionToValue(touchPos);
          snappedMax = Math.max(minValue + minDistance, Math.min(newValue, 1));
          onRangeChange(minValue, Number(snappedMax.toFixed(2)));
          dragMode = 'max';
        }
      }
    }
    
    if (dragMode) {
      activeTouchesRef.current.set(identifier, dragMode);
      dragStartRef.current = {
        min: snappedMin,
        max: snappedMax,
        touchX: locationX,
        touchY: locationY,
      };
    }
  };

  const handleTouchMove = (evt: any) => {
    const { locationX, locationY, identifier } = evt.nativeEvent;
    const dragMode = activeTouchesRef.current.get(identifier);
    
    if (!dragMode || !dragStartRef.current) return;
    
    const minDistance = getMinDistance();
    
    if (dragMode === 'min') {
      const newValue = positionToValue(isVertical ? locationY : locationX);
      const clampedValue = Math.max(0, Math.min(newValue, maxValue - minDistance)); // Maintain minimum distance
      onRangeChange(Number(clampedValue.toFixed(2)), maxValue);
    } else if (dragMode === 'max') {
      const newValue = positionToValue(isVertical ? locationY : locationX);
      const clampedValue = Math.max(minValue + minDistance, Math.min(newValue, 1)); // Maintain minimum distance
      onRangeChange(minValue, Number(clampedValue.toFixed(2)));
    } else if (dragMode === 'range') {
      // Move both thumbs by the same delta from the original start position
      const currentPos = isVertical ? locationY : locationX;
      const startPos = isVertical ? dragStartRef.current.touchY : dragStartRef.current.touchX;
      const containerSize = isVertical ? (containerHeight - thumbHeight) : (containerWidth - thumbWidth);
      
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
      {/* Gray connection track between the two thumbs - rendered first (beneath) */}
      <View
        pointerEvents="none"
        style={isVertical ? {
          position: 'absolute',
          left: 0,
          top: Math.max(0, Math.min(maxPos, containerHeight - thumbHeight)),
          width: trackThickness,
          height: Math.max(thumbHeight, Math.abs(minPos - maxPos) + thumbHeight),
          borderRadius: 15,
          backgroundColor: '#444', // Grayish connection
        } : {
          position: 'absolute',
          left: Math.max(0, Math.min(minPos, containerWidth - thumbWidth)),
          top: 0,
          width: Math.max(thumbWidth, maxPos - minPos + thumbWidth),
          height: trackThickness,
          borderRadius: 16,
          backgroundColor: '#444', // Grayish connection
        }}
      />
      {/* Min thumb - colored like single slider */}
      <View
        pointerEvents="none"
        style={isVertical ? {
          position: 'absolute',
          left: 0,
          top: Math.max(0, Math.min(minPos, containerHeight - thumbHeight)),
          width: thumbWidth,
          height: thumbHeight,
          borderRadius: 15,
          backgroundColor: trackColor,
        } : {
          position: 'absolute',
          left: Math.max(0, Math.min(minPos, containerWidth - thumbWidth)),
          top: 0,
          width: thumbWidth,
          height: thumbHeight,
          borderRadius: 16,
          backgroundColor: trackColor,
        }}
      />
      {/* Max thumb - colored like single slider */}
      <View
        pointerEvents="none"
        style={isVertical ? {
          position: 'absolute',
          left: 0,
          top: Math.max(0, Math.min(maxPos, containerHeight - thumbHeight)),
          width: thumbWidth,
          height: thumbHeight,
          borderRadius: 15,
          backgroundColor: trackColor,
        } : {
          position: 'absolute',
          left: Math.max(0, Math.min(maxPos, containerWidth - thumbWidth)),
          top: 0,
          width: thumbWidth,
          height: thumbHeight,
          borderRadius: 16,
          backgroundColor: trackColor,
        }}
      />
    </View>
  );
}
