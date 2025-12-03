// Polyfill for node:os in React Native
// This provides a minimal implementation of the os module that libp2p/utils needs

const os = {
  // Return empty array for network interfaces (libp2p will handle this differently in RN)
  networkInterfaces: () => ({}),
  
  // Return platform info
  platform: () => {
    // React Native doesn't expose this directly, but we can infer from the environment
    if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
      // Try to detect iOS vs Android
      if (typeof require !== 'undefined') {
        try {
          const { Platform } = require('react-native');
          return Platform.OS === 'ios' ? 'darwin' : 'android';
        } catch (e) {
          return 'react-native';
        }
      }
      return 'react-native';
    }
    return 'unknown';
  },
  
  // Return hostname (not critical for libp2p)
  hostname: () => 'localhost',
  
  // Return EOL (end of line) - default to \n
  EOL: '\n',
  
  // Return architecture
  arch: () => {
    // In React Native, we can't easily detect this, so return a safe default
    return 'unknown';
  },
  
  // Return type (OS type)
  type: () => {
    if (typeof require !== 'undefined') {
      try {
        const { Platform } = require('react-native');
        return Platform.OS === 'ios' ? 'Darwin' : 'Linux';
      } catch (e) {
        return 'Unknown';
      }
    }
    return 'Unknown';
  },
  
  // Return release
  release: () => {
    return '0.0.0';
  },
  
  // Return cpus (empty array is fine)
  cpus: () => [],
  
  // Return totalmem (return a reasonable default)
  totalmem: () => 1024 * 1024 * 1024, // 1GB default
  
  // Return freemem (return a reasonable default)
  freemem: () => 512 * 1024 * 1024, // 512MB default
  
  // Return uptime (return 0)
  uptime: () => 0,
  
  // Return loadavg (empty array)
  loadavg: () => [],
  
  // Return homedir (return empty string)
  homedir: () => '',
  
  // Return tmpdir (return /tmp)
  tmpdir: () => '/tmp',
  
  // Return endianness
  endianness: () => 'LE',
};

module.exports = os;
