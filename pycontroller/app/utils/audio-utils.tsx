import { requireNativeModule } from 'expo-modules-core';
import { getMagnetometerAverageNormalized, MagnetometerData } from './sensor-utils';

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
 * Generates a single waveform sample for a given phase, frequency, volume, and shape
 */
function generateSample(phase: number, volume: number, shape: 'sine' | 'sawtooth'): number {
  if (shape === 'sine') {
    return Math.sin(phase) * volume;
  } else if (shape === 'sawtooth') {
    // Sawtooth: linear ramp from -1 to 1, then reset
    // Normalize phase to 0-1 range, then map to -1 to 1
    // Handle negative phase by wrapping it to positive range
    let wrappedPhase = phase;
    while (wrappedPhase < 0) wrappedPhase += 2 * Math.PI;
    while (wrappedPhase >= 2 * Math.PI) wrappedPhase -= 2 * Math.PI;
    const normalizedPhase = wrappedPhase / (2 * Math.PI);
    return (2 * normalizedPhase - 1) * volume;
  } else {
    // Fallback to sine if unknown shape
    return Math.sin(phase) * volume;
  }
}

/**
 * Generates waveform samples with dynamic frequency, volume, and shape support.
 * Can switch between waveform shapes in real-time without restarting.
 * Supports single frequency or array of frequencies (for additive synthesis).
 */
function* generateWaveformSamples(
  getFrequency: () => number | number[],
  getVolume: () => number,
  getShape: () => 'sine' | 'sawtooth'
): Generator<number, void, unknown> {
  const phases: number[] = [0]; // Start with single phase for single frequency mode
  
  while (true) {
    const frequencyOrFrequencies = getFrequency();
    const volume = getVolume();
    const shape = getShape();
    
    // Check if we have multiple frequencies (array) or single frequency
    const isMultiFrequency = Array.isArray(frequencyOrFrequencies);
    const frequencies = isMultiFrequency ? frequencyOrFrequencies : [frequencyOrFrequencies];
    
    // Ensure we have enough phases for all frequencies
    while (phases.length < frequencies.length) {
      phases.push(0);
    }
    
    // Generate sample for each frequency and add them together
    let combinedSample = 0;
    for (let i = 0; i < frequencies.length; i++) {
      const frequency = frequencies[i];
      const phaseIncrement = (2 * Math.PI * frequency) / SAMPLE_RATE;
      
      // Generate sample for this frequency
      // Divide volume by number of frequencies to keep total volume consistent
      const perFrequencyVolume = volume / frequencies.length;
      combinedSample += generateSample(phases[i], perFrequencyVolume, shape);
      
      // Update phase for next iteration
      phases[i] += phaseIncrement;
      // Wrap phase to keep it in reasonable range (prevents overflow/underflow)
      while (phases[i] > 2 * Math.PI) phases[i] -= 2 * Math.PI;
      while (phases[i] < -2 * Math.PI) phases[i] += 2 * Math.PI;
    }
    
    yield combinedSample;
  }
}

/**
 * Plays a waveform with the given frequency, volume, and shape.
 * Manages batch generation and limits buffering to prevent memory overload.
 * Frequency, volume, and shape can be updated dynamically via getter functions.
 * Includes volume ramping on start (0 to target over 1s) and stop (target to 0 over 1s).
 * Supports single frequency or array of frequencies (for additive synthesis with multiple waves).
 */
