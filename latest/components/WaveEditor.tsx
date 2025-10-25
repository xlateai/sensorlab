import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import WebAudioBridge from './WebAudioBridge';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

interface WaveDefinition {
  id: string;
  type: 'sine' | 'sweep';
  shape: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';
  frequency: number; // For sine waves
  startFreq: number; // For sweep waves
  endFreq: number; // For sweep waves
  sweepK: number; // For sweep waves
}

interface SavedWave {
  id: string;
  name: string;
  waves: WaveDefinition[];
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
  
  // Platform detection
  const isIOS = Platform.OS === 'ios';
  const isWeb = Platform.OS === 'web';
  
  // WebAudio bridge state for iOS
  const [isWebAudioReady, setIsWebAudioReady] = useState(false);
  const [webAudioError, setWebAudioError] = useState<string | null>(null);
  
  // Wave parameters
  const [waves, setWaves] = useState<WaveDefinition[]>([{
    id: '1',
    type: 'sine',
    shape: 'sine',
    frequency: 100,
    startFreq: 100,
    endFreq: 1000,
    sweepK: 10
  }]);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const [volume, setVolume] = useState(0.3); // Volume from 0 to 1
  const [multiplicity, setMultiplicity] = useState(1.0); // Frequency multiplier from 0 to 1
  const [isNegated, setIsNegated] = useState(false); // Negate waveform (invert phase)
  
  // Bookmark system
  const [savedWaves, setSavedWaves] = useState<SavedWave[]>([]);
  const [waveName, setWaveName] = useState('');
  
