import { requireNativeModule } from 'expo-modules-core';
import { normalizeMagnetometerSum, MagnetometerData } from './sensor-utils';

const Sensorlib = requireNativeModule('Sensorlib');

// Hardcoded audio parameters
const SAMPLE_RATE = 44100;
const CHANNEL_COUNT = 1;
const AUDIO_SAMPLE_BATCH_SIZE = 1024;
const MAX_BUFFERED_SAMPLES = AUDIO_SAMPLE_BATCH_SIZE * 4; // Max k batches
const YIELD_INTERVAL = 1000; // Yield to event loop every N samples

export interface AudioController {
  cancel: () => void;
  promise: Promise<void>;
}

/**
 * Generates waveform samples with dynamic frequency, volume, and shape support.
 * Can switch between waveform shapes in real-time without restarting.
 */
function* generateWaveformSamples(
  getFrequency: () => number,
  getVolume: () => number,
  getShape: () => 'sine' | 'sawtooth'
): Generator<number, void, unknown> {
  let phase = 0;
  
  while (true) {
    const frequency = getFrequency();
    const volume = getVolume();
    const shape = getShape();
    const phaseIncrement = (2 * Math.PI * frequency) / SAMPLE_RATE;
    
    let sample: number;
    if (shape === 'sine') {
      sample = Math.sin(phase) * volume;
    } else if (shape === 'sawtooth') {
      // Sawtooth: linear ramp from -1 to 1, then reset
      // Normalize phase to 0-1 range, then map to -1 to 1
      // Handle negative phase by wrapping it to positive range
      let wrappedPhase = phase;
      while (wrappedPhase < 0) wrappedPhase += 2 * Math.PI;
      while (wrappedPhase >= 2 * Math.PI) wrappedPhase -= 2 * Math.PI;
      const normalizedPhase = wrappedPhase / (2 * Math.PI);
      sample = (2 * normalizedPhase - 1) * volume;
    } else {
      // Fallback to sine if unknown shape
      sample = Math.sin(phase) * volume;
    }
    
    phase += phaseIncrement;
    // Wrap phase to keep it in reasonable range (prevents overflow/underflow)
    while (phase > 2 * Math.PI) phase -= 2 * Math.PI;
    while (phase < -2 * Math.PI) phase += 2 * Math.PI;
    yield sample;
  }
}

/**
 * Plays a waveform with the given frequency, volume, and shape.
 * Manages batch generation and limits buffering to prevent memory overload.
 * Frequency, volume, and shape can be updated dynamically via getter functions.
 */
