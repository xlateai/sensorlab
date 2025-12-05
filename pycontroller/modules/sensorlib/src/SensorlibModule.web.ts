import { registerWebModule, NativeModule } from 'expo';

import { SensorlibModuleEvents } from './Sensorlib.types';

class SensorlibModule extends NativeModule<SensorlibModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(SensorlibModule, 'SensorlibModule');
