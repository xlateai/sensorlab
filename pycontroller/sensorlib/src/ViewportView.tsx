import { requireNativeView } from 'expo';
import * as React from 'react';

import { ViewportViewProps } from './Sensorlib.types';

const NativeView: React.ComponentType<ViewportViewProps> =
  requireNativeView('ViewportView');

export default function ViewportView(props: ViewportViewProps) {
  return <NativeView {...props} />;
}

