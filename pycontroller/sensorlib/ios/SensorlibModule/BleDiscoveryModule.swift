import Foundation
import CoreBluetooth
import ExpoModulesCore

// BLE Service UUID for pymouse discovery
// Format: 128-bit UUID (we'll use a short form for convenience)
let PYMOUSE_SERVICE_UUID = CBUUID(string: "A7B4C3D2-E8F1-4A5B-9C6D-7E8F9A0B1C2D")
let PYMOUSE_CHARACTERISTIC_UUID = CBUUID(string: "B8C5D4E3-F9A2-5B6C-0D7E-8F9A0B1C2D3E4")

struct BleDiscoveryInput: Record {
  @Field var serviceName: String?  // Optional filter by service name
  @Field var timeout: Double?       // Optional timeout in seconds (default: 10.0)
}

struct BleServiceInfo: Record {
  @Field var host: String           // IP address
  @Field var port: Int              // Port number
  @Field var name: String           // Device name
  @Field var deviceId: String       // BLE device identifier
}

enum BleError: Error, LocalizedError {
  case bluetoothUnavailable
  case bluetoothUnauthorized
  case timeout
  case cancelled
  case noServiceFound
  case connectionFailed(String)
  case dataParseFailed(String)
  
  var errorDescription: String? {
    switch self {
    case .bluetoothUnavailable:
      return "Bluetooth is not available on this device"
    case .bluetoothUnauthorized:
      return "Bluetooth permission not granted"
    case .timeout:
      return "BLE discovery timed out"
    case .cancelled:
      return "BLE discovery was cancelled"
    case .noServiceFound:
      return "No BLE service found"
    case .connectionFailed(let reason):
      return "BLE connection failed: \(reason)"
    case .dataParseFailed(let reason):
      return "Failed to parse service data: \(reason)"
    }
  }
}

final class BleDiscoveryModule: NSObject {
  static let shared = BleDiscoveryModule()
  
  private var centralManager: CBCentralManager?
  private var discoveredPeripherals: [CBPeripheral] = []
  private var connectedPeripheral: CBPeripheral?
  private var targetService: CBService?
  private var targetCharacteristic: CBCharacteristic?
  private var discoveryContinuation: CheckedContinuation<BleServiceInfo, Error>?
  private var isScanning = false
  
  private override init() {
    super.init()
  }
  
  func discoverService(input: BleDiscoveryInput) async throws -> BleServiceInfo {
    print("[BleDiscovery] Starting BLE discovery...")
    
    return try await withCheckedThrowingContinuation { continuation in
      // Store continuation
      discoveryContinuation = continuation
      
      // Initialize central manager on main thread
      DispatchQueue.main.async { [weak self] in
        guard let self = self else {
          continuation.resume(throwing: BleError.cancelled)
          return
        }
        
        self.centralManager = CBCentralManager(delegate: self, queue: nil)
        
        // Set up timeout
        let timeout = input.timeout ?? 10.0
        Task {
          try? await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
          if self.isScanning {
            print("[BleDiscovery] Discovery timeout after \(timeout) seconds")
            self.stopDiscovery()
            continuation.resume(throwing: BleError.timeout)
          }
        }
      }
    }
  }
  
  func stopDiscovery() {
    print("[BleDiscovery] Stopping discovery...")
    isScanning = false
    
    if let manager = centralManager {
      manager.stopScan()
    }
    
    if let peripheral = connectedPeripheral {
      centralManager?.cancelPeripheralConnection(peripheral)
    }
    
    discoveredPeripherals.removeAll()
    connectedPeripheral = nil
    targetService = nil
    targetCharacteristic = nil
    discoveryContinuation = nil
  }
  
  private func handleError(_ error: BleError) {
    guard let continuation = discoveryContinuation else { return }
    stopDiscovery()
    continuation.resume(throwing: error)
  }
  
  private func handleSuccess(_ serviceInfo: BleServiceInfo) {
    guard let continuation = discoveryContinuation else { return }
    stopDiscovery()
    continuation.resume(returning: serviceInfo)
  }
}

// MARK: - CBCentralManagerDelegate

extension BleDiscoveryModule: CBCentralManagerDelegate {
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    print("[BleDiscovery] Central manager state updated: \(central.state.rawValue)")
    
