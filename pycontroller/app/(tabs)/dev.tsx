// Subscription type not exported from expo-sensors; use 'any' for sensor subscriptions
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, SafeAreaView, ScrollView, Dimensions, Modal, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { DeviceMotion, Magnetometer, Gyroscope, Barometer } from 'expo-sensors';
import type { DeviceMotionMeasurement } from 'expo-sensors';
import AccelerationScreen from '@/components/sensorvisuals/acceleration';
import MagneticScreen from '@/components/sensorvisuals/magnetic';
import AccelerationWithGravityScreen from '@/components/sensorvisuals/accelerationWithGravity';
import RotationScreen from '@/components/sensorvisuals/rotation';
import RotationDeltaScreen from '@/components/sensorvisuals/rotationDelta';
import GyroscopeScreen from '@/components/sensorvisuals/gyroscope';
import Slider from '@/components/ui/slider';
import RangedSlider from '@/components/ui/ranged-slider';

const MAGNETO_WS_URL = 'ws://172.20.10.3:8765';
const MOUSE_WS_URL = 'ws://172.20.10.3:8766';

const screenHeight = Dimensions.get('window').height;
const screenWidth = Dimensions.get('window').width;

// Blank popup component
function BlankPopup({ visible, onClose, children }: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <BlurView intensity={40} tint="dark" style={{ ...StyleSheet.absoluteFillObject, zIndex: 0 }} />
        <View
          style={{
            width: '100%',
            height: '60%',
            backgroundColor: '#000',
            borderRadius: 0,
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 0,
            overflow: 'hidden',
          }}
        >
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 60, alignItems: 'center', justifyContent: 'center', paddingTop: 20 }}>
            {children}
          </View>
          <Pressable
            onPress={onClose}
            style={{
              backgroundColor: '#222',
              paddingHorizontal: 32,
              paddingVertical: 12,
              borderRadius: 10,
              marginBottom: 16,
              alignSelf: 'center',
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: [{ translateX: -64 }],
              width: 128,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, textAlign: 'center' }}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// Map measurement to component
const measurementComponentMap: Record<string, React.ComponentType | null> = {
  'acc': AccelerationScreen,
  'acc+grav': AccelerationWithGravityScreen,
  'rot': RotationScreen,
  'rotΔ': RotationDeltaScreen,
  'magnetometer': MagneticScreen,
  'gyroscope': GyroscopeScreen,
  'barometer': null,
};

