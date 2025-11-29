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

  // Track whether speakers have already been configured so we don't
  // tear down and rebuild the graph unnecessarily.
  private var speakersInitialized: Bool = false

  private init() {}

  func initializeSpeakers(sampleRate: Double, channelCount: Int) throws {
    print("[AudioModule] initializeSpeakers called - sampleRate=\(sampleRate), channelCount=\(channelCount)")
    // Check if microphone is active
    let microphoneActive = inputNode != nil
    
    print("[AudioModule] initializeSpeakers - microphoneActive=\(microphoneActive)")

    self.sampleRate = sampleRate
    self.channels = channelCount

    // Configure audio session (do not tear down existing engine/graph)
    let audioSession = AVAudioSession.sharedInstance()
    print("[AudioModule] initializeSpeakers - configuring AVAudioSession (microphoneActive=\(microphoneActive))")
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

    // If speakers are already initialized and we have a running engine and player,
    // just make sure the engine is running and return. This avoids tearing down
    // the graph when starting microphone relay.
    if speakersInitialized, let existingEngine = engine, let existingPlayer = player {
      print("[AudioModule] initializeSpeakers - reusing existing speakers configuration")
      DispatchQueue.main.async {
        do {
          if !existingEngine.isRunning {
            print("[AudioModule] initializeSpeakers - restarting existing AVAudioEngine")
            try existingEngine.start()
          } else {
            print("[AudioModule] initializeSpeakers - existing engine already running")
          }
          
          guard existingPlayer.engine === existingEngine else {
            print("[AudioModule] initializeSpeakers - WARNING: existing player.engine mismatch, not calling play()")
            return
          }
          
          print("[AudioModule] initializeSpeakers - ensuring player is playing")
          if !existingPlayer.isPlaying {
            existingPlayer.play()
          }
        } catch {
          print("[AudioModule] initializeSpeakers - failed to restart existing engine: \(error.localizedDescription)")
        }
      }
      return
    }

    // First-time speaker initialization: create engine / player graph.
    if engine == nil {
      print("[AudioModule] initializeSpeakers - creating AVAudioEngine")
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
      let player = AVAudioPlayerNode()
      print("[AudioModule] initializeSpeakers - creating AVAudioPlayerNode on main thread (first init)")
      
      self.player = player
      self.format = format
      
      engine.attach(player)
      engine.connect(player, to: engine.mainMixerNode, format: format)
      print("[AudioModule] initializeSpeakers - attached and connected player node (first init)")
      
      do {
        if !engine.isRunning {
          print("[AudioModule] initializeSpeakers - starting AVAudioEngine on main thread (first init)")
          try engine.start()
        } else {
          print("[AudioModule] initializeSpeakers - engine already running (main thread, first init)")
        }
        
        guard player.engine === engine else {
          print("[AudioModule] initializeSpeakers - WARNING: player.engine is not the expected engine, skipping play() (first init)")
          return
        }
        
        print("[AudioModule] initializeSpeakers - starting player node on main thread (first init)")
        player.play()
        self.speakersInitialized = true
      } catch {
        print("[AudioModule] initializeSpeakers - failed to start engine (first init): \(error.localizedDescription)")
      }
    }
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
    speakersInitialized = false
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
    print("[AudioModule] initializeMicrophone called - sampleRate=\(sampleRate), channelCount=\(channelCount), onMainThread=\(Thread.isMainThread)")
    // Check if speakers are active before stopping microphone
    let speakersActive = player != nil
    
    print("[AudioModule] initializeMicrophone - speakersActive=\(speakersActive)")
    stopListening()

    self.sampleRate = sampleRate
    self.channels = channelCount

    // Request microphone permission first
    let audioSession = AVAudioSession.sharedInstance()
    
    // Check current permission status
    let currentStatus = audioSession.recordPermission
    print("[AudioModule] initializeMicrophone - current recordPermission status=\(currentStatus.rawValue)")
    
    // If already denied, fail fast with a clear error
    if currentStatus == .denied {
      print("[AudioModule] initializeMicrophone - permission previously denied")
      throw NSError(
        domain: "AudioModule",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Microphone permission has been denied in Settings"]
      )
    }
    
    // If not already granted, request permission.
    // IMPORTANT: Don't block the main thread while waiting.
    if currentStatus != .granted {
      if Thread.isMainThread {
        print("[AudioModule] initializeMicrophone - WARNING: on main thread, requesting permission without blocking")
        audioSession.requestRecordPermission { granted in
          print("[AudioModule] initializeMicrophone - requestRecordPermission callback (main-thread path), granted=\(granted)")
        }
        throw NSError(
          domain: "AudioModule",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Microphone permission request in progress; please retry after the user responds"]
        )
      } else {
        print("[AudioModule] initializeMicrophone - requesting permission on main queue and waiting (background thread)")
        let semaphore = DispatchSemaphore(value: 0)
        var permissionGranted = false
        
        DispatchQueue.main.async {
          audioSession.requestRecordPermission { granted in
            print("[AudioModule] initializeMicrophone - requestRecordPermission callback, granted=\(granted)")
            permissionGranted = granted
            semaphore.signal()
          }
        }
        
        // Wait for permission response (with timeout)
        let timeout = semaphore.wait(timeout: .now() + 10.0)
        if timeout == .timedOut || !permissionGranted {
          print("[AudioModule] initializeMicrophone - permission denied or request timed out (timeout=\(timeout == .timedOut))")
          throw NSError(
            domain: "AudioModule",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied or request timed out"]
          )
        }
      }
    } else {
      print("[AudioModule] initializeMicrophone - permission already granted")
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
      print("[AudioModule] initializeMicrophone - AVAudioSession configured successfully (speakersActive=\(speakersActive))")
    } catch {
      // Fallback: try to activate (might already be configured)
      print("[AudioModule] initializeMicrophone - AVAudioSession primary configuration failed: \(error.localizedDescription)")
      try? audioSession.setActive(true)
      print("[AudioModule] initializeMicrophone - AVAudioSession fallback activation attempted")
    }

    // Use existing engine or create new one
    if engine == nil {
      print("[AudioModule] initializeMicrophone - creating AVAudioEngine")
      engine = AVAudioEngine()
    }
    guard let engine = engine else { return }
    
    let inputNode = engine.inputNode
    self.inputNode = inputNode
    
    // IMPORTANT: For installTap, the format must match the node's output format (or be nil).
    // Using a mismatched format will cause an abort with "Failed to create tap due to format mismatch".
    let inputFormat = inputNode.outputFormat(forBus: 0)
    print("[AudioModule] initializeMicrophone - inputNode.outputFormat: sampleRate=\(inputFormat.sampleRate), channels=\(inputFormat.channelCount), commonFormat=\(inputFormat.commonFormat.rawValue), interleaved=\(inputFormat.isInterleaved)")
    
    // Store the actual input format we are tapping from
    self.format = inputFormat
    
    // Clear microphone samples buffer
    queue.async {
      self.microphoneSamples.removeAll()
    }

    // Install tap on input node to capture audio
    let bufferSize: AVAudioFrameCount = 4096
    print("[AudioModule] initializeMicrophone - installing tap with bufferSize=\(bufferSize) using inputNode.outputFormat")
    inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] (buffer, time) in
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
      print("[AudioModule] initializeMicrophone - starting AVAudioEngine")
      try engine.start()
    } else {
      print("[AudioModule] initializeMicrophone - engine already running")
    }
    print("[AudioModule] initializeMicrophone - completed successfully")
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