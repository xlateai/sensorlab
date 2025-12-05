import { requireNativeView } from 'expo';
import * as React from 'react';

import { SensorlibViewProps } from './Sensorlib.types';

const NativeView: React.ComponentType<SensorlibViewProps> =
  requireNativeView('Sensorlib');

export default function SensorlibView(props: SensorlibViewProps) {
  return <NativeView {...props} />;
}
