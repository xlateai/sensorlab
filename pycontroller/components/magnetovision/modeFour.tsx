
import { requireNativeComponent } from 'react-native';
import { View, StyleSheet } from 'react-native';

const NativeConvolutionView = requireNativeComponent('ConvolutionView');

export default function ModeFour() {
  return (
    <View style={styles.container}>
      <NativeConvolutionView style={StyleSheet.absoluteFill} />
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