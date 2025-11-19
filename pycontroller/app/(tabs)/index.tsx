



import React, { useRef, useState } from 'react';
import { StatusBar, TouchableOpacity, View } from 'react-native';
import ModeZero from '../../components/magnetovision/modeZero';

export default function HomeScreen() {
  // Fullscreen state, default enabled
  const [fullscreen, setFullscreen] = useState(true);
  const tapTimesRef = useRef<number[]>([]);

  // Triple-tap handler (within 3 seconds)
  const handleTripleTap = () => {
    const now = Date.now();
    tapTimesRef.current.push(now);
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
      <View style={{ flex: 1 }}>
        <ModeZero />
      </View>
    </TouchableOpacity>
  );
}

