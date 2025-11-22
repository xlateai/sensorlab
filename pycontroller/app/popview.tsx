import React, { useRef, useState, useEffect } from 'react';
import { Animated, Easing, Dimensions, View, Pressable, Text } from 'react-native';
import Settings from './widgets/settings';
import Notes from './widgets/notes';
import TypeRacerScreen from './subapps/renshu/typeracer';
import Browser from './widgets/browser';
import { playChimeHaptic, playReverseChime } from './haptics';
import { useDeviceOrientation } from './orientation';

interface PopViewProps {
  isVisible: boolean;
  selectedNeedle: number | null;
  currentPixel: string;
  onClose: () => void;
  orbPositionY: Animated.Value;
}

// Height percentage configuration for each component
// 0% = viewport center (50%), 100% = full screen (0%)
const HEIGHT_PERCENTAGES: { [key: number]: number } = {
  0: 0.75,  // Settings: 75%
  1: 0.75,  // Notes: 75%
  2: 0.75,  // Renshu (TypeRacerScreen): 75%
  3: 0.75,  // Browser: 75%
};

export default function PopView({
  isVisible,
  selectedNeedle,
  currentPixel,
  onClose,
  orbPositionY,
}: PopViewProps) {
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    
    return () => subscription?.remove();
  }, []);
  
  const screenHeight = dimensions.height;
  
  // Get height percentage for current component, default to 0.7 (70%)
  const heightPercentage = selectedNeedle !== null 
    ? (HEIGHT_PERCENTAGES[selectedNeedle] ?? 0.7)
    : 0.7;
  
  // Calculate menu dimensions based on height percentage
  // 0% = viewport center (50%), 100% = full screen (0%)
  const menuTop = screenHeight * (1 - heightPercentage);
  const menuHeight = screenHeight * heightPercentage;
  
  // Menu animation state
  const menuSlideAnim = useRef(new Animated.Value(menuHeight * 0.1)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  
  const isManuallyClosingRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const hasMountedRef = useRef(false);
  
  // Track press state for quick tap detection
  const pressStartTimeRef = useRef<number | null>(null);
  const pressMovedRef = useRef<boolean>(false);
  const pressStartPositionRef = useRef<{ x: number; y: number } | null>(null);

  // Use custom orientation detection hook
  const isBrowser = selectedNeedle === 3;
  const { orientation, rotationDeg, isLandscape } = useDeviceOrientation(isVisible && isBrowser);
  const rotationAnim = useRef(new Animated.Value(0)).current;

  // Update rotation animation when orientation changes
  useEffect(() => {
    rotationAnim.setValue(rotationDeg);
  }, [rotationDeg]);

  // Handle menu open animation
  useEffect(() => {
    if (isVisible && selectedNeedle !== null && !isAnimatingRef.current) {
      hasMountedRef.current = true;
      isAnimatingRef.current = true;
      
      // Stop ongoing orb animation
      orbPositionY.stopAnimation();
      
      // Play chime haptic when opening popview
      playChimeHaptic();
      
      // Start from -10% y offset and 0 opacity, then animate in
      const startY = menuHeight * 0.1;
      menuSlideAnim.setValue(startY);
      menuOpacity.setValue(0);
      
      // Animate menu slide and opacity, and orb position simultaneously
      Animated.parallel([
        Animated.timing(menuSlideAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        Animated.timing(menuOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }),
        // Animate orb from center (0) to top (1) - fast and fluid
        Animated.timing(orbPositionY, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.out(Easing.cubic),
        }),
      ]).start(() => {
        // Ensure final state: orb at top position
        orbPositionY.setValue(1);
        isAnimatingRef.current = false;
      });
    }
  }, [isVisible, selectedNeedle]);

  // Handle menu close animation
  useEffect(() => {
    // Only run if we've mounted and the menu was previously visible (not on initial load)
    if (!isVisible && hasMountedRef.current && !isManuallyClosingRef.current && !isAnimatingRef.current) {
      isAnimatingRef.current = true;
      
      // Stop ongoing orb animation
      orbPositionY.stopAnimation();
      
      // Animate orb from top (1) back to center (0) - fast and fluid
      Animated.timing(orbPositionY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }).start(() => {
        // Ensure final state: orb at center position
        orbPositionY.setValue(0);
        isAnimatingRef.current = false;
      });
    }
  }, [isVisible]);

  // Close menu handler
  const handleClose = () => {
    if (isAnimatingRef.current) return; // Prevent rapid clicks
    
    isManuallyClosingRef.current = true;
    isAnimatingRef.current = true;
    
    // Play reverse chime haptic when closing popview
    playReverseChime();
    
    // Stop ongoing orb animation
    orbPositionY.stopAnimation();
    
    // Animate menu closing: slide down and fade out, and orb position simultaneously
    const endY = menuHeight * 0.1;
    
    Animated.parallel([
      Animated.timing(menuSlideAnim, {
        toValue: endY,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.ease),
      }),
      Animated.timing(menuOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
        easing: Easing.in(Easing.ease),
      }),
      // Animate orb from top (1) back to center (0) - fast and fluid
      Animated.timing(orbPositionY, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
    ]).start(() => {
      // Ensure final state: orb at center position
      orbPositionY.setValue(0);
      menuSlideAnim.setValue(0);
      menuOpacity.setValue(0);
      isManuallyClosingRef.current = false;
      isAnimatingRef.current = false;
      onClose();
    });
  };

  // Handle press start for quick tap detection
  const handlePressIn = (event: any) => {
    pressStartTimeRef.current = Date.now();
    pressMovedRef.current = false;
    const { pageX, pageY } = event.nativeEvent;
    pressStartPositionRef.current = { x: pageX, y: pageY };
  };

  // Handle press end - only dismiss if it was a quick tap without movement
  const handlePressOut = () => {
    if (pressStartTimeRef.current === null) return;
    
    const pressDuration = Date.now() - pressStartTimeRef.current;
    const MAX_TAP_DURATION = 200; // Maximum 200ms for a "quick tap"
    const MAX_MOVE_DISTANCE = 10; // Maximum 10 pixels movement
    
    // Check if finger moved
    let movedTooMuch = false;
    if (pressStartPositionRef.current) {
      // We can't get end position from onPressOut, so we rely on pressMovedRef
      movedTooMuch = pressMovedRef.current;
    }
    
    // Only dismiss if it was a quick tap and didn't move
    if (pressDuration < MAX_TAP_DURATION && !movedTooMuch && !pressMovedRef.current) {
      handleClose();
    }
    
    // Reset press state
    pressStartTimeRef.current = null;
    pressMovedRef.current = false;
    pressStartPositionRef.current = null;
  };

  // Handle touch move - mark as moved if finger moves
  const handleTouchMove = (event: any) => {
    if (pressStartPositionRef.current && pressStartTimeRef.current !== null) {
      const { pageX, pageY } = event.nativeEvent;
      const dx = Math.abs(pageX - pressStartPositionRef.current.x);
      const dy = Math.abs(pageY - pressStartPositionRef.current.y);
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      // Mark as moved if moved more than 10 pixels
      if (distance > 10) {
        pressMovedRef.current = true;
      }
    }
  };

  if (selectedNeedle === null) {
    return null;
  }

  return (
    <>
      {/* Transparent overlay to detect taps outside menu - only in top area above menu */}
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: menuTop, // Top area above menu
          backgroundColor: 'transparent',
          opacity: isVisible ? 1 : 0,
          pointerEvents: isVisible ? 'auto' : 'none',
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onTouchMove={handleTouchMove}
      />
      {/* Slide-up menu */}
      {/* Glow effect behind popover */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: -4,
          left: -2,
          right: -2,
          top: menuTop - 8,
          borderTopLeftRadius: 35,
          borderTopRightRadius: 35,
          backgroundColor: 'transparent',
          opacity: menuOpacity,
          shadowColor: currentPixel,
          shadowOffset: { width: 0, height: -12 },
          shadowOpacity: 0.8,
          shadowRadius: 35,
          transform: [
            { translateY: menuSlideAnim },
          ],
        }}
        pointerEvents="none"
      />
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          top: menuTop, // Dynamic top position based on height percentage
          backgroundColor: '#000',
          borderTopLeftRadius: 35,
          borderTopRightRadius: 35,
          opacity: menuOpacity,
          shadowColor: currentPixel,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          transform: [
            { translateY: menuSlideAnim },
          ],
          overflow: 'hidden',
        }}
        pointerEvents={isVisible ? "auto" : "none"}
      >
        <View
          style={{
            flex: 1,
            paddingBottom: screenHeight * 0.066, // Reserve bottom ~6.6% for black region
          }}
          pointerEvents={isVisible ? "auto" : "none"}
        >
          {selectedNeedle === 0 && <Settings />}
          {selectedNeedle === 1 && <Notes />}
          {selectedNeedle === 2 && <TypeRacerScreen isVisible={isVisible} />}
          {selectedNeedle === 3 && (() => {
            // Calculate available container dimensions
            const containerWidth = dimensions.width;
            const containerHeight = menuHeight - (screenHeight * 0.066);
            
            // When rotated, swap dimensions to fit
            const browserWidth = isLandscape ? containerHeight : containerWidth;
            const browserHeight = isLandscape ? containerWidth : containerHeight;
            
            return (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                }}
              >
                <Animated.View
                  style={{
                    width: browserWidth,
                    height: browserHeight,
                    transform: [
                      { rotate: rotationAnim.interpolate({
                        inputRange: [-90, 0, 90],
                        outputRange: ['-90deg', '0deg', '90deg'],
                      })},
                    ],
                  }}
                >
                  <Browser isVisible={isVisible} isLandscape={isLandscape} orientation={orientation} />
                </Animated.View>
              </View>
            );
          })()}
        </View>
        {/* Border overlay that always sits on top */}
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderTopLeftRadius: 35,
            borderTopRightRadius: 35,
            borderWidth: 1,
            borderColor: currentPixel,
            pointerEvents: 'none',
            zIndex: 10000,
          }}
        />
      </Animated.View>
      {/* Black region at bottom ~6.6% */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: screenHeight * 0.066,
          backgroundColor: '#000',
          opacity: menuOpacity,
          transform: [
            { translateY: menuSlideAnim },
          ],
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
        pointerEvents={isVisible ? "box-none" : "none"}
      >
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onTouchMove={handleTouchMove}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 12,
            minWidth: 120,
            minHeight: 44,
            marginTop: -8,
            zIndex: 1001,
          }}
        >
          <Text style={{ color: '#888', fontWeight: '500', fontSize: 15, textAlign: 'center' }}>Dismiss</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}
