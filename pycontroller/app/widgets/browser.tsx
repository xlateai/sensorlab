import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';

// Try to import WebView, fallback to a message if not available
let WebView: any = null;
try {
  WebView = require('react-native-webview').WebView;
} catch (e) {
  console.warn('react-native-webview not available');
}

export default function Browser() {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    // Try to get URL from clipboard when component mounts
    loadFromClipboard();
  }, []);

  const loadFromClipboard = async () => {
    try {
      const clipboardText = await Clipboard.getStringAsync();
      if (clipboardText) {
        const trimmed = clipboardText.trim();
        const normalized = normalizeUrl(trimmed);
        if (isValidUrl(normalized)) {
          setUrl(normalized);
        }
      }
    } catch (error) {
      console.error('Error reading clipboard:', error);
    }
  };

  const isValidUrl = (string: string): boolean => {
    try {
      const urlObj = new URL(string);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (_) {
      return false;
    }
  };

  const normalizeUrl = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    
    // If it already has a protocol, use it
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    
    // Otherwise, add https://
    return 'https://' + trimmed;
  };

  if (!WebView) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          WebView is not available. Please install react-native-webview:
          {'\n\n'}npm install react-native-webview
        </Text>
      </View>
    );
  }

  if (!url) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>No URL found in clipboard. Copy a URL and reopen this view.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        startInLoadingState={true}
        backgroundColor="#000000"
        // Inject CSS to force dark mode and black background
        injectedJavaScript={`
          (function() {
            const style = document.createElement('style');
            style.innerHTML = \`
              body {
                background-color: #000000 !important;
                color: #ffffff !important;
              }
              html {
                background-color: #000000 !important;
              }
              * {
                background-color: inherit;
              }
            \`;
            document.head.appendChild(style);
            
            // Also set meta theme-color for browser UI
            const meta = document.createElement('meta');
            meta.name = 'theme-color';
            meta.content = '#000000';
            document.head.appendChild(meta);
          })();
          true; // note: this is required, or you'll sometimes get silent failures
        `}
        onMessage={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  hint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    padding: 40,
    lineHeight: 20,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
    lineHeight: 20,
  },
});
