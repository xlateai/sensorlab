import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface TypeRacerMediaControlMenuProps {
  onRetryPress?: () => void;
  onPlayPress?: () => void;
  onListPress?: () => void;
  onPrevPress?: () => void;
  onShufflePress?: () => void;
  onSkipPress?: () => void;
  shuffleMode?: boolean;
  historyPos?: number;
  history?: number[];
  currentIndex?: number;
  textExamplesJSONData?: any[];
}

export const TypeRacerMediaControlMenu: React.FC<TypeRacerMediaControlMenuProps> = ({
  onRetryPress,
  onPlayPress,
  onListPress,
  onPrevPress,
  onShufflePress,
  onSkipPress,
  shuffleMode,
  historyPos,
  history,
  currentIndex,
  textExamplesJSONData,
}) => {
  const insets = useSafeAreaInsets();
  return (
    <View style={{position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom / 2, paddingHorizontal: 24, zIndex: 100, backgroundColor: 'transparent'}} pointerEvents="box-none">
    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%'}} pointerEvents="box-none">
      {/* Retry button - bottom left */}
      <TouchableOpacity
        style={{backgroundColor: '#222', width: 57.6, height: 57.6, borderRadius: 28.8, alignItems: 'center', justifyContent: 'center'}}
        onPress={(e) => {
          e.stopPropagation();
          onRetryPress?.();
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="replay" size={28.8} color="#39FF14" />
      </TouchableOpacity>

      {/* Keyboard button - center */}
      <TouchableOpacity
        style={{backgroundColor: '#39FF14', width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', shadowColor: '#39FF14', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: {width: 0, height: 2}}}
        activeOpacity={0.85}
        onPress={(e) => {
          e.stopPropagation();
          onPlayPress?.();
        }}
      >
        <MaterialIcons name="keyboard" size={43.2} color="#222" />
      </TouchableOpacity>

      {/* List button - bottom right */}
      <TouchableOpacity
        style={{backgroundColor: '#222', width: 57.6, height: 57.6, borderRadius: 28.8, alignItems: 'center', justifyContent: 'center'}}
        onPress={(e) => {
          e.stopPropagation();
          onListPress?.();
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="list" size={28.8} color="#39FF14" />
      </TouchableOpacity>
    </View>
    {/* Media controls row above: previous, shuffle, skip */}
    <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12}} pointerEvents="box-none">
      {/* Previous button */}
      <TouchableOpacity
        style={{backgroundColor: historyPos === 0 ? '#444' : '#222', width: 50.4, height: 50.4, borderRadius: 25.2, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16}}
        disabled={historyPos === 0}
        onPress={(e) => {
          e.stopPropagation();
          if (historyPos !== 0) {
            onPrevPress?.();
          }
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="skip-previous" size={28.8} color={historyPos === 0 ? '#888' : '#fff'} />
      </TouchableOpacity>

      {/* Shuffle toggle */}
      <TouchableOpacity
        style={{backgroundColor: '#222', width: 50.4, height: 50.4, borderRadius: 25.2, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16}}
        onPress={(e) => {
          e.stopPropagation();
          onShufflePress?.();
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="shuffle" size={28.8} color={shuffleMode ? "#39FF14" : "#fff"} />
      </TouchableOpacity>

      {/* Skip button */}
      <TouchableOpacity
        style={{backgroundColor: textExamplesJSONData?.length === 0 ? '#444' : '#222', width: 50.4, height: 50.4, borderRadius: 25.2, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16}}
        disabled={textExamplesJSONData?.length === 0}
        onPress={(e) => {
          e.stopPropagation();
          if (textExamplesJSONData?.length !== 0) {
            onSkipPress?.();
          }
        }}
        activeOpacity={0.7}
      >
        <MaterialIcons name="skip-next" size={28.8} color={textExamplesJSONData?.length === 0 ? '#888' : '#fff'} />
      </TouchableOpacity>
    </View>
  </View>
  );
};

export default TypeRacerMediaControlMenu;