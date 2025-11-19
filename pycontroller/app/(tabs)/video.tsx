import React, { useMemo } from 'react';
import { Dimensions } from 'react-native';
import { View } from 'react-native';

const PIXEL_WIDTH = 256;

export default function VideoScreen() {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  // Calculate pixel height based on aspect ratio
  const pixelHeight = Math.round((screenHeight / screenWidth) * PIXEL_WIDTH);
  // Calculate pixel size to fill viewport
  const pixelSize = screenWidth / PIXEL_WIDTH;
  const canvasHeight = pixelHeight * pixelSize;

  // Generate gradient pixel data (green to black)
  const pixelData = useMemo(() => {
    const data = [];
    for (let y = 0; y < pixelHeight; y++) {
      const t = y / (pixelHeight - 1);
      const r = 0;
      const g = Math.round(255 * (1 - t));
      const b = 0;
      data.push(`rgb(${r},${g},${b})`);
    }
    return data;
  }, [pixelHeight]);

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ width: screenWidth, height: canvasHeight, flexDirection: 'column' }}>
        {pixelData.map((color, y) => (
          <View key={y} style={{ width: screenWidth, height: pixelSize, backgroundColor: color }} />
        ))}
      </View>
    </View>
  );
}
