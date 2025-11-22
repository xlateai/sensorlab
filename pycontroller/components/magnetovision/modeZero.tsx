import React, { useRef, useState, useEffect } from 'react';
import { Animated, Easing } from 'react-native';
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
  // Animated state for circle and needle
  const [animatedOffset, setAnimatedOffset] = useState<{x: number, y: number}>({ x: 0, y: 0 });
  const [selectedNeedle, setSelectedNeedle] = useState<number | null>(null);
  const iconScaleAnim = useRef([new Animated.Value(1), new Animated.Value(1)]).current;
  const iconOpacityAnim = useRef([new Animated.Value(0.45), new Animated.Value(0.45)]).current;

  // Handler for double-tap-and-hold
  const handlePressIn = (event: any) => {
    const now = Date.now();
    const { locationX, locationY } = event.nativeEvent;
    if (now - lastTapRef.current < 350) {
      // Double-tap detected
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
  const handlePressOut = () => {
    setShowLines(false);
    setTapPosition(null);
    setFingerPosition(null);
  };
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const pixelHeight = Math.round((screenHeight / screenWidth) * PIXEL_WIDTH);
  const pixelSize = screenWidth / PIXEL_WIDTH;
  const canvasHeight = pixelHeight * pixelSize;

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
    const maxDist = 18;
    const driftDist = maxDist * 2;
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
    joystickAtMax = dist >= maxDist - 0.5;
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
  } else {
    targetOffset = { x: 0, y: 0 };
    targetNeedleIdx = null;
  }

  // Animate icon scale and opacity
  useEffect(() => {
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
        toValue: targetNeedleIdx === idx ? 0.85 : 0.45,
        duration: 180,
        useNativeDriver: true,
        easing: Easing.inOut(Easing.ease),
      }).start();
    });
    setSelectedNeedle(targetNeedleIdx);
  }, [targetNeedleIdx]);

  // Animation loop for joystick offset only
  useEffect(() => {
    let running = true;
    function animate() {
      setAnimatedOffset(prev => {
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
        return {
          x: lerp(prev.x, targetOffset.x, 0.18),
          y: lerp(prev.y, targetOffset.y, 0.18)
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

  // No animation for tap circle; render at joystickOrigin directly

  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      onStartShouldSetResponder={() => true}
      onResponderGrant={handlePressIn}
      onResponderRelease={handlePressOut}
      onResponderMove={event => {
        if (showLines && tapPosition) {
          const { locationX, locationY } = event.nativeEvent;
          setFingerPosition({ x: locationX, y: locationY });
        }
      }}
    >
  {/* No outer-most tick circles, just icons for those positions */}
      {/* Outer ring (always visible) */}
      <View
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
        }}
      />
      {/* Center joystick (inner circle, joystick offset) */}
      <View
        style={{
          position: 'absolute',
          left: centerX + animatedOffset.x - innerRadius,
          top: centerY + animatedOffset.y - innerRadius,
          width: innerRadius * 2,
          height: innerRadius * 2,
          borderRadius: innerRadius,
          backgroundColor: currentPixel,
        }}
      />
      {/* Render needle titles at the tip of each needle, only when needles are shown */}
      {showLines && needles.map((needle, i) => {
        const rad = degToRad(needle.angle);
        const edge = getEdgeIntersection(rad);
        const distToCenter = Math.sqrt(
          Math.pow(edge.x - centerX, 2) + Math.pow(edge.y - centerY, 2)
        );
        let tickLength = distToCenter * 0.2;
        const tipX = edge.x - edge.dx * tickLength;
        const tipY = edge.y - edge.dy * tickLength;
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
              transform: [{ scale: iconScaleAnim[i] }],
              opacity: iconOpacityAnim[i],
            }}
          >
            <MaterialIcons name={needle.icon} size={iconSize} color="#fff" />
          </Animated.View>
        );
      })}
    </View>
  );
}