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
  }
}
