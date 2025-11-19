
import React, { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { Dimensions, Button, View, Pressable, Text } from 'react-native';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

type Origin = {
  position: DeviceMotionMeasurement['accelerationIncludingGravity'];
  orientation: DeviceMotionMeasurement['rotation'];
};

export default function DirectionalScreen() {
  // Device motion state
  const [motionData, setMotionData] = useState<DeviceMotionMeasurement | null>(null);
  const originRef = useRef<{ position: DeviceMotionMeasurement['accelerationIncludingGravity']; orientation: DeviceMotionMeasurement['rotation']; } | null>(null);
  const initialYawRef = useRef<number | null>(null);

  // Smooth compass angle state
  const [smoothYaw, setSmoothYaw] = useState(0);
  const targetYawRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);

  // Double-tap state
  const [showRedDot, setShowRedDot] = useState(false);
  const [redDotPos, setRedDotPos] = useState<{x: number, y: number} | null>(null);
  const [fingerPos, setFingerPos] = useState<{x: number, y: number} | null>(null);
  const lastTapRef = useRef<number | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const subscription = DeviceMotion.addListener((data: DeviceMotionMeasurement) => {
        setMotionData(data);
      });
      DeviceMotion.setUpdateInterval(15); // Fastest update interval (about 60Hz)
      return () => {
        subscription && subscription.remove();
      };
    }, [])
  );

  // Set origin on first data
  useEffect(() => {
    if (motionData && !originRef.current) {
      originRef.current = {
        position: motionData.accelerationIncludingGravity,
        orientation: motionData.rotation,
      };
    }
  }, [motionData]);

  // Re-origin handler, optionally set by angle
  const handleReOrigin = (angle?: number) => {
    if (motionData) {
      if (typeof angle === 'number') {
        initialYawRef.current = angle;
      } else {
        initialYawRef.current = motionData.rotation.alpha;
      }
    }
  };

  // Set origin on first load
  useEffect(() => {
    if (motionData && initialYawRef.current === null) {
      initialYawRef.current = motionData.rotation.alpha;
    }
  }, [motionData]);

  // Calculate relative angle from initial orientation
  let relativeYaw = 0;
  if (motionData && initialYawRef.current !== null) {
    // Correct rotational direction
    relativeYaw = motionData.rotation.alpha - initialYawRef.current;
  }
  // Set targetYawRef for animation
  targetYawRef.current = relativeYaw;

  // Animation loop for smoothYaw
  useEffect(() => {
    function animate() {
      setSmoothYaw(prev => {
        // Interpolate toward targetYawRef.current
        const lerp = 1.0; // increased smoothing factor for faster animation
        const diff = targetYawRef.current - prev;
        // Handle wrap-around for angles
        let delta = diff;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        if (delta < -Math.PI) delta += 2 * Math.PI;
        const next = prev + delta * lerp;
        return next;
      });
      animationFrameRef.current = requestAnimationFrame(animate);
    }
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    };
  }, []);

  // Compass visualization
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const compassSize = Math.min(screenWidth, screenHeight) * 0.8;
  const center = compassSize / 2;
  const dotRadius = 12;
  const levelingRadius = dotRadius * 1.5; // 20% bigger for leveling slot
  const ringStroke = 2; // thinner ring
  const ringRadius = center - ringStroke / 2 - dotRadius;
  const circleCenterX = center;
  const circleCenterY = center;
  // Dot rotates around the edge
  // Use smoothYaw for super smooth animation
  const dotAngle = smoothYaw;
  const dotX = circleCenterX + ringRadius * Math.sin(dotAngle);
  const dotY = circleCenterY - ringRadius * Math.cos(dotAngle);

    // Tick marks at 0°, 90°, 180°, 270°
    const tickAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
  const tickLength = 12; // total length
  const tickStroke = 1.2; // thinner
  const tickColor = '#888'; // gray
    const tickMarks = tickAngles.map((angle, idx) => {
  // Start half inside, end half outside
  const x1 = circleCenterX + (ringRadius - tickLength / 2) * Math.sin(angle);
  const y1 = circleCenterY - (ringRadius - tickLength / 2) * Math.cos(angle);
  const x2 = circleCenterX + (ringRadius + tickLength / 2) * Math.sin(angle);
  const y2 = circleCenterY - (ringRadius + tickLength / 2) * Math.cos(angle);
      return (
        <Line
          key={`tick-${idx}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={tickColor}
          strokeWidth={tickStroke}
        />
      );
    });

    // Haptic feedback when green dot enters tick zone
    const DEG_TO_RAD = Math.PI / 180;
    const TICK_ZONE = 0.5 * DEG_TO_RAD; // ±0.5° in radians
    const [lastTickIndex, setLastTickIndex] = useState<number | null>(null);
    useEffect(() => {
      // Normalize dotAngle to [0, 2π)
      let normAngle = dotAngle % (2 * Math.PI);
      if (normAngle < 0) normAngle += 2 * Math.PI;
      let enteredTick = null;
      for (let i = 0; i < tickAngles.length; i++) {
        let tick = tickAngles[i];
        let diff = Math.abs(normAngle - tick);
        // Handle wrap-around
        if (diff > Math.PI) diff = 2 * Math.PI - diff;
        if (diff <= TICK_ZONE) {
          enteredTick = i;
          break;
        }
      }
      if (enteredTick !== null && enteredTick !== lastTickIndex) {
        // Haptics.selectionAsync();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setLastTickIndex(enteredTick);
      } else if (enteredTick === null && lastTickIndex !== null) {
        setLastTickIndex(null);
      }
    }, [dotAngle]);

  // North and South indicator dots (true north/south using device heading)
  const indicatorRadius = 6;
  let northX = circleCenterX;
  let northY = circleCenterY;
  let southX = circleCenterX;
  let southY = circleCenterY;
  if (motionData && motionData.rotation) {
  // Use alpha (yaw) for compass direction (true north/south)
  const { alpha } = motionData.rotation;
  // Subtract 90 degrees (Math.PI/2 radians) so north is at the top
  const compassAngle = (alpha || 0) - Math.PI / 2;
  // North indicator (white)
  northX = circleCenterX + ringRadius * Math.sin(compassAngle);
  northY = circleCenterY - ringRadius * Math.cos(compassAngle);
  // South indicator (red, opposite direction, add 180°)
  southX = circleCenterX + ringRadius * Math.sin(compassAngle + Math.PI);
  southY = circleCenterY - ringRadius * Math.cos(compassAngle + Math.PI);
  }

  // Double tap to enable reorigin drag/line
  const DOUBLE_TAP_DELAY = 300; // ms
  const [readyForDrag, setReadyForDrag] = useState(false);

  const handlePressIn = (event: any) => {
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      // Double tap detected
      setReadyForDrag(true);
      const { pageX, pageY } = event.nativeEvent;
      setRedDotPos({ x: pageX, y: pageY });
      setFingerPos({ x: pageX, y: pageY });
      setShowRedDot(true);
    } else {
      setReadyForDrag(false);
      setShowRedDot(false);
      setRedDotPos(null);
      setFingerPos(null);
    }
    lastTapRef.current = now;
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
  };

  const handlePressMove = (event: any) => {
    if (readyForDrag && showRedDot) {
      const { pageX, pageY } = event.nativeEvent;
      setFingerPos({ x: pageX, y: pageY });
    }
  };

  const handlePressOut = () => {
    if (readyForDrag && showRedDot) {
      // Only re-origin if finger is past faded distance
      if (redDotPos && fingerPos) {
        const dx = fingerPos.x - redDotPos.x;
        const dy = fingerPos.y - redDotPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 7 * redDotRadius) {
          // Calculate angle from drag direction
          const dragAngle = Math.atan2(dy, dx);
          // The top of the circle is -Math.PI/2 in SVG coordinates
          const topOfCircleAngle = -Math.PI / 2;
          // Offset so that drag up means 'top' (like button)
          const angleOffset = topOfCircleAngle - dragAngle;
          // Call re-origin with current rotation plus offset
          if (motionData) {
            handleReOrigin(motionData.rotation.alpha + angleOffset);
          }
        }
      }
      setShowRedDot(false);
      setRedDotPos(null);
      setFingerPos(null);
      setReadyForDrag(false);
    }
  };

  // Calculate opacity based on distance between red dot and finger
  const redDotRadius = 6;
  let dotOpacity = 0.3;
  let lineOpacity = 0.2;
  if (showRedDot && redDotPos && fingerPos) {
    const dx = fingerPos.x - redDotPos.x;
    const dy = fingerPos.y - redDotPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 7 * redDotRadius) { // 7 multiples of radius
      dotOpacity = 1;
      lineOpacity = 1;
    } else {
      dotOpacity = 0.3;
      lineOpacity = 0.2;
    }
  }

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onTouchMove={handlePressMove}
    >
      <Svg
        width={compassSize}
        height={compassSize}
        style={{ position: 'absolute', left: (screenWidth - compassSize) / 2, top: (screenHeight - compassSize) / 2, backgroundColor: 'transparent' }}
      >
        {/* Outer ring */}
        <Circle cx={circleCenterX} cy={circleCenterY} r={ringRadius} stroke="#fff" strokeWidth={ringStroke} fill="none" />

          {/* Tick marks at top, right, bottom, left */}
          {tickMarks}

        {/* Center invisible circle with thin border */}
        <Circle
          cx={circleCenterX}
          cy={circleCenterY}
          r={levelingRadius}
          stroke="#aaa"
          strokeWidth={1.5}
          fill="none"
          opacity={0.3}
        />

        {/* Gravity-based moving circle */}
        {(() => {
          // Default to center
          let rotX = circleCenterX;
          let rotY = circleCenterY;
          let rotColor = 'rgba(128,128,128,0.3)';
          if (motionData && motionData.rotation) {
            // Convert alpha, beta, gamma (in radians) to 3D orientation vector
            // See: https://w3c.github.io/deviceorientation/#deviceorientation
            const { alpha, beta, gamma } = motionData.rotation;
            // Rotation matrix from Euler angles
            // Z (alpha), X' (beta), Y'' (gamma)
            // We'll use the orientation of the device's z-axis in world coordinates
            // Calculate the direction vector (x, y, z)
            // Reference: https://stackoverflow.com/a/57851999
            const _alpha = alpha || 0;
            const _beta = beta || 0;
            const _gamma = gamma || 0;
            // Calculate vector
            const x = Math.cos(_beta) * Math.sin(_gamma);
            const y = Math.sin(_beta);
            const z = Math.cos(_beta) * Math.cos(_gamma);
            // Project to 2D (x, y)
            const maxOffset = ringRadius - levelingRadius;
            // Normalize to unit vector
            const mag = Math.sqrt(x * x + y * y + z * z);
            const px = x / mag;
            const py = y / mag;
            // Use px, py for dot position
            let dx = px * maxOffset;
            let dy = py * maxOffset;
            // Clamp to circle boundary
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > maxOffset) {
              dx = dx * maxOffset / dist;
              dy = dy * maxOffset / dist;
            }
            rotX = circleCenterX + dx;
            rotY = circleCenterY + dy;
            // If device is level (y near 0, x near 0), color green
            if (Math.abs(px) < 0.01 && Math.abs(py) < 0.01) {
              rotColor = 'rgba(57,255,20,0.7)'; // bright green
            }
          }
          return (
            <Circle
              cx={rotX}
              cy={rotY}
              r={levelingRadius}
              fill={rotColor}
              stroke="none"
            />
          );
        })()}

        {/* North and South indicator dots */}
        <Circle cx={northX} cy={northY} r={indicatorRadius} fill="#fff" />
        <Circle cx={southX} cy={southY} r={indicatorRadius} fill="red" />
        {/* Main green dot */}
        <Circle cx={dotX} cy={dotY} r={dotRadius} fill="#39ff14" />
        {/* Bearing label for green dot (static, relative to north) */}
        {(() => {
          // Calculate label position between dot and center
          const labelRatio = 0.7; // 70% from center to dot (inside)
          const labelX = circleCenterX + (dotX - circleCenterX) * labelRatio;
          const labelY = circleCenterY + (dotY - circleCenterY) * labelRatio;
          // Calculate static relative bearing (degrees)
          let staticRelativeBearing = 0;
          if (initialYawRef.current !== null) {
            // North is 0, east is 90, south is 180, west is 270
            staticRelativeBearing = (360-((initialYawRef.current + Math.PI - Math.PI / 2) * 180 / Math.PI) % 360) % 360;
          }
          // Show as integer degrees
          return (
            <SvgText
              x={labelX}
              y={labelY}
              fill="#fff"
              fontSize={13}
              fontWeight="bold"
              textAnchor="middle"
              alignmentBaseline="middle"
            >
              {`${staticRelativeBearing.toFixed(0)}°`}
            </SvgText>
          );
        })()}
        {/* White direction line from center */}
        {showRedDot && redDotPos && fingerPos && (
          (() => {
            // ...existing code...
            // Calculate direction from red dot to finger
            const dx = fingerPos.x - redDotPos.x;
            const dy = fingerPos.y - redDotPos.y;
            const angle = Math.atan2(dy, dx);
            // Line length is proportional to distance between red dot and finger, capped at full ringRadius
            const dist = Math.sqrt(dx * dx + dy * dy);
            const maxLen = ringRadius;
            const len = Math.min(dist, maxLen);
            // Opacity logic for white line
            const whiteLineOpacity = dist > 7 * redDotRadius ? 1 : 0.2;
            const x2 = circleCenterX + Math.cos(angle) * len;
            const y2 = circleCenterY + Math.sin(angle) * len;
            return (
              <Line
                x1={circleCenterX}
                y1={circleCenterY}
                x2={x2}
                y2={y2}
                stroke="#fff"
                strokeWidth={2}
                opacity={whiteLineOpacity}
              />
            );
          })()
        )}
      </Svg>
      {/* Debug overlay for beta/gamma values */}
      {motionData && motionData.rotation && (
        <View style={{ position: 'absolute', left: 10, top: 10, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 8 }}>
          <Text style={{ color: '#fff', fontSize: 12 }}>beta: {motionData.rotation.beta?.toFixed(2)}</Text>
          <Text style={{ color: '#fff', fontSize: 12 }}>gamma: {motionData.rotation.gamma?.toFixed(2)}</Text>
        </View>
      )}
      {/* Overlay SVG for red dot and line */}
      {showRedDot && redDotPos && (
        <Svg
          width={screenWidth}
          height={screenHeight}
          style={{ position: 'absolute', left: 0, top: 0, zIndex: 100 }}
        >
          <Circle
            cx={redDotPos.x}
            cy={redDotPos.y}
            r={6}
            fill="red"
            opacity={dotOpacity}
          />
          {fingerPos && (
            <Line
              x1={redDotPos.x}
              y1={redDotPos.y}
              x2={fingerPos.x}
              y2={fingerPos.y}
              stroke="red"
              strokeWidth={2}
              opacity={lineOpacity}
            />
          )}
        </Svg>
      )}
    </Pressable>
  );
}

