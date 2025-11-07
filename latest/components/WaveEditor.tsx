import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
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

interface CompositeWave {
  id: string;
  name: string;
  waves: WaveDefinition[];
  volume: number;
  multiplicity: number;
  isPlaying: boolean;
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
  
  // Composite wave system
  const [compositeWaves, setCompositeWaves] = useState<CompositeWave[]>([]);
  const [waveName, setWaveName] = useState('');
  
  // Dropdown management - only one dropdown open at a time
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  
  // Custom curve editor state
  const [showCurveEditor, setShowCurveEditor] = useState(false);
  const [customCurves, setCustomCurves] = useState<Array<{id: string, name: string, points: {x: number, y: number}[]}>>([]);
  
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
    
    // Check if it's a custom curve
    const customCurve = customCurves.find(curve => curve.id === shape);
    
    if (customCurve) {
      // Use the custom curve points for visualization
      for (let i = 0; i <= points; i++) {
        const x = (i / points) * width;
        const t = (i / points) * cycles; // 2 cycles
        
        // Sample the custom curve (repeat the pattern for cycles)
        const curveProgress = (t % 1); // Get fractional part for repeating
        const curveIndex = Math.floor(curveProgress * (customCurve.points.length - 1));
        const nextIndex = Math.min(curveIndex + 1, customCurve.points.length - 1);
        const localT = (curveProgress * (customCurve.points.length - 1)) - curveIndex;
        
        // Linear interpolation between curve points
        const p1 = customCurve.points[curveIndex];
        const p2 = customCurve.points[nextIndex];
        const y = p1.y + (p2.y - p1.y) * localT;
        
        // Convert from 0-1 range to -1 to 1 range
        const normalizedY = (y - 0.5) * 2;
        
        const yPos = (normalizedY * amplitude) + (amplitude * 2); // Center the wave
        
        if (i === 0) {
          pathData = `M ${x} ${yPos}`;
        } else {
          pathData += ` L ${x} ${yPos}`;
        }
      }
    } else {
      // Standard wave shapes
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
    
    // Check if it's a custom curve
    const customCurve = customCurves.find(curve => curve.id === shape);
    
    if (customCurve && customCurve.points && customCurve.points.length > 1) {
      // Generate custom periodic wave from Bezier curve points
      const harmonics = 128; // Number of harmonics to use
      const real = new Float32Array(harmonics);
      const imag = new Float32Array(harmonics);
      
      // Sample the custom curve at regular intervals to create a wavetable
      const samples = 512; // Number of samples for the wavetable
      const wavetable: number[] = [];
      
      for (let i = 0; i < samples; i++) {
        const t = i / samples;
        
        // Find the appropriate curve segment and interpolate
        const curveIndex = Math.floor(t * (customCurve.points.length - 1));
        const nextIndex = Math.min(curveIndex + 1, customCurve.points.length - 1);
        const localT = (t * (customCurve.points.length - 1)) - curveIndex;
        
        const p1 = customCurve.points[curveIndex];
        const p2 = customCurve.points[nextIndex];
        const y = p1.y + (p2.y - p1.y) * localT;
        
        // Convert from 0-1 range to -1 to 1 range
        wavetable[i] = (y - 0.5) * 2;
      }
      
      // Convert wavetable to frequency domain using DFT
      // This is a simplified approach - we'll create harmonic content based on the curve
      for (let h = 1; h < harmonics && h < 64; h++) {
        let realSum = 0;
        let imagSum = 0;
        
        // Calculate Fourier coefficients for this harmonic
        for (let i = 0; i < samples; i++) {
          const angle = (2 * Math.PI * h * i) / samples;
          realSum += wavetable[i] * Math.cos(angle);
          imagSum -= wavetable[i] * Math.sin(angle);
        }
        
        // Normalize and apply
        real[h] = realSum / samples;
        imag[h] = imagSum / samples;
      }
      
      // Create and apply the custom periodic wave
      const customWave = audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
      oscillator.setPeriodicWave(customWave);
    } else {
      // Standard wave shapes
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
  
  // Composite wave functions
  const saveCurrentWave = () => {
    const id = generateUUID();
    // Use first 4 letters of UUID if no name is provided
    const name = waveName.trim() === '' ? id.substring(0, 4) : waveName.trim();
    
    const newCompositeWave: CompositeWave = {
      id,
      name,
      waves: [...waves],
      volume: 0.3,
      multiplicity: 1.0,
      isPlaying: false,
      createdAt: new Date()
    };
    
    setCompositeWaves(prev => [...prev, newCompositeWave]);
    setWaveName(''); // Clear the input
    Alert.alert('Saved!', `"${newCompositeWave.name}" has been saved!`);
  };
  
  const loadCompositeWave = (compositeWave: CompositeWave) => {
    setWaves([...compositeWave.waves]);
    setWaveName(compositeWave.name); // Load name for potential editing
  };
  
  const deleteCompositeWave = (id: string) => {
    setCompositeWaves(prev => prev.filter(wave => wave.id !== id));
  };

  const updateCompositeWave = (id: string, updates: Partial<CompositeWave>) => {
    setCompositeWaves(prev => prev.map(wave => 
      wave.id === id ? { ...wave, ...updates } : wave
    ));
  };

  const playCompositeWave = (id: string) => {
    updateCompositeWave(id, { isPlaying: true });
  };

  const stopCompositeWave = (id: string) => {
    updateCompositeWave(id, { isPlaying: false });
  };

  // Edit modal state
  const [editingCompositeWave, setEditingCompositeWave] = useState<CompositeWave | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const editCompositeWave = (compositeWave: CompositeWave) => {
    setEditingCompositeWave(compositeWave);
    setShowEditModal(true);
  };

  const saveEditedCompositeWave = (editedWaves: WaveDefinition[]) => {
    if (editingCompositeWave) {
      updateCompositeWave(editingCompositeWave.id, { waves: editedWaves });
      setShowEditModal(false);
      setEditingCompositeWave(null);
    }
  };

  const cancelEditCompositeWave = () => {
    setShowEditModal(false);
    setEditingCompositeWave(null);
  };
  
  // Custom curve functions
  const handleSaveCustomCurve = (name: string, points: {x: number, y: number}[]) => {
    const id = generateUUID();
    const newCurve = { id, name, points };
    setCustomCurves(prev => [...prev, newCurve]);
    Alert.alert('Success', `Custom curve "${name}" has been saved!`);
  };

// Composite Wave Edit Modal Component
const CompositeWaveEditModal = ({
  isVisible,
  compositeWave,
  onSave,
  onCancel,
  customCurves
}: {
  isVisible: boolean;
  compositeWave: CompositeWave | null;
  onSave: (waves: WaveDefinition[]) => void;
  onCancel: () => void;
  customCurves: Array<{id: string, name: string, points: {x: number, y: number}[]}>;
}) => {
  const [editWaves, setEditWaves] = useState<WaveDefinition[]>([]);
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);

  // Initialize edit waves when modal opens
  useEffect(() => {
    if (isVisible && compositeWave) {
      setEditWaves([...compositeWave.waves]);
    }
  }, [isVisible, compositeWave]);

  if (!isVisible || !compositeWave) return null;

  const updateWave = (index: number, updates: Partial<WaveDefinition>) => {
    const newWaves = [...editWaves];
    newWaves[index] = { ...newWaves[index], ...updates };
    setEditWaves(newWaves);
  };

  const addWave = () => {
    if (editWaves.length < 8) {
      const newId = (parseInt(editWaves[editWaves.length - 1].id) + 1).toString();
      const newWave: WaveDefinition = {
        id: newId,
        type: 'sine',
        shape: 'sine',
        frequency: editWaves[0].frequency * 2,
        startFreq: 100,
        endFreq: 1000,
        sweepK: 10
      };
      setEditWaves([...editWaves, newWave]);
    }
  };

  const removeWave = (index: number) => {
    if (editWaves.length > 1) {
      const newWaves = editWaves.filter((_, i) => i !== index);
      setEditWaves(newWaves);
    }
  };

  const generateShapeVisualization = (shape: string, points: number, width: number, amplitude: number): string => {
    try {
      let pathData = '';
      const cycles = 2;
      
      const customCurve = customCurves.find(curve => curve.id === shape);
      
      if (customCurve) {
        for (let i = 0; i <= points; i++) {
          const x = (i / points) * width;
          const t = (i / points) * cycles;
          
          const curveProgress = (t % 1);
          const curveIndex = Math.floor(curveProgress * (customCurve.points.length - 1));
          const nextIndex = Math.min(curveIndex + 1, customCurve.points.length - 1);
          const localT = (curveProgress * (customCurve.points.length - 1)) - curveIndex;
          
          const p1 = customCurve.points[curveIndex];
          const p2 = customCurve.points[nextIndex];
          const y = p1.y + (p2.y - p1.y) * localT;
          
          const normalizedY = (y - 0.5) * 2;
          const yPos = (normalizedY * amplitude) + (amplitude * 2);
          
          if (i === 0) {
            pathData = `M ${x} ${yPos}`;
          } else {
            pathData += ` L ${x} ${yPos}`;
          }
        }
      } else {
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
          
          const yPos = (y * amplitude) + (amplitude * 2);
          
          if (i === 0) {
            pathData = `M ${x} ${yPos}`;
          } else {
            pathData += ` L ${x} ${yPos}`;
          }
        }
      }
      
      return pathData;
    } catch (error) {
      console.warn('Error generating shape visualization:', error);
      return `M 0 ${amplitude} L ${width} ${amplitude}`;
    }
  };

  return (
    <View style={styles.editModalOverlay}>
      <TouchableOpacity 
        style={styles.editModalBackdrop} 
        onPress={onCancel}
        activeOpacity={1}
      />
      
      <View style={styles.editModalContainer}>
        <View style={styles.editModalHeader}>
          <Text style={styles.editModalTitle}>Edit "{compositeWave.name}"</Text>
          <TouchableOpacity onPress={onCancel} style={styles.editModalCloseButton}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
        
        <ScrollView style={styles.editModalContent} showsVerticalScrollIndicator={false}>
          <View style={styles.editModalWaveSection}>
            <View style={styles.editModalSectionHeader}>
              <Text style={styles.editModalSectionTitle}>Waves</Text>
              <TouchableOpacity 
                style={styles.editModalAddButton}
                onPress={addWave}
                disabled={editWaves.length >= 8}
              >
                <Ionicons name="add" size={20} color="#00ff00" />
              </TouchableOpacity>
            </View>
            
            {editWaves.map((wave, index) => (
              <View key={wave.id} style={styles.editModalWaveRow}>
                <View style={styles.editModalWaveContainer}>
                  <Text style={styles.editModalWaveLabel}>
                    Wave {index + 1}
                  </Text>
                  
                  {wave.type === 'sine' ? (
                    <Slider
                      style={styles.editModalSlider}
                      minimumValue={10}
                      maximumValue={2000}
                      value={wave.frequency}
                      onValueChange={(value) => updateWave(index, { frequency: value })}
                      minimumTrackTintColor="#00ff00"
                      maximumTrackTintColor="#333333"
                      thumbTintColor="#00ff00"
                    />
                  ) : (
                    <View style={styles.editModalSweepControls}>
                      <View style={styles.editModalSweepRow}>
                        <Text style={styles.editModalSweepLabel}>Start:</Text>
                        <Slider
                          style={styles.editModalSweepSlider}
                          minimumValue={10}
                          maximumValue={2000}
                          value={wave.startFreq}
                          onValueChange={(value) => updateWave(index, { startFreq: value })}
                          minimumTrackTintColor="#888888"
                          maximumTrackTintColor="#333333"
                          thumbTintColor="#888888"
                        />
                        <Text style={styles.editModalSweepValue}>{Math.round(wave.startFreq)}</Text>
                      </View>
                      <View style={styles.editModalSweepRow}>
                        <Text style={styles.editModalSweepLabel}>End:</Text>
                        <Slider
                          style={styles.editModalSweepSlider}
                          minimumValue={10}
                          maximumValue={2000}
                          value={wave.endFreq}
                          onValueChange={(value) => updateWave(index, { endFreq: value })}
                          minimumTrackTintColor="#888888"
                          maximumTrackTintColor="#333333"
                          thumbTintColor="#888888"
                        />
                        <Text style={styles.editModalSweepValue}>{Math.round(wave.endFreq)}</Text>
                      </View>
                      <View style={styles.editModalSweepRow}>
                        <Text style={styles.editModalSweepLabel}>Count:</Text>
                        <Slider
                          style={styles.editModalSweepSlider}
                          minimumValue={2}
                          maximumValue={50}
                          step={1}
                          value={wave.sweepK}
                          onValueChange={(value) => updateWave(index, { sweepK: value })}
                          minimumTrackTintColor="#888888"
                          maximumTrackTintColor="#333333"
                          thumbTintColor="#888888"
                        />
                        <Text style={styles.editModalSweepValue}>{wave.sweepK}</Text>
                      </View>
                    </View>
                  )}
                  
                  <Text style={styles.editModalWaveValue}>
                    {wave.type === 'sine' 
                      ? `${Math.round(wave.frequency)}Hz`
                      : `${Math.round(wave.startFreq)}-${Math.round(wave.endFreq)}Hz`
                    }
                  </Text>
                </View>
                
                {/* Wave Shape Dropdown - Simplified for modal */}
                <View style={styles.editModalShapeContainer}>
                  <TouchableOpacity
                    style={styles.editModalShapeButton}
                    onPress={() => {
                      if (openDropdownId === wave.id) {
                        setOpenDropdownId(null);
                      } else {
                        setOpenDropdownId(wave.id);
                      }
                    }}
                  >
                    <Text style={styles.editModalShapeText}>
                      {wave.shape.charAt(0).toUpperCase() + wave.shape.slice(1)}
                    </Text>
                    <Ionicons 
                      name={openDropdownId === wave.id ? "chevron-up" : "chevron-down"} 
                      size={16} 
                      color="#888888" 
                    />
                  </TouchableOpacity>
                  
                  {openDropdownId === wave.id && (
                    <View style={styles.editModalShapeDropdown}>
                      {['sine', 'square', 'triangle', 'sawtooth', 'noise'].map((shapeOption) => (
                        <TouchableOpacity
                          key={shapeOption}
                          style={[
                            styles.editModalShapeOption,
                            wave.shape === shapeOption && styles.editModalShapeOptionSelected
                          ]}
                          onPress={() => {
                            updateWave(index, { shape: shapeOption as any });
                            setOpenDropdownId(null);
                          }}
                        >
                          <Text style={[
                            styles.editModalShapeOptionText,
                            wave.shape === shapeOption && styles.editModalShapeOptionTextSelected
                          ]}>
                            {shapeOption.charAt(0).toUpperCase() + shapeOption.slice(1)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
                
                <TouchableOpacity
                  style={[styles.editModalTypeButton, wave.type === 'sweep' && styles.editModalTypeButtonActive]}
                  onPress={() => updateWave(index, { type: wave.type === 'sine' ? 'sweep' : 'sine' })}
                >
                  <Text style={[styles.editModalTypeButtonText, wave.type === 'sweep' && styles.editModalTypeButtonTextActive]}>
                    {wave.type === 'sine' ? 'S' : 'Sw'}
                  </Text>
                </TouchableOpacity>
                
                {editWaves.length > 1 && (
                  <TouchableOpacity
                    style={styles.editModalRemoveButton}
                    onPress={() => removeWave(index)}
                  >
                    <Ionicons name="remove" size={16} color="#ff0000" />
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
        
        <View style={styles.editModalFooter}>
          <TouchableOpacity style={styles.editModalCancelButton} onPress={onCancel}>
            <Text style={styles.editModalCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.editModalSaveButton} 
            onPress={() => onSave(editWaves)}
          >
            <Text style={styles.editModalSaveText}>Save Changes</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Composite Wave Control Component
const CompositeWaveControl = ({
  compositeWave,
  onPlay,
  onStop,
  onVolumeChange,
  onMultiplicityChange,
  onEdit,
  onDelete,
  onLoad,
  customCurves
}: {
  compositeWave: CompositeWave;
  onPlay: () => void;
  onStop: () => void;
  onVolumeChange: (volume: number) => void;
  onMultiplicityChange: (multiplicity: number) => void;
  onEdit: () => void;
  onDelete: () => void;
  onLoad: () => void;
  customCurves: Array<{id: string, name: string, points: {x: number, y: number}[]}>;
}) => {
  // Audio context refs for individual composite wave playback
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorsRef = useRef<OscillatorNode[]>([]);
  const gainNodesRef = useRef<GainNode[]>([]);

  // Generate waveform shape functions - copied from main component
  const generateWaveShape = (shape: string, freq: number, audioContext: AudioContext): OscillatorNode => {
    const oscillator = audioContext.createOscillator();
    
    const customCurve = customCurves.find(curve => curve.id === shape);
    
    if (customCurve && customCurve.points && customCurve.points.length > 1) {
      const harmonics = 128;
      const real = new Float32Array(harmonics);
      const imag = new Float32Array(harmonics);
      
      const samples = 512;
      const wavetable: number[] = [];
      
      for (let i = 0; i < samples; i++) {
        const t = i / samples;
        const curveIndex = Math.floor(t * (customCurve.points.length - 1));
        const nextIndex = Math.min(curveIndex + 1, customCurve.points.length - 1);
        const localT = (t * (customCurve.points.length - 1)) - curveIndex;
        
        const p1 = customCurve.points[curveIndex];
        const p2 = customCurve.points[nextIndex];
        const y = p1.y + (p2.y - p1.y) * localT;
        wavetable[i] = (y - 0.5) * 2;
      }
      
      for (let h = 1; h < harmonics && h < 64; h++) {
        let realSum = 0;
        let imagSum = 0;
        
        for (let i = 0; i < samples; i++) {
          const angle = (2 * Math.PI * h * i) / samples;
          realSum += wavetable[i] * Math.cos(angle);
          imagSum -= wavetable[i] * Math.sin(angle);
        }
        
        real[h] = realSum / samples;
        imag[h] = imagSum / samples;
      }
      
      const customWave = audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
      oscillator.setPeriodicWave(customWave);
    } else {
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
    }
    
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    return oscillator;
  };

  const generateWaveFrequencies = (wave: WaveDefinition): number[] => {
    if (wave.type === 'sine') {
      return [wave.frequency];
    } else {
      if (wave.sweepK < 2) return [wave.startFreq];
      
      const freqs: number[] = [];
      const step = (wave.endFreq - wave.startFreq) / (wave.sweepK - 1);
      
      for (let i = 0; i < wave.sweepK; i++) {
        freqs.push(wave.startFreq + (step * i));
      }
      
      return freqs;
    }
  };

  const startCompositeWave = async () => {
    try {
      if (!Platform.OS || Platform.OS === 'web') {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        
        oscillatorsRef.current = [];
        gainNodesRef.current = [];
        
        const currentWaves = compositeWave.waves.flatMap(wave => {
          const frequencies = generateWaveFrequencies(wave);
          return frequencies.map(freq => ({ frequency: freq, shape: wave.shape }));
        });
        
        currentWaves.forEach((waveData) => {
          const oscillator = generateWaveShape(waveData.shape, waveData.frequency, audioContext);
          const multipliedFreq = waveData.frequency * compositeWave.multiplicity;
          oscillator.frequency.setValueAtTime(multipliedFreq, audioContext.currentTime);
          
          const gainNode = audioContext.createGain();
          const volumePerOscillator = compositeWave.volume / currentWaves.length;
          gainNode.gain.setValueAtTime(volumePerOscillator, audioContext.currentTime);
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillatorsRef.current.push(oscillator);
          gainNodesRef.current.push(gainNode);
          
          oscillator.start();
        });
        
        onPlay();
      }
    } catch (error) {
      console.error('Error starting composite wave:', error);
    }
  };

  const stopCompositeWave = () => {
    try {
      if (audioContextRef.current) {
        oscillatorsRef.current.forEach(oscillator => {
          if (oscillator) {
            oscillator.stop();
          }
        });
        
        audioContextRef.current.close();
        audioContextRef.current = null;
        
        oscillatorsRef.current = [];
        gainNodesRef.current = [];
      }
      
      onStop();
    } catch (error) {
      console.warn('Error stopping composite wave:', error);
    }
  };

  const togglePlayback = () => {
    if (compositeWave.isPlaying) {
      stopCompositeWave();
    } else {
      startCompositeWave();
    }
  };

  // Update volume during playback
  useEffect(() => {
    if (gainNodesRef.current.length > 0 && audioContextRef.current) {
      const volumePerOscillator = compositeWave.volume / gainNodesRef.current.length;
      gainNodesRef.current.forEach((gainNode) => {
        if (gainNode && audioContextRef.current) {
          gainNode.gain.setValueAtTime(volumePerOscillator, audioContextRef.current.currentTime);
        }
      });
    }
  }, [compositeWave.volume]);

  // Update frequencies during playback
  useEffect(() => {
    if (oscillatorsRef.current.length > 0 && audioContextRef.current) {
      const currentFrequencies = compositeWave.waves.flatMap(wave => generateWaveFrequencies(wave));
      
      oscillatorsRef.current.forEach((oscillator, index) => {
        if (oscillator && audioContextRef.current && currentFrequencies[index]) {
          const multipliedFreq = currentFrequencies[index] * compositeWave.multiplicity;
          oscillator.frequency.setValueAtTime(
            multipliedFreq, 
            audioContextRef.current.currentTime
          );
        }
      });
    }
  }, [compositeWave.multiplicity]);

  const handleDelete = () => {
    Alert.alert(
      'Delete Composite Wave',
      `Delete "${compositeWave.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: onDelete }
      ]
    );
  };

  return (
    <View style={styles.compositeWaveItem}>
      <View style={styles.compositeWaveHeader}>
        <View style={styles.compositeWaveInfo}>
          <Text style={styles.compositeWaveName}>{compositeWave.name}</Text>
          <Text style={styles.compositeWaveDetails}>
            {compositeWave.waves.length} wave{compositeWave.waves.length !== 1 ? 's' : ''}
          </Text>
        </View>
        
        <View style={styles.compositeWaveActions}>
          <TouchableOpacity
            style={styles.compositeWaveLoadButton}
            onPress={onLoad}
          >
            <Ionicons name="download" size={16} color="#00ff00" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.compositeWaveEditButton}
            onPress={onEdit}
          >
            <Ionicons name="create" size={16} color="#00ff00" />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.compositeWaveDeleteButton}
            onPress={handleDelete}
          >
            <Ionicons name="trash" size={16} color="#ff4444" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.compositeWaveControls}>
        {/* Play/Stop Button */}
        <TouchableOpacity
          style={[
            styles.compositeWavePlayButton,
            compositeWave.isPlaying && styles.compositeWavePlayButtonActive
          ]}
          onPress={togglePlayback}
        >
          <Ionicons 
            name={compositeWave.isPlaying ? "stop" : "play"} 
            size={20} 
            color={compositeWave.isPlaying ? "#ff0000" : "#00ff00"} 
          />
        </TouchableOpacity>

        {/* Volume Control */}
        <View style={styles.compositeWaveSliderContainer}>
          <View style={styles.compositeWaveSliderHeader}>
            <Ionicons name="volume-medium" size={16} color="#00ff00" />
            <Text style={styles.compositeWaveSliderLabel}>Volume</Text>
            <Text style={styles.compositeWaveSliderValue}>
              {Math.round(compositeWave.volume * 100)}%
            </Text>
          </View>
          <Slider
            style={styles.compositeWaveSlider}
            minimumValue={0}
            maximumValue={1}
            value={compositeWave.volume}
            onValueChange={onVolumeChange}
            minimumTrackTintColor="#00ff00"
            maximumTrackTintColor="#333333"
            thumbTintColor="#00ff00"
          />
        </View>

        {/* Multiplicity Control */}
        <View style={styles.compositeWaveSliderContainer}>
          <View style={styles.compositeWaveSliderHeader}>
            <Ionicons name="contract" size={16} color="#00ff00" />
            <Text style={styles.compositeWaveSliderLabel}>Multiplicity</Text>
            <Text style={styles.compositeWaveSliderValue}>
              {Math.round(compositeWave.multiplicity * 100)}%
            </Text>
          </View>
          <Slider
            style={styles.compositeWaveSlider}
            minimumValue={0}
            maximumValue={1}
            value={compositeWave.multiplicity}
            onValueChange={onMultiplicityChange}
            minimumTrackTintColor="#00ff00"
            maximumTrackTintColor="#333333"
            thumbTintColor="#00ff00"
          />
        </View>
      </View>
    </View>
  );
};

// Bezier Curve Editor Component
const BezierCurveEditor = ({ 
  isVisible, 
  onClose, 
  onSave 
}: {
  isVisible: boolean;
  onClose: () => void;
  onSave: (name: string, points: {x: number, y: number}[]) => void;
}) => {
  const [curveName, setCurveName] = useState('');
  const [controlPoints, setControlPoints] = useState([
    { x: 0, y: 0.5 },    // Start point
    { x: 0.33, y: 0.8 }, // Control point 1
    { x: 0.67, y: 0.2 }, // Control point 2
    { x: 1, y: 0.5 }     // End point
  ]);
  
  // Store starting positions for gestures
  const startPositions = useRef<{x: number, y: number}[]>([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const editorSize = 280;
  const pointRadius = 8;

  // Generate curve points from Bezier control points
  const generateCurvePoints = () => {
    const points: {x: number, y: number}[] = [];
    const steps = 100;
    
    for (let t = 0; t <= steps; t++) {
      const u = t / steps;
      const x = Math.pow(1-u, 3) * controlPoints[0].x + 
                3 * Math.pow(1-u, 2) * u * controlPoints[1].x + 
                3 * (1-u) * Math.pow(u, 2) * controlPoints[2].x + 
                Math.pow(u, 3) * controlPoints[3].x;
      const y = Math.pow(1-u, 3) * controlPoints[0].y + 
                3 * Math.pow(1-u, 2) * u * controlPoints[1].y + 
                3 * (1-u) * Math.pow(u, 2) * controlPoints[2].y + 
                Math.pow(u, 3) * controlPoints[3].y;
      points.push({ x, y });
    }
    return points;
  };

  // Create SVG path for the Bezier curve
  const createBezierPath = () => {
    const p0 = controlPoints[0];
    const p1 = controlPoints[1];
    const p2 = controlPoints[2];
    const p3 = controlPoints[3];
    
    const x0 = p0.x * editorSize;
    const y0 = (1 - p0.y) * editorSize;
    const x1 = p1.x * editorSize;
    const y1 = (1 - p1.y) * editorSize;
    const x2 = p2.x * editorSize;
    const y2 = (1 - p2.y) * editorSize;
    const x3 = p3.x * editorSize;
    const y3 = (1 - p3.y) * editorSize;
    
    return `M ${x0} ${y0} C ${x1} ${y1}, ${x2} ${y2}, ${x3} ${y3}`;
  };

  // Handle point movement with gesture
  const updateControlPoint = (index: number, x: number, y: number) => {
    // Constrain values to 0-1 range
    const constrainedX = Math.max(0, Math.min(1, x));
    const constrainedY = Math.max(0, Math.min(1, y));
    
    // Constrain start and end points to their x positions
    if (index === 0) {
      setControlPoints(prev => prev.map((p, i) => i === index ? { x: 0, y: constrainedY } : p));
    } else if (index === 3) {
      setControlPoints(prev => prev.map((p, i) => i === index ? { x: 1, y: constrainedY } : p));
    } else {
      setControlPoints(prev => prev.map((p, i) => i === index ? { x: constrainedX, y: constrainedY } : p));
    }
  };

  // Create pan gestures for each control point
  const createPanGesture = (index: number) => {
    return Gesture.Pan()
      .onBegin(() => {
        setDragIndex(index);
        // Store the current position as starting point
        startPositions.current[index] = { 
          x: controlPoints[index].x, 
          y: controlPoints[index].y 
        };
      })
      .onUpdate((event) => {
        const startPoint = startPositions.current[index];
        if (!startPoint) return;
        
        // Use translation from the starting point
        const deltaX = event.translationX / editorSize;
        const deltaY = -event.translationY / editorSize; // Negative because Y is flipped in SVG
        
        const newX = startPoint.x + deltaX;
        const newY = startPoint.y + deltaY;
        
        updateControlPoint(index, newX, newY);
      })
      .onEnd(() => {
        setDragIndex(null);
      });
  };

  const handleSave = () => {
    if (curveName.trim() === '') {
      Alert.alert('Error', 'Please enter a name for your custom curve.');
      return;
    }
    
    const curvePoints = generateCurvePoints();
    onSave(curveName.trim(), curvePoints);
    setCurveName('');
    setControlPoints([
      { x: 0, y: 0.5 },
      { x: 0.33, y: 0.8 },
      { x: 0.67, y: 0.2 },
      { x: 1, y: 0.5 }
    ]);
    onClose();
  };

  if (!isVisible) return null;

  return (
    <View style={styles.curveEditorOverlay}>
      <TouchableOpacity 
        style={styles.curveEditorBackdrop} 
        onPress={onClose}
        activeOpacity={1}
      />
      
      <View style={styles.curveEditorContainer}>
        <View style={styles.curveEditorHeader}>
          <Text style={styles.curveEditorTitle}>Custom Curve Editor</Text>
          <TouchableOpacity onPress={onClose} style={styles.curveEditorCloseButton}>
            <Ionicons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
        
        <TextInput
          style={styles.curveNameInput}
          placeholder="Curve name..."
          placeholderTextColor="#666666"
          value={curveName}
          onChangeText={setCurveName}
        />
        
        <View 
          style={styles.curveEditorCanvas}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => dragIndex !== null}
          onResponderMove={(event) => {
            if (dragIndex !== null) {
              const touch = event.nativeEvent.touches[0];
              const x = touch.locationX / editorSize;
              const y = 1 - (touch.locationY / editorSize);
              updateControlPoint(dragIndex, x, y);
            }
          }}
          onResponderRelease={() => setDragIndex(null)}
        >
          <Svg width={editorSize} height={editorSize} style={styles.curveEditorSvg}>
            {/* Grid lines */}
            <Path
              d={`M 0 ${editorSize/4} L ${editorSize} ${editorSize/4} M 0 ${editorSize/2} L ${editorSize} ${editorSize/2} M 0 ${3*editorSize/4} L ${editorSize} ${3*editorSize/4}`}
              stroke="rgba(136, 136, 136, 0.3)"
              strokeWidth={1}
            />
            <Path
              d={`M ${editorSize/4} 0 L ${editorSize/4} ${editorSize} M ${editorSize/2} 0 L ${editorSize/2} ${editorSize} M ${3*editorSize/4} 0 L ${3*editorSize/4} ${editorSize}`}
              stroke="rgba(136, 136, 136, 0.3)"
              strokeWidth={1}
            />
            
            {/* Control lines */}
            <Path
              d={`M ${controlPoints[0].x * editorSize} ${(1-controlPoints[0].y) * editorSize} L ${controlPoints[1].x * editorSize} ${(1-controlPoints[1].y) * editorSize}`}
              stroke="rgba(255, 136, 0, 0.5)"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
            <Path
              d={`M ${controlPoints[2].x * editorSize} ${(1-controlPoints[2].y) * editorSize} L ${controlPoints[3].x * editorSize} ${(1-controlPoints[3].y) * editorSize}`}
              stroke="rgba(255, 136, 0, 0.5)"
              strokeWidth={2}
              strokeDasharray="5,5"
            />
            
            {/* Bezier curve */}
            <Path
              d={createBezierPath()}
              stroke="#00ff00"
              strokeWidth={3}
              fill="none"
            />
            
          </Svg>
          
          {/* Control points */}
          {controlPoints.map((point, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.controlPoint,
                {
                  left: point.x * editorSize - pointRadius,
                  top: (1 - point.y) * editorSize - pointRadius,
                  backgroundColor: index === 0 || index === 3 ? '#00ff00' : '#ff8800',
                  borderColor: dragIndex === index ? '#ffffff' : 'transparent',
                  borderWidth: 2,
                }
              ]}
              onPressIn={() => setDragIndex(index)}
              activeOpacity={0.8}
            />
          ))}
        </View>
        
        <View style={styles.curveEditorFooter}>
          <TouchableOpacity style={styles.curveEditorCancelButton} onPress={onClose}>
            <Text style={styles.curveEditorCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.curveEditorSaveButton} onPress={handleSave}>
            <Text style={styles.curveEditorSaveText}>Save Curve</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
  
// Wave Shape Dropdown Component
const WaveShapeDropdown = ({ selectedShape, onShapeChange, waveId, isOpen, onToggle, customCurves, onOpenCurveEditor }: {
  selectedShape: string;
  onShapeChange: (shape: string) => void;
  waveId: string;
  isOpen: boolean;
  onToggle: () => void;
  customCurves: Array<{id: string, name: string, points: {x: number, y: number}[]}>;
  onOpenCurveEditor: () => void;
}) => {
  const shapeOptions = [
    { id: 'sine', name: 'Sine', icon: '∿' },
    { id: 'square', name: 'Square', icon: '⌐' },
    { id: 'triangle', name: 'Triangle', icon: '△' },
    { id: 'sawtooth', name: 'Sawtooth', icon: '⟋' },
    { id: 'noise', name: 'Noise', icon: '≈' },
  ];

  // Check if selected shape is a custom curve
  const customCurve = customCurves.find(curve => curve.id === selectedShape);
  const selectedOption = customCurve 
    ? { id: customCurve.id, name: customCurve.name, icon: '◦' }
    : shapeOptions.find(opt => opt.id === selectedShape) || shapeOptions[0];

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
          
          {/* Custom Curves */}
          {customCurves.map((curve) => (
            <TouchableOpacity
              key={curve.id}
              style={[
                styles.dropdownOption,
                selectedShape === curve.id && styles.dropdownOptionSelected
              ]}
              onPress={() => {
                onShapeChange(curve.id);
                onToggle();
              }}
            >
              <View style={styles.dropdownOptionContent}>
                <View style={styles.shapePreview}>
                  <Svg width={60} height={30}>
                    <Path
                      d={`M 0 15 ${curve.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * 60} ${(1-p.y) * 30}`).join(' ')}`}
                      stroke={selectedShape === curve.id ? "#00ff00" : "#888888"}
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
                    selectedShape === curve.id && styles.shapeOptionIconSelected
                  ]}>
                    ◦
                  </Text>
                  <Text style={[
                    styles.shapeOptionName,
                    selectedShape === curve.id && styles.shapeOptionNameSelected
                  ]}>
                    {curve.name}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          
          {/* Custom Shape Option (Plus button) */}
          <TouchableOpacity
            style={styles.dropdownOptionCustom}
            onPress={() => {
              onOpenCurveEditor();
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

const IndividualWave = ({ freq, shape, index, width, height, animationProgress, wavePhase, multiplicity, isNegated, customCurves }: {
  freq: number;
  shape: string;
  index: number;
  width: number;
  height: number;
  animationProgress: any;
  wavePhase: any;
  multiplicity: number;
  isNegated: boolean;
  customCurves: Array<{id: string, name: string, points: {x: number, y: number}[]}>;
}) => {
  const animatedProps = useAnimatedProps(() => {
    // Prevent potential iOS crashes with complex math operations
    try {
    const points = 200;
    const amplitude = 40 + (animationProgress.value * 20);
    const phaseOffset = wavePhase.value;
    const centerY = height / 2;
    
    // Check if it's a custom curve
    const customCurve = customCurves.find(curve => curve.id === shape);
    
    let pathData = '';
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const multipliedFreq = freq * multiplicity;
      const normalizedFreq = multipliedFreq / 1000;
      const t = (i / points) * Math.PI * 8 * normalizedFreq + phaseOffset;
      
      let waveValue = 0;
      
      if (customCurve && customCurve.points && customCurve.points.length > 1) {
        // Generate waveform from custom curve points
        const cycles = t / (Math.PI * 2);
        const curveProgress = (cycles % 1 + 1) % 1; // Ensure positive and between 0-1
        const curveIndex = Math.floor(curveProgress * (customCurve.points.length - 1));
        const nextIndex = Math.min(curveIndex + 1, customCurve.points.length - 1);
        const localT = (curveProgress * (customCurve.points.length - 1)) - curveIndex;
        
        // Linear interpolation between curve points
        const p1 = customCurve.points[curveIndex] || { x: 0, y: 0.5 };
        const p2 = customCurve.points[nextIndex] || { x: 1, y: 0.5 };
        const y = p1.y + (p2.y - p1.y) * localT;
        
        // Convert from 0-1 range to -1 to 1 range
        waveValue = (y - 0.5) * 2;
      } else {
        // Generate standard wave shapes
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
          
          // Check if it's a custom curve
          const customCurve = customCurves.find(curve => curve.id === wave.shape);
          
          if (customCurve && customCurve.points && customCurve.points.length > 1) {
            // Generate waveform from custom curve points
            const cycles = t / (Math.PI * 2);
            const curveProgress = (cycles % 1 + 1) % 1; // Ensure positive and between 0-1
            const curveIndex = Math.floor(curveProgress * (customCurve.points.length - 1));
            const nextIndex = Math.min(curveIndex + 1, customCurve.points.length - 1);
            const localT = (curveProgress * (customCurve.points.length - 1)) - curveIndex;
            
            // Linear interpolation between curve points
            const p1 = customCurve.points[curveIndex] || { x: 0, y: 0.5 };
            const p2 = customCurve.points[nextIndex] || { x: 1, y: 0.5 };
            const y = p1.y + (p2.y - p1.y) * localT;
            
            // Convert from 0-1 range to -1 to 1 range
            waveValue = (y - 0.5) * 2;
          } else {
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
          }
          
          // Apply negation if enabled
          if (isNegated) {
            waveValue = -waveValue;
          }
          
          combinedValue += waveValue;
          waveCount++;
        });
      });      // Normalize but ensure visibility - don't over-reduce the amplitude
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
                  customCurves={customCurves}
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
                  customCurves={customCurves}
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
                customCurves={customCurves}
                onOpenCurveEditor={() => setShowCurveEditor(true)}
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
      
      {/* Composite Waves */}
      {compositeWaves.length > 0 && (
        <View style={styles.compositeWavesContainer}>
          <Text style={styles.compositeWavesTitle}>Composite Waves</Text>
          <ScrollView showsVerticalScrollIndicator={false} style={styles.compositeWavesScroll}>
            {compositeWaves.map((compositeWave) => (
              <CompositeWaveControl
                key={compositeWave.id}
                compositeWave={compositeWave}
                onPlay={() => playCompositeWave(compositeWave.id)}
                onStop={() => stopCompositeWave(compositeWave.id)}
                onVolumeChange={(volume) => updateCompositeWave(compositeWave.id, { volume })}
                onMultiplicityChange={(multiplicity) => updateCompositeWave(compositeWave.id, { multiplicity })}
                onEdit={() => editCompositeWave(compositeWave)}
                onDelete={() => deleteCompositeWave(compositeWave.id)}
                onLoad={() => loadCompositeWave(compositeWave)}
                customCurves={customCurves}
              />
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
          customCurves={customCurves}
          onAudioReady={() => {
            setIsWebAudioReady(true);
            setWebAudioError(null);
          }}
          onError={(error) => {
            setWebAudioError(error);
          }}
        />
      )}
      
      {/* Bezier Curve Editor */}
      <BezierCurveEditor
        isVisible={showCurveEditor}
        onClose={() => setShowCurveEditor(false)}
        onSave={handleSaveCustomCurve}
      />
      
      {/* Composite Wave Edit Modal */}
      <CompositeWaveEditModal
        isVisible={showEditModal}
        compositeWave={editingCompositeWave}
        onSave={saveEditedCompositeWave}
        onCancel={cancelEditCompositeWave}
        customCurves={customCurves}
      />
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
  // Composite Waves Styles
  compositeWavesContainer: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
  },
  compositeWavesTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  compositeWavesScroll: {
    maxHeight: 400,
  },
  compositeWaveItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  compositeWaveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  compositeWaveInfo: {
    flex: 1,
  },
  compositeWaveName: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  compositeWaveDetails: {
    color: '#888888',
    fontSize: 12,
  },
  compositeWaveActions: {
    flexDirection: 'row',
    gap: 8,
  },
  compositeWaveLoadButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  compositeWaveEditButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  compositeWaveDeleteButton: {
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  compositeWaveControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compositeWavePlayButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 25,
    padding: 12,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  compositeWavePlayButtonActive: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderColor: 'rgba(255, 0, 0, 0.3)',
  },
  compositeWaveSliderContainer: {
    flex: 1,
  },
  compositeWaveSliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  compositeWaveSliderLabel: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  compositeWaveSliderValue: {
    color: '#00ff00',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    minWidth: 35,
    textAlign: 'right',
  },
  compositeWaveSlider: {
    width: '100%',
    height: 20,
  },
  
  // Edit Modal Styles
  editModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editModalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  editModalContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    width: '90%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  editModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(136, 136, 136, 0.3)',
  },
  editModalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  editModalCloseButton: {
    padding: 4,
  },
  editModalContent: {
    maxHeight: 400,
  },
  editModalWaveSection: {
    padding: 16,
  },
  editModalSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  editModalSectionTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  editModalAddButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 20,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  editModalWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    padding: 12,
  },
  editModalWaveContainer: {
    flex: 1,
    marginRight: 8,
  },
  editModalWaveLabel: {
    color: '#ffffff',
    fontSize: 14,
    marginBottom: 4,
    fontWeight: '500',
  },
  editModalSlider: {
    width: '100%',
    height: 20,
  },
  editModalSweepControls: {
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    padding: 8,
    marginVertical: 4,
  },
  editModalSweepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  editModalSweepLabel: {
    color: '#888888',
    fontSize: 10,
    width: 40,
    fontWeight: '500',
  },
  editModalSweepSlider: {
    flex: 1,
    height: 20,
    marginHorizontal: 8,
  },
  editModalSweepValue: {
    color: '#888888',
    fontSize: 10,
    fontFamily: 'monospace',
    width: 40,
    textAlign: 'right',
  },
  editModalWaveValue: {
    color: '#888888',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  editModalShapeContainer: {
    position: 'relative',
    marginRight: 8,
  },
  editModalShapeButton: {
    backgroundColor: 'rgba(136, 136, 136, 0.1)',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    minWidth: 90,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editModalShapeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  editModalShapeDropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    marginBottom: 4,
    zIndex: 1000,
  },
  editModalShapeOption: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(136, 136, 136, 0.2)',
  },
  editModalShapeOptionSelected: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
  },
  editModalShapeOptionText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '500',
  },
  editModalShapeOptionTextSelected: {
    color: '#00ff00',
  },
  editModalTypeButton: {
    backgroundColor: 'rgba(136, 136, 136, 0.1)',
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    minWidth: 32,
  },
  editModalTypeButtonActive: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  editModalTypeButtonText: {
    color: '#888888',
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  editModalTypeButtonTextActive: {
    color: '#00ff00',
  },
  editModalRemoveButton: {
    backgroundColor: 'rgba(255, 0, 0, 0.1)',
    borderRadius: 16,
    padding: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 0, 0, 0.3)',
  },
  editModalFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(136, 136, 136, 0.3)',
  },
  editModalCancelButton: {
    backgroundColor: 'rgba(136, 136, 136, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
  },
  editModalCancelText: {
    color: '#888888',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  editModalSaveButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  editModalSaveText: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: '500',
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
  
  // Bezier Curve Editor Styles
  curveEditorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  curveEditorBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  curveEditorContainer: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
    width: 320,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  curveEditorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(136, 136, 136, 0.3)',
  },
  curveEditorTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  curveEditorCloseButton: {
    padding: 4,
  },
  curveNameInput: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    margin: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
    fontSize: 16,
  },
  curveEditorCanvas: {
    position: 'relative',
    margin: 16,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
  },
  curveEditorSvg: {
    backgroundColor: 'transparent',
  },
  controlPoint: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    zIndex: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },

  curveEditorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(136, 136, 136, 0.3)',
  },
  curveEditorCancelButton: {
    backgroundColor: 'rgba(136, 136, 136, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(136, 136, 136, 0.3)',
  },
  curveEditorCancelText: {
    color: '#888888',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  curveEditorSaveButton: {
    backgroundColor: 'rgba(0, 255, 0, 0.1)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(0, 255, 0, 0.3)',
  },
  curveEditorSaveText: {
    color: '#00ff00',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
});