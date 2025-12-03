import Foundation
import ExpoModulesCore

struct MdnsDiscoveryInput: Record {
  @Field var serviceType: String  // e.g., "_pymouse._tcp."
  @Field var domain: String        // e.g., "local."
  @Field var timeout: Double?      // Optional timeout in seconds (default: 10.0)
}

struct MdnsServiceInfo: Record {
  @Field var host: String
  @Field var port: Int
  @Field var name: String
  @Field var type: String
  @Field var domain: String
  @Field var addresses: [String]  // All resolved IP addresses
}

enum MdnsError: Error {
  case invalidServiceType
  case timeout
  case cancelled
  case noServiceFound
  case resolutionFailed
}

final class NetworkModule {
  static let shared = NetworkModule()
  
  private var activeBrowsers: [NetServiceBrowser] = []
  private var activeDelegates: [NetServiceBrowser: NetworkModuleBrowserDelegate] = [:]
  private var activeServices: [NetService] = []
  private var discoveryContinuations: [String: CheckedContinuation<MdnsServiceInfo, Error>] = [:]
  
  private init() {}
  
  func discoverService(input: MdnsDiscoveryInput) async throws -> MdnsServiceInfo {
    let serviceType = input.serviceType
    let domain = input.domain
    let timeout = input.timeout ?? 10.0
    
    // Validate service type format
    if !serviceType.contains("._tcp.") && !serviceType.contains("._udp.") {
      throw MdnsError.invalidServiceType
    }
    
    // Create a unique key for this discovery request
    let requestKey = "\(serviceType)\(domain)"
    
    // Check if there's already an active discovery for this service
    if let existingContinuation = discoveryContinuations[requestKey] {
      // Cancel the existing one
      existingContinuation.resume(throwing: MdnsError.cancelled)
    }
    
    return try await withCheckedThrowingContinuation { continuation in
      // Store the continuation
      discoveryContinuations[requestKey] = continuation
      
      // Create browser
      let browser = NetServiceBrowser()
      let delegate = NetworkModuleBrowserDelegate(
        serviceType: serviceType,
        domain: domain,
        timeout: timeout,
        onResolved: { [weak self] serviceInfo in
          // Remove from active tracking
          self?.discoveryContinuations.removeValue(forKey: requestKey)
          if let index = self?.activeBrowsers.firstIndex(where: { $0 === browser }) {
            self?.activeBrowsers.remove(at: index)
          }
          self?.activeDelegates.removeValue(forKey: browser)
          continuation.resume(returning: serviceInfo)
        },
        onError: { [weak self] error in
          // Remove from active tracking
          self?.discoveryContinuations.removeValue(forKey: requestKey)
          if let index = self?.activeBrowsers.firstIndex(where: { $0 === browser }) {
            self?.activeBrowsers.remove(at: index)
          }
          self?.activeDelegates.removeValue(forKey: browser)
          continuation.resume(throwing: error)
        }
      )
      
      browser.delegate = delegate
      
      // Store browser and delegate to keep them alive
      activeBrowsers.append(browser)
      activeDelegates[browser] = delegate
      
      // Start browsing
      browser.searchForServices(ofType: serviceType, inDomain: domain)
      
      // Set up timeout
      Task {
        try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
        if discoveryContinuations[requestKey] != nil {
          // Timeout occurred
          browser.stop()
          discoveryContinuations.removeValue(forKey: requestKey)
          if let index = activeBrowsers.firstIndex(where: { $0 === browser }) {
            activeBrowsers.remove(at: index)
          }
          activeDelegates.removeValue(forKey: browser)
          continuation.resume(throwing: MdnsError.timeout)
        }
      }
    }
  }
  
  func cancelDiscovery(serviceType: String, domain: String) {
    let requestKey = "\(serviceType)\(domain)"
    if let continuation = discoveryContinuations[requestKey] {
      continuation.resume(throwing: MdnsError.cancelled)
      discoveryContinuations.removeValue(forKey: requestKey)
    }
    
    // Stop all browsers
    for browser in activeBrowsers {
      browser.stop()
    }
    activeBrowsers.removeAll()
    activeDelegates.removeAll()
    activeServices.removeAll()
  }
}

// Browser delegate to handle service discovery
private class NetworkModuleBrowserDelegate: NSObject, NetServiceBrowserDelegate, NetServiceDelegate {
  let serviceType: String
  let domain: String
  let timeout: Double
  let onResolved: (MdnsServiceInfo) -> Void
  let onError: (Error) -> Void
  
  private var foundServices: [NetService] = []
  private var resolvedService: NetService?
  
