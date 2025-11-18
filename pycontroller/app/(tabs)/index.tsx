
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Button, View, Pressable } from 'react-native';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import Svg, { Circle } from 'react-native-svg';

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

  // Re-origin handler
  const handleReOrigin = () => {
    if (motionData) {
      initialYawRef.current = motionData.rotation.alpha;
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
    relativeYaw = motionData.rotation.alpha - initialYawRef.current;
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
  const dotAngle = relativeYaw;
  const dotX = circleCenterX + ringRadius * Math.sin(dotAngle);
  const dotY = circleCenterY - ringRadius * Math.cos(dotAngle);

  // Touch handlers
  const handlePressIn = (event: any) => {
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < 1000) {
      // Get tap position relative to the whole screen
      const { pageX, pageY } = event.nativeEvent;
      setRedDotPos({ x: pageX, y: pageY });
      setShowRedDot(true);
      if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
    }
    lastTapRef.current = now;
  };

  const handlePressOut = () => {
    if (showRedDot) {
      setShowRedDot(false);
      setRedDotPos(null);
    }
  };

  return (
    <Pressable
      style={{ flex: 1 }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Svg
        width={compassSize}
        height={compassSize}
        style={{ position: 'absolute', left: (screenWidth - compassSize) / 2, top: (screenHeight - compassSize) / 2, backgroundColor: 'transparent' }}
      >
        <Circle cx={circleCenterX} cy={circleCenterY} r={ringRadius} stroke="#fff" strokeWidth={ringStroke} fill="none" />
        <Circle cx={dotX} cy={dotY} r={dotRadius} fill="#39ff14" />
      </Svg>
      {showRedDot && redDotPos && (
        <View
          style={{
            position: 'absolute',
            left: redDotPos.x - 3,
            top: redDotPos.y - 3,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: 'red',
            zIndex: 100,
          }}
        />
      )}
      <View
        style={{ position: 'absolute', left: '50%', bottom: 80, transform: [{ translateX: -75 }], width: 150, alignItems: 'center', zIndex: 20 }}
      >
        <Button title="Re-Origin" onPress={handleReOrigin} color="#39ff14" />
      </View>
    </Pressable>
  );
}

