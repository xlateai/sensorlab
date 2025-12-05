import { NativeModule, requireNativeModule } from 'expo';

import { RustcoreModuleEvents } from './Rustcore.types';

declare class RustcoreModule extends NativeModule<RustcoreModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<RustcoreModule>('Rustcore');
