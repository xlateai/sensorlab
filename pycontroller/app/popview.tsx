import React, { useRef, useState, useEffect } from 'react';
import { Animated, Easing, Dimensions, View, Pressable, Text } from 'react-native';
import Settings from './widgets/settings';
import Notes from './widgets/notes';
import TypeRacerScreen from './subapps/renshu/typeracer';
import { playChimeHaptic, playReverseChime } from './haptics';

interface PopViewProps {
  isVisible: boolean;
  selectedNeedle: number | null;
  currentPixel: string;
  onClose: () => void;
  onOrbStateChange?: (centerVisible: boolean, topVisible: boolean) => void;
  orbCenterOpacity?: Animated.Value;
  orbCenterScale?: Animated.Value;
  orbTopOpacity?: Animated.Value;
  orbTopScale?: Animated.Value;
}

// Height percentage configuration for each component
// 0% = viewport center (50%), 100% = full screen (0%)
const HEIGHT_PERCENTAGES: { [key: number]: number } = {
  0: 0.75,  // Settings: 60%
  1: 0.75,  // Notes: 70% (default, can be adjusted)
  2: 0.75,  // Renshu (TypeRacerScreen): 80%
};

export default function PopView({
  isVisible,
  selectedNeedle,
  currentPixel,
  onClose,
  onOrbStateChange,
  orbCenterOpacity: orbCenterOpacityProp,
  orbCenterScale: orbCenterScaleProp,
  orbTopOpacity: orbTopOpacityProp,
  orbTopScale: orbTopScaleProp,
}: PopViewProps) {
  const { height: screenHeight } = Dimensions.get('window');
  
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
  
  // Fallback refs (only used if props not provided)
  const fallbackOrbCenterOpacity = useRef(new Animated.Value(1)).current;
  const fallbackOrbCenterScale = useRef(new Animated.Value(1)).current;
  const fallbackOrbTopOpacity = useRef(new Animated.Value(0)).current;
  const fallbackOrbTopScale = useRef(new Animated.Value(0)).current;
  
  // Use provided orb animation refs, or fallback to local ones
  const orbCenterOpacity = orbCenterOpacityProp || fallbackOrbCenterOpacity;
  const orbCenterScale = orbCenterScaleProp || fallbackOrbCenterScale;
  const orbTopOpacity = orbTopOpacityProp || fallbackOrbTopOpacity;
  const orbTopScale = orbTopScaleProp || fallbackOrbTopScale;
  const isManuallyClosingRef = useRef(false);
  const isAnimatingRef = useRef(false);
  const hasMountedRef = useRef(false);



  // Handle menu open animation
  useEffect(() => {
    if (isVisible && selectedNeedle !== null && !isAnimatingRef.current) {
      hasMountedRef.current = true;
      isAnimatingRef.current = true;
      
      // Stop all ongoing animations first
      orbTopOpacity.stopAnimation();
      orbTopScale.stopAnimation();
      orbCenterOpacity.stopAnimation();
      orbCenterScale.stopAnimation();
      
      // Ensure only center orb is visible before starting (safety check)
      orbCenterOpacity.setValue(1);
      orbCenterScale.setValue(1);
      orbTopOpacity.setValue(0);
      orbTopScale.setValue(0);
      
      // Play chime haptic when opening popview
      playChimeHaptic();
      
      // Start from -10% y offset and 0 opacity, then animate in
      const startY = menuHeight * 0.1;
      menuSlideAnim.setValue(startY);
      menuOpacity.setValue(0);
      
      // Animate menu slide and opacity
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
      ]).start();
      
      // Sequential orb fade: first fade out center completely (with shrink), then fade in top (with grow)
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orbCenterOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          Animated.timing(orbCenterScale, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
        ]),
        Animated.parallel([
          Animated.timing(orbTopOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          Animated.timing(orbTopScale, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
        ]),
      ]).start(() => {
        // Ensure final state: top visible, center hidden
        orbTopOpacity.setValue(1);
        orbTopScale.setValue(1);
        orbCenterOpacity.setValue(0);
        orbCenterScale.setValue(0);
        if (onOrbStateChange) {
          onOrbStateChange(false, true);
        }
        isAnimatingRef.current = false;
      });
    }
  }, [isVisible, selectedNeedle]);

  // Handle menu close animation
  useEffect(() => {
    // Only run if we've mounted and the menu was previously visible (not on initial load)
    if (!isVisible && hasMountedRef.current && !isManuallyClosingRef.current && !isAnimatingRef.current) {
      isAnimatingRef.current = true;
      
      // Stop all ongoing animations first
      orbTopOpacity.stopAnimation();
      orbTopScale.stopAnimation();
      orbCenterOpacity.stopAnimation();
      orbCenterScale.stopAnimation();
      
      // Ensure only top orb is visible before starting (safety check)
      orbTopOpacity.setValue(1);
      orbTopScale.setValue(1);
      orbCenterOpacity.setValue(0);
      orbCenterScale.setValue(0);
      
      // Sequential: first fade out top completely (with shrink), then fade in center (with grow)
      Animated.sequence([
        Animated.parallel([
          Animated.timing(orbTopOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          Animated.timing(orbTopScale, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
        ]),
        Animated.parallel([
          Animated.timing(orbCenterOpacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
          Animated.timing(orbCenterScale, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
            easing: Easing.out(Easing.quad),
          }),
        ]),
      ]).start(() => {
        // Ensure final state: center visible, top hidden
        orbTopOpacity.setValue(0);
        orbCenterOpacity.setValue(1);
        orbTopScale.setValue(0);
        orbCenterScale.setValue(1);
        if (onOrbStateChange) {
          onOrbStateChange(true, false);
        }
        isAnimatingRef.current = false;
      });
    }
  }, [isVisible]);

  // Lock orb states when menu closes (safety fallback)
  useEffect(() => {
    // Only run if we've mounted and the menu was previously visible (not on initial load)
    if (!isVisible && hasMountedRef.current && !isManuallyClosingRef.current && !isAnimatingRef.current) {
      // Stop any animations
      orbTopOpacity.stopAnimation();
      orbTopScale.stopAnimation();
      orbCenterOpacity.stopAnimation();
      orbCenterScale.stopAnimation();
      
      // Force final state: center visible, top hidden
      orbTopOpacity.setValue(0);
      orbCenterOpacity.setValue(1);
      orbTopScale.setValue(0);
      orbCenterScale.setValue(1);
      if (onOrbStateChange) {
        onOrbStateChange(true, false);
      }
    }
  }, [isVisible]);

  // Close menu handler
  const handleClose = () => {
    if (isAnimatingRef.current) return; // Prevent rapid clicks
    
    isManuallyClosingRef.current = true;
    isAnimatingRef.current = true;
    
    // Play reverse chime haptic when closing popview
    playReverseChime();
    
    // Stop any ongoing orb animations to prevent conflicts
    orbTopOpacity.stopAnimation();
    orbTopScale.stopAnimation();
    orbCenterOpacity.stopAnimation();
    orbCenterScale.stopAnimation();
    
    // Force orbs to the "menu open" state first (top visible, center hidden)
    orbTopOpacity.setValue(1);
    orbTopScale.setValue(1);
    orbCenterOpacity.setValue(0);
    orbCenterScale.setValue(0);
    
    // Animate menu closing: slide down and fade out
    const endY = menuHeight * 0.1;
    
    // Start orb animations immediately (fade out top, fade in center)
    Animated.sequence([
      Animated.parallel([
        Animated.timing(orbTopOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(orbTopScale, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
      ]),
      Animated.parallel([
        Animated.timing(orbCenterOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(orbCenterScale, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
      ]),
    ]).start(() => {
      // Ensure final state: center visible, top hidden
      orbTopOpacity.setValue(0);
      orbCenterOpacity.setValue(1);
      orbTopScale.setValue(0);
      orbCenterScale.setValue(1);
      if (onOrbStateChange) {
        onOrbStateChange(true, false);
      }
      isManuallyClosingRef.current = false;
      isAnimatingRef.current = false;
    });
    
    // Animate menu slide down and fade out
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
    ]).start(() => {
      menuSlideAnim.setValue(0);
      menuOpacity.setValue(0);
      onClose();
    });
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
        onPress={(e) => {
          e.stopPropagation();
          handleClose();
        }}
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
          borderWidth: 1,
          borderColor: currentPixel,
          opacity: menuOpacity,
          shadowColor: currentPixel,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.4,
          shadowRadius: 8,
          transform: [
            { translateY: menuSlideAnim },
          ],
        }}
        pointerEvents={isVisible ? "box-none" : "none"}
      >
        <View
          style={{
            flex: 1,
            paddingTop: 20, // Top margin to prevent overlap with border
            paddingBottom: screenHeight * 0.12, // Reserve bottom 12% for black region
          }}
          pointerEvents={isVisible ? "auto" : "none"}
        >
          {selectedNeedle === 0 && <Settings />}
          {selectedNeedle === 1 && <Notes />}
          {selectedNeedle === 2 && <TypeRacerScreen isVisible={isVisible} />}
        </View>
      </Animated.View>
      {/* Black region at bottom 12% */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: screenHeight * 0.12,
          backgroundColor: '#000',
          opacity: menuOpacity,
          transform: [
            { translateY: menuSlideAnim },
          ],
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 16,
          zIndex: 1000,
        }}
        pointerEvents={isVisible ? "box-none" : "none"}
      >
        <Pressable
          onPress={handleClose}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 24,
            paddingVertical: 12,
            minWidth: 120,
            minHeight: 44,
            zIndex: 1001,
          }}
        >
          <Text style={{ color: '#888', fontWeight: '500', fontSize: 15, textAlign: 'center' }}>Dismiss</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}
