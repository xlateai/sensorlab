import React from 'react';
import { View } from 'react-native';
import Main from '../main';
import { FullscreenAwareScreen } from '../FullscreenContext';

export default function HomeScreen() {
  return (
    <FullscreenAwareScreen>
      <View style={{ flex: 1 }}>
        <Main key="mode-zero" />
      </View>
    </FullscreenAwareScreen>
  );
}