  init(
    serviceType: String,
    domain: String,
    timeout: Double,
    onResolved: @escaping (MdnsServiceInfo) -> Void,
    onError: @escaping (Error) -> Void
  ) {
    self.serviceType = serviceType
    self.domain = domain
    self.timeout = timeout
    self.onResolved = onResolved
    self.onError = onError
  }
  
  // MARK: - NetServiceBrowserDelegate
  
  func netServiceBrowser(_ browser: NetServiceBrowser, didFind service: NetService, moreComing: Bool) {
    print("[NetworkModule] Found service: \(service.name), type: \(service.type), domain: \(service.domain)")
    
    // Store the service
    foundServices.append(service)
    
    // Resolve the first service we find
    if resolvedService == nil {
      resolvedService = service
      service.delegate = self
      service.resolve(withTimeout: 5.0)
    }
  }
  
  func netServiceBrowser(_ browser: NetServiceBrowser, didRemove service: NetService, moreComing: Bool) {
    print("[NetworkModule] Service removed: \(service.name)")
    if let index = foundServices.firstIndex(where: { $0.name == service.name && $0.type == service.type && $0.domain == service.domain }) {
      foundServices.remove(at: index)
    }
    if let resolved = resolvedService, resolved.name == service.name && resolved.type == service.type && resolved.domain == service.domain {
      resolvedService = nil
    }
  }
  
  func netServiceBrowser(_ browser: NetServiceBrowser, didNotSearch errorDict: [String : NSNumber]) {
    let errorCode = errorDict[NetService.errorCode]?.intValue ?? 0
    // Error domain is typically a string key, but if it's NSNumber, we'll use a default
    let errorDomain = "NSNetServicesErrorDomain"
    print("[NetworkModule] Browser error: code=\(errorCode), domain=\(errorDomain)")
    
    // Common iOS mDNS error -72008 means mDNS isn't available
    if errorCode == -72008 {
      onError(MdnsError.resolutionFailed)
    } else {
      onError(NSError(domain: errorDomain, code: errorCode))
    }
  }
  
  // MARK: - NetServiceDelegate
  
  func netServiceDidResolveAddress(_ sender: NetService) {
    print("[NetworkModule] Service resolved: \(sender.name)")
    
    // Extract hostname and port
    guard let hostname = sender.hostName else {
      onError(MdnsError.resolutionFailed)
      return
    }
    
    let port = sender.port
    
    // Get all addresses (IPv4 and IPv6)
    var addresses: [String] = []
    if let addressData = sender.addresses {
      for data in addressData {
        var hostname = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        let result = data.withUnsafeBytes { bytes in
          let sockaddr = bytes.bindMemory(to: sockaddr.self).baseAddress!
          return getnameinfo(
            sockaddr,
            socklen_t(data.count),
            &hostname,
            socklen_t(hostname.count),
            nil,
            0,
            NI_NUMERICHOST
          )
        }
        
        if result == 0 {
          let address = String(cString: hostname)
          addresses.append(address)
        }
      }
    }
    
    // Prefer IPv4 addresses, but include all
    let ipAddress = addresses.first { !$0.contains(":") } ?? addresses.first ?? hostname
    
    var serviceInfo = MdnsServiceInfo()
    serviceInfo.host = ipAddress
    serviceInfo.port = Int(port)
    serviceInfo.name = sender.name
    serviceInfo.type = sender.type
    serviceInfo.domain = sender.domain
    serviceInfo.addresses = addresses
    
    onResolved(serviceInfo)
  }
  
  func netService(_ sender: NetService, didNotResolve errorDict: [String : NSNumber]) {
    let errorCode = errorDict[NetService.errorCode]?.intValue ?? 0
    // Error domain is typically a string key, but if it's NSNumber, we'll use a default
    let errorDomain = "NSNetServicesErrorDomain"
    print("[NetworkModule] Resolution error: code=\(errorCode), domain=\(errorDomain)")
    
    // Try the next service if available
    if let nextService = foundServices.first(where: { 
      !($0.name == sender.name && $0.type == sender.type && $0.domain == sender.domain) &&
      !(resolvedService != nil && $0.name == resolvedService!.name && $0.type == resolvedService!.type && $0.domain == resolvedService!.domain)
    }) {
      resolvedService = nextService
      nextService.delegate = self
      nextService.resolve(withTimeout: 5.0)
    } else {
      onError(MdnsError.resolutionFailed)
    }
  }
}

// Helper function to discover mDNS service
func discoverMdnsService(input: MdnsDiscoveryInput) async throws -> MdnsServiceInfo {
  return try await NetworkModule.shared.discoverService(input: input)
}
