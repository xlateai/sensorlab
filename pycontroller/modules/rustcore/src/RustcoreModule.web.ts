import { registerWebModule, NativeModule } from 'expo';

import { ChangeEventPayload } from './Rustcore.types';

type RustcoreModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
}

class RustcoreModule extends NativeModule<RustcoreModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
};

export default registerWebModule(RustcoreModule, 'RustcoreModule');
