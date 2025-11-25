import React, { useState, useRef } from 'react';
import { View } from 'react-native';

export default function ZoomSlider({ 
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
  
  // Zoom state
  const [isZoomed, setIsZoomed] = useState(false);
  const [zoomCenter, setZoomCenter] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPositionRef = useRef<{ x: number; y: number } | null>(null);
  const touchStartTimeRef = useRef<number | null>(null);
  
  // Zoom parameters
  const ZOOM_HOLD_TIME = 1500; // 1.5 seconds in milliseconds
  const ZOOM_RANGE = 0.1; // 10% range when zoomed (5% on each side)
  const ZOOMED_KNOB_SIZE = 0.5; // Knob is 50% size when zoomed

  const isVertical = orientation === 'vertical';

  const updateValue = (locationX: number, locationY: number, isInitialTouch = false) => {
    if (isVertical) {
      if (containerHeight === 0) return;
      // For vertical, value increases from bottom to top (inverted)
      const sliderPercent = Math.max(0, Math.min(1, 1 - (locationY / containerHeight)));
      
      if (isZoomed) {
        // Map the slider's 0-1 range to a zoomed range around zoomCenter
        const zoomMin = Math.max(0, zoomCenter - ZOOM_RANGE / 2);
        const zoomMax = Math.min(1, zoomCenter + ZOOM_RANGE / 2);
        const zoomedValue = zoomMin + sliderPercent * (zoomMax - zoomMin);
        onValueChange(Number(zoomedValue.toFixed(4))); // Higher precision when zoomed
      } else {
        onValueChange(Number(sliderPercent.toFixed(2)));
      }
    } else {
      if (containerWidth === 0) return;
      const sliderPercent = Math.max(0, Math.min(1, locationX / containerWidth));
      
      if (isZoomed) {
        // Map the slider's 0-1 range to a zoomed range around zoomCenter
        const zoomMin = Math.max(0, zoomCenter - ZOOM_RANGE / 2);
        const zoomMax = Math.min(1, zoomCenter + ZOOM_RANGE / 2);
        const zoomedValue = zoomMin + sliderPercent * (zoomMax - zoomMin);
        onValueChange(Number(zoomedValue.toFixed(4))); // Higher precision when zoomed
      } else {
        onValueChange(Number(sliderPercent.toFixed(2)));
      }
    }
  };
  
  // Calculate the visual position of the knob based on current value
  const getKnobPosition = (): number => {
    if (isZoomed) {
      // Map the actual value to slider position within zoomed range
      const zoomMin = Math.max(0, zoomCenter - ZOOM_RANGE / 2);
      const zoomMax = Math.min(1, zoomCenter + ZOOM_RANGE / 2);
      if (zoomMax === zoomMin) return 0;
      const sliderPos = (value - zoomMin) / (zoomMax - zoomMin);
      return Math.max(0, Math.min(1, sliderPos));
    } else {
      return value;
    }
  };

  const startHoldTimer = (touchX: number, touchY: number) => {
    // Clear any existing timer
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }
    
    touchStartPositionRef.current = { x: touchX, y: touchY };
    touchStartTimeRef.current = Date.now();
    
    holdTimerRef.current = setTimeout(() => {
      // If timer fires, it means finger has been held in place
      // Check if we still have a valid start position (touch hasn't ended)
      if (touchStartPositionRef.current && touchStartTimeRef.current) {
        setIsZoomed(true);
        setZoomCenter(value);
      }
    }, ZOOM_HOLD_TIME);
  };

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    touchStartPositionRef.current = null;
    touchStartTimeRef.current = null;
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
            updateValue(touchX, touchY, true);
            
            // Start hold timer for zoom
            startHoldTimer(touchX, touchY);
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
          
          // Check if touch has moved significantly from start position
          if (touchStartPositionRef.current) {
            const distance = isVertical
              ? Math.abs(touchY - touchStartPositionRef.current.y)
              : Math.abs(touchX - touchStartPositionRef.current.x);
            
            // If moved more than 5 pixels, cancel the hold timer
            if (distance > 5) {
              clearHoldTimer();
            }
          }
          
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
    
    // Clear hold timer and reset zoom
    clearHoldTimer();
    setIsZoomed(false);
    setZoomCenter(0);
  };

  // Calculate knob size based on zoom state
  const knobWidth = isVertical ? 50 : (isZoomed ? 24 * ZOOMED_KNOB_SIZE : 24);
  const knobHeight = isVertical ? (isZoomed ? 30 * ZOOMED_KNOB_SIZE : 30) : 32;
  
  const knobPosition = getKnobPosition();

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
          top: containerHeight > 0 ? Math.max(0, Math.min((1 - knobPosition) * (containerHeight - knobHeight), containerHeight - knobHeight)) : 0,
          width: knobWidth,
          height: knobHeight,
          borderRadius: knobHeight / 2,
          backgroundColor: trackColor,
        } : {
          position: 'absolute',
          left: containerWidth > 0 ? Math.max(0, Math.min(knobPosition * (containerWidth - knobWidth), containerWidth - knobWidth)) : 0,
          top: 0,
          width: knobWidth,
          height: knobHeight,
          borderRadius: knobHeight / 2,
          backgroundColor: trackColor,
        }}
      />
    </View>
  );
}
