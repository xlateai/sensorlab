// Subscription type not exported from expo-sensors; use 'any' for sensor subscriptions
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, SafeAreaView, ScrollView, Dimensions, Modal, Pressable, TextInput, InputAccessoryView, Platform, Switch, Keyboard } from 'react-native';
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

// mDNS service types
const MAGNETO_SERVICE_TYPE = '_magneto._tcp.local.';
const MOUSE_SERVICE_TYPE = '_pymouse._tcp.local.';

// Fallback URLs (used if mDNS discovery fails)
const FALLBACK_MAGNETO_WS_URL = 'ws://172.20.10.3:8765';
// No fallback for mouse service - must be discovered

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
  const scrollIntervalRef = React.useRef<number | null>(null);
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

        // Then send coordinates at 30Hz for continuous updates
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
            
            // Send events based on current mode (only if position changed to avoid duplicates)
            if (touch.x !== lastSentRef.current.x || touch.y !== lastSentRef.current.y) {
              if (dragModeRef.current) {
                // Now in drag mode, send drag move
                onDragEvent('move', touch.x, touch.y);
              } else {
                // Still in normal touch mode
                onTouchEvent('move', touch.x, touch.y);
              }
              lastSentRef.current = { x: touch.x, y: touch.y };
            }
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
    
    // Send move events immediately for responsive mouse movement (trust higher precision)
    if (isTouching && currentTouchRef.current && lastSentRef.current && initialTouchRef.current) {
      const touch = currentTouchRef.current;
      // Reduced threshold for higher precision (0.001 instead of 0.02)
      const dx = Math.abs(touch.x - initialTouchRef.current.x);
      const dy = Math.abs(touch.y - initialTouchRef.current.y);
      if (dx > 0.001 || dy > 0.001) {
        hasMovedRef.current = true;
        
        // If pending drag mode and we've moved, activate drag mode
        if (pendingDragModeRef.current && !dragModeRef.current) {
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
        
        // Send move event immediately based on current mode
        if (dragModeRef.current) {
          onDragEvent('move', touch.x, touch.y);
        } else {
          onTouchEvent('move', touch.x, touch.y);
        }
        lastSentRef.current = { x: touch.x, y: touch.y };
      }
    }
    
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

  // Scroll wheel handlers - using ScrollView's native scroll events
  const handleScroll = (side: 'left' | 'right', event: any) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    const scrollRef = side === 'left' ? leftScrollRef : rightScrollRef;
    
    if (!scrollRef.current) return;
    
    // Track scroll offset
    scrollOffsetRef.current[side] = offsetY;
    
    // Calculate delta from last position
    if (scrollOriginYRef.current !== null) {
      const deltaY = scrollOriginYRef.current - offsetY;
      
      // Send scroll event if there's meaningful movement
      if (Math.abs(deltaY) > 0.5) {
        // Normalize and send scroll amount
        const scrollAmount = deltaY * 0.1;
        onScrollEvent(scrollAmount);
        scrollOriginYRef.current = offsetY;
      }
    } else {
      scrollOriginYRef.current = offsetY;
    }
    
    // Handle infinite scroll wrapping
    const contentHeight = scrollContentHeightRef.current;
    const viewportHeight = touchpadDimension;
    const wrapThreshold = 100; // Distance from edges to trigger wrap
    
    // Wrap to bottom if near top
    if (offsetY < wrapThreshold && scrollOffsetRef.current[side] < wrapThreshold) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: contentHeight - viewportHeight - wrapThreshold,
          animated: false,
        });
        scrollOffsetRef.current[side] = contentHeight - viewportHeight - wrapThreshold;
        scrollOriginYRef.current = scrollOffsetRef.current[side];
      }, 0);
    }
    // Wrap to top if near bottom
    else if (offsetY > contentHeight - viewportHeight - wrapThreshold && 
             scrollOffsetRef.current[side] > contentHeight - viewportHeight - wrapThreshold) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({
          y: wrapThreshold,
          animated: false,
        });
        scrollOffsetRef.current[side] = wrapThreshold;
        scrollOriginYRef.current = scrollOffsetRef.current[side];
      }, 0);
    }
  };

  const handleScrollBeginDrag = (side: 'left' | 'right') => {
    setIsScrolling(side);
    // Initialize origin from current scroll offset
    const currentOffset = scrollOffsetRef.current[side];
    scrollOriginYRef.current = currentOffset;
  };

  const handleScrollEndDrag = () => {
    setIsScrolling(null);
    scrollOriginYRef.current = null;
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
          onMomentumScrollEnd={handleScrollEndDrag}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
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
          onMomentumScrollEnd={handleScrollEndDrag}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
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

  // mDNS discovered URLs
  const [magnetoWsUrl, setMagnetoWsUrl] = useState<string>(FALLBACK_MAGNETO_WS_URL);
  const [mouseWsUrl, setMouseWsUrl] = useState<string>(''); // No fallback - must be discovered
  const [mdnsStatus, setMdnsStatus] = useState<string>('Discovering...');
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  
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
  
  // Initial discovery on mount - only if we don't have mouse service yet
  useEffect(() => {
    if (!mouseWsUrl && !isDiscovering) {
      discoverServices();
    }
  }, []); // Only run once on mount

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
