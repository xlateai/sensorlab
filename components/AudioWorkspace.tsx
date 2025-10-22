import React, { useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
import WaveEditor from './WaveEditor';
import Waveform from './Waveform';

const { height: screenHeight } = Dimensions.get('window');

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
  
  // ScrollView reference for programmatic scrolling if needed
  const scrollViewRef = useRef<ScrollView>(null);

  return (
    <ScrollView 
      ref={scrollViewRef}
      style={styles.scrollContainer} 
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}
      bounces={true}
      alwaysBounceVertical={false}
      keyboardShouldPersistTaps="handled" // Allows touches on controls while keyboard is open
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
      
      {/* Add some extra space at the bottom for comfortable scrolling */}
      <View style={styles.bottomSpacer} />
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
  bottomSpacer: {
    height: screenHeight * 0.1, // 10% of screen height for comfortable scrolling
  },
});