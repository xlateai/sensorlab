import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Button } from 'react-native';
import { DeviceMotion } from 'expo-sensors';
import type { DeviceMotionMeasurement } from 'expo-sensors';

type OriginType = {
  position: DeviceMotionMeasurement['accelerationIncludingGravity'];
  orientation: DeviceMotionMeasurement['rotation'];
};

export default function DevScreen() {
  const [motionData, setMotionData] = useState<DeviceMotionMeasurement | null>(null);
  const originRef = useRef<OriginType | null>(null);

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

  return (
      <View style={styles.container}>
        <Text style={styles.header}>Device Motion Sensor Table</Text>
        <View style={styles.tableContainer}>
          <View style={styles.tableRow}>
            <Text style={styles.tableHeader}>Measurement</Text>
            <Text style={styles.tableHeader}>X</Text>
            <Text style={styles.tableHeader}>Y</Text>
            <Text style={styles.tableHeader}>Z</Text>
            <Text style={styles.tableHeader}>Other</Text>
          </View>
          {/* Acceleration */}
          <View style={styles.tableRow}>
            <Text style={styles.tableMeasurementCell}>acc</Text>
            <Text style={styles.tableCell}>{motionData?.acceleration?.x?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>{motionData?.acceleration?.y?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>{motionData?.acceleration?.z?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>m/s²</Text>
          </View>
          {/* Acceleration Including Gravity */}
          <View style={styles.tableRow}>
            <Text style={styles.tableMeasurementCell}>acc+grav</Text>
            <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.x?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.y?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.z?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>m/s²</Text>
          </View>
          {/* Rotation (Orientation) */}
          <View style={styles.tableRow}>
            <Text style={styles.tableMeasurementCell}>rot</Text>
            <Text style={styles.tableCell}>{motionData?.rotation?.alpha?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>{motionData?.rotation?.beta?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>{motionData?.rotation?.gamma?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>deg</Text>
          </View>
          {/* Rotation Rate */}
          <View style={styles.tableRow}>
            <Text style={styles.tableMeasurementCell}>rotΔ</Text>
            <Text style={styles.tableCell}>{motionData?.rotationRate?.alpha?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>{motionData?.rotationRate?.beta?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>{motionData?.rotationRate?.gamma?.toFixed(3) ?? '-'}</Text>
            <Text style={styles.tableCell}>deg/s</Text>
          </View>
          {/* Interval */}
          <View style={styles.tableRow}>
            <Text style={styles.tableMeasurementCell}>Interval</Text>
            <Text style={styles.tableCell}>{motionData?.interval ?? '-'}</Text>
            <Text style={styles.tableCell}>-</Text>
            <Text style={styles.tableCell}>-</Text>
            <Text style={styles.tableCell}>ms</Text>
          </View>
        </View>
        <Text style={styles.instructions}>All available sensor measurements are shown above. Values update live.</Text>
      </View>
  );
}

const styles = StyleSheet.create({
  tableMeasurementCell: {
    flex: 1,
    color: '#fff',
    textAlign: 'center',
    padding: 2,
  },
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
  tableContainer: {
    borderWidth: 1,
    borderColor: '#444',
    borderRadius: 8,
    marginBottom: 16,
    backgroundColor: '#111',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    paddingVertical: 4,
    paddingHorizontal: 2,
    minHeight: 32,
    alignItems: 'center',
  },
  tableHeader: {
    flex: 1,
    fontWeight: 'bold',
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
    padding: 2,
  },
  tableCell: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    textAlign: 'center',
    padding: 2,
  },
  instructions: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 24,
    textAlign: 'center',
  },
});
