
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

  // Compass visualization
  const compassSize = 200;
  const needleLength = 80;
  const center = compassSize / 2;
  const angle = yaw; // radians
  const needleX = center + needleLength * Math.sin(angle);
  const needleY = center - needleLength * Math.cos(angle);

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Compass</Text>
      <View style={{ width: compassSize, height: compassSize, borderRadius: compassSize / 2, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center', backgroundColor: '#222', marginBottom: 24 }}>
        <View style={{ position: 'absolute', left: center - 4, top: center - 4, width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
        <View style={{ position: 'absolute', left: center, top: center, width: 0, height: 0 }}>
          {/* Needle */}
          <View style={{ position: 'absolute', left: 0, top: 0, width: needleLength, height: 2, backgroundColor: 'red', transform: [{ rotate: `${angle}rad` }], borderRadius: 1 }} />
        </View>
      </View>
      <Text style={styles.label}>Yaw: {yaw.toFixed(2)} rad</Text>
      <Text style={styles.instructions}>Rotate your device to see the compass needle move.</Text>
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
