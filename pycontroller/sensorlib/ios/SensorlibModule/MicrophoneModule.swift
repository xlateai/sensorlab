import Foundation
import ExpoModulesCore
import AVFoundation

final class MicrophoneModule {
  static let shared = MicrophoneModule()
  
  private var inputNode: AVAudioInputNode?
  
  private var inputFormat: AVAudioFormat?
  
  // Track microphone samples buffer
  private var microphoneSamples: [Float] = []
  private let queue = DispatchQueue(label: "com.audiolab.microphone.buffer")

  private init() {}

  func initializeMicrophone(sampleRate: Double, channelCount: Int) throws {
    print("[MicrophoneModule] initializeMicrophone called - sampleRate=\(sampleRate), channelCount=\(channelCount), onMainThread=\(Thread.isMainThread)")
    
    stopListening()

    // Request microphone permission first
    let audioSession = AVAudioSession.sharedInstance()
    
    // Check current permission status
    let currentStatus = audioSession.recordPermission
    print("[MicrophoneModule] initializeMicrophone - current recordPermission status=\(currentStatus.rawValue)")
    
    // If already denied, fail fast with a clear error
    if currentStatus == .denied {
      print("[MicrophoneModule] initializeMicrophone - permission previously denied")
      throw NSError(
        domain: "MicrophoneModule",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Microphone permission has been denied in Settings"]
      )
    }
    
    // If not already granted, request permission.
    // IMPORTANT: Don't block the main thread while waiting.
    if currentStatus != .granted {
      if Thread.isMainThread {
        print("[MicrophoneModule] initializeMicrophone - WARNING: on main thread, requesting permission without blocking")
        audioSession.requestRecordPermission { granted in
          print("[MicrophoneModule] initializeMicrophone - requestRecordPermission callback (main-thread path), granted=\(granted)")
        }
        throw NSError(
          domain: "MicrophoneModule",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "Microphone permission request in progress; please retry after the user responds"]
        )
      } else {
        print("[MicrophoneModule] initializeMicrophone - requesting permission on main queue and waiting (background thread)")
        let semaphore = DispatchSemaphore(value: 0)
        var permissionGranted = false
        
        DispatchQueue.main.async {
          audioSession.requestRecordPermission { granted in
            print("[MicrophoneModule] initializeMicrophone - requestRecordPermission callback, granted=\(granted)")
            permissionGranted = granted
            semaphore.signal()
          }
        }
        
        // Wait for permission response (with timeout)
        let timeout = semaphore.wait(timeout: .now() + 10.0)
        if timeout == .timedOut || !permissionGranted {
          print("[MicrophoneModule] initializeMicrophone - permission denied or request timed out (timeout=\(timeout == .timedOut))")
          throw NSError(
            domain: "MicrophoneModule",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Microphone permission denied or request timed out"]
          )
        }
      }
    } else {
      print("[MicrophoneModule] initializeMicrophone - permission already granted")
    }

    // Configure audio session for recording (shared with speakers)
    do {
      try SharedAudioEngine.shared.configureAudioSession()
    } catch {
      // Fallback: try without options if it fails
      print("[MicrophoneModule] initializeMicrophone - AVAudioSession primary configuration failed: \(error.localizedDescription)")
      do {
        let audioSession = AVAudioSession.sharedInstance()
        try? audioSession.setActive(false)
        try audioSession.setCategory(.playAndRecord, mode: .default)
        try audioSession.setActive(true)
      } catch {
        // If that also fails, just try to activate (might already be configured)
        try? AVAudioSession.sharedInstance().setActive(true)
      }
      print("[MicrophoneModule] initializeMicrophone - AVAudioSession fallback activation attempted")
    }

    // Use shared audio engine
    let engine = SharedAudioEngine.shared.getOrCreateEngine()
    SharedAudioEngine.shared.acquireMicrophone()
    
    // Safely modify engine graph (will stop/start if needed)
    try SharedAudioEngine.shared.withEngineModification { engine in
      let inputNode = engine.inputNode
      self.inputNode = inputNode
      
      // IMPORTANT: For installTap, the format must match the node's output format (or be nil).
      // Using a mismatched format will cause an abort with "Failed to create tap due to format mismatch".
      let inputFormat = inputNode.outputFormat(forBus: 0)
      print("[MicrophoneModule] initializeMicrophone - inputNode.outputFormat: sampleRate=\(inputFormat.sampleRate), channels=\(inputFormat.channelCount), commonFormat=\(inputFormat.commonFormat.rawValue), interleaved=\(inputFormat.isInterleaved)")
      
      // Store the actual input format we are tapping from
      self.inputFormat = inputFormat
      
      // Clear microphone samples buffer
      queue.async {
        self.microphoneSamples.removeAll()
      }

      // Install tap on input node to capture audio
      let bufferSize: AVAudioFrameCount = 4096
      print("[MicrophoneModule] initializeMicrophone - installing tap with bufferSize=\(bufferSize) using inputNode.outputFormat")
      
      // Remove any existing tap first (shouldn't be needed, but be safe)
      inputNode.removeTap(onBus: 0)
      
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
    }
    
    // Ensure engine is running
    try SharedAudioEngine.shared.startEngineIfNeeded()
    print("[MicrophoneModule] initializeMicrophone - completed successfully")
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
    inputFormat = nil // Clear input format when stopping
    queue.async {
      self.microphoneSamples.removeAll()
    }
    // Release microphone reference (engine will stop if speakers also inactive)
    SharedAudioEngine.shared.releaseMicrophone()
    // Only deactivate audio session if both modules are inactive
    SharedAudioEngine.shared.deactivateAudioSessionIfNeeded()
  }
}

// Wrapper functions for microphone
func initializeMicrophone(input: AudioInitInput) throws {
  try MicrophoneModule.shared.initializeMicrophone(
    sampleRate: input.sampleRate,
    channelCount: input.channelCount ?? 1
  )
}

func readSamplesBatch() -> [Float] {
  return MicrophoneModule.shared.readSamplesBatch()
}

func stopListening() {
  MicrophoneModule.shared.stopListening()
}

