import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { startSineStream, stopSineStream } from '../../src/audio/sineStreamer';


export default function AudioTab() {
  const [playing, setPlaying] = useState(false);

  const handlePlay = () => {
    startSineStream();
    setPlaying(true);
  };

  const handlePause = () => {
    stopSineStream();
    setPlaying(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Audio</Text>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <TouchableOpacity
          style={{ backgroundColor: playing ? '#444' : '#39ff14', padding: 16, borderRadius: 8, marginRight: 8 }}
          onPress={handlePlay}
          disabled={playing}
        >
          <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 18 }}>Play</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={{ backgroundColor: !playing ? '#444' : '#ff3939', padding: 16, borderRadius: 8, marginLeft: 8 }}
          onPress={handlePause}
          disabled={!playing}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>Pause</Text>
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 18, color: '#39ff14', marginTop: 32 }}>
        {playing ? 'Sine waves streaming...' : 'Press Play to start audio'}
      </Text>
    </View>
  );
}
