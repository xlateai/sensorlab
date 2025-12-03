import { NativeModule, requireNativeModule } from 'expo';

import { SensorlibModuleEvents, MdnsDiscoveryInput, MdnsServiceInfo, BleDiscoveryInput, BleServiceInfo } from './Sensorlib.types';

declare class SensorlibModule extends NativeModule<SensorlibModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
  discoverMdnsService(input: MdnsDiscoveryInput): Promise<MdnsServiceInfo>;
  discoverBleService(input: BleDiscoveryInput): Promise<BleServiceInfo>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<SensorlibModule>('Sensorlib');
