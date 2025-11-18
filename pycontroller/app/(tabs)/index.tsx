
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
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

  // Calculate offset and orientation
  let offset = { x: 0, y: 0, z: 0 };
  let yaw = 0, pitch = 0, roll = 0;
  if (motionData && originRef.current) {
    const pos = motionData.accelerationIncludingGravity;
    const originPos = originRef.current.position;
    offset = {
      x: pos.x - originPos.x,
      y: pos.y - originPos.y,
      z: pos.z - originPos.z,
    };
    const rot = motionData.rotation;
    yaw = rot.alpha;
    pitch = rot.beta;
    roll = rot.gamma;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Device Motion Reader</Text>
      <Text style={styles.label}>Yaw: {yaw.toFixed(2)}</Text>
      <Text style={styles.label}>Pitch: {pitch.toFixed(2)}</Text>
      <Text style={styles.label}>Roll: {roll.toFixed(2)}</Text>
      <Text style={styles.label}>Offset from Origin:</Text>
      <Text style={styles.value}>x: {offset.x.toFixed(2)}</Text>
      <Text style={styles.value}>y: {offset.y.toFixed(2)}</Text>
      <Text style={styles.value}>z: {offset.z.toFixed(2)}</Text>
      <Text style={styles.instructions}>Move your device to see changes. Origin is set at app start.</Text>
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
