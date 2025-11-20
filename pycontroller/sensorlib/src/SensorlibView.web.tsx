import * as React from 'react';

import { SensorlibViewProps } from './Sensorlib.types';

export default function SensorlibView(props: SensorlibViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
