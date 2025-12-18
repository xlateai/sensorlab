import React, { useEffect, useState } from 'react';
import { Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';

import globalState from '@/services/global-state';
import pythonService from '@/services/python-execution';

export default function ViewportScreen() {
  const screenDimensions = Dimensions.get('window');
  const screenScale = Dimensions.get('screen').scale;
  const [viewportData, setViewportData] = useState(globalState.getViewportData());
  const [isExecuting, setIsExecuting] = useState(globalState.isExecuting());
  
  // Get actual pixel resolution - make it perfectly square
  let baseWidth, baseHeight, viewportSize;
  
  if (Platform.OS === 'web') {
    // Use browser's actual screen resolution
    baseWidth = window.screen.width * (window.devicePixelRatio || 1);
    baseHeight = window.screen.height * (window.devicePixelRatio || 1);
  } else {
    // Mobile: logical points × scale factor for true pixel resolution
    baseWidth = Math.floor(screenDimensions.width * screenScale);
    baseHeight = Math.floor(screenDimensions.height * screenScale);
  }
  
  // Make viewport perfectly square using minimum dimension
  viewportSize = Math.min(baseWidth, baseHeight);
  const viewportWidth = viewportSize;
  const viewportHeight = viewportSize;

  // Subscribe to viewport and execution state updates
  useEffect(() => {
    const unsubscribeViewport = globalState.subscribe('viewportUpdated', (data: any) => {
      setViewportData(data);
    });

    const unsubscribeExecution = globalState.subscribe('executionStateChanged', (executing: boolean) => {
      setIsExecuting(executing);
    });

    return () => {
      unsubscribeViewport();
      unsubscribeExecution();
    };
  }, []);

  const handleRunCode = async () => {
    if (isExecuting) {
      // If already executing, request cancellation
      globalState.requestExecutionCancel();
      globalState.addConsoleMessage('output', '🛑 Execution cancelled by user');
      globalState.setExecuting(false);
      return;
    }

    globalState.setExecuting(true);
    globalState.addConsoleMessage('input', '>>> Running current code...');
    
    try {
      // Execute current code and update viewport data
      const result = await pythonService.executeCurrentCodeWithViewport();

      // Check if cancellation was requested during execution
      if (globalState.isExecutionCancelRequested()) {
        globalState.addConsoleMessage('output', '🛑 Execution was cancelled');
        return;
      }

      if (result.trim()) {
        globalState.addConsoleMessage('output', result);
      }

    } catch (error) {
      if (!globalState.isExecutionCancelRequested()) {
        globalState.addConsoleMessage('error', `Error: ${error}`);
      }
    } finally {
      globalState.setExecuting(false);
    }
  };

  // Render viewport content
  const renderViewport = () => {
    if (viewportData && viewportData.data && viewportData.data.length > 0) {
      // On web, we can use canvas for pixel-perfect rendering
      if (Platform.OS === 'web') {
        return (
          <canvas
            ref={(canvas) => {
              if (canvas && viewportData.data) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                  // Clear canvas with black background first
                  ctx.fillStyle = '#000000';
                  ctx.fillRect(0, 0, viewportWidth, viewportHeight);
                  
                  // Create image data from viewport data
                  const imageData = ctx.createImageData(viewportData.width, viewportData.height);
                  
                  // Convert RGB to RGBA
                  for (let i = 0; i < viewportData.data.length; i += 3) {
                    const pixelIndex = (i / 3) * 4;
                    imageData.data[pixelIndex] = viewportData.data[i];     // R
                    imageData.data[pixelIndex + 1] = viewportData.data[i + 1]; // G
                    imageData.data[pixelIndex + 2] = viewportData.data[i + 2]; // B
                    imageData.data[pixelIndex + 3] = 255; // A (fully opaque)
                  }
                  
                  // Create temporary canvas to scale the image
                  const tempCanvas = document.createElement('canvas');
                  const tempCtx = tempCanvas.getContext('2d');
                  tempCanvas.width = viewportData.width;
                  tempCanvas.height = viewportData.height;
                  
                  if (tempCtx) {
                    tempCtx.putImageData(imageData, 0, 0);
                    
                    // Scale and draw to main canvas
                    ctx.imageSmoothingEnabled = false; // Keep pixelated
                    ctx.drawImage(tempCanvas, 0, 0, viewportData.width, viewportData.height, 
                                                0, 0, viewportWidth, viewportHeight);
                  }
                }
              }
            }}
            width={viewportWidth}
            height={viewportHeight}
            style={{
              imageRendering: 'pixelated',
              width: '100vmin', // Use viewport minimum (square)
              height: '100vmin', // Use viewport minimum (square)
              display: 'block',
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        );
      } else {
        // Mobile renderer using WebView canvas
        const canvasHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        html, body {
            width: 100%;
            height: 100%;
            background: #000000;
            overflow: hidden;
        }
        canvas {
            display: block;
            width: 100vmin; /* Use viewport minimum (square) */
            height: 100vmin; /* Use viewport minimum (square) */
            margin: auto;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            image-rendering: pixelated;
            image-rendering: -moz-crisp-edges;
            image-rendering: crisp-edges;
        }
    </style>
</head>
<body>
    <canvas id="viewport" width="${viewportWidth}" height="${viewportHeight}"></canvas>
    
    <script>
        const canvas = document.getElementById('viewport');
        const ctx = canvas.getContext('2d');
        
        // Screen dimensions
        const screenWidth = ${viewportWidth};
        const screenHeight = ${viewportHeight};
        
        // Clear with black background
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        
        // Viewport data from React Native
        const width = ${viewportData.width};
        const height = ${viewportData.height};
        const pixelData = [${viewportData.data.join(',')}];
        
        // Create ImageData for the original viewport size
        const imageData = ctx.createImageData(width, height);
        
        // Convert RGB to RGBA
        for (let i = 0; i < pixelData.length; i += 3) {
            const pixelIndex = (i / 3) * 4;
            imageData.data[pixelIndex] = pixelData[i];     // R
            imageData.data[pixelIndex + 1] = pixelData[i + 1]; // G
            imageData.data[pixelIndex + 2] = pixelData[i + 2]; // B
            imageData.data[pixelIndex + 3] = 255; // A (fully opaque)
        }
        
        // Create temporary canvas for scaling
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = width;
        tempCanvas.height = height;
        
        // Put original data on temp canvas
        tempCtx.putImageData(imageData, 0, 0);
        
        // Scale and draw to main canvas
        ctx.imageSmoothingEnabled = false; // Keep pixelated
        ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, screenWidth, screenHeight);
    </script>
</body>
</html>`;

        return (
          <WebView
            source={{ html: canvasHTML }}
            style={styles.fullScreenViewport}
            scrollEnabled={false}
            bounces={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            scalesPageToFit={false}
            startInLoadingState={false}
          />
        );
      }
    } else {
      // Default empty viewport - fullscreen black canvas
      if (Platform.OS === 'web') {
        return (
          <canvas
            width={viewportWidth}
            height={viewportHeight}
            style={{
              width: '100vw',
              height: '100vh',
              display: 'block',
              backgroundColor: '#000000',
            }}
          />
        );
      } else {
        const blackCanvasHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; background: #000000; overflow: hidden; }
        canvas { display: block; width: 100vw; height: 100vh; background: #000000; }
    </style>
</head>
<body>
    <canvas id="viewport" width="${viewportWidth}" height="${viewportHeight}"></canvas>
    <script>
        const canvas = document.getElementById('viewport');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, ${viewportWidth}, ${viewportHeight});
    </script>
</body>
</html>`;
        
        return (
          <WebView
            source={{ html: blackCanvasHTML }}
            style={styles.fullScreenViewport}
            scrollEnabled={false}
            bounces={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            scalesPageToFit={false}
            startInLoadingState={false}
          />
        );
      }
    }
  };

  return (
    <>
      {/* True fullscreen viewport renderer - behind everything */}
      <View style={styles.absoluteFullScreen}>
        {renderViewport()}
      </View>

      {/* Run Code Button - floating overlay */}
      <TouchableOpacity
        style={[
          styles.runButton, 
          isExecuting && styles.pauseButton
        ]}
        onPress={handleRunCode}
      >
        <Text style={[
          styles.runButtonText,
          isExecuting && styles.pauseButtonText
        ]}>
          {isExecuting ? '■' : 'Run Code'}
        </Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000000',
    position: 'relative',
  },
  absoluteFullScreen: {
    position: 'absolute',
    top: -100, // Extend behind status bar
    left: 0,
    right: 0,
    bottom: -100, // Extend behind tab bar
    backgroundColor: '#000000',
    zIndex: 1,
  },
  fullScreenViewport: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  runButton: {
    position: 'absolute',
    bottom: 100,
    left: '50%',
    transform: [{ translateX: -50 }],
    backgroundColor: '#00ff00',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    zIndex: 1000,
    minWidth: 100, // Ensure consistent width for proper centering
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButton: {
    backgroundColor: '#ff4444', // Red color for pause/stop
  },
  runButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  pauseButtonText: {
    fontSize: 20, // Slightly smaller to ensure good fit
    fontFamily: Platform.select({
      ios: 'System', // Use system font for better symbol rendering
      android: 'System',
      default: 'System',
    }),
    textAlign: 'center',
  },
});