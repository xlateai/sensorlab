import React from 'react';
import { TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface RecordButtonProps {
  recording: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
  onClear?: () => void;
  color?: string;
}

export default function RecordButton({ recording, onPressIn, onPressOut, onClear, color = '#fa4' }: RecordButtonProps) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <TouchableOpacity
        style={{
          width: 60,
          height: 60,
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
      {onClear && (
        <TouchableOpacity
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: '#fff',
            justifyContent: 'center',
            alignItems: 'center',
            marginLeft: 12,
            shadowColor: color,
            shadowOpacity: 0.2,
            shadowRadius: 4,
          }}
          activeOpacity={0.7}
          onPress={onClear}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Path d="M3 6h18" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Path d="M10 11v6" stroke={color} strokeWidth={2} strokeLinecap="round" />
            <Path d="M14 11v6" stroke={color} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      )}
    </View>
  );
}
