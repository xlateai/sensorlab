import type { StyleProp, ViewStyle } from 'react-native';

export type OnLoadEventPayload = {
  url: string;
};

export type SensorlibModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type SensorlibViewProps = {
  url: string;
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void;
  style?: StyleProp<ViewStyle>;
};

export type ConvolutionPixelViewProps = {
  contextId?: number;
  backend?: 'Rust' | 'Metal';
  resolution?: number;
  imageData?: number[];
  autoRefresh?: boolean;
  style?: StyleProp<ViewStyle>;
};
