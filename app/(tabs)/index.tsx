import RecordingsViewer from '@/components/RecordingsViewer';
import Waveform from '@/components/Waveform';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

export default function HomeScreen() {
  const [isRecording, setIsRecording] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [recordingSamples, setRecordingSamples] = useState<number[]>([]);

  return (
    <View style={styles.container}>
      <Waveform 
        onRecordingStateChange={setIsRecording}
        onMutedStateChange={setIsMuted}
        onRecordingSamplesChange={setRecordingSamples}
      />
      <RecordingsViewer 
        isRecording={isRecording}
        isMuted={isMuted}
        recordingSamples={recordingSamples}
      />
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
