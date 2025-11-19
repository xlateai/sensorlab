import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Dimensions, View, Animated, PanResponder, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer } from 'expo-sensors';

const PIXEL_WIDTH = 256;

export default function VideoScreen() {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  // Calculate pixel height based on aspect ratio
  const pixelHeight = Math.round((screenHeight / screenWidth) * PIXEL_WIDTH);
  // Calculate pixel size to fill viewport
  const pixelSize = screenWidth / PIXEL_WIDTH;
  const canvasHeight = pixelHeight * pixelSize;

  const BUFFER_SIZE = 64;
  // ...existing code...
  // Magnetometer buffer

    // State for menu expansion
    const [menuExpanded, setMenuExpanded] = useState(false);

  const bufferRef = useRef<{x: number, y: number, z: number}[]>([]);
  const magnetometerRef = useRef<{x: number, y: number, z: number} | null>(null);
  const [buffer, setBuffer] = useState<{x: number, y: number, z: number}[]>([]);
  const [magnetometer, setMagnetometer] = useState<{x: number, y: number, z: number} | null>(null);

  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    React.useCallback(() => {
      setIsFocused(true);
      const sub = Magnetometer.addListener(data => {
        bufferRef.current.push(data);
        if (bufferRef.current.length > BUFFER_SIZE) bufferRef.current.shift();
        magnetometerRef.current = data;
      });
      Magnetometer.setUpdateInterval(24);
      const interval = setInterval(() => {
        setBuffer([...bufferRef.current]);
        setMagnetometer(magnetometerRef.current);
  }, 33); // 33ms = ~30fps
      return () => {
        setIsFocused(false);
        sub && sub.remove();
        clearInterval(interval);
      };
    }, [])
  );

  // Compute min/max for normalization
  const [minMax, setMinMax] = useState({
    minX: 0, maxX: 1,
    minY: 0, maxY: 1,
    minZ: 0, maxZ: 1,
  });

  useEffect(() => {
    if (buffer.length === 0) return;
    let minX = buffer[0].x, maxX = buffer[0].x;
    let minY = buffer[0].y, maxY = buffer[0].y;
    let minZ = buffer[0].z, maxZ = buffer[0].z;
    for (const v of buffer) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.z > maxZ) maxZ = v.z;
    }
    setMinMax({ minX, maxX, minY, maxY, minZ, maxZ });
  }, [buffer]);

  // Get normalized RGB from latest sample
  let r = 0, g = 0, b = 0;
  if (magnetometer !== null) {
    const norm = (val: number, min: number, max: number) => {
      if (max === min) return 0.5;
      return Math.max(0, Math.min(1, (val - min) / (max - min)));
    };
    r = Math.round(norm(magnetometer.x, minMax.minX, minMax.maxX) * 255);
    g = Math.round(norm(magnetometer.y, minMax.minY, minMax.maxY) * 255);
    b = Math.round(norm(magnetometer.z, minMax.minZ, minMax.maxZ) * 255);
  }
  const color = `rgb(${r},${g},${b})`;

  if (!isFocused) {
    return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  }
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ width: screenWidth, height: canvasHeight, flexDirection: 'column' }}>
        {Array.from({ length: pixelHeight }).map((_, y) => (
          <View key={y} style={{ width: screenWidth, height: pixelSize, backgroundColor: color }} />
        ))}
      </View>
      {/* Expandable menu bar at the bottom */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: menuExpanded ? Math.round(screenHeight * 0.4) : 40,
          backgroundColor: '#18181c',
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          justifyContent: 'flex-start',
          alignItems: 'center',
          zIndex: 10,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.18,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        {/* Only the drag handle is clickable when expanded */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => menuExpanded ? setMenuExpanded(false) : setMenuExpanded(true)}
          style={{ width: '100%', alignItems: 'center', height: 40, justifyContent: 'center' }}
        >
          <View style={{ width: '18%', height: 8, backgroundColor: '#444', borderRadius: 4, opacity: 0.7 }} />
        </TouchableOpacity>
        {/* Expanded content placeholder */}
        {menuExpanded && (
          <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
            {/* Add menu content here */}
          </View>
        )}
      </View>
    </View>
  );
}
