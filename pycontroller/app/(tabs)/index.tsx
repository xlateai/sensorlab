
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Button, View, Pressable } from 'react-native';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import Svg, { Circle, Line } from 'react-native-svg';

type Origin = {
  position: DeviceMotionMeasurement['accelerationIncludingGravity'];
  orientation: DeviceMotionMeasurement['rotation'];
};

export default function HomeScreen() {
  // Device motion state
  const [motionData, setMotionData] = useState<DeviceMotionMeasurement | null>(null);
  const originRef = useRef<{ position: DeviceMotionMeasurement['accelerationIncludingGravity']; orientation: DeviceMotionMeasurement['rotation']; } | null>(null);
  const initialYawRef = useRef<number | null>(null);

  // Double-tap state
  const [showRedDot, setShowRedDot] = useState(false);
  const [redDotPos, setRedDotPos] = useState<{x: number, y: number} | null>(null);
  const [fingerPos, setFingerPos] = useState<{x: number, y: number} | null>(null);
  const lastTapRef = useRef<number | null>(null);
  const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const subscription = DeviceMotion.addListener((data: DeviceMotionMeasurement) => {
      setMotionData(data);
    });
    DeviceMotion.setUpdateInterval(100);
    return () => {
      subscription && subscription.remove();
    };
  }, []);

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
    // Reverse the rotational direction
    relativeYaw = -(motionData.rotation.alpha - initialYawRef.current);
  }

  // Compass visualization
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const compassSize = Math.min(screenWidth, screenHeight) * 0.8;
  const center = compassSize / 2;
  const dotRadius = 12;
  const ringStroke = 2; // thinner ring
  const ringRadius = center - ringStroke / 2 - dotRadius;
  const circleCenterX = center;
  const circleCenterY = center;
  // Dot rotates around the edge
  // Add 180 degree (π radians) bias to the dot's rotation
  const dotAngle = relativeYaw + Math.PI;
  const dotX = circleCenterX + ringRadius * Math.sin(dotAngle);
  const dotY = circleCenterY - ringRadius * Math.cos(dotAngle);

  // Touch handlers
  const handlePressIn = (event: any) => {
    const { pageX, pageY } = event.nativeEvent;
    setRedDotPos({ x: pageX, y: pageY });
    setFingerPos({ x: pageX, y: pageY });
    setShowRedDot(true);
    if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
  };

  const handlePressMove = (event: any) => {
    if (showRedDot) {
      const { pageX, pageY } = event.nativeEvent;
      setFingerPos({ x: pageX, y: pageY });
    }
  };

  const handlePressOut = () => {
    if (showRedDot) {
      // Only re-origin if finger is past faded distance
      if (redDotPos && fingerPos) {
        const dx = fingerPos.x - redDotPos.x;
        const dy = fingerPos.y - redDotPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 7 * redDotRadius) {
          const angle = Math.atan2(dy, dx);
          handleReOrigin(angle);
        }
      }
      setShowRedDot(false);
      setRedDotPos(null);
      setFingerPos(null);
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
        <Circle cx={circleCenterX} cy={circleCenterY} r={ringRadius} stroke="#fff" strokeWidth={ringStroke} fill="none" />
        <Circle cx={dotX} cy={dotY} r={dotRadius} fill="#39ff14" />
        {/* White direction line from center */}
        {showRedDot && redDotPos && fingerPos && (
          (() => {
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
      <View
        style={{ position: 'absolute', left: '50%', bottom: 80, transform: [{ translateX: -75 }], width: 150, alignItems: 'center', zIndex: 20 }}
      >
        <Button title="Re-Origin" onPress={handleReOrigin} color="#39ff14" />
      </View>
    </Pressable>
  );
}

