import Foundation
import Metal
import MetalKit

/// Metal-based convolution module that keeps all state in GPU memory
class ConvolutionModule {
    private let device: MTLDevice
    private let commandQueue: MTLCommandQueue
    private let library: MTLLibrary
    private var convolutionPipelineState: MTLComputePipelineState?
    
    // State storage - keyed by context ID
    private var contexts: [UInt64: ConvolutionContext] = [:]
    private let contextLock = NSLock()
    
    struct ConvolutionContext {
        var imageBuffer: MTLBuffer
        var kernelBuffer: MTLBuffer
        var outputBuffer: MTLBuffer
        var size: Int
        var channels: Int = 3
        var kernelSize: Int = 3
    }
    
    init?() {
        guard let device = MTLCreateSystemDefaultDevice() else {
            print("ERROR: Metal is not supported on this device")
            return nil
        }
        
        self.device = device
        
        guard let commandQueue = device.makeCommandQueue() else {
            print("ERROR: Failed to create Metal command queue")
            return nil
        }
        
        self.commandQueue = commandQueue
        
        // Create default library
        guard let library = device.makeDefaultLibrary() else {
            print("ERROR: Failed to create Metal library")
            return nil
        }
        
        self.library = library
        
        // Create compute pipeline for convolution
        setupConvolutionPipeline()
    }
    
    private func setupConvolutionPipeline() {
        // Metal compute shader must be implemented
        // This requires:
        // 1. A .metal file with the convolution kernel function
        // 2. Loading the function from the library
        // 3. Creating a compute pipeline state
        
        // For now, this will remain nil and cause a fatal error if used
        // This forces the implementation of the Metal shader
        convolutionPipelineState = nil
    }
    
    /// Initialize or update convolution context
    func initialize(contextId: UInt64, imageData: [Float], kernelData: [Float]) -> Bool {
        contextLock.lock()
        defer { contextLock.unlock() }
        
        // Validate dimensions
        let channels = 3
        let kernelSize = 3
        guard imageData.count % channels == 0,
              kernelData.count == kernelSize * kernelSize * channels else {
            return false
        }
        
        let totalPixels = imageData.count / channels
        let size = Int(sqrt(Double(totalPixels)))
        guard size * size == totalPixels else {
            return false
        }
        
        let bufferSize = imageData.count * MemoryLayout<Float>.size
        let kernelBufferSize = kernelData.count * MemoryLayout<Float>.size
        
        // Create or update buffers
        if let existingContext = contexts[contextId] {
            // Reuse buffers if size matches
            if existingContext.size == size {
                // Update existing buffers
                let imageContents = existingContext.imageBuffer.contents().bindMemory(to: Float.self, capacity: imageData.count)
                imageContents.initialize(from: imageData, count: imageData.count)
                
                let kernelContents = existingContext.kernelBuffer.contents().bindMemory(to: Float.self, capacity: kernelData.count)
                kernelContents.initialize(from: kernelData, count: kernelData.count)
                
                return true
            } else {
                // Size changed, need new buffers
                contexts.removeValue(forKey: contextId)
            }
        }
        
        // Create new buffers
        guard let imageBuffer = device.makeBuffer(bytes: imageData, length: bufferSize, options: .storageModeShared),
              let kernelBuffer = device.makeBuffer(bytes: kernelData, length: kernelBufferSize, options: .storageModeShared),
              let outputBuffer = device.makeBuffer(length: bufferSize, options: .storageModeShared) else {
            return false
        }
        
        let context = ConvolutionContext(
            imageBuffer: imageBuffer,
            kernelBuffer: kernelBuffer,
            outputBuffer: outputBuffer,
            size: size
        )
        
        contexts[contextId] = context
        return true
    }
    
    /// Apply one convolution step
    func step(contextId: UInt64) -> [Float]? {
        contextLock.lock()
        defer { contextLock.unlock() }
        
        guard let context = contexts[contextId] else {
            fatalError("Metal convolution context not found for contextId: \(contextId)")
        }
        
        guard let pipelineState = convolutionPipelineState else {
            fatalError("Metal convolution pipeline state not initialized. Metal compute shader must be implemented.")
        }
        
        // TODO: Implement Metal compute shader dispatch
        fatalError("Metal compute shader not yet implemented. Must implement GPU-based convolution.")
    }
    
    /// Get current image data
    func getImageData(contextId: UInt64) -> [Float]? {
        contextLock.lock()
        defer { contextLock.unlock() }
        
        guard let context = contexts[contextId] else {
            return nil
        }
        
        let count = context.size * context.size * context.channels
        let pointer = context.imageBuffer.contents().bindMemory(to: Float.self, capacity: count)
        return Array(UnsafeBufferPointer(start: pointer, count: count))
    }
    
    /// Clean up context
    func cleanup(contextId: UInt64) {
        contextLock.lock()
        defer { contextLock.unlock() }
        contexts.removeValue(forKey: contextId)
    }
}

// Global instance - lazy initialization
private var _convolutionModule: ConvolutionModule?
private let moduleLock = NSLock()

private func getConvolutionModule() -> ConvolutionModule? {
    moduleLock.lock()
    defer { moduleLock.unlock() }
    
    if _convolutionModule == nil {
        _convolutionModule = ConvolutionModule()
    }
    return _convolutionModule
}

/// Initialize Metal convolution
public func metalConvolutionInit(contextId: UInt64, imageData: [Float], kernelData: [Float]) -> Bool {
    guard let module = getConvolutionModule() else {
        return false
    }
    return module.initialize(contextId: contextId, imageData: imageData, kernelData: kernelData)
}

/// Step Metal convolution
public func metalConvolutionStep(contextId: UInt64) -> [Float]? {
    guard let module = getConvolutionModule() else {
        return nil
    }
    return module.step(contextId: contextId)
}

/// Get Metal convolution image data
public func metalConvolutionGetImage(contextId: UInt64) -> [Float]? {
    guard let module = getConvolutionModule() else {
        return nil
    }
    return module.getImageData(contextId: contextId)
}

/// Cleanup Metal convolution
public func metalConvolutionCleanup(contextId: UInt64) {
    guard let module = getConvolutionModule() else {
        return
    }
    module.cleanup(contextId: contextId)
}

