import { Tabs, useNavigation } from 'expo-router';
import React, { useRef, useEffect } from 'react';
import { View, PanResponder, Dimensions } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useFullscreen } from '../FullscreenContext';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const navigation = useNavigation();
  const screenWidth = Dimensions.get('window').width;
  const { fullscreen, setFullscreen } = useFullscreen();

  const gestureReadyRef = useRef(false);
  const swipeCompleteTimeRef = useRef<number | null>(null);
  const swipeActiveRef = useRef(false);
  const lastToggleTimeRef = useRef<number>(0);

  // PanResponder for left-to-right swipe to toggle fullscreen (global across all tabs)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) => {
        const { locationX, locationY } = evt.nativeEvent;
        const { height: screenHeight } = Dimensions.get('window');
        // Only capture if on left edge AND not in tab bar area (bottom ~10% of screen)
        const isLeftEdge = locationX < screenWidth * 0.1;
        const isTabBarArea = locationY > screenHeight * 0.9;
        if (isTabBarArea) return false; // Never capture touches in tab bar area
        
        // Reset gesture state for new gesture
        gestureReadyRef.current = false;
        swipeActiveRef.current = false;
        swipeCompleteTimeRef.current = null;
        
        return isLeftEdge;
      },
      // Don't use capture phase - let tab bar receive touches first
      onStartShouldSetPanResponderCapture: () => false,
      onPanResponderGrant: () => {
        swipeActiveRef.current = true;
      },
      onPanResponderMove: (evt, gestureState) => {
        if (
          !gestureReadyRef.current &&
          swipeActiveRef.current &&
          gestureState.dx > screenWidth * 0.85 &&
          evt.nativeEvent.locationX > screenWidth * 0.9 &&
          gestureState.moveX - gestureState.x0 > screenWidth * 0.85 &&
          gestureState.x0 < screenWidth * 0.1
        ) {
          gestureReadyRef.current = true;
          swipeCompleteTimeRef.current = Date.now();
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => {
        // Reset on release - allow gesture to be performed again
        swipeActiveRef.current = false;
        gestureReadyRef.current = false;
        swipeCompleteTimeRef.current = null;
      },
      onPanResponderStart: (evt) => {
        const now = Date.now();
        // Prevent rapid toggling (debounce)
        if (now - lastToggleTimeRef.current < 300) {
          return;
        }
        
        if (
          gestureReadyRef.current &&
          swipeActiveRef.current &&
          evt.nativeEvent.touches.length > 1 &&
          swipeCompleteTimeRef.current !== null &&
          now - swipeCompleteTimeRef.current < 250
        ) {
          lastToggleTimeRef.current = now;
          setFullscreen(f => !f);
          // Reset all state to allow gesture to work again
          gestureReadyRef.current = false;
          swipeActiveRef.current = false;
          swipeCompleteTimeRef.current = null;
        }
      },
    })
  ).current;

  return (
    <View 
      style={{ flex: 1 }} 
      {...panResponder.panHandlers}
    >
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarStyle: fullscreen ? { display: 'none' } : undefined,
        }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="creator"
        options={{
          title: 'Creator',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="qrcode" color={color} />,
        }}
      />
      <Tabs.Screen
        name="renshu"
        options={{
          title: '練習',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="character.book.closed" color={color} />,
        }}
      />
      <Tabs.Screen
        name="directional"
        options={{
          title: 'Heading',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="magnifyingglass.circle" color={color} />,
        }}
      />
      <Tabs.Screen
        name="audio"
        options={{
          title: 'Audio',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="waveform" color={color} />,
        }}
      />
      <Tabs.Screen
        name="threeD"
        options={{
          title: '3D',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="cube" color={color} />, // pick a cube icon for 3D
        }}
      />
      <Tabs.Screen
        name="video"
        options={{
          title: 'Video',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="play.rectangle" color={color} />, // video icon
        }}
      />
      <Tabs.Screen
        name="dev"
        options={{
          title: 'Dev',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chevron.left.forwardslash.chevron.right" color={color} />,
        }}
      />
      </Tabs>
    </View>
  );
}
