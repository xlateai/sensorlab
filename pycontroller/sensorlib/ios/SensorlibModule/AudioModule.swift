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

  private var sampleRate: Double = 44100
  private var channels: Int = 1

  private var format: AVAudioFormat?
  
  // Track scheduled buffer length
  private var scheduledFrameCount: Int = 0
  private let queue = DispatchQueue(label: "com.audiolab.audio.buffer")

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
    playSamplesBatch(samples: input.samples)
  }
  
  func playSamplesBatch(samples: [Float]) {
    guard let format = format, let player = player else { return }

    let frameCount = AVAudioFrameCount(samples.count / channels)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { return }
    buffer.frameLength = frameCount

    let dst = buffer.floatChannelData![0]
    samples.withUnsafeBufferPointer { src in
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

// Helper function to play samples from an array (for internal use)
func playSamplesBatch(samples: [Float]) {
  AudioModule.shared.playSamplesBatch(samples: samples)
}

func stopAudio() {
  AudioModule.shared.stopAudio()
}

func getCurrentBufferLength() -> Int {
  return AudioModule.shared.getCurrentBufferLength()
}