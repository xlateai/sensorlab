
import { View, StyleSheet } from 'react-native';
import { requireNativeViewManager } from "expo-modules-core";

const ConvolutionView = requireNativeViewManager('ConvolutionView');

export default function ModeFive() {
  return (
    <View style={styles.container}>
      <ConvolutionView style={{ flex: 1 }} />
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