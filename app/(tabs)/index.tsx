import Waveform from '@/components/Waveform';
import { Dimensions, StyleSheet, View } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Waveform width={screenWidth} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
});
