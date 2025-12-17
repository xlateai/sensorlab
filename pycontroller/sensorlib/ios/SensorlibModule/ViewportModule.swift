import ExpoModulesCore
import UIKit
import Metal
import MetalKit
import QuartzCore

/// High-performance Metal-based viewport renderer for game engine
/// Generates random pixels at given resolution and displays them using GPU acceleration
class ViewportRenderer {
  private let device: MTLDevice
  private let commandQueue: MTLCommandQueue
  private var texture: MTLTexture?
  private var textureWidth: Int = 0
  private var textureHeight: Int = 0
  
  init() {
    guard let device = MTLCreateSystemDefaultDevice() else {
      fatalError("Metal is not supported on this device")
    }
    self.device = device
    
    guard let queue = device.makeCommandQueue() else {
      fatalError("Failed to create Metal command queue")
    }
    self.commandQueue = queue
  }
  
  /// Update texture with pixel data (RGBA8 format)
  /// This is a direct memory copy - extremely fast
  func updateTexture(width: Int, height: Int, rgbaData: UnsafePointer<UInt8>) {
    // Recreate texture if size changed
    if texture == nil || textureWidth != width || textureHeight != height {
      let textureDescriptor = MTLTextureDescriptor.texture2DDescriptor(
        pixelFormat: .rgba8Unorm,
        width: width,
        height: height,
        mipmapped: false
      )
      textureDescriptor.usage = [.shaderRead, .renderTarget]
      textureDescriptor.storageMode = .shared
      
      guard let newTexture = device.makeTexture(descriptor: textureDescriptor) else {
        print("ERROR: Failed to create Metal texture \(width)x\(height)")
        return
      }
      
      texture = newTexture
      textureWidth = width
      textureHeight = height
    }
    
    guard let tex = texture else { return }
    
    // Direct memory copy to texture - this is GPU-accelerated
    let bytesPerRow = width * 4 // RGBA = 4 bytes per pixel
    let region = MTLRegion(
      origin: MTLOrigin(x: 0, y: 0, z: 0),
      size: MTLSize(width: width, height: height, depth: 1)
    )
    
    tex.replace(
      region: region,
      mipmapLevel: 0,
      withBytes: rgbaData,
      bytesPerRow: bytesPerRow
    )
  }
  
  /// Get the texture for rendering
  func getTexture() -> MTLTexture? {
    return texture
  }
  
  /// Get the Metal device
  func getDevice() -> MTLDevice {
    return device
  }
  
  /// Get the command queue
  func getCommandQueue() -> MTLCommandQueue {
    return commandQueue
  }
}

/// Native view component for viewport rendering
/// Generates random pixels at specified resolution and displays them using Metal
class ViewportView: ExpoView {
  private var width: Int = 200
  private var height: Int = 200
  private var seed: UInt64 = 0
  private var metalLayer: CAMetalLayer?
  
  // Metal renderer for high-performance GPU rendering
  private let metalRenderer: ViewportRenderer
  
  // Reuse buffer to avoid allocation overhead
  private var pixelBuffer: UnsafeMutablePointer<UInt8>?
  private var bufferSize: Int = 0
  
