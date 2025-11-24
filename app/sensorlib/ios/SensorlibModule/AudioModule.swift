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
    
    // Simple buffer - append writes, removeFirst reads (cleanup when large)
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
        
        if let engine = engine {
            engine.stop()
        }
        
        bufferQueue.sync(flags: .barrier) {
            self.channelCount = channelCount
            self.sampleBuffer = []
        }
        
        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: AVAudioChannelCount(channelCount)) else {
            throw AudioError.invalidSampleRate
        }
        
        bufferQueue.sync(flags: .barrier) {
            self.audioFormat = format
        }
        
        let newEngine = AVAudioEngine()
        let channelCountCapture = channelCount
        let newSourceNode = AVAudioSourceNode { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
            guard let self = self else { return noErr }
            
            let bufferList = UnsafeMutableAudioBufferListPointer(audioBufferList)
            let framesRequested = Int(frameCount)
            let samplesNeeded = framesRequested * channelCountCapture
            
            let count = self.bufferQueue.sync {
                let available = self.sampleBuffer.count
                let toRead = min(samplesNeeded, available)
                
                if toRead > 0 {
                    if channelCountCapture == 1, let channelData = bufferList[0].mData {
                        let output = channelData.assumingMemoryBound(to: Float.self)
                        self.sampleBuffer.withUnsafeBufferPointer {
                            output.initialize(from: $0.baseAddress!, count: toRead)
                        }
                    } else if let leftData = bufferList[0].mData, let rightData = bufferList[1].mData {
                        let leftOutput = leftData.assumingMemoryBound(to: Float.self)
                        let rightOutput = rightData.assumingMemoryBound(to: Float.self)
                        let framesRead = toRead / 2
                        self.sampleBuffer.withUnsafeBufferPointer { source in
                            for i in 0..<framesRead {
                                leftOutput[i] = source[i * 2]
                                rightOutput[i] = source[i * 2 + 1]
                            }
                        }
                    }
                    
                    self.sampleBuffer.removeFirst(toRead)
                    
                    // Cleanup: if buffer is huge, trim it down
                    if self.sampleBuffer.count > 100000 {
                        self.sampleBuffer.removeFirst(self.sampleBuffer.count - 50000)
                    }
                }
                
                return toRead
            }
            
            // Zero out remaining if underrun
            if count < samplesNeeded {
                let remaining = samplesNeeded - count
                if channelCountCapture == 1, let channelData = bufferList[0].mData {
                    channelData.assumingMemoryBound(to: Float.self).advanced(by: count).initialize(repeating: 0, count: remaining)
                } else if let leftData = bufferList[0].mData, let rightData = bufferList[1].mData {
                    let framesRemaining = remaining / 2
                    leftData.assumingMemoryBound(to: Float.self).advanced(by: count / 2).initialize(repeating: 0, count: framesRemaining)
                    rightData.assumingMemoryBound(to: Float.self).advanced(by: count / 2).initialize(repeating: 0, count: framesRemaining)
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
        return bufferQueue.sync { sampleBuffer.count }
    }
    
    func stop() {
        bufferQueue.sync(flags: .barrier) {
            sampleBuffer = []
        }
    }
    
    func stopEngine() {
        bufferQueue.sync(flags: .barrier) {
            engine?.stop()
            sampleBuffer = []
            engine = nil
            sourceNode = nil
        }
    }
}

func initializeAudio(input: AudioInitInput) throws {
    try AudioEngineManager.shared.initialize(sampleRate: input.sampleRate, channelCount: input.channelCount ?? 1)
}

func playSamplesBatch(input: AudioSamplesInput) {
    AudioEngineManager.shared.playSamplesBatch(input.samples)
}

func getCurrentBufferLength() -> Int {
    return AudioEngineManager.shared.getCurrentBufferLength()
}

func stopAudio() {
    AudioEngineManager.shared.stop()
}

func stopAudioEngine() {
    AudioEngineManager.shared.stopEngine()
}
