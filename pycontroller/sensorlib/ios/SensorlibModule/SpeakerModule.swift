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
  
  private var engine: AVAudioEngine?
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

    // Configure audio session for playback
    let audioSession = AVAudioSession.sharedInstance()
    print("[SpeakerModule] initializeSpeakers - configuring AVAudioSession")
    do {
      // Try to deactivate first to ensure clean state
      try? audioSession.setActive(false)
      
      // Set category with defaultToSpeaker option to route to built-in speakers
      // Use playAndRecord to allow potential simultaneous microphone usage
      try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
      try audioSession.setActive(true)
    } catch {
      // Fallback: try without options if it fails
      do {
        try audioSession.setCategory(.playAndRecord, mode: .default)
        try audioSession.setActive(true)
      } catch {
        // If that also fails, just try to activate (might already be configured)
        try? audioSession.setActive(true)
      }
    }

    // If speakers are already initialized and we have a running engine and player,
    // just make sure the engine is running and return.
    if speakersInitialized, let existingEngine = engine, let existingPlayer = player {
      print("[SpeakerModule] initializeSpeakers - reusing existing speakers configuration")
      DispatchQueue.main.async {
        do {
          if !existingEngine.isRunning {
            print("[SpeakerModule] initializeSpeakers - restarting existing AVAudioEngine")
            try existingEngine.start()
          } else {
            print("[SpeakerModule] initializeSpeakers - existing engine already running")
          }
          
          guard existingPlayer.engine === existingEngine else {
            print("[SpeakerModule] initializeSpeakers - WARNING: existing player.engine mismatch, not calling play()")
            return
          }
          
          print("[SpeakerModule] initializeSpeakers - ensuring player is playing")
          if !existingPlayer.isPlaying {
            existingPlayer.play()
          }
        } catch {
          print("[SpeakerModule] initializeSpeakers - failed to restart existing engine: \(error.localizedDescription)")
        }
      }
      return
    }

    // First-time speaker initialization: create dedicated engine / player graph.
    if engine == nil {
      print("[SpeakerModule] initializeSpeakers - creating dedicated AVAudioEngine for speakers")
      engine = AVAudioEngine()
    }
    guard let engine = engine else { return }
    
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
    
    // Configure player and engine graph on the main thread to avoid race conditions
    DispatchQueue.main.async {
      // Check if player already exists (shouldn't happen, but be safe)
      if self.player == nil {
        let player = AVAudioPlayerNode()
        print("[SpeakerModule] initializeSpeakers - creating AVAudioPlayerNode on main thread (first init)")
        
        self.player = player
        self.format = format
        
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        print("[SpeakerModule] initializeSpeakers - attached and connected player node (first init)")
      } else {
        print("[SpeakerModule] initializeSpeakers - player already exists, updating format only")
        self.format = format
      }
      
      guard let player = self.player else {
        print("[SpeakerModule] initializeSpeakers - ERROR: player is nil after setup")
        return
      }
      
      do {
        if !engine.isRunning {
          print("[SpeakerModule] initializeSpeakers - starting AVAudioEngine on main thread (first init)")
          try engine.start()
        } else {
          print("[SpeakerModule] initializeSpeakers - engine already running (main thread, first init)")
        }
        
        guard player.engine === engine else {
          print("[SpeakerModule] initializeSpeakers - WARNING: player.engine is not the expected engine, skipping play() (first init)")
          return
        }
        
        print("[SpeakerModule] initializeSpeakers - starting player node on main thread (first init)")
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
    // Stop and reset engine
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

