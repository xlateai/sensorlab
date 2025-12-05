import React from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import SensorlibModule from 'sensorlib';

interface RustCoreShowcaseProps {
  rustcoreResult: string;
  setRustcoreResult: (result: string) => void;
}

export default function RustCoreShowcase({
  rustcoreResult,
  setRustcoreResult,
}: RustCoreShowcaseProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <Pressable
        onPress={() => {
          try {
            const result = SensorlibModule.rustcoreHello();
            setRustcoreResult(result);
          } catch (error) {
            setRustcoreResult(`Error: ${error}`);
          }
        }}
        style={{
          backgroundColor: '#39ff14',
          paddingHorizontal: 24,
          paddingVertical: 12,
          borderRadius: 8,
          minWidth: 120,
        }}
      >
        <Text style={{ color: '#000', fontWeight: '600', fontSize: 16, textAlign: 'center' }}>
          Call Rust
        </Text>
      </Pressable>
      <TextInput
        value={rustcoreResult}
        editable={false}
        placeholder="Rust function result will appear here..."
        placeholderTextColor="#666"
        style={{
          flex: 1,
          backgroundColor: '#222',
          color: '#fff',
          padding: 12,
          borderRadius: 8,
          fontSize: 14,
          borderWidth: 2,
          borderColor: '#39ff14',
          minHeight: 50,
          textAlignVertical: 'top',
        }}
        multiline
      />
    </View>
  );
}

