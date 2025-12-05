// Subscription type not exported from expo-sensors; use 'any' for sensor subscriptions
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, SafeAreaView, ScrollView, Dimensions, Modal, Pressable, TextInput, InputAccessoryView, Platform, Switch, Keyboard } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Magnetometer } from 'expo-sensors';
import SensorsShowcase from '@/app/dev/sensors-showcase';
import UIUXShowcase from '@/app/dev/ui-ux-showcase';
import RustCoreShowcase from '@/app/dev/rust-core-showcase';

// mDNS / DNS-SD (native only; you'll need to install `react-native-zeroconf`)
// On web this will be unused.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Zeroconf: any = Platform.OS === 'web' ? null : require('react-native-zeroconf').default ?? require('react-native-zeroconf');

// mDNS service types
const MAGNETO_SERVICE_TYPE = '_magneto._tcp.local.';
const MOUSE_SERVICE_TYPE = '_pymouse._tcp.local.';

// Fallback URLs (used if mDNS discovery fails)
const FALLBACK_MAGNETO_WS_URL = 'ws://172.20.10.3:8765';
// No fallback for mouse service - must be discovered

const screenHeight = Dimensions.get('window').height;
const screenWidth = Dimensions.get('window').width;

// Scroll threshold - distance in pixels to trigger a scroll packet
const SCROLL_THRESHOLD = 25; // Reduced from 50 for more sensitive scrolling

