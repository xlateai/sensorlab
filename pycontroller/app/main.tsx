import React, { useRef, useState, useEffect } from 'react';
import { Animated, Easing } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
// ...existing code...
import { Dimensions, View, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer, DeviceMotion } from 'expo-sensors';
// Removed all SVG imports; will use only View and styles
import PopView from './popview';
import { playSimpleHaptic } from './haptics';
import { useRGBRange } from './RGBRangeContext';
import { useBufferSize } from './BufferSizeContext';
import { calculateColorFromMagnetometer } from './color-decoding';

const PIXEL_WIDTH = 256;

export default function Main() {
  const { range } = useRGBRange();
  const { bufferSize } = useBufferSize();
  // Animated rotation value for smooth transitions
  const rotationAnim = useRef(new Animated.Value(0)).current;
  const [rawRotation, setRawRotation] = useState(0);
  // Device orientation state
  const [deviceRotation, setDeviceRotation] = useState(0); // in radians
  useEffect(() => {
    let sub = DeviceMotion.addListener(motion => {
      let rot = 0;
      if (motion?.rotation?.alpha !== undefined) {
        rot = motion.rotation.alpha;
      } else if (motion?.rotation?.gamma !== undefined) {
        rot = motion.rotation.gamma;
      }
      setRawRotation(rot);
    });
    DeviceMotion.setUpdateInterval(33);
    return () => { sub && sub.remove(); };
  }, []);

  // Animate rotation value smoothly
  useEffect(() => {
    if (!isMountedRef.current) return;
    const rotationDeg = (rawRotation * 180) / Math.PI + 30;
    Animated.timing(rotationAnim, {
      toValue: rotationDeg,
      duration: 120,
      useNativeDriver: true,
      easing: t => t,
    }).start();
  }, [rawRotation]);
  // Gesture state for double-tap-and-hold
  const [showLines, setShowLines] = useState(false);
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<any>(null);
  const [tapPosition, setTapPosition] = useState<{x: number, y: number} | null>(null);
  // Joystick origin that can drift
  const [joystickOrigin, setJoystickOrigin] = useState<{x: number, y: number} | null>(null);
  const [fingerPosition, setFingerPosition] = useState<{x: number, y: number} | null>(null);
  // Track the active touch identifier to ignore other touches
  const activeTouchIdRef = useRef<number | null>(null);
  // Animated state for circle and needle
  const [selectedNeedle, setSelectedNeedle] = useState<number | null>(null);
  // Track previous highlighted icon for haptic feedback
  const prevTargetNeedleIdxRef = useRef<number | null>(null);
  const iconScaleAnim = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const iconOpacityAnim = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  // Glass blob state - smooth animation toward target
  const [blobOffset, setBlobOffset] = useState<{x: number, y: number}>({ x: 0, y: 0 });
  // Slide-up menu state
  const [showMenu, setShowMenu] = useState(false);
  const [menuSelectedNeedle, setMenuSelectedNeedle] = useState<number | null>(null);
  // Background color - solid pitch black
  const bgColor = '#000000';
  // Single orb that animates between center and top positions
  // 0 = center position, 1 = top position
  const orbPositionY = useRef(new Animated.Value(0)).current;

  // Handler for double-tap-and-hold gesture
  const handlePressIn = (event: any) => {
    const now = Date.now();
    const { locationX, locationY } = event.nativeEvent;
    const touchId = event.nativeEvent.identifier || event.nativeEvent.touches?.[0]?.identifier || null;
    
    if (now - lastTapRef.current < 350) {
      // Double-tap detected - enter selection mode
      activeTouchIdRef.current = touchId;
      setShowLines(true);
      setTapPosition({ x: locationX, y: locationY });
      setJoystickOrigin({ x: locationX, y: locationY });
      setFingerPosition({ x: locationX, y: locationY });
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    } else {
      // First tap - wait for potential second tap
      lastTapRef.current = now;
      tapTimeoutRef.current = setTimeout(() => {
        lastTapRef.current = 0;
      }, 350);
      setTapPosition(null);
      setJoystickOrigin(null);
      setFingerPosition(null);
    }
  };

  const handlePressOut = (event?: any) => {
    // Verify this is the active touch before processing
    if (activeTouchIdRef.current !== null && event) {
      const touchId = event.nativeEvent?.identifier || event.nativeEvent?.changedTouches?.[0]?.identifier;
      if (touchId !== undefined && touchId !== activeTouchIdRef.current) {
        return; // Ignore touches from other fingers
      }
    }
    
    const hadSelection = selectedNeedle !== null;
    
    // Reset selection state
    setShowLines(false);
    setTapPosition(null);
    setFingerPosition(null);
    setJoystickOrigin(null);
    activeTouchIdRef.current = null;
    setSelectedNeedle(null);
    
    // Reset icon animations
    iconScaleAnim.forEach((anim) => anim.setValue(0));
    iconOpacityAnim.forEach((anim) => anim.setValue(0));
    
    // Reset blob position
    setBlobOffset({ x: 0, y: 0 });
    
    // Open menu if a needle was selected on release
    if (hadSelection) {
      setMenuSelectedNeedle(selectedNeedle);
      setShowMenu(true);
    }
  };
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const pixelHeight = Math.round((screenHeight / screenWidth) * PIXEL_WIDTH);
  const pixelSize = screenWidth / PIXEL_WIDTH;
  const canvasHeight = pixelHeight * pixelSize;
  
  // Orb animations are now handled by PopView
  
  // Left edge threshold for allowing parent gesture (swipe to toggle fullscreen)
  const LEFT_EDGE_THRESHOLD = screenWidth * 0.1;

  const bufferRef = useRef<{x: number, y: number, z: number}[]>([]);
  const magnetometerRef = useRef<{x: number, y: number, z: number} | null>(null);
  const [buffer, setBuffer] = useState<{x: number, y: number, z: number}[]>([]);
  const [magnetometer, setMagnetometer] = useState<{x: number, y: number, z: number} | null>(null);


  const [isFocused, setIsFocused] = useState(true);
  const isMountedRef = useRef(true);
  
  // Animate orb in on initial mount (fade in at center position)
  useEffect(() => {
    // Fade in the orb on initial load (position stays at 0 = center)
    Animated.timing(orbPositionY, {
      toValue: 0,
      duration: 0,
      useNativeDriver: true,
    }).start();
  }, []); // Run only once on mount
  
  useFocusEffect(
    React.useCallback(() => {
      isMountedRef.current = true;
      setIsFocused(true);
      
      // Trim buffer if current size exceeds new bufferSize
      if (bufferRef.current.length > bufferSize) {
        bufferRef.current = bufferRef.current.slice(-bufferSize);
      }
      
      const sub = Magnetometer.addListener(data => {
        if (!isMountedRef.current) return;
        bufferRef.current.push(data);
        if (bufferRef.current.length > bufferSize) bufferRef.current.shift();
        magnetometerRef.current = data;
      });
      Magnetometer.setUpdateInterval(24);
      const interval = setInterval(() => {
        if (!isMountedRef.current) return;
        setBuffer([...bufferRef.current]);
        setMagnetometer(magnetometerRef.current);
      }, 33);
      return () => {
        isMountedRef.current = false;
        sub && sub.remove();
        clearInterval(interval);
        // Don't update state during unmount to avoid hooks mismatch
      };
    }, [bufferSize])
  );

  // Calculate color from magnetometer data (buffer is used to determine min/max range)
  const currentRGB = calculateColorFromMagnetometer(buffer, magnetometer, range);
  const currentPixel = `rgb(${currentRGB.r},${currentRGB.g},${currentRGB.b})`;
  const smoothR = currentRGB.r;
  const smoothG = currentRGB.g;
  const smoothB = currentRGB.b;


  if (!isFocused) {
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }
  // Render a single centered circle with the latest value color
  // Outer ring logic
  const baseRadius = Math.min(screenWidth, canvasHeight) / 6;
  const innerRadius = baseRadius * 0.5; // 50% smaller
  const minRadius = innerRadius;
  const maxRadius = innerRadius * 1.333;
  const avgRGB = (smoothR + smoothG + smoothB) / 3;
  const ringRadius = minRadius + ((maxRadius - minRadius) * (avgRGB / 255));
  const ringThickness = 1.5;

  const centerX = screenWidth / 2;
  const centerY = canvasHeight / 2;

  // Dial tick rendering
  const tickThickness = 2.5; // thicker lines
  const tickColor = 'rgba(216,216,216,0.45)'; // silvery and faded
  // 8 angles: 0, 45, 90, 135, 180, 225, 270, 315 degrees
  const tickAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  // Needles array with explicit angles
  const needles: { angle: number; Title: string | null; icon: 'description' | 'settings' | 'menu-book' | 'language' | null }[] = [
    { angle: 0, Title: null, icon: 'settings' },      // Left needle (0 degrees) - Settings
    { angle: 180, Title: null, icon: 'description' },    // Right needle (180 degrees) - Docs
    { angle: 90, Title: null, icon: 'menu-book' },    // Bottom needle (90 degrees) - Practice
    { angle: 270, Title: null, icon: 'language' },    // Top needle (270 degrees) - Browser
  ];
  // Convert degrees to radians
  const degToRad = (deg: number) => deg * Math.PI / 180;
  // Calculate tick positions
  // Helper to find intersection with viewport edge
  function getEdgeIntersection(angleRad: number) {
    // Calculate intersection with screen bounds
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);
    let tArray = [];
    // Left edge (x=0)
    if (dx !== 0) {
      const t = (0 - centerX) / dx;
      const y = centerY + t * dy;
      if (y >= 0 && y <= canvasHeight) tArray.push(t);
    }
    // Right edge (x=screenWidth)
    if (dx !== 0) {
      const t = (screenWidth - centerX) / dx;
      const y = centerY + t * dy;
      if (y >= 0 && y <= canvasHeight) tArray.push(t);
    }
    // Top edge (y=0)
    if (dy !== 0) {
      const t = (0 - centerY) / dy;
      const x = centerX + t * dx;
      if (x >= 0 && x <= screenWidth) tArray.push(t);
    }
    // Bottom edge (y=canvasHeight)
    if (dy !== 0) {
      const t = (canvasHeight - centerY) / dy;
      const x = centerX + t * dx;
      if (x >= 0 && x <= screenWidth) tArray.push(t);
    }
    // Find the closest positive t (outward from center)
    const tEdge = Math.max(...tArray.filter(t => t > 0));
    return {
      x: centerX + tEdge * dx,
      y: centerY + tEdge * dy,
      t: tEdge,
      dx,
      dy,
    };
  }

  // Highlight logic for nearest needle (with animation)
  let highlightIdx: number | null = null;
  let highlightProps = { fill: tickColor, scale: 1 };
  // Joystick state for highlight
  let joystickAngle: number | null = null;
  let joystickAtMax = false;
  let targetOffset = { x: 0, y: 0 };
  // Always interpolate to target scale/brightness, even when unselected
  let targetNeedleIdx: number | null = null;
  if (showLines && joystickOrigin && fingerPosition) {
    let origin = joystickOrigin;
    const dx = fingerPosition.x - origin.x;
    const dy = fingerPosition.y - origin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 20; // Increased for bigger range
    const closeDist = 15; // Distance threshold for bouncing back (bigger resting spot)
    const driftDist = maxDist * 2;
    
    // If within close distance, bounce back and don't select
    if (dist < closeDist) {
      targetOffset = { x: 0, y: 0 };
      targetNeedleIdx = null;
    } else {
      if (dist > driftDist) {
        const driftFrac = 0.18;
        origin = {
          x: origin.x + (fingerPosition.x - origin.x) * driftFrac,
          y: origin.y + (fingerPosition.y - origin.y) * driftFrac,
        };
        setJoystickOrigin(origin);
      }
      const moveDist = Math.min(dist, maxDist);
      const angleRad = Math.atan2(dy, dx);
      targetOffset.x = Math.cos(angleRad) * moveDist;
      targetOffset.y = Math.sin(angleRad) * moveDist;
      // Selection threshold matches visibility threshold (distRatio >= 0.15)
      const visibilityThreshold = maxDist * 0.15;
      joystickAtMax = dist >= visibilityThreshold;
      if (joystickAtMax) {
        joystickAngle = (angleRad * 180 / Math.PI);
        if (joystickAngle < 0) joystickAngle += 360;
        let minDiff = 999;
        needles.forEach((needle, idx) => {
          let diff = Math.abs(needle.angle - joystickAngle!);
          if (diff > 180) diff = 360 - diff;
          if (diff < minDiff) {
            minDiff = diff;
            targetNeedleIdx = idx;
          }
        });
      }
    }
  } else {
    targetOffset = { x: 0, y: 0 };
    targetNeedleIdx = null;
  }

  // Bounce fade-in animation when icons first appear
  useEffect(() => {
    if (showLines) {
      // Bounce fade-in animation
      iconScaleAnim.forEach((anim) => {
        anim.setValue(0);
        Animated.sequence([
          Animated.spring(anim, {
            toValue: 1.3,
            useNativeDriver: true,
            friction: 4,
            tension: 100,
          }),
          Animated.spring(anim, {
            toValue: 1,
            useNativeDriver: true,
            friction: 6,
            tension: 120,
          }),
        ]).start();
      });
      iconOpacityAnim.forEach((anim) => {
        anim.setValue(0);
        Animated.timing(anim, {
          toValue: 0.65,
          duration: 300,
          useNativeDriver: true,
          easing: Easing.out(Easing.ease),
        }).start();
      });
    } else {
      // Fade out when hiding
      iconScaleAnim.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
          easing: Easing.in(Easing.ease),
        }).start();
      });
      iconOpacityAnim.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
          easing: Easing.in(Easing.ease),
        }).start();
      });
      setSelectedNeedle(null);
    }
  }, [showLines]);

  // Animate icon scale and opacity for selection (only when icons are visible)
  useEffect(() => {
    if (!showLines) return;
    iconScaleAnim.forEach((anim, idx) => {
      Animated.spring(anim, {
        toValue: targetNeedleIdx === idx ? 1.7 : 1,
        useNativeDriver: true,
        friction: 5,
        tension: 120,
      }).start();
    });
    iconOpacityAnim.forEach((anim, idx) => {
      Animated.timing(anim, {
        toValue: targetNeedleIdx === idx ? 0.85 : 0.65,
        duration: 180,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    });
    setSelectedNeedle(targetNeedleIdx);
  }, [targetNeedleIdx, showLines]);

  // Play haptic feedback when selector orb highlights an icon
  useEffect(() => {
    if (!showLines) {
      prevTargetNeedleIdxRef.current = null;
      return;
    }
    // Only play haptic when highlighting a new icon (not when unhighlighting)
    if (targetNeedleIdx !== null && targetNeedleIdx !== prevTargetNeedleIdxRef.current) {
      playSimpleHaptic(0.6, 0.5, 0.1);
    }
    prevTargetNeedleIdxRef.current = targetNeedleIdx;
  }, [targetNeedleIdx, showLines]);

  // Handle menu close when needed (e.g., if user taps outside)
  const closeMenu = () => {
    // Close menu (orb animations are handled by PopView)
    // Keep menuSelectedNeedle so component state persists when reopening
    setShowMenu(false);
  };


  // Animation loop for glass blob - smooth melting effect
  useEffect(() => {
    let running = true;
    function animate() {
      if (!running || !isMountedRef.current) return;
      setBlobOffset(prev => {
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
        return {
          x: lerp(prev.x, targetOffset.x, 0.25),
          y: lerp(prev.y, targetOffset.y, 0.25)
        };
      });
      if (running && isMountedRef.current) requestAnimationFrame(animate);
    }
    animate();
    return () => { running = false; };
  }, [targetOffset.x, targetOffset.y]);

  // Render ticks as dots at the tips
  const ticks = tickAngles.map((angle, idx) => {
    const rad = degToRad(angle);
    const edge = getEdgeIntersection(rad);
    const dotRadius = selectedNeedle === idx ? 18 : 12;
    const dotColor = selectedNeedle === idx
      ? `rgba(255,255,255,0.85)`
      : tickColor;
    return (
      <View
        key={angle}
        style={{
          position: 'absolute',
          left: edge.x - dotRadius,
          top: edge.y - dotRadius,
          width: dotRadius * 2,
          height: dotRadius * 2,
          backgroundColor: dotColor,
          borderRadius: dotRadius,
        }}
      />
    );
  });


  // No animation for tap circle; render at joystickOrigin directly

  // Determines if the main view should capture touch start events
  const shouldStartResponder = (evt: any): boolean => {
    // Don't capture touches when menu is visible
    if (showMenu) {
      return false;
    }
    
    // Cancel selection if another touch starts during selection mode
    if (showLines) {
      handlePressOut();
      return false;
    }
    
    // Allow gestures except on left edge (reserved for parent swipe gesture)
    const touchX = evt.nativeEvent.locationX;
    return touchX >= LEFT_EDGE_THRESHOLD;
  };

  // Determines if the main view should capture touch move events
  const shouldMoveResponder = (evt: any): boolean => {
    // Don't capture touches when menu is visible
    if (showMenu) {
      return false;
    }
    
    if (showLines) {
      const touches = evt.nativeEvent.touches || [];
      if (touches.length > 1) {
        // Multiple touches detected - cancel selection
        handlePressOut();
        return false;
      }
      return true; // Maintain responder during active selection
    }
    
    return false;
  };

  // Handles touch movement during selection mode
  const handleResponderMove = (event: any) => {
    if (showLines && tapPosition) {
      const touches = event.nativeEvent.touches || [];
      if (touches.length > 1) {
        // Multiple touches detected - cancel selection
        handlePressOut();
        return;
      }
      const { locationX, locationY } = event.nativeEvent;
      setFingerPosition({ x: locationX, y: locationY });
    }
  };

  return (
    <View
      style={{ 
        flex: 1, 
        backgroundColor: bgColor,
      }}
      pointerEvents={showMenu ? "box-none" : "auto"}
      onStartShouldSetResponder={shouldStartResponder}
      onMoveShouldSetResponder={shouldMoveResponder}
      onResponderGrant={handlePressIn}
      onResponderRelease={handlePressOut}
      onResponderTerminate={handlePressOut}
      onResponderMove={handleResponderMove}
    >
  {/* No outer-most tick circles, just icons for those positions */}
      {/* Single orb that animates between center and top positions */}
      {(() => {
        // Calculate Y offset: center position to top position (16% viewport height)
        const topY = screenHeight * 0.15;
        const yOffset = topY - centerY;
        
        // Interpolate translateY: 0 = center, 1 = top
        const translateY = orbPositionY.interpolate({
          inputRange: [0, 1],
          outputRange: [0, yOffset],
        });
        
        return (
          <>
            <Animated.View
              style={{
                position: 'absolute',
                left: centerX - ringRadius,
                top: centerY - ringRadius,
                width: ringRadius * 2,
                height: ringRadius * 2,
                borderRadius: ringRadius,
                borderWidth: ringThickness,
                borderColor: `rgba(${smoothR},${smoothG},${smoothB},0.25)`,
                backgroundColor: 'transparent',
                transform: [{ translateY }],
                zIndex: 1000,
              }}
            />
            <Animated.View
              style={{
                position: 'absolute',
                left: centerX - innerRadius,
                top: centerY - innerRadius,
                width: innerRadius * 2,
                height: innerRadius * 2,
                borderRadius: innerRadius,
                backgroundColor: currentPixel,
                transform: [{ translateY }],
                zIndex: 1000,
              }}
            />
          </>
        );
      })()}
      {/* Control point circle - hidden */}
      {/* Simple circle that extends from center in joystick direction */}
      {showLines && (blobOffset.x !== 0 || blobOffset.y !== 0) && (() => {
        const dist = Math.sqrt(blobOffset.x * blobOffset.x + blobOffset.y * blobOffset.y);
        const angle = Math.atan2(blobOffset.y, blobOffset.x);
        // Circle extends from center in the direction of joystick
        const maxDist = 20; // Match the activation threshold
        const distRatio = Math.min(dist / maxDist, 1); // 0 to 1
        // Blend into main circle: smaller and more transparent when close
        const baseRadius = innerRadius * 0.4;
        const circleRadius = baseRadius * (0.3 + distRatio * 0.7); // Scale from 30% to 100%
        // Position selector circle center on the circumference of the main circle
        const circleDistance = innerRadius;
        const circleX = centerX + Math.cos(angle) * circleDistance;
        const circleY = centerY + Math.sin(angle) * circleDistance;
        // Opacity blends from 0.2 (close) to 0.5 (far)
        const opacity = 0.2 + distRatio * 0.3;
        
        // Don't render if too small (when distRatio is very low)
        if (distRatio < 0.15) {
          return null;
        }
        
        return (
          <View
            style={{
              position: 'absolute',
              left: circleX - circleRadius,
              top: circleY - circleRadius,
              width: circleRadius * 2,
              height: circleRadius * 2,
              borderRadius: circleRadius,
              backgroundColor: `rgba(${smoothR},${smoothG},${smoothB},${opacity})`,
            }}
          />
        );
      })()}
      {/* Render needle titles at the tip of each needle, only when needles are shown */}
      {showLines && needles.map((needle, i) => {
        const rad = degToRad(needle.angle);
        // Calculate orbital ring: center at 50% of screen, radius is 25% of smallest dimension
        const smallestDimension = Math.min(screenWidth, screenHeight);
        const radius = smallestDimension * 0.25;
        const tipX = centerX + Math.cos(rad) * radius;
        const tipY = centerY + Math.sin(rad) * radius;
        // Icon size: normal 32, enlarged 32*1.36=43.52
        const iconSize = 32;
        return (
          <Animated.View
            key={needle.Title || `needle-${i}`}
            style={{
              position: 'absolute',
              left: tipX - iconSize / 2,
              top: tipY - iconSize / 2,
              width: iconSize,
              height: iconSize,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ scale: iconScaleAnim[i].interpolate({ inputRange: [1, 1.7], outputRange: [1, 1.36] }) }],
              opacity: iconOpacityAnim[i],
            }}
          >
            {needle.icon ? (
              <MaterialIcons name={needle.icon} size={iconSize} color="#fff" />
            ) : needle.Title ? (
              <Text style={{ color: '#fff', fontSize: iconSize, fontWeight: '500' }}>{needle.Title}</Text>
            ) : null}
          </Animated.View>
        );
      })}
      {/* Popover view */}
      <PopView
        isVisible={showMenu}
        selectedNeedle={menuSelectedNeedle}
        currentPixel={currentPixel}
        onClose={closeMenu}
        orbPositionY={orbPositionY}
      />
    </View>
  );
}