export async function playWaveform(
  getFrequency: () => number | number[],
  getVolume: () => number,
  getShape: () => 'sine' | 'sawtooth',
  onBufferLengthUpdate?: (length: number) => void
): Promise<AudioController> {
  // Initialize speakers
  await Sensorlib.initializeSpeakers({ 
    sampleRate: SAMPLE_RATE, 
    channelCount: CHANNEL_COUNT 
  });
  
  let cancelled = false;
  let stopRequested = false;
  const startTime = Date.now();
  const RAMP_DURATION = 1000; // 1 second in milliseconds
  
  // Track stop time and volume at stop for fade out
  let stopTime: number | null = null;
  let volumeAtStop: number = 0;
  
  // Create a ramped volume getter that handles both fade in and fade out
  const getRampedVolume = (): number => {
    const elapsed = Date.now() - startTime;
    const targetVolume = getVolume();
    
    if (stopTime !== null) {
      // Ramp down: from volume at stop to 0 over 1 second
      const stopElapsed = Date.now() - stopTime;
      if (stopElapsed >= RAMP_DURATION) {
        return 0; // Fully faded out
      }
      const rampProgress = stopElapsed / RAMP_DURATION;
      return volumeAtStop * (1 - rampProgress);
    }
    
    if (elapsed < RAMP_DURATION) {
      // Ramp up: from 0 to target volume over 1 second
      const rampProgress = elapsed / RAMP_DURATION;
      return targetVolume * rampProgress;
    }
    
    // After ramp up, return target volume
    return targetVolume;
  };
  
  const sampleGenerator = generateWaveformSamples(getFrequency, getRampedVolume, getShape);
  const sampleBuffer: number[] = [];
  let samplesGenerated = 0;
  
  // Start buffer length monitoring if callback provided
  let bufferUpdateInterval: ReturnType<typeof setInterval> | null = null;
  if (onBufferLengthUpdate) {
    bufferUpdateInterval = setInterval(() => {
      try {
        const length = Sensorlib.getCurrentSpeakerBufferLength();
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
        const currentBufferLength = Sensorlib.getCurrentSpeakerBufferLength();
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
          Sensorlib.playSpeakersBatch({ samples: sampleBuffer });
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
      if (!stopRequested) {
        stopRequested = true;
        stopTime = Date.now();
        // Capture current ramped volume at stop time for fade out
        // This ensures we fade from the actual current volume, even if still fading in
        volumeAtStop = getRampedVolume();
        // Continue generating samples for fade out, then cancel
        setTimeout(() => {
          cancelled = true;
        }, RAMP_DURATION);
      } else {
        cancelled = true;
      }
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
    await Sensorlib.stopSpeakers();
  } catch (error) {
    console.error('Failed to stop audio:', error);
  }
}

/**
 * Relays microphone input to speakers in real-time.
 * Initializes both microphone and speakers, then continuously reads samples
 * from the microphone and plays them to the speakers.
 */
export async function relayMicrophoneToSpeakers(): Promise<AudioController> {
  // Initialize both microphone and speakers
  await Sensorlib.initializeMicrophone({
    sampleRate: SAMPLE_RATE,
    channelCount: CHANNEL_COUNT
  });
  
  await Sensorlib.initializeSpeakers({
    sampleRate: SAMPLE_RATE,
    channelCount: CHANNEL_COUNT
  });
  
  let cancelled = false;
  
  const relayAudio = async (): Promise<void> => {
    try {
      while (!cancelled) {
        // Read samples from microphone
        const samples = Sensorlib.readSamplesBatch();
        
        // If we have samples, play them to speakers
        if (samples.length > 0) {
          Sensorlib.playSpeakersBatch({ samples });
        }
        
        // Yield to event loop to prevent blocking
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    } catch (error) {
      console.error('Microphone relay error:', error);
      throw error;
    } finally {
      // Cleanup: stop both microphone and speakers
      try {
        Sensorlib.stopListening();
        await Sensorlib.stopSpeakers();
      } catch (error) {
        console.error('Failed to stop microphone relay:', error);
      }
    }
  };
  
  const promise = relayAudio();
  
  return {
    cancel: () => {
      cancelled = true;
    },
    promise
  };
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
  previousNormalized: number;
  currentNormalized: number;
  previousNormalizedX: number;
  currentNormalizedX: number;
  previousNormalizedY: number;
  currentNormalizedY: number;
  previousNormalizedZ: number;
  currentNormalizedZ: number;
  lastUpdateTime: number;
  updateInterval: number;
}

const MAX_ROTATION_THRESHOLD = 0.5; // radians
const AMBIENT_FREQUENCY_MULTIPLIER = 6;

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
 * Uses interpolation to smoothly transition between magnetometer readings
 * This ensures smooth frequency changes at audio sample rate (44.1kHz) even though
 * magnetometer only updates at ~42Hz
 * Returns an array of 3 frequencies (one for each axis: x, y, z) for additive synthesis
 */
export function createAmbientFrequencyGetter(
  baseFrequency: () => number,
  ambientState: () => AmbientControllerState
): () => number | number[] {
  return () => {
    const state = ambientState();
    
    if (state.startingFrequency === null || state.magnetometerBuffer.length === 0 || state.currentMagnetometer === null) {
      return baseFrequency();
    }
    
    // Interpolate between previous and current normalized values for each axis
    // based on time elapsed since last magnetometer update
    const now = Date.now();
    const timeSinceUpdate = now - state.lastUpdateTime;
    const interpolationProgress = Math.min(timeSinceUpdate / state.updateInterval, 1.0); // Clamp to 0-1
    
    // Linear interpolation for each axis: previous + (current - previous) * progress
    const interpolatedX = state.previousNormalizedX + (state.currentNormalizedX - state.previousNormalizedX) * interpolationProgress;
    const interpolatedY = state.previousNormalizedY + (state.currentNormalizedY - state.previousNormalizedY) * interpolationProgress;
    const interpolatedZ = state.previousNormalizedZ + (state.currentNormalizedZ - state.previousNormalizedZ) * interpolationProgress;
    
    // Apply multiplier based on starting frequency for each axis
    // Each normalized value ranges from 0 to 1, so frequency ranges from startingFreq to startingFreq * multiplier
    const frequencyOffsetX = interpolatedX * (state.startingFrequency * AMBIENT_FREQUENCY_MULTIPLIER - state.startingFrequency);
    const frequencyOffsetY = interpolatedY * (state.startingFrequency * AMBIENT_FREQUENCY_MULTIPLIER - state.startingFrequency);
    const frequencyOffsetZ = interpolatedZ * (state.startingFrequency * AMBIENT_FREQUENCY_MULTIPLIER - state.startingFrequency);
    
    // Return array of 3 frequencies (one per axis) for additive synthesis
    return [
      state.startingFrequency + frequencyOffsetX,
      state.startingFrequency + frequencyOffsetY,
      state.startingFrequency + frequencyOffsetZ,
    ];
  };
}

/**
 * Creates a frequency getter based on control mode
 * Returns either a single number or array of numbers (for ambient mode with 3 axes)
 */
export function createFrequencyGetter(
  controlMode: () => ControlMode,
  baseFrequency: () => number,
  rotationState: () => RotationControllerState,
  ambientState: () => AmbientControllerState
): () => number | number[] {
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
