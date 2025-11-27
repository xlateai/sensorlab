import Foundation
import ExpoModulesCore
import AVFoundation

struct AudioInitInput: Record {
  @Field var sampleRate: Double
  @Field var channelCount: Int?
}

struct AudioSamplesInput: Record {
  @Field var samples: [Float]
}

struct WaveformPlaybackInput: Record {
  @Field var baseFrequency: Double
  @Field var volume: Double
  @Field var shape: String
  @Field var enableRotationControl: Bool?
  @Field var baselinePitch: Double?
  @Field var baselineRoll: Double?
}

struct WaveformParameterUpdate: Record {
  @Field var baseFrequency: Double?
  @Field var volume: Double?
  @Field var shape: String?
  @Field var pitchRotation: Double?
  @Field var rollRotation: Double?
}

final class AudioModule {
  static let shared = AudioModule()
  
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?

  private var sampleRate: Double = 44100
  private var channels: Int = 1

  private var format: AVAudioFormat?
  
  // Track scheduled buffer length
  private var scheduledFrameCount: Int = 0
  private let queue = DispatchQueue(label: "com.audiolab.audio.buffer")
  
  // Waveform playback state
  private var isWaveformPlaying: Bool = false
  private var waveformPhase: Double = 0.0
  private var waveformParams: (baseFrequency: Double, volume: Double, shape: WaveformShape) = (440.0, 0.5, .sine)
  private var rotationControl: (enabled: Bool, baselinePitch: Double?, baselineRoll: Double?, currentPitch: Double, currentRoll: Double) = (false, nil, nil, 0.0, 0.0)
  private var waveformGenerator: DispatchWorkItem?
  private let waveformQueue = DispatchQueue(label: "com.audiolab.audio.waveform", qos: .userInteractive)
  private let LOW_LATENCY_BUFFER_SIZE = 64 // Very small buffer for low latency

  private init() {}

  func initialize(sampleRate: Double, channelCount: Int) throws {
    stopAudio()

    self.sampleRate = sampleRate
    self.channels = channelCount

    // Configure audio session to play through built-in speakers
    let audioSession = AVAudioSession.sharedInstance()
    do {
      // Try to deactivate first to ensure clean state
      try? audioSession.setActive(false)
      // Set category with defaultToSpeaker option to route to built-in speakers
      try audioSession.setCategory(.playback, mode: .default, options: [.defaultToSpeaker])
      try audioSession.setActive(true)
    } catch {
      // Fallback: try without defaultToSpeaker option if it fails
      do {
        try audioSession.setCategory(.playback, mode: .default)
        try audioSession.setActive(true)
      } catch {
        // If that also fails, just try to activate (might already be configured)
        try? audioSession.setActive(true)
      }
    }

    let engine = AVAudioEngine()
    let player = AVAudioPlayerNode()

    let format = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: AVAudioChannelCount(channelCount),
      interleaved: false
    )!

    self.engine = engine
    self.player = player
    self.format = format
    
