
import { View, StyleSheet, requireNativeComponent } from 'react-native';

const ConvolutionView = requireNativeComponent('ConvolutionView');

export default function ModeFive() {
  return (
    <View style={styles.container}>
      <ConvolutionView />
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