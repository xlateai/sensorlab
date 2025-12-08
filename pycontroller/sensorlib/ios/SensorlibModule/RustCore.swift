import Foundation

// C-compatible function declarations for Rust functions
@_silgen_name("rustcore_hello")
func rustcore_hello() -> UnsafeMutablePointer<CChar>?

@_silgen_name("rustcore_hello_free")
func rustcore_hello_free(_ ptr: UnsafeMutablePointer<CChar>?)

@_silgen_name("rustcore_ml_training")
func rustcore_ml_training() -> UnsafeMutablePointer<CChar>?

@_silgen_name("rustcore_ml_training_free")
func rustcore_ml_training_free(_ ptr: UnsafeMutablePointer<CChar>?)

@_silgen_name("rustcore_convolution")
func rustcore_convolution(_ input: UnsafePointer<CChar>?) -> UnsafeMutablePointer<CChar>?

@_silgen_name("rustcore_convolution_free")
func rustcore_convolution_free(_ ptr: UnsafeMutablePointer<CChar>?)

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

/// Swift wrapper for Rust ML training function
public func rustcoreMLTraining() -> String {
    guard let cString = rustcore_ml_training() else {
        return "Error: Failed to call ML training function"
    }
    
    defer {
        rustcore_ml_training_free(cString)
    }
    
    return String(cString: cString)
}

/// Swift wrapper for Rust convolution function
public func rustcoreConvolution(_ input: String) -> String {
    let inputCString = input.cString(using: .utf8)
    guard let inputPtr = inputCString else {
        return "{\"error\":\"invalid input string\"}"
    }
    
    guard let resultPtr = rustcore_convolution(inputPtr) else {
        return "{\"error\":\"convolution failed\"}"
    }
    
    defer {
        rustcore_convolution_free(resultPtr)
    }
    
    return String(cString: resultPtr)
}

