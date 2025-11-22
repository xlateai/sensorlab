import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Pressable } from 'react-native';
import { Dimensions, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer } from 'expo-sensors';
import { Svg, Circle, Line, Defs, LinearGradient, Stop, Path } from 'react-native-svg';


const PIXEL_WIDTH = 256;
const BUFFER_SIZE = 64;

export default function ModeZero() {
  // Gesture state for double-tap-and-hold
  const [showLines, setShowLines] = useState(false);
  const lastTapRef = useRef<number>(0);
  const tapTimeoutRef = useRef<any>(null);
  const [tapPosition, setTapPosition] = useState<{x: number, y: number} | null>(null);

  // Handler for double-tap-and-hold
  const handlePressIn = (event: any) => {
    const now = Date.now();
    const { locationX, locationY } = event.nativeEvent;
    if (now - lastTapRef.current < 350) {
      // Double-tap detected
      setShowLines(true);
      setTapPosition({ x: locationX, y: locationY });
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    } else {
      // First tap
      lastTapRef.current = now;
      // Reset if no second tap within 350ms
      tapTimeoutRef.current = setTimeout(() => {
        lastTapRef.current = 0;
      }, 350);
      setTapPosition(null);
    }
  };
  const handlePressOut = () => {
    setShowLines(false);
    setTapPosition(null);
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

  // Triangle ticks with tip at inner end and thin base at outer edge
  const ticks = tickAngles.map((angle, idx) => {
    const rad = degToRad(angle);
    const edge = getEdgeIntersection(rad);
    const distToCenter = Math.sqrt(
      Math.pow(edge.x - centerX, 2) + Math.pow(edge.y - centerY, 2)
    );
    const tickLength = distToCenter * 0.2;
    const tipX = edge.x - edge.dx * tickLength;
    const tipY = edge.y - edge.dy * tickLength;
    // Base width (super thin)
    const baseWidth = 4; // px, adjust for thinness
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
        fill={tickColor}
      />
    );
  });

  return (
    <Pressable
      style={{ flex: 1, backgroundColor: '#000' }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
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
        {/* Inner circle */}
        <Circle cx={centerX} cy={centerY} r={innerRadius} fill={currentPixel} />
      </Svg>
    </Pressable>
  );
}