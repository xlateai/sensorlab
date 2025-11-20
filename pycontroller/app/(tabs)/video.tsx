import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useStorage } from '../StorageContext';
import { StatusBar } from 'react-native';
import ModeZero from '../../components/magnetovision/modeZero';
import ModeOne from '../../components/magnetovision/modeOne';
import ModeTwo from '../../components/magnetovision/modeTwo';
import ModeThree from '../../components/magnetovision/modeThree';
import ModeFour from '../../components/magnetovision/modeFour';
import { Dimensions, View, Animated, PanResponder, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function VideoScreen() {
  // State for menu expansion
  const [menuExpanded, setMenuExpanded] = useState(false);
  // Mode state (0-4), synced with StorageContext
  const { get, set } = useStorage();
  const [mode, setMode] = useState(() => Number(get('selectedMode') ?? 0));

  // Sync mode from context when it changes in storage
  useEffect(() => {
    const stored = get('selectedMode');
    if (stored !== undefined && Number(stored) !== mode) {
      setMode(Number(stored));
    }
  }, [get, mode]);

  // Persist mode changes to context/storage
  useEffect(() => {
    set('selectedMode', String(mode));
  }, [mode, set]);
  // Fullscreen state
  const [fullscreen, setFullscreen] = useState(false);
  const tapTimesRef = useRef<number[]>([]);
  const navigation = useNavigation();

  // Hide tab bar when fullscreen
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: fullscreen ? { display: 'none' } : undefined,
    });
  }, [fullscreen, navigation]);

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
      case 4:
        return <ModeFour key="mode-four" />;
      default:
        return <ModeZero key="mode-zero" />;
    }
  }, [mode]);

  // Triple-tap handler (within 3 seconds)
  const handleTripleTap = () => {
    const now = Date.now();
    tapTimesRef.current.push(now);
    // Keep only last 3 taps
    if (tapTimesRef.current.length > 3) tapTimesRef.current.shift();
    if (
      tapTimesRef.current.length === 3 &&
      tapTimesRef.current[2] - tapTimesRef.current[0] < 3000
    ) {
      setFullscreen(f => !f);
      tapTimesRef.current = [];
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={{ flex: 1, backgroundColor: '#000' }}
      onPress={handleTripleTap}
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
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => menuExpanded ? setMenuExpanded(false) : setMenuExpanded(true)}
            style={{ width: '100%', alignItems: 'center', height: 40, justifyContent: 'center' }}
          >
            <View style={{ width: '18%', height: 8, backgroundColor: '#444', borderRadius: 4, opacity: 0.7 }} />
          </TouchableOpacity>
          {menuExpanded && (
            <View style={{ flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: -24 }}>
                {Array.from({ length: 3 }).map((_, rowIdx) => (
                  <View
                    key={rowIdx}
                    style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginVertical: 4 }}
                  >
                    {Array.from({ length: 4 }).map((_, colIdx) => {
                      const i = rowIdx * 4 + colIdx;
                      return (
                        <TouchableOpacity
                          key={i}
                          onPress={() => setMode(i)}
                          activeOpacity={0.8}
                          style={{
                            width: 44,
                            height: 44,
                            marginHorizontal: 6,
                            borderRadius: 8,
                            backgroundColor: mode === i ? '#19e56a' : '#888',
                            borderWidth: 0,
                          }}
                        />
                      );
                    })}
                  </View>
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
