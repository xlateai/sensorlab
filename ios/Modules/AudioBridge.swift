import Foundation
import React

@objc(AudioBridge)
class AudioBridge: NSObject {
    @objc
    func pushSamples(_ samples: [NSNumber]) {
        let floatSamples = samples.map { $0.floatValue }
        AudioEngine.shared.pushSamples(floatSamples)
    }

    @objc
    func getBufferedSamples(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
        let count = AudioEngine.shared.getBufferedSamples()
        resolve(count)
    }

    @objc
    static func requiresMainQueueSetup() -> Bool {
        return false
    }
}