// Speed thresholds for scroll amount (pixels per millisecond)
// Speed >= FAST_THRESHOLD -> send 3 units
// Speed >= MEDIUM_THRESHOLD -> send 2 units
// Speed < MEDIUM_THRESHOLD -> send 1 unit
const SCROLL_SPEED_MEDIUM = 0.5; // pixels per ms (medium speed)
const SCROLL_SPEED_FAST = 1.0; // pixels per ms (fast speed)


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
  keyboardText,
  onKeyboardTextChange,
  onSendKey,
  onSendBatchText,
  chatMode,
  onChatModeChange,
}: {
  onDismiss: () => void;
  onTouchEvent: (action: 'start' | 'move' | 'end', x: number, y: number) => void;
  onClick: (x: number, y: number) => void;
  onDragEvent: (action: 'start' | 'move' | 'end', x: number, y: number) => void;
  onScrollEvent: (deltaY: number) => void;
  keyboardText: string;
  onKeyboardTextChange: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendBatchText: (text: string) => void;
  chatMode: boolean;
  onChatModeChange: (enabled: boolean) => void;
}) {
  const [currentTouch, setCurrentTouch] = useState<{ x: number; y: number } | null>(null);
  const [isTouching, setIsTouching] = useState(false);
  const touchpadRef = React.useRef<View>(null);
  const keyboardInputRef = React.useRef<TextInput>(null);
  const keyboardInputAccessoryRef = React.useRef<TextInput>(null);
  const inputAccessoryViewID = React.useRef(`keyboardAccessory-${Date.now()}-${Math.random()}`).current;
  const [isMainInputFocused, setIsMainInputFocused] = useState(false);
  const [isAccessoryInputFocused, setIsAccessoryInputFocused] = useState(false);
  const shouldPreventRefocusRef = React.useRef<boolean>(false);
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

  // Scroll wheel state - using ScrollView for natural scrolling feel
  const leftScrollRef = React.useRef<ScrollView>(null);
  const rightScrollRef = React.useRef<ScrollView>(null);
  const [isScrolling, setIsScrolling] = useState<'left' | 'right' | null>(null);
  const scrollOriginYRef = React.useRef<number | null>(null);
  const scrollCurrentYRef = React.useRef<number | null>(null);
  const scrollAccumulatedRef = React.useRef<number>(0); // Accumulate fractional scrolls
  const scrollContentHeightRef = React.useRef<number>(5000); // Large content height for infinite scroll feel
  const scrollOffsetRef = React.useRef({ left: 0, right: 0 }); // Track scroll offset for wrapping

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

  // Send coordinates at 60Hz (~16ms interval) for smoother movement
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

        // Send drag move events at 60Hz for smoother dragging
        intervalRef.current = setInterval(() => {
          const touch = currentTouchRef.current;
          if (touch && lastSentRef.current) {
            // Always send packets while holding tap, even if position hasn't moved
            onDragEvent('move', touch.x, touch.y);
            lastSentRef.current = { x: touch.x, y: touch.y };
          }
        }, 16); // ~60Hz for smoother movement
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

        // Then send coordinates at 60Hz for continuous updates
        intervalRef.current = setInterval(() => {
          const touch = currentTouchRef.current;
          if (touch && lastSentRef.current && initialTouchRef.current) {
            // Reduced threshold for higher precision (0.001 instead of 0.02)
            const dx = Math.abs(touch.x - initialTouchRef.current.x);
            const dy = Math.abs(touch.y - initialTouchRef.current.y);
            if (dx > 0.001 || dy > 0.001) {
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
            
            // Always send events based on current mode while holding tap, even if position hasn't moved
            if (dragModeRef.current) {
              // Now in drag mode, send drag move
              onDragEvent('move', touch.x, touch.y);
            } else {
              // Still in normal touch mode
              onTouchEvent('move', touch.x, touch.y);
            }
            lastSentRef.current = { x: touch.x, y: touch.y };
          }
        }, 16); // ~60Hz for smoother movement
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
    
    // Send move events immediately for responsive mouse movement
    if (isTouching && currentTouchRef.current && lastSentRef.current) {
      const touch = currentTouchRef.current;
      
      if (initialTouchRef.current) {
        const dx = Math.abs(touch.x - initialTouchRef.current.x);
        const dy = Math.abs(touch.y - initialTouchRef.current.y);
        if (dx > 0.001 || dy > 0.001) {
          hasMovedRef.current = true;
        }
      }
      
      // If pending drag mode and we've moved, activate drag mode
      if (pendingDragModeRef.current && !dragModeRef.current && initialTouchRef.current) {
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
      
      // Always send move event immediately based on current mode while holding tap
      if (dragModeRef.current) {
        onDragEvent('move', touch.x, touch.y);
      } else {
        onTouchEvent('move', touch.x, touch.y);
      }
      lastSentRef.current = { x: touch.x, y: touch.y };
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

  // Scroll wheel handlers - using ScrollView's native scroll events
  const lastScrollOffsetRef = React.useRef<{ left: number | null; right: number | null }>({ left: null, right: null });
  const scrollWrapInProgressRef = React.useRef<{ left: boolean; right: boolean }>({ left: false, right: false });
  const scrollInitialOffsetRef = React.useRef<{ left: number | null; right: number | null }>({ left: null, right: null });
  const scrollLastTimeRef = React.useRef<{ left: number | null; right: number | null }>({ left: null, right: null });
  const scrollLastPositionRef = React.useRef<{ left: number | null; right: number | null }>({ left: null, right: null });
  
  const handleScroll = (side: 'left' | 'right', event: any) => {
    // Only process scroll events if we're actively scrolling (finger is down)
    if (!isScrolling || isScrolling !== side) return;
    
    const offsetY = event.nativeEvent.contentOffset.y;
    const scrollRef = side === 'left' ? leftScrollRef : rightScrollRef;
    
    if (!scrollRef.current || scrollWrapInProgressRef.current[side]) return;
    
    // Track scroll offset
    scrollOffsetRef.current[side] = offsetY;
    
    // Get initial position for this scroll gesture
    let currentBaseline = scrollInitialOffsetRef.current[side];
    if (currentBaseline === null) {
      // First scroll event - initialize the baseline and timing
      scrollInitialOffsetRef.current[side] = offsetY;
      lastScrollOffsetRef.current[side] = offsetY;
      scrollLastTimeRef.current[side] = Date.now();
      scrollLastPositionRef.current[side] = offsetY;
      return;
    }
    
    // Calculate speed for this scroll event
    const now = Date.now();
    const lastTime = scrollLastTimeRef.current[side];
    const lastPosition = scrollLastPositionRef.current[side];
    let scrollSpeed = 0; // pixels per millisecond
    
    if (lastTime !== null && lastPosition !== null) {
      const timeDelta = now - lastTime;
      const distanceDelta = Math.abs(offsetY - lastPosition);
      if (timeDelta > 0) {
        scrollSpeed = distanceDelta / timeDelta;
      }
    }
    
    // Determine scroll amount based on speed (1, 2, or 3)
    let scrollAmount = 1;
    if (scrollSpeed >= SCROLL_SPEED_FAST) {
      scrollAmount = 3;
    } else if (scrollSpeed >= SCROLL_SPEED_MEDIUM) {
      scrollAmount = 2;
    }
    
    // Calculate distance from current baseline
    // Positive distance = scrolled down, Negative distance = scrolled up
    const distanceFromBaseline = currentBaseline - offsetY;
    
    // Calculate how many thresholds we've crossed
    if (distanceFromBaseline >= SCROLL_THRESHOLD) {
      // Scrolled down - calculate how many packets to send
      const thresholdsCrossed = Math.floor(distanceFromBaseline / SCROLL_THRESHOLD);
      for (let i = 0; i < thresholdsCrossed; i++) {
        onScrollEvent(scrollAmount);
      }
      // Reset baseline to current position after sending all packets
      // This preserves any remainder distance for the next scroll event
      scrollInitialOffsetRef.current[side] = offsetY;
    } else if (distanceFromBaseline <= -SCROLL_THRESHOLD) {
      // Scrolled up - calculate how many packets to send
      const thresholdsCrossed = Math.floor(Math.abs(distanceFromBaseline) / SCROLL_THRESHOLD);
      for (let i = 0; i < thresholdsCrossed; i++) {
        onScrollEvent(-scrollAmount);
      }
      // Reset baseline to current position after sending all packets
      // This preserves any remainder distance for the next scroll event
      scrollInitialOffsetRef.current[side] = offsetY;
    }
    
    // Update tracking refs for next speed calculation
    lastScrollOffsetRef.current[side] = offsetY;
    scrollLastTimeRef.current[side] = now;
    scrollLastPositionRef.current[side] = offsetY;
    
    // Handle infinite scroll wrapping
    const contentHeight = scrollContentHeightRef.current;
    const viewportHeight = touchpadDimension;
    const wrapThreshold = 200; // Increased threshold to avoid premature wrapping
    
    // Wrap to bottom if near top
    if (offsetY < wrapThreshold) {
      scrollWrapInProgressRef.current[side] = true;
      setTimeout(() => {
        const wrappedOffset = contentHeight - viewportHeight - wrapThreshold;
        scrollRef.current?.scrollTo({
          y: wrappedOffset,
          animated: false,
        });
        scrollOffsetRef.current[side] = wrappedOffset;
        lastScrollOffsetRef.current[side] = wrappedOffset;
        // Reset initial offset to wrapped position so next scroll starts fresh
        scrollInitialOffsetRef.current[side] = wrappedOffset;
        // Reset timing refs to avoid incorrect speed calculations after wrapping
        scrollLastTimeRef.current[side] = Date.now();
        scrollLastPositionRef.current[side] = wrappedOffset;
        scrollWrapInProgressRef.current[side] = false;
      }, 0);
    }
    // Wrap to top if near bottom
    else if (offsetY > contentHeight - viewportHeight - wrapThreshold) {
      scrollWrapInProgressRef.current[side] = true;
      setTimeout(() => {
        const wrappedOffset = wrapThreshold;
        scrollRef.current?.scrollTo({
          y: wrappedOffset,
          animated: false,
        });
        scrollOffsetRef.current[side] = wrappedOffset;
        lastScrollOffsetRef.current[side] = wrappedOffset;
        // Reset initial offset to wrapped position so next scroll starts fresh
        scrollInitialOffsetRef.current[side] = wrappedOffset;
        // Reset timing refs to avoid incorrect speed calculations after wrapping
        scrollLastTimeRef.current[side] = Date.now();
        scrollLastPositionRef.current[side] = wrappedOffset;
        scrollWrapInProgressRef.current[side] = false;
      }, 0);
    }
  };

  const handleScrollBeginDrag = (side: 'left' | 'right') => {
    setIsScrolling(side);
    // Initialize the baseline position for threshold-based scrolling
    const currentOffset = scrollOffsetRef.current[side];
    scrollInitialOffsetRef.current[side] = currentOffset;
    lastScrollOffsetRef.current[side] = currentOffset;
    // Initialize timing refs for speed calculation
    scrollLastTimeRef.current[side] = Date.now();
    scrollLastPositionRef.current[side] = currentOffset;
  };

  const handleScrollEndDrag = () => {
    // Immediately stop all scrolling
    setIsScrolling(null);
    
    // Reset all scroll state to prevent any residual scrolling
    lastScrollOffsetRef.current.left = null;
    lastScrollOffsetRef.current.right = null;
    scrollInitialOffsetRef.current.left = null;
    scrollInitialOffsetRef.current.right = null;
    scrollLastTimeRef.current.left = null;
    scrollLastTimeRef.current.right = null;
    scrollLastPositionRef.current.left = null;
    scrollLastPositionRef.current.right = null;
  };

  // Initialize scroll positions to middle for infinite scroll
  useEffect(() => {
    const initialOffset = scrollContentHeightRef.current / 2;
    setTimeout(() => {
      leftScrollRef.current?.scrollTo({ y: initialOffset, animated: false });
      rightScrollRef.current?.scrollTo({ y: initialOffset, animated: false });
      scrollOffsetRef.current.left = initialOffset;
      scrollOffsetRef.current.right = initialOffset;
    }, 100);
  }, []);

  // Scrollable content component for infinite scroll feel
  const ScrollableContent = ({ side }: { side: 'left' | 'right' }) => {
    // Create a long scrollable content that looks like a page
    const contentHeight = scrollContentHeightRef.current;
    const items = Array.from({ length: Math.ceil(contentHeight / 50) }, (_, i) => i);
    
    return (
      <View style={{ height: contentHeight, backgroundColor: 'transparent' }}>
        {items.map((item, index) => {
          // Create visual content that looks like scrolling a page
          const isEven = index % 2 === 0;
          return (
            <View
              key={index}
              style={{
                height: 50,
                borderBottomWidth: 1,
                borderBottomColor: isEven ? 'rgba(57, 255, 20, 0.2)' : 'rgba(57, 255, 20, 0.1)',
                justifyContent: 'center',
                paddingLeft: 8,
              }}
            >
              <View
                style={{
                  width: isEven ? '80%' : '60%',
                  height: 2,
                  backgroundColor: '#39ff14',
                  opacity: isEven ? 0.6 : 0.3,
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
        {/* Left scroll wheel - scrollable area */}
        <ScrollView
          ref={leftScrollRef}
          onScroll={(e) => handleScroll('left', e)}
          onScrollBeginDrag={() => handleScrollBeginDrag('left')}
          onScrollEndDrag={handleScrollEndDrag}
          scrollEventThrottle={1}
          showsVerticalScrollIndicator={false}
          decelerationRate={0}
          bounces={false}
          style={{
            width: scrollWheelWidth,
            height: touchpadDimension,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderColor: '#39ff14',
            borderRadius: 8,
            marginRight: 4, // Gap between scroll wheel and touchpad
          }}
          contentContainerStyle={{
            paddingVertical: 0,
          }}
        >
          <ScrollableContent side="left" />
        </ScrollView>
        
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
        
        {/* Right scroll wheel - scrollable area */}
        <ScrollView
          ref={rightScrollRef}
          onScroll={(e) => handleScroll('right', e)}
          onScrollBeginDrag={() => handleScrollBeginDrag('right')}
          onScrollEndDrag={handleScrollEndDrag}
          scrollEventThrottle={1}
          showsVerticalScrollIndicator={false}
          decelerationRate={0}
          bounces={false}
          style={{
            width: scrollWheelWidth,
            height: touchpadDimension,
            backgroundColor: 'transparent',
            borderWidth: 2,
            borderColor: '#39ff14',
            borderRadius: 8,
            marginLeft: 4, // Gap between scroll wheel and touchpad
          }}
          contentContainerStyle={{
            paddingVertical: 0,
          }}
        >
          <ScrollableContent side="right" />
        </ScrollView>
      </View>
      
      {/* Keyboard Input - always shown, with duplicate in accessory view on iOS */}
      <View style={{ width: '100%', marginTop: 24, paddingHorizontal: 20 }}>
          {/* Main input - always visible, but on iOS we'll show the accessory view when keyboard is open */}
          <TextInput
            ref={keyboardInputRef}
            style={{
              backgroundColor: '#222',
              color: '#fff',
              padding: 12,
              borderRadius: 8,
              fontSize: 16,
              borderWidth: 2,
              borderColor: '#39ff14',
              minHeight: 50,
              textAlignVertical: 'top',
            }}
            value={keyboardText}
            onChangeText={onKeyboardTextChange}
            onKeyPress={(e) => {
              // Handle backspace in Raw mode even when text is empty
              if (!chatMode && e.nativeEvent.key === 'Backspace') {
                onSendKey('backspace');
              }
            }}
            placeholder={chatMode ? "Type here... (press Send to send all at once)" : "Inputs are immediately sent to device"}
            placeholderTextColor="#666"
            multiline
            editable={true}
            autoCorrect={false}
            autoCapitalize="none"
            onSubmitEditing={() => {
              // Send Enter key
              onSendKey('enter');
            }}
            onFocus={() => {
              if (shouldPreventRefocusRef.current) {
                keyboardInputRef.current?.blur();
                return;
              }
              setIsMainInputFocused(true);
              // On iOS, when main input is focused, also focus the accessory input
              // so the text appears in the accessory view
              if (Platform.OS === 'ios') {
                setTimeout(() => {
                  if (!shouldPreventRefocusRef.current) {
                    keyboardInputAccessoryRef.current?.focus();
                  }
                }, 50);
              }
            }}
            onBlur={() => {
              setIsMainInputFocused(false);
            }}
            {...(Platform.OS === 'ios' ? { inputAccessoryViewID } : {})}
          />
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID={inputAccessoryViewID}>
              <View style={{ 
                backgroundColor: '#222', 
                borderTopWidth: 1, 
                borderTopColor: '#444',
                paddingVertical: 8,
                paddingHorizontal: 16,
              }}>
                {/* Text input row - full width with Send button on right in Chat Mode */}
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'flex-start', 
                  gap: 8,
                  marginBottom: 8,
                }}>
                  <TextInput
                    ref={keyboardInputAccessoryRef}
                    style={{
                      flex: 1,
                      backgroundColor: '#111',
                      color: '#fff',
                      padding: 10,
                      borderRadius: 6,
                      fontSize: 16,
                      borderWidth: 1,
                      borderColor: '#39ff14',
                      maxHeight: 100,
                      textAlignVertical: 'top',
                    }}
                    value={keyboardText}
                    onChangeText={onKeyboardTextChange}
                    onKeyPress={(e) => {
                      // Handle backspace in Raw mode even when text is empty
                      if (!chatMode && e.nativeEvent.key === 'Backspace') {
                        onSendKey('backspace');
                      }
                    }}
                    placeholder={chatMode ? "Type here..." : "Inputs are immediately sent to device"}
                    placeholderTextColor="#666"
                    multiline
                    editable={true}
                    autoCorrect={false}
                    autoCapitalize="none"
                    onSubmitEditing={() => {
                      if (chatMode && keyboardText.trim().length > 0) {
                        onSendBatchText(keyboardText);
                      }
                    }}
                    onFocus={() => {
                      if (shouldPreventRefocusRef.current) {
                        keyboardInputAccessoryRef.current?.blur();
                        return;
                      }
                      setIsAccessoryInputFocused(true);
                    }}
                    onBlur={() => {
                      setIsAccessoryInputFocused(false);
                    }}
                  />
                  {/* Send button (only in Chat Mode) - on right side of text bar */}
                  {chatMode && (
                    <Pressable
                      onPress={() => {
                        if (keyboardText.trim().length > 0) {
                          onSendBatchText(keyboardText);
                        }
                      }}
                      style={{
                        backgroundColor: '#39ff14',
                        paddingHorizontal: 16,
                        paddingVertical: 10,
                        borderRadius: 6,
                        alignSelf: 'flex-start',
                      }}
                    >
                      <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Send</Text>
                    </Pressable>
                  )}
                </View>
                {/* Bottom row: Mode Toggle on left, Dismiss on right */}
                <View style={{ 
                  flexDirection: 'row', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                }}>
                  {/* Mode Toggle */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: '#fff', fontSize: 12 }}>Raw</Text>
                    <Switch
                      value={chatMode}
                      onValueChange={onChatModeChange}
                      trackColor={{ false: '#555', true: '#39ff14' }}
                      thumbColor={chatMode ? '#fff' : '#ccc'}
                    />
                    <Text style={{ color: '#fff', fontSize: 12 }}>Chat</Text>
                  </View>
                  {/* Dismiss button - hugging right */}
                  <Pressable
                    onPress={() => {
                      // Prevent refocusing temporarily
                      shouldPreventRefocusRef.current = true;
                      
                      // Blur all inputs
                      keyboardInputAccessoryRef.current?.blur();
                      keyboardInputRef.current?.blur();
                      
                      // Dismiss keyboard
                      Keyboard.dismiss();
                      
                      // Re-enable refocusing after a short delay
                      setTimeout(() => {
                        shouldPreventRefocusRef.current = false;
                      }, 500);
                    }}
                    style={{
                      backgroundColor: '#39ff14',
                      paddingHorizontal: 20,
                      paddingVertical: 8,
                      borderRadius: 6,
                    }}
                  >
                    <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Dismiss</Text>
                  </Pressable>
                </View>
              </View>
            </InputAccessoryView>
          )}
          {Platform.OS === 'android' && (
            <View style={{ marginTop: 8 }}>
              {/* Text input row - full width with Send button on right in Chat Mode */}
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'flex-start', 
                gap: 8,
                marginBottom: 8,
              }}>
                <TextInput
                  ref={keyboardInputRef}
                  style={{
                    flex: 1,
                    backgroundColor: '#222',
                    color: '#fff',
                    padding: 12,
                    borderRadius: 8,
                    fontSize: 16,
                    borderWidth: 2,
                    borderColor: '#39ff14',
                    minHeight: 50,
                    textAlignVertical: 'top',
                  }}
                  value={keyboardText}
                  onChangeText={onKeyboardTextChange}
                  onKeyPress={(e) => {
                    // Handle backspace in Raw mode even when text is empty
                    if (!chatMode && e.nativeEvent.key === 'Backspace') {
                      onSendKey('backspace');
                    }
                  }}
                  placeholder={chatMode ? "Type here... (press Send to send all at once)" : "Inputs are immediately sent to device"}
                  placeholderTextColor="#666"
                  multiline
                  editable={true}
                  autoCorrect={false}
                  autoCapitalize="none"
                  onSubmitEditing={() => {
                    if (chatMode && keyboardText.trim().length > 0) {
                      onSendBatchText(keyboardText);
                    }
                  }}
                />
                {/* Send button (only in Chat Mode) - on right side of text bar */}
                {chatMode && (
                  <Pressable
                    onPress={() => {
                      if (keyboardText.trim().length > 0) {
                        onSendBatchText(keyboardText);
                      }
                    }}
                    style={{
                      backgroundColor: '#39ff14',
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      borderRadius: 6,
                      alignSelf: 'flex-start',
                    }}
                  >
                    <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Send</Text>
                  </Pressable>
                )}
              </View>
              {/* Bottom row: Mode Toggle on left, Dismiss on right */}
              <View style={{ 
                flexDirection: 'row', 
                alignItems: 'center', 
                justifyContent: 'space-between',
              }}>
                {/* Mode Toggle */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={{ color: '#fff', fontSize: 12 }}>Raw</Text>
                  <Switch
                    value={chatMode}
                    onValueChange={onChatModeChange}
                    trackColor={{ false: '#555', true: '#39ff14' }}
                    thumbColor={chatMode ? '#fff' : '#ccc'}
                  />
                  <Text style={{ color: '#fff', fontSize: 12 }}>Chat</Text>
                </View>
                {/* Dismiss button - hugging right */}
                <Pressable
                  onPress={() => {
                    // Prevent refocusing temporarily
                    shouldPreventRefocusRef.current = true;
                    
                    // Blur input
                    keyboardInputRef.current?.blur();
                    
                    // Dismiss keyboard
                    Keyboard.dismiss();
                    
                    // Re-enable refocusing after a short delay
                    setTimeout(() => {
                      shouldPreventRefocusRef.current = false;
                    }, 500);
                  }}
                  style={{
                    backgroundColor: '#39ff14',
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    borderRadius: 6,
                  }}
                >
                  <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Dismiss</Text>
                </Pressable>
              </View>
            </View>
          )}
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
  // mDNS discovered URLs
  const [magnetoWsUrl, setMagnetoWsUrl] = useState<string>(FALLBACK_MAGNETO_WS_URL);
  const [mouseWsUrl, setMouseWsUrl] = useState<string>(''); // No fallback - must be discovered
  const [mdnsStatus, setMdnsStatus] = useState<string>('Discovering...');
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const zeroconfRef = useRef<any | null>(null);
  
  // Magnetometer -> Python streaming
  const magnetoWsRef = useRef<WebSocket | null>(null);
  const [magnetoStreaming, setMagnetoStreaming] = useState(false);
  
  // Mouse control -> Python streaming
  const mouseWsRef = useRef<WebSocket | null>(null);
  const [mouseControlActive, setMouseControlActive] = useState(false);
  const [touchpadVisible, setTouchpadVisible] = useState(false);
  
  // Keyboard input -> Python streaming
  const [keyboardText, setKeyboardText] = useState('');
  const [chatMode, setChatMode] = useState(true); // false = Raw Mode, true = Chat Mode (default to Chat)
  const lastKeyboardTextRef = React.useRef<string>('');
  
  // Clear text when switching to Raw mode
  const handleChatModeChange = (enabled: boolean) => {
    setChatMode(enabled);
    if (!enabled) {
      // Switching to Raw mode - clear the text
      setKeyboardText('');
      lastKeyboardTextRef.current = '';
    }
  };
  
  // Keep ref in sync with keyboardText
  React.useEffect(() => {
    lastKeyboardTextRef.current = keyboardText;
  }, [keyboardText]);
  
  // Service discovery using HTTP discovery endpoint
  // The Python server provides an HTTP endpoint at /discover for service discovery
  const discoverServices = React.useCallback(async () => {
    // Don't discover if we already have the mouse service URL
    if (mouseWsUrl) {
      return;
    }
    
    if (isDiscovering) return; // Prevent concurrent discoveries
    
    setIsDiscovering(true);
    setMdnsStatus('Discovering services...');
      
      // Extract service names from mDNS service types
      // MOUSE_SERVICE_TYPE = "_pymouse._tcp.local." -> service name is "pymouse"
      // MAGNETO_SERVICE_TYPE = "_magneto._tcp.local." -> service name is "magneto"
      const mouseServiceName = MOUSE_SERVICE_TYPE.split('_')[1].split('.')[0]; // "pymouse"
      const magnetoServiceName = MAGNETO_SERVICE_TYPE.split('_')[1].split('.')[0]; // "magneto"
      
      // Discovery ports for each service
      const mouseDiscoveryPort = 8767; // HTTP discovery port for mouse service
      const magnetoDiscoveryPort = 8768; // HTTP discovery port for magnetometer service
      
      // Helper to try discovering a service at a specific IP
      const tryDiscoverService = async (
        ip: string,
        port: number,
        serviceName: string,
        serviceType: string
      ): Promise<string | null> => {
        try {
          const discoveryUrl = `http://${ip}:${port}/discover`;
          const controller = new AbortController();
          
          // Faster timeout (500ms) for quicker discovery
          const timeoutId = setTimeout(() => controller.abort(), 500);
          
          const response = await fetch(discoveryUrl, {
            method: 'GET',
            signal: controller.signal,
          });
          
          clearTimeout(timeoutId);
          
          if (response.ok) {
            const data = await response.json();
            if (data.service === serviceName && data.ws_url) {
              // Don't log here - let the caller log once
              return data.ws_url;
            }
          }
        } catch (e: any) {
          // Silently fail - we'll try many IPs in parallel
        }
        return null;
      };
      
      // Build list of IPs to try - optimized for speed
      const ipsToTry: string[] = [];
      
      // First, try the most likely IP (previously in fallback)
      const likelyIP = '172.20.10.3';
      ipsToTry.push(likelyIP);
      
      // Then add a smaller set of common IP ranges (reduced for speed)
      const commonIPRanges = [
        '172.20.10.3',  // Common hotspot IP (already added)
        '192.168.1.1',  // Common router IP
        '192.168.0.1',  // Alternative router IP
      ];
      
      for (const baseIP of commonIPRanges) {
        const ipParts = baseIP.split('.');
        const base = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
        // Scan only first 3 IPs per range for speed (reduced from 5)
        for (let i = 1; i <= 3; i++) {
          const testIP = `${base}.${i}`;
          if (!ipsToTry.includes(testIP)) {
            ipsToTry.push(testIP);
          }
        }
      }
      
      let discoveredMouseUrl: string | null = null;
      let discoveredMagnetoUrl: string | null = null;
      let mouseLogged = false;
      let magnetoLogged = false;
      
      // Try most likely IP first (fast path)
      const [likelyMouse, likelyMagneto] = await Promise.all([
        tryDiscoverService(likelyIP, mouseDiscoveryPort, mouseServiceName, MOUSE_SERVICE_TYPE),
        tryDiscoverService(likelyIP, magnetoDiscoveryPort, magnetoServiceName, MAGNETO_SERVICE_TYPE),
      ]);
      
      if (likelyMouse) {
        discoveredMouseUrl = likelyMouse;
        if (!mouseLogged) {
          console.log(`[Discovery] Found ${MOUSE_SERVICE_TYPE} service at ${likelyMouse}`);
          mouseLogged = true;
        }
      }
      if (likelyMagneto) {
        discoveredMagnetoUrl = likelyMagneto;
        if (!magnetoLogged) {
          console.log(`[Discovery] Found ${MAGNETO_SERVICE_TYPE} service at ${likelyMagneto}`);
          magnetoLogged = true;
        }
      }
      
      // If we found both on the likely IP, we're done!
      if (!discoveredMouseUrl || !discoveredMagnetoUrl) {
        // Try remaining IPs in parallel with higher concurrency
        // But only if we still need to find something
        const remainingIPs = ipsToTry.filter(ip => ip !== likelyIP);
        const MAX_CONCURRENT = 12; // Increased concurrency for faster scanning
        
        // Process in chunks so we can stop early if we find what we need
        for (let i = 0; i < remainingIPs.length; i += MAX_CONCURRENT) {
          const chunk = remainingIPs.slice(i, i + MAX_CONCURRENT);
          
          const promises = chunk.flatMap(ip => [
            !discoveredMouseUrl 
              ? tryDiscoverService(ip, mouseDiscoveryPort, mouseServiceName, MOUSE_SERVICE_TYPE)
                  .then(url => { 
                    if (url && !discoveredMouseUrl) {
                      discoveredMouseUrl = url;
                      if (!mouseLogged) {
                        console.log(`[Discovery] Found ${MOUSE_SERVICE_TYPE} service at ${url}`);
                        mouseLogged = true;
                      }
                    }
                    return url; 
                  })
              : Promise.resolve(null),
            !discoveredMagnetoUrl
              ? tryDiscoverService(ip, magnetoDiscoveryPort, magnetoServiceName, MAGNETO_SERVICE_TYPE)
                  .then(url => { 
                    if (url && !discoveredMagnetoUrl) {
                      discoveredMagnetoUrl = url;
                      if (!magnetoLogged) {
                        console.log(`[Discovery] Found ${MAGNETO_SERVICE_TYPE} service at ${url}`);
                        magnetoLogged = true;
                      }
                    }
                    return url; 
                  })
              : Promise.resolve(null),
          ]);
          
          await Promise.all(promises);
          
          // Stop early if we found both services
          if (discoveredMouseUrl && discoveredMagnetoUrl) {
            break;
          }
        }
      }
      
      if (discoveredMouseUrl) {
        setMouseWsUrl(discoveredMouseUrl);
      } else {
        setMouseWsUrl(''); // No fallback for mouse service
        console.warn('[Discovery] Mouse service not found after scanning', ipsToTry.length, 'IPs');
      }
      
      if (discoveredMagnetoUrl) {
        setMagnetoWsUrl(discoveredMagnetoUrl);
      } else {
        setMagnetoWsUrl(FALLBACK_MAGNETO_WS_URL);
      }
      
      if (discoveredMouseUrl && discoveredMagnetoUrl) {
        const discoveredIP = (discoveredMouseUrl as string).split(':')[1].slice(2);
        setMdnsStatus(`Discovered services at ${discoveredIP}`);
      } else if (discoveredMouseUrl) {
        const discoveredIP = (discoveredMouseUrl as string).split(':')[1].slice(2);
        setMdnsStatus(`Mouse service found at ${discoveredIP} (magneto using fallback)`);
      } else if (discoveredMagnetoUrl) {
        const discoveredIP = (discoveredMagnetoUrl as string).split(':')[1].slice(2);
        setMdnsStatus(`Magneto service found at ${discoveredIP} (mouse not found)`);
      } else {
        setMdnsStatus('Mouse service not found - ensure pymouse.py is running');
      }
      
      setIsDiscovering(false);
  }, [isDiscovering, mouseWsUrl]);

  // mDNS discovery using native DNS-SD (react-native-zeroconf)
  useEffect(() => {
    if (!Zeroconf || Platform.OS === 'web') {
      return;
    }
    const zeroconf = new Zeroconf();
    zeroconfRef.current = zeroconf;
    const handleResolved = (service: any) => {
      try {
        const serviceName = (service.name || '').toLowerCase();
        const serviceType = (service.type || '').toLowerCase();
        const host =
          (service.addresses && service.addresses[0]) ||
          service.host ||
          '';
        const port = service.port;
        if (!host || !port) {
          return;
        }
        const wsUrl = `ws://${host}:${port}`;
        // Match pymouse service
        if (
          serviceName.includes('pymouse') ||
          serviceType.includes('pymouse')
        ) {
          setMouseWsUrl((prev) => prev || wsUrl);
          setMdnsStatus(`mDNS: Mouse service at ${host}:${port}`);
        }
        // Match magneto service
        if (
          serviceName.includes('magneto') ||
          serviceType.includes('magneto')
        ) {
          setMagnetoWsUrl((prev) => prev || wsUrl);
          setMdnsStatus(`mDNS: Magneto service at ${host}:${port}`);
        }
      } catch (e) {
        console.warn('[mDNS] Error handling resolved service', e);
      }
    };
    const handleError = (err: any) => {
      console.warn('[mDNS] Zeroconf error', err);
    };
    zeroconf.on('resolved', handleResolved);
    zeroconf.on('error', handleError);
    try {
      // Types here are without leading underscores: "pymouse" -> "_pymouse._tcp.local."
      zeroconf.scan('pymouse', 'tcp', 'local.');
      zeroconf.scan('magneto', 'tcp', 'local.');
      setMdnsStatus('Discovering services via mDNS...');
    } catch (e) {
      console.warn('[mDNS] Failed to start scan', e);
    }
    return () => {
      try {
        zeroconf.removeListener('resolved', handleResolved);
        zeroconf.removeListener('error', handleError);
        zeroconf.stop();
        zeroconf.close();
      } catch {
        // ignore
      }
      zeroconfRef.current = null;
    };
  }, []);
  
  // Initial discovery on mount - only if we don't have mouse service yet
  useEffect(() => {
    if (!mouseWsUrl && !isDiscovering) {
      discoverServices();
    }
  }, []); // Only run once on mount

  // Helper to kill all listeners
  // Store magnetometer subscription for streaming (separate from SensorsShowcase)
  const magSubRef = useRef<any>(null);
  const [magnetometerData, setMagnetometerData] = useState<{x: number, y: number, z: number} | null>(null);

  const connectMagnetoSocket = () => {
    if (magnetoWsRef.current && 
      (magnetoWsRef.current.readyState === WebSocket.OPEN || 
       magnetoWsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(magnetoWsUrl);
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
    if (!mouseWsUrl) {
      console.warn('[Mouse] No mouse service URL available - discovery may have failed');
      return;
    }

    if (mouseWsRef.current && 
      (mouseWsRef.current.readyState === WebSocket.OPEN || 
       mouseWsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      const ws = new WebSocket(mouseWsUrl);
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

  // Manage magnetometer subscription for streaming (independent of SensorsShowcase)
  useEffect(() => {
    if (!magnetoStreaming) {
      if (magSubRef.current) {
        try {
          magSubRef.current.remove();
        } catch {}
        magSubRef.current = null;
      }
      setMagnetometerData(null);
      return;
    }

    // Subscribe magnetometer for streaming
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
      if (magSubRef.current) {
        try {
          magSubRef.current.remove();
        } catch {}
        magSubRef.current = null;
      }
    };
  }, [magnetoStreaming]);

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
  }, [mouseControlActive, mouseWsUrl]);

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
            <SensorsShowcase styles={styles} />
          </CollapsibleSection>

          <CollapsibleSection title="UI/UX">
            <UIUXShowcase />
          </CollapsibleSection>

          <CollapsibleSection title="Rust core">
            <RustCoreShowcase />
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
              Streams magnetometer x / y / z over WebSocket to Python at {magnetoWsUrl}.
            </Text>
            <Text style={{ color: '#666', fontSize: 10, marginTop: 2, textAlign: 'center' }}>
              {mdnsStatus}
            </Text>
          </View>

          <View style={{ marginTop: 24, alignItems: 'center' }}>
            <Pressable
              onPress={() => {
                if (!mouseControlActive) {
                  if (!mouseWsUrl) {
                    setMdnsStatus('Mouse service not found - cannot start');
                    return;
                  }
                  setMouseControlActive(true);
                  setTouchpadVisible(true);
                } else {
                  setMouseControlActive(false);
                  setTouchpadVisible(false);
                }
              }}
              style={{
                backgroundColor: mouseControlActive ? '#43a047' : (!mouseWsUrl ? '#666' : '#222'),
                paddingHorizontal: 36,
                paddingVertical: 14,
                borderRadius: 32,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2,
                marginBottom: 4,
                opacity: !mouseWsUrl ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '600', fontSize: 18 }}>
                {mouseControlActive ? 'Stop Mouse Control' : (!mouseWsUrl ? 'Mouse Service Not Found' : 'Start Mouse Control')}
              </Text>
            </Pressable>
            <Text style={{ color: '#888', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              {mouseWsUrl ? `Control mouse via touchpad over WebSocket to Python at ${mouseWsUrl}.` : 'Mouse service discovery failed. Please ensure pymouse.py is running.'}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, gap: 8 }}>
              <Text style={{ color: '#666', fontSize: 10, textAlign: 'center' }}>
                {mdnsStatus}
              </Text>
              {!mouseWsUrl && (
                    <Pressable
                  onPress={discoverServices}
                  disabled={isDiscovering}
                      style={{
                    backgroundColor: isDiscovering ? '#444' : '#39ff14',
                        paddingHorizontal: 12,
                        paddingVertical: 4,
                        borderRadius: 4,
                    opacity: isDiscovering ? 0.5 : 1,
                      }}
                    >
                      <Text style={{ color: '#000', fontSize: 10, fontWeight: '600' }}>
                    {isDiscovering ? 'Discovering...' : 'Retry'}
                      </Text>
                    </Pressable>
                )}
              </View>
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
            keyboardText={keyboardText}
            onKeyboardTextChange={(newText) => {
              // Use ref to get the previous value to avoid stale closure issues
              const oldText = lastKeyboardTextRef.current;
              
              if (!chatMode) {
                // Raw Mode: send immediately, temporarily store text to keep keyboard open
                // Store it so keyboard stays visible, but clear it after a brief delay
                setKeyboardText(newText);
                lastKeyboardTextRef.current = newText;
                
                if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
                  try {
                    if (newText.length > oldText.length) {
                      // Text was added - send new characters
                      const addedChars = newText.slice(oldText.length);
                      for (const char of addedChars) {
                        const payload = JSON.stringify({
                          type: 'key',
                          t: Date.now(),
                          key: char,
                        });
                        mouseWsRef.current.send(payload);
                      }
                    } else if (newText.length < oldText.length) {
                      // Text was deleted - send backspace
                      const deletedCount = oldText.length - newText.length;
                      for (let i = 0; i < deletedCount; i++) {
                        const payload = JSON.stringify({
                          type: 'key',
                          t: Date.now(),
                          key: 'backspace',
                        });
                        mouseWsRef.current.send(payload);
                      }
                    } else if (newText !== oldText) {
                      // Text was modified in place
                      let i = 0;
                      while (i < Math.min(oldText.length, newText.length) && oldText[i] === newText[i]) {
                        i++;
                      }
                      const deletedFromPos = oldText.length - i;
                      
                      // Send backspaces for deleted characters
                      for (let j = 0; j < deletedFromPos; j++) {
                        const payload = JSON.stringify({
                          type: 'key',
                          t: Date.now(),
                          key: 'backspace',
                        });
                        mouseWsRef.current.send(payload);
                      }
                      // Send new characters
                      for (let j = i; j < newText.length; j++) {
                        const payload = JSON.stringify({
                          type: 'key',
                          t: Date.now(),
                          key: newText[j],
                        });
                        mouseWsRef.current.send(payload);
                      }
                    }
                  } catch (err) {
                    console.warn('[Keyboard] Failed to send keystroke', err);
                  }
                }
                // Clear text in Raw Mode after a delay to keep keyboard open
                // Only clear if text hasn't changed (user stopped typing)
                setTimeout(() => {
                  if (!chatMode && lastKeyboardTextRef.current === newText) {
                    setKeyboardText('');
                    lastKeyboardTextRef.current = '';
                  }
                }, 200);
              } else {
                // Chat Mode - store the text normally
                setKeyboardText(newText);
                lastKeyboardTextRef.current = newText;
              }
            }}
            onSendKey={(key) => {
              if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
                try {
                  const payload = JSON.stringify({
                  type: 'key',
                  t: Date.now(),
                  key,
                  });
                  mouseWsRef.current.send(payload);
                } catch (err) {
                  console.warn('[Keyboard] Failed to send key', err);
                }
              }
            }}
            onSendBatchText={(text) => {
              if (mouseWsRef.current && mouseWsRef.current.readyState === WebSocket.OPEN) {
                try {
                  const payload = JSON.stringify({
                  type: 'text_batch',
                  t: Date.now(),
                  text,
                  });
                  mouseWsRef.current.send(payload);
                  // Clear the text after sending
                  setKeyboardText('');
                  lastKeyboardTextRef.current = '';
                } catch (err) {
                  console.warn('[Keyboard] Failed to send batch text', err);
                }
              }
            }}
            chatMode={chatMode}
            onChatModeChange={handleChatModeChange}
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

