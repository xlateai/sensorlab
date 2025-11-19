import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
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
        name="threeD"
        options={{
          title: '3D',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="cube" color={color} />, // pick a cube icon for 3D
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
  );
}
