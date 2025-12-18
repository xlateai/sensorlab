import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, SafeAreaView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewportScreen from './viewport';
import TerminalScreen from './terminal';
import CodeScreen from './code';

type TabType = 'viewport' | 'terminal' | 'code';

export default function CoderScreen() {
  const [activeTab, setActiveTab] = useState<TabType>('viewport');
  const insets = useSafeAreaInsets();

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'viewport', label: 'Viewport', icon: '🖥️' },
    { id: 'terminal', label: 'Terminal', icon: '💻' },
    { id: 'code', label: 'Code', icon: '📝' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'viewport':
        return <ViewportScreen />;
      case 'terminal':
        return <TerminalScreen />;
      case 'code':
        return <CodeScreen />;
      default:
        return <ViewportScreen />;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      {/* Tab Bar */}
      <View style={[styles.tabBar, { paddingTop: insets.top }]}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[
              styles.tabButton,
              activeTab === tab.id && styles.activeTabButton,
            ]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text style={styles.tabIcon}>{tab.icon}</Text>
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.id && styles.activeTabLabel,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content Area */}
      <View style={styles.content}>{renderContent()}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#111111',
    borderBottomWidth: 1,
    borderBottomColor: '#333333',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: '#222222',
  },
  activeTabButton: {
    backgroundColor: '#39ff14',
  },
  tabIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  activeTabLabel: {
    color: '#000000',
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
  },
});

