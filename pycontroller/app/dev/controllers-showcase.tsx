import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Dimensions, Platform } from 'react-native';
import { Magnetometer } from 'expo-sensors';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

// mDNS / DNS-SD (native only; you'll need to install `react-native-zeroconf`)
// On web this will be unused.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Zeroconf: any = Platform.OS === 'web' ? null : require('react-native-zeroconf').default ?? require('react-native-zeroconf');

// mDNS service types
const MAGNETO_SERVICE_TYPE = '_magneto._tcp.local.';
const MOUSE_SERVICE_TYPE = '_pymouse._tcp.local.';

// Fallback URLs (used if mDNS discovery fails)
const FALLBACK_MAGNETO_WS_URL = 'ws://172.20.10.3:8765';

interface ControllersShowcaseProps {
  onMouseControlActive: (active: boolean) => void;
  onTouchpadVisible: (visible: boolean) => void;
  mouseWsRef: React.MutableRefObject<WebSocket | null>;
}

export default function ControllersShowcase({
  onMouseControlActive,
  onTouchpadVisible,
  mouseWsRef,
}: ControllersShowcaseProps) {
  // mDNS discovered URLs
  const [magnetoWsUrl, setMagnetoWsUrl] = useState<string>(FALLBACK_MAGNETO_WS_URL);
  const [mouseWsUrl, setMouseWsUrl] = useState<string>(''); // No fallback - must be discovered
  const [mdnsStatus, setMdnsStatus] = useState<string>('Discovering...');
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const zeroconfRef = useRef<any | null>(null);
  
  // Magnetometer -> Python streaming
  const magnetoWsRef = useRef<WebSocket | null>(null);
  const [magnetoStreaming, setMagnetoStreaming] = useState(false);
  
  // Mouse control state
  const [mouseControlActive, setMouseControlActive] = useState(false);
  
  // Store magnetometer subscription for streaming
  const magSubRef = useRef<any>(null);
  const [magnetometerData, setMagnetometerData] = useState<{x: number, y: number, z: number} | null>(null);

  // Service discovery using HTTP discovery endpoint
  const discoverServices = React.useCallback(async () => {
    if (mouseWsUrl) {
      return;
    }
    
    if (isDiscovering) return;
    
    setIsDiscovering(true);
    setMdnsStatus('Discovering services...');
      
    const mouseServiceName = MOUSE_SERVICE_TYPE.split('_')[1].split('.')[0];
    const magnetoServiceName = MAGNETO_SERVICE_TYPE.split('_')[1].split('.')[0];
    
    const mouseDiscoveryPort = 8767;
    const magnetoDiscoveryPort = 8768;
    
    const tryDiscoverService = async (
      ip: string,
      port: number,
      serviceName: string,
      serviceType: string
    ): Promise<string | null> => {
      try {
        const discoveryUrl = `http://${ip}:${port}/discover`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 500);
        
        const response = await fetch(discoveryUrl, {
          method: 'GET',
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const data = await response.json();
          if (data.service === serviceName && data.ws_url) {
            return data.ws_url;
          }
        }
      } catch (e: any) {
        // Silently fail
      }
      return null;
    };
    
    const ipsToTry: string[] = [];
    const likelyIP = '172.20.10.3';
    ipsToTry.push(likelyIP);
    
    const commonIPRanges = [
      '172.20.10.3',
      '192.168.1.1',
      '192.168.0.1',
    ];
    
    for (const baseIP of commonIPRanges) {
      const ipParts = baseIP.split('.');
      const base = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
      for (let i = 1; i <= 3; i++) {
        const testIP = `${base}.${i}`;
        if (!ipsToTry.includes(testIP)) {
          ipsToTry.push(testIP);
        }
      }
    }
    
    let discoveredMouseUrl: string | null = null;
    let discoveredMagnetoUrl: string | null = null;
    let mouseLogged = false;
    let magnetoLogged = false;
    
    const [likelyMouse, likelyMagneto] = await Promise.all([
      tryDiscoverService(likelyIP, mouseDiscoveryPort, mouseServiceName, MOUSE_SERVICE_TYPE),
      tryDiscoverService(likelyIP, magnetoDiscoveryPort, magnetoServiceName, MAGNETO_SERVICE_TYPE),
    ]);
    
    if (likelyMouse) {
      discoveredMouseUrl = likelyMouse;
      if (!mouseLogged) {
        console.log(`[Discovery] Found ${MOUSE_SERVICE_TYPE} service at ${likelyMouse}`);
        mouseLogged = true;
      }
    }
    if (likelyMagneto) {
      discoveredMagnetoUrl = likelyMagneto;
      if (!magnetoLogged) {
        console.log(`[Discovery] Found ${MAGNETO_SERVICE_TYPE} service at ${likelyMagneto}`);
        magnetoLogged = true;
      }
    }
    
    if (!discoveredMouseUrl || !discoveredMagnetoUrl) {
      const remainingIPs = ipsToTry.filter(ip => ip !== likelyIP);
      const MAX_CONCURRENT = 12;
      
      for (let i = 0; i < remainingIPs.length; i += MAX_CONCURRENT) {
        const chunk = remainingIPs.slice(i, i + MAX_CONCURRENT);
        
        const promises = chunk.flatMap(ip => [
          !discoveredMouseUrl 
            ? tryDiscoverService(ip, mouseDiscoveryPort, mouseServiceName, MOUSE_SERVICE_TYPE)
                .then(url => { 
                  if (url && !discoveredMouseUrl) {
                    discoveredMouseUrl = url;
                    if (!mouseLogged) {
                      console.log(`[Discovery] Found ${MOUSE_SERVICE_TYPE} service at ${url}`);
                      mouseLogged = true;
                    }
                  }
                  return url; 
                })
            : Promise.resolve(null),
          !discoveredMagnetoUrl
            ? tryDiscoverService(ip, magnetoDiscoveryPort, magnetoServiceName, MAGNETO_SERVICE_TYPE)
                .then(url => { 
                  if (url && !discoveredMagnetoUrl) {
                    discoveredMagnetoUrl = url;
                    if (!magnetoLogged) {
                      console.log(`[Discovery] Found ${MAGNETO_SERVICE_TYPE} service at ${url}`);
                      magnetoLogged = true;
                    }
                  }
                  return url; 
                })
            : Promise.resolve(null),
        ]);
        
        await Promise.all(promises);
        
        if (discoveredMouseUrl && discoveredMagnetoUrl) {
          break;
        }
      }
    }
    
    if (discoveredMouseUrl) {
      setMouseWsUrl(discoveredMouseUrl);
    } else {
      setMouseWsUrl('');
      console.warn('[Discovery] Mouse service not found after scanning', ipsToTry.length, 'IPs');
    }
    
    if (discoveredMagnetoUrl) {
      setMagnetoWsUrl(discoveredMagnetoUrl);
    } else {
      setMagnetoWsUrl(FALLBACK_MAGNETO_WS_URL);
    }
    
    if (discoveredMouseUrl && discoveredMagnetoUrl) {
      const discoveredIP = (discoveredMouseUrl as string).split(':')[1].slice(2);
      setMdnsStatus(`Discovered services at ${discoveredIP}`);
    } else if (discoveredMouseUrl) {
      const discoveredIP = (discoveredMouseUrl as string).split(':')[1].slice(2);
      setMdnsStatus(`Mouse service found at ${discoveredIP} (magneto using fallback)`);
    } else if (discoveredMagnetoUrl) {
      const discoveredIP = (discoveredMagnetoUrl as string).split(':')[1].slice(2);
      setMdnsStatus(`Magneto service found at ${discoveredIP} (mouse not found)`);
    } else {
      setMdnsStatus('Mouse service not found - ensure pymouse.py is running');
    }
    
    setIsDiscovering(false);
  }, [isDiscovering, mouseWsUrl]);

  // mDNS discovery using native DNS-SD
  useEffect(() => {
    if (!Zeroconf || Platform.OS === 'web') {
      return;
    }
    const zeroconf = new Zeroconf();
    zeroconfRef.current = zeroconf;
    const handleResolved = (service: any) => {
      try {
        const serviceName = (service.name || '').toLowerCase();
        const serviceType = (service.type || '').toLowerCase();
        const host =
          (service.addresses && service.addresses[0]) ||
          service.host ||
          '';
        const port = service.port;
        if (!host || !port) {
          return;
        }
        const wsUrl = `ws://${host}:${port}`;
        if (
          serviceName.includes('pymouse') ||
          serviceType.includes('pymouse')
        ) {
          setMouseWsUrl((prev) => prev || wsUrl);
          setMdnsStatus(`mDNS: Mouse service at ${host}:${port}`);
        }
        if (
          serviceName.includes('magneto') ||
          serviceType.includes('magneto')
        ) {
          setMagnetoWsUrl((prev) => prev || wsUrl);
          setMdnsStatus(`mDNS: Magneto service at ${host}:${port}`);
        }
      } catch (e) {
        console.warn('[mDNS] Error handling resolved service', e);
      }
    };
    const handleError = (err: any) => {
      console.warn('[mDNS] Zeroconf error', err);
    };
    zeroconf.on('resolved', handleResolved);
    zeroconf.on('error', handleError);
    try {
      zeroconf.scan('pymouse', 'tcp', 'local.');
      zeroconf.scan('magneto', 'tcp', 'local.');
      setMdnsStatus('Discovering services via mDNS...');
    } catch (e) {
      console.warn('[mDNS] Failed to start scan', e);
    }
    return () => {
      try {
        zeroconf.removeListener('resolved', handleResolved);
        zeroconf.removeListener('error', handleError);
        zeroconf.stop();
        zeroconf.close();
      } catch {
        // ignore
      }
      zeroconfRef.current = null;
    };
  }, []);
  
  // Initial discovery on mount
  useEffect(() => {
    if (!mouseWsUrl && !isDiscovering) {
      discoverServices();
    }
  }, []);

  const connectMagnetoSocket = () => {
    if (magnetoWsRef.current && 
      (magnetoWsRef.current.readyState === WebSocket.OPEN || 
       magnetoWsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const ws = new WebSocket(magnetoWsUrl);
      ws.onopen = () => {
        console.log('[Magneto] WebSocket connected');
      };
      ws.onerror = (event) => {
        console.warn('[Magneto] WebSocket error', event);
      };
      ws.onclose = () => {
        console.log('[Magneto] WebSocket closed');
      };
      magnetoWsRef.current = ws;
    } catch (err) {
      console.warn('[Magneto] Failed to open WebSocket', err);
    }
  };

  const disconnectMagnetoSocket = () => {
    if (magnetoWsRef.current) {
      try {
        magnetoWsRef.current.close();
      } catch (err) {
        console.warn('[Magneto] Error closing WebSocket', err);
      }
      magnetoWsRef.current = null;
    }
  };

  const connectMouseSocket = () => {
    if (!mouseWsUrl) {
      console.warn('[Mouse] No mouse service URL available - discovery may have failed');
      return;
    }

    if (mouseWsRef.current && 
      (mouseWsRef.current.readyState === WebSocket.OPEN || 
       mouseWsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      const ws = new WebSocket(mouseWsUrl);
      ws.onopen = () => {
        console.log('[Mouse] WebSocket connected');
      };
      ws.onerror = (event) => {
        console.warn('[Mouse] WebSocket error', event);
      };
      ws.onclose = () => {
        console.log('[Mouse] WebSocket closed');
      };
      mouseWsRef.current = ws;
    } catch (err) {
      console.warn('[Mouse] Failed to open WebSocket', err);
    }
  };

  const disconnectMouseSocket = () => {
    if (mouseWsRef.current) {
      try {
        if (mouseWsRef.current.readyState === WebSocket.OPEN) {
          const payload = JSON.stringify({
            type: 'touch',
            t: Date.now(),
            action: 'end',
            x: 0,
            y: 0,
            screenWidth: Math.round(screenWidth),
            screenHeight: Math.round(screenHeight),
          });
          mouseWsRef.current.send(payload);
        }
        mouseWsRef.current.close();
      } catch (err) {
        console.warn('[Mouse] Error closing WebSocket', err);
      }
      mouseWsRef.current = null;
    }
  };


  // Manage magnetometer subscription for streaming
  useEffect(() => {
    if (!magnetoStreaming) {
      if (magSubRef.current) {
        try {
          magSubRef.current.remove();
        } catch {}
        magSubRef.current = null;
      }
      setMagnetometerData(null);
      return;
    }

    if (magSubRef.current) {
      try {
        magSubRef.current.remove();
      } catch {}
    }
    try {
      magSubRef.current = Magnetometer.addListener(setMagnetometerData);
      Magnetometer.setUpdateInterval(100);
    } catch (err) {
      console.warn('[Magneto] Failed to subscribe magnetometer', err);
    }

    return () => {
      if (magSubRef.current) {
        try {
          magSubRef.current.remove();
        } catch {}
        magSubRef.current = null;
      }
    };
  }, [magnetoStreaming]);

  // Open / close WebSocket when streaming toggled
  useEffect(() => {
    if (magnetoStreaming) {
      connectMagnetoSocket();
    } else {
      disconnectMagnetoSocket();
    }

    return () => {
      if (!magnetoStreaming) {
        disconnectMagnetoSocket();
      }
    };
  }, [magnetoStreaming]);

  // Open / close WebSocket when mouse control toggled
  useEffect(() => {
    if (mouseControlActive) {
      connectMouseSocket();
    } else {
      disconnectMouseSocket();
      onTouchpadVisible(false);
    }
    return () => {
      disconnectMouseSocket();
    };
  }, [mouseControlActive, mouseWsUrl]);

  // Push latest magnetometer readings over WebSocket
  useEffect(() => {
    if (!magnetoStreaming) {
      return;
    }

    if (!magnetometerData) {
      return;
    }
    if (!magnetoWsRef.current) {
      return;
    }
    if (magnetoWsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      const payload = JSON.stringify({
        type: 'magnetometer',
        t: Date.now(),
        x: magnetometerData.x,
        y: magnetometerData.y,
        z: magnetometerData.z,
      });
      magnetoWsRef.current.send(payload);
    } catch (err) {
      console.warn('[Magneto] Failed to send magnetometer sample', err);
    }
  }, [magnetometerData, magnetoStreaming]);

  const handleMouseControlToggle = () => {
    if (!mouseControlActive) {
      if (!mouseWsUrl) {
        setMdnsStatus('Mouse service not found - cannot start');
        return;
      }
      setMouseControlActive(true);
      onMouseControlActive(true);
      onTouchpadVisible(true);
    } else {
      setMouseControlActive(false);
      onMouseControlActive(false);
      onTouchpadVisible(false);
    }
  };

  return (
    <>
      <View style={{ marginTop: 24, alignItems: 'center' }}>
        <Pressable
          onPress={() => setMagnetoStreaming((v) => !v)}
          style={{
            backgroundColor: magnetoStreaming ? '#43a047' : '#222',
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 32,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 2,
            marginBottom: 4,
            minWidth: 280,
            maxWidth: 320,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, textAlign: 'center' }}>
            {magnetoStreaming ? 'Stop Magnetometer → Python Stream' : 'Start Magnetometer → Python Stream'}
          </Text>
        </Pressable>
        <Text style={{ color: '#888', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
          Streams magnetometer x / y / z over WebSocket to Python at {magnetoWsUrl}.
        </Text>
        <Text style={{ color: '#666', fontSize: 10, marginTop: 2, textAlign: 'center' }}>
          {mdnsStatus}
        </Text>
      </View>

      <View style={{ marginTop: 24, alignItems: 'center' }}>
        <Pressable
          onPress={handleMouseControlToggle}
          style={{
            backgroundColor: mouseControlActive ? '#43a047' : (!mouseWsUrl ? '#666' : '#222'),
            paddingHorizontal: 24,
            paddingVertical: 14,
            borderRadius: 32,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4,
            elevation: 2,
            marginBottom: 4,
            opacity: !mouseWsUrl ? 0.5 : 1,
            minWidth: 280,
            maxWidth: 320,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, textAlign: 'center' }}>
            {mouseControlActive ? 'Stop Mouse Control' : (!mouseWsUrl ? 'Mouse Service Not Found' : 'Start Mouse Control')}
          </Text>
        </Pressable>
        <Text style={{ color: '#888', fontSize: 12, marginTop: 4, textAlign: 'center' }}>
          {mouseWsUrl ? `Control mouse via touchpad over WebSocket to Python at ${mouseWsUrl}.` : 'Mouse service discovery failed. Please ensure pymouse.py is running.'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 4, gap: 8 }}>
          <Text style={{ color: '#666', fontSize: 10, textAlign: 'center' }}>
            {mdnsStatus}
          </Text>
          {!mouseWsUrl && (
            <Pressable
              onPress={discoverServices}
              disabled={isDiscovering}
              style={{
                backgroundColor: isDiscovering ? '#444' : '#39ff14',
                paddingHorizontal: 12,
                paddingVertical: 4,
                borderRadius: 4,
                opacity: isDiscovering ? 0.5 : 1,
              }}
            >
              <Text style={{ color: '#000', fontSize: 10, fontWeight: '600' }}>
                {isDiscovering ? 'Discovering...' : 'Retry'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </>
  );
}

