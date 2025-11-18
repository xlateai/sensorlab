
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import { DeviceMotion, DeviceMotionMeasurement } from 'expo-sensors';
import Svg, { Circle } from 'react-native-svg';

type Origin = {
  position: DeviceMotionMeasurement['accelerationIncludingGravity'];
  orientation: DeviceMotionMeasurement['rotation'];
};

export default function HomeScreen() {
  const [motionData, setMotionData] = useState<DeviceMotionMeasurement | null>(null);
  const originRef = useRef<Origin | null>(null);

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

  // Track if initial re-origin has occurred
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (motionData && !isLoaded) {
      setIsLoaded(true);
    }
  }, [motionData, isLoaded]);

  useEffect(() => {
    if (isLoaded) {
      handleReOrigin();
    }
  }, [isLoaded]);

  // Calculate offset and orientation
  let dx = 0, dy = 0, dz = 0;
  let yaw = 0, pitch = 0, roll = 0;
  if (motionData && originRef.current) {
    const acc = motionData.accelerationIncludingGravity;
    const originAcc = originRef.current.position;
    dx = acc.x - originAcc.x;
    dy = acc.y - originAcc.y;
    dz = acc.z - originAcc.z;
    const rot = motionData.rotation;
    yaw = rot.alpha;
    pitch = rot.beta;
    roll = rot.gamma;
  }

  // Tracked position state
  const [position, setPosition] = useState({ x: 0, y: 0, z: 0 });

  // Update tracked position by adding dx, dy, dz each measurement
  useEffect(() => {
    if (motionData && originRef.current) {
      setPosition(prev => ({
        x: prev.x + dx,
        y: prev.y + dy,
        z: prev.z + dz,
      }));
    }
  }, [dx, dy, dz]);

  // Compass visualization
  const { width: screenWidth, height: screenHeight } = require('react-native').Dimensions.get('window');
  const compassSize = 200;
  const center = compassSize / 2;
  const dotRadius = 8;
  const ringStroke = 2;
  const ringRadius = center - ringStroke / 2;
  const svgHeight = compassSize + ringRadius;
  const circleCenterX = center;
  const circleCenterY = compassSize;
  const initialYawRef = useRef<number | null>(null);

  // Re-origin handler
  const handleReOrigin = () => {
    if (motionData) {
      initialYawRef.current = yaw;
    }
  };

  // Set origin on first load
  useEffect(() => {
    if (motionData && initialYawRef.current === null) {
      initialYawRef.current = yaw;
    }
  }, [motionData]);

  // Calculate relative angle from initial orientation
  const relativeYaw = initialYawRef.current !== null ? yaw - initialYawRef.current : 0;
  // Dot angle: 0 radians is straight up from the bottom, positive is clockwise
  const dotAngle = relativeYaw;
  // Dot sits exactly on the ring, rotating around the bottom center
  const dotX = circleCenterX + ringRadius * Math.sin(dotAngle);
  const dotY = circleCenterY - ringRadius * Math.cos(dotAngle);

  return (
    <View style={styles.container}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View style={{
          width: compassSize,
          height: svgHeight,
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}>
          <Svg width={compassSize} height={svgHeight} style={{ position: 'absolute', left: 0, top: 0 }}>
            {/* Circle center is now at the very bottom */}
            <Circle cx={circleCenterX} cy={circleCenterY} r={ringRadius} stroke="#fff" strokeWidth={ringStroke} fill="none" />
          </Svg>
          {/* Display dot (device heading) */}
          <View style={{ position: 'absolute', left: dotX - dotRadius, top: dotY - dotRadius, width: dotRadius * 2, height: dotRadius * 2, borderRadius: dotRadius, backgroundColor: '#39ff14', shadowColor: '#39ff14', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8 }} />
        </View>
      </View>
      <View style={styles.bottomButtonContainer}>
        <Button title="Re-Origin" onPress={handleReOrigin} color="#39ff14" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  centeredCompassContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    margin: 0,
  },
  bottomButtonContainer: {
    width: '100%',
    paddingBottom: 32,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  header: {
    fontSize: 24,
    color: '#fff',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 18,
    color: '#fff',
    marginTop: 8,
  },
  value: {
    fontSize: 16,
    color: '#fff',
  },
  instructions: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 24,
    textAlign: 'center',
  },
});
