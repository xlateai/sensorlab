import React, { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import Svg, { Circle } from 'react-native-svg';

export default function ThreeDScreen() {
  const [motionData, setMotionData] = useState<DeviceMotionMeasurement | null>(null);

  useEffect(() => {
    const subscription = DeviceMotion.addListener(data => {
      setMotionData(data);
    });
    DeviceMotion.setUpdateInterval(24);
    return () => {
      subscription && subscription.remove();
    };
  }, []);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const compassSize = Math.min(screenWidth, screenHeight) * 0.8;
  const center = compassSize / 2;
  const dotRadius = 12;
  const levelingRadius = dotRadius * 1.5;
  const ringStroke = 2;
  const ringRadius = center - ringStroke / 2 - dotRadius;
  const circleCenterX = center;
  const circleCenterY = center;

  // Level ball logic
  let rotX = circleCenterX;
  let rotY = circleCenterY;
  let rotColor = 'rgba(128,128,128,0.3)';
  if (motionData && motionData.rotation) {
    const { alpha = 0, beta = 0, gamma = 0 } = motionData.rotation;
    const x = Math.cos(beta) * Math.sin(gamma);
    const y = Math.sin(beta);
    const z = Math.cos(beta) * Math.cos(gamma);
    const maxOffset = ringRadius - levelingRadius;
    const mag = Math.sqrt(x * x + y * y + z * z);
    const px = x / mag;
    const py = y / mag;
    let dx = px * maxOffset;
    let dy = py * maxOffset;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > maxOffset) {
      dx = dx * maxOffset / dist;
      dy = dy * maxOffset / dist;
    }
    rotX = circleCenterX + dx;
    rotY = circleCenterY + dy;
    if (Math.abs(px) < 0.01 && Math.abs(py) < 0.01) {
      rotColor = 'rgba(57,255,20,0.7)'; // bright green
    }
  }


  return (
    <Svg
      width={compassSize}
      height={compassSize}
      style={{ position: 'absolute', left: (screenWidth - compassSize) / 2, top: (screenHeight - compassSize) / 2, backgroundColor: 'transparent' }}
    >
      {/* Outer ring */}
      <Circle cx={circleCenterX} cy={circleCenterY} r={ringRadius} stroke="#fff" strokeWidth={ringStroke} fill="none" />
      {/* Center inner circle */}
      <Circle cx={circleCenterX} cy={circleCenterY} r={levelingRadius} stroke="#aaa" strokeWidth={1.5} fill="none" opacity={0.3} />
      {/* Level ball */}
      <Circle cx={rotX} cy={rotY} r={levelingRadius} fill={rotColor} stroke="none" />
    </Svg>
  );
}
