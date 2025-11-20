#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(HelloModule, NSObject)

RCT_EXTERN_METHOD(getHelloWorld:(RCTResponseSenderBlock)callback)

@end
