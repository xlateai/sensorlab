import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface RainbowProgressBarProps {
  progress: number; // 0 to 1
}

export const RainbowProgressBar: React.FC<RainbowProgressBarProps> = ({ progress }) => {
  return (
    <View style={styles.container}>
      <LinearGradient
        colors={["#ff0080", "#ff8c00", "#40e0d0", "#8a2be2", "#ff0080"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{
          ...styles.bar,
          width: `${Math.max(0, Math.min(progress, 1)) * 100}%`,
          shadowColor: '#fff',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.8,
          shadowRadius: 10,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 8,
  },
});