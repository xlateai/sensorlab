import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import WaveEditor from './WaveEditor';
import Waveform from './Waveform';

interface AudioWorkspaceProps {
  // Allow customization if needed
  showRecorder?: boolean;
  showEditor?: boolean;
}

export default function AudioWorkspace({ 
  showRecorder = true, 
  showEditor = true 
}: AudioWorkspaceProps) {
  // Shared state between components
  const [isMuted, setIsMuted] = useState(false);
  const [recordingSamples, setRecordingSamples] = useState<number[]>([]);

  return (
    <ScrollView 
      style={styles.scrollContainer} 
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
    >
      {showRecorder && (
        <View style={styles.waveformSection}>
          <Waveform 
            onRecordingStateChange={() => {}} // Global state handles this
            onMutedStateChange={setIsMuted}
            onRecordingSamplesChange={setRecordingSamples}
          />
        </View>
      )}
      
      {showEditor && (
        <View style={styles.editorSection}>
          <WaveEditor />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  contentContainer: {
    flexGrow: 1,
    paddingVertical: 8,
  },
  waveformSection: {
    marginBottom: 16,
  },
  editorSection: {
    // No margin needed since WaveEditor handles its own spacing
  },
});