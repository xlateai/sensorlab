import React, { useState, useRef, useEffect } from 'react';
import { View, Text, Button, Keyboard, Pressable, TextInput, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeviceMotion, Magnetometer } from 'expo-sensors';
import { useFocusEffect } from '@react-navigation/native';
import { playContinuousHaptic } from '../utils/haptics';
import { 
  playWaveform, 
  stopAudio, 
  AudioController,
  ControlMode,
  createFrequencyGetter,
  RotationControllerState,
  AmbientControllerState,
  relayMicrophoneToSpeakers
} from '../utils/audio-utils';
import Sensorlib from 'sensorlib';
import { MagnetometerData, getMagnetometerAverageNormalized, getMagnetometerAxisNormalized } from '../utils/sensor-utils';
import Slider from '../../components/ui/slider';
import WaveformSliderGroup from '../../components/ui/waveform-slider-group';
import WaveformPlot from '../../components/WaveformPlot';

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
  
  // Audio test state
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [bufferLength, setBufferLength] = useState(0);
  const [isMicrophoneRelaying, setIsMicrophoneRelaying] = useState(false);
  const microphoneRelayControllerRef = useRef<AudioController | null>(null);
  
  // Microphone listening state (separate from relay)
  const [isMicrophoneListening, setIsMicrophoneListening] = useState(false);
  const microphoneListeningIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [waveformData, setWaveformData] = useState<Array<{ t: number; value: number }>>([]);
  const waveformStartTimeRef = useRef<number | null>(null);
  const WAVEFORM_DURATION_MS = 3000; // 3 seconds
  const MICROPHONE_SAMPLE_RATE_MS = 16; // ~60Hz (1000/60 ≈ 16ms)
  const [baseFrequency, setBaseFrequency] = useState(DEFAULT_FREQUENCY); // Base frequency from main slider
  const [precisionOffset, setPrecisionOffset] = useState(0); // Precision offset in Hz (-1000 to +1000)
  const [frequencyInput, setFrequencyInput] = useState(DEFAULT_FREQUENCY.toString()); // For text input
  const [frequencySign, setFrequencySign] = useState(true); // true for positive, false for negative
  const [volume, setVolume] = useState(50); // Volume percentage (0-100), default 50%
  const [waveformShape, setWaveformShape] = useState<'sine' | 'sawtooth'>(DEFAULT_SHAPE);
  const [controlMode, setControlMode] = useState<ControlMode>(DEFAULT_CONTROL_MODE);
  // Control multiplier state (slider value 0-1, maps to multiplier 1-20)
  const CONTROL_MULTIPLIER_MIN = 1;
  const CONTROL_MULTIPLIER_MAX = 20;
  const DEFAULT_MULTIPLIER = 6; // Default multiplier value
  const [controlMultiplier, setControlMultiplier] = useState(
    (DEFAULT_MULTIPLIER - CONTROL_MULTIPLIER_MIN) / (CONTROL_MULTIPLIER_MAX - CONTROL_MULTIPLIER_MIN)
  ); // Slider value (0-1), initialized to map to default multiplier
  
  // Convert slider value (0-1) to multiplier (1-20)
  const getMultiplierValue = (sliderValue: number) => {
    return CONTROL_MULTIPLIER_MIN + (sliderValue * (CONTROL_MULTIPLIER_MAX - CONTROL_MULTIPLIER_MIN));
  };
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
  const controlMultiplierRef = useRef(DEFAULT_MULTIPLIER); // Ref for live control multiplier access (actual multiplier value, not slider value)
  const pitchRotationRef = useRef(0); // Ref for live pitch rotation access
  const rollRotationRef = useRef(0); // Ref for live roll rotation access
  const frequencySignRef = useRef(true); // Ref for live frequency sign access
  
  // Magnetometer state for ambient control
  const magnetometerBufferRef = useRef<MagnetometerData[]>([]);
  const currentMagnetometerRef = useRef<MagnetometerData | null>(null);
  const MAGNETOMETER_BUFFER_SIZE = 64;
  
  // Interpolation state for smooth frequency transitions
  const previousNormalizedRef = useRef<number>(0.5); // Previous normalized value (0-1) - legacy, kept for compatibility
  const currentNormalizedRef = useRef<number>(0.5); // Current normalized value (0-1) - legacy, kept for compatibility
  // Per-axis normalized values for 3-wave additive synthesis
  const previousNormalizedXRef = useRef<number>(0.5);
  const currentNormalizedXRef = useRef<number>(0.5);
  const previousNormalizedYRef = useRef<number>(0.5);
  const currentNormalizedYRef = useRef<number>(0.5);
  const previousNormalizedZRef = useRef<number>(0.5);
  const currentNormalizedZRef = useRef<number>(0.5);
  const lastMagnetometerUpdateTimeRef = useRef<number>(Date.now()); // Timestamp of last magnetometer update
  const MAGNETOMETER_UPDATE_INTERVAL = 24; // ms (matches setUpdateInterval)
  
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
      
      // Initialize normalized values for ambient mode interpolation
      // Calculate initial normalized values if we have magnetometer data
      if (magnetometerBufferRef.current.length > 0 && currentMagnetometerRef.current) {
        // Legacy: combined normalized value
        const initialNormalized = getMagnetometerAverageNormalized(
          magnetometerBufferRef.current,
          currentMagnetometerRef.current
        );
        previousNormalizedRef.current = initialNormalized;
        currentNormalizedRef.current = initialNormalized;
        
        // Per-axis normalized values for 3-wave additive synthesis
        const initialX = getMagnetometerAxisNormalized(
          magnetometerBufferRef.current,
          currentMagnetometerRef.current,
          'x'
        );
        const initialY = getMagnetometerAxisNormalized(
          magnetometerBufferRef.current,
          currentMagnetometerRef.current,
          'y'
        );
        const initialZ = getMagnetometerAxisNormalized(
          magnetometerBufferRef.current,
          currentMagnetometerRef.current,
          'z'
        );
        previousNormalizedXRef.current = initialX;
        currentNormalizedXRef.current = initialX;
        previousNormalizedYRef.current = initialY;
        currentNormalizedYRef.current = initialY;
        previousNormalizedZRef.current = initialZ;
        currentNormalizedZRef.current = initialZ;
        
        lastMagnetometerUpdateTimeRef.current = Date.now();
      }
      
      // Update ref with current values
      audioParamsRef.current = { frequency: startingFrequencyRef.current, volume: volume / 100 };
      
      // Create state getters for sensor controllers
      const getRotationState = (): RotationControllerState => ({
        pitchRotation: pitchRotationRef.current,
        rollRotation: rollRotationRef.current,
        baselinePitch: baselinePitchRef.current,
        baselineRoll: baselineRollRef.current,
        multiplier: controlMultiplierRef.current,
      });
      
      const getAmbientState = (): AmbientControllerState => ({
        magnetometerBuffer: [...magnetometerBufferRef.current],
        currentMagnetometer: currentMagnetometerRef.current,
        startingFrequency: startingFrequencyRef.current,
        previousNormalized: previousNormalizedRef.current,
        currentNormalized: currentNormalizedRef.current,
        previousNormalizedX: previousNormalizedXRef.current,
        currentNormalizedX: currentNormalizedXRef.current,
        previousNormalizedY: previousNormalizedYRef.current,
        currentNormalizedY: currentNormalizedYRef.current,
        previousNormalizedZ: previousNormalizedZRef.current,
        currentNormalizedZ: currentNormalizedZRef.current,
        lastUpdateTime: lastMagnetometerUpdateTimeRef.current,
        updateInterval: MAGNETOMETER_UPDATE_INTERVAL,
        multiplier: controlMultiplierRef.current,
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

  // Update control multiplier ref when multiplier changes (for live updates)
  useEffect(() => {
    controlMultiplierRef.current = getMultiplierValue(controlMultiplier);
  }, [controlMultiplier]);

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
        
        // Update interpolation state: move current to previous, calculate new current
        previousNormalizedRef.current = currentNormalizedRef.current;
        previousNormalizedXRef.current = currentNormalizedXRef.current;
        previousNormalizedYRef.current = currentNormalizedYRef.current;
        previousNormalizedZRef.current = currentNormalizedZRef.current;
        
        // Calculate new normalized values from current magnetometer reading
        if (magnetometerBufferRef.current.length > 0) {
          // Legacy: calculate combined normalized value
          currentNormalizedRef.current = getMagnetometerAverageNormalized(
            magnetometerBufferRef.current,
            magnetometerData
          );
          
          // Per-axis normalized values for 3-wave additive synthesis
          currentNormalizedXRef.current = getMagnetometerAxisNormalized(
            magnetometerBufferRef.current,
            magnetometerData,
            'x'
          );
          currentNormalizedYRef.current = getMagnetometerAxisNormalized(
            magnetometerBufferRef.current,
            magnetometerData,
            'y'
          );
          currentNormalizedZRef.current = getMagnetometerAxisNormalized(
            magnetometerBufferRef.current,
            magnetometerData,
            'z'
          );
        }
        
        // Store timestamp for interpolation
        lastMagnetometerUpdateTimeRef.current = Date.now();
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
  
  // Handle microphone listening toggle (just listen, don't relay)
  const handleMicrophoneListeningToggle = async () => {
    if (isMicrophoneListening) {
      // Stop listening
      setIsMicrophoneListening(false);
      if (microphoneListeningIntervalRef.current) {
        clearInterval(microphoneListeningIntervalRef.current);
        microphoneListeningIntervalRef.current = null;
      }
      try {
        await Sensorlib.stopListening();
      } catch (error) {
        console.error('Failed to stop microphone listening:', error);
      }
      setWaveformData([]);
      waveformStartTimeRef.current = null;
    } else {
      // Start listening
      try {
        setIsMicrophoneListening(true);
        waveformStartTimeRef.current = Date.now();
        setWaveformData([]);
        
        await Sensorlib.initializeMicrophone({
          sampleRate: 44100,
          channelCount: 1
        });
        
        // Sample microphone at ~60Hz
        microphoneListeningIntervalRef.current = setInterval(() => {
          try {
            const samples = Sensorlib.readSamplesBatch();
            if (samples.length > 0) {
              // Calculate RMS (root mean square) for this batch to get amplitude
              const rms = Math.sqrt(
                samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
              );
              
              const now = Date.now();
              if (waveformStartTimeRef.current === null) {
                waveformStartTimeRef.current = now;
              }
              
              const t = (now - waveformStartTimeRef.current) / 1000; // Convert to seconds
              
              setWaveformData(prev => {
                // Remove data older than 3 seconds
                const cutoff = t - (WAVEFORM_DURATION_MS / 1000);
                const filtered = prev.filter(point => point.t >= cutoff);
                return [...filtered, { t, value: rms }];
              });
            }
          } catch (error) {
            console.error('Error reading microphone samples:', error);
          }
        }, MICROPHONE_SAMPLE_RATE_MS);
      } catch (error) {
        console.error('Failed to start microphone listening:', error);
        setIsMicrophoneListening(false);
      }
    }
  };

  // Handle microphone relay toggle
  const handleMicrophoneRelayToggle = async () => {
    if (isMicrophoneRelaying) {
      // Stop relay
      setIsMicrophoneRelaying(false);
      if (microphoneRelayControllerRef.current) {
        microphoneRelayControllerRef.current.cancel();
        try {
          await microphoneRelayControllerRef.current.promise;
        } catch (error) {
          // Ignore errors from cancellation
        }
        microphoneRelayControllerRef.current = null;
      }
    } else {
      // Start relay
      try {
        setIsMicrophoneRelaying(true);
        const controller = await relayMicrophoneToSpeakers();
        microphoneRelayControllerRef.current = controller;
        
        // Wait for the promise to complete (or be cancelled)
        controller.promise.finally(() => {
          setIsMicrophoneRelaying(false);
          microphoneRelayControllerRef.current = null;
        });
      } catch (error) {
        console.error('Failed to start microphone relay:', error);
        setIsMicrophoneRelaying(false);
        microphoneRelayControllerRef.current = null;
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioControllerRef.current) {
        audioControllerRef.current.cancel();
      }
      if (microphoneRelayControllerRef.current) {
        microphoneRelayControllerRef.current.cancel();
      }
      if (microphoneListeningIntervalRef.current) {
        clearInterval(microphoneListeningIntervalRef.current);
      }
      stopAudio().catch(() => {});
      Sensorlib.stopListening().catch(() => {});
    };
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 48,
          flexGrow: 1,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={true}
        bounces={true}
        scrollEnabled={true}
        nestedScrollEnabled={true}
      >
        <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Audio Test</Text>
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
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: '#fff', marginBottom: 8, fontSize: 14 }}>
            Control Multiplier: {getMultiplierValue(controlMultiplier).toFixed(1)}x
          </Text>
          <Slider
            value={controlMultiplier}
            onValueChange={setControlMultiplier}
            trackColor="#39ff14"
          />
          <Text style={{ color: '#888', marginTop: 4, fontSize: 12 }}>
            Adjusts sensitivity for rotation and ambient control modes (1x - 20x)
          </Text>
        </View>
        <Text style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
          Buffer: {bufferLength} samples
        </Text>
      </View>
      
        <View style={{ marginTop: 32, paddingTop: 32, borderTopWidth: 1, borderTopColor: '#333' }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 16, color: '#fff' }}>Microphone Test</Text>
          
          {/* Microphone Listening Button */}
          <Pressable
            onPress={handleMicrophoneListeningToggle}
            style={{
              backgroundColor: isMicrophoneListening ? '#e53935' : '#39ff14',
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 8,
              marginBottom: 16,
            }}
            android_ripple={null}
          >
            <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600' }}>
              {isMicrophoneListening ? 'Stop Listening' : 'Start Listening'}
            </Text>
          </Pressable>
          
          {/* Waveform Visualization */}
          {isMicrophoneListening && (
            <View style={{ marginBottom: 16 }}>
              <WaveformPlot 
                data={waveformData} 
                height={120}
                color="#39ff14"
                duration={3}
              />
            </View>
          )}
          
          {/* Microphone Relay Button */}
          <Pressable
            onPress={handleMicrophoneRelayToggle}
            style={{
              backgroundColor: '#39ff14',
              paddingVertical: 12,
              paddingHorizontal: 24,
              borderRadius: 8,
              marginBottom: 16,
              opacity: isMicrophoneListening ? 0.5 : 1,
            }}
            android_ripple={null}
            disabled={isMicrophoneListening}
          >
            <Text style={{ color: '#000', textAlign: 'center', fontWeight: '600' }}>
              {isMicrophoneRelaying ? 'Stop Relay' : 'Start Microphone Relay'}
            </Text>
          </Pressable>
          {isMicrophoneListening && (
            <Text style={{ color: '#888', fontSize: 12, marginTop: -12, marginBottom: 16, textAlign: 'center' }}>
              Stop listening before starting relay
            </Text>
          )}
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
