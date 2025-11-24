import Foundation
import ExpoModulesCore
import AVFoundation

enum AudioError: Error {
    case engineNotInitialized
    case invalidSampleRate
    case invalidChannelCount
}

struct AudioInitInput: Record {
    @Field var sampleRate: Double
    @Field var channelCount: Int?
}

struct AudioSamplesInput: Record {
    @Field var samples: [Float]
}

class AudioEngineManager {
    static let shared = AudioEngineManager()
    
    private var engine: AVAudioEngine?
    private var sourceNode: AVAudioSourceNode?
    private var audioFormat: AVAudioFormat?
    private var channelCount: Int = 1
    
    // Shared buffer - samples are appended here, render callback reads from here
    private var sampleBuffer: [Float] = []
    private let bufferQueue = DispatchQueue(label: "com.sensorlib.audio.buffer", attributes: .concurrent)
    
    private init() {}
    
    func initialize(sampleRate: Double, channelCount: Int = 1) throws {
        guard sampleRate > 0 && sampleRate <= 192000 else {
            throw AudioError.invalidSampleRate
        }
        
        guard channelCount >= 1 && channelCount <= 2 else {
            throw AudioError.invalidChannelCount
        }
        
        // Clean up existing engine
        if let engine = engine {
            engine.stop()
        }
        
        bufferQueue.sync(flags: .barrier) {
            self.channelCount = channelCount
            self.sampleBuffer = []
        }
        
        // Create audio format
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: AVAudioChannelCount(channelCount)) else {
            throw AudioError.invalidSampleRate
        }
        
        bufferQueue.sync(flags: .barrier) {
            self.audioFormat = format
        }
        
        // Create engine and source node
        let newEngine = AVAudioEngine()
        let channelCountCapture = channelCount
        let newSourceNode = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            
            let bufferList = UnsafeMutableAudioBufferListPointer(audioBufferList)
            let framesRequested = Int(frameCount)
            let samplesPerFrame = channelCountCapture
            let samplesNeeded = framesRequested * samplesPerFrame
            
            // Read samples from buffer
            let toRead = self.bufferQueue.sync {
                let available = self.sampleBuffer.count
                let count = min(samplesNeeded, available)
                
                if count > 0 {
                    if channelCountCapture == 1 {
                        // Mono - direct copy
                        if let channelData = bufferList[0].mData {
                            let output = channelData.assumingMemoryBound(to: Float.self)
                            self.sampleBuffer[0..<count].withUnsafeBufferPointer { source in
                                output.initialize(from: source.baseAddress!, count: count)
                            }
                        }
                    } else {
                        // Stereo - deinterleave
                        if let leftData = bufferList[0].mData, let rightData = bufferList[1].mData {
                            let leftOutput = leftData.assumingMemoryBound(to: Float.self)
                            let rightOutput = rightData.assumingMemoryBound(to: Float.self)
                            let framesRead = count / 2
                            
                            for i in 0..<framesRead {
                                leftOutput[i] = self.sampleBuffer[i * 2]
                                rightOutput[i] = self.sampleBuffer[i * 2 + 1]
                            }
                        }
                    }
                    
                    // Remove consumed samples
                    self.sampleBuffer.removeFirst(count)
                }
                
                return count
            }
            
            // Zero out remaining frames if buffer underrun
            if toRead < samplesNeeded {
                let remaining = samplesNeeded - toRead
                if channelCountCapture == 1 {
                    if let channelData = bufferList[0].mData {
                        let output = channelData.assumingMemoryBound(to: Float.self)
                        output.advanced(by: toRead).initialize(repeating: 0, count: remaining)
                    }
                } else {
                    if let leftData = bufferList[0].mData, let rightData = bufferList[1].mData {
                        let leftOutput = leftData.assumingMemoryBound(to: Float.self)
                        let rightOutput = rightData.assumingMemoryBound(to: Float.self)
                        let framesRemaining = remaining / 2
                        leftOutput.advanced(by: toRead / 2).initialize(repeating: 0, count: framesRemaining)
                        rightOutput.advanced(by: toRead / 2).initialize(repeating: 0, count: framesRemaining)
                    }
                }
            }
            
            return noErr
        }
        
        newEngine.attach(newSourceNode)
        newEngine.connect(newSourceNode, to: newEngine.mainMixerNode, format: format)
        
        try newEngine.start()
        
        bufferQueue.sync(flags: .barrier) {
            self.engine = newEngine
            self.sourceNode = newSourceNode
        }
    }
    
    func playSamplesBatch(_ samples: [Float]) {
        bufferQueue.async(flags: .barrier) {
            self.sampleBuffer.append(contentsOf: samples)
        }
    }
    
    func getCurrentBufferLength() -> Int {
        return bufferQueue.sync {
            return sampleBuffer.count
        }
    }
    
    func stop() {
        bufferQueue.sync(flags: .barrier) {
            engine?.stop()
            sampleBuffer = []
        }
    }
}

// Initialize audio engine
func initializeAudio(input: AudioInitInput) throws {
    let sampleRate = input.sampleRate
    let channelCount = input.channelCount ?? 1
    try AudioEngineManager.shared.initialize(sampleRate: sampleRate, channelCount: channelCount)
}

// Play samples batch
func playSamplesBatch(input: AudioSamplesInput) {
    AudioEngineManager.shared.playSamplesBatch(input.samples)
}

// Get current buffer length
func getCurrentBufferLength() -> Int {
    return AudioEngineManager.shared.getCurrentBufferLength()
}

// Stop audio playback
func stopAudio() {
    AudioEngineManager.shared.stop()
}
