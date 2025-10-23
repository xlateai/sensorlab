import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

interface SavedWave {
  id: string;
  name: string;
  frequencies: number[];
  createdAt: Date;
}

interface WaveEditorProps {
  width?: number;
  height?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function WaveEditor({ 
  width = screenWidth - 32, // Default with padding
  height = 300, // Reasonable default height
}: WaveEditorProps) {
  
  // Wave parameters
  const [frequencies, setFrequencies] = useState([100]); // Start with 100Hz
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [volume, setVolume] = useState(0.3); // Volume from 0 to 1
  
  // Bookmark system
  const [savedWaves, setSavedWaves] = useState<SavedWave[]>([]);
  const [waveName, setWaveName] = useState('');
  
  // Audio context and oscillator refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);
  
  // Animation values
  const animationProgress = useSharedValue(0);
  const wavePhase = useSharedValue(0);
  const animationRef = useRef<number | null>(null);
  
  // Initialize audio context
  useEffect(() => {
    const initAudio = async () => {
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: false,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: false,
          playThroughEarpieceAndroid: false,
        });
      } catch (error) {
        console.warn('Error setting audio mode:', error);
      }
    };
    
    initAudio();
    
    return () => {
      stopWave();
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);
  
  const startWave = async () => {
    try {
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Clear previous oscillators
      oscillatorsRef.current = [];
      gainNodesRef.current = [];
      
      // Create oscillators for each frequency
      frequencies.forEach((freq) => {
        // Create oscillator for sine wave
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
        
        // Create gain node for volume control (split volume between oscillators)
        const gainNode = audioContext.createGain();
        const volumePerOscillator = volume / frequencies.length; // Split volume evenly
        gainNode.gain.setValueAtTime(volumePerOscillator, audioContext.currentTime);
        
        // Connect oscillator
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Store references
        oscillatorsRef.current.push(oscillator);
        gainNodesRef.current.push(gainNode);
        
        // Start playing
        oscillator.start();
      });
      
      setIsPlaying(true);
      isPlayingRef.current = true;
      animationProgress.value = withTiming(1, { duration: 300 });
      
      // Start smooth modular wave animation
      const startTime = Date.now();
      const animateWave = () => {
        if (!isPlayingRef.current) return;
        
        const elapsed = Date.now() - startTime;
        // Create smooth, continuous phase using modulo to wrap around seamlessly
        wavePhase.value = (elapsed * 0.003) % (Math.PI * 2);
        
        animationRef.current = setTimeout(animateWave, 16); // ~60fps
      };
      animateWave();
      
    } catch (error) {
      console.error('Error starting wave:', error);
    }
  };
  
  const stopWave = () => {
    try {
      // Stop all oscillators
      oscillatorsRef.current.forEach(oscillator => {
        if (oscillator) {
          oscillator.stop();
        }
      });
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      // Clear arrays
      oscillatorsRef.current = [];
      gainNodesRef.current = [];
      
      setIsPlaying(false);
      isPlayingRef.current = false;
      animationProgress.value = withTiming(0, { duration: 300 });
      
      // Stop wave animation
      if (animationRef.current) {
        clearTimeout(animationRef.current);
        animationRef.current = null;
      }
      wavePhase.value = 0;
    } catch (error) {
      console.warn('Error stopping wave:', error);
    }
  };
  
  const togglePlayback = () => {
    if (isPlaying) {
      stopWave();
    } else {
      startWave();
    }
  };
  
  // Update frequencies during playback
  useEffect(() => {
    if (oscillatorsRef.current.length > 0 && audioContextRef.current) {
      // Update existing oscillators with new frequencies if lengths match
      if (oscillatorsRef.current.length === frequencies.length) {
        oscillatorsRef.current.forEach((oscillator, index) => {
          if (oscillator && audioContextRef.current) {
            oscillator.frequency.setValueAtTime(
              frequencies[index], 
              audioContextRef.current.currentTime
            );
          }
        });
      } else {
        // Length changed - need to restart audio
        if (isPlaying) {
          stopWave();
          // Small delay before restarting
          setTimeout(() => {
            startWave();
          }, 100);
        }
      }
    }
  }, [frequencies]);

  // Update volume during playback
  useEffect(() => {
    if (gainNodesRef.current.length > 0 && audioContextRef.current) {
      const volumePerOscillator = volume / frequencies.length;
      gainNodesRef.current.forEach((gainNode) => {
        if (gainNode && audioContextRef.current) {
          gainNode.gain.setValueAtTime(volumePerOscillator, audioContextRef.current.currentTime);
        }
      });
    }
  }, [volume, frequencies.length]);
  
  // Helper functions for managing frequencies
  const addFrequency = () => {
    if (frequencies.length < 8) { // Limit to 8 frequencies
      const newFreq = frequencies[0] * 2; // Default to octave above first frequency
      setFrequencies([...frequencies, newFreq]);
    }
  };
  