export async function playWaveform(
  getFrequency: () => number,
  getVolume: () => number,
  getShape: () => 'sine' | 'sawtooth',
  onBufferLengthUpdate?: (length: number) => void
): Promise<AudioController> {
  // Initialize audio
  await Sensorlib.initializeAudio({ 
    sampleRate: SAMPLE_RATE, 
    channelCount: CHANNEL_COUNT 
  });
  
  let cancelled = false;
  const sampleGenerator = generateWaveformSamples(getFrequency, getVolume, getShape);
  const sampleBuffer: number[] = [];
  let samplesGenerated = 0;
  
  // Start buffer length monitoring if callback provided
  let bufferUpdateInterval: ReturnType<typeof setInterval> | null = null;
  if (onBufferLengthUpdate) {
    bufferUpdateInterval = setInterval(() => {
      try {
        const length = Sensorlib.getCurrentBufferLength();
        onBufferLengthUpdate(length);
      } catch (error) {
        console.error('Error getting buffer length:', error);
      }
    }, 100) as unknown as ReturnType<typeof setInterval>;
  }
  
  const streamAudio = async (): Promise<void> => {
    try {
      while (true) {
        // Check cancellation
        if (cancelled) {
          break;
        }
        
        // Check current buffer length - only generate more if we're below threshold
        const currentBufferLength = Sensorlib.getCurrentBufferLength();
        if (currentBufferLength >= MAX_BUFFERED_SAMPLES) {
          // Buffer is full, wait a bit before checking again
          await new Promise(resolve => setTimeout(resolve, 10));
          continue;
        }
        
        // Generate single sample
        const sample = sampleGenerator.next().value;
        if (sample === undefined) break;
        
        // Add to buffer
        sampleBuffer.push(sample);
        samplesGenerated++;
        
        // When buffer reaches batch size, send it
        if (sampleBuffer.length >= AUDIO_SAMPLE_BATCH_SIZE) {
          Sensorlib.playSamplesBatch({ samples: sampleBuffer });
          sampleBuffer.length = 0; // Clear the buffer
        }
        
        // Yield to event loop periodically to prevent blocking
        if (samplesGenerated % YIELD_INTERVAL === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    } finally {
      // Cleanup
      if (bufferUpdateInterval) {
        clearInterval(bufferUpdateInterval);
      }
    }
  };
  
  const promise = streamAudio().catch((error) => {
    console.error('Audio streaming error:', error);
    throw error;
  });
  
  return {
    cancel: () => {
      cancelled = true;
    },
    promise
  };
}

/**
 * Legacy function for backward compatibility - plays a pure sine wave
 * @deprecated Use playWaveform instead for dynamic shape switching
 */
export async function playPureSine(
  getFrequency: () => number,
  getVolume: () => number,
  onBufferLengthUpdate?: (length: number) => void
): Promise<AudioController> {
  return playWaveform(getFrequency, getVolume, () => 'sine', onBufferLengthUpdate);
}

/**
 * Legacy function for backward compatibility - plays a sawtooth wave
 * @deprecated Use playWaveform instead for dynamic shape switching
 */
export async function playSawtooth(
  getFrequency: () => number,
  getVolume: () => number,
  onBufferLengthUpdate?: (length: number) => void
): Promise<AudioController> {
  return playWaveform(getFrequency, getVolume, () => 'sawtooth', onBufferLengthUpdate);
}

/**
 * Stops audio playback and cleans up resources
 */
export async function stopAudio(): Promise<void> {
  try {
    await Sensorlib.stopAudio();
  } catch (error) {
    console.error('Failed to stop audio:', error);
  }
}

// Sensor controller types
export type ControlMode = 'rotation' | 'ambient' | 'none';

export interface RotationControllerState {
  pitchRotation: number;
  rollRotation: number;
  baselinePitch: number | null;
  baselineRoll: number | null;
}

export interface AmbientControllerState {
  magnetometerBuffer: MagnetometerData[];
  currentMagnetometer: MagnetometerData | null;
  startingFrequency: number | null;
}

const MAX_ROTATION_THRESHOLD = 0.5; // radians
const AMBIENT_FREQUENCY_MULTIPLIER = 1000;

/**
 * Creates a frequency getter for rotation control mode
 */
export function createRotationFrequencyGetter(
  baseFrequency: () => number,
  rotationState: () => RotationControllerState
): () => number {
  return () => {
    const baseFreq = baseFrequency();
    const state = rotationState();
    
    if (state.baselinePitch === null || state.baselineRoll === null) {
      return baseFreq;
    }
    
    // Calculate angular distance from baseline for pitch
    const pitchDiff = Math.abs(state.pitchRotation - state.baselinePitch);
    // Normalize: MAX_ROTATION_THRESHOLD radians = 1.0
    const normalizedPitchDist = Math.min(pitchDiff / MAX_ROTATION_THRESHOLD, 1.0);
    
    // Calculate angular distance from baseline for roll
    const rollDiff = Math.abs(state.rollRotation - state.baselineRoll);
    // Normalize: MAX_ROTATION_THRESHOLD radians = 1.0
    const normalizedRollDist = Math.min(rollDiff / MAX_ROTATION_THRESHOLD, 1.0);
    
    // Average the two normalized distances
    const avgDistance = (normalizedPitchDist + normalizedRollDist) / 2;
    
    // Apply sine to get smooth curve
    const sinedDistance = Math.sin(avgDistance * Math.PI / 2);
    
    // Map to multiplier: 1.0x (baseline) to 10x (max)
    // sinedDistance ranges from 0 to 1, so: 1.0 + (sinedDistance * 9.0) = 1.0 to 10.0
    const frequencyMultiplier = 1.0 + (sinedDistance * 9.0);
    
    return baseFreq * frequencyMultiplier;
  };
}

/**
 * Creates a frequency getter for ambient control mode (magnetometer)
 */
export function createAmbientFrequencyGetter(
  baseFrequency: () => number,
  ambientState: () => AmbientControllerState
): () => number {
  return () => {
    const state = ambientState();
    
    if (state.startingFrequency === null || state.magnetometerBuffer.length === 0 || state.currentMagnetometer === null) {
      return baseFrequency();
    }
    
    // Normalize magnetometer sum to 0-1 range
    const normalized = normalizeMagnetometerSum(state.magnetometerBuffer, state.currentMagnetometer);
    
    // Apply 1000x multiplier based on starting frequency
    // normalized ranges from 0 to 1, so frequency ranges from startingFreq to startingFreq * 1000
    const frequencyOffset = normalized * (state.startingFrequency * AMBIENT_FREQUENCY_MULTIPLIER - state.startingFrequency);
    
    return state.startingFrequency + frequencyOffset;
  };
}

/**
 * Creates a frequency getter based on control mode
 */
export function createFrequencyGetter(
  controlMode: () => ControlMode,
  baseFrequency: () => number,
  rotationState: () => RotationControllerState,
  ambientState: () => AmbientControllerState
): () => number {
  return () => {
    const mode = controlMode();
    
    switch (mode) {
      case 'rotation':
        return createRotationFrequencyGetter(baseFrequency, rotationState)();
      case 'ambient':
        return createAmbientFrequencyGetter(baseFrequency, ambientState)();
      case 'none':
      default:
        return baseFrequency();
    }
  };
}
