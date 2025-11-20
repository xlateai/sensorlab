
import CoreHaptics
import CoreHaptics
import ExpoModulesCore
// Error type for haptics
enum HapticError: Error {
  case missingDuration
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
            curves.append(CHHapticParameterCurve(parameterID: .hapticIntensity, controlPoints: intensityCurvePoints, relativeTime: 0))
          }
          if !sharpnessCurvePoints.isEmpty {
            curves.append(CHHapticParameterCurve(parameterID: .hapticSharpness, controlPoints: sharpnessCurvePoints, relativeTime: 0))
          }
        }
      default:
        throw Exception("Unknown haptic type: \(input.type)")
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
  }
}
