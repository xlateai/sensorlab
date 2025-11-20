
import CoreHaptics
import CoreHaptics
import ExpoModulesCore
import Foundation
import MetalKit
import CoreMotion
import simd
import UIKit


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

    // Register ConvolutionView as a native view with explicit name
    View(ConvolutionView.self) {
      .name("ConvolutionView")
      // Example: add props/events as needed later
    }
  }
}


// Metal-based convolution view for full-screen RGB grid
public class ConvolutionView: MTKView {
    // Grid dimensions (full screen)
    var gridWidth: Int = 0
    var gridHeight: Int = 0
    var gridChannels: Int = 3 // RGB
    var gridState: [Float] = [] // [R,G,B,R,G,B,...]
    var kernelSize: Int = 3 // 3x3x3
    var kernel: [Float] = [] // [kx,ky,kz,...]
    var deviceMotion: CMMotionManager = CMMotionManager()
    var commandQueue: MTLCommandQueue!
    var pipelineState: MTLComputePipelineState!
    var texture: MTLTexture!
    var initialized: Bool = false

    required init(coder: NSCoder) {
        super.init(coder: coder)
        self.framebufferOnly = false
        self.device = MTLCreateSystemDefaultDevice()
        self.commandQueue = self.device?.makeCommandQueue()
        self.isPaused = false
        self.enableSetNeedsDisplay = false
        self.framebufferOnly = false
        self.setupMetal()
        self.startSensors()
    }

    override init(frame: CGRect, device: MTLDevice?) {
        super.init(frame: frame, device: device)
        self.framebufferOnly = false
        self.device = device ?? MTLCreateSystemDefaultDevice()
        self.commandQueue = self.device?.makeCommandQueue()
        self.isPaused = false
        self.enableSetNeedsDisplay = false
        self.framebufferOnly = false
        self.setupMetal()
        self.startSensors()
    }

    func setupMetal() {
        guard let device = self.device else { return }
        // Set grid size to view size
        gridWidth = Int(self.bounds.width)
        gridHeight = Int(self.bounds.height)
        gridState = (0..<(gridWidth * gridHeight * gridChannels)).map { _ in Float.random(in: 0...1) }
        kernel = (0..<(kernelSize * kernelSize * gridChannels)).map { _ in Float.random(in: -1...1) }
        // Create texture for rendering
        let desc = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: gridWidth, height: gridHeight, mipmapped: false)
        desc.usage = [.shaderWrite, .shaderRead, .renderTarget]
        texture = device.makeTexture(descriptor: desc)
        // Load compute shader
        let library = device.makeDefaultLibrary()
        let function = library?.makeFunction(name: "convolveKernel")
        pipelineState = try? device.makeComputePipelineState(function: function!)
        initialized = true
    }

    func startSensors() {
        // Start magnetometer updates
        if deviceMotion.isMagnetometerAvailable {
            deviceMotion.magnetometerUpdateInterval = 0.03
            deviceMotion.startMagnetometerUpdates(to: OperationQueue.current ?? OperationQueue.main) { [weak self] (data, error) in
                guard let self = self, let mag = data?.magneticField else { return }
                // Use magnetometer data to update kernel
                self.updateKernel(with: mag)
            }
        }
    }

    func updateKernel(with mag: CMMagneticField) {
        // Example: update kernel values with magnetometer
        for i in 0..<kernel.count {
            kernel[i] = Float(mag.x + mag.y + mag.z) * Float.random(in: -1...1)
        }
    }

  public override func draw(_ rect: CGRect) {
        guard initialized, let device = self.device, let commandQueue = self.commandQueue, let pipelineState = self.pipelineState else { return }
        guard let drawable = self.currentDrawable else { return }
        let commandBuffer = commandQueue.makeCommandBuffer()
        let encoder = commandBuffer?.makeComputeCommandEncoder()
        encoder?.setComputePipelineState(pipelineState)
        // Pass grid state and kernel as buffers
        let gridBuffer = device.makeBuffer(bytes: gridState, length: gridState.count * MemoryLayout<Float>.size, options: [])
        let kernelBuffer = device.makeBuffer(bytes: kernel, length: kernel.count * MemoryLayout<Float>.size, options: [])
        encoder?.setBuffer(gridBuffer, offset: 0, index: 0)
        encoder?.setBuffer(kernelBuffer, offset: 0, index: 1)
        encoder?.setTexture(texture, index: 0)
        // Dispatch threads
        let w = pipelineState.threadExecutionWidth
        let h = pipelineState.maxTotalThreadsPerThreadgroup / w
        let threadsPerGroup = MTLSize(width: w, height: h, depth: 1)
        let threadsPerGrid = MTLSize(width: gridWidth, height: gridHeight, depth: 1)
        encoder?.dispatchThreads(threadsPerGrid, threadsPerThreadgroup: threadsPerGroup)
        encoder?.endEncoding()
        commandBuffer?.present(drawable)
        commandBuffer?.commit()
    }
}