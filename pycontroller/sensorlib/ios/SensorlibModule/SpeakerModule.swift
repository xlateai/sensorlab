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

final class SpeakerModule {
  static let shared = SpeakerModule()
  
  private var player: AVAudioPlayerNode?

  private var sampleRate: Double = 44100
  private var channels: Int = 1

  private var format: AVAudioFormat? // Output format for speakers
  
  // Track scheduled buffer length for speakers
  private var scheduledFrameCount: Int = 0
  private let queue = DispatchQueue(label: "com.audiolab.speaker.buffer")

  // Track whether speakers have already been configured so we don't
  // tear down and rebuild the graph unnecessarily.
  private var speakersInitialized: Bool = false

  private init() {}

  func initializeSpeakers(sampleRate: Double, channelCount: Int) throws {
    print("[SpeakerModule] initializeSpeakers called - sampleRate=\(sampleRate), channelCount=\(channelCount)")

    self.sampleRate = sampleRate
    self.channels = channelCount

    // Configure audio session for playback (shared with microphone)
    print("[SpeakerModule] initializeSpeakers - configuring AVAudioSession")
    do {
      try SharedAudioEngine.shared.configureAudioSession()
    } catch {
      // Fallback: try without options if it fails
      do {
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setActive(false)
        try audioSession.setCategory(.playAndRecord, mode: .default)
        try audioSession.setActive(true)
      } catch {
        // If that also fails, just try to activate (might already be configured)
        try? AVAudioSession.sharedInstance().setActive(true)
      }
    }

    // Use shared audio engine
    let engine = SharedAudioEngine.shared.getOrCreateEngine()
    SharedAudioEngine.shared.acquireSpeakers()

    // If speakers are already initialized and we have a player,
    // just make sure the engine is running and return.
    if speakersInitialized, let existingPlayer = player {
      print("[SpeakerModule] initializeSpeakers - reusing existing speakers configuration")
      DispatchQueue.main.async {
        guard existingPlayer.engine === engine else {
          print("[SpeakerModule] initializeSpeakers - WARNING: existing player.engine mismatch, not calling play()")
          return
        }
        
        // Ensure engine is running
        do {
          try SharedAudioEngine.shared.startEngineIfNeeded()
        } catch {
          print("[SpeakerModule] initializeSpeakers - failed to start engine: \(error.localizedDescription)")
          return
        }
        
        print("[SpeakerModule] initializeSpeakers - ensuring player is playing")
        if !existingPlayer.isPlaying {
          existingPlayer.play()
        }
      }
      return
    }
    
    let format = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: AVAudioChannelCount(channelCount),
      interleaved: false
    )!
    
    // Reset frame count
    queue.async {
      self.scheduledFrameCount = 0
    }
    
    // Safely modify engine graph (will stop/start if needed)
    try SharedAudioEngine.shared.withEngineModification { engine in
      // Check if player already exists (shouldn't happen, but be safe)
      if self.player == nil {
        let player = AVAudioPlayerNode()
        print("[SpeakerModule] initializeSpeakers - creating AVAudioPlayerNode (first init)")
        
        self.player = player
        self.format = format
        
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        print("[SpeakerModule] initializeSpeakers - attached and connected player node (first init)")
      } else {
        print("[SpeakerModule] initializeSpeakers - player already exists, updating format only")
        self.format = format
      }
    }
    
    // Configure player on main thread after graph is set up
    DispatchQueue.main.async {
      guard let player = self.player else {
        print("[SpeakerModule] initializeSpeakers - ERROR: player is nil after setup")
        return
      }
      
      guard player.engine === engine else {
        print("[SpeakerModule] initializeSpeakers - WARNING: player.engine is not the expected engine, skipping play() (first init)")
        return
      }
      
      // Ensure engine is running
      do {
        try SharedAudioEngine.shared.startEngineIfNeeded()
        
        print("[SpeakerModule] initializeSpeakers - starting player node (first init)")
        if !player.isPlaying {
          player.play()
        }
        self.speakersInitialized = true
      } catch {
        print("[SpeakerModule] initializeSpeakers - failed to start engine (first init): \(error.localizedDescription)")
      }
    }
  }

  func playSpeakersBatch(input: AudioSamplesInput) {
    guard let format = format, let player = player else { 
      print("[SpeakerModule] playSpeakersBatch - format or player is nil")
      return 
    }

    let frameCount = AVAudioFrameCount(input.samples.count / channels)
    guard frameCount > 0 else { return }
    
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount) else {
      print("[SpeakerModule] playSpeakersBatch - failed to create buffer")
      return
    }
    buffer.frameLength = frameCount

    let dst = buffer.floatChannelData![0]
    input.samples.withUnsafeBufferPointer { src in
      dst.initialize(from: src.baseAddress!, count: min(src.count, Int(frameCount) * channels))
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
    speakersInitialized = false
    queue.async {
      self.scheduledFrameCount = 0
    }
    // Release speakers reference (engine will stop if microphone also inactive)
    SharedAudioEngine.shared.releaseSpeakers()
    // Only deactivate audio session if both modules are inactive
    SharedAudioEngine.shared.deactivateAudioSessionIfNeeded()
  }
}

// Wrapper functions for speakers
func initializeSpeakers(input: AudioInitInput) throws {
  try SpeakerModule.shared.initializeSpeakers(
    sampleRate: input.sampleRate,
    channelCount: input.channelCount ?? 1
  )
}

func playSpeakersBatch(input: AudioSamplesInput) {
  SpeakerModule.shared.playSpeakersBatch(input: input)
}

func stopSpeakers() {
  SpeakerModule.shared.stopSpeakers()
}

func getCurrentSpeakerBufferLength() -> Int {
  return SpeakerModule.shared.getCurrentSpeakerBufferLength()
}

