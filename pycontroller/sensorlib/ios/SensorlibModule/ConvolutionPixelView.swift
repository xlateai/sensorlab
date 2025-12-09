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
    
    if !resultData.isEmpty {
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
    refreshFromBackend()
  }
  
  /// Render pixels to the layer
  private func updateDisplay() {
    guard let pixelLayer = pixelLayer,
          !imageData.isEmpty,
          resolution > 0 else {
      pixelLayer?.contents = nil
      return
    }
    
    let width = Int(bounds.width)
    let height = Int(bounds.height)
    
    guard width > 0 && height > 0 else { return }
    
    let pixelSize = max(1, min(width, height) / resolution)
    let imageWidth = resolution * pixelSize
    let imageHeight = resolution * pixelSize
    
    // Create bitmap context
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bytesPerPixel = 4
    let bytesPerRow = imageWidth * bytesPerPixel
    let bitsPerComponent = 8
    
    guard let context = CGContext(
      data: nil,
      width: imageWidth,
      height: imageHeight,
      bitsPerComponent: bitsPerComponent,
      bytesPerRow: bytesPerRow,
      space: colorSpace,
      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
      return
    }
    
    // Draw pixels
    let channels = 3
    for y in 0..<resolution {
      for x in 0..<resolution {
        let idx = (y * resolution + x) * channels
        guard idx + 2 < imageData.count else { continue }
        
        let r = max(0.0, min(1.0, Double(imageData[idx])))
        let g = max(0.0, min(1.0, Double(imageData[idx + 1])))
        let b = max(0.0, min(1.0, Double(imageData[idx + 2])))
        
        let color = CGColor(
          red: r,
          green: g,
          blue: b,
          alpha: 1.0
        )
        
        context.setFillColor(color)
        let rect = CGRect(
          x: x * pixelSize,
          y: y * pixelSize,
          width: pixelSize,
          height: pixelSize
        )
        context.fill(rect)
      }
    }
    
    // Create image from context
    if let cgImage = context.makeImage() {
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
