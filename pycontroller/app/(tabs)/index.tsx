

import React, { useRef, useState, useEffect } from 'react';
import { playChimeHaptic } from '../haptics';
import { StatusBar, View, PanResponder, Dimensions, Platform } from 'react-native';
import * as ExpoStatusBar from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import ModeZero from '../../components/magnetovision/modeZero';

export default function HomeScreen() {
  // Fullscreen state, default enabled
  const [fullscreen, setFullscreen] = useState(true);
  const navigation = useNavigation();
  const screenWidth = Dimensions.get('window').width;
  const toggledRef = useRef(false);
  const gestureReadyRef = useRef(false); // Swipe completed, ready for tap sequence
  const swipeCompleteTimeRef = useRef<number | null>(null); // Timestamp when swipe completed
  const swipeActiveRef = useRef(false); // Is swipe finger still down
  // No need for tapTimesRef, just track if tap happened
  const tapDetectedRef = useRef(false);

  // PanResponder for left-to-right swipe to toggle fullscreen (only once per gesture)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => {
        // Only start if touch is near the left edge (within 10% of screen width)
        toggledRef.current = false;
        gestureReadyRef.current = false;
        swipeActiveRef.current = false;
  // ...existing code...
        return evt.nativeEvent.locationX < screenWidth * 0.1;
      },
      onPanResponderGrant: (evt, gestureState) => {
        // Swipe finger is down
        swipeActiveRef.current = true;
      },
      onPanResponderMove: (evt, gestureState) => {
        // Track horizontal movement for swipe
        // If user swipes from left to right edge (at least 85% of screen width)
        if (
          !toggledRef.current &&
          !gestureReadyRef.current &&
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
        // Swipe finger released, reset everything
        swipeActiveRef.current = false;
        toggledRef.current = false;
        gestureReadyRef.current = false;
        swipeCompleteTimeRef.current = null;
      },
      onPanResponderStart: (evt, gestureState) => {
        // Multi-touch: check for additional finger taps
        if (
          gestureReadyRef.current &&
          swipeActiveRef.current &&
          evt.nativeEvent.touches.length > 1 &&
          swipeCompleteTimeRef.current !== null &&
          Date.now() - swipeCompleteTimeRef.current < 250 // within 250ms gotta tap quickly interval wait
        ) {
          // Detect a tap anywhere else on the screen (not the swipe finger)
          if (!tapDetectedRef.current) {
            tapDetectedRef.current = true;
            setFullscreen(f => !f);
            toggledRef.current = false;
            gestureReadyRef.current = false;
            swipeActiveRef.current = false;
            swipeCompleteTimeRef.current = null;
            setTimeout(() => { tapDetectedRef.current = false; }, 500); // reset for next gesture
          }
        }
      },
    })
  ).current;


  // Hide tab bar when fullscreen
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: fullscreen ? { display: 'none' } : undefined,
    });
    playChimeHaptic();
    if (fullscreen) {
      // Hide status bar and notch/time bar
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
  }, [fullscreen, navigation]);


  return (
    <View
      style={{ flex: 1, backgroundColor: '#000' }}
      {...panResponder.panHandlers}
    >
  <StatusBar hidden={fullscreen} animated />
      <View style={{ flex: 1 }}>
        <ModeZero />
      </View>
    </View>
  );
}

