import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TypeStatsBarProps {
  level?: string;
  casual?: string;
  index: number;
  total: number;
  incorrectCount: number;
  timeSpent: number;
  cps: number;
}

export const TypeStatsBar: React.FC<TypeStatsBarProps> = ({
  level,
  casual,
  index,
  total,
  incorrectCount,
  timeSpent,
  cps,
}) => (
  <View style={styles.container}>
    <View style={styles.topRow}>
      <View style={styles.cell}><Text style={styles.label}>Level</Text><Text style={styles.value}>{level ? `N${level}` : '-'}</Text></View>
      <View style={styles.cell}><Text style={styles.label}>Casual</Text><Text style={styles.value}>{casual || '-'}</Text></View>
      <View style={styles.cell}><Text style={styles.label}>Index</Text><Text style={styles.value}>{index} / {total}</Text></View>
    </View>
    <View style={styles.divider} />
    <View style={styles.bottomRow}>
      <View style={styles.cell}><Text style={styles.label}>Incorrect</Text><Text style={styles.value}>{incorrectCount}</Text></View>
  <View style={styles.cell}><Text style={styles.label}>Time</Text><Text style={styles.value}>{Math.round(timeSpent)}s</Text></View>
      <View style={styles.cell}><Text style={styles.label}>CPS</Text><Text style={styles.value}>{cps.toFixed(2)}</Text></View>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#181818',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#333',
    paddingVertical: 10,
    paddingHorizontal: 18,
    minWidth: 270,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 4,
    gap: 8,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 2,
    gap: 8,
  },
  divider: {
    width: '90%',
    height: 1,
    backgroundColor: '#222',
    marginVertical: 2,
    alignSelf: 'center',
    borderRadius: 1,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
    minWidth: 60,
  },
  label: {
    fontSize: 12,
    color: '#b0b0b0',
    marginBottom: 1,
  },
  value: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});