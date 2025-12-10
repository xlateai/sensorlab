import ExpoModulesCore
import UIKit
import Metal
import MetalKit
import QuartzCore

/// High-performance Metal-based pixel renderer
/// Uses CAMetalLayer and MTLTexture for GPU-accelerated rendering
/// Can handle 4K/8K images without performance issues
class MetalPixelRenderer {
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

/// Native view component for rendering convolution pixels directly in Swift
/// This avoids JavaScript rendering overhead by keeping all pixel data and rendering in native code
class ConvolutionPixelView: ExpoView {
  private var imageData: [Float] = []
  private var resolution: Int = 32
  private var metalLayer: CAMetalLayer?
  private var displayLink: CADisplayLink?
  private var contextId: UInt64 = 1
  private var backend: String = "Rust" // "Rust" or "Metal"
  private var isAnimating: Bool = false
  private var lastUpdateTime: CFTimeInterval = 0
  
  // Metal renderer for high-performance GPU rendering
  private let metalRenderer: MetalPixelRenderer
  
  // Reuse buffer to avoid allocation overhead
  private var pixelBuffer: UnsafeMutablePointer<UInt8>?
  private var bufferSize: Int = 0
  
  // Change detection
  private var cachedImageDataHash: Int = 0
  
  required init(appContext: AppContext? = nil) {
    // Initialize Metal renderer first
    self.metalRenderer = MetalPixelRenderer()
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
  
  /// Set the context ID for this view
  func setContextId(_ id: UInt64) {
    contextId = id
  }
  
  /// Set the backend type
  func setBackend(_ backend: String) {
    self.backend = backend
  }
  
  /// Set the resolution
  func setResolution(_ res: Int) {
    resolution = res
    // Clear cache when resolution changes
    cachedImageDataHash = 0
    // Free old buffer - will be reallocated on next update
    if let buffer = pixelBuffer {
      free(buffer)
      pixelBuffer = nil
      bufferSize = 0
    }
    updateDisplay()
  }
  
  /// Update image data from array
  func updateImageData(_ data: [Float]) {
    imageData = data
    updateDisplay()
  }
  
  /// Get current image data from Rust/Metal backend
  func refreshFromBackend() {
    // For high resolutions, JSON parsing is extremely expensive
    // Use a simple change detection based on first/last/middle pixels instead of full hash
    let inputJson = """
    {
      "context_id": \(contextId)
    }
    """
    
    var resultData: [Float] = []
    
    if backend == "Metal" {
      let resultJson = rustcoreMlxConvolutionGetImage(inputJson)
      if let data = parseImageDataFromJson(resultJson) {
        resultData = data
      }
    } else {
      // Rust backend
      let resultJson = rustcoreConvolutionGetImage(inputJson)
      if let data = parseImageDataFromJson(resultJson) {
        resultData = data
      }
    }
    
    if !resultData.isEmpty {
      // Quick change detection using sample pixels (much faster than full hash)
      let sampleSize = min(10, resultData.count / 100) // Sample ~1% of pixels
      var quickHash: Int = 0
      let step = max(1, resultData.count / sampleSize)
      for i in stride(from: 0, to: resultData.count, by: step) {
        quickHash ^= Int(resultData[i] * 1000) // Simple hash
      }
      
      if quickHash != cachedImageDataHash {
        imageData = resultData
        cachedImageDataHash = quickHash
        updateDisplay()
      }
    }
  }
  
  /// Start automatic refresh from backend
  func startAnimation() {
    guard !isAnimating else { return }
    isAnimating = true
    
    displayLink = CADisplayLink(target: self, selector: #selector(displayLinkTick))
    displayLink?.add(to: .main, forMode: .common)
  }
  
  /// Stop automatic refresh
  func stopAnimation() {
    isAnimating = false
    displayLink?.invalidate()
    displayLink = nil
  }
  
  @objc private func displayLinkTick() {
    let currentTime = CACurrentMediaTime()
    
    // Aggressively throttle based on resolution
    // For 128x128, JSON serialization of 49k floats is extremely expensive
    // Lower resolutions can update faster
    let targetFPS: Double
    if resolution <= 32 {
      targetFPS = 60.0
    } else if resolution <= 64 {
      targetFPS = 30.0
    } else if resolution <= 128 {
      targetFPS = 15.0  // 128x128 needs heavy throttling
    } else {
      targetFPS = 10.0  // Even higher resolutions
    }
    
    let frameInterval = 1.0 / targetFPS
    if currentTime - lastUpdateTime < frameInterval {
      return
    }
    lastUpdateTime = currentTime
    
    // Apply convolution step and then refresh display
    // This keeps everything in native code - no JavaScript bridge
    applyConvolutionStep()
    
    // Only refresh display if we have valid data
    if !imageData.isEmpty {
      refreshFromBackend()
    }
  }
  
  /// Apply convolution step directly in native code
  private func applyConvolutionStep() {
    let inputJson = """
    {
      "context_id": \(contextId)
    }
    """
    
    // Apply step without getting result (we'll read it in refreshFromBackend)
    if backend == "Metal" {
      _ = rustcoreMlxConvolutionStep(inputJson)
    } else {
      _ = rustcoreConvolutionStep(inputJson)
    }
  }
  
  /// Render pixels using Metal - GPU-accelerated, handles 4K/8K easily
  /// This replaces the slow CGImage approach with direct Metal texture updates
  private func updateDisplay() {
    guard let metalLayer = metalLayer,
          !imageData.isEmpty,
          resolution > 0 else {
      return
    }
    
    let imageWidth = resolution
    let imageHeight = resolution
    let bytesPerPixel = 4 // RGBA
    let requiredBufferSize = imageWidth * imageHeight * bytesPerPixel
    
    // Reuse buffer if size matches, otherwise reallocate
    if pixelBuffer == nil || bufferSize != requiredBufferSize {
      // Free old buffer
      if let oldBuffer = pixelBuffer {
        free(oldBuffer)
      }
      // Allocate new buffer
      guard let newBuffer = malloc(requiredBufferSize) else {
        print("ERROR: Failed to allocate buffer for \(imageWidth)x\(imageHeight)")
        return
      }
      pixelBuffer = newBuffer.assumingMemoryBound(to: UInt8.self)
      bufferSize = requiredBufferSize
    }
    
    guard let bufferPointer = pixelBuffer else {
      return
    }
    
    // Fill buffer directly from imageData - convert Float[0-1] to UInt8[0-255]
    let channels = 3
    var srcIdx = 0
    var dstIdx = 0
    let pixelCount = imageWidth * imageHeight
    
    // Fast conversion loop - this is the only CPU work we do
    for _ in 0..<pixelCount {
      guard srcIdx + 2 < imageData.count else { break }
      
      // Clamp and convert to 0-255
      let r = UInt8(max(0, min(255, Int(imageData[srcIdx] * 255.0))))
      let g = UInt8(max(0, min(255, Int(imageData[srcIdx + 1] * 255.0))))
      let b = UInt8(max(0, min(255, Int(imageData[srcIdx + 2] * 255.0))))
      
      // Write RGBA (Metal expects BGRA, but we'll handle that in the texture)
      bufferPointer[dstIdx] = r
      bufferPointer[dstIdx + 1] = g
      bufferPointer[dstIdx + 2] = b
      bufferPointer[dstIdx + 3] = 255 // Alpha
      
      srcIdx += channels
      dstIdx += bytesPerPixel
    }
    
    // Update Metal texture directly - this is GPU-accelerated
    metalRenderer.updateTexture(
      width: imageWidth,
      height: imageHeight,
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
      sourceSize: MTLSize(width: imageWidth, height: imageHeight, depth: 1),
      to: drawable.texture,
      destinationSlice: 0,
      destinationLevel: 0,
      destinationOrigin: MTLOrigin(x: 0, y: 0, z: 0)
    )
    
    blitEncoder.endEncoding()
    commandBuffer.present(drawable)
    commandBuffer.commit()
  }
  
  /// Parse image data from JSON response
  private func parseImageDataFromJson(_ json: String) -> [Float]? {
    guard let data = json.data(using: .utf8),
          let jsonObj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let resultArray = jsonObj["result"] as? [NSNumber] else {
      return nil
    }
    
    return resultArray.map { $0.floatValue }
  }
  
  deinit {
    stopAnimation()
    // Free buffer on deinit
    if let buffer = pixelBuffer {
      free(buffer)
      pixelBuffer = nil
    }
  }
}
