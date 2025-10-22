import { useRecordingsState } from '@/components/RecordingsData';
import WaveEditor from '@/components/WaveEditor';
import Waveform from '@/components/Waveform';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  // Keep local state for UI feedback, but recordings are managed globally
  const [isMuted, setIsMuted] = useState(false);
  const [recordingSamples, setRecordingSamples] = useState<number[]>([]);
  
  // Get global recordings state
  const recordingsState = useRecordingsState();

  return (
    <View style={styles.container}>
      <Waveform 
        onRecordingStateChange={() => {}} // No longer needed since we use global state
        onMutedStateChange={setIsMuted}
        onRecordingSamplesChange={setRecordingSamples}
      />
      <WaveEditor />
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
