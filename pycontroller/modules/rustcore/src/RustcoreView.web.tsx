import * as React from 'react';

import { RustcoreViewProps } from './Rustcore.types';

export default function RustcoreView(props: RustcoreViewProps) {
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
