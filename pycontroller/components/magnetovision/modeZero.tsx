import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Text, Animated } from 'react-native';
// ...existing code...
import { Dimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer, DeviceMotion } from 'expo-sensors';
import { Svg, Circle, Line, Defs, LinearGradient, Stop, Path } from 'react-native-svg';


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
  const [fingerPosition, setFingerPosition] = useState<{x: number, y: number} | null>(null);
  // Animated state for circle and needle
  const [animatedOffset, setAnimatedOffset] = useState<{x: number, y: number}>({ x: 0, y: 0 });
  const [animatedNeedle, setAnimatedNeedle] = useState<{idx: number | null, scale: number, brightness: number}>({ idx: null, scale: 1, brightness: 0.45 });

  // Handler for double-tap-and-hold
  const handlePressIn = (event: any) => {
    const now = Date.now();
    const { locationX, locationY } = event.nativeEvent;
    if (now - lastTapRef.current < 350) {
      // Double-tap detected
      setShowLines(true);
      setTapPosition({ x: locationX, y: locationY });
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

  // Use react-native-svg for rendering
  const Svg = require('react-native-svg').Svg;
  const Circle = require('react-native-svg').Circle;

  const centerX = screenWidth / 2;
  const centerY = canvasHeight / 2;

  // Dial tick rendering
  const tickThickness = 2.5; // thicker lines
  const tickColor = 'rgba(216,216,216,0.45)'; // silvery and faded
  // 8 angles: 0, 45, 90, 135, 180, 225, 270, 315 degrees
  const tickAngles = [0, 45, 90, 135, 180, 225, 270, 315];
  // Needles array with Title property
  const needles = [
    { idx: 0, Title: 'Hi' },      // Left needle (0 degrees)
    { idx: 4, Title: 'There' },   // Right needle (180 degrees)
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
  let targetNeedle = { idx: animatedNeedle.idx, scale: animatedNeedle.scale, brightness: animatedNeedle.brightness };
  if (showLines && tapPosition && fingerPosition) {
    const dx = fingerPosition.x - tapPosition.x;
    const dy = fingerPosition.y - tapPosition.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 18; // 50% of previous reach
    const moveDist = Math.min(dist, maxDist);
    const angleRad = Math.atan2(dy, dx);
    targetOffset.x = Math.cos(angleRad) * moveDist;
    targetOffset.y = Math.sin(angleRad) * moveDist;
    joystickAtMax = dist >= maxDist - 0.5;
    let newIdx: number | null = null;
    let newScale = 1;
    let newBrightness = 0.45;
    if (joystickAtMax) {
      joystickAngle = angleRad * 180 / Math.PI;
      if (joystickAngle < 0) joystickAngle += 360;
      // Find nearest tick
      if (joystickAngle !== null) {
        let minDiff = 999;
        tickAngles.forEach((angle, idx) => {
          if (joystickAngle !== null) {
            let diff = Math.abs(angle - joystickAngle);
            if (diff > 180) diff = 360 - diff;
            if (diff < minDiff) {
              minDiff = diff;
              newIdx = idx;
            }
          }
        });
        newScale = 1.7;
        newBrightness = 0.85;
      }
    }
    targetNeedle = {
      idx: newIdx,
      scale: newScale,
      brightness: newBrightness
    };
  } else {
    targetOffset = { x: 0, y: 0 };
    // Always interpolate back to normal state
    targetNeedle = { idx: null, scale: 1, brightness: 0.45 };
  }

  // Animation loop for interpolation
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
      setAnimatedNeedle(prev => {
        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
        // If targetNeedle.idx is null, keep previous idx until scale/brightness are nearly normal
        let nextIdx = prev.idx;
        if (targetNeedle.idx === null) {
          const scaleClose = Math.abs(prev.scale - 1) < 0.01;
          const brightClose = Math.abs(prev.brightness - 0.45) < 0.01;
          if (scaleClose && brightClose) {
            nextIdx = null;
          }
        } else {
          nextIdx = targetNeedle.idx;
        }
        return {
          idx: nextIdx,
          scale: lerp(prev.scale, targetNeedle.scale, 0.18),
          brightness: lerp(prev.brightness, targetNeedle.brightness, 0.18)
        };
      });
      if (running) requestAnimationFrame(animate);
    }
    animate();
    return () => { running = false; };
  }, [targetOffset.x, targetOffset.y, targetNeedle.idx, targetNeedle.scale, targetNeedle.brightness]);

  // Triangle ticks with tip at inner end and thin base at outer edge
  const ticks = tickAngles.map((angle, idx) => {
    const rad = degToRad(angle);
    const edge = getEdgeIntersection(rad);
    const distToCenter = Math.sqrt(
      Math.pow(edge.x - centerX, 2) + Math.pow(edge.y - centerY, 2)
    );
    // Animated highlight
    let tickLength = distToCenter * 0.2;
    let baseWidth = 4;
    let fillColor = tickColor;
    if (animatedNeedle.idx === idx) {
      tickLength *= animatedNeedle.scale;
      baseWidth *= animatedNeedle.scale;
      fillColor = `rgba(255,255,255,${animatedNeedle.brightness})`;
    }
    const tipX = edge.x - edge.dx * tickLength;
    const tipY = edge.y - edge.dy * tickLength;
    // Perpendicular direction
    const perpDx = -edge.dy;
    const perpDy = edge.dx;
    // Base points
    const baseX1 = edge.x + perpDx * (baseWidth / 2);
    const baseY1 = edge.y + perpDy * (baseWidth / 2);
    const baseX2 = edge.x - perpDx * (baseWidth / 2);
    const baseY2 = edge.y - perpDy * (baseWidth / 2);
    // Triangle path
    const trianglePath = `M${baseX1},${baseY1} L${baseX2},${baseY2} L${tipX},${tipY} Z`;
    return (
      <Path
        key={angle}
        d={trianglePath}
        fill={fillColor}
      />
    );
  });

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
      <Svg width={screenWidth} height={canvasHeight} style={{ position: 'absolute', left: 0, top: 0 }}>
        {/* Dial ticks (conditionally rendered) */}
        {showLines && ticks}
        {/* Silver circle at second tap location */}
        {showLines && tapPosition && (
          <Circle
            cx={tapPosition.x}
            cy={tapPosition.y}
            r={11.9}
            fill="none"
            stroke="#C0C0C0"
            strokeWidth={1.2}
          />
        )}
        {/* Outer ring (always visible) */}
        <Circle
          cx={centerX}
          cy={centerY}
          r={ringRadius}
          fill="none"
          stroke={`rgba(${smoothR},${smoothG},${smoothB},0.25)`}
          strokeWidth={ringThickness}
        />
        {/* Inner circle, joystick offset */}
        {/* Animated inner circle, joystick offset */}
        <Circle
          cx={centerX + animatedOffset.x}
          cy={centerY + animatedOffset.y}
          r={innerRadius}
          fill={currentPixel}
        />
      </Svg>
      {/* Render needle titles at the tip of each needle, only when needles are shown */}
      {showLines && needles.map((needle, i) => {
        const angle = tickAngles[needle.idx];
        const rad = degToRad(angle);
        const edge = getEdgeIntersection(rad);
        const distToCenter = Math.sqrt(
          Math.pow(edge.x - centerX, 2) + Math.pow(edge.y - centerY, 2)
        );
        let tickLength = distToCenter * 0.2;
        if (animatedNeedle.idx === needle.idx) {
          tickLength *= animatedNeedle.scale;
        }
        const tipX = edge.x - edge.dx * tickLength;
        const tipY = edge.y - edge.dy * tickLength;
        return (
          <Animated.View
            key={needle.Title}
            style={{
              position: 'absolute',
              left: tipX - 20,
              top: tipY - 12,
              transform: [{
                rotate: rotationAnim.interpolate({
                  inputRange: [-360, 360],
                  outputRange: ['-360deg', '360deg'],
                  extrapolate: 'clamp',
                })
              }],
            }}
          >
            <Text style={{ color: '#fff', fontSize: 18 }}>{needle.Title}</Text>
          </Animated.View>
        );
      })}
  </View>
  );
}