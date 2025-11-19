import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Dimensions, View, Animated, PanResponder } from 'react-native';
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

  const BUFFER_SIZE = 256;
  // ...existing code...
  // Magnetometer buffer

  const bufferRef = useRef<{x: number, y: number, z: number}[]>([]);
  const magnetometerRef = useRef<{x: number, y: number, z: number} | null>(null);
  const [buffer, setBuffer] = useState<{x: number, y: number, z: number}[]>([]);
  const [magnetometer, setMagnetometer] = useState<{x: number, y: number, z: number} | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      const sub = Magnetometer.addListener(data => {
        bufferRef.current.push(data);
        if (bufferRef.current.length > BUFFER_SIZE) bufferRef.current.shift();
        magnetometerRef.current = data;
      });
      Magnetometer.setUpdateInterval(24);
      return () => { sub && sub.remove(); };
    }, [])
  );

  // Update buffer and magnetometer state at a regular interval (not every sensor event)
  useEffect(() => {
    const interval = setInterval(() => {
      setBuffer([...bufferRef.current]);
      setMagnetometer(magnetometerRef.current);
    }, 16); // 16ms = ~60fps
    return () => clearInterval(interval);
  }, []);

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

  // Draggable control bar logic
  const MENU_MIN_HEIGHT = 32;
  const MENU_MAX_HEIGHT = 220;
  const menuHeight = useRef(new Animated.Value(MENU_MIN_HEIGHT)).current;
  const [menuOpen, setMenuOpen] = useState(false);

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => {
      return Math.abs(gestureState.dy) > 4;
    },
    onPanResponderMove: (_, gestureState) => {
      let newHeight = MENU_MIN_HEIGHT - gestureState.dy;
      if (newHeight < MENU_MIN_HEIGHT) newHeight = MENU_MIN_HEIGHT;
      if (newHeight > MENU_MAX_HEIGHT) newHeight = MENU_MAX_HEIGHT;
      menuHeight.setValue(newHeight);
    },
    onPanResponderRelease: (_, gestureState) => {
      if (MENU_MIN_HEIGHT - gestureState.dy > MENU_MIN_HEIGHT + (MENU_MAX_HEIGHT - MENU_MIN_HEIGHT) / 2) {
        // Open menu
        Animated.spring(menuHeight, {
          toValue: MENU_MAX_HEIGHT,
          useNativeDriver: false,
        }).start();
        setMenuOpen(true);
      } else {
        // Close menu
        Animated.spring(menuHeight, {
          toValue: MENU_MIN_HEIGHT,
          useNativeDriver: false,
        }).start();
        setMenuOpen(false);
      }
    },
  }), [menuHeight]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ width: screenWidth, height: canvasHeight, flexDirection: 'column' }}>
        {Array.from({ length: pixelHeight }).map((_, y) => (
          <View key={y} style={{ width: screenWidth, height: pixelSize, backgroundColor: color }} />
        ))}
      </View>
      {/* Draggable control bar and menu */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: menuHeight,
          backgroundColor: '#222',
          borderTopLeftRadius: 12,
          borderTopRightRadius: 12,
          justifyContent: 'flex-start',
          alignItems: 'center',
          zIndex: 10,
          overflow: 'hidden',
        }}
        {...panResponder.panHandlers}
      >
        <View style={{ width: '60%', height: 4, backgroundColor: '#444', borderRadius: 2, marginTop: 8, marginBottom: 8 }} />
        {menuOpen && (
          <View style={{ width: '90%', height: MENU_MAX_HEIGHT - MENU_MIN_HEIGHT - 16, backgroundColor: '#333', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 8 }}>
            <View>
              <View style={{ marginBottom: 8 }}>
                <View style={{ width: 32, height: 32, backgroundColor: '#555', borderRadius: 16 }} />
              </View>
              <View style={{ marginBottom: 8 }}>
                <View style={{ width: 64, height: 8, backgroundColor: '#666', borderRadius: 4 }} />
              </View>
              <View style={{ width: 96, height: 8, backgroundColor: '#666', borderRadius: 4 }} />
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  );
}
