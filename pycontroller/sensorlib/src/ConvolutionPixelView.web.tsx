import * as React from 'react';
import { View, Text } from 'react-native';

import { ConvolutionPixelViewProps } from './Sensorlib.types';

// Web fallback - native view is iOS only
export default function ConvolutionPixelView(props: ConvolutionPixelViewProps) {
  return (
    <View style={[{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }, props.style]}>
      <Text style={{ color: '#fff' }}>ConvolutionPixelView (iOS only)</Text>
    </View>
  );
}
