import React, { useEffect, useState } from 'react';
import { Dimensions } from 'react-native';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';

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

  // Arrow to north logic
  let northArrow = null;
  if (motionData && motionData.rotation) {
    const { alpha = 0 } = motionData.rotation;
  // North is at angle (alpha - Math.PI/2 + Math.PI)
  const northAngle = (alpha || 0) - Math.PI / 2 + Math.PI;
    // Arrow length
    const arrowLength = ringRadius * 0.8;
    // Arrow endpoint
    const arrowX = circleCenterX + arrowLength * Math.sin(northAngle);
    const arrowY = circleCenterY - arrowLength * Math.cos(northAngle);
    // Arrowhead size
    const headLength = 18;
    const headAngle = Math.PI / 7;
    // Arrowhead points
    const tipX = arrowX;
    const tipY = arrowY;
    const leftX = tipX - headLength * Math.sin(northAngle - headAngle);
    const leftY = tipY + headLength * Math.cos(northAngle - headAngle);
    const rightX = tipX - headLength * Math.sin(northAngle + headAngle);
    const rightY = tipY + headLength * Math.cos(northAngle + headAngle);
    northArrow = (
      <>
        {/* Arrow shaft */}
        <Line x1={circleCenterX} y1={circleCenterY} x2={arrowX} y2={arrowY} stroke="#00f" strokeWidth={4} />
        {/* Arrowhead */}
        <Polygon
          points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
          fill="#00f"
        />
      </>
    );
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
      {/* North arrow */}
      {northArrow}
    </Svg>
  );
}
