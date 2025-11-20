#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AudioBridge, NSObject)
RCT_EXTERN_METHOD(pushSamples:(NSArray *)samples)
RCT_EXTERN_METHOD(getBufferedSamples:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
+ (BOOL)requiresMainQueueSetup { return NO; }
@end
