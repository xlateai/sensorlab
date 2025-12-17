import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

interface PlayPauseButtonProps {
  paused: boolean;
  onToggle: () => void;
}

export default function PlayPauseButton({ paused, onToggle }: PlayPauseButtonProps) {
  return (
    <View style={styles.container}>
      <Pressable
        onPress={onToggle}
        style={[
          styles.button,
          { backgroundColor: paused ? '#222' : '#e53935' }
        ]}
      >
        <Text style={styles.buttonText}>
          {paused ? '▶ Play' : '⏸ Pause'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 16,
  },
  button: {
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 20,
    letterSpacing: 1,
  },
});


