import React from 'react';
import { TouchableOpacity, View } from 'react-native';

interface RecordButtonProps {
  recording: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  color?: string;
}

export default function RecordButton({ recording, onPressIn, onPressOut, color = '#fa4' }: RecordButtonProps) {
  return (
    <TouchableOpacity
      style={{
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: color,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: color,
        shadowOpacity: 0.5,
        shadowRadius: 8,
      }}
      activeOpacity={0.7}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={recording}
    >
      {!recording && (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: '#fff',
          }}
        />
      )}
    </TouchableOpacity>
  );
}
