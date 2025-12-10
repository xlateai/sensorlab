import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';

// Import ViewportView from sensorlib
let ViewportView: React.ComponentType<any> | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore - ViewportView exported from sensorlib
  const sensorlib = require('sensorlib');
  ViewportView = sensorlib.ViewportView;
} catch (e) {
  // Native view not available yet - will use JavaScript fallback
  console.warn('ViewportView not available, using JavaScript rendering');
}

const { width: screenWidth } = Dimensions.get('window');

export default function VisualShowcase() {
  const [resolution, setResolution] = useState<'low' | 'medium' | 'high' | 'ultra'>('medium');
  const [seed, setSeed] = useState(0);
  
  const resolutionConfig = {
    low: { width: 100, height: 100 },
    medium: { width: 200, height: 200 },
    high: { width: 400, height: 400 },
    ultra: { width: 800, height: 800 },
  };
  
  const config = resolutionConfig[resolution];
  const maxDisplayWidth = screenWidth - 48; // Account for padding
  const scale = Math.min(1, maxDisplayWidth / config.width);
  const displayWidth = config.width * scale;
  const displayHeight = config.height * scale;
  
  const handleRegenerate = () => {
    // Update seed to trigger regeneration in native view
    setSeed(prev => prev + 1);
  };
  
  return (
    <View style={styles.container}>
      <View style={styles.controls}>
        <Text style={styles.label}>Resolution:</Text>
        <View style={styles.buttonRow}>
          {(['low', 'medium', 'high', 'ultra'] as const).map((res) => (
            <Pressable
              key={res}
              onPress={() => setResolution(res)}
              style={[
                styles.resolutionButton,
                resolution === res && styles.resolutionButtonActive,
              ]}
            >
              <Text
                style={[
                  styles.resolutionButtonText,
                  resolution === res && styles.resolutionButtonTextActive,
                ]}
              >
                {res.charAt(0).toUpperCase() + res.slice(1)}
              </Text>
            </Pressable>
          ))}
        </View>
        
        <Pressable
          onPress={handleRegenerate}
          style={styles.regenerateButton}
        >
          <Text style={styles.regenerateButtonText}>Regenerate</Text>
        </Pressable>
        
        <Text style={styles.info}>
          {config.width} × {config.height} pixels ({(config.width * config.height).toLocaleString()} total)
        </Text>
      </View>
      
      <View style={[styles.imageContainer, { width: displayWidth, height: displayHeight }]}>
        {ViewportView ? (
          React.createElement(ViewportView, {
            width: config.width,
            height: config.height,
            seed: seed,
            style: StyleSheet.absoluteFill,
          })
        ) : (
          <View style={[StyleSheet.absoluteFill, { justifyContent: 'center', alignItems: 'center' }]}>
            <Text style={{ color: '#888' }}>ViewportView not available</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    alignItems: 'center',
  },
  controls: {
    width: '100%',
    marginBottom: 24,
    gap: 16,
  },
  label: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  resolutionButton: {
    backgroundColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
  },
  resolutionButtonActive: {
    backgroundColor: '#39ff14',
    borderColor: '#39ff14',
  },
  resolutionButtonText: {
    color: '#888',
    fontSize: 14,
    fontWeight: '600',
  },
  resolutionButtonTextActive: {
    color: '#000',
  },
  regenerateButton: {
    backgroundColor: '#39ff14',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  regenerateButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '600',
  },
  info: {
    color: '#888',
    fontSize: 12,
  },
  imageContainer: {
    borderWidth: 2,
    borderColor: '#39ff14',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
});
