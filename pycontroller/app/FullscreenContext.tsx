import React, { createContext, useContext, useState, useEffect } from 'react';
import * as ExpoStatusBar from 'expo-status-bar';
import { Platform, View, StatusBar } from 'react-native';
import { playChimeHaptic } from './utils/haptics';

interface FullscreenContextType {
  fullscreen: boolean;
  setFullscreen: (value: boolean | ((prev: boolean) => boolean)) => void;
}

const FullscreenContext = createContext<FullscreenContextType>({
  fullscreen: true,
  setFullscreen: () => {},
});

export function useFullscreen() {
  return useContext(FullscreenContext);
}

export function FullscreenProvider({ children }: { children: React.ReactNode }) {
  const [fullscreen, setFullscreen] = useState(true);

  // Update status bar when fullscreen changes
  useEffect(() => {
    playChimeHaptic();
    if (fullscreen) {
      ExpoStatusBar.setStatusBarHidden(true, 'fade');
      if (Platform.OS === 'android') {
        ExpoStatusBar.setStatusBarTranslucent(true);
        ExpoStatusBar.setStatusBarStyle('light');
      }
    } else {
      ExpoStatusBar.setStatusBarHidden(false, 'fade');
      if (Platform.OS === 'android') {
        ExpoStatusBar.setStatusBarTranslucent(false);
        ExpoStatusBar.setStatusBarStyle('dark');
      }
    }
  }, [fullscreen]);

  return (
    <FullscreenContext.Provider value={{ fullscreen, setFullscreen }}>
      {children}
    </FullscreenContext.Provider>
  );
}

/**
 * Wrapper component for screens that need to respond to fullscreen state
 * Automatically handles StatusBar visibility based on fullscreen state
 */
export function FullscreenAwareScreen({ 
  children, 
  backgroundColor = '#000' 
}: { 
  children: React.ReactNode;
  backgroundColor?: string;
}) {
  const { fullscreen } = useFullscreen();
  
  return (
    <View style={{ flex: 1, backgroundColor }}>
      <StatusBar hidden={fullscreen} animated />
      {children}
    </View>
  );
}
