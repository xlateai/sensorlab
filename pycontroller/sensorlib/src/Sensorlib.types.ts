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

export type MdnsDiscoveryInput = {
  serviceType: string;  // e.g., "_pymouse._tcp."
  domain: string;       // e.g., "local."
  timeout?: number;     // Optional timeout in seconds (default: 10.0)
};

export type MdnsServiceInfo = {
  host: string;         // IP address (prefers IPv4)
  port: number;         // Port number
  name: string;         // Service name
  type: string;         // Service type
  domain: string;       // Domain
  addresses: string[]; // All resolved IP addresses (IPv4 and IPv6)
};