  const removeFrequency = (index: number) => {
    if (frequencies.length > 1) { // Keep at least one frequency
      const newFrequencies = frequencies.filter((_, i) => i !== index);
      setFrequencies(newFrequencies);
    }
  };
  
  const updateFrequency = (index: number, newFreq: number) => {
    const newFrequencies = [...frequencies];
    newFrequencies[index] = newFreq;
    setFrequencies(newFrequencies);
  };
  
  // UUID generation (simple version for demo)
  const generateUUID = () => {
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  
  // Bookmark functions
  const saveCurrentWave = () => {
    const id = generateUUID();
    // Use first 4 letters of UUID if no name is provided
    const name = waveName.trim() === '' ? id.substring(0, 4) : waveName.trim();
    
    const newSavedWave: SavedWave = {
      id,
      name,
      frequencies: [...frequencies],
      createdAt: new Date()
    };
    
    setSavedWaves(prev => [...prev, newSavedWave]);
    setWaveName(''); // Clear the input
    Alert.alert('Saved!', `"${newSavedWave.name}" has been saved!`);
  };
  
  const loadSavedWave = (savedWave: SavedWave) => {
    setFrequencies([...savedWave.frequencies]);
    setWaveName(savedWave.name); // Load name for potential editing
  };
  
  const deleteSavedWave = (id: string) => {
    setSavedWaves(prev => prev.filter(wave => wave.id !== id));
  };
  
const IndividualWave = ({ freq, index, width, height, animationProgress, wavePhase }: {
  freq: number;
  index: number;
  width: number;
  height: number;
  animationProgress: any;
  wavePhase: any;
}) => {
  const animatedProps = useAnimatedProps(() => {
    const points = 200;
    const amplitude = 40 + (animationProgress.value * 20);
    const phaseOffset = wavePhase.value;
    const centerY = height / 2;
    
    let pathData = '';
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const normalizedFreq = freq / 1000;
      const sineValue = Math.sin((i / points) * Math.PI * 8 * normalizedFreq + phaseOffset);
      const y = centerY + (sineValue * amplitude);
      
      if (i === 0) {
        pathData = `M ${x} ${y}`;
      } else {
        pathData += ` L ${x} ${y}`;
      }
    }
    
    return { d: pathData };
  });

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      stroke="#444444"
      strokeWidth={1}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.6}
    />
  );
};

  // Generate multi-frequency sine wave visualization (composite)
  const animatedProps = useAnimatedProps(() => {
    const points = 200;
    const amplitude = 40 + (animationProgress.value * 20);
    const phaseOffset = wavePhase.value;
    
    let pathData = '';
    const centerY = height / 2;
    
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      
      // Sum all frequencies for complex waveform
      let combinedValue = 0;
      frequencies.forEach((freq) => {
        const normalizedFreq = freq / 1000;
        const sineValue = Math.sin((i / points) * Math.PI * 8 * normalizedFreq + phaseOffset);
        combinedValue += sineValue / frequencies.length; // Average the amplitudes
      });
      
      const y = centerY + (combinedValue * amplitude);
      
      if (i === 0) {
        pathData = `M ${x} ${y}`;
      } else {
        pathData += ` L ${x} ${y}`;
      }
    }
    
    return { d: pathData };
  });

  return (
    <View style={[styles.container, { width }]}>
      {/* Waveform Display */}
      <View style={[styles.waveformContainer, { width, height }]}>
        <Svg width={width} height={height}>
          {/* Individual sine waves in light gray */}
          {frequencies.map((freq, index) => (
            <IndividualWave
              key={`wave-${index}-${freq}`}
              freq={freq}
              index={index}
              width={width}
              height={height}
              animationProgress={animationProgress}
              wavePhase={wavePhase}
            />
          ))}
          
          {/* Composite waveform in green */}
          <AnimatedPath
            animatedProps={animatedProps}
            stroke={isPlaying ? "#00ff00" : "#888888"}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        
        {/* Wave info overlay */}
        <View style={styles.infoOverlay}>
          <Text style={styles.infoText}>
            {frequencies.length === 1 
              ? `${Math.round(frequencies[0])}Hz Sine Wave`
              : `${frequencies.length} Frequency Mix`
            }
          </Text>
          {frequencies.length > 1 && (
            <Text style={styles.frequencyList}>
              {frequencies.map(f => Math.round(f)).join('Hz, ')}Hz
            </Text>
          )}
        </View>
      </View>
      
      {/* Controls */}
      <View style={styles.controlsContainer}>
        {/* Play/Stop Button */}
        <TouchableOpacity
          style={[styles.playButton, isPlaying && styles.playButtonActive]}
          onPress={togglePlayback}
        >
          <Ionicons 
            name={isPlaying ? "stop" : "play"} 
            size={24} 
            color={isPlaying ? "#ff0000" : "#00ff00"} 
          />
        </TouchableOpacity>
        
        {/* Volume Control */}
        <View style={styles.volumeSection}>
          <View style={styles.volumeHeader}>
            <Ionicons name="volume-medium" size={20} color="#00ff00" />
            <Text style={styles.volumeLabel}>Volume</Text>
            <Text style={styles.volumeValue}>{Math.round(volume * 100)}%</Text>
          </View>
          <Slider
            style={styles.volumeSlider}
            minimumValue={0}
            maximumValue={1}
            value={volume}
            onValueChange={setVolume}
            minimumTrackTintColor="#00ff00"
            maximumTrackTintColor="#333333"
            thumbTintColor="#00ff00"
          />
        </View>
        
        {/* Frequency Controls */}
        <View style={styles.frequenciesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Frequencies</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={addFrequency}
              disabled={frequencies.length >= 8}
            >
              <Ionicons name="add" size={20} color="#00ff00" />
            </TouchableOpacity>
          </View>
          
          {frequencies.map((freq, index) => (
            <View key={index} style={styles.frequencyRow}>
              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>
                  Wave {index + 1}
                </Text>
                <Slider
                  style={styles.slider}
                  minimumValue={10}
                  maximumValue={2000}
                  value={freq}
                  onValueChange={(value) => updateFrequency(index, value)}
                  minimumTrackTintColor="#00ff00"
                  maximumTrackTintColor="#333333"
                  thumbTintColor="#00ff00"
                />
                <Text style={styles.sliderValue}>{Math.round(freq)}Hz</Text>
              </View>
              {frequencies.length > 1 && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeFrequency(index)}
                >
                  <Ionicons name="remove" size={16} color="#ff0000" />
                </TouchableOpacity>
              )}
            </View>
          ))}
          
          {/* Bookmark Section - moved to bottom of frequencies area */}
          <View style={styles.bookmarkSection}>
            <View style={styles.bookmarkInputRow}>
              <TextInput
                style={styles.nameInput}
                placeholder="Wave name (optional)..."
                placeholderTextColor="#666666"
                value={waveName}
                onChangeText={setWaveName}
              />
              <TouchableOpacity
                style={styles.bookmarkButton}
                onPress={saveCurrentWave}
              >
                <Ionicons name="bookmark" size={20} color="#536471" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      
      {/* Saved Waves */}
      {savedWaves.length > 0 && (
        <View style={styles.savedWavesContainer}>
          <Text style={styles.savedWavesTitle}>Saved Waves</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.savedWavesScroll}>
            {savedWaves.map((savedWave) => (
              <TouchableOpacity
                key={savedWave.id}
                style={styles.savedWaveItem}
                onPress={() => loadSavedWave(savedWave)}
                onLongPress={() => {
                  Alert.alert(
                    'Delete Wave',
                    `Delete "${savedWave.name}"?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => deleteSavedWave(savedWave.id) }
                    ]
                  );
                }}
              >
                <Ionicons name="musical-note" size={24} color="#ff8800" />
                <Text style={styles.savedWaveName}>{savedWave.name}</Text>
                <Text style={styles.savedWaveFreqs}>
                  {savedWave.frequencies.length} wave{savedWave.frequencies.length !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    // No margin - parent controls layout
  },
  waveformContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    overflow: 'hidden',
    position: 'relative',
  },
  infoOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 6,
    padding: 6,
  },
  infoText: {
    color: '#00ff00',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  frequencyList: {
    color: '#888888',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  controlsContainer: {
    padding: 16,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    marginTop: 8,
  },
  playButton: {
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 30,
    padding: 15,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    marginBottom: 16,
  },
  playButtonActive: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderColor: 'rgba(255, 0, 0, 0.3)',
  },
  volumeSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(0, 255, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.2)',
  },
  volumeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  volumeLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  volumeValue: {
    color: '#00ff00',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  volumeSlider: {
    width: '100%',
    height: 20,
  },
  bookmarkSection: {
    marginTop: 16, // Add top margin since it's now at the bottom
    marginBottom: 0, // Remove bottom margin since it's at the end
  },
  bookmarkInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(83, 100, 113, 0.3)', // Match the bookmark button color
    fontSize: 14,
  },
  bookmarkButton: {
    backgroundColor: 'rgba(83, 100, 113, 0.1)', // Dark gray background like Twitter
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(83, 100, 113, 0.3)', // Dark gray border like Twitter
  },
  frequenciesSection: {
    marginTop: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 20,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  frequencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sliderContainer: {
    flex: 1,
    marginRight: 8,
  },
  sliderLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
    fontWeight: '500',
  },
  slider: {
    width: '100%',
    height: 20,
  },
  sliderValue: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  removeButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.3)',
  },
  savedWavesContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
  },
  savedWavesTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  savedWavesScroll: {
    flexDirection: 'row',
  },
  savedWaveItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginRight: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 136, 0, 0.3)',
    minWidth: 80,
  },
  savedWaveName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  savedWaveFreqs: {
    color: '#888888',
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
});