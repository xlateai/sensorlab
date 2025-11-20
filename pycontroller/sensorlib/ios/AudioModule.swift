import ExpoModulesCore

public class AudioEngineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioEngine")

    AsyncFunction("pushSamples") { (samples: [Double]) in
      let floatSamples = samples.map { Float($0) }
      AudioEngine.shared.pushSamples(floatSamples)
    }

    AsyncFunction("getBufferedSamples") { () -> Int in
      return AudioEngine.shared.getBufferedSamples()
    }
  }
}

// MARK: - AudioEngine Singleton
import AVFoundation

class AudioEngine {
    static let shared = AudioEngine()
    let ringBuffer = FloatRingBuffer(capacity: 48000 * 2) // ~2 seconds at 48kHz
    private let engine = AVAudioEngine()
    private let playerNode = AVAudioPlayerNode()
    private let sampleRate: Double = 48000
    private let bufferSize: AVAudioFrameCount = 1024
    private var isPlaying = false

    private init() {
        setupAudio()
    }

    private func setupAudio() {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        engine.attach(playerNode)
        engine.connect(playerNode, to: engine.mainMixerNode, format: format)
        try? engine.start()
        playerNode.play()
        isPlaying = true
        scheduleBuffers()
    }

    private func scheduleBuffers() {
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        func scheduleNext() {
            guard isPlaying else { return }
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: bufferSize)!
            let frames = ringBuffer.read(count: Int(bufferSize))
            if frames.count < Int(bufferSize) {
                // underrun: fill with silence
                for i in frames.count..<Int(bufferSize) {
                    buffer.floatChannelData!.pointee[i] = 0.0
                }
            }
            for i in 0..<frames.count {
                buffer.floatChannelData!.pointee[i] = frames[i]
            }
            buffer.frameLength = bufferSize
            playerNode.scheduleBuffer(buffer, completionHandler: scheduleNext)
        }
        scheduleNext()
    }

    func pushSamples(_ samples: [Float]) {
        ringBuffer.write(samples)
    }

    func getBufferedSamples() -> Int {
        return ringBuffer.count
    }

    func play() {
        if !isPlaying {
            playerNode.play()
            isPlaying = true
            scheduleBuffers()
        }
    }

    func pause() {
        if isPlaying {
            playerNode.pause()
            isPlaying = false
        }
    }
}

// MARK: - Lock-free FloatRingBuffer
class FloatRingBuffer {
    private var buffer: [Float]
    private let capacity: Int
    private var writeIndex: Int = 0
    private var readIndex: Int = 0
    private var count_: Int = 0
    private let lock = DispatchSemaphore(value: 1)

    init(capacity: Int) {
        self.capacity = capacity
        self.buffer = [Float](repeating: 0, count: capacity)
    }

    var count: Int {
        return count_
    }

    func write(_ samples: [Float]) {
        lock.wait()
        defer { lock.signal() }
        for sample in samples {
            if count_ < capacity {
                buffer[writeIndex] = sample
                writeIndex = (writeIndex + 1) % capacity
                count_ += 1
            } else {
                // overflow: drop extra samples
                break
            }
        }
    }

    func read(count: Int) -> [Float] {
        lock.wait()
        defer { lock.signal() }
        var out: [Float] = []
        for _ in 0..<count {
            if count_ > 0 {
                out.append(buffer[readIndex])
                readIndex = (readIndex + 1) % capacity
                count_ -= 1
            } else {
                // underrun: output silence
                out.append(0.0)
            }
        }
        return out
    }
}
