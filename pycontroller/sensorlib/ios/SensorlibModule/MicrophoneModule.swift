import Foundation
import AVFoundation
import ExpoModulesCore

final class MicrophoneModule {
  static let shared = MicrophoneModule()
  
  private var engine: AVAudioEngine?
  private var inputNode: AVAudioInputNode?
  private var isRecording = false
  private let queue = DispatchQueue(label: "com.audiolab.microphone")
  
  // Audio format matching AudioModule
  private let sampleRate: Double = 44100
  private let channels: Int = 1
  
  private init() {}
  
  func startRecording(onSampleBuffer: @escaping ([Float]) -> Void) throws {
    // Stop any existing recording
    stopRecording()
    
    // Configure audio session for recording and playback
    let audioSession = AVAudioSession.sharedInstance()
    do {
      try? audioSession.setActive(false)
      // Use .playAndRecord category to allow both input and output
      try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetooth])
      try audioSession.setActive(true)
    } catch {
      // Fallback
      do {
        try audioSession.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
        try audioSession.setActive(true)
      } catch {
        try? audioSession.setActive(true)
      }
    }
    
    let engine = AVAudioEngine()
    let inputNode = engine.inputNode
    
    // Get the input format
    let inputFormat = inputNode.inputFormat(forBus: 0)
    
    // Create a format converter if needed to match our target format
    guard let targetFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: sampleRate,
      channels: AVAudioChannelCount(channels),
      interleaved: false
    ) else {
      throw NSError(domain: "MicrophoneModule", code: 1, userInfo: [NSLocalizedDescriptionKey: "Failed to create target audio format"])
    }
    
    // Install tap on input node
    let bufferSize: AVAudioFrameCount = 1024 // Match AudioModule batch size
    
    inputNode.installTap(onBus: 0, bufferSize: bufferSize, format: inputFormat) { [weak self] (buffer, time) in
      guard let self = self, self.isRecording else { return }
      
      // If formats match, use directly
      if inputFormat.sampleRate == targetFormat.sampleRate && 
         inputFormat.channelCount == targetFormat.channelCount &&
         inputFormat.commonFormat == targetFormat.commonFormat {
        guard let channelData = buffer.floatChannelData else { return }
        let samples = Array(UnsafeBufferPointer(start: channelData[0], count: Int(buffer.frameLength)))
        onSampleBuffer(samples)
        return
      }
      
      // Otherwise, convert format
      guard let converter = AVAudioConverter(from: inputFormat, to: targetFormat) else {
        print("Failed to create audio converter")
        return
      }
      
      let capacity = AVAudioFrameCount(Double(buffer.frameLength) * (targetFormat.sampleRate / inputFormat.sampleRate))
      guard let convertedBuffer = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity) else {
        return
      }
      
      var error: NSError?
      let inputBlock: AVAudioConverterInputBlock = { _, outStatus in
        outStatus.pointee = .haveData
        return buffer
      }
      
      let status = converter.convert(to: convertedBuffer, error: &error, withInputFrom: inputBlock)
      
      if status == .error {
        print("Audio conversion error: \(error?.localizedDescription ?? "unknown")")
        return
      }
      
      // Extract samples from converted buffer
      guard let channelData = convertedBuffer.floatChannelData else { return }
      let samples = Array(UnsafeBufferPointer(start: channelData[0], count: Int(convertedBuffer.frameLength)))
      
      // Call the callback with samples
      onSampleBuffer(samples)
    }
    
    self.engine = engine
    self.inputNode = inputNode
    self.isRecording = true
    
    // Start the engine
    do {
      try engine.start()
    } catch {
      throw error
    }
  }
  
  func stopRecording() {
    isRecording = false
    inputNode?.removeTap(onBus: 0)
    engine?.stop()
    engine?.reset()
    engine = nil
    inputNode = nil
    
    // Deactivate audio session
    do {
      try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    } catch {
      // Ignore errors when deactivating
    }
  }
}

// Audio relay functions - streams microphone input to speakers
func playAudioRelay() throws {
  // Initialize audio for playback
  try AudioModule.shared.initialize(
    sampleRate: 44100,
    channelCount: 1
  )
  
  // Start microphone recording and relay to speakers
  try MicrophoneModule.shared.startRecording { samples in
    // Send samples to audio output chunk by chunk
    playSamplesBatch(samples: samples)
  }
}

func stopAudioRelay() {
  MicrophoneModule.shared.stopRecording()
  AudioModule.shared.stopAudio()
}
