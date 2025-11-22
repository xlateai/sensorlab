import React, { useRef, useState, useEffect } from 'react';
import { Animated, Easing, Dimensions, View, Pressable, Text } from 'react-native';
import Settings from './widgets/settings';
import Docs from './widgets/docs';

interface PopViewProps {
  isVisible: boolean;
  selectedNeedle: number | null;
  currentPixel: string;
  onClose: () => void;
  onBackgroundColorChange?: (color: string) => void;
  onOrbStateChange?: (centerVisible: boolean, topVisible: boolean) => void;
  orbCenterOpacity?: Animated.Value;
  orbCenterScale?: Animated.Value;
  orbTopOpacity?: Animated.Value;
  orbTopScale?: Animated.Value;
}

export default function PopView({
  isVisible,
  selectedNeedle,
  currentPixel,
  onClose,
  onBackgroundColorChange,
  onOrbStateChange,
  orbCenterOpacity: orbCenterOpacityProp,
  orbCenterScale: orbCenterScaleProp,
  orbTopOpacity: orbTopOpacityProp,
  orbTopScale: orbTopScaleProp,
}: PopViewProps) {
  const { height: screenHeight } = Dimensions.get('window');
  const menuHeight = screenHeight * 0.7; // Menu takes 70% of screen (30% at top)
  
  // Menu animation state
  const menuSlideAnim = useRef(new Animated.Value(menuHeight * 0.1)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  
  // Background color animation
  const bgColor = '#000000';
  const bgColorLightened = '#080808';
  const bgColorAnim = useRef(new Animated.Value(0)).current;
  
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

  // Helper function to interpolate between two hex colors
  const interpolateHexColor = (color1: string, color2: string, t: number): string => {
    const hex1 = color1.replace('#', '');
    const hex2 = color2.replace('#', '');
    const r1 = parseInt(hex1.substring(0, 2), 16);
    const g1 = parseInt(hex1.substring(2, 4), 16);
    const b1 = parseInt(hex1.substring(4, 6), 16);
    const r2 = parseInt(hex2.substring(0, 2), 16);
    const g2 = parseInt(hex2.substring(2, 4), 16);
    const b2 = parseInt(hex2.substring(4, 6), 16);
    
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // Update background color from animated value
  useEffect(() => {
    if (!onBackgroundColorChange) return;
    const listenerId = bgColorAnim.addListener(({ value }) => {
      const interpolatedColor = interpolateHexColor(bgColor, bgColorLightened, value);
      onBackgroundColorChange(interpolatedColor);
    });
    return () => {
      bgColorAnim.removeListener(listenerId);
    };
  }, [onBackgroundColorChange]);

  // Handle menu open animation
  useEffect(() => {
    if (isVisible && selectedNeedle !== null) {
      // Start from -10% y offset and 0 opacity, then animate in
      const startY = menuHeight * 0.1;
      menuSlideAnim.setValue(startY);
      menuOpacity.setValue(0);
      
      // Animate background color to lighter black when menu opens
      Animated.timing(bgColorAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
        easing: Easing.out(Easing.ease),
      }).start();
      
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
        if (onOrbStateChange) {
          onOrbStateChange(false, true);
        }
      });
    }
  }, [isVisible, selectedNeedle]);

  // Handle menu close animation
  useEffect(() => {
    if (!isVisible && !isManuallyClosingRef.current) {
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
        if (onOrbStateChange) {
          onOrbStateChange(true, false);
        }
        // After animation completes, ensure top orb stays at 0 and center at 1
        orbTopOpacity.setValue(0);
        orbCenterOpacity.setValue(1);
        orbTopScale.setValue(0);
        orbCenterScale.setValue(1);
      });
    }
  }, [isVisible]);

  // Lock orb states when menu closes
  useEffect(() => {
    if (!isVisible && !isManuallyClosingRef.current) {
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
    isManuallyClosingRef.current = true;
    
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
      orbTopOpacity.setValue(0);
      orbCenterOpacity.setValue(1);
      orbTopScale.setValue(0);
      orbCenterScale.setValue(1);
      if (onOrbStateChange) {
        onOrbStateChange(true, false);
      }
      isManuallyClosingRef.current = false;
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
    
    // Animate background color back to black smoothly
    Animated.timing(bgColorAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
      easing: Easing.out(Easing.ease),
    }).start();
  };

  if (!isVisible || selectedNeedle === null) {
    return null;
  }

  return (
    <>
      {/* Transparent overlay to detect taps outside menu */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: screenHeight * 0.30, // Top 30% area
          backgroundColor: 'transparent',
        }}
        onStartShouldSetResponder={() => true}
        onResponderRelease={handleClose}
      />
      {/* Slide-up menu */}
      {/* Glow effect behind popover */}
      <Animated.View
        style={{
          position: 'absolute',
          bottom: -4,
          left: -2,
          right: -2,
          top: screenHeight * 0.30 - 8,
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
      />
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          top: screenHeight * 0.30, // Leave 30% space at the top
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
      >
        <View
          style={{
            flex: 1,
            paddingBottom: screenHeight * 0.12, // Reserve bottom 12% for black region
          }}
        >
          {selectedNeedle === 0 && <Settings />}
          {selectedNeedle === 1 && <Docs />}
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
