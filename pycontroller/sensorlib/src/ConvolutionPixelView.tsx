import { requireNativeView } from 'expo';
import * as React from 'react';

import { ConvolutionPixelViewProps } from './Sensorlib.types';

const NativeView: React.ComponentType<ConvolutionPixelViewProps> =
  requireNativeView('ConvolutionPixelView');

export default function ConvolutionPixelView(props: ConvolutionPixelViewProps) {
  return <NativeView {...props} />;
}

