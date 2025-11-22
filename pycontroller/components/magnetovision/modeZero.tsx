import React, { useRef, useState, useEffect } from 'react';
import { Animated, Easing, PanResponder } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
// ...existing code...
import { Dimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer, DeviceMotion } from 'expo-sensors';
// Removed all SVG imports; will use only View and styles


const PIXEL_WIDTH = 256;
const BUFFER_SIZE = 64;

export default function ModeZero() {
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
  const iconScaleAnim = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  const iconOpacityAnim = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  // Glass blob state - smooth animation toward target
  const [blobOffset, setBlobOffset] = useState<{x: number, y: number}>({ x: 0, y: 0 });
  // Slide-up menu state
  const [showMenu, setShowMenu] = useState(false);
  const menuSlideAnim = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const menuPanY = useRef(new Animated.Value(0)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  // Background color animation: 0 = black (#000), 1 = dark gray (#0f0f0f)
  const bgColorAnim = useRef(new Animated.Value(0)).current;
  const [bgColor, setBgColor] = useState('#000');
  // Two separate orbs: one at center, one at top - toggle visibility for teleport effect
  const orbCenterOpacity = useRef(new Animated.Value(1)).current;
  const orbCenterScale = useRef(new Animated.Value(1)).current;
  const orbTopOpacity = useRef(new Animated.Value(0)).current;
  const orbTopScale = useRef(new Animated.Value(1)).current;

  // Handler for double-tap-and-hold
  const handlePressIn = (event: any) => {
    const now = Date.now();
    const { locationX, locationY } = event.nativeEvent;
    const touchId = event.nativeEvent.identifier || event.nativeEvent.touches?.[0]?.identifier || null;
    
    if (now - lastTapRef.current < 350) {
      // Double-tap detected
      activeTouchIdRef.current = touchId;
      setShowLines(true);
      setTapPosition({ x: locationX, y: locationY });
      setJoystickOrigin({ x: locationX, y: locationY });
      setFingerPosition({ x: locationX, y: locationY });
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    } else {
      // First tap
      lastTapRef.current = now;
      // Reset if no second tap within 350ms
      tapTimeoutRef.current = setTimeout(() => {
        lastTapRef.current = 0;
      }, 350);
      setTapPosition(null);
      setJoystickOrigin(null);
      setFingerPosition(null);
    }
  };
  const handlePressOut = (event?: any) => {
    // Only respond if this is the active touch or if no active touch is set
    if (activeTouchIdRef.current !== null && event) {
      const touchId = event.nativeEvent?.identifier || event.nativeEvent?.changedTouches?.[0]?.identifier;
      if (touchId !== undefined && touchId !== activeTouchIdRef.current) {
        return; // Ignore other touches
      }
    }
    
    // Check if we have a selected needle before clearing state
    const hadSelection = selectedNeedle !== null;
    
    setShowLines(false);
    setTapPosition(null);
    setFingerPosition(null);
    setJoystickOrigin(null);
    activeTouchIdRef.current = null;
    // Explicitly reset selection
    setSelectedNeedle(null);
    // Reset animations immediately
    iconScaleAnim.forEach((anim) => {
      anim.setValue(0);
    });
    iconOpacityAnim.forEach((anim) => {
      anim.setValue(0);
    });
    // Reset blob
    setBlobOffset({ x: 0, y: 0 });
    
    // Open menu only if we released while a needle was selected
    if (hadSelection) {
      menuPanY.setValue(0);
      // Start from -10% y offset and 0 opacity, then animate in
      const screenH = Dimensions.get('window').height;
      const menuHeight = screenH * 0.8; // Menu takes 80% of screen (20% at top)
      const startY = menuHeight * 0.1; // -10% offset
      menuSlideAnim.setValue(startY);
      menuOpacity.setValue(0);
      setShowMenu(true);
      // Set initial values for drag-responsive animations
      bgColorAnim.setValue(1);
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
      // Sequential orb fade: first fade out center completely, then fade in top
      Animated.sequence([
        Animated.timing(orbCenterOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(orbTopOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
      ]).start();
    }
  };
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const pixelHeight = Math.round((screenHeight / screenWidth) * PIXEL_WIDTH);
  const pixelSize = screenWidth / PIXEL_WIDTH;
  const canvasHeight = pixelHeight * pixelSize;
  
  // Animate orb visibility when menu closes (fade out top, then fade in center)
  useEffect(() => {
    if (!showMenu) {
      // Get current values from the drag state
      const currentTopOpacity = (orbTopOpacity as any)._value || 0;
      const currentCenterOpacity = (orbCenterOpacity as any)._value || 0;
      
      // Always animate smoothly from current state to final state
      // Sequential: first fade out top completely, then fade in center
      Animated.sequence([
        Animated.timing(orbTopOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
        Animated.timing(orbCenterOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
          easing: Easing.out(Easing.quad),
        }),
      ]).start(() => {
        // After animation completes, ensure top orb stays at 0 and center at 1
        // This prevents any flash-back
        orbTopOpacity.setValue(0);
        orbCenterOpacity.setValue(1);
      });
    }
  }, [showMenu]);

  // Make background color and orb visibility respond to drag in real-time
  useEffect(() => {
    if (!showMenu) {
      // When menu closes, immediately lock orb states and cleanup
      orbTopOpacity.setValue(0);
      orbCenterOpacity.setValue(1);
      return;
    }
    
    const threshold = screenHeight * 0.2; // Same threshold as dismiss
    let isActive = true; // Flag to prevent listener from running after cleanup
    
    const listenerId = menuPanY.addListener(({ value }) => {
      // Don't update if menu has closed
      if (!isActive) return;
      
      // Interpolate background color: 0 drag = full light (#0a0a0a), threshold drag = black (#000)
      const bgProgress = Math.max(0, Math.min(1, 1 - (value / threshold)));
      bgColorAnim.setValue(bgProgress);
      
      // Interpolate orb visibility: 0 drag = top visible (1), center invisible (0)
      // threshold drag = top invisible (0), center visible (1)
      const orbProgress = Math.max(0, Math.min(1, 1 - (value / threshold)));
      orbTopOpacity.setValue(orbProgress);
      orbCenterOpacity.setValue(1 - orbProgress);
    });
    
    return () => {
      isActive = false; // Disable listener before removing
      menuPanY.removeListener(listenerId);
      // Always lock orb states when listener is removed (menu closing)
      orbTopOpacity.setValue(0);
      orbCenterOpacity.setValue(1);
    };
  }, [showMenu, screenHeight]);
  
  // Left edge threshold for allowing parent gesture (swipe to toggle fullscreen)
  const LEFT_EDGE_THRESHOLD = screenWidth * 0.1;

  const bufferRef = useRef<{x: number, y: number, z: number}[]>([]);
  const magnetometerRef = useRef<{x: number, y: number, z: number} | null>(null);
  const [buffer, setBuffer] = useState<{x: number, y: number, z: number}[]>([]);
  const [magnetometer, setMagnetometer] = useState<{x: number, y: number, z: number} | null>(null);


  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    React.useCallback(() => {
      setIsFocused(true);
      const sub = Magnetometer.addListener(data => {
        bufferRef.current.push(data);
        if (bufferRef.current.length > BUFFER_SIZE) bufferRef.current.shift();
        magnetometerRef.current = data;
      });
      Magnetometer.setUpdateInterval(24);
      const interval = setInterval(() => {
        setBuffer([...bufferRef.current]);
        setMagnetometer(magnetometerRef.current);
      }, 33);
      return () => {
        setIsFocused(false);
        sub && sub.remove();
        clearInterval(interval);
      };
    }, [])
  );

  const [minMax, setMinMax] = useState({
    minX: 0, maxX: 1,
    minY: 0, maxY: 1,
    minZ: 0, maxZ: 1,
  });

  useEffect(() => {
    if (buffer.length === 0) return;
    let minX = buffer[0].x, maxX = buffer[0].x;
    let minY = buffer[0].y, maxY = buffer[0].y;
    let minZ = buffer[0].z, maxZ = buffer[0].z;
    for (const v of buffer) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    setMinMax({ minX, maxX, minY, maxY, minZ, maxZ });
  }, [buffer]);

  // Interpolate between colors for smooth transitions
  const prevRGBRef = useRef<[number, number, number]>([0, 0, 0]);
  let r = 0, g = 0, b = 0;
  if (magnetometer !== null) {
    const norm = (val: number, min: number, max: number) => {
      if (max === min) return 0.5;
      return Math.max(0, Math.min(1, (val - min) / (max - min)));
    };
    r = Math.round(norm(magnetometer.x, minMax.minX, minMax.maxX) * 255);
    g = Math.round(norm(magnetometer.y, minMax.minY, minMax.maxY) * 255);
    b = Math.round(norm(magnetometer.z, minMax.minZ, minMax.maxZ) * 255);
  }
  // Blend previous and current RGB
  const blend = 0.2; // 0 = no smoothing, 1 = full smoothing
  const prev = prevRGBRef.current;
  const smoothR = Math.round(prev[0] * (1 - blend) + r * blend);
  const smoothG = Math.round(prev[1] * (1 - blend) + g * blend);
  const smoothB = Math.round(prev[2] * (1 - blend) + b * blend);
  prevRGBRef.current = [smoothR, smoothG, smoothB];
  const currentPixel = `rgb(${smoothR},${smoothG},${smoothB})`;


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
  const needles: { angle: number; Title: string; icon: 'description' | 'settings' }[] = [
    { angle: 0, Title: 'Hi', icon: 'description' },      // Left needle (0 degrees)
    { angle: 180, Title: 'There', icon: 'settings' },    // Right needle (180 degrees)
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

  // Handle menu close when needed (e.g., if user taps outside)
  const closeMenu = (currentDragY: number = 0) => {
    // Stop any ongoing animations (but let orb animations run smoothly)
    menuPanY.stopAnimation();
    menuSlideAnim.stopAnimation();
    menuOpacity.stopAnimation();
    
    // Don't stop orb animations - let them animate smoothly
    // Don't set orb values immediately - let the useEffect handle the smooth transition
    
    // Hide menu - this will trigger the smooth closing animation in useEffect
    setShowMenu(false);
    
    // Reset menu values after animation completes to prevent any interference
    // Wait longer to ensure orb animation has started
    setTimeout(() => {
      menuPanY.setValue(0);
      menuSlideAnim.setValue(0);
      menuOpacity.setValue(0);
      bgColorAnim.setValue(0);
      // Ensure top orb stays invisible - lock it in place
      orbTopOpacity.setValue(0);
    }, 300); // Wait for orb animation to complete
  };

  // Pan responder for swipe-down to dismiss
  const menuPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to downward swipes
        return gestureState.dy > 5;
      },
      onPanResponderGrant: () => {
        menuPanY.setOffset((menuPanY as any)._value || 0);
        menuPanY.setValue(0);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow downward movement
        if (gestureState.dy > 0) {
          menuPanY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentDragY = gestureState.dy;
        const threshold = screenHeight * 0.2; // Dismiss if dragged down 20% of screen
        if (currentDragY > threshold || gestureState.vy > 0.5) {
          // Dismiss menu immediately from current position (before flattening)
          closeMenu(currentDragY);
        } else {
          // Snap back up and animate background/orb back to open state
          menuPanY.flattenOffset();
          menuPanY.setValue(0);
          // Animate back to open state
          Animated.parallel([
            Animated.timing(bgColorAnim, {
              toValue: 1,
              duration: 200,
              useNativeDriver: false,
              easing: Easing.out(Easing.ease),
            }),
            // Sequential orb fade: first fade out center, then fade in top
            Animated.sequence([
              Animated.timing(orbCenterOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.out(Easing.ease),
              }),
              Animated.timing(orbTopOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
                easing: Easing.out(Easing.ease),
              }),
            ]),
          ]).start();
        }
      },
    })
  ).current;

  // Animation loop for glass blob - smooth melting effect
  useEffect(() => {
    let running = true;
    function animate() {
      setBlobOffset(prev => {
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
        return {
          x: lerp(prev.x, targetOffset.x, 0.25),
          y: lerp(prev.y, targetOffset.y, 0.25)
        };
      });
      if (running) requestAnimationFrame(animate);
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

  // Update background color based on animation value
  useEffect(() => {
    const listenerId = bgColorAnim.addListener(({ value }) => {
      // Interpolate: 0 = #000 (pure black), 1 = #0a0a0a (very dark, slightly off-black)
      const grayValue = Math.round(value * 10); // 10 = 0x0a
      const hex = grayValue.toString(16).padStart(2, '0');
      setBgColor(`#${hex}${hex}${hex}`);
    });
    return () => {
      bgColorAnim.removeListener(listenerId);
    };
  }, []);

  // No animation for tap circle; render at joystickOrigin directly

  return (
    <View
      style={{ 
        flex: 1, 
        backgroundColor: bgColor,
      }}
      onStartShouldSetResponder={(evt) => {
        // If already in selection mode, detect if another touch is starting
        if (showLines) {
          // Cancel selection if another touch occurs
          handlePressOut();
          return false;
        }
        // Don't capture touches that start in the left edge area (let parent handle swipe gesture)
        const touchX = evt.nativeEvent.locationX;
        return touchX >= LEFT_EDGE_THRESHOLD;
      }}
      onMoveShouldSetResponder={(evt) => {
        // Check for multiple touches during selection
        if (showLines) {
          const touches = evt.nativeEvent.touches || [];
          if (touches.length > 1) {
            // Multiple touches detected - cancel selection
            handlePressOut();
            return false;
          }
          return true; // Maintain responder during selection
        }
        return false;
      }}
      onResponderGrant={handlePressIn}
      onResponderRelease={handlePressOut}
      onResponderTerminate={handlePressOut}
      onResponderMove={event => {
        if (showLines && tapPosition) {
          // Check for multiple touches
          const touches = event.nativeEvent.touches || [];
          if (touches.length > 1) {
            // Multiple touches detected - cancel selection
            handlePressOut();
            return;
          }
          const { locationX, locationY } = event.nativeEvent;
          setFingerPosition({ x: locationX, y: locationY });
        }
      }}
    >
  {/* No outer-most tick circles, just icons for those positions */}
      {/* Center orb - at center position */}
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
          opacity: orbCenterOpacity,
          transform: [{ scale: orbCenterScale }],
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
          opacity: orbCenterOpacity,
          transform: [{ scale: orbCenterScale }],
        }}
      />
      {/* Top orb - at top position (13% from top) */}
      {(() => {
        const topY = screenHeight * 0.13;
        return (
          <>
            <Animated.View
              style={{
                position: 'absolute',
                left: centerX - ringRadius,
                top: topY - ringRadius,
                width: ringRadius * 2,
                height: ringRadius * 2,
                borderRadius: ringRadius,
                borderWidth: ringThickness,
                borderColor: `rgba(${smoothR},${smoothG},${smoothB},0.25)`,
                backgroundColor: 'transparent',
                opacity: orbTopOpacity,
                transform: [{ scale: orbTopScale }],
              }}
            />
            <Animated.View
              style={{
                position: 'absolute',
                left: centerX - innerRadius,
                top: topY - innerRadius,
                width: innerRadius * 2,
                height: innerRadius * 2,
                borderRadius: innerRadius,
                backgroundColor: currentPixel,
                opacity: orbTopOpacity,
                transform: [{ scale: orbTopScale }],
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
        const edge = getEdgeIntersection(rad);
        const distToCenter = Math.sqrt(
          Math.pow(edge.x - centerX, 2) + Math.pow(edge.y - centerY, 2)
        );
        // Move icons closer to center: 55% of the way from center to edge
        let tickLength = distToCenter * 0.55;
        const tipX = centerX + Math.cos(rad) * tickLength;
        const tipY = centerY + Math.sin(rad) * tickLength;
        // Icon size: normal 32, enlarged 32*1.36=43.52
        const iconSize = 32;
        return (
          <Animated.View
            key={needle.Title}
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
            <MaterialIcons name={needle.icon} size={iconSize} color="#fff" />
          </Animated.View>
        );
      })}
      {/* Slide-up menu */}
      {showMenu && (
        <Animated.View
          {...menuPanResponder.panHandlers}
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            top: screenHeight * 0.20, // Leave 20% space at the top
            backgroundColor: '#000',
            borderTopLeftRadius: 35,
            borderTopRightRadius: 35,
            opacity: Animated.multiply(
              menuOpacity,
              menuPanY.interpolate({
                inputRange: [0, screenHeight * 0.12], // Fade out over 12% of screen height
                outputRange: [1, 0],
                extrapolate: 'clamp',
              })
            ),
            transform: [
              { translateY: Animated.add(menuSlideAnim, menuPanY) },
            ],
          }}
        />
      )}
    </View>
  );
}