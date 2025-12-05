import Foundation
import AVFoundation

// Shared audio engine manager for both microphone and speaker modules
final class SharedAudioEngine {
  static let shared = SharedAudioEngine()
  
  private var engine: AVAudioEngine?
  private let lock = NSLock()
  private var microphoneRefCount = 0
  private var speakersRefCount = 0
  
  private init() {}
  
  func getOrCreateEngine() -> AVAudioEngine {
    lock.lock()
    defer { lock.unlock() }
    
    if engine == nil {
      engine = AVAudioEngine()
      print("[SharedAudioEngine] Created new AVAudioEngine")
    }
    return engine!
  }
  
  func acquireMicrophone() {
    lock.lock()
    defer { lock.unlock() }
    
    microphoneRefCount += 1
    print("[SharedAudioEngine] Microphone acquired (refCount: \(microphoneRefCount))")
    
    if engine == nil {
      engine = AVAudioEngine()
    }
  }
  
  func startEngineIfNeeded() throws {
    lock.lock()
    defer { lock.unlock() }
    
    guard let engine = engine else {
      throw NSError(domain: "SharedAudioEngine", code: 1, userInfo: [NSLocalizedDescriptionKey: "Engine not created"])
    }
    
    if !engine.isRunning {
      try engine.start()
      print("[SharedAudioEngine] Engine started")
    }
  }
  
  // Safely modify the engine graph by stopping/starting if needed
  func withEngineModification<T>(_ block: (AVAudioEngine) throws -> T) rethrows -> T {
    lock.lock()
    defer { lock.unlock() }
    
    guard let engine = engine else {
      fatalError("Engine must exist before modification")
    }
    
    let wasRunning = engine.isRunning
    if wasRunning {
      engine.stop()
      print("[SharedAudioEngine] Engine stopped for graph modification")
    }
    
    defer {
      if wasRunning {
        do {
          try engine.start()
          print("[SharedAudioEngine] Engine restarted after graph modification")
        } catch {
          print("[SharedAudioEngine] Failed to restart engine after modification: \(error.localizedDescription)")
        }
      }
    }
    
    return try block(engine)
  }
  
  func releaseMicrophone() {
    lock.lock()
    defer { lock.unlock() }
    
    microphoneRefCount = max(0, microphoneRefCount - 1)
    print("[SharedAudioEngine] Microphone released (refCount: \(microphoneRefCount))")
    
    if microphoneRefCount == 0 && speakersRefCount == 0 {
      if let engine = engine, engine.isRunning {
        engine.stop()
        engine.reset()
        print("[SharedAudioEngine] Engine stopped (no active modules)")
      }
    }
  }
  
  func acquireSpeakers() {
    lock.lock()
    defer { lock.unlock() }
    
    speakersRefCount += 1
    print("[SharedAudioEngine] Speakers acquired (refCount: \(speakersRefCount))")
    
    if engine == nil {
      engine = AVAudioEngine()
    }
  }
  
  func releaseSpeakers() {
    lock.lock()
    defer { lock.unlock() }
    
    speakersRefCount = max(0, speakersRefCount - 1)
    print("[SharedAudioEngine] Speakers released (refCount: \(speakersRefCount))")
    
    if microphoneRefCount == 0 && speakersRefCount == 0 {
      if let engine = engine, engine.isRunning {
        engine.stop()
        engine.reset()
        print("[SharedAudioEngine] Engine stopped (no active modules)")
      }
    }
  }
  
  func configureAudioSession() throws {
    let audioSession = AVAudioSession.sharedInstance()
    
    // Try to deactivate first to ensure clean state
    try? audioSession.setActive(false)
    
    // Set category for both recording and playback
    try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
    try audioSession.setActive(true)
    print("[SharedAudioEngine] Audio session configured for playAndRecord")
  }
  
  func deactivateAudioSessionIfNeeded() {
    lock.lock()
    defer { lock.unlock() }
    
    // Only deactivate if both modules are inactive
    if microphoneRefCount == 0 && speakersRefCount == 0 {
      do {
        try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        print("[SharedAudioEngine] Audio session deactivated")
      } catch {
        // Ignore errors when deactivating
      }
    }
  }
}

