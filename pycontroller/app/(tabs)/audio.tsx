import React from 'react';
import { View, Text } from 'react-native';

export default function AudioTab() {
  // No way to detect audio devices without native code in React Native
  return (
    <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Audio Devices</Text>
      <Text style={{ fontSize: 18, color: '#39ff14' }}>Unknown (cannot detect without native code)</Text>
      <Text style={{ marginTop: 24, color: '#888', fontSize: 14 }}>
        (Native module required to detect AirPods or other devices)
      </Text>
    </View>
  );
}
