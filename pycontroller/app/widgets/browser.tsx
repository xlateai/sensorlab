import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text, TextInput, Pressable, Alert, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
  const [inputUrl, setInputUrl] = useState<string>('');

  useEffect(() => {
    // Try to get URL from clipboard when component mounts
    loadFromClipboard();
  }, []);

  const loadFromClipboard = async () => {
    try {
      const clipboardText = await Clipboard.getStringAsync();
      if (clipboardText) {
        // Check if it looks like a URL
        const trimmed = clipboardText.trim();
        if (isValidUrl(trimmed)) {
          setUrl(trimmed);
          setInputUrl(trimmed);
        } else {
          setInputUrl(trimmed);
        }
      }
    } catch (error) {
      console.error('Error reading clipboard:', error);
    }
  };

  const isValidUrl = (string: string): boolean => {
    try {
      // Try to create a URL object
      const urlObj = new URL(string);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch (_) {
      // If it doesn't have http/https, try adding https://
      if (!string.startsWith('http://') && !string.startsWith('https://')) {
        try {
          new URL('https://' + string);
          return true;
        } catch (_) {
          return false;
        }
      }
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

  const handleGo = () => {
    if (!inputUrl.trim()) {
      Alert.alert('Error', 'Please enter a URL');
      return;
    }
    
    const normalized = normalizeUrl(inputUrl);
    if (isValidUrl(normalized) || isValidUrl(inputUrl)) {
      setUrl(normalizeUrl(inputUrl));
    } else {
      Alert.alert('Error', 'Invalid URL. Please enter a valid web address.');
    }
  };

  const handleReload = () => {
    loadFromClipboard();
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
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Enter URL or paste from clipboard"
            placeholderTextColor="#888"
            value={inputUrl}
            onChangeText={setInputUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Pressable style={styles.button} onPress={handleGo}>
            <Text style={styles.buttonText}>Go</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={handleReload}>
            <MaterialIcons name="refresh" size={20} color="#fff" />
          </Pressable>
        </View>
        <Text style={styles.hint}>Paste a URL from your clipboard or enter one above</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Enter URL"
          placeholderTextColor="#888"
          value={inputUrl}
          onChangeText={setInputUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Pressable style={styles.button} onPress={handleGo}>
          <Text style={styles.buttonText}>Go</Text>
        </Pressable>
        <Pressable style={styles.button} onPress={handleReload}>
          <MaterialIcons name="refresh" size={20} color="#fff" />
        </Pressable>
      </View>
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        startInLoadingState={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    gap: 8,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    fontSize: 14,
  },
  button: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000',
  },
  hint: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
    padding: 20,
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
    lineHeight: 20,
  },
});
