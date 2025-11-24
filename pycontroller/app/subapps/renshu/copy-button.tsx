import React, { useState, useRef } from 'react';
import { TouchableOpacity, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface CopyButtonProps {
  textToCopy: string;
  size?: number;
  color?: string;
  style?: any;
  accessibilityLabel?: string;
}

export default function CopyButton({ 
  textToCopy, 
  size = 16.2, 
  color = '#fff',
  style,
  accessibilityLabel 
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const handleCopy = async () => {
    if (textToCopy) {
      await Clipboard.setStringAsync(textToCopy);
      setCopied(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setCopied(false));
      }, 1000);
    }
  };

  return (
    <TouchableOpacity
      style={[
        {
          paddingVertical: 5.4,
          paddingHorizontal: 9,
          borderRadius: 14.4,
          backgroundColor: '#222',
          alignItems: 'center',
          justifyContent: 'center',
          height: 28.8,
        },
        style,
      ]}
      onPress={handleCopy}
      accessibilityLabel={accessibilityLabel || (copied ? "Copied!" : "Copy")}
    >
      {copied ? (
        <Animated.View style={{ opacity: fadeAnim }}>
          <MaterialIcons name="check" size={size} color={color} />
        </Animated.View>
      ) : (
        <MaterialIcons name="content-copy" size={size} color={color} />
      )}
    </TouchableOpacity>
  );
}
