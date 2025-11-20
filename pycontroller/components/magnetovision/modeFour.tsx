import { requireNativeModule } from 'expo-modules-core';
import { View, StyleSheet } from 'react-native';

const sensorLib = requireNativeModule('Sensorlib');

export default function ModeFour() {
  return (
    <View style={styles.container}>
      <sensorLib.ConvolutionView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
});