  // Dropdown management - only one dropdown open at a time
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
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
        // Only set audio mode on platforms that support it safely
        if (!isIOS) {
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: false,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: false,
            playThroughEarpieceAndroid: false,
          });
        } else {
          console.log('Skipping audio mode setup on iOS (debugging mode)');
        }
      } catch (error) {
        console.warn('Error setting audio mode:', error);
      }
    };
    
    initAudio();
    
    return () => {
      // Cleanup function - don't call stopWave here to avoid reference issues
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);
  
  // Visual wave shape generation for previews
  const generateShapeVisualization = (shape: string, points: number, width: number, amplitude: number): string => {
    try {
    let pathData = '';
    const cycles = 2; // Show 2 complete cycles
    
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const t = (i / points) * cycles * Math.PI * 2;
      let y = 0;
      
      switch (shape) {
        case 'sine':
          y = Math.sin(t);
          break;
        case 'square':
          y = Math.sin(t) >= 0 ? 1 : -1;
          break;
        case 'triangle':
          y = (2 / Math.PI) * Math.asin(Math.sin(t));
          break;
        case 'sawtooth':
          y = 2 * (t / (2 * Math.PI) - Math.floor(t / (2 * Math.PI) + 0.5));
          break;
        case 'noise':
          y = Math.random() * 2 - 1;
          break;
        default:
          y = Math.sin(t);
      }
      
      const yPos = (y * amplitude) + (amplitude * 2); // Center the wave
      
      if (i === 0) {
        pathData = `M ${x} ${yPos}`;
      } else {
        pathData += ` L ${x} ${yPos}`;
      }
    }
    
    return pathData;
    } catch (error) {
      console.warn('Error generating shape visualization:', error);
      // Return a simple line as fallback
      return `M 0 ${amplitude} L ${width} ${amplitude}`;
    }
  };

  // Wave shape functions for custom waveforms
  const generateWaveShape = (shape: string, freq: number, audioContext: AudioContext): OscillatorNode => {
    const oscillator = audioContext.createOscillator();
    
    switch (shape) {
      case 'sine':
        oscillator.type = 'sine';
        break;
      case 'square':
        oscillator.type = 'square';
        break;
      case 'triangle':
        oscillator.type = 'triangle';
        break;
      case 'sawtooth':
        oscillator.type = 'sawtooth';
        break;
      case 'noise':
        // For noise, we'll use a sawtooth with custom periodic wave
        const real = new Float32Array(16);
        const imag = new Float32Array(16);
        for (let i = 0; i < 16; i++) {
          real[i] = Math.random() * 2 - 1;
          imag[i] = Math.random() * 2 - 1;
        }
        const customWave = audioContext.createPeriodicWave(real, imag);
        oscillator.setPeriodicWave(customWave);
        break;
      default:
        oscillator.type = 'sine';
    }
    
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    return oscillator;
  };

  const startWave = async () => {
    // Use WebAudio bridge on iOS
    if (isIOS) {
      if (!isWebAudioReady) {
        console.log('WebAudio bridge not ready yet');
        return;
      }
      
      console.log('Using WebAudio bridge for iOS audio playback');
      setIsPlaying(true);
      isPlayingRef.current = true;
      animationProgress.value = withTiming(1, { duration: 300 });
      
      // Start wave animation
      const startTime = Date.now();
      const animateWave = () => {
        if (!isPlayingRef.current) return;
        
        const elapsed = Date.now() - startTime;
        wavePhase.value = (elapsed * 0.003) % (Math.PI * 2);
        
        animationRef.current = setTimeout(animateWave, 16);
      };
      animateWave();
      
      // The WebAudioBridge will handle actual audio playback via useEffect
      return;
    }
    
    try {
      // Create audio context (Web only for now)
      if (!isWeb) {
        console.log('Audio context not supported on this platform');
        return;
      }
      
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Clear previous oscillators
      oscillatorsRef.current = [];
      gainNodesRef.current = [];
      
      // Get current frequencies and shapes based on wave type
      const currentWaves = waves.flatMap(wave => {
        if (wave.type === 'sine') {
          return [{ frequency: wave.frequency, shape: wave.shape }];
        } else {
          // sweep type
          if (wave.sweepK < 2) return [{ frequency: wave.startFreq, shape: wave.shape }];
          
          const waveData: { frequency: number; shape: string }[] = [];
          const step = (wave.endFreq - wave.startFreq) / (wave.sweepK - 1);
          
          for (let i = 0; i < wave.sweepK; i++) {
            waveData.push({ 
              frequency: wave.startFreq + (step * i), 
              shape: wave.shape 
            });
          }
          
          return waveData;
        }
      });
      
      // Create oscillators for each frequency and shape
      currentWaves.forEach((waveData) => {
        // Create oscillator with specific shape
        const oscillator = generateWaveShape(waveData.shape, waveData.frequency, audioContext);
        const multipliedFreq = waveData.frequency * multiplicity;
        oscillator.frequency.setValueAtTime(multipliedFreq, audioContext.currentTime);
        
        // Create gain node for volume control (split volume between oscillators)
        const gainNode = audioContext.createGain();
        const volumePerOscillator = volume / currentWaves.length; // Split volume evenly
        const finalGain = isNegated ? -volumePerOscillator : volumePerOscillator;
        gainNode.gain.setValueAtTime(finalGain, audioContext.currentTime);
        
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
      // On error, at least enable visual animation
      setIsPlaying(true);
      isPlayingRef.current = true;
      animationProgress.value = withTiming(1, { duration: 300 });
    }
  };
  
  const stopWave = () => {
    try {
      // Only try to stop audio context on web platform
      if (!isIOS && audioContextRef.current) {
        // Stop all oscillators
        oscillatorsRef.current.forEach(oscillator => {
          if (oscillator) {
            oscillator.stop();
          }
        });
        
        audioContextRef.current.close();
        audioContextRef.current = null;
        
        // Clear arrays
        oscillatorsRef.current = [];
        gainNodesRef.current = [];
      }
      
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
  
  // Track previous wave shapes to detect shape changes
  const previousWaveShapesRef = useRef<string>('');
  
  // Update frequencies during playback (for live frequency/multiplicity changes)
  useEffect(() => {
    if (!isIOS && oscillatorsRef.current.length > 0 && audioContextRef.current) {
      const currentFrequencies = getCurrentFrequencies();
      
      // Create a signature of current wave shapes and count
      const currentShapeSignature = waves.map(w => `${w.type}-${w.shape}-${w.sweepK}`).join('|');
      
      // Check if only frequencies changed (not shapes or count)
      if (oscillatorsRef.current.length === currentFrequencies.length && 
          currentShapeSignature === previousWaveShapesRef.current) {
        // Only frequencies/multiplicity changed - update live without restart
        oscillatorsRef.current.forEach((oscillator, index) => {
          if (oscillator && audioContextRef.current) {
            const multipliedFreq = currentFrequencies[index] * multiplicity;
            oscillator.frequency.setValueAtTime(
              multipliedFreq, 
              audioContextRef.current.currentTime
            );
          }
        });
      } else {
        // Shape or count changed - need to restart audio
        previousWaveShapesRef.current = currentShapeSignature;
        if (isPlaying) {
          stopWave();
          setTimeout(() => {
            startWave();
          }, 50);
        }
      }
    } else {
      // Update the signature even when not playing
      const currentShapeSignature = waves.map(w => `${w.type}-${w.shape}-${w.sweepK}`).join('|');
      previousWaveShapesRef.current = currentShapeSignature;
    }
  }, [waves, multiplicity]);

  // Update volume during playback
  useEffect(() => {
    if (!isIOS && gainNodesRef.current.length > 0 && audioContextRef.current) {
      const currentFrequencies = getCurrentFrequencies();
      const volumePerOscillator = volume / currentFrequencies.length;
      const finalGain = isNegated ? -volumePerOscillator : volumePerOscillator;
      gainNodesRef.current.forEach((gainNode) => {
        if (gainNode && audioContextRef.current) {
          gainNode.gain.setValueAtTime(finalGain, audioContextRef.current.currentTime);
        }
      });
    }
  }, [volume, waves.length, isNegated]);
  
  // Helper functions for managing waves
  const addWave = () => {
    if (waves.length < 8) { // Limit to 8 waves
      const newId = (parseInt(waves[waves.length - 1].id) + 1).toString();
      const newWave: WaveDefinition = {
        id: newId,
        type: 'sine',
        shape: 'sine',
        frequency: waves[0].frequency * 2, // Default to octave above first wave
        startFreq: 100,
        endFreq: 1000,
        sweepK: 10
      };
      setWaves([...waves, newWave]);
    }
  };
  
  const removeWave = (index: number) => {
    if (waves.length > 1) { // Keep at least one wave
      const newWaves = waves.filter((_, i) => i !== index);
      setWaves(newWaves);
    }
  };
  
  const updateWave = (index: number, updates: Partial<WaveDefinition>) => {
    const newWaves = [...waves];
    newWaves[index] = { ...newWaves[index], ...updates };
    setWaves(newWaves);
  };
  
  // Generate frequencies for a single wave definition
  const generateWaveFrequencies = (wave: WaveDefinition): number[] => {
    if (wave.type === 'sine') {
      return [wave.frequency];
    } else {
      // sweep type
      if (wave.sweepK < 2) return [wave.startFreq];
      
      const freqs: number[] = [];
      const step = (wave.endFreq - wave.startFreq) / (wave.sweepK - 1);
      
      for (let i = 0; i < wave.sweepK; i++) {
        freqs.push(wave.startFreq + (step * i));
      }
      
      return freqs;
    }
  };
  
  // Get all current frequencies from all waves
  const getCurrentFrequencies = () => {
    const allFreqs: number[] = [];
    waves.forEach(wave => {
      allFreqs.push(...generateWaveFrequencies(wave));
    });
    return allFreqs;
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
      waves: [...waves],
      createdAt: new Date()
    };
    
    setSavedWaves(prev => [...prev, newSavedWave]);
    setWaveName(''); // Clear the input
    Alert.alert('Saved!', `"${newSavedWave.name}" has been saved!`);
  };
  
  const loadSavedWave = (savedWave: SavedWave) => {
    setWaves([...savedWave.waves]);
    setWaveName(savedWave.name); // Load name for potential editing
  };
  
  const deleteSavedWave = (id: string) => {
    setSavedWaves(prev => prev.filter(wave => wave.id !== id));
  };
  
// Wave Shape Dropdown Component
const WaveShapeDropdown = ({ selectedShape, onShapeChange, waveId, isOpen, onToggle }: {
  selectedShape: string;
  onShapeChange: (shape: string) => void;
  waveId: string;
  isOpen: boolean;
  onToggle: () => void;
}) => {
  const shapeOptions = [
    { id: 'sine', name: 'Sine', icon: '∿' },
    { id: 'square', name: 'Square', icon: '⌐' },
    { id: 'triangle', name: 'Triangle', icon: '△' },
    { id: 'sawtooth', name: 'Sawtooth', icon: '⟋' },
    { id: 'noise', name: 'Noise', icon: '≈' },
  ];

  const selectedOption = shapeOptions.find(opt => opt.id === selectedShape) || shapeOptions[0];

  return (
    <View style={styles.dropdownContainer}>
      <TouchableOpacity
        style={styles.dropdownButton}
        onPress={onToggle}
      >
        <View style={styles.dropdownButtonContent}>
          <Text style={styles.shapeIcon}>{selectedOption.icon}</Text>
          <Text style={styles.shapeName}>{selectedOption.name}</Text>
          <Ionicons 
            name={isOpen ? "chevron-up" : "chevron-down"} 
            size={16} 
            color="#888888" 
          />
        </View>
      </TouchableOpacity>
      
      {isOpen && (
        <View style={styles.dropdownMenu}>
          {shapeOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.dropdownOption,
                selectedShape === option.id && styles.dropdownOptionSelected
              ]}
              onPress={() => {
                onShapeChange(option.id);
                onToggle(); // Close dropdown after selection
              }}
            >
              <View style={styles.dropdownOptionContent}>
                <View style={styles.shapePreview}>
                  <Svg width={60} height={30}>
                    <Path
                      d={generateShapeVisualization(option.id, 50, 60, 8)}
                      stroke={selectedShape === option.id ? "#00ff00" : "#888888"}
                      strokeWidth={1.5}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </View>
                <View style={styles.shapeInfo}>
                  <Text style={[
                    styles.shapeOptionIcon,
                    selectedShape === option.id && styles.shapeOptionIconSelected
                  ]}>
                    {option.icon}
                  </Text>
                  <Text style={[
                    styles.shapeOptionName,
                    selectedShape === option.id && styles.shapeOptionNameSelected
                  ]}>
                    {option.name}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          
          {/* Custom Shape Option (Plus button) */}
          <TouchableOpacity
            style={styles.dropdownOptionCustom}
            onPress={() => {
              // TODO: Open custom shape creator
              onToggle(); // Close dropdown
            }}
          >
            <View style={styles.customOptionContent}>
              <View style={styles.customPreview}>
                <Ionicons name="add-circle-outline" size={24} color="#666666" />
              </View>
              <View style={styles.shapeInfo}>
                <Text style={styles.customOptionText}>Custom</Text>
                <Text style={styles.customOptionSubtext}>Create new</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const IndividualWave = ({ freq, shape, index, width, height, animationProgress, wavePhase, multiplicity, isNegated }: {
  freq: number;
  shape: string;
  index: number;
  width: number;
  height: number;
  animationProgress: any;
  wavePhase: any;
  multiplicity: number;
  isNegated: boolean;
}) => {
  const animatedProps = useAnimatedProps(() => {
    // Prevent potential iOS crashes with complex math operations
    try {
    const points = 200;
    const amplitude = 40 + (animationProgress.value * 20);
    const phaseOffset = wavePhase.value;
    const centerY = height / 2;
    
    let pathData = '';
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const multipliedFreq = freq * multiplicity;
      const normalizedFreq = multipliedFreq / 1000;
      const t = (i / points) * Math.PI * 8 * normalizedFreq + phaseOffset;
      
      let waveValue = 0;
      
      // Generate different wave shapes
      switch (shape) {
        case 'sine':
          waveValue = Math.sin(t);
          break;
        case 'square':
          waveValue = Math.sin(t) >= 0 ? 1 : -1;
          break;
        case 'triangle':
          waveValue = (2 / Math.PI) * Math.asin(Math.sin(t));
          break;
        case 'sawtooth':
          waveValue = 2 * (t / (2 * Math.PI) - Math.floor(t / (2 * Math.PI) + 0.5));
          break;
        case 'noise':
          waveValue = (Math.random() - 0.5) * 2; // Random noise
          break;
        default:
          waveValue = Math.sin(t);
      }
      
      // Apply negation if enabled
      if (isNegated) {
        waveValue = -waveValue;
      }
      
      const y = centerY + (waveValue * amplitude);
      
      if (i === 0) {
        pathData = `M ${x} ${y}`;
      } else {
        pathData += ` L ${x} ${y}`;
      }
    }
    
    return { d: pathData };
    } catch (error) {
      console.warn('Error in IndividualWave animation:', error);
      // Return a simple line as fallback
      const centerY = height / 2;
      return { d: `M 0 ${centerY} L ${width} ${centerY}` };
    }
  });

  // All individual waves should be gray
  const getShapeColor = (shape: string) => {
    return '#888888'; // Always gray for individual waves
  };

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      stroke={getShapeColor(shape)}
      strokeWidth={1}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={0.6}
    />
  );
};

const SweepWave = ({ startFreq, endFreq, k, width, height, animationProgress, wavePhase, multiplicity, isNegated }: {
  startFreq: number;
  endFreq: number;
  k: number;
  width: number;
  height: number;
  animationProgress: any;
  wavePhase: any;
  multiplicity: number;
  isNegated: boolean;
}) => {
  const envelopeProps = useAnimatedProps(() => {
    try {
    const points = 100;
    const amplitude = 40 + (animationProgress.value * 20);
    const phaseOffset = wavePhase.value;
    const centerY = height / 2;
    
    let topPath = '';
    let bottomPath = '';
    
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      
      let maxValue = 0;
      let minValue = 0;
      
      // Calculate envelope from all frequencies in the sweep
      for (let j = 0; j < k; j++) {
        const freq = startFreq + (endFreq - startFreq) * (j / (k - 1));
        const multipliedFreq = freq * multiplicity;
        const normalizedFreq = multipliedFreq / 1000;
        let sineValue = Math.sin((i / points) * Math.PI * 8 * normalizedFreq + phaseOffset);
        
        if (isNegated) {
          sineValue = -sineValue;
        }
        
        maxValue = Math.max(maxValue, sineValue);
        minValue = Math.min(minValue, sineValue);
      }
      
      const topY = centerY + (maxValue * amplitude);
      const bottomY = centerY + (minValue * amplitude);
      
      if (i === 0) {
        topPath = `M ${x} ${topY}`;
        bottomPath = `M ${x} ${bottomY}`;
      } else {
        topPath += ` L ${x} ${topY}`;
        bottomPath += ` L ${x} ${bottomY}`;
      }
    }
    
    // Create filled envelope
    const reversedBottomPath = bottomPath.replace('M', 'L').split('L').reverse().join('L').replace('L', 'L');
    const fillPath = `${topPath} ${reversedBottomPath} Z`;
    
    return { d: fillPath };
    } catch (error) {
      console.warn('Error in SweepWave animation:', error);
      // Return a simple rectangle as fallback
      return { d: `M 0 ${height/2-10} L ${width} ${height/2-10} L ${width} ${height/2+10} L 0 ${height/2+10} Z` };
    }
  });

  return (
    <AnimatedPath
      animatedProps={envelopeProps}
      stroke="none"
      fill="rgba(68, 68, 68, 0.15)"
      opacity={0.8}
    />
  );
};

  // Generate multi-frequency sine wave visualization (composite)
  const animatedProps = useAnimatedProps(() => {
    try {
    const points = 200;
    // Increase base amplitude and animation effect for better visibility
    const amplitude = 60 + (animationProgress.value * 40);
    const phaseOffset = wavePhase.value;
    
    let pathData = '';
    const centerY = height / 2;
    
    // If no waves, return a flat line
    if (waves.length === 0) {
      return { d: `M 0 ${centerY} L ${width} ${centerY}` };
    }
    
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      
      // Sum all waves with their actual shapes for complex waveform
      let combinedValue = 0;
      let waveCount = 0;
      
      waves.forEach((wave) => {
        const waveFreqs = generateWaveFrequencies(wave);
        waveFreqs.forEach((freq) => {
          const multipliedFreq = freq * multiplicity;
          const normalizedFreq = multipliedFreq / 1000;
          const t = (i / points) * Math.PI * 8 * normalizedFreq + phaseOffset;
          
          let waveValue = 0;
          
          // Generate different wave shapes - same logic as IndividualWave
          switch (wave.shape) {
            case 'sine':
              waveValue = Math.sin(t);
              break;
            case 'square':
              waveValue = Math.sin(t) >= 0 ? 1 : -1;
              break;
            case 'triangle':
              waveValue = (2 / Math.PI) * Math.asin(Math.sin(t));
              break;
            case 'sawtooth':
              waveValue = 2 * (t / (2 * Math.PI) - Math.floor(t / (2 * Math.PI) + 0.5));
              break;
            case 'noise':
              waveValue = (Math.random() - 0.5) * 2; // Random noise
              break;
            default:
              waveValue = Math.sin(t);
          }
          
          // Apply negation if enabled
          if (isNegated) {
            waveValue = -waveValue;
          }
          
          combinedValue += waveValue;
          waveCount++;
        });
      });
      
      // Normalize but ensure visibility - don't over-reduce the amplitude
      if (waveCount > 0) {
        // Use a gentler normalization that keeps the composite wave visible
        const normalizationFactor = Math.max(1, waveCount * 0.7); // Gentler scaling
        combinedValue = combinedValue / normalizationFactor;
      }
      
      const y = centerY + (combinedValue * amplitude);
      
      if (i === 0) {
        pathData = `M ${x} ${y}`;
      } else {
        pathData += ` L ${x} ${y}`;
      }
    }
    
    // Ensure we have a valid path
    if (!pathData) {
      pathData = `M 0 ${centerY} L ${width} ${centerY}`;
    }
    
    return { d: pathData };
    } catch (error) {
      console.warn('Error in composite wave animation:', error);
      // Return a simple line as fallback
      const centerY = height / 2;
      return { d: `M 0 ${centerY} L ${width} ${centerY}` };
    }
  });

  return (
    <TouchableOpacity 
      style={[styles.container, { width }]}
      activeOpacity={1}
      onPress={() => {
        // Close any open dropdown when clicking outside
        if (openDropdownId) {
          setOpenDropdownId(null);
        }
      }}
    >
      {/* Waveform Display */}
      <View style={[styles.waveformContainer, { width, height }]}>
        <Svg width={width} height={height}>
          {/* Individual waves - both sine and sweep */}
          {waves.map((wave, waveIndex) => {
            if (wave.type === 'sine') {
              return (
                <IndividualWave
                  key={`wave-${wave.id}`}
                  freq={wave.frequency}
                  shape={wave.shape}
                  index={waveIndex}
                  width={width}
                  height={height}
                  animationProgress={animationProgress}
                  wavePhase={wavePhase}
                  multiplicity={multiplicity}
                  isNegated={isNegated}
                />
              );
            } else {
              // For sweep waves, render individual sine waves for each frequency
              const sweepFreqs = generateWaveFrequencies(wave);
              return sweepFreqs.map((freq, freqIndex) => (
                <IndividualWave
                  key={`sweep-${wave.id}-${freqIndex}`}
                  freq={freq}
                  shape={wave.shape}
                  index={waveIndex * 100 + freqIndex} // Unique index
                  width={width}
                  height={height}
                  animationProgress={animationProgress}
                  wavePhase={wavePhase}
                  multiplicity={multiplicity}
                  isNegated={isNegated}
                />
              ));
            }
          })}
          
          {/* Composite waveform */}
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
            {waves.length === 1 && waves[0].type === 'sine'
              ? `${Math.round(waves[0].frequency * multiplicity)}Hz Sine Wave`
              : `${waves.length} Wave${waves.length !== 1 ? 's' : ''}`
            }
          </Text>
          {isIOS && (
            <Text style={styles.debugInfo}>
              {isWebAudioReady ? 'WebAudio Bridge Ready' : 'WebAudio Loading...'}
            </Text>
          )}
          {webAudioError && (
            <Text style={styles.errorInfo}>
              Audio Error: {webAudioError}
            </Text>
          )}
          {multiplicity !== 1.0 && (
            <Text style={styles.multiplicityInfo}>
              Multiplicity: {Math.round(multiplicity * 100)}%
            </Text>
          )}
          {isNegated && (
            <Text style={styles.negationInfo}>
              Phase: Inverted
            </Text>
          )}
        </View>
      </View>
      
      {/* Controls */}
      <View style={styles.controlsContainer}>
        {/* Play/Stop and Negate Buttons */}
        <View style={styles.playButtonsContainer}>
          <TouchableOpacity
            style={[
              styles.playButton, 
              isPlaying && styles.playButtonActive,
              (isIOS && !isWebAudioReady) && styles.playButtonDisabled
            ]}
            onPress={togglePlayback}
            disabled={isIOS && !isWebAudioReady}
          >
            <Ionicons 
              name={isPlaying ? "stop" : "play"} 
              size={24} 
              color={isPlaying ? "#ff0000" : "#00ff00"} 
            />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.negateButton, isNegated && styles.negateButtonActive]}
            onPress={() => setIsNegated(!isNegated)}
          >
            <Ionicons 
              name="remove" 
              size={20} 
              color={isNegated ? "#ff0000" : "#888888"} 
            />
            <Text style={[styles.negateButtonText, isNegated && styles.negateButtonTextActive]}>
              Negate
            </Text>
          </TouchableOpacity>
        </View>
        
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

        {/* Multiplicity Control */}
        <View style={styles.multiplicitySection}>
          <View style={styles.multiplicityHeader}>
            <Ionicons name="contract" size={20} color="#ff8800" />
            <Text style={styles.multiplicityLabel}>Multiplicity</Text>
            <Text style={styles.multiplicityValue}>{Math.round(multiplicity * 100)}%</Text>
          </View>
          <Slider
            style={styles.multiplicitySlider}
            minimumValue={0}
            maximumValue={1}
            value={multiplicity}
            onValueChange={setMultiplicity}
            minimumTrackTintColor="#ff8800"
            maximumTrackTintColor="#333333"
            thumbTintColor="#ff8800"
          />
        </View>

        {/* Wave Controls */}
        <View style={styles.frequenciesSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Waves</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={addWave}
              disabled={waves.length >= 8}
            >
              <Ionicons name="add" size={20} color="#00ff00" />
            </TouchableOpacity>
          </View>
          
          {waves.map((wave, index) => (
            <View key={wave.id} style={styles.waveRow}>
              <View style={styles.waveContainer}>
                <Text style={styles.waveLabel}>
                  Wave {index + 1}
                </Text>
                
                {wave.type === 'sine' ? (
                  <Slider
                    style={styles.slider}
                    minimumValue={10}
                    maximumValue={2000}
                    value={wave.frequency}
                    onValueChange={(value) => updateWave(index, { frequency: value })}
                    minimumTrackTintColor="#00ff00"
                    maximumTrackTintColor="#333333"
                    thumbTintColor="#00ff00"
                  />
                ) : (
                  <View style={styles.sweepControlsContainer}>
                    <View style={styles.sweepControlRow}>
                      <Text style={styles.sweepControlLabel}>Start:</Text>
                      <Slider
                        style={styles.sweepControlSlider}
                        minimumValue={10}
                        maximumValue={2000}
                        value={wave.startFreq}
                        onValueChange={(value) => updateWave(index, { startFreq: value })}
                        minimumTrackTintColor="#888888"
                        maximumTrackTintColor="#333333"
                        thumbTintColor="#888888"
                      />
                      <Text style={styles.sweepControlValue}>{Math.round(wave.startFreq)}</Text>
                    </View>
                    <View style={styles.sweepControlRow}>
                      <Text style={styles.sweepControlLabel}>End:</Text>
                      <Slider
                        style={styles.sweepControlSlider}
                        minimumValue={10}
                        maximumValue={2000}
                        value={wave.endFreq}
                        onValueChange={(value) => updateWave(index, { endFreq: value })}
                        minimumTrackTintColor="#888888"
                        maximumTrackTintColor="#333333"
                        thumbTintColor="#888888"
                      />
                      <Text style={styles.sweepControlValue}>{Math.round(wave.endFreq)}</Text>
                    </View>
                    <View style={styles.sweepControlRow}>
                      <Text style={styles.sweepControlLabel}>Count:</Text>
                      <Slider
                        style={styles.sweepControlSlider}
                        minimumValue={2}
                        maximumValue={50}
                        step={1}
                        value={wave.sweepK}
                        onValueChange={(value) => updateWave(index, { sweepK: value })}
                        minimumTrackTintColor="#888888"
                        maximumTrackTintColor="#333333"
                        thumbTintColor="#888888"
                      />
                      <Text style={styles.sweepControlValue}>{wave.sweepK}</Text>
                    </View>
                  </View>
                )}
                
                <Text style={styles.waveValue}>
                  {wave.type === 'sine' 
                    ? `${Math.round(wave.frequency)}Hz`
                    : `${Math.round(wave.startFreq)}-${Math.round(wave.endFreq)}Hz`
                  }
                </Text>
              </View>
              
              {/* Wave Shape Dropdown */}
              <WaveShapeDropdown
                selectedShape={wave.shape}
                onShapeChange={(shape) => updateWave(index, { shape: shape as any })}
                waveId={wave.id}
                isOpen={openDropdownId === wave.id}
                onToggle={() => {
                  if (openDropdownId === wave.id) {
                    setOpenDropdownId(null); // Close if already open
                  } else {
                    setOpenDropdownId(wave.id); // Open this dropdown and close others
                  }
                }}
              />
              
              <TouchableOpacity
                style={[styles.typeButton, wave.type === 'sweep' && styles.typeButtonActive]}
                onPress={() => updateWave(index, { type: wave.type === 'sine' ? 'sweep' : 'sine' })}
              >
                <Text style={[styles.typeButtonText, wave.type === 'sweep' && styles.typeButtonTextActive]}>
                  {wave.type === 'sine' ? 'S' : 'Sw'}
                </Text>
              </TouchableOpacity>
              
              {waves.length > 1 && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => removeWave(index)}
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
                  {savedWave.waves.length} wave{savedWave.waves.length !== 1 ? 's' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
      
      {/* WebAudio Bridge for iOS */}
      {isIOS && (
        <WebAudioBridge
          waves={waves}
          isPlaying={isPlaying}
          volume={volume}
          multiplicity={multiplicity}
          isNegated={isNegated}
          onAudioReady={() => {
            setIsWebAudioReady(true);
            setWebAudioError(null);
            console.log('WebAudio bridge ready');
          }}
          onError={(error) => {
            setWebAudioError(error);
            console.error('WebAudio bridge error:', error);
          }}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    // No margin - parent controls layout
    overflow: 'visible', // Allow dropdowns to overflow the container
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
  multiplicityInfo: {
    color: '#ff8800',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  negationInfo: {
    color: '#ff0000',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  debugInfo: {
    color: '#ffaa00',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
    fontWeight: 'bold',
  },
  errorInfo: {
    color: '#ff4444',
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 2,
    fontWeight: 'bold',
  },
  controlsContainer: {
    padding: 16,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    marginTop: 8,
    overflow: 'visible', // Allow dropdowns to overflow
  },
  playButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  playButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 30,
    padding: 15,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 0, 0.3)',
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
  negateButton: {
    backgroundColor: 'rgba(136, 136, 136, 0.1)',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  negateButtonActive: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderColor: 'rgba(255, 0, 0, 0.3)',
  },
  negateButtonText: {
    color: '#888888',
    fontSize: 12,
    fontWeight: '500',
  },
  negateButtonTextActive: {
    color: '#ff0000',
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
  multiplicitySection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 136, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 136, 0, 0.2)',
  },
  multiplicityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  multiplicityLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  multiplicityValue: {
    color: '#ff8800',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  multiplicitySlider: {
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
    overflow: 'visible', // Allow dropdowns to overflow
    zIndex: 1, // Ensure proper stacking context
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
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'visible', // Allow dropdown to be visible outside the row
    zIndex: 1, // Ensure the row has proper stacking context
  },
  waveContainer: {
    flex: 1,
    marginRight: 8,
  },
  waveLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
    fontWeight: '500',
  },
  waveValue: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  sweepSliderContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    padding: 8,
    marginVertical: 4,
  },
  sweepRangeText: {
    color: '#888888',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  sweepControlsContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 4,
    padding: 8,
    marginVertical: 4,
  },
  sweepControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  sweepControlLabel: {
    color: '#888888',
    fontSize: 10,
    width: 40,
    fontWeight: '500',
  },
  sweepControlSlider: {
    flex: 1,
    height: 20,
    marginHorizontal: 8,
  },
  sweepControlValue: {
    color: '#888888',
    fontSize: 10,
    fontFamily: 'monospace',
    width: 40,
    textAlign: 'right',
  },
  typeButton: {
    backgroundColor: 'rgba(136, 136, 136, 0.1)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    minWidth: 32,
  },
  typeButtonActive: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  typeButtonText: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  typeButtonTextActive: {
    color: '#00ff00',
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
  waveTypeSection: {
    marginBottom: 16,
  },
  waveTypeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  waveTypeButton: {
    flex: 1,
    backgroundColor: 'rgba(136, 136, 136, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
  },
  waveTypeButtonActive: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  waveTypeButtonText: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  waveTypeButtonTextActive: {
    color: '#00ff00',
  },
  sweepControlsSection: {
    marginBottom: 16,
    padding: 12,
    backgroundColor: 'rgba(255, 136, 0, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 136, 0, 0.2)',
  },
  sweepRow: {
    marginBottom: 12,
  },
  sweepControl: {
    flex: 1,
  },
  sweepLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
    fontWeight: '500',
  },
  sweepSlider: {
    width: '100%',
    height: 20,
  },
  sweepValue: {
    color: '#ff8800',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  // Dropdown styles
  dropdownContainer: {
    position: 'relative',
    zIndex: 99999,
    marginRight: 8,
    elevation: 99999, // For Android
  },
  dropdownButton: {
    backgroundColor: 'rgba(136, 136, 136, 0.1)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    minWidth: 90,
  },
  dropdownButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  shapeIcon: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: 'bold',
  },
  shapeName: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  dropdownMenu: {
    position: 'absolute',
    bottom: '100%', // Position above the button instead of below
    left: -150, // Move to the left to avoid overlap with other buttons
    width: 200, // Fixed width
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    marginBottom: 4, // Margin above the button
    zIndex: 100000,
    elevation: 100000, // For Android
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 }, // Shadow pointing upward
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  dropdownOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(136, 136, 136, 0.2)',
  },
  dropdownOptionSelected: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
  },
  dropdownOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  shapePreview: {
    width: 60,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  shapeInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shapeOptionIcon: {
    color: '#888888',
    fontSize: 16,
    fontWeight: 'bold',
    width: 20,
    textAlign: 'center',
  },
  shapeOptionIconSelected: {
    color: '#00ff00',
  },
  shapeOptionName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
  },
  shapeOptionNameSelected: {
    color: '#00ff00',
  },
  dropdownOptionCustom: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(136, 136, 136, 0.2)',
  },
  customOptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  customPreview: {
    width: 60,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  customOptionText: {
    color: '#666666',
    fontSize: 14,
    fontWeight: '500',
  },
  customOptionSubtext: {
    color: '#444444',
    fontSize: 11,
    marginTop: 2,
  },
});