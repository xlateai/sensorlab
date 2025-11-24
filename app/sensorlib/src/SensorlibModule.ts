import { NativeModule, requireNativeModule } from 'expo';

import { SensorlibModuleEvents } from './Sensorlib.types';

declare class SensorlibModule extends NativeModule<SensorlibModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<SensorlibModule>('Sensorlib');
