import React, { useState } from 'react';
import { StyleSheet, View, Text, SafeAreaView, Pressable, Modal, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import DirectionalScreen from '@/app/subapps/directional';
import ThreeDScreen from '@/app/subapps/threeD';
import TypeRacerScreen from '@/app/subapps/renshu/typeracer';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

type AppType = 'directional' | 'threeD' | 'renshu' | null;

export default function AppsScreen() {
  const [selectedApp, setSelectedApp] = useState<AppType>(null);
  const insets = useSafeAreaInsets();

  const apps = [
    {
      id: 'directional' as AppType,
      title: 'Heading',
      icon: 'magnifyingglass.circle' as const,
      description: 'Compass and directional heading',
    },
    {
      id: 'threeD' as AppType,
      title: '3D',
      icon: 'cube' as const,
      description: '3D orientation visualization',
    },
    {
      id: 'renshu' as AppType,
      title: '練習',
      icon: 'character.book.closed' as const,
      description: 'Japanese typing practice',
    },
  ];

  const renderApp = () => {
    switch (selectedApp) {
      case 'directional':
        return <DirectionalScreen />;
      case 'threeD':
        return <ThreeDScreen />;
      case 'renshu':
        return <TypeRacerScreen />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Apps</Text>
        <View style={styles.appGrid}>
          {apps.map((app) => (
            <Pressable
              key={app.id}
              onPress={() => setSelectedApp(app.id)}
              style={styles.appCard}
            >
              <IconSymbol name={app.icon} size={48} color="#39ff14" />
              <Text style={styles.appTitle}>{app.title}</Text>
              <Text style={styles.appDescription}>{app.description}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Full-screen app modal */}
      <Modal
        visible={selectedApp !== null}
        transparent={false}
        animationType="fade"
        onRequestClose={() => setSelectedApp(null)}
      >
        <View style={styles.modalContainer}>
          {renderApp()}
          <Pressable
            onPress={() => setSelectedApp(null)}
            style={[styles.dismissButton, { paddingBottom: Math.max(insets.bottom, 16) }]}
          >
            <Text style={styles.dismissButtonText}>Dismiss</Text>
          </Pressable>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000',
  },
  container: {
    flex: 1,
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 32,
  },
  appGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  appCard: {
    width: (screenWidth - 48 - 16) / 2, // Account for padding and gap
    aspectRatio: 1,
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#222',
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
    marginTop: 16,
    textAlign: 'center',
  },
  appDescription: {
    fontSize: 12,
    color: '#888',
    marginTop: 8,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  dismissButton: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#39ff14',
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    color: '#000',
    fontWeight: '600',
    fontSize: 18,
  },
});

