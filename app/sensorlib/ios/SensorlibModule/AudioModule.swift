import Foundation
import ExpoModulesCore
import AVFoundation

// MARK: - Inputs passed from JS

struct AudioInitInput: Record {
  @Field var sampleRate: Double
  @Field var channelCount: Int?
}

struct AudioSamplesInput: Record {
  @Field var samples: [Float]
}

// MARK: - Audio Module

final class AudioModule {
  static let shared = AudioModule()
  
  private var engine: AVAudioEngine?
  private var player: AVAudioPlayerNode?

  private var sampleRate: Double = 44100
  private var channels: Int = 1
  private var bufferSize: Int = 2048

  // Simple buffer - append writes, removeFirst reads
  private var buffer: [Float] = []
  private let lock = NSLock()

  private var format: AVAudioFormat?

  private init() {}

  // MARK: - Initialization

  func initialize(sampleRate: Double, channelCount: Int, bufferSize: Int = 2048) throws {
    stopAudio()

    self.sampleRate = sampleRate
    self.channels = channelCount
    self.bufferSize = bufferSize

    // Create engine & player
    let engine = AVAudioEngine()
    let player = AVAudioPlayerNode()

    let format = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: AVAudioChannelCount(channels),
      interleaved: false
    )!

    self.engine = engine
    self.player = player
    self.format = format

    engine.attach(player)
    engine.connect(player, to: engine.mainMixerNode, format: format)

    try engine.start()
    player.play()

    // Background scheduling loop
    startSchedulingLoop()
  }

  // MARK: - Push Samples

  func playSamplesBatch(input: AudioSamplesInput) {
    lock.lock()
    buffer.append(contentsOf: input.samples)
    lock.unlock()
  }

  // MARK: - Scheduling Loop

  private func startSchedulingLoop() {
    guard let player = player, let format = format else { return }

    DispatchQueue.global(qos: .userInteractive).async { [weak self] in
      guard let self = self else { return }

      while self.engine != nil && player.isPlaying {
        let chunk = self.readChunk()

        if chunk.count == 0 {
          // Avoid burning CPU when empty
          usleep(500)
          continue
        }

        let frameCount = AVAudioFrameCount(chunk.count / self.channels)
        guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else { continue }
        buffer.frameLength = frameCount

        let dst = buffer.floatChannelData![0]
        memcpy(dst, chunk, chunk.count * MemoryLayout<Float>.size)

        player.scheduleBuffer(buffer, completionHandler: nil)
      }
    }
  }

  // Simple read: lock, copy chunk, remove it, unlock
  private func readChunk() -> [Float] {
    return lock.withLock {
      if buffer.isEmpty { return [] }
      
      let count = min(bufferSize, buffer.count)
      let chunk = Array(buffer[0..<count])
      buffer.removeFirst(count)
      return chunk
    }
  }

  // MARK: - Query

  func getCurrentBufferLength() -> Int {
    return lock.withLock {
      buffer.count
    }
  }

  // MARK: - Stop

  func stopAudio() {
    if let player = player {
      player.stop()
    }
    if let engine = engine {
      engine.stop()
      engine.reset()
    }

    self.player = nil
    self.engine = nil

    lock.lock()
    buffer.removeAll()
    lock.unlock()
  }
}

// MARK: - Top-level wrapper functions for SensorlibModule

func initializeAudio(input: AudioInitInput) throws {
  try AudioModule.shared.initialize(
    sampleRate: input.sampleRate,
    channelCount: input.channelCount ?? 1,
    bufferSize: 2048
  )
}

func playSamplesBatch(input: AudioSamplesInput) {
  AudioModule.shared.playSamplesBatch(input: input)
}

func getCurrentBufferLength() -> Int {
  return AudioModule.shared.getCurrentBufferLength()
}

func stopAudio() {
  AudioModule.shared.stopAudio()
}

// Helper extension for cleaner lock usage
extension NSLock {
  func withLock<T>(_ body: () throws -> T) rethrows -> T {
    lock()
    defer { unlock() }
    return try body()
  }
}
