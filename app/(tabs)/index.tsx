import AudioWorkspace from '@/components/AudioWorkspace';
import { useRecordingsState } from '@/components/RecordingsData';
import { StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  // Get global recordings state
  const recordingsState = useRecordingsState();

  return (
    <View style={styles.container}>
      <AudioWorkspace />
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
