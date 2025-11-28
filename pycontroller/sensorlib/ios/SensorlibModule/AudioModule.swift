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

final class AudioModule {
  static let shared = AudioModule()
  
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?
  private var inputNode: AVAudioInputNode?

  private var sampleRate: Double = 44100
  private var channels: Int = 1

  private var format: AVAudioFormat?
  
  // Track scheduled buffer length for speakers
  private var scheduledFrameCount: Int = 0
  
  // Track microphone samples buffer
  private var microphoneSamples: [Float] = []
  private let queue = DispatchQueue(label: "com.audiolab.audio.buffer")

  private init() {}

  func initializeSpeakers(sampleRate: Double, channelCount: Int) throws {
    // Check if microphone is active before stopping speakers
    let microphoneActive = inputNode != nil
    
    stopSpeakers()

    self.sampleRate = sampleRate
    self.channels = channelCount

    // Configure audio session
    let audioSession = AVAudioSession.sharedInstance()
    do {
      // Try to deactivate first to ensure clean state
      try? audioSession.setActive(false)
      
      // If microphone is already active, use playAndRecord category
      if microphoneActive {
        try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
      } else {
        // Set category with defaultToSpeaker option to route to built-in speakers
        try audioSession.setCategory(.playback, mode: .default, options: [.defaultToSpeaker])
      }
      try audioSession.setActive(true)
    } catch {
      // Fallback: try without defaultToSpeaker option if it fails
      do {
        if microphoneActive {
          try audioSession.setCategory(.playAndRecord, mode: .default)
        } else {
          try audioSession.setCategory(.playback, mode: .default)
        }
        try audioSession.setActive(true)
      } catch {
        // If that also fails, just try to activate (might already be configured)
        try? audioSession.setActive(true)
      }
    }

    // Use existing engine or create new one
    if engine == nil {
      engine = AVAudioEngine()
    }
    guard let engine = engine else { return }
    
    let player = AVAudioPlayerNode()

    let format = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: AVAudioChannelCount(channelCount),
      interleaved: false
    )!

    self.player = player
    self.format = format
    
    // Reset frame count
    queue.async {
      self.scheduledFrameCount = 0
    }

    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: format)

    if !engine.isRunning {
      try engine.start()
    }
    player.play()
  }

  func playSpeakersBatch(input: AudioSamplesInput) {
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

  func getCurrentSpeakerBufferLength() -> Int {
    return queue.sync {
      return scheduledFrameCount
    }
  }

  func stopSpeakers() {
    player?.stop()
    player = nil
    queue.async {
      self.scheduledFrameCount = 0
    }
    // Only stop engine if microphone is not active
    if inputNode == nil {
      engine?.stop()
      engine?.reset()
      engine = nil
      // Deactivate audio session
      do {
        try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      } catch {
        // Ignore errors when deactivating
      }
    }
  }

  func initializeMicrophone(sampleRate: Double, channelCount: Int) throws {
    // Check if speakers are active before stopping microphone
    let speakersActive = player != nil
    
    stopListening()

    self.sampleRate = sampleRate
    self.channels = channelCount

    // Request microphone permission first
    let audioSession = AVAudioSession.sharedInstance()
    
    // Check current permission status
    let currentStatus = audioSession.recordPermission
    
    // If not already granted, request permission
    if currentStatus != .granted {
      let semaphore = DispatchSemaphore(value: 0)
      var permissionGranted = false
      
      audioSession.requestRecordPermission { granted in
        permissionGranted = granted
        semaphore.signal()
      }
      
      // Wait for permission response (with timeout)
      let timeout = semaphore.wait(timeout: .now() + 10.0)
      if timeout == .timedOut || !permissionGranted {
        throw NSError(domain: "AudioModule", code: 1, userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied or request timed out"])
      }
    }

    // Configure audio session
    do {
      // Try to deactivate first to ensure clean state
      try? audioSession.setActive(false)
      
      // If speakers are already active, use playAndRecord category
      if speakersActive {
        try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
      } else {
        // Set category for recording
        try audioSession.setCategory(.record, mode: .default)
      }
      try audioSession.setActive(true)
    } catch {
      // Fallback: try to activate (might already be configured)
      try? audioSession.setActive(true)
    }

    // Use existing engine or create new one
    if engine == nil {
      engine = AVAudioEngine()
    }
    guard let engine = engine else { return }
    
    let inputNode = engine.inputNode
    self.inputNode = inputNode

    let format = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: AVAudioChannelCount(channelCount),
      interleaved: false
    )!

    self.format = format
    
    // Clear microphone samples buffer
    queue.async {
      self.microphoneSamples.removeAll()
    }

    // Install tap on input node to capture audio
    let bufferSize: AVAudioFrameCount = 4096
    inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: format) { [weak self] (buffer, time) in
      guard let self = self, let channelData = buffer.floatChannelData else { return }
      
      let frameLength = Int(buffer.frameLength)
      let channelCount = Int(buffer.format.channelCount)
      
      // Extract samples from buffer (non-interleaved format, so each channel is separate)
      // For now, read from first channel only, or combine all channels if needed
      var samples: [Float] = []
      if channelCount == 1 {
        // Mono: just read from first channel
        samples = Array(UnsafeBufferPointer(start: channelData[0], count: frameLength))
      } else {
        // Multi-channel: average all channels to mono, or take first channel
        // For simplicity, taking first channel - can be extended later
        samples = Array(UnsafeBufferPointer(start: channelData[0], count: frameLength))
      }
      
      self.queue.async {
        self.microphoneSamples.append(contentsOf: samples)
      }
    }

    if !engine.isRunning {
      try engine.start()
    }
  }

  func readSamplesBatch() -> [Float] {
    return queue.sync {
      let samples = microphoneSamples
      microphoneSamples.removeAll()
      return samples
    }
  }

  func stopListening() {
    inputNode?.removeTap(onBus: 0)
    inputNode = nil
    queue.async {
      self.microphoneSamples.removeAll()
    }
    // Only stop engine if speakers are not active
    if player == nil {
      engine?.stop()
      engine?.reset()
      engine = nil
      // Deactivate audio session
      do {
        try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
      } catch {
        // Ignore errors when deactivating
      }
    }
  }
}

// wrapper functions for speakers

func initializeSpeakers(input: AudioInitInput) throws {
  try AudioModule.shared.initializeSpeakers(
    sampleRate: input.sampleRate,
    channelCount: input.channelCount ?? 1
  )
}

func playSpeakersBatch(input: AudioSamplesInput) {
  AudioModule.shared.playSpeakersBatch(input: input)
}

func stopSpeakers() {
  AudioModule.shared.stopSpeakers()
}

func getCurrentSpeakerBufferLength() -> Int {
  return AudioModule.shared.getCurrentSpeakerBufferLength()
}

// wrapper functions for microphone

func initializeMicrophone(input: AudioInitInput) throws {
  try AudioModule.shared.initializeMicrophone(
    sampleRate: input.sampleRate,
    channelCount: input.channelCount ?? 1
  )
}

func readSamplesBatch() -> [Float] {
  return AudioModule.shared.readSamplesBatch()
}

func stopListening() {
  AudioModule.shared.stopListening()
}