// Collapsible section component
function CollapsibleSection({ 
  title, 
  children, 
  defaultExpanded = false 
}: { 
  title: string; 
  children: React.ReactNode; 
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  return (
    <View style={collapsibleStyles.section}>
      <Pressable 
        onPress={() => setExpanded(!expanded)}
        style={collapsibleStyles.header}
      >
        <Text style={collapsibleStyles.headerText}>{title}</Text>
        <MaterialIcons 
          name={expanded ? 'expand-less' : 'expand-more'} 
          size={24} 
          color="#fff" 
        />
      </Pressable>
      {expanded && (
        <View style={collapsibleStyles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

// Touchpad component for mouse control
function TouchpadComponent({
  onDismiss,
  onTouchEvent,
  onClick,
  onDragEvent,
  onScrollEvent,
}: {
  onDismiss: () => void;
  onTouchEvent: (action: 'start' | 'move' | 'end', x: number, y: number) => void;
  onClick: (x: number, y: number) => void;
  onDragEvent: (action: 'start' | 'move' | 'end', x: number, y: number) => void;
  onScrollEvent: (deltaY: number) => void;
}) {
  const [currentTouch, setCurrentTouch] = useState<{ x: number; y: number } | null>(null);
  const [isTouching, setIsTouching] = useState(false);
  const touchpadRef = React.useRef<View>(null);
  const intervalRef = React.useRef<number | null>(null);
  const lastSentRef = React.useRef<{ x: number; y: number } | null>(null);
  const currentTouchRef = React.useRef<{ x: number; y: number } | null>(null);
  const initialTouchRef = React.useRef<{ x: number; y: number } | null>(null);
  const hasMovedRef = React.useRef<boolean>(false);
  
  // Double tap detection for drag
  const lastTapRef = React.useRef<{ time: number; x: number; y: number } | null>(null);
  const [isDragMode, setIsDragMode] = useState(false);
  const dragModeRef = React.useRef<boolean>(false);
  const pendingDragModeRef = React.useRef<boolean>(false); // Set after double tap, activated on movement

  // Scroll wheel state
  const leftScrollRef = React.useRef<View>(null);
  const rightScrollRef = React.useRef<View>(null);
  const [isScrolling, setIsScrolling] = useState<'left' | 'right' | null>(null);
  const scrollOriginYRef = React.useRef<number | null>(null);
  const scrollCurrentYRef = React.useRef<number | null>(null);
  const scrollIntervalRef = React.useRef<number | null>(null);
  const scrollAccumulatedRef = React.useRef<number>(0); // Accumulate fractional scrolls
  const [scrollPosition, setScrollPosition] = useState({ left: 0, right: 0 }); // Visual scroll position for infinite scrolling
  const scrollTargetRef = React.useRef({ left: 0, right: 0 }); // Target position for interpolation
  const scrollInterpolatedRef = React.useRef({ left: 0, right: 0 }); // Interpolated position

  // Calculate the size to be a 1:1 square based on screen dimensions
  const minDimension = Math.min(screenWidth, screenHeight);
  const touchpadDimension = minDimension * 0.8; // 80% of the smaller dimension
  const scrollWheelWidth = 40; // Width of scroll wheels in pixels

  // Keep refs in sync with state for interval callback
  useEffect(() => {
    currentTouchRef.current = currentTouch;
  }, [currentTouch]);
  
  useEffect(() => {
    dragModeRef.current = isDragMode;
  }, [isDragMode]);

  // Send coordinates at 30Hz (~33ms interval) when actively touching
  useEffect(() => {
    if (isTouching && currentTouch) {
      const isDrag = dragModeRef.current;
      const pendingDrag = pendingDragModeRef.current;
      
      if (isDrag) {
        // In drag mode, send drag events
        if (!lastSentRef.current) {
          // Clamp origin to 0-1 (origin must be within green square)
          const clampedOrigin = { 
            x: Math.max(0, Math.min(1, currentTouch.x)), 
            y: Math.max(0, Math.min(1, currentTouch.y)) 
          };
          // First touch in drag mode - send drag start with clamped origin
          onDragEvent('start', clampedOrigin.x, clampedOrigin.y);
          initialTouchRef.current = clampedOrigin;
        }
        lastSentRef.current = { x: currentTouch.x, y: currentTouch.y };

        // Send drag move events at 30Hz
        intervalRef.current = setInterval(() => {
          const touch = currentTouchRef.current;
          if (touch && lastSentRef.current) {
            onDragEvent('move', touch.x, touch.y);
            lastSentRef.current = { x: touch.x, y: touch.y };
          }
        }, 33); // ~30Hz
      } else {
        // Normal touch mode (or pending drag mode)
        // Clamp origin to 0-1 (origin must be within green square)
        const clampedOrigin = { 
          x: Math.max(0, Math.min(1, currentTouch.x)), 
          y: Math.max(0, Math.min(1, currentTouch.y)) 
        };
        // Send start event immediately on first touch with clamped origin
        onTouchEvent('start', clampedOrigin.x, clampedOrigin.y);
        lastSentRef.current = { x: currentTouch.x, y: currentTouch.y };
        initialTouchRef.current = clampedOrigin;
        hasMovedRef.current = false;

        // Then send coordinates at 30Hz
        intervalRef.current = setInterval(() => {
          const touch = currentTouchRef.current;
          if (touch && lastSentRef.current && initialTouchRef.current) {
            // Check if we've moved significantly (more than 0.02 normalized units = ~2% of touchpad)
            const dx = Math.abs(touch.x - initialTouchRef.current.x);
            const dy = Math.abs(touch.y - initialTouchRef.current.y);
            if (dx > 0.02 || dy > 0.02) {
              hasMovedRef.current = true;
              
              // If pending drag mode and we've moved, activate drag mode
              if (pendingDrag && !isDrag) {
                setIsDragMode(true);
                pendingDragModeRef.current = false;
                // Send drag start and cancel the current touch
                onTouchEvent('end', lastSentRef.current.x, lastSentRef.current.y);
                // Clamp origin to 0-1 (origin must be within green square)
                const clampedOrigin = { 
                  x: Math.max(0, Math.min(1, touch.x)), 
                  y: Math.max(0, Math.min(1, touch.y)) 
                };
                onDragEvent('start', clampedOrigin.x, clampedOrigin.y);
                lastSentRef.current = { x: touch.x, y: touch.y };
                initialTouchRef.current = clampedOrigin;
              }
            }
            
            // Send events based on current mode
            if (dragModeRef.current) {
              // Now in drag mode, send drag move
              onDragEvent('move', touch.x, touch.y);
            } else {
              // Still in normal touch mode
              onTouchEvent('move', touch.x, touch.y);
            }
            lastSentRef.current = { x: touch.x, y: touch.y };
          }
        }, 33); // ~30Hz
      }
    } else {
      // Touch ended
      if (lastSentRef.current && initialTouchRef.current) {
        const isDrag = dragModeRef.current;
        
        if (isDrag) {
          // Send drag end event
          onDragEvent('end', lastSentRef.current.x, lastSentRef.current.y);
          setIsDragMode(false);
        } else {
          // Normal touch mode
          // If no significant movement, treat as a click
          if (!hasMovedRef.current) {
            onClick(initialTouchRef.current.x, initialTouchRef.current.y);
          } else {
            // Otherwise send normal end event
            onTouchEvent('end', lastSentRef.current.x, lastSentRef.current.y);
          }
        }
        lastSentRef.current = null;
        initialTouchRef.current = null;
        hasMovedRef.current = false;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTouching, isDragMode, onTouchEvent, onClick, onDragEvent]);

  const updateTouchPosition = (evt: any) => {
    const touch = evt.nativeEvent.touches[0];
    if (!touch || !touchpadRef.current) return;

    touchpadRef.current.measure((x, y, width, height, pageX, pageY) => {
      const localX = touch.pageX - pageX;
      const localY = touch.pageY - pageY;

      // Normalize coordinates (allow <0 and >1 for movement outside touchpad)
      // Origin will be clamped to 0-1 when stored
      const normalizedX = localX / width;
      const normalizedY = localY / height;

      setCurrentTouch({ x: normalizedX, y: normalizedY });
    });
  };

  const handleTouchStart = (evt: any) => {
    updateTouchPosition(evt);
    
    // Check for double tap
    const now = Date.now();
    const touch = evt.nativeEvent.touches[0];
    if (touch && touchpadRef.current) {
      touchpadRef.current.measure((x, y, width, height, pageX, pageY) => {
        const localX = touch.pageX - pageX;
        const localY = touch.pageY - pageY;
        // Clamp origin to 0-1 for double-tap detection (origin must be within green square)
        const normalizedX = Math.max(0, Math.min(1, localX / width));
        const normalizedY = Math.max(0, Math.min(1, localY / height));
        
        if (lastTapRef.current) {
          const timeDiff = now - lastTapRef.current.time;
          const distX = Math.abs(normalizedX - lastTapRef.current.x);
          const distY = Math.abs(normalizedY - lastTapRef.current.y);
          
          // Double tap detected if within 300ms and similar position (within 0.05 normalized units)
          if (timeDiff < 300 && distX < 0.05 && distY < 0.05) {
            // Enter drag mode - will activate on first movement
            setIsDragMode(true);
            lastTapRef.current = null; // Reset to prevent triple tap
          } else {
            lastTapRef.current = { time: now, x: normalizedX, y: normalizedY };
          }
        } else {
          lastTapRef.current = { time: now, x: normalizedX, y: normalizedY };
        }
      });
    }
    
    setIsTouching(true);
  };

  const handleTouchMove = (evt: any) => {
    updateTouchPosition(evt);
    
    // If in drag mode and we start moving, ensure drag mode is active
    if (dragModeRef.current && !isDragMode) {
      setIsDragMode(true);
    }
  };

  const handleTouchEnd = () => {
    setIsTouching(false);
    setCurrentTouch(null);
    
    // Reset drag mode after a delay (in case of another double tap)
    // But only if we're not currently in a drag operation
    if (!isDragMode) {
      // Clear double tap tracking after a delay
      setTimeout(() => {
        if (!isTouching) {
          lastTapRef.current = null;
        }
      }, 300);
    }
  };

  // Scroll wheel handlers
  const handleScrollStart = (side: 'left' | 'right', evt: any) => {
    const touch = evt.nativeEvent.touches[0];
    if (!touch) return;
    
    const scrollRef = side === 'left' ? leftScrollRef : rightScrollRef;
    if (!scrollRef.current) return;
    
    scrollRef.current.measure((x, y, width, height, pageX, pageY) => {
      const localY = touch.pageY - pageY;
      scrollOriginYRef.current = localY;
      scrollCurrentYRef.current = localY;
      scrollAccumulatedRef.current = 0;
      setIsScrolling(side);
    });
  };

  const handleScrollMove = (side: 'left' | 'right', evt: any) => {
    if (!isScrolling || isScrolling !== side) return;
    
    const touch = evt.nativeEvent.touches[0];
    if (!touch) return;
    
    const scrollRef = side === 'left' ? leftScrollRef : rightScrollRef;
    if (!scrollRef.current) return;
    
    scrollRef.current.measure((x, y, width, height, pageX, pageY) => {
      const localY = touch.pageY - pageY;
      scrollCurrentYRef.current = localY;
    });
  };

  const handleScrollEnd = () => {
    setIsScrolling(null);
    scrollOriginYRef.current = null;
    scrollCurrentYRef.current = null;
    scrollAccumulatedRef.current = 0;
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  // Scroll wheel continuous update effect with interpolation
  useEffect(() => {
    if (isScrolling && scrollOriginYRef.current !== null) {
      let lastProcessedY = scrollOriginYRef.current;
      const side = isScrolling;
      
      // Send scroll events at 60Hz for smoother scrolling
      scrollIntervalRef.current = setInterval(() => {
        const currentY = scrollCurrentYRef.current;
        const originY = scrollOriginYRef.current;
        
        if (currentY !== null && originY !== null) {
          // Calculate total delta from origin (negative = scroll up, positive = scroll down)
          const totalDeltaY = originY - currentY;
          const deltaSinceLast = lastProcessedY - currentY;
          
          if (Math.abs(deltaSinceLast) > 0.1) { // Small threshold to avoid jitter
            // Normalize delta to scroll amount (scale factor for sensitivity)
            // Use smaller multiplier for smoother, more precise scrolling
            const scrollAmount = deltaSinceLast * 0.05;
            onScrollEvent(scrollAmount);
            
            // Update visual scroll position (infinite scrolling - use modulo to wrap)
            const tickHeight = 20; // Height of each tick mark in pixels
            const scrollDelta = deltaSinceLast;
            scrollTargetRef.current[side] += scrollDelta;
            
            // Wrap around for infinite scrolling (modulo with large range)
            const maxScroll = 10000; // Large number for infinite feel
            scrollTargetRef.current[side] = ((scrollTargetRef.current[side] % maxScroll) + maxScroll) % maxScroll;
            
            lastProcessedY = currentY;
          }
        }
      }, 16); // ~60Hz for smoother scrolling
    } else {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    }

    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
        scrollIntervalRef.current = null;
      }
    };
  }, [isScrolling, onScrollEvent]);

  // Interpolation effect for smooth visual scrolling
  useEffect(() => {
    const interpolationInterval = setInterval(() => {
      // Smooth interpolation towards target position
      const smoothing = 0.15; // Interpolation factor (lower = smoother but slower)
      scrollInterpolatedRef.current.left += (scrollTargetRef.current.left - scrollInterpolatedRef.current.left) * smoothing;
      scrollInterpolatedRef.current.right += (scrollTargetRef.current.right - scrollInterpolatedRef.current.right) * smoothing;
      
      setScrollPosition({
        left: scrollInterpolatedRef.current.left,
        right: scrollInterpolatedRef.current.right,
      });
    }, 16); // ~60Hz for smooth animation

    return () => clearInterval(interpolationInterval);
  }, []);

  // Ruler scroll wheel component
  const RulerScrollWheel = ({ side, scrollPos }: { side: 'left' | 'right'; scrollPos: number }) => {
    const tickHeight = 20; // Height between major ticks
    const minorTickHeight = 10; // Height between minor ticks
    const numTicks = Math.ceil(touchpadDimension / minorTickHeight) + 2; // Extra ticks for seamless scrolling
    
    // Calculate offset for infinite scrolling
    const baseOffset = scrollPos % tickHeight;
    const offset = baseOffset - (baseOffset % minorTickHeight);
    
    return (
      <View style={{ flex: 1, height: '100%', overflow: 'hidden' }}>
        {/* Ruler ticks */}
        {Array.from({ length: numTicks }).map((_, i) => {
          const tickY = i * minorTickHeight - offset;
          const isMajorTick = i % 2 === 0;
          const tickLength = isMajorTick ? scrollWheelWidth * 0.6 : scrollWheelWidth * 0.4;
          
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                top: tickY,
                width: scrollWheelWidth,
                height: 1,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: tickLength,
                  height: 1,
                  backgroundColor: '#39ff14',
                  opacity: isMajorTick ? 0.8 : 0.4,
                }}
              />
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {/* Left scroll wheel - positioned outside the touchpad */}
        <View
          ref={leftScrollRef}
          onTouchStart={(evt) => handleScrollStart('left', evt)}
          onTouchMove={(evt) => handleScrollMove('left', evt)}
          onTouchEnd={handleScrollEnd}
          onTouchCancel={handleScrollEnd}
          style={{
            width: scrollWheelWidth,
            height: touchpadDimension,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderColor: '#39ff14',
            borderRadius: 8,
            marginRight: 4, // Gap between scroll wheel and touchpad
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <RulerScrollWheel side="left" scrollPos={scrollPosition.left} />
        </View>
        
        {/* Main touchpad */}
        <View
          ref={touchpadRef}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          style={{
            width: touchpadDimension,
            height: touchpadDimension,
            backgroundColor: '#000',
            borderWidth: 2,
            borderColor: '#39ff14',
            borderRadius: 8,
          }}
        />
        
        {/* Right scroll wheel - positioned outside the touchpad */}
        <View
          ref={rightScrollRef}
          onTouchStart={(evt) => handleScrollStart('right', evt)}
          onTouchMove={(evt) => handleScrollMove('right', evt)}
          onTouchEnd={handleScrollEnd}
          onTouchCancel={handleScrollEnd}
          style={{
            width: scrollWheelWidth,
            height: touchpadDimension,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderColor: '#39ff14',
            borderRadius: 8,
            marginLeft: 4, // Gap between scroll wheel and touchpad
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <RulerScrollWheel side="right" scrollPos={scrollPosition.right} />
        </View>
      </View>
      <Pressable
        onPress={onDismiss}
        style={{
          backgroundColor: '#222',
          paddingHorizontal: 32,
          paddingVertical: 12,
          borderRadius: 10,
          marginTop: 24,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, textAlign: 'center' }}>
          Dismiss
        </Text>
      </Pressable>
    </View>
  );
}

export default function DevScreen() {
  // Popup state
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupMeasurement, setPopupMeasurement] = useState('');
  const [popupComponent, setPopupComponent] = useState<string>('');
  const openPopup = (measurement: string) => {
    setPopupMeasurement(measurement);
    setPopupComponent(measurement);
    setPopupVisible(true);
  };
  const closePopup = () => setPopupVisible(false);
  const [motionData, setMotionData] = useState<DeviceMotionMeasurement | null>(null);
  const [magnetometerData, setMagnetometerData] = useState<{x: number, y: number, z: number} | null>(null);
  const [gyroscopeData, setGyroscopeData] = useState<{x: number, y: number, z: number} | null>(null);
  const [barometerData, setBarometerData] = useState<{pressure: number} | null>(null);
  const [paused, setPaused] = useState(true); // default to paused

  // Magnetometer -> Python streaming
  const magnetoWsRef = useRef<WebSocket | null>(null);
  const [magnetoStreaming, setMagnetoStreaming] = useState(false);
  
  // Mouse control -> Python streaming
  const mouseWsRef = useRef<WebSocket | null>(null);
  const [mouseControlActive, setMouseControlActive] = useState(false);
  const [touchpadVisible, setTouchpadVisible] = useState(false);
  
  // UI/UX slider states
  const [r, setR] = useState(0.5);
  const [g, setG] = useState(0.5);
  const [b, setB] = useState(0.5);
  const [rangeMin, setRangeMin] = useState(0.2);
  const [rangeMax, setRangeMax] = useState(0.8);
  const [verticalRangeMin, setVerticalRangeMin] = useState(0.3);
  const [verticalRangeMax, setVerticalRangeMax] = useState(0.7);

  // Store subscriptions in refs so we can kill them on pause and recreate on play
  const motionSubRef = useRef<any>(null);
  const magSubRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);
  const baroSubRef = useRef<any>(null);

  // Helper to kill all listeners
  const killAllListeners = () => {
  motionSubRef.current && motionSubRef.current.remove();
  magSubRef.current && magSubRef.current.remove();
  gyroSubRef.current && gyroSubRef.current.remove();
  baroSubRef.current && baroSubRef.current.remove();
  motionSubRef.current = null;
  magSubRef.current = null;
  gyroSubRef.current = null;
  baroSubRef.current = null;
  // Explicitly remove all listeners at native level
  try { DeviceMotion.removeAllListeners(); } catch {}
  try { Magnetometer.removeAllListeners(); } catch {}
  try { Gyroscope.removeAllListeners(); } catch {}
  try { Barometer.removeAllListeners(); } catch {}
    // Explicitly remove all listeners at native level
    try { DeviceMotion.removeAllListeners(); } catch {}
    try { Magnetometer.removeAllListeners(); } catch {}
    try { Gyroscope.removeAllListeners(); } catch {}
    try { Barometer.removeAllListeners(); } catch {}
  };

  const connectMagnetoSocket = () => {
    if (magnetoWsRef.current && 
      (magnetoWsRef.current.readyState === WebSocket.OPEN || 
       magnetoWsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(MAGNETO_WS_URL);
      ws.onopen = () => {
        console.log('[Magneto] WebSocket connected');
      };
      ws.onerror = (event) => {
        console.warn('[Magneto] WebSocket error', event);
      };
      ws.onclose = () => {
        console.log('[Magneto] WebSocket closed');
      };
      magnetoWsRef.current = ws;
    } catch (err) {
      console.warn('[Magneto] Failed to open WebSocket', err);
    }
  };

  const disconnectMagnetoSocket = () => {
    if (magnetoWsRef.current) {
      try {
        magnetoWsRef.current.close();
      } catch (err) {
        console.warn('[Magneto] Error closing WebSocket', err);
      }
      magnetoWsRef.current = null;
    }
  };

  const connectMouseSocket = () => {
    if (mouseWsRef.current && 
      (mouseWsRef.current.readyState === WebSocket.OPEN || 
       mouseWsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(MOUSE_WS_URL);
      ws.onopen = () => {
        console.log('[Mouse] WebSocket connected');
      };
      ws.onerror = (event) => {
        console.warn('[Mouse] WebSocket error', event);
      };
      ws.onclose = () => {
        console.log('[Mouse] WebSocket closed');
      };
      mouseWsRef.current = ws;
    } catch (err) {
      console.warn('[Mouse] Failed to open WebSocket', err);
    }
  };

  const disconnectMouseSocket = () => {
    if (mouseWsRef.current) {
      try {
        // Send end event before closing to reset mouse tracking
        if (mouseWsRef.current.readyState === WebSocket.OPEN) {
          const payload = JSON.stringify({
            type: 'touch',
            t: Date.now(),
            action: 'end',
            x: 0,
            y: 0,
            screenWidth: Math.round(screenWidth),
            screenHeight: Math.round(screenHeight),
          });
          mouseWsRef.current.send(payload);
        }
        mouseWsRef.current.close();
      } catch (err) {
        console.warn('[Mouse] Error closing WebSocket', err);
      }
      mouseWsRef.current = null;
    }
  };

  useEffect(() => {
    if (!paused) {
      killAllListeners(); // Always kill before creating new
      motionSubRef.current = DeviceMotion.addListener(setMotionData);
      gyroSubRef.current = Gyroscope.addListener(setGyroscopeData);
      baroSubRef.current = Barometer.addListener(setBarometerData);

      DeviceMotion.setUpdateInterval(100);
      Gyroscope.setUpdateInterval(100);
      Barometer.setUpdateInterval(500);
    } else {
      killAllListeners();
      // Clear sensor data state to stop background updates
      setMotionData(null);
      setMagnetometerData(null);
      setGyroscopeData(null);
      setBarometerData(null);
    }
    // Clean up on unmount or tab switch
    return () => {
      killAllListeners();
      setMotionData(null);
      setGyroscopeData(null);
      setBarometerData(null);
      disconnectMagnetoSocket();
    };
  }, [paused]);

  // Manage magnetometer subscription independently so streaming can be enabled
  // without having to start all sensors.
  useEffect(() => {
    // We want magnetometer data if either the main sensors are playing
    // or the magnetometer->Python stream is enabled.
    const wantMagData = !paused || magnetoStreaming;

    if (!wantMagData) {
      if (magSubRef.current) {
        try {
          magSubRef.current.remove();
        } catch {}
        magSubRef.current = null;
      }
      setMagnetometerData(null);
      return;
    }

    // (Re)subscribe magnetometer
    if (magSubRef.current) {
      try {
        magSubRef.current.remove();
      } catch {}
    }
    try {
      magSubRef.current = Magnetometer.addListener(setMagnetometerData);
      Magnetometer.setUpdateInterval(100);
    } catch (err) {
      console.warn('[Magneto] Failed to subscribe magnetometer', err);
    }

    // Cleanup
    return () => {
      if (!wantMagData && magSubRef.current) {
        try {
          magSubRef.current.remove();
        } catch {}
        magSubRef.current = null;
      }
    };
  }, [paused, magnetoStreaming]);

  // Open / close WebSocket when streaming toggled
  useEffect(() => {
    if (magnetoStreaming) {
      connectMagnetoSocket();
    } else {
      disconnectMagnetoSocket();
    }

    return () => {
      // On effect cleanup (e.g. unmount), ensure socket is closed when streaming is off
      if (!magnetoStreaming) {
        disconnectMagnetoSocket();
      }
    };
  }, [magnetoStreaming]);

  // Open / close WebSocket when mouse control toggled
  useEffect(() => {
    if (mouseControlActive) {
      connectMouseSocket();
    } else {
      disconnectMouseSocket();
      setTouchpadVisible(false);
    }

    return () => {
      disconnectMouseSocket();
    };
  }, [mouseControlActive]);

  // Push latest magnetometer readings over WebSocket
  useEffect(() => {
    if (!magnetoStreaming) {
      return;
    }

    // Debug logging to understand why samples might not be sending
    if (!magnetometerData) {
      console.log('[Magneto] send skipped: no magnetometerData');
      return;
    }
    if (!magnetoWsRef.current) {
      console.log('[Magneto] send skipped: no WebSocket instance');
      return;
    }
    if (magnetoWsRef.current.readyState !== WebSocket.OPEN) {
      console.log(
        '[Magneto] send skipped: WebSocket not open, readyState=',
        magnetoWsRef.current.readyState,
      );
      return;
    }

    try {
      const payload = JSON.stringify({
        type: 'magnetometer',
        t: Date.now(),
        x: magnetometerData.x,
        y: magnetometerData.y,
        z: magnetometerData.z,
      });
      console.log('[Magneto] sending sample', payload);
      magnetoWsRef.current.send(payload);
    } catch (err) {
      console.warn('[Magneto] Failed to send magnetometer sample', err);
    }
  }, [magnetometerData, magnetoStreaming]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <CollapsibleSection title="Sensors">
            {/* Modern Play/Pause Toggle Button */}
            <View style={{ alignItems: 'center', marginBottom: 16 }}>
              <Text
                onPress={() => setPaused(p => !p)}
                style={{
                  backgroundColor: paused ? '#222' : '#e53935',
                  color: '#fff',
                  paddingHorizontal: 36,
                  paddingVertical: 14,
                  borderRadius: 32,
                  fontWeight: '600',
                  fontSize: 20,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.2,
                  shadowRadius: 4,
                  elevation: 2,
                  letterSpacing: 1,
                  marginBottom: 0,
                }}
              >
                {paused ? '▶ Play' : '⏸ Pause'}
              </Text>
            </View>
            <Text style={styles.header}>Device Motion Sensor Table</Text>
          {/* Motion Data Table */}
          <View style={[styles.tableContainer, styles.motionTable]}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}></Text>
              <Text style={styles.tableHeader}>X</Text>
              <Text style={styles.tableHeader}>Y</Text>
              <Text style={styles.tableHeader}>Z</Text>
              <Text style={styles.tableHeader}></Text>
              <Text style={styles.tableHeader}></Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>acc</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.x?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.y?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.z?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>m/s²</Text>
              <Pressable onPress={() => openPopup('acc')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>acc+g</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.x?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.y?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.z?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>m/s²</Text>
              <Pressable onPress={() => openPopup('acc+grav')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>rot</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.alpha?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.beta?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.gamma?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>deg</Text>
              <Pressable onPress={() => openPopup('rot')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>rotΔ</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.alpha?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.beta?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.gamma?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>deg/s</Text>
              <Pressable onPress={() => openPopup('rotΔ')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
          </View>
          {/* Magnetometer Table */}
          <Text style={styles.header}>Magnetometer</Text>
          <View style={[styles.tableContainer, styles.magnetometerTable]}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}></Text>
              <Text style={styles.tableHeader}>X</Text>
              <Text style={styles.tableHeader}>Y</Text>
              <Text style={styles.tableHeader}>Z</Text>
              <Text style={styles.tableHeader}></Text>
              <Text style={styles.tableHeader}></Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>mag</Text>
              <Text style={styles.tableCell}>{magnetometerData?.x?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>{magnetometerData?.y?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>{magnetometerData?.z?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>μT</Text>
              <Pressable onPress={() => openPopup('magnetometer')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
          </View>
          {/* Gyroscope Table */}
          <Text style={styles.header}>Gyroscope</Text>
          <View style={[styles.tableContainer, styles.gyroscopeTable]}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}></Text>
              <Text style={styles.tableHeader}>X</Text>
              <Text style={styles.tableHeader}>Y</Text>
              <Text style={styles.tableHeader}>Z</Text>
              <Text style={styles.tableHeader}></Text>
              <Text style={styles.tableHeader}></Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>gryo</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.x?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.y?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.z?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>rad/s</Text>
              <Pressable onPress={() => openPopup('gyroscope')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
          </View>
          {/* Barometer Table */}
          <Text style={styles.header}>Barometer</Text>
          <View style={[styles.tableContainer, styles.barometerTable]}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}></Text>
              <Text style={styles.tableHeader}>X</Text>
              <Text style={styles.tableHeader}>Y</Text>
              <Text style={styles.tableHeader}>Z</Text>
              <Text style={styles.tableHeader}></Text>
              <Text style={styles.tableHeader}></Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>barom</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>{barometerData?.pressure?.toFixed(2) ?? '-'} hPa</Text>
              {/* No Plot button for barometer */}
            </View>
          </View>
            <Text style={styles.instructions}>All available sensor measurements are shown above. Values update live.</Text>
            {/* Blank popup modal */}
            <BlankPopup visible={popupVisible} onClose={closePopup}>
              {measurementComponentMap[popupComponent]
                ? React.createElement(measurementComponentMap[popupComponent])
                : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 32 }}>{popupMeasurement}</Text>
                    <Text style={{ color: '#fff', fontSize: 18, marginTop: 16 }}>TODO</Text>
                  </View>
                )}
            </BlankPopup>
          </CollapsibleSection>

          <CollapsibleSection title="UI/UX">
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
          </CollapsibleSection>

          <View style={{ marginTop: 24, alignItems: 'center' }}>
            <Pressable
              onPress={() => setMagnetoStreaming((v) => !v)}
              style={{
                backgroundColor: magnetoStreaming ? '#43a047' : '#222',
                paddingHorizontal: 36,
                paddingVertical: 14,
                borderRadius: 32,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2,
                marginBottom: 4,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 18 }}>
                {magnetoStreaming ? 'Stop Magnetometer → Python Stream' : 'Start Magnetometer → Python Stream'}
              </Text>
            </Pressable>
            <Text style={{ color: '#888', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              Streams magnetometer x / y / z over WebSocket to Python at {MAGNETO_WS_URL}.
            </Text>
          </View>

          <View style={{ marginTop: 24, alignItems: 'center' }}>
            <Pressable
              onPress={() => {
                if (!mouseControlActive) {
                  setMouseControlActive(true);
                  setTouchpadVisible(true);
                } else {
                  setMouseControlActive(false);
                  setTouchpadVisible(false);
                }
              }}
              style={{
                backgroundColor: mouseControlActive ? '#43a047' : '#222',
                paddingHorizontal: 36,
                paddingVertical: 14,
                borderRadius: 32,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2,
                marginBottom: 4,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 18 }}>
                {mouseControlActive ? 'Stop Mouse Control' : 'Start Mouse Control'}
              </Text>
            </Pressable>
            <Text style={{ color: '#888', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              Control mouse via touchpad over WebSocket to Python at {MOUSE_WS_URL}.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Touchpad Modal */}
      <Modal
        visible={touchpadVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          // Send end event before closing
          if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
            try {
              const payload = JSON.stringify({
                type: 'touch',
                t: Date.now(),
                action: 'end',
                x: 0,
                y: 0,
                screenWidth: Math.round(screenWidth),
                screenHeight: Math.round(screenHeight),
              });
              mouseWsRef.current.send(payload);
            } catch (err) {
              console.warn('[Mouse] Failed to send end event', err);
            }
          }
          setTouchpadVisible(false);
          setMouseControlActive(false);
        }}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.9)', justifyContent: 'center', alignItems: 'center' }}>
          <TouchpadComponent
            onDismiss={() => {
              // Send end event before closing
              if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
                try {
                  const payload = JSON.stringify({
                    type: 'touch',
                    t: Date.now(),
                    action: 'end',
                    x: 0,
                    y: 0,
                    screenWidth: Math.round(screenWidth),
                    screenHeight: Math.round(screenHeight),
                  });
                  mouseWsRef.current.send(payload);
                } catch (err) {
                  console.warn('[Mouse] Failed to send end event', err);
                }
              }
              setTouchpadVisible(false);
              setMouseControlActive(false);
            }}
            onTouchEvent={(action, x, y) => {
              if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
                try {
                  const payload = JSON.stringify({
                    type: 'touch',
                    t: Date.now(),
                    action,
                    x,
                    y,
                    screenWidth: Math.round(screenWidth),
                    screenHeight: Math.round(screenHeight),
                  });
                  mouseWsRef.current.send(payload);
                } catch (err) {
                  console.warn('[Mouse] Failed to send touch event', err);
                }
              }
            }}
            onClick={(x, y) => {
              if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
                try {
                  const payload = JSON.stringify({
                    type: 'click',
                    t: Date.now(),
                    button: 'left',
                  });
                  mouseWsRef.current.send(payload);
                } catch (err) {
                  console.warn('[Mouse] Failed to send click event', err);
                }
              }
            }}
            onDragEvent={(action, x, y) => {
              if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
                try {
                  const payload = JSON.stringify({
                    type: 'drag',
                    t: Date.now(),
                    action,
                    x,
                    y,
                    screenWidth: Math.round(screenWidth),
                    screenHeight: Math.round(screenHeight),
                  });
                  mouseWsRef.current.send(payload);
                } catch (err) {
                  console.warn('[Mouse] Failed to send drag event', err);
                }
              }
            }}
            onScrollEvent={(deltaY) => {
              if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
                try {
                  const payload = JSON.stringify({
                    type: 'scroll',
                    t: Date.now(),
                    deltaY,
                  });
                  mouseWsRef.current.send(payload);
                } catch (err) {
                  console.warn('[Mouse] Failed to send scroll event', err);
                }
              }
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 0,
  },
  motionTable: {
    backgroundColor: '#b2d8c5', // darker green
  },
  magnetometerTable: {
    backgroundColor: '#ffb6c1', // darker pink
  },
  gyroscopeTable: {
    backgroundColor: '#ffd59e', // darker orange
  },
  barometerTable: {
    backgroundColor: '#90caf9', // darker blue
  },
  subHeader: {
    fontSize: 18,
    color: '#888',
    marginTop: 16,
    marginBottom: 4,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableMeasurementCell: {
    flex: 1,
    color: '#000',
    textAlign: 'center',
    padding: 2,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 24,
  },
  header: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#111',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingVertical: 4,
    paddingHorizontal: 2,
    minHeight: 32,
    width: '100%',
    alignItems: 'center',
  },
  tableHeader: {
    flex: 1,
    fontWeight: 'bold',
    color: '#000',
    fontSize: 14,
    textAlign: 'center',
    padding: 2,
  },
  tableCell: {
    flex: 1,
    color: '#000',
    fontSize: 13,
    textAlign: 'center',
    padding: 2,
  },
  instructions: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 24,
    textAlign: 'center',
  },
});

const collapsibleStyles = StyleSheet.create({
  section: {
    marginBottom: 16,
    backgroundColor: '#111',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#222',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    padding: 16,
  },
});

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
