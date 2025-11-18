
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function HomeScreen() {
  const [motionData, setMotionData] = useState(null);
  const originRef = useRef(null);

  useEffect(() => {
    let subscription = DeviceMotion.addListener(data => {
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
  const compassSize = 200;
  const center = compassSize / 2;
  const dotRadius = 8;
  // The dot should start at the top center (0 radians = top)
  // As the device rotates, the dot moves around the circumference, always pointing to the original orientation
  // Initial yaw (origin) is set when the app starts
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
  // Dot angle: 0 radians is top, positive is clockwise
  const dotAngle = relativeYaw; // invert direction so left turn moves dot rightward
  const dotX = center + (center - dotRadius) * Math.sin(dotAngle);
  const dotY = center - (center - dotRadius) * Math.cos(dotAngle);

  return (
    <View style={styles.container}>
      <View style={{ width: compassSize, height: compassSize, borderRadius: compassSize / 2, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center', backgroundColor: '#222', marginBottom: 24 }}>
        <View style={{ position: 'absolute', left: dotX - dotRadius, top: dotY - dotRadius, width: dotRadius * 2, height: dotRadius * 2, borderRadius: dotRadius, backgroundColor: '#39ff14', shadowColor: '#39ff14', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.8, shadowRadius: 8 }} />
      </View>
      <Button title="Re-Origin" onPress={handleReOrigin} color="#39ff14" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
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
