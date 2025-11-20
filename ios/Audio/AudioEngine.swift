import Foundation
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
