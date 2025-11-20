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
