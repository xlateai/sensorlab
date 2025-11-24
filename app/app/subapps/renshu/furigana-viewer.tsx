import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type JapaneseObject = {
  string: string;
  reading?: string;
  english: string;
};

interface FuriganaViewerProps {
  objects: JapaneseObject[];
  completedCount?: number;
  showFurigana?: boolean;
}

export const FuriganaViewer: React.FC<FuriganaViewerProps> = ({
  objects,
  completedCount = 0,
  showFurigana = true,
}) => (
  <View style={styles.sentenceContainer}>
    <View style={styles.sentenceRow}>
      {objects.map((obj, idx) => {
        const isCompleted = idx < completedCount;
        return (
          <View key={idx} style={styles.wordBlock}>
            {showFurigana ? (
              <Text style={styles.furigana}>{obj.reading && obj.reading !== obj.string ? obj.reading : ' '}</Text>
            ) : null}
            <Text style={[styles.japanese, isCompleted ? {color: '#39FF14'} : {color: '#b0b0b0'}]}>{obj.string}</Text>
          </View>
        );
      })}
    </View>
  </View>
);

const styles = StyleSheet.create({
  sentenceContainer: {
    width: '100%',
    paddingLeft: 4,
    paddingRight: 4,
    marginBottom: 8,
  },
  sentenceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    width: '100%',
  },
  wordBlock: {
    flexDirection: 'column',
    alignItems: 'center',
    marginHorizontal: 1,
    marginBottom: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    minWidth: 18,
    flexShrink: 0,
  },
  furigana: {
     fontSize: 14,
     color: '#e0e0e0',
     marginBottom: 0,
     textAlign: 'left',
     userSelect: 'none',
  },
  japanese: {
    fontSize: 35.6, // lowered by 10%
    fontWeight: 'bold',
    textAlign: 'left',
    color: '#fff',
  },
});