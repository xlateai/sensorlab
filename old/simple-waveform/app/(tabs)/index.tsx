import Waveform from '@/components/Waveform';
import { StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Waveform />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'flex-start', // Align to top instead of center
    alignItems: 'stretch', // Allow full width
  },
});
