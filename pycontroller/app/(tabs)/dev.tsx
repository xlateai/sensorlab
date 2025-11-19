// ...existing code...
// Subscription type not exported from expo-sensors; use 'any' for sensor subscriptions
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable } from 'react-native';
import { BlurView } from 'expo-blur';

// Blank popup component
function BlankPopup({ visible, onClose, children }: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <BlurView intensity={40} tint="dark" style={{ ...StyleSheet.absoluteFillObject, zIndex: 0 }} />
        <View
          style={{
            width: '100%',
            height: '60%',
            backgroundColor: '#000',
            borderRadius: 0,
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingBottom: 0,
            overflow: 'hidden',
          }}
        >
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 60, alignItems: 'center', justifyContent: 'center', paddingTop: 20 }}>
            {children}
          </View>
          <Pressable
            onPress={onClose}
            style={{
              backgroundColor: '#222',
              paddingHorizontal: 32,
              paddingVertical: 12,
              borderRadius: 10,
              marginBottom: 16,
              alignSelf: 'center',
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: [{ translateX: -64 }],
              width: 128,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, textAlign: 'center' }}>Dismiss</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
import { StyleSheet, View, Text, SafeAreaView, ScrollView } from 'react-native';
import { DeviceMotion, Magnetometer, Gyroscope, Barometer } from 'expo-sensors';
import type { DeviceMotionMeasurement } from 'expo-sensors';
import AccelerationScreen from '@/components/sensorvisuals/acceleration';
import MagneticScreen from '@/components/sensorvisuals/magnetic';
import AccelerationWithGravityScreen from '@/components/sensorvisuals/accelerationWithGravity';
import RotationScreen from '@/components/sensorvisuals/rotation';
import RotationDeltaScreen from '@/components/sensorvisuals/rotationDelta';
import GyroscopeScreen from '@/components/sensorvisuals/gyroscope';

// Map measurement to component
const measurementComponentMap: Record<string, React.ComponentType | null> = {
  'acc': AccelerationScreen,
  'acc+grav': AccelerationWithGravityScreen,
  'rot': RotationScreen,
  'rotΔ': RotationDeltaScreen,
  'magnetometer': MagneticScreen,
  'gyroscope': GyroscopeScreen,
  'barometer': null,
};

export default function DevScreen() {
  // Popup state
  const [popupVisible, setPopupVisible] = useState(false);
  const [popupMeasurement, setPopupMeasurement] = useState('');
  const [popupComponent, setPopupComponent] = useState<string>('');
  const openPopup = (measurement: string) => {
    setPopupMeasurement(measurement);
    setPopupComponent(measurement);
    setPopupVisible(true);
  };
  const closePopup = () => setPopupVisible(false);
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
              <Text style={styles.tableHeader}></Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>acc</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.x?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.y?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.acceleration?.z?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>m/s²</Text>
              <Pressable onPress={() => openPopup('acc')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>acc+grav</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.x?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.y?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.accelerationIncludingGravity?.z?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>m/s²</Text>
              <Pressable onPress={() => openPopup('acc+grav')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>rot</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.alpha?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.beta?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotation?.gamma?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>deg</Text>
              <Pressable onPress={() => openPopup('rot')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>rotΔ</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.alpha?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.beta?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>{motionData?.rotationRate?.gamma?.toFixed(3) ?? '-'}</Text>
              <Text style={styles.tableCell}>deg/s</Text>
              <Pressable onPress={() => openPopup('rotΔ')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
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
              <Text style={styles.tableHeader}></Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>magnetometer</Text>
              <Text style={styles.tableCell}>{magnetometerData?.x?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>{magnetometerData?.y?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>{magnetometerData?.z?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>μT</Text>
              <Pressable onPress={() => openPopup('magnetometer')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
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
              <Text style={styles.tableHeader}></Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>gyroscope</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.x?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.y?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>{gyroscopeData?.z?.toFixed(2) ?? '-'}</Text>
              <Text style={styles.tableCell}>rad/s</Text>
              <Pressable onPress={() => openPopup('gyroscope')} style={{ marginLeft: 4, backgroundColor: '#222', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12 }}>Plot</Text>
              </Pressable>
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
              <Text style={styles.tableHeader}></Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={styles.tableMeasurementCell}>barometer</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>-</Text>
              <Text style={styles.tableCell}>{barometerData?.pressure?.toFixed(2) ?? '-'} hPa</Text>
              {/* No Plot button for barometer */}
            </View>
          </View>
          <Text style={styles.instructions}>All available sensor measurements are shown above. Values update live.</Text>
          {/* Blank popup modal */}
          <BlankPopup visible={popupVisible} onClose={closePopup}>
            {measurementComponentMap[popupComponent]
              ? React.createElement(measurementComponentMap[popupComponent])
              : (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 32 }}>{popupMeasurement}</Text>
                  <Text style={{ color: '#fff', fontSize: 18, marginTop: 16 }}>TODO</Text>
                </View>
              )}
          </BlankPopup>
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
