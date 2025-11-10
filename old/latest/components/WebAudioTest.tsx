import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import WebAudioBridge from './WebAudioBridge';

// Simple test component for WebAudio bridge
export default function WebAudioTest() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const testWaves = [{
    id: '1',
    type: 'sine' as const,
    shape: 'sine' as const,
    frequency: 440, // A4 note
    startFreq: 440,
    endFreq: 880,
    sweepK: 2
  }];
  
  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>WebAudio Bridge Test</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>
          Status: {error ? `Error - ${error}` : isReady ? 'Ready' : 'Loading...'}
        </Text>
        
        <TouchableOpacity
          style={[
            styles.playButton,
            isPlaying && styles.playButtonActive,
            !isReady && styles.playButtonDisabled
          ]}
          onPress={togglePlayback}
          disabled={!isReady}
        >
          <Text style={styles.playButtonText}>
            {isPlaying ? 'Stop' : 'Play'} 440Hz
          </Text>
        </TouchableOpacity>
      </View>
      
      <WebAudioBridge
        waves={testWaves}
        isPlaying={isPlaying}
        volume={0.3}
        multiplicity={1.0}
        isNegated={false}
        onAudioReady={() => {
          setIsReady(true);
          setError(null);
          console.log('Test: WebAudio bridge ready');
        }}
        onError={(err) => {
          setError(err);
          console.error('Test: WebAudio bridge error:', err);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    margin: 16,
  },
  title: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  statusContainer: {
    alignItems: 'center',
    gap: 12,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
  },
  playButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 20,
    padding: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    minWidth: 100,
  },
  playButtonActive: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderColor: 'rgba(255, 0, 0, 0.3)',
  },
  playButtonDisabled: {
    backgroundColor: 'rgba(136, 136, 136, 0.05)',
    borderColor: 'rgba(136, 136, 136, 0.1)',
    opacity: 0.5,
  },
  playButtonText: {
    color: '#00ff00',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});