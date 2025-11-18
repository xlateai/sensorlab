import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, SafeAreaView, ScrollView } from 'react-native';
import { DeviceMotion, Magnetometer, Gyroscope, Barometer } from 'expo-sensors';
import type { DeviceMotionMeasurement } from 'expo-sensors';

type OriginType = {
  position: DeviceMotionMeasurement['accelerationIncludingGravity'];
  orientation: DeviceMotionMeasurement['rotation'];
};

export default function DevScreen() {
  const [motionData, setMotionData] = useState<DeviceMotionMeasurement | null>(null);
  const [magnetometerData, setMagnetometerData] = useState<{x: number, y: number, z: number} | null>(null);
  const [gyroscopeData, setGyroscopeData] = useState<{x: number, y: number, z: number} | null>(null);
  const [barometerData, setBarometerData] = useState<{pressure: number} | null>(null);

  useEffect(() => {
    const motionSub = DeviceMotion.addListener(setMotionData);
    const magSub = Magnetometer.addListener(setMagnetometerData);
    const gyroSub = Gyroscope.addListener(setGyroscopeData);
    const baroSub = Barometer.addListener(setBarometerData);

    DeviceMotion.setUpdateInterval(100);
    Magnetometer.setUpdateInterval(100);
    Gyroscope.setUpdateInterval(100);
    Barometer.setUpdateInterval(500);

    return () => {
      motionSub && motionSub.remove();
      magSub && magSub.remove();
      gyroSub && gyroSub.remove();
      baroSub && baroSub.remove();
    };
  }, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <Text style={styles.header}>Device Motion Sensor Table</Text>
          {/* Motion Data Table */}
          <View style={[styles.tableContainer, styles.motionTable]}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>Measurement</Text>
              <Text style={styles.tableHeader}>X</Text>
              <Text style={styles.tableHeader}>Y</Text>
              <Text style={styles.tableHeader}>Z</Text>
              <Text style={styles.tableHeader}>Other</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>acc</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.x?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.y?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.z?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>m/s²</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>acc+grav</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.x?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.y?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.z?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>m/s²</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>rot</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.alpha?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.beta?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.gamma?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>deg</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>rotΔ</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.alpha?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.beta?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.gamma?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>deg/s</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>Interval</Text>
              <Text style={styles.tableCell}>{motionData?.interval ?? '-'}</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>ms</Text>
            </View>
          </View>
          {/* Magnetometer Table */}
          <Text style={styles.header}>Magnetometer</Text>
          <View style={[styles.tableContainer, styles.magnetometerTable]}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>Measurement</Text>
              <Text style={styles.tableHeader}>X</Text>
              <Text style={styles.tableHeader}>Y</Text>
              <Text style={styles.tableHeader}>Z</Text>
              <Text style={styles.tableHeader}>Other</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>magnetometer</Text>
              <Text style={styles.tableCell}>{magnetometerData?.x?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{magnetometerData?.y?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{magnetometerData?.z?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>μT</Text>
            </View>
          </View>
          {/* Gyroscope Table */}
          <Text style={styles.header}>Gyroscope</Text>
          <View style={[styles.tableContainer, styles.gyroscopeTable]}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>Measurement</Text>
              <Text style={styles.tableHeader}>X</Text>
              <Text style={styles.tableHeader}>Y</Text>
              <Text style={styles.tableHeader}>Z</Text>
              <Text style={styles.tableHeader}>Other</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>gyroscope</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.x?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.y?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.z?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>rad/s</Text>
            </View>
          </View>
          {/* Barometer Table */}
          <Text style={styles.header}>Barometer</Text>
          <View style={[styles.tableContainer, styles.barometerTable]}>
            <View style={styles.tableRow}>
              <Text style={styles.tableHeader}>Measurement</Text>
              <Text style={styles.tableHeader}>X</Text>
              <Text style={styles.tableHeader}>Y</Text>
              <Text style={styles.tableHeader}>Z</Text>
              <Text style={styles.tableHeader}>Other</Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>barometer</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>{barometerData?.pressure?.toFixed(2) ?? '-'} hPa</Text>
            </View>
          </View>
          <Text style={styles.instructions}>All available sensor measurements are shown above. Values update live.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 0,
  },
  motionTable: {
    backgroundColor: '#b2d8c5', // darker green
  },
  magnetometerTable: {
    backgroundColor: '#ffb6c1', // darker pink
  },
  gyroscopeTable: {
    backgroundColor: '#ffd59e', // darker orange
  },
  barometerTable: {
    backgroundColor: '#90caf9', // darker blue
  },
  subHeader: {
    fontSize: 18,
    color: '#888',
    marginTop: 16,
    marginBottom: 4,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tableMeasurementCell: {
    flex: 1,
    color: '#000',
    textAlign: 'center',
    padding: 2,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
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
    width: '100%',
    alignItems: 'center',
  },
  tableHeader: {
    flex: 1,
    fontWeight: 'bold',
    color: '#000',
    fontSize: 14,
    textAlign: 'center',
    padding: 2,
  },
  tableCell: {
    flex: 1,
    color: '#000',
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
