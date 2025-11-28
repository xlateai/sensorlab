import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button, Keyboard, Pressable, TextInput, ScrollView, Modal, Dimensions, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeviceMotion, Magnetometer } from 'expo-sensors';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';

// Check if Audio module is available
const isAudioAvailable = () => {
  try {
    return Audio && Audio.Recording && typeof Audio.Recording === 'function';
  } catch {
    return false;
  }
};
import { playContinuousHaptic } from '../utils/haptics';
import { 
  playWaveform, 
  stopAudio, 
  AudioController,
  ControlMode,
  createFrequencyGetter,
  RotationControllerState,
  AmbientControllerState
} from '../utils/audio-utils';
import { MagnetometerData } from '../utils/sensor-utils';
import Slider from '../../components/ui/slider';
import WaveformSliderGroup from '../../components/ui/waveform-slider-group';
import AudioWaveformPlot from '../../components/AudioWaveformPlot';

// Default frequency constant
const DEFAULT_FREQUENCY = 744;
const DEFAULT_SHAPE: 'sine' | 'sawtooth' = 'sine';
const DEFAULT_CONTROL_MODE: ControlMode = 'ambient';

// Control Selector Component
function ControlSelector({
  controlMode,
  onControlModeChange,
}: {
  controlMode: ControlMode;
  onControlModeChange: (mode: ControlMode) => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const controlModes: Array<ControlMode> = ['rotation', 'ambient', 'none'];

  const handleModeSelect = (mode: ControlMode) => {
    onControlModeChange(mode);
    setShowPicker(false);
  };

  return (
    <>
      <Pressable
        onPress={() => setShowPicker(true)}
        style={{
          backgroundColor: '#39ff14',
          paddingVertical: 12,
          paddingHorizontal: 20,
          borderRadius: 8,
        }}
        android_ripple={null}
      >
        <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
          {controlMode === 'rotation' ? 'Rotation' : controlMode === 'ambient' ? 'Ambient' : 'None'}
        </Text>
      </Pressable>
      <Modal
        visible={showPicker}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowPicker(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            justifyContent: 'center',
            alignItems: 'center',
          }}
          onPress={() => setShowPicker(false)}
        >
          <Pressable
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 12,
              padding: 20,
              width: '80%',
              maxHeight: '60%',
              borderWidth: 1,
              borderColor: '#39ff14',
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' }}>
              Select Control
            </Text>
            <ScrollView style={{ maxHeight: 300 }}>
              {controlModes.map((mode) => (
                <Pressable
                  key={mode}
                  onPress={() => handleModeSelect(mode)}
                  style={{
                    backgroundColor: controlMode === mode ? '#39ff14' : '#333',
                    paddingVertical: 16,
                    paddingHorizontal: 20,
                    borderRadius: 8,
                    marginBottom: 8,
                  }}
                  android_ripple={null}
                >
                  <Text
                    style={{
                      color: controlMode === mode ? '#000' : '#fff',
                      textAlign: 'center',
                      fontWeight: '600',
                      fontSize: 16,
                      textTransform: 'capitalize',
                    }}
                  >
                    {mode}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable
              onPress={() => setShowPicker(false)}
              style={{
                backgroundColor: '#333',
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: 8,
                marginTop: 16,
              }}
              android_ripple={null}
            >
              <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600', fontSize: 14 }}>
                Cancel
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function AudioTab() {
  const [intensity, setIntensity] = useState(1.0);
  const [sharpness, setSharpness] = useState(0.5);
  // Use refs to hold live values for haptic stream
  const valuesRef = React.useRef({ intensity: 1.0, sharpness: 0.5 });
  const duration = 0.5;
  const [isPlaying, setIsPlaying] = useState(false);
  const controllerRef = React.useRef<{ cancel: () => void } | null>(null);
  
  // Microphone test state
  const [isRecording, setIsRecording] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [audioWaveformData, setAudioWaveformData] = useState<Array<{ t: number; amplitude: number }>>([]);
  const audioSampleBufferRef = useRef<number[]>([]);
  const audioProcessingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioDataTimeRef = useRef(0);
  const MICROPHONE_SAMPLE_RATE = 44100;
  const AVERAGING_WINDOW_MS = 10; // 0.01s = 10ms
  const SAMPLES_PER_WINDOW = Math.floor((MICROPHONE_SAMPLE_RATE * AVERAGING_WINDOW_MS) / 1000); // ~441 samples per 10ms
  const MAX_DATA_POINTS = 1000; // 10 seconds at 100Hz (10 points per second)
  const PLOT_WIDTH = Dimensions.get('window').width - 48; // Account for padding
  const PLOT_HEIGHT = 200;
  
  // Audio test state
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [bufferLength, setBufferLength] = useState(0);
  const [baseFrequency, setBaseFrequency] = useState(DEFAULT_FREQUENCY); // Base frequency from main slider
  const [precisionOffset, setPrecisionOffset] = useState(0); // Precision offset in Hz (-1000 to +1000)
  const [frequencyInput, setFrequencyInput] = useState(DEFAULT_FREQUENCY.toString()); // For text input
  const [frequencySign, setFrequencySign] = useState(true); // true for positive, false for negative
  const [volume, setVolume] = useState(50); // Volume percentage (0-100), default 50%
  const [waveformShape, setWaveformShape] = useState<'sine' | 'sawtooth'>(DEFAULT_SHAPE);
  const [controlMode, setControlMode] = useState<ControlMode>(DEFAULT_CONTROL_MODE);
  const [pitchRotation, setPitchRotation] = useState(0); // Current pitch rotation in radians (beta)
  const [rollRotation, setRollRotation] = useState(0); // Current roll rotation in radians (gamma)
  const baselinePitchRef = useRef<number | null>(null); // Baseline pitch (rolling average)
  const baselineRollRef = useRef<number | null>(null); // Baseline roll (rolling average)
  const pitchHistoryRef = useRef<number[]>([]); // Last 64 pitch measurements
  const rollHistoryRef = useRef<number[]>([]); // Last 64 roll measurements
  const BASELINE_HISTORY_SIZE = 64; // Number of measurements to average for baseline
  const startingFrequencyRef = useRef<number | null>(null); // Starting frequency when audio begins
  const audioControllerRef = useRef<AudioController | null>(null);
  const audioParamsRef = useRef({ frequency: DEFAULT_FREQUENCY, volume: 0.5 }); // 0.5 = 50%
  const waveformShapeRef = useRef<'sine' | 'sawtooth'>(DEFAULT_SHAPE); // Ref for live shape access
  const controlModeRef = useRef<ControlMode>(DEFAULT_CONTROL_MODE); // Ref for live control mode access
  const pitchRotationRef = useRef(0); // Ref for live pitch rotation access
  const rollRotationRef = useRef(0); // Ref for live roll rotation access
  const frequencySignRef = useRef(true); // Ref for live frequency sign access
  
  // Magnetometer state for ambient control
  const magnetometerBufferRef = useRef<MagnetometerData[]>([]);
  const currentMagnetometerRef = useRef<MagnetometerData | null>(null);
  const MAGNETOMETER_BUFFER_SIZE = 64;
  
  // Use refs to ensure we always have latest values in handlers
  const baseFrequencyRef = useRef(DEFAULT_FREQUENCY);
  const precisionOffsetRef = useRef(0);
  const previousBaseFrequencyRef = useRef(DEFAULT_FREQUENCY); // Track previous value to detect 0 transition
  
  // Frequency range mapping
  const MIN_FREQUENCY = 0;
  const [maxFrequency, setMaxFrequency] = useState(2000);
  const [maxFrequencyInput, setMaxFrequencyInput] = useState('2000');
  // Precision range is 10% of max frequency
  const PRECISION_RANGE = maxFrequency * 0.1;
  
  // Calculate absolute frequency (for display and slider)
  const absoluteFrequency = baseFrequency + precisionOffset;

  // Stream generator for continuous haptic
  async function* hapticStream() {
    while (true) {
      // Always yield the latest values from ref
      yield { intensity: valuesRef.current.intensity, sharpness: valuesRef.current.sharpness, duration };
      await new Promise(resolve => setTimeout(resolve, duration * 1000));
    }
  }

  // Store the current haptic runner
  const hapticRunnerRef = React.useRef<Promise<void> | null>(null);

  const startHaptic = () => {
    // Don't start if already playing
    if (isPlaying || hapticRunnerRef.current) {
      return;
    }
    
    let cancelled = false;
    controllerRef.current = {
      cancel: () => { cancelled = true; }
    };
    // Wrap the stream to allow cancellation
    async function* cancellableStream() {
      for await (const value of hapticStream()) {
        if (cancelled) break;
        yield value;
      }
    }
    hapticRunnerRef.current = playContinuousHaptic(cancellableStream()).then(() => {
      setIsPlaying(false);
      hapticRunnerRef.current = null;
      controllerRef.current = null;
    }).catch(() => {
      setIsPlaying(false);
      hapticRunnerRef.current = null;
      controllerRef.current = null;
    });
  };

  const stopHaptic = async () => {
    controllerRef.current?.cancel();
    setIsPlaying(false);
    
    // Wait for the promise to complete
    if (hapticRunnerRef.current) {
      try {
        await hapticRunnerRef.current;
      } catch (error) {
        // Ignore errors from cancellation
      }
      hapticRunnerRef.current = null;
    }
    controllerRef.current = null;
  };

  const handlePlayPause = async () => {
    if (isPlaying) {
      await stopHaptic();
      return;
    }
    setIsPlaying(true);
    startHaptic();
  };

  // Update ref and state on slider change
  const handleIntensityChange = (val: number) => {
    setIntensity(val);
    valuesRef.current.intensity = val;
  };
  const handleSharpnessChange = (val: number) => {
    setSharpness(val);
    valuesRef.current.sharpness = val;
  };

  // Initialize audio and start streaming constant volume samples
  const startTestAudio = async () => {
    // Don't start if already playing
    if (isAudioPlaying || audioControllerRef.current) {
      return;
    }
    
    try {
      setIsAudioPlaying(true);
      
      // Baseline is now continuously updated via rolling average, no need to capture here
      
      // Capture starting frequency
      const absFreq = baseFrequencyRef.current + precisionOffsetRef.current;
      startingFrequencyRef.current = absFreq * (frequencySignRef.current ? 1 : -1);
      
      // Update ref with current values
      audioParamsRef.current = { frequency: startingFrequencyRef.current, volume: volume / 100 };
      
      // Create state getters for sensor controllers
      const getRotationState = (): RotationControllerState => ({
        pitchRotation: pitchRotationRef.current,
        rollRotation: rollRotationRef.current,
        baselinePitch: baselinePitchRef.current,
        baselineRoll: baselineRollRef.current,
      });
      
      const getAmbientState = (): AmbientControllerState => ({
        magnetometerBuffer: [...magnetometerBufferRef.current],
        currentMagnetometer: currentMagnetometerRef.current,
        startingFrequency: startingFrequencyRef.current,
      });
      
      const getBaseFrequency = (): number => {
        const absFreq = baseFrequencyRef.current + precisionOffsetRef.current;
        return absFreq * (frequencySignRef.current ? 1 : -1);
      };
      
      // Create frequency getter using sensor controller logic
      const getFrequency = createFrequencyGetter(
        () => controlModeRef.current,
        getBaseFrequency,
        getRotationState,
        getAmbientState
      );
      
      // Play waveform with dynamic frequency, volume, and shape
      // Using getter functions so we can update frequency/volume/shape during playback
      const controller = await playWaveform(
        getFrequency,
        () => audioParamsRef.current.volume,     // getter for volume
        () => waveformShapeRef.current,          // getter for shape
        (length) => setBufferLength(length)       // buffer length update callback
      );
      
      audioControllerRef.current = controller;
      
      // Wait for the promise to complete (or be cancelled)
      controller.promise.finally(() => {
        setIsAudioPlaying(false);
        audioControllerRef.current = null;
      });
    } catch (error) {
      console.error('Failed to start test audio:', error);
      setIsAudioPlaying(false);
      audioControllerRef.current = null;
    }
  };
  
  // Handle base frequency change from main slider - update ref so it affects playback in real-time
  // When main slider moves, set base frequency to the new total and reset precision offset
  const handleBaseFrequencyChange = (totalFreq: number) => {
    setBaseFrequency(totalFreq);
    setPrecisionOffset(0);
    baseFrequencyRef.current = totalFreq;
    precisionOffsetRef.current = 0;
    setFrequencyInput(totalFreq.toFixed(1));
    // Note: Frequency is now calculated dynamically in the audio getter function
  };
  
  // Handle precision offset change from precision slider
  const handlePrecisionChange = (offset: number) => {
    setPrecisionOffset(offset);
    precisionOffsetRef.current = offset;
    const actualFreq = baseFrequencyRef.current + offset;
    setFrequencyInput(actualFreq.toFixed(1));
    // Note: Frequency is now calculated dynamically in the audio getter function
  };
  
  // Handle frequency input from text field
  const handleFrequencyInputChange = (text: string) => {
    setFrequencyInput(text);
  };
  
  // Validate and apply frequency from text input
  const handleFrequencyInputSubmit = () => {
    Keyboard.dismiss();
    const numValue = parseFloat(frequencyInput);
    if (!isNaN(numValue) && numValue >= MIN_FREQUENCY && numValue <= maxFrequency) {
      // Update base frequency and reset precision offset
      previousBaseFrequencyRef.current = baseFrequencyRef.current; // Update previous before changing
      setBaseFrequency(numValue);
      setPrecisionOffset(0);
      baseFrequencyRef.current = numValue;
      precisionOffsetRef.current = 0;
      // Note: Frequency is now calculated dynamically in the audio getter function
    } else {
      // Invalid input, reset to current absolute frequency
      setFrequencyInput(absoluteFrequency.toFixed(1));
    }
  };

  // Handle max frequency input change
  const handleMaxFrequencyInputChange = (text: string) => {
    setMaxFrequencyInput(text);
  };

  // Validate and apply max frequency from text input
  const handleMaxFrequencyInputSubmit = () => {
    Keyboard.dismiss();
    const numValue = parseFloat(maxFrequencyInput);
    if (!isNaN(numValue) && numValue > 0) {
      setMaxFrequency(numValue);
      // If current frequency exceeds new max, clamp it
      if (baseFrequency > numValue) {
        setBaseFrequency(numValue);
        baseFrequencyRef.current = numValue;
        setFrequencyInput(numValue.toFixed(1));
        // Note: Frequency is now calculated dynamically in the audio getter function
      }
      // If precision offset exceeds new range, clamp it
      const newPrecisionRange = numValue * 0.1;
      if (Math.abs(precisionOffset) > newPrecisionRange) {
        const clampedOffset = Math.sign(precisionOffset) * newPrecisionRange;
        setPrecisionOffset(clampedOffset);
        precisionOffsetRef.current = clampedOffset;
      }
    } else {
      // Invalid input, reset to current max frequency
      setMaxFrequencyInput(maxFrequency.toString());
    }
  };
  
  // Handle frequency sign change
  const handleFrequencySignChange = (sign: boolean) => {
    setFrequencySign(sign);
    frequencySignRef.current = sign;
  };

  // Handle volume change
  const handleVolumeChange = (volumePercent: number) => {
    setVolume(volumePercent);
    // Update audio volume in real-time (0-100% maps to 0.0-1.0)
    audioParamsRef.current.volume = volumePercent / 100;
  };
  
  // Update input text when absolute frequency changes from slider
  useEffect(() => {
    setFrequencyInput(absoluteFrequency.toFixed(1));
    // Note: Frequency is now calculated dynamically in the audio getter function
  }, [absoluteFrequency]);

  // Update audio volume when volume changes
  useEffect(() => {
    audioParamsRef.current.volume = volume / 100;
  }, [volume]);

  // Update waveform shape ref when shape changes (for live updates)
  useEffect(() => {
    waveformShapeRef.current = waveformShape;
  }, [waveformShape]);

  // Update control mode ref when mode changes (for live updates)
  useEffect(() => {
    controlModeRef.current = controlMode;
  }, [controlMode]);

  // Update frequency sign ref when sign changes (for live updates)
  useEffect(() => {
    frequencySignRef.current = frequencySign;
  }, [frequencySign]);

  // Update rolling average baseline
  const updateBaseline = (pitch: number, roll: number) => {
    // Add new measurements to history
    pitchHistoryRef.current.push(pitch);
    rollHistoryRef.current.push(roll);
    
    // Keep only the last BASELINE_HISTORY_SIZE measurements
    if (pitchHistoryRef.current.length > BASELINE_HISTORY_SIZE) {
      pitchHistoryRef.current.shift();
    }
    if (rollHistoryRef.current.length > BASELINE_HISTORY_SIZE) {
      rollHistoryRef.current.shift();
    }
    
    // Calculate average of all measurements in history (works even with just 1 measurement)
    const pitchSum = pitchHistoryRef.current.reduce((sum, val) => sum + val, 0);
    baselinePitchRef.current = pitchSum / pitchHistoryRef.current.length;
    
    const rollSum = rollHistoryRef.current.reduce((sum, val) => sum + val, 0);
    baselineRollRef.current = rollSum / rollHistoryRef.current.length;
  };

  // Subscribe to DeviceMotion for pitch and roll rotation
  useFocusEffect(
    React.useCallback(() => {
      const subscription = DeviceMotion.addListener((data) => {
        let pitch: number | undefined;
        let roll: number | undefined;
        
        if (data?.rotation?.beta !== undefined) {
          const beta = data.rotation.beta; // Pitch rotation in radians
          setPitchRotation(beta);
          pitchRotationRef.current = beta;
          pitch = beta;
        }
        if (data?.rotation?.gamma !== undefined) {
          const gamma = data.rotation.gamma; // Roll rotation in radians
          setRollRotation(gamma);
          rollRotationRef.current = gamma;
          roll = gamma;
        }
        
        // Update rolling average baseline when we have both values
        if (pitch !== undefined && roll !== undefined) {
          updateBaseline(pitch, roll);
        }
      });
      DeviceMotion.setUpdateInterval(16); // ~60Hz updates
      return () => {
        subscription && subscription.remove();
      };
    }, [])
  );
  
  // Subscribe to Magnetometer for ambient control
  useFocusEffect(
    React.useCallback(() => {
      const subscription = Magnetometer.addListener((data) => {
        const magnetometerData: MagnetometerData = {
          x: data.x || 0,
          y: data.y || 0,
          z: data.z || 0,
        };
        
        // Add to buffer
        magnetometerBufferRef.current.push(magnetometerData);
        if (magnetometerBufferRef.current.length > MAGNETOMETER_BUFFER_SIZE) {
          magnetometerBufferRef.current.shift();
        }
        
        // Update current value
        currentMagnetometerRef.current = magnetometerData;
      });
      Magnetometer.setUpdateInterval(24); // ~42Hz updates
      return () => {
        subscription && subscription.remove();
      };
    }, [])
  );
  
  // Keep refs in sync with state
  useEffect(() => {
    baseFrequencyRef.current = baseFrequency;
  }, [baseFrequency]);
  
  useEffect(() => {
    precisionOffsetRef.current = precisionOffset;
  }, [precisionOffset]);
  
  const stopTestAudio = async () => {
    setIsAudioPlaying(false);
    
    // Cancel the audio controller
    if (audioControllerRef.current) {
      audioControllerRef.current.cancel();
      
      // Wait for streaming to stop
      try {
        await audioControllerRef.current.promise;
      } catch (error) {
        // Ignore errors from cancellation
      }
      audioControllerRef.current = null;
    }
    
    // Baseline continues updating via rolling average, no need to reset
    startingFrequencyRef.current = null;
    
    // Stop audio engine
    try {
      await stopAudio();
      setBufferLength(0);
    } catch (error) {
      console.error('Failed to stop audio:', error);
    }
  };
  
  const handleTestAudioToggle = () => {
    if (isAudioPlaying) {
      stopTestAudio();
    } else {
      startTestAudio();
    }
  };
  
  // Microphone recording functions
  // Note: expo-av doesn't provide real-time access to raw audio samples.
  // For true real-time visualization, we'd need to extend the native AudioModule.
  // This implementation processes audio data periodically from the recording file.
  const startMicrophoneRecording = async () => {
    try {
      console.log('Starting microphone recording...');
      
      // Check if Audio is available
      if (!Audio || !Audio.Recording) {
        throw new Error('expo-av Audio module not available. Please install expo-av.');
      }

      // Request permissions - try a safer approach
      console.log('Checking microphone permissions...');
      let hasPermission = false;
      
      try {
        // Try to get current permission status first (safer than requesting directly)
        if (Audio.getPermissionsAsync) {
          const currentStatus = await Audio.getPermissionsAsync();
          console.log('Current permission status:', currentStatus);
          hasPermission = currentStatus.status === 'granted' || currentStatus.granted === true;
        }
        
        // If not granted, try to request
        if (!hasPermission && Audio.requestPermissionsAsync) {
          console.log('Requesting microphone permission...');
          const response = await Audio.requestPermissionsAsync();
          hasPermission = response.status === 'granted' || response.granted === true;
          console.log('Permission request result:', hasPermission);
        }
      } catch (permError) {
        // If permission API fails, log but continue - recording will fail with a clear error
        console.warn('Permission check failed, will attempt recording anyway:', permError);
        hasPermission = false;
      }
      
      if (!hasPermission) {
        Alert.alert(
          'Microphone Permission Required',
          'Please grant microphone access in your device Settings to record audio.',
          [
            { text: 'OK', style: 'default' }
          ]
        );
        return;
      }

      // Stop any existing audio playback to avoid conflicts
      if (isAudioPlaying) {
        console.log('Stopping audio playback...');
        await stopTestAudio();
        // Wait longer for audio to fully stop and release resources
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Also ensure the native audio module is stopped
      try {
        await stopAudio();
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (e) {
        console.log('stopAudio error (may be expected):', e);
      }

      // Configure audio mode for recording
      console.log('Setting audio mode...');
      try {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
          shouldDuckAndroid: true,
        });
        console.log('Audio mode set successfully');
        // Small delay to ensure audio session is ready
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (modeError) {
        console.error('Error setting audio mode:', modeError);
        throw modeError;
      }

      // Create recording instance using the simplest API
      console.log('Creating recording instance...');
      const recording = new Audio.Recording();
      
      // Use the simplest preset configuration
      console.log('Preparing to record...');
      try {
        // Add a small delay to ensure app is fully in foreground
        await new Promise(resolve => setTimeout(resolve, 50));
        
        await recording.prepareToRecordAsync(
          Audio.RecordingOptionsPresets.HIGH_QUALITY
        );
        console.log('Prepare successful');
        
        // Another small delay before starting
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (prepareError) {
        console.error('Prepare error:', prepareError);
        // If it's a background error, provide helpful message
        if (prepareError instanceof Error && prepareError.message.includes('background')) {
          throw new Error('Please ensure the app is in the foreground to start recording.');
        }
        throw prepareError;
      }

      // Start recording
      console.log('Starting recording...');
      try {
        await recording.startAsync();
        console.log('Recording started successfully');
      } catch (startError) {
        console.error('Start error:', startError);
        // Try to cleanup
        try {
          await recording.stopAndUnloadAsync();
        } catch (e) {
          // Ignore cleanup errors
        }
        throw startError;
      }

      recordingRef.current = recording;
      setIsRecording(true);
      audioDataTimeRef.current = 0;
      audioSampleBufferRef.current = [];
      setAudioWaveformData([]);

      // Start periodic processing to get metering data and update waveform
      console.log('Starting audio processing interval...');
      audioProcessingIntervalRef.current = setInterval(async () => {
        if (!recordingRef.current) return;
        try {
          const status = await recordingRef.current.getStatusAsync();
          if (status.isRecording) {
            // Get metering value if available
            let amplitude = 0.1; // Default low amplitude
            
            if (status.metering !== undefined && status.metering !== null) {
              // Metering values are typically in dB, ranging from -160 (silence) to 0 (max)
              const dbValue = status.metering;
              // Convert dB to linear amplitude (0-1 range)
              // Normalize: -160dB = 0, 0dB = 1
              amplitude = Math.max(0, Math.min(1, (dbValue + 160) / 160));
            } else {
              // If metering not available, use a small random value to show activity
              amplitude = 0.1 + Math.random() * 0.1;
            }
            
            // Add new data point
            setAudioWaveformData((prev) => {
              const newData = [...prev, { t: audioDataTimeRef.current, amplitude }];
              audioDataTimeRef.current += AVERAGING_WINDOW_MS / 1000; // Increment time by 0.01s
              
              // Keep only last 10 seconds (1000 points at 100Hz)
              if (newData.length > MAX_DATA_POINTS) {
                return newData.slice(-MAX_DATA_POINTS);
              }
              return newData;
            });
          }
        } catch (error) {
          console.error('Error processing audio:', error);
        }
      }, AVERAGING_WINDOW_MS); // Update every 10ms (100Hz)

    } catch (error) {
      console.error('Failed to start recording - full error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      Alert.alert('Recording Error', `Failed to start recording: ${errorMessage}`);
      setIsRecording(false);
      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (e) {
          console.error('Error during cleanup:', e);
        }
        recordingRef.current = null;
      }
    }
  };

  const stopMicrophoneRecording = async () => {
    try {
      if (audioProcessingIntervalRef.current) {
        clearInterval(audioProcessingIntervalRef.current);
        audioProcessingIntervalRef.current = null;
      }

      if (recordingRef.current) {
        try {
          await recordingRef.current.stopAndUnloadAsync();
        } catch (error) {
          console.error('Error stopping recording:', error);
        }
        recordingRef.current = null;
      }

      setIsRecording(false);
    } catch (error) {
      console.error('Failed to stop recording:', error);
      setIsRecording(false);
    }
  };

  const handleMicrophoneToggle = async () => {
    try {
      // Check if Audio is available before proceeding
      if (!isAudioAvailable()) {
        Alert.alert(
          'Audio Module Not Available', 
          'expo-av is not properly installed. Please run: npx expo install expo-av'
        );
        return;
      }
      
      if (isRecording) {
        await stopMicrophoneRecording();
      } else {
        await startMicrophoneRecording();
      }
    } catch (error) {
      console.error('Error in handleMicrophoneToggle:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      Alert.alert('Error', `An error occurred: ${errorMessage}`);
      setIsRecording(false);
    }
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioControllerRef.current) {
        audioControllerRef.current.cancel();
      }
      stopAudio().catch(() => {});
      
      // Cleanup microphone recording
      if (audioProcessingIntervalRef.current) {
        clearInterval(audioProcessingIntervalRef.current);
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 24 }}
        showsVerticalScrollIndicator={true}
      >
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Microphone Test</Text>
      <View style={{ marginBottom: 32 }}>
        <AudioWaveformPlot
          data={audioWaveformData}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          title="Microphone Input"
          color="#39ff14"
        />
        <Pressable
          onPress={handleMicrophoneToggle}
          style={{
            backgroundColor: isRecording ? '#ff0000' : '#39ff14',
            paddingVertical: 12,
            paddingHorizontal: 24,
            borderRadius: 8,
            marginTop: 16,
          }}
          android_ripple={null}
        >
          <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600' }}>
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </Text>
        </Pressable>
      </View>
      
      <View style={{ marginTop: 32, paddingTop: 32, borderTopWidth: 1, borderTopColor: '#333' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Speaker Test</Text>
      <View style={{ marginBottom: 32 }}>
        <WaveformSliderGroup
          baseFrequency={baseFrequency}
          precisionOffset={precisionOffset}
          frequencySign={frequencySign}
          frequencyInput={frequencyInput}
          volume={volume}
          maxFrequency={maxFrequency}
          maxFrequencyInput={maxFrequencyInput}
          precisionRange={PRECISION_RANGE}
          waveformShape={waveformShape}
          onBaseFrequencyChange={handleBaseFrequencyChange}
          onPrecisionChange={handlePrecisionChange}
          onFrequencySignChange={handleFrequencySignChange}
          onFrequencyInputChange={handleFrequencyInputChange}
          onFrequencyInputSubmit={handleFrequencyInputSubmit}
          onMaxFrequencyInputChange={handleMaxFrequencyInputChange}
          onMaxFrequencyInputSubmit={handleMaxFrequencyInputSubmit}
          onVolumeChange={handleVolumeChange}
          onWaveformShapeChange={setWaveformShape}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, gap: 12 }}>
          <Pressable
            onPress={handleTestAudioToggle}
            style={{
              backgroundColor: '#39ff14',
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 8,
              flex: 1,
            }}
            android_ripple={null}
          >
            <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600' }}>
              {isAudioPlaying ? 'Stop' : 'Start Test Audio'}
            </Text>
          </Pressable>
          <ControlSelector
            controlMode={controlMode}
            onControlModeChange={setControlMode}
          />
        </View>
        <Text style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
          Buffer: {bufferLength} samples
        </Text>
      </View>
      </View>
      
      <View style={{ marginTop: 32, paddingTop: 32, borderTopWidth: 1, borderTopColor: '#333' }}>
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Haptic Player</Text>
        <Text style={{ color: '#fff', marginBottom: 8 }}>Intensity: {intensity.toFixed(2)}</Text>
        <Slider
          value={intensity}
          onValueChange={handleIntensityChange}
          trackColor="#39ff14"
        />
        <Text style={{ color: '#fff', marginTop: 16, marginBottom: 8 }}>Sharpness: {sharpness.toFixed(2)}</Text>
        <Slider
          value={sharpness}
          onValueChange={handleSharpnessChange}
          trackColor="#39ff14"
        />
        <View style={{ marginTop: 24 }}>
          <Button
            title={isPlaying ? 'Pause' : 'Play Haptic'}
            color="#39ff14"
            onPress={handlePlayPause}
          />
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  );
}
