import ExpoModulesCore
import UIKit
import CoreGraphics

/// Native view component for rendering convolution pixels directly in Swift
/// This avoids JavaScript rendering overhead by keeping all pixel data and rendering in native code
class ConvolutionPixelView: ExpoView {
  private var imageData: [Float] = []
  private var resolution: Int = 32
  private var pixelLayer: CALayer?
  private var displayLink: CADisplayLink?
  private var contextId: UInt64 = 1
  private var backend: String = "Rust" // "Rust" or "Metal"
  private var isAnimating: Bool = false
  
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = UIColor.black
    
    // Create a layer for pixel rendering
    let layer = CALayer()
    layer.contentsGravity = .resize
    self.layer.addSublayer(layer)
    pixelLayer = layer
  }
  
  override func layoutSubviews() {
    super.layoutSubviews()
    pixelLayer?.frame = bounds
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
    updateDisplay()
  }
  
  /// Update image data from array
  func updateImageData(_ data: [Float]) {
    imageData = data
    updateDisplay()
  }
  
  /// Get current image data from Rust/Metal backend
  func refreshFromBackend() {
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
    
    // Only update if data changed (avoid unnecessary rendering)
    if !resultData.isEmpty && resultData.count == imageData.count {
      // Quick check if data actually changed
      var changed = false
      for i in 0..<min(resultData.count, imageData.count) {
        if abs(resultData[i] - imageData[i]) > 0.001 {
          changed = true
          break
        }
      }
      
      if changed || imageData.isEmpty {
        imageData = resultData
        updateDisplay()
      }
    } else if !resultData.isEmpty {
      imageData = resultData
      updateDisplay()
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
    // Apply convolution step and then refresh display
    // This keeps everything in native code - no JavaScript bridge
    applyConvolutionStep()
    
    // Only refresh display if we have valid data
    // This avoids unnecessary rendering when data hasn't changed
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
  
  /// Render pixels to the layer using efficient bitmap approach
  /// This creates a single bitmap image instead of drawing thousands of rectangles
  private func updateDisplay() {
    guard let pixelLayer = pixelLayer,
          !imageData.isEmpty,
          resolution > 0 else {
      pixelLayer?.contents = nil
      return
    }
    
    let imageWidth = resolution
    let imageHeight = resolution
    
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bytesPerPixel = 4 // RGBA
    let bytesPerRow = imageWidth * bytesPerPixel
    let bitsPerComponent = 8
    
    // Allocate buffer for pixel data
    let bufferSize = imageWidth * imageHeight * bytesPerPixel
    guard let buffer = malloc(bufferSize) else {
      return
    }
    defer { free(buffer) }
    
    let bufferPointer = buffer.assumingMemoryBound(to: UInt8.self)
    
    // Fill buffer directly from imageData in one pass (much faster!)
    let channels = 3
    var srcIdx = 0
    var dstIdx = 0
    
    for _ in 0..<(imageWidth * imageHeight) {
      guard srcIdx + 2 < imageData.count else { break }
      
      // Clamp and convert to 0-255
      let r = UInt8(max(0, min(255, Int(imageData[srcIdx] * 255.0))))
      let g = UInt8(max(0, min(255, Int(imageData[srcIdx + 1] * 255.0))))
      let b = UInt8(max(0, min(255, Int(imageData[srcIdx + 2] * 255.0))))
      
      // Write RGBA directly to buffer (RGBA format)
      bufferPointer[dstIdx] = r
      bufferPointer[dstIdx + 1] = g
      bufferPointer[dstIdx + 2] = b
      bufferPointer[dstIdx + 3] = 255 // Alpha (opaque)
      
      srcIdx += channels
      dstIdx += bytesPerPixel
    }
    
    // Create context from buffer
    guard let context = CGContext(
      data: buffer,
      width: imageWidth,
      height: imageHeight,
      bitsPerComponent: bitsPerComponent,
      bytesPerRow: bytesPerRow,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue
    ) else {
      return
    }
    
    // Create image from context and set it on the layer
    if let cgImage = context.makeImage() {
      // Use contentsGravity to scale the image to fit the view bounds
      pixelLayer.contentsGravity = .resize
      pixelLayer.contents = cgImage
    }
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
  }
}
