
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import { DeviceMotion } from 'expo-sensors';

export default function HomeScreen() {
  // Handler to reset positional origin only
  const handlePositionalReOrigin = () => {
    if (motionData && originRef.current) {
      originRef.current.position = motionData.accelerationIncludingGravity;
      setPosition({ x: 0, y: 0, z: 0 });
    } else if (motionData) {
      originRef.current = {
        position: motionData.accelerationIncludingGravity,
        orientation: motionData.rotation,
      };
      setPosition({ x: 0, y: 0, z: 0 });
    }
  };

  // Handler to reset rotational origin only
  const handleRotationalReOrigin = () => {
    if (motionData && originRef.current) {
      originRef.current.orientation = motionData.rotation;
    } else if (motionData) {
      originRef.current = {
        position: motionData.accelerationIncludingGravity,
        orientation: motionData.rotation,
      };
    }
  };
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

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Device Motion Reader</Text>
      <Text style={styles.label}>Yaw: {yaw.toFixed(2)}</Text>
      <Text style={styles.label}>Pitch: {pitch.toFixed(2)}</Text>
      <Text style={styles.label}>Roll: {roll.toFixed(2)}</Text>
  <Text style={styles.label}>Acceleration (dx, dy, dz):</Text>
  <Text style={styles.value}>dx: {dx.toFixed(2)}</Text>
  <Text style={styles.value}>dy: {dy.toFixed(2)}</Text>
  <Text style={styles.value}>dz: {dz.toFixed(2)}</Text>
  <Text style={styles.label}>Tracked Position (x, y, z):</Text>
  <Text style={styles.value}>x: {position.x.toFixed(2)}</Text>
  <Text style={styles.value}>y: {position.y.toFixed(2)}</Text>
  <Text style={styles.value}>z: {position.z.toFixed(2)}</Text>
      <Text style={styles.instructions}>Move your device to see changes. Origin is set at app start.</Text>
  <Text style={styles.instructions}>Note: dx, dy, dz may fluctuate due to sensor noise even when the phone is still.</Text>
      <Button title="Positional Re-Origin" onPress={handlePositionalReOrigin} />
      <Button title="Rotational Re-Origin" onPress={handleRotationalReOrigin} />
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
