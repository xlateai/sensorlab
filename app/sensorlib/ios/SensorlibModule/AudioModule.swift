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

  private init() {}

  func initialize(sampleRate: Double, channelCount: Int) throws {
    stopAudio()

    self.sampleRate = sampleRate
    self.channels = channelCount

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
    memcpy(dst, input.samples, input.samples.count * MemoryLayout<Float>.size)

    player.scheduleBuffer(buffer, completionHandler: nil)
  }

  func stopAudio() {
    player?.stop()
    engine?.stop()
    engine?.reset()
    engine = nil
    player = nil
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