  required init(appContext: AppContext? = nil) {
    // Initialize Metal renderer first
    self.metalRenderer = ViewportRenderer()
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = UIColor.black
    
    // Create Metal layer for GPU rendering
    let metalLayer = CAMetalLayer()
    metalLayer.device = metalRenderer.getDevice()
    metalLayer.pixelFormat = .bgra8Unorm
    metalLayer.framebufferOnly = false // Allow read access if needed
    metalLayer.contentsGravity = .resizeAspect
    self.layer.addSublayer(metalLayer)
    self.metalLayer = metalLayer
  }
  
  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }
  
  override func layoutSubviews() {
    super.layoutSubviews()
    
    // Update Metal layer to match view size and screen scale
    if let metalLayer = metalLayer {
      let scale = UIScreen.main.scale
      metalLayer.frame = bounds
      metalLayer.drawableSize = CGSize(
        width: bounds.width * scale,
        height: bounds.height * scale
      )
    }
    
    updateDisplay()
  }
  
  /// Set the viewport width
  func setWidth(_ w: Int) {
    guard w > 0 && w <= 8192 else { return } // Reasonable limits
    width = w
    invalidateBuffer()
    updateDisplay()
  }
  
  /// Set the viewport height
  func setHeight(_ h: Int) {
    guard h > 0 && h <= 8192 else { return } // Reasonable limits
    height = h
    invalidateBuffer()
    updateDisplay()
  }
  
  /// Set the seed for random generation (triggers regeneration)
  func setSeed(_ s: UInt64) {
    seed = s
    updateDisplay()
  }
  
  /// Invalidate and free the pixel buffer (called when resolution changes)
  private func invalidateBuffer() {
    if let buffer = pixelBuffer {
      free(buffer)
      pixelBuffer = nil
      bufferSize = 0
    }
  }
  
  /// Generate random pixel data and render using Metal
  private func updateDisplay() {
    guard let metalLayer = metalLayer,
          width > 0,
          height > 0 else {
      return
    }
    
    let bytesPerPixel = 4 // RGBA
    let requiredBufferSize = width * height * bytesPerPixel
    
    // Reuse buffer if size matches, otherwise reallocate
    if pixelBuffer == nil || bufferSize != requiredBufferSize {
      // Free old buffer
      if let oldBuffer = pixelBuffer {
        free(oldBuffer)
      }
      // Allocate new buffer
      guard let newBuffer = malloc(requiredBufferSize) else {
        print("ERROR: Failed to allocate buffer for \(width)x\(height)")
        return
      }
      pixelBuffer = newBuffer.assumingMemoryBound(to: UInt8.self)
      bufferSize = requiredBufferSize
    }
    
    guard let bufferPointer = pixelBuffer else {
      return
    }
    
    // Generate random pixels using seed for reproducibility
    var rngState = seed == 0 ? UInt64.random(in: 1...UInt64.max) : seed
    var bufferIdx = 0
    
    // Fast random generation loop using LCG
    for _ in 0..<(width * height) {
      // Linear congruential generator for fast random numbers
      rngState = rngState &* 1103515245 &+ 12345
      let r = UInt8((rngState >> 24) & 0xFF)
      rngState = rngState &* 1103515245 &+ 12345
      let g = UInt8((rngState >> 24) & 0xFF)
      rngState = rngState &* 1103515245 &+ 12345
      let b = UInt8((rngState >> 24) & 0xFF)
      
      // Write RGBA (Metal expects BGRA, but we'll handle that in the texture)
      bufferPointer[bufferIdx] = r
      bufferPointer[bufferIdx + 1] = g
      bufferPointer[bufferIdx + 2] = b
      bufferPointer[bufferIdx + 3] = 255 // Alpha
      
      bufferIdx += bytesPerPixel
    }
    
    // Update Metal texture directly - this is GPU-accelerated
    metalRenderer.updateTexture(
      width: width,
      height: height,
      rgbaData: bufferPointer
    )
    
    // Render using Metal - get drawable and render texture to screen
    guard let drawable = metalLayer.nextDrawable(),
          let sourceTexture = metalRenderer.getTexture() else {
      return
    }
    
    // Use blit encoder for fast texture copy (GPU-accelerated)
    guard let commandBuffer = metalRenderer.getCommandQueue().makeCommandBuffer(),
          let blitEncoder = commandBuffer.makeBlitCommandEncoder() else {
      return
    }
    
    // Copy source texture to drawable (handles scaling automatically)
    blitEncoder.copy(
      from: sourceTexture,
      sourceSlice: 0,
      sourceLevel: 0,
      sourceOrigin: MTLOrigin(x: 0, y: 0, z: 0),
      sourceSize: MTLSize(width: width, height: height, depth: 1),
      to: drawable.texture,
      destinationSlice: 0,
      destinationLevel: 0,
      destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0)
    )
    
    blitEncoder.endEncoding()
    commandBuffer.present(drawable)
    commandBuffer.commit()
  }
  
  deinit {
    // Free buffer on deinit
    if let buffer = pixelBuffer {
      free(buffer)
      pixelBuffer = nil
    }
  }
}

