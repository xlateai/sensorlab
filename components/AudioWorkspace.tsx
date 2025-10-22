import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View } from 'react-native';
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
  
  // Responsive state
  const [dimensions, setDimensions] = useState(() => Dimensions.get('window'));
  
  // ScrollView reference for programmatic scrolling if needed
  const scrollViewRef = useRef<ScrollView>(null);

  // Listen for window size changes
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });

    return () => subscription?.remove();
  }, []);

  // Calculate responsive layout
  const isWideScreen = dimensions.width >= 768; // Tablet/desktop breakpoint
  const maxWidth = Math.min(dimensions.width, 1200); // Max width for desktop
  const shouldUseTwoColumns = isWideScreen && showRecorder && showEditor;
  
  // Calculate component dimensions
  const containerWidth = shouldUseTwoColumns ? maxWidth : Math.min(dimensions.width, 600);
  const componentWidth = shouldUseTwoColumns ? (containerWidth - 32) / 2 : containerWidth - 32; // Account for padding and gap
  const componentHeight = Math.min(dimensions.height * 0.4, 300); // Responsive height

  return (
    <ScrollView 
      ref={scrollViewRef}
      style={styles.scrollContainer} 
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.contentContainer,
        { 
          maxWidth: maxWidth,
          alignSelf: 'center', // Center the content
          width: '100%'
        }
      ]}
      bounces={true}
      alwaysBounceVertical={false}
      keyboardShouldPersistTaps="handled" // Allows touches on controls while keyboard is open
    >
      <View style={[
        styles.componentsContainer,
        shouldUseTwoColumns && styles.twoColumnLayout
      ]}>
        {showRecorder && (
          <View style={[
            styles.componentSection,
            shouldUseTwoColumns && styles.columnItem
          ]}>
            <Waveform 
              width={componentWidth}
              height={componentHeight}
              onRecordingStateChange={() => {}} // Global state handles this
              onMutedStateChange={setIsMuted}
              onRecordingSamplesChange={setRecordingSamples}
            />
          </View>
        )}
        
        {showEditor && (
          <View style={[
            styles.componentSection,
            shouldUseTwoColumns && styles.columnItem
          ]}>
            <WaveEditor 
              width={componentWidth}
              height={componentHeight}
            />
          </View>
        )}
      </View>
      
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
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  componentsContainer: {
    width: '100%',
  },
  twoColumnLayout: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  componentSection: {
    flex: 1,
    minWidth: 0, // Allows flex items to shrink below their content size
  },
  columnItem: {
    flex: 1,
    maxWidth: '50%',
  },
  bottomSpacer: {
    height: 60, // Fixed height for comfortable scrolling
  },
});