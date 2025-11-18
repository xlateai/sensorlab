// ...existing code...
// Subscription type not exported from expo-sensors; use 'any' for sensor subscriptions
import React, { useEffect, useRef, useState } from 'react';
import type { Subscription } from 'expo-sensors';
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
  const [paused, setPaused] = useState(true); // default to paused

  // Store subscriptions in refs so we can kill them on pause and recreate on play
  const motionSubRef = useRef<any>(null);
  const magSubRef = useRef<any>(null);
  const gyroSubRef = useRef<any>(null);
  const baroSubRef = useRef<any>(null);

  // Helper to kill all listeners
  const killAllListeners = () => {
  motionSubRef.current && motionSubRef.current.remove();
  magSubRef.current && magSubRef.current.remove();
  gyroSubRef.current && gyroSubRef.current.remove();
  baroSubRef.current && baroSubRef.current.remove();
  motionSubRef.current = null;
  magSubRef.current = null;
  gyroSubRef.current = null;
  baroSubRef.current = null;
  // Explicitly remove all listeners at native level
  try { DeviceMotion.removeAllListeners(); } catch {}
  try { Magnetometer.removeAllListeners(); } catch {}
  try { Gyroscope.removeAllListeners(); } catch {}
  try { Barometer.removeAllListeners(); } catch {}
    // Explicitly remove all listeners at native level
    try { DeviceMotion.removeAllListeners(); } catch {}
    try { Magnetometer.removeAllListeners(); } catch {}
    try { Gyroscope.removeAllListeners(); } catch {}
    try { Barometer.removeAllListeners(); } catch {}
  };

  useEffect(() => {
    if (!paused) {
      killAllListeners(); // Always kill before creating new
      motionSubRef.current = DeviceMotion.addListener(setMotionData);
      magSubRef.current = Magnetometer.addListener(setMagnetometerData);
      gyroSubRef.current = Gyroscope.addListener(setGyroscopeData);
      baroSubRef.current = Barometer.addListener(setBarometerData);

      DeviceMotion.setUpdateInterval(100);
      Magnetometer.setUpdateInterval(100);
      Gyroscope.setUpdateInterval(100);
      Barometer.setUpdateInterval(500);
    } else {
      killAllListeners();
      // Clear sensor data state to stop background updates
      setMotionData(null);
      setMagnetometerData(null);
      setGyroscopeData(null);
      setBarometerData(null);
    }
    // Clean up on unmount or tab switch
    return () => {
      killAllListeners();
      setMotionData(null);
      setMagnetometerData(null);
      setGyroscopeData(null);
      setBarometerData(null);
    };
  }, [paused]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          {/* Modern Play/Pause Toggle Button */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <Text
              onPress={() => setPaused(p => !p)}
              style={{
                backgroundColor: paused ? '#222' : '#e53935',
                color: '#fff',
                paddingHorizontal: 36,
                paddingVertical: 14,
                borderRadius: 32,
                fontWeight: '600',
                fontSize: 20,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.2,
                shadowRadius: 4,
                elevation: 2,
                letterSpacing: 1,
                marginBottom: 0,
              }}
            >
              {paused ? '▶ Play' : '⏸ Pause'}
            </Text>
          </View>
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
