import React, { useState, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

// Generate random pixel data
function generateRandomPixelData(width: number, height: number): Array<Array<{ r: number; g: number; b: number }>> {
  const pixels: Array<Array<{ r: number; g: number; b: number }>> = [];
  
  for (let y = 0; y < height; y++) {
    const row: Array<{ r: number; g: number; b: number }> = [];
    for (let x = 0; x < width; x++) {
      row.push({
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256),
      });
    }
    pixels.push(row);
  }
  
  return pixels;
}

// High resolution pixel renderer component
// Uses a more efficient approach for React Native
function PixelMapRenderer({ 
  width, 
  height, 
  pixelSize = 1,
  seed 
}: { 
  width: number; 
  height: number; 
  pixelSize?: number;
  seed?: string | number;
}) {
  const pixelData = useMemo(() => generateRandomPixelData(width, height), [width, height, seed]);
  
  // For performance, we'll render rows and use flexWrap for pixels
  return (
    <View style={styles.pixelContainer}>
      {pixelData.map((row, y) => (
        <View key={y} style={[styles.pixelRow, { height: pixelSize }]}>
          {row.map((pixel, x) => (
            <View
              key={`${x}-${y}`}
              style={{
                width: pixelSize,
                height: pixelSize,
                backgroundColor: `rgb(${pixel.r}, ${pixel.g}, ${pixel.b})`,
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export default function VisualShowcase() {
  const [resolution, setResolution] = useState<'low' | 'medium' | 'high' | 'ultra'>('medium');
  const [regenerateKey, setRegenerateKey] = useState(0);
  
  const resolutionConfig = {
    low: { width: 100, height: 100, pixelSize: 2 },
    medium: { width: 200, height: 200, pixelSize: 1 },
    high: { width: 400, height: 400, pixelSize: 0.5 },
    ultra: { width: 800, height: 800, pixelSize: 0.25 },
  };
  
  const config = resolutionConfig[resolution];
  const maxDisplayWidth = screenWidth - 48; // Account for padding
  const scale = Math.min(1, maxDisplayWidth / config.width);
  const displayWidth = config.width * scale;
  const displayHeight = config.height * scale;
  
  const handleRegenerate = () => {
    // Force re-render by updating the key
    setRegenerateKey(prev => prev + 1);
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
          {config.width} × {config.height} pixels ({config.width * config.height.toLocaleString()} total)
        </Text>
      </View>
      
      <View style={[styles.imageContainer, { width: displayWidth, height: displayHeight }]}>
        <PixelMapRenderer
          key={`${resolution}-${regenerateKey}`}
          width={config.width}
          height={config.height}
          pixelSize={config.pixelSize}
          seed={regenerateKey}
        />
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
  pixelContainer: {
    flexDirection: 'column',
  },
  pixelRow: {
    flexDirection: 'row',
  },
});
