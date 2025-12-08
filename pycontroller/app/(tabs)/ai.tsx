import React, { useState } from 'react';
import { StyleSheet, View, Text, SafeAreaView, ScrollView, Pressable } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import NumericalPrediction from '@/app/ai/numerical-prediction';
import Convolution from '@/app/ai/convolution';

// Collapsible section component
function CollapsibleSection({ 
  title, 
  children, 
  defaultExpanded = false 
}: { 
  title: string; 
  children: React.ReactNode; 
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  return (
    <View style={collapsibleStyles.section}>
      <Pressable 
        onPress={() => setExpanded(!expanded)}
        style={collapsibleStyles.header}
      >
        <Text style={collapsibleStyles.headerText}>{title}</Text>
        <MaterialIcons 
          name={expanded ? 'expand-less' : 'expand-more'} 
          size={24} 
          color="#fff" 
        />
      </Pressable>
      {expanded && (
        <View style={collapsibleStyles.content}>
          {children}
        </View>
      )}
    </View>
  );
}

export default function AIScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.container}>
          <CollapsibleSection title="Convolution" defaultExpanded={true}>
            <Convolution />
          </CollapsibleSection>
          <CollapsibleSection title="Numerical Prediction">
            <NumericalPrediction />
          </CollapsibleSection>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 0,
  },
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 24,
  },
});

const collapsibleStyles = StyleSheet.create({
  section: {
    marginBottom: 16,
    backgroundColor: '#111',
    borderRadius: 8,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#222',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  content: {
    padding: 16,
  },
});

