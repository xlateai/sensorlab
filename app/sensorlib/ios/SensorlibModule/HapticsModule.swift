import Foundation
import ExpoModulesCore
import CoreHaptics

struct HapticCurvePoint: Record {
    @Field var time: Double
    @Field var intensity: Double?
    @Field var sharpness: Double?
}

struct HapticPatternInput: Record {
    @Field var type: String // "continuous" or "transient"
    @Field var intensity: Double?
    @Field var sharpness: Double?
    @Field var duration: Double?
    @Field var curve: [HapticCurvePoint]?
}

// Error type for haptics
enum HapticError: Error {
  case missingDuration
  case unknownType(String)
}

class HapticsEngineManager {
    static let shared = HapticsEngineManager()
    private var engine: CHHapticEngine?

    private init() {}

    func getEngine() throws -> CHHapticEngine {
        if let engine = engine {
            try? engine.start() // Always try to start, safe and idempotent
            return engine
        }
        let newEngine = try CHHapticEngine()
        try newEngine.start()
        engine = newEngine
        return newEngine
    }
}

// Unified haptics play function
func playHaptic(input: HapticPatternInput) throws {
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
