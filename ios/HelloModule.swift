import Foundation

@objc(HelloModule)
class HelloModule: NSObject {
  @objc
  func getHelloWorld(_ callback: @escaping RCTResponseSenderBlock) {
    callback(["Hello world from Swift"])
  }
}
