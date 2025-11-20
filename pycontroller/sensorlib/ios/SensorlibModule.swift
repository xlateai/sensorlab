
import CoreHaptics
import CoreHaptics
import ExpoModulesCore
import AVFoundation

// Error type for haptics
enum HapticError: Error {
  case missingDuration
  case unknownType(String)
}

public class SensorlibModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('Sensorlib')` in JavaScript.
    Name("Sensorlib")

    // Defines constant property on the module.
    Constant("PI") {
      Double.pi
    }

    // Defines event names that the module can send to JavaScript.
    Events("onChange")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      return "Hello world! 👋"
    }


    // Unified haptics play function
    AsyncFunction("playHaptic") { (input: HapticPatternInput) in
      let engine = try HapticsEngineManager.shared.getEngine()
      var events: [CHHapticEvent] = []
      var curves: [CHHapticParameterCurve] = []
      let intensity = input.intensity ?? 1.0
      let sharpness = input.sharpness ?? 0.5
      switch input.type {
      case "transient":
        let event = CHHapticEvent(eventType: .hapticTransient,
                                 parameters: [
                                    CHHapticEventParameter(parameterID: .hapticIntensity, value: Float(intensity)),
                                    CHHapticEventParameter(parameterID: .hapticSharpness, value: Float(sharpness))
                                 ],
                                 relativeTime: 0)
        events.append(event)
      case "continuous":
        guard let duration = input.duration else {
          throw HapticError.missingDuration
        }
        let event = CHHapticEvent(eventType: .hapticContinuous,
                                 parameters: [
                                    CHHapticEventParameter(parameterID: .hapticIntensity, value: Float(intensity)),
                                    CHHapticEventParameter(parameterID: .hapticSharpness, value: Float(sharpness))
                                 ],
                                 relativeTime: 0,
                                 duration: duration)
        events.append(event)
        if let curvePoints = input.curve {
          var intensityCurvePoints: [CHHapticParameterCurve.ControlPoint] = []
          var sharpnessCurvePoints: [CHHapticParameterCurve.ControlPoint] = []
          for point in curvePoints {
            if let i = point.intensity {
              intensityCurvePoints.append(.init(relativeTime: point.time, value: Float(i)))
            }
            if let s = point.sharpness {
              sharpnessCurvePoints.append(.init(relativeTime: point.time, value: Float(s)))
            }
          }
          if !intensityCurvePoints.isEmpty {
            curves.append(CHHapticParameterCurve(parameterID: .hapticIntensityControl, controlPoints: intensityCurvePoints, relativeTime: 0))
          }
          if !sharpnessCurvePoints.isEmpty {
            curves.append(CHHapticParameterCurve(parameterID: .hapticSharpnessControl, controlPoints: sharpnessCurvePoints, relativeTime: 0))
          }
        }
      default:
        throw HapticError.unknownType(input.type)
      }
      let pattern = try CHHapticPattern(events: events, parameterCurves: curves)
      let player = try engine.makePlayer(with: pattern)
      try player.start(atTime: 0)
    }

    // Expose audio engine methods
    AsyncFunction("pushAudioSamples") { (samples: [Double]) in
      let floatSamples = samples.map { Float($0) }
      AudioEngine.shared.pushSamples(floatSamples)
    }

    AsyncFunction("getAudioBufferedSamples") { () -> Int in
      return AudioEngine.shared.getBufferedSamples()
    }

    // Enables the module to be used as a native view. Definition components that are accepted as part of the
    // view definition: Prop, Events.
    View(SensorlibView.self) {
      // Defines a setter for the `url` prop.
      Prop("url") { (view: SensorlibView, url: URL) in
        if view.webView.url != url {
          view.webView.load(URLRequest(url: url))
        }
      }
      Events("onLoad")
    }
  }
}

// MARK: - AudioEngine Singleton
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
