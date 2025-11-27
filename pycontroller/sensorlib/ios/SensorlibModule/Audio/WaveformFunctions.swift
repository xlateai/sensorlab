import Foundation
import Accelerate

/// Waveform shape types
enum WaveformShape: String {
  case sine
  case sawtooth
}

/// Generates a single waveform sample
/// - Parameters:
///   - phase: Current phase in radians (0 to 2π)
///   - frequency: Frequency in Hz
///   - sampleRate: Sample rate in Hz
///   - volume: Volume multiplier (0.0 to 1.0)
///   - shape: Waveform shape type
/// - Returns: Sample value and updated phase
func generateWaveformSample(
  phase: Double,
  frequency: Double,
  sampleRate: Double,
  volume: Double,
  shape: WaveformShape
) -> (sample: Float, newPhase: Double) {
  let phaseIncrement = (2.0 * Double.pi * frequency) / sampleRate
  var newPhase = phase + phaseIncrement
  
  // Wrap phase to keep it in 0 to 2π range (handles both positive and negative frequencies)
  while newPhase < 0 {
    newPhase += 2.0 * Double.pi
  }
  while newPhase >= 2.0 * Double.pi {
    newPhase -= 2.0 * Double.pi
  }
  
  let sample: Double
  switch shape {
  case .sine:
    sample = sin(newPhase) * volume
  case .sawtooth:
    // Sawtooth: linear ramp from -1 to 1, then reset
    // Normalize phase to 0-1 range, then map to -1 to 1
    let normalized = newPhase / (2.0 * Double.pi)
    sample = (2.0 * normalized - 1.0) * volume
  }
  
  return (Float(sample), newPhase)
}

/// Generates a batch of waveform samples
/// - Parameters:
///   - phase: Starting phase in radians
///   - frequency: Frequency in Hz
///   - sampleRate: Sample rate in Hz
///   - volume: Volume multiplier (0.0 to 1.0)
///   - shape: Waveform shape type
///   - count: Number of samples to generate
/// - Returns: Array of samples and final phase
func generateWaveformSamples(
  phase: Double,
  frequency: Double,
  sampleRate: Double,
  volume: Double,
  shape: WaveformShape,
  count: Int
) -> (samples: [Float], finalPhase: Double) {
  var samples: [Float] = []
  samples.reserveCapacity(count)
  
  var currentPhase = phase
  let phaseIncrement = (2.0 * Double.pi * frequency) / sampleRate
  
  for _ in 0..<count {
    let (sample, newPhase) = generateWaveformSample(
      phase: currentPhase,
      frequency: frequency,
      sampleRate: sampleRate,
      volume: volume,
      shape: shape
    )
    samples.append(sample)
    currentPhase = newPhase
  }
  
  return (samples, currentPhase)
}

/// Calculates frequency multiplier based on rotation distance from origin
/// This implements the same logic as the TypeScript version:
/// - Calculates angular distance from baseline for pitch and roll
/// - Normalizes and averages them
/// - Applies sine curve for smooth transition
/// - Maps to multiplier range: 1.0x (baseline) to 3.0x (max)
/// - Parameters:
///   - pitchRotation: Current pitch rotation in radians
///   - rollRotation: Current roll rotation in radians
///   - baselinePitch: Baseline pitch rotation in radians
///   - baselineRoll: Baseline roll rotation in radians
/// - Returns: Frequency multiplier (1.0 to 3.0)
func calculateRotationFrequencyMultiplier(
  pitchRotation: Double,
  rollRotation: Double,
  baselinePitch: Double,
  baselineRoll: Double
) -> Double {
  // Calculate angular distance from baseline for pitch
  let pitchDiff = abs(pitchRotation - baselinePitch)
  // Normalize: 180 degrees (π radians) = 1.0
  let normalizedPitchDist = min(pitchDiff / Double.pi, 1.0)
  
  // Calculate angular distance from baseline for roll
  let rollDiff = abs(rollRotation - baselineRoll)
  // Normalize: 180 degrees (π radians) = 1.0
  let normalizedRollDist = min(rollDiff / Double.pi, 1.0)
  
  // Average the two normalized distances
  let avgDistance = (normalizedPitchDist + normalizedRollDist) / 2.0
  
  // Apply sine to get smooth curve
  let sinedDistance = sin(avgDistance * Double.pi / 2.0)
  
  // Map to multiplier: 1.0x (baseline) to 3.0x (300% = max)
  // sinedDistance ranges from 0 to 1, so: 1.0 + (sinedDistance * 2.0) = 1.0 to 3.0
  let frequencyMultiplier = 1.0 + (sinedDistance * 2.0)
  
  return frequencyMultiplier
}