    // Reset frame count
    queue.async {
      self.scheduledFrameCount = 0
    }

    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: format)

    try engine.start()
    player.play()
  }

  func playSamplesBatch(input: AudioSamplesInput) {
    guard let format = format, let player = player else { return }

    let frameCount = AVAudioFrameCount(input.samples.count / channels)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
    buffer.frameLength = frameCount

    let dst = buffer.floatChannelData![0]
    input.samples.withUnsafeBufferPointer { src in
      dst.initialize(from: src.baseAddress!, count: src.count)
    }

    // Track scheduled frames
    queue.async {
      self.scheduledFrameCount += Int(frameCount)
    }

    player.scheduleBuffer(buffer) { [weak self] in
      // Decrement when buffer completes
      self?.queue.async {
        self?.scheduledFrameCount = max(0, self!.scheduledFrameCount - Int(frameCount))
      }
    }
  }

  func getCurrentBufferLength() -> Int {
    return queue.sync {
      return scheduledFrameCount
    }
  }

  func stopAudio() {
    // Stop waveform playback
    stopWaveformPlayback()
    
    player?.stop()
    engine?.stop()
    engine?.reset()
    engine = nil
    player = nil
    queue.async {
      self.scheduledFrameCount = 0
    }
    // Deactivate audio session
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    } catch {
      // Ignore errors when deactivating
    }
  }
  
  // MARK: - Waveform Playback
  
  func startWaveformPlayback(input: WaveformPlaybackInput) throws {
    // Ensure audio is initialized
    if engine == nil || player == nil {
      try initialize(sampleRate: sampleRate, channelCount: channels)
    }
    
    // Stop any existing waveform playback
    stopWaveformPlayback()
    
    // Parse shape
    let shape: WaveformShape
    switch input.shape.lowercased() {
    case "sine":
      shape = .sine
    case "sawtooth":
      shape = .sawtooth
    default:
      shape = .sine
    }
    
    // Initialize waveform state
    waveformPhase = 0.0
    waveformParams = (input.baseFrequency, input.volume, shape)
    rotationControl = (
      enabled: input.enableRotationControl ?? false,
      baselinePitch: input.baselinePitch,
      baselineRoll: input.baselineRoll,
      currentPitch: 0.0,
      currentRoll: 0.0
    )
    isWaveformPlaying = true
    
    // Start waveform generator
    startWaveformGenerator()
  }
  
  func updateWaveformParameters(input: WaveformParameterUpdate) {
    waveformQueue.async { [weak self] in
      guard let self = self else { return }
      
      if let baseFreq = input.baseFrequency {
        self.waveformParams.baseFrequency = baseFreq
      }
      if let volume = input.volume {
        self.waveformParams.volume = volume
      }
      if let shapeStr = input.shape {
        switch shapeStr.lowercased() {
        case "sine":
          self.waveformParams.shape = .sine
        case "sawtooth":
          self.waveformParams.shape = .sawtooth
        default:
          break
        }
      }
      if let pitch = input.pitchRotation {
        self.rotationControl.currentPitch = pitch
      }
      if let roll = input.rollRotation {
        self.rotationControl.currentRoll = roll
      }
    }
  }
  
  func stopWaveformPlayback() {
    isWaveformPlaying = false
    waveformGenerator?.cancel()
    waveformGenerator = nil
  }
  
  private func startWaveformGenerator() {
    guard let format = format, let player = player else { return }
    
    waveformGenerator = DispatchWorkItem { [weak self] in
      guard let self = self else { return }
      
      while self.isWaveformPlaying {
        // Check buffer length - only generate if we're below threshold
        let currentBufferLength = self.getCurrentBufferLength()
        let maxBufferedSamples = self.LOW_LATENCY_BUFFER_SIZE * 4 // Keep 4 small buffers ahead
        
        if currentBufferLength >= maxBufferedSamples {
          // Buffer is full, wait a bit before checking again
          Thread.sleep(forTimeInterval: 0.01)
          continue
        }
        
        // Calculate current frequency (with rotation modulation if enabled)
        var frequency = self.waveformParams.baseFrequency
        if self.rotationControl.enabled,
           let baselinePitch = self.rotationControl.baselinePitch,
           let baselineRoll = self.rotationControl.baselineRoll {
          let multiplier = calculateRotationFrequencyMultiplier(
            pitchRotation: self.rotationControl.currentPitch,
            rollRotation: self.rotationControl.currentRoll,
            baselinePitch: baselinePitch,
            baselineRoll: baselineRoll
          )
          frequency = self.waveformParams.baseFrequency * multiplier
        }
        
        // Generate small buffer of samples
        let (samples, newPhase) = generateWaveformSamples(
          phase: self.waveformPhase,
          frequency: frequency,
          sampleRate: self.sampleRate,
          volume: self.waveformParams.volume,
          shape: self.waveformParams.shape,
          count: self.LOW_LATENCY_BUFFER_SIZE
        )
        
        self.waveformPhase = newPhase
        
        // Schedule buffer
        let frameCount = AVAudioFrameCount(samples.count / self.channels)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
          // Retry if buffer creation fails
          Thread.sleep(forTimeInterval: 0.001)
          continue
        }
        buffer.frameLength = frameCount
        
        let dst = buffer.floatChannelData![0]
        samples.withUnsafeBufferPointer { src in
          dst.initialize(from: src.baseAddress!, count: src.count)
        }
        
        // Track scheduled frames
        self.queue.async {
          self.scheduledFrameCount += Int(frameCount)
        }
        
        player.scheduleBuffer(buffer) { [weak self] in
          // Decrement when buffer completes
          self?.queue.async {
            self?.scheduledFrameCount = max(0, self!.scheduledFrameCount - Int(frameCount))
          }
        }
        
        // Small delay to prevent tight loop (but keep it minimal for low latency)
        // At 64 samples per buffer and 44100 Hz, each buffer is ~1.45ms
        // A 0.5ms delay gives us good responsiveness while not overwhelming the system
        Thread.sleep(forTimeInterval: 0.0005)
      }
    }
    
    waveformQueue.async(execute: waveformGenerator!)
  }
}

// wrapper functions

func initializeAudio(input: AudioInitInput) throws {
  try AudioModule.shared.initialize(
    sampleRate: input.sampleRate,
    channelCount: input.channelCount ?? 1
  )
}

func playSamplesBatch(input: AudioSamplesInput) {
  AudioModule.shared.playSamplesBatch(input: input)
}

func stopAudio() {
  AudioModule.shared.stopAudio()
}

func getCurrentBufferLength() -> Int {
  return AudioModule.shared.getCurrentBufferLength()
}

func startWaveformPlayback(input: WaveformPlaybackInput) throws {
  try AudioModule.shared.startWaveformPlayback(input: input)
}

func updateWaveformParameters(input: WaveformParameterUpdate) {
  AudioModule.shared.updateWaveformParameters(input: input)
}

func stopWaveformPlayback() {
  AudioModule.shared.stopWaveformPlayback()
}