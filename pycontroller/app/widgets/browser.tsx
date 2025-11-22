import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { RainbowProgressBar } from '../subapps/renshu/rainbow-progress-bar';

// Try to import WebView, fallback to a message if not available
let WebView: any = null;
try {
  WebView = require('react-native-webview').WebView;
} catch (e) {
  console.warn('react-native-webview not available');
}

export default function Browser() {
  const [url, setUrl] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);

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
      {loading && (
        <View style={styles.loadingBarContainer}>
          <RainbowProgressBar progress={loadingProgress} />
        </View>
      )}
      {/* Black overlay that covers the WebView while loading to prevent white flash */}
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none" />
      )}
      <WebView
        source={{ uri: url }}
        style={styles.webview}
        startInLoadingState={true}
        backgroundColor="#000000"
        // Share cookies with Safari on iOS (allows logged-in sessions)
        sharedCookiesEnabled={true}
        // Enable third-party cookies for cross-site authentication
        thirdPartyCookiesEnabled={true}
        // Enable JavaScript (required for most auth flows)
        javaScriptEnabled={true}
        // Enable DOM storage (for localStorage, sessionStorage)
        domStorageEnabled={true}
        // Keep videos playing inline instead of fullscreen (iOS)
        allowsInlineMediaPlayback={true}
        // Prevent fullscreen video on Android
        allowsFullscreenVideo={false}
        // Inject JavaScript to prevent YouTube fullscreen
        injectedJavaScript={`
          (function() {
            // Override fullscreen API to prevent YouTube from going fullscreen
            if (document.documentElement.requestFullscreen) {
              document.documentElement.requestFullscreen = function() {
                console.log('Fullscreen request blocked');
                return Promise.reject(new Error('Fullscreen blocked'));
              };
            }
            if (document.documentElement.webkitRequestFullscreen) {
              document.documentElement.webkitRequestFullscreen = function() {
                console.log('Fullscreen request blocked');
                return Promise.reject(new Error('Fullscreen blocked'));
              };
            }
            if (document.documentElement.mozRequestFullScreen) {
              document.documentElement.mozRequestFullScreen = function() {
                console.log('Fullscreen request blocked');
                return Promise.reject(new Error('Fullscreen blocked'));
              };
            }
            if (document.documentElement.msRequestFullscreen) {
              document.documentElement.msRequestFullscreen = function() {
                console.log('Fullscreen request blocked');
                return Promise.reject(new Error('Fullscreen blocked'));
              };
            }
            
            // Override video element fullscreen methods
            const originalRequestFullscreen = HTMLVideoElement.prototype.requestFullscreen;
            if (originalRequestFullscreen) {
              HTMLVideoElement.prototype.requestFullscreen = function() {
                console.log('Video fullscreen request blocked');
                return Promise.reject(new Error('Fullscreen blocked'));
              };
            }
            
            // Listen for YouTube iframe API and prevent fullscreen
            window.addEventListener('message', function(event) {
              if (event.data && event.data.event === 'command' && event.data.func === 'requestFullscreen') {
                event.stopPropagation();
                console.log('YouTube fullscreen command blocked');
              }
            }, true);
            
            // Override YouTube player fullscreen button
            const observer = new MutationObserver(function(mutations) {
              const fullscreenButtons = document.querySelectorAll('[aria-label*="fullscreen" i], [title*="fullscreen" i], .ytp-fullscreen-button');
              fullscreenButtons.forEach(function(button) {
                if (button) {
                  button.style.display = 'none';
                  button.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                  };
                }
              });
            });
            
            observer.observe(document.body, {
              childList: true,
              subtree: true
            });
            
            // Run immediately in case YouTube is already loaded
            setTimeout(function() {
              const fullscreenButtons = document.querySelectorAll('[aria-label*="fullscreen" i], [title*="fullscreen" i], .ytp-fullscreen-button');
              fullscreenButtons.forEach(function(button) {
                if (button) {
                  button.style.display = 'none';
                  button.onclick = function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                  };
                }
              });
            }, 1000);
          })();
          true; // Required for injected JavaScript
        `}
        renderLoading={() => (
          <View style={styles.loadingScreen}>
            <View style={styles.loadingScreenBackground} />
          </View>
        )}
        onLoadStart={() => {
          setLoading(true);
          setLoadingProgress(0);
        }}
        onLoadProgress={(event: any) => {
          setLoadingProgress(event.nativeEvent.progress);
        }}
        onLoadEnd={() => {
          setLoading(false);
          setLoadingProgress(1);
        }}
        onError={() => {
          setLoading(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  webview: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingBarContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    zIndex: 1000,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 999,
  },
  loadingScreen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
  },
  loadingScreenBackground: {
    flex: 1,
    backgroundColor: '#000000',
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
