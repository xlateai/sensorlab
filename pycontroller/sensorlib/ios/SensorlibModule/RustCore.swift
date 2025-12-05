import Foundation

// C-compatible function declarations for Rust functions
@_silgen_name("rustcore_hello")
func rustcore_hello() -> UnsafeMutablePointer<CChar>?

@_silgen_name("rustcore_hello_free")
func rustcore_hello_free(_ ptr: UnsafeMutablePointer<CChar>?)

/// Swift wrapper for Rust hello world function
public func rustcoreHello() -> String {
    guard let cString = rustcore_hello() else {
        return "Error: Failed to call Rust function"
    }
    
    defer {
        rustcore_hello_free(cString)
    }
    
    return String(cString: cString)
}

