import { requireNativeView } from 'expo';
import * as React from 'react';

import { RustcoreViewProps } from './Rustcore.types';

const NativeView: React.ComponentType<RustcoreViewProps> =
  requireNativeView('Rustcore');

export default function RustcoreView(props: RustcoreViewProps) {
  return <NativeView {...props} />;
}
