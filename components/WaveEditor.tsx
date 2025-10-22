import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
    useAnimatedProps,
    useSharedValue,
    withTiming
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const { height: screenHeight, width: screenWidth } = Dimensions.get('window');

interface WaveEditorProps {
  width?: number;
  height?: number;
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function WaveEditor({ 
  width = screenWidth,
  height = screenHeight * 0.25,
}: WaveEditorProps) {
  
  // Wave parameters
  const [frequency, setFrequency] = useState(440); // A4 note
  const [noiseLevel, setNoiseLevel] = useState(0); // 0-1
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  
  // Audio context and oscillator refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const noiseNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const noiseGainRef = useRef<GainNode | null>(null);
  
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
  
  // Generate noise buffer
  const generateNoiseBuffer = (audioContext: AudioContext) => {
    const bufferSize = audioContext.sampleRate * 2; // 2 seconds of noise
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const output = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    
    return buffer;
  };
  
  const startWave = async () => {
    try {
      // Create audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Create oscillator for sine wave
      const oscillator = audioContext.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
      
      // Create gain node for volume control
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      
      // Create noise source if noise level > 0
      let noiseSource: AudioBufferSourceNode | null = null;
      let noiseGain: GainNode | null = null;
      
      if (noiseLevel > 0) {
        noiseSource = audioContext.createBufferSource();
        noiseSource.buffer = generateNoiseBuffer(audioContext);
        noiseSource.loop = true;
        
        noiseGain = audioContext.createGain();
        noiseGain.gain.setValueAtTime(noiseLevel * 0.1, audioContext.currentTime);
        
        noiseSource.connect(noiseGain);
        noiseGain.connect(audioContext.destination);
      }
      
      // Connect oscillator
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Store references
      oscillatorRef.current = oscillator;
      gainNodeRef.current = gainNode;
      noiseNodeRef.current = noiseSource;
      noiseGainRef.current = noiseGain;
      
      // Start playing
      oscillator.start();
      if (noiseSource) {
        noiseSource.start();
      }
      
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
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current = null;
      }
      
      if (noiseNodeRef.current) {
        noiseNodeRef.current.stop();
        noiseNodeRef.current = null;
      }
      
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      
      gainNodeRef.current = null;
      noiseGainRef.current = null;
      
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
  
  // Update frequency during playback
  useEffect(() => {
    if (oscillatorRef.current && audioContextRef.current) {
      oscillatorRef.current.frequency.setValueAtTime(
        frequency, 
        audioContextRef.current.currentTime
      );
    }
  }, [frequency]);
  
  // Update noise level during playback
  useEffect(() => {
    if (noiseGainRef.current && audioContextRef.current) {
      noiseGainRef.current.gain.setValueAtTime(
        noiseLevel * 0.1, 
        audioContextRef.current.currentTime
      );
    }
  }, [noiseLevel]);
  
  // Generate sine wave visualization
  const animatedProps = useAnimatedProps(() => {
    const points = 200;
    const amplitude = 40 + (animationProgress.value * 20);
    const phaseOffset = wavePhase.value; // Use continuous phase animation
    
    let pathData = '';
    const centerY = height / 2;
    
    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const normalizedFreq = frequency / 1000; // Normalize frequency for visual
      const sineValue = Math.sin((i / points) * Math.PI * 8 * normalizedFreq + phaseOffset);
      
      // Add noise visualization (only when playing)
      const noise = (noiseLevel > 0 && animationProgress.value > 0) ? 
        (Math.random() - 0.5) * noiseLevel * 20 * animationProgress.value : 0;
      const y = centerY + (sineValue * amplitude) + noise;
      
      if (i === 0) {
        pathData = `M ${x} ${y}`;
      } else {
        pathData += ` L ${x} ${y}`;
      }
    }
    
    return { d: pathData };
  });

  return (
    <View style={[styles.container, { width, height: height + 120 }]}>
      {/* Waveform Display */}
      <View style={[styles.waveformContainer, { width, height }]}>
        <Svg width={width} height={height}>
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
            {frequency}Hz Sine Wave
          </Text>
          {noiseLevel > 0 && (
            <Text style={styles.noiseText}>
              +{Math.round(noiseLevel * 100)}% Noise
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
        
        {/* Frequency Slider */}
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderLabel}>Frequency</Text>
          <Slider
            style={styles.slider}
            minimumValue={100}
            maximumValue={2000}
            value={frequency}
            onValueChange={setFrequency}
            minimumTrackTintColor="#00ff00"
            maximumTrackTintColor="#333333"
            thumbTintColor="#00ff00"
          />
          <Text style={styles.sliderValue}>{Math.round(frequency)}Hz</Text>
        </View>
        
        {/* Noise Slider */}
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderLabel}>Noise</Text>
          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={1}
            value={noiseLevel}
            onValueChange={setNoiseLevel}
            minimumTrackTintColor="#ff8800"
            maximumTrackTintColor="#333333"
            thumbTintColor="#ff8800"
          />
          <Text style={styles.sliderValue}>{Math.round(noiseLevel * 100)}%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
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
  noiseText: {
    color: '#ff8800',
    fontSize: 10,
    fontFamily: 'monospace',
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
  sliderContainer: {
    marginBottom: 16,
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
});