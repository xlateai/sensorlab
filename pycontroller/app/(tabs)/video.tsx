import React, { useMemo, useRef, useState, useEffect } from 'react';
import ModeZero from '../../components/magnetovision/modeZero';
import { Dimensions, View, Animated, PanResponder, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer } from 'expo-sensors';

const PIXEL_WIDTH = 256;

export default function VideoScreen() {
  // State for menu expansion
  const [menuExpanded, setMenuExpanded] = useState(false);
  // Mode state (0-3)
  const [mode, setMode] = useState(0);
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Render ModeZero for all modes for now */}
      <ModeZero />
      {/* Expandable menu bar at the bottom */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: menuExpanded ? Math.round(Dimensions.get('window').height * 0.4) : 40,
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
        {/* Expanded content: 4 selectable squares for modes */}
        {menuExpanded && (
          <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24 }}>
              {Array.from({ length: 4 }).map((_, i) => (
                <TouchableOpacity
                  key={i}
                  onPress={() => setMode(i)}
                  activeOpacity={0.8}
                  style={{
                    width: 48,
                    height: 48,
                    marginHorizontal: 12,
                    borderRadius: 8,
                    backgroundColor: mode === i ? '#fff' : '#333',
                    borderWidth: mode === i ? 3 : 1,
                    borderColor: mode === i ? '#4f8cff' : '#555',
                  }}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
