import ExpoModulesCore

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

    // Rust core hello function
    Function("rustcoreHello") {
      return rustcoreHello()
    }

    // Rust ML training function
    Function("rustcoreMLTraining") {
      return rustcoreMLTraining()
    }

    // Rust convolution function
    Function("rustcoreConvolution") { (input: String) in
      return rustcoreConvolution(input)
    }

    // Rust stateful convolution functions
    Function("rustcoreConvolutionInit") { (input: String) in
      return rustcoreConvolutionInit(input)
    }

    Function("rustcoreConvolutionStep") { (input: String) in
      return rustcoreConvolutionStep(input)
    }

    Function("rustcoreConvolutionCleanup") { (input: String) in
      return rustcoreConvolutionCleanup(input)
    }

    // Metal convolution functions (routed to Rust MLX backend)
    Function("metalConvolutionInit") { (input: String) in
      return rustcoreMlxConvolutionInit(input)
    }

    Function("metalConvolutionStep") { (input: String) in
      return rustcoreMlxConvolutionStep(input)
    }

    Function("metalConvolutionGetImage") { (input: String) in
      return rustcoreMlxConvolutionGetImage(input)
    }

    Function("metalConvolutionCleanup") { (input: String) in
      return rustcoreMlxConvolutionCleanup(input)
    }

    // Unified haptics play function - delegates to HapticsModule
    AsyncFunction("playHaptic") { (input: HapticPatternInput) in
      try playHaptic(input: input)
    }

    // Speaker functions - delegates to SpeakerModule
    AsyncFunction("initializeSpeakers") { (input: AudioInitInput) in
      try initializeSpeakers(input: input)
    }

    AsyncFunction("playSpeakersBatch") { (input: AudioSamplesInput) in
      playSpeakersBatch(input: input)
    }

    Function("getCurrentSpeakerBufferLength") {
      return getCurrentSpeakerBufferLength()
    }

    AsyncFunction("stopSpeakers") {
      stopSpeakers()
    }

    // Microphone functions - delegates to MicrophoneModule
    AsyncFunction("initializeMicrophone") { (input: AudioInitInput) in
      try initializeMicrophone(input: input)
    }

    Function("readSamplesBatch") {
      return readSamplesBatch()
    }

    AsyncFunction("stopListening") {
      stopListening()
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
    
    // Convolution pixel view for native rendering
    View(ConvolutionPixelView.self) {
      // Context ID for the convolution state
      Prop("contextId") { (view: ConvolutionPixelView, id: UInt64) in
        view.setContextId(id)
      }
      
      // Backend type: "Rust" or "Metal"
      Prop("backend") { (view: ConvolutionPixelView, backend: String) in
        view.setBackend(backend)
      }
      
      // Resolution (square image size)
      Prop("resolution") { (view: ConvolutionPixelView, res: Int) in
        view.setResolution(res)
      }
      
      // Image data array (optional, can also use refreshFromBackend)
      Prop("imageData") { (view: ConvolutionPixelView, data: [Float]) in
        view.updateImageData(data)
      }
      
      // Auto-refresh from backend
      Prop("autoRefresh") { (view: ConvolutionPixelView, enabled: Bool) in
        if enabled {
          view.startAnimation()
        } else {
          view.stopAnimation()
        }
      }
    }
    
    // Viewport view for game engine rendering
    View(ViewportView.self) {
      // Viewport width
      Prop("width") { (view: ViewportView, w: Int) in
        view.setWidth(w)
      }
      
      // Viewport height
      Prop("height") { (view: ViewportView, h: Int) in
        view.setHeight(h)
      }
      
      // Seed for random pixel generation (triggers regeneration)
      Prop("seed") { (view: ViewportView, s: UInt64) in
        view.setSeed(s)
      }
    }
  }
}
