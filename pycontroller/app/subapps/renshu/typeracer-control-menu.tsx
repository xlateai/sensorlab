import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

interface TypeRacerControlMenuProps {
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

export const TypeRacerControlMenu: React.FC<TypeRacerControlMenuProps> = ({
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
}) => (
  <View style={{position: 'absolute', left: 0, right: 0, bottom: 0, paddingBottom: 24, paddingHorizontal: 24, zIndex: 100, backgroundColor: 'transparent'}}>
    <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%'}}>
      {/* Retry button - bottom left */}
      <TouchableOpacity
        style={{backgroundColor: '#222', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center'}}
        onPress={onRetryPress}
      >
        <MaterialIcons name="replay" size={32} color="#39FF14" />
      </TouchableOpacity>

      {/* Keyboard button - center */}
      <TouchableOpacity
        style={{backgroundColor: '#39FF14', width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', shadowColor: '#39FF14', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: {width: 0, height: 2}}}
        activeOpacity={0.85}
        onPress={onPlayPress}
      >
        <MaterialIcons name="keyboard" size={48} color="#222" />
      </TouchableOpacity>

      {/* List button - bottom right */}
      <TouchableOpacity
        style={{backgroundColor: '#222', width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center'}}
        onPress={onListPress}
      >
        <MaterialIcons name="list" size={32} color="#39FF14" />
      </TouchableOpacity>
    </View>
    {/* Media controls row above: previous, shuffle, skip */}
    <View style={{flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 12}}>
      {/* Previous button */}
      <TouchableOpacity
        style={{backgroundColor: historyPos === 0 ? '#444' : '#222', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16}}
        disabled={historyPos === 0}
        onPress={onPrevPress}
      >
        <MaterialIcons name="skip-previous" size={32} color={historyPos === 0 ? '#888' : '#fff'} />
      </TouchableOpacity>

      {/* Shuffle toggle */}
      <TouchableOpacity
        style={{backgroundColor: '#222', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16}}
        onPress={onShufflePress}
      >
        <MaterialIcons name="shuffle" size={32} color={shuffleMode ? "#39FF14" : "#fff"} />
      </TouchableOpacity>

      {/* Skip button */}
      <TouchableOpacity
        style={{backgroundColor: textExamplesJSONData?.length === 0 ? '#444' : '#222', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', marginHorizontal: 16}}
        disabled={textExamplesJSONData?.length === 0}
        onPress={onSkipPress}
      >
        <MaterialIcons name="skip-next" size={32} color={textExamplesJSONData?.length === 0 ? '#888' : '#fff'} />
      </TouchableOpacity>
    </View>
  </View>
);

export default TypeRacerControlMenu;