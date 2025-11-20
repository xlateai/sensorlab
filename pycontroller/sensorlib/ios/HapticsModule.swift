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


class HapticsEngineManager {
    static let shared = HapticsEngineManager()
    private var engine: CHHapticEngine?

    private init() {}

    func getEngine() throws -> CHHapticEngine {
        if let engine = engine {
            if engine.isRunning {
                return engine
            } else {
                try engine.start()
                return engine
            }
        }
        let newEngine = try CHHapticEngine()
        try newEngine.start()
        engine = newEngine
        return newEngine
    }
}
