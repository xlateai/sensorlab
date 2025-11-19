import React, { useMemo, useRef, useState, useEffect } from 'react';
import { StatusBar } from 'react-native';
import ModeZero from '../../components/magnetovision/modeZero';
import ModeOne from '../../components/magnetovision/modeOne';
import ModeTwo from '../../components/magnetovision/modeTwo';
import ModeThree from '../../components/magnetovision/modeThree';
import { Dimensions, View, Animated, PanResponder, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Magnetometer } from 'expo-sensors';

const PIXEL_WIDTH = 256;

export default function VideoScreen() {
  // State for menu expansion
  const [menuExpanded, setMenuExpanded] = useState(false);
  // Mode state (0-3)
  const [mode, setMode] = useState(0);
  // Fullscreen state
  const [fullscreen, setFullscreen] = useState(false);
  const lastTapRef = useRef<number | null>(null);

  // Alternate between ModeZero and ModeOne based on mode index
  // Render the correct mode component based on mode index
  const renderMode = useMemo(() => {
    switch (mode) {
      case 0:
        return <ModeZero key="mode-zero" />;
      case 1:
        return <ModeOne key="mode-one" />;
      case 2:
        return <ModeTwo key="mode-two" />;
      case 3:
        return <ModeThree key="mode-three" />;
      default:
        return null;
    }
  }, [mode]);

  // Double-tap handler
  const handleDoubleTap = () => {
    const now = Date.now();
    if (lastTapRef.current && now - lastTapRef.current < 2000) {
      setFullscreen(f => !f);
      lastTapRef.current = null;
    } else {
      lastTapRef.current = now;
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={{ flex: 1, backgroundColor: '#000' }}
      onPress={handleDoubleTap}
    >
      <StatusBar hidden={fullscreen} animated />
      {renderMode}
      {!fullscreen && (
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
            <View style={{ flex: 1, width: '100%', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-start', gap: 24, marginTop: 12 }}>
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
                      backgroundColor: mode === i ? '#19e56a' : '#888', // green when selected, neutral gray when not
                      borderWidth: 0,
                    }}
                  />
                ))}
              </View>
              {/* ...existing code... */}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}