    switch central.state {
    case .poweredOn:
      // Start scanning for services
      print("[BleDiscovery] Bluetooth powered on, starting scan for service: \(PYMOUSE_SERVICE_UUID)")
      isScanning = true
      central.scanForPeripherals(
        withServices: [PYMOUSE_SERVICE_UUID],
        options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
      )
      
    case .poweredOff:
      handleError(.bluetoothUnavailable)
      
    case .unauthorized:
      handleError(.bluetoothUnauthorized)
      
    case .unsupported:
      handleError(.bluetoothUnavailable)
      
    case .resetting, .unknown:
      // Wait for state to update
      break
      
    @unknown default:
      handleError(.bluetoothUnavailable)
    }
  }
  
  func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
    print("[BleDiscovery] Discovered peripheral: \(peripheral.name ?? "Unknown"), UUID: \(peripheral.identifier)")
    print("[BleDiscovery] RSSI: \(RSSI)")
    
    // Check if we already have this peripheral
    if !discoveredPeripherals.contains(where: { $0.identifier == peripheral.identifier }) {
      discoveredPeripherals.append(peripheral)
    }
    
    // Connect to the first discovered peripheral
    if connectedPeripheral == nil {
      print("[BleDiscovery] Connecting to peripheral: \(peripheral.identifier)")
      connectedPeripheral = peripheral
      peripheral.delegate = self
      central.connect(peripheral, options: nil)
    }
  }
  
  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    print("[BleDiscovery] Connected to peripheral: \(peripheral.identifier)")
    print("[BleDiscovery] Discovering services...")
    peripheral.discoverServices([PYMOUSE_SERVICE_UUID])
  }
  
  func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
    let reason = error?.localizedDescription ?? "Unknown error"
    print("[BleDiscovery] Failed to connect: \(reason)")
    
    // Try next peripheral if available
    if let nextPeripheral = discoveredPeripherals.first(where: { $0.identifier != peripheral.identifier && $0.state != .connected }) {
      print("[BleDiscovery] Trying next peripheral...")
      connectedPeripheral = nextPeripheral
      nextPeripheral.delegate = self
      central.connect(nextPeripheral, options: nil)
    } else {
      handleError(.connectionFailed(reason))
    }
  }
  
  func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
    print("[BleDiscovery] Disconnected from peripheral: \(peripheral.identifier)")
    if let error = error {
      print("[BleDiscovery] Disconnect error: \(error.localizedDescription)")
    }
  }
}

// MARK: - CBPeripheralDelegate

extension BleDiscoveryModule: CBPeripheralDelegate {
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error = error {
      print("[BleDiscovery] Service discovery error: \(error.localizedDescription)")
      handleError(.connectionFailed(error.localizedDescription))
      return
    }
    
    guard let services = peripheral.services else {
      print("[BleDiscovery] No services found")
      handleError(.noServiceFound)
      return
    }
    
    print("[BleDiscovery] Found \(services.count) service(s)")
    
    // Find our target service
    guard let service = services.first(where: { $0.uuid == PYMOUSE_SERVICE_UUID }) else {
      print("[BleDiscovery] Target service not found")
      handleError(.noServiceFound)
      return
    }
    
    targetService = service
    print("[BleDiscovery] Found target service, discovering characteristics...")
    peripheral.discoverCharacteristics([PYMOUSE_CHARACTERISTIC_UUID], for: service)
  }
  
  func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
    if let error = error {
      print("[BleDiscovery] Characteristic discovery error: \(error.localizedDescription)")
      handleError(.connectionFailed(error.localizedDescription))
      return
    }
    
    guard let characteristics = service.characteristics else {
      print("[BleDiscovery] No characteristics found")
      handleError(.noServiceFound)
      return
    }
    
    print("[BleDiscovery] Found \(characteristics.count) characteristic(s)")
    
    // Find our target characteristic
    guard let characteristic = characteristics.first(where: { $0.uuid == PYMOUSE_CHARACTERISTIC_UUID }) else {
      print("[BleDiscovery] Target characteristic not found")
      handleError(.noServiceFound)
      return
    }
    
    targetCharacteristic = characteristic
    print("[BleDiscovery] Found target characteristic, reading value...")
    peripheral.readValue(for: characteristic)
  }
  
  func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
    if let error = error {
      print("[BleDiscovery] Read value error: \(error.localizedDescription)")
      handleError(.connectionFailed(error.localizedDescription))
      return
    }
    
    guard let data = characteristic.value else {
      print("[BleDiscovery] No data in characteristic")
      handleError(.dataParseFailed("Characteristic value is nil"))
      return
    }
    
    print("[BleDiscovery] Received data: \(data.count) bytes")
    
    // Parse JSON data: {"host": "192.168.1.100", "port": 8765, "name": "pymouse-server"}
    do {
      let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
      guard let json = json,
            let host = json["host"] as? String,
            let port = json["port"] as? Int else {
        throw NSError(domain: "BleDiscovery", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid JSON format"])
      }
      
      let name = json["name"] as? String ?? peripheral.name ?? "Unknown"
      
      var serviceInfo = BleServiceInfo()
      serviceInfo.host = host
      serviceInfo.port = port
      serviceInfo.name = name
      serviceInfo.deviceId = peripheral.identifier.uuidString
      
      print("[BleDiscovery] Parsed service info: host=\(host), port=\(port), name=\(name)")
      handleSuccess(serviceInfo)
      
    } catch {
      print("[BleDiscovery] JSON parse error: \(error.localizedDescription)")
      handleError(.dataParseFailed(error.localizedDescription))
    }
  }
}

// Helper function to discover BLE service
func discoverBleService(input: BleDiscoveryInput) async throws -> BleServiceInfo {
  return try await BleDiscoveryModule.shared.discoverService(input: input)
}
