import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, InputAccessoryView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { RainbowProgressBar } from '../subapps/renshu/rainbow-progress-bar';
import CopyButton from '../subapps/renshu/copy-button';

// Try to import WebView, fallback to a message if not available
let WebView: any = null;
try {
  WebView = require('react-native-webview').WebView;
} catch (e) {
  console.warn('react-native-webview not available');
}

interface BrowserProps {
  isVisible?: boolean;
}

export default function Browser({ isVisible = true }: BrowserProps) {
  const [url, setUrl] = useState<string>('');
  const [currentUrl, setCurrentUrl] = useState<string>('');
  const [addressBarText, setAddressBarText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [isInvalidUrl, setIsInvalidUrl] = useState<boolean>(false);
  const [addressBarFocused, setAddressBarFocused] = useState<boolean>(false);
  const webViewRef = useRef<any>(null);
  const addressBarRef = useRef<TextInput>(null);
  const inputAccessoryViewID = useRef(`addressBarAccessoryView-${Date.now()}-${Math.random()}`).current;

  useEffect(() => {
    // Try to get URL from clipboard when component mounts or becomes visible
    if (isVisible) {
      loadFromClipboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  // Update address bar when current URL changes
  useEffect(() => {
    if (currentUrl) {
      setAddressBarText(currentUrl);
    }
  }, [currentUrl]);

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

  const handleNavigate = (inputUrl: string) => {
    const normalized = normalizeUrl(inputUrl);
    if (isValidUrl(normalized)) {
      setUrl(normalized);
      setCurrentUrl(normalized);
      setAddressBarText(normalized);
      setIsInvalidUrl(false);
      if (addressBarRef.current) {
        addressBarRef.current.blur();
      }
    } else {
      setIsInvalidUrl(true);
    }
  };

  const handleBack = () => {
    if (webViewRef.current && canGoBack) {
      webViewRef.current.goBack();
    }
  };

  const handleForward = () => {
    if (webViewRef.current && canGoForward) {
      webViewRef.current.goForward();
    }
  };

  const handleRefresh = () => {
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
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

  if (!url && !isInvalidUrl) {
    return (
      <View style={styles.container}>
        <Text style={styles.hint}>No URL found in clipboard. Copy a URL and reopen this view.</Text>
      </View>
    );
  }

  if (isInvalidUrl && !url) {
    return (
      <View style={styles.container}>
        <View style={styles.invalidAddressContainer}>
          <Text style={styles.invalidAddressText}>Invalid address</Text>
        </View>
      </View>
    );
  }

  const handleContainerPress = () => {
    if (addressBarRef.current) {
      addressBarRef.current.blur();
    }
    Keyboard.dismiss();
  };

  return (
    <TouchableWithoutFeedback onPress={handleContainerPress}>
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
        ref={webViewRef}
        source={{ uri: url }}
        style={styles.webview}
        startInLoadingState={true}
        backgroundColor="#000000"
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
        onLoadEnd={(event: any) => {
          setLoading(false);
          setLoadingProgress(1);
          if (event.nativeEvent.url) {
            setCurrentUrl(event.nativeEvent.url);
          }
        }}
        onError={(error: any) => {
          setLoading(false);
          setIsInvalidUrl(true);
        }}
        onNavigationStateChange={(navState: any) => {
          setCanGoBack(navState.canGoBack);
          setCanGoForward(navState.canGoForward);
          if (navState.url) {
            setCurrentUrl(navState.url);
          }
        }}
      />
      {/* Status bar at the bottom */}
      <View style={styles.statusBar}>
        {/* Navigation buttons */}
        <View style={styles.navButtons}>
          <TouchableOpacity
            style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
            onPress={handleBack}
            disabled={!canGoBack}
          >
            <MaterialIcons 
              name="arrow-back" 
              size={20} 
              color={canGoBack ? '#fff' : '#666'} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
            onPress={handleForward}
            disabled={!canGoForward}
          >
            <MaterialIcons 
              name="arrow-forward" 
              size={20} 
              color={canGoForward ? '#fff' : '#666'} 
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navButton}
            onPress={handleRefresh}
          >
            <MaterialIcons name="refresh" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Address bar */}
        <View style={styles.addressBarContainer}>
          <TextInput
            ref={addressBarRef}
            style={styles.addressBar}
            value={addressBarText}
            onChangeText={(text) => {
              setAddressBarText(text);
              setIsInvalidUrl(false);
            }}
            onSubmitEditing={(e) => handleNavigate(e.nativeEvent.text)}
            onFocus={() => setAddressBarFocused(true)}
            onBlur={() => setAddressBarFocused(false)}
            placeholder="Enter URL"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            inputAccessoryViewID={Platform.OS === 'ios' ? inputAccessoryViewID : undefined}
          />
          <CopyButton
            textToCopy={currentUrl || url}
            size={18}
            style={{ marginLeft: 4 }}
          />
        </View>
      </View>
      {/* Input accessory view for iOS keyboard */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={inputAccessoryViewID}>
          <View style={styles.inputAccessory}>
            <TextInput
              style={styles.inputAccessoryInput}
              value={addressBarText}
              onChangeText={(text) => {
                setAddressBarText(text);
                setIsInvalidUrl(false);
              }}
              onSubmitEditing={(e) => {
                handleNavigate(e.nativeEvent.text);
                if (addressBarRef.current) {
                  addressBarRef.current.blur();
                }
              }}
              placeholder="Enter URL"
              placeholderTextColor="#666"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="go"
            />
            <TouchableOpacity
              style={styles.inputAccessoryButton}
              onPress={() => {
                if (addressBarRef.current) {
                  addressBarRef.current.blur();
                }
              }}
            >
              <Text style={styles.inputAccessoryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
      </View>
    </TouchableWithoutFeedback>
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
    marginBottom: 50, // Space for status bar
  },
  statusBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 50,
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1000,
  },
  navButtons: {
    flexDirection: 'row',
    marginRight: 8,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  addressBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 32,
  },
  addressBar: {
    flex: 1,
    height: 32,
    backgroundColor: '#222',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    color: '#fff',
    fontSize: 13,
    marginRight: 4,
  },
  invalidAddressContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invalidAddressText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
  },
  inputAccessory: {
    backgroundColor: '#111',
    borderTopWidth: 1,
    borderTopColor: '#333',
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputAccessoryInput: {
    flex: 1,
    height: 36,
    backgroundColor: '#222',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: '#fff',
    fontSize: 14,
    marginRight: 8,
  },
  inputAccessoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#333',
    borderRadius: 6,
  },
  inputAccessoryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
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
