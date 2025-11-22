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
  const [searchText, setSearchText] = useState<string>('');
  const [clipboardContent, setClipboardContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [canGoBack, setCanGoBack] = useState<boolean>(false);
  const [canGoForward, setCanGoForward] = useState<boolean>(false);
  const [isInvalidUrl, setIsInvalidUrl] = useState<boolean>(false);
  const [addressBarFocused, setAddressBarFocused] = useState<boolean>(false);
  const webViewRef = useRef<any>(null);
  const addressBarRef = useRef<TextInput>(null);
  const searchInputRef = useRef<TextInput>(null);
  const inputAccessoryViewID = useRef(`addressBarAccessoryView-${Date.now()}-${Math.random()}`).current;
  const searchAccessoryViewID = useRef(`searchAccessoryView-${Date.now()}-${Math.random()}`).current;

  // Check clipboard when component becomes visible
  useEffect(() => {
    if (isVisible) {
      checkClipboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  // Update address bar when current URL changes
  useEffect(() => {
    if (currentUrl) {
      setAddressBarText(currentUrl);
    }
  }, [currentUrl]);

  const checkClipboard = async () => {
    try {
      const clipboardText = await Clipboard.getStringAsync();
      if (clipboardText && clipboardText.trim()) {
        setClipboardContent(clipboardText.trim());
      } else {
        setClipboardContent('');
      }
    } catch (error) {
      console.error('Error reading clipboard:', error);
      setClipboardContent('');
    }
  };

  const handleOpenFromClipboard = () => {
    if (clipboardContent) {
      handleNavigate(clipboardContent);
    }
  };

  const handleSearch = () => {
    if (searchText.trim()) {
      // Always search on Google when using the search bar
      const searchQuery = encodeURIComponent(searchText.trim());
      const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;
      setUrl(googleSearchUrl);
      setCurrentUrl(googleSearchUrl);
      setAddressBarText(googleSearchUrl);
      setIsInvalidUrl(false);
      if (searchInputRef.current) {
        searchInputRef.current.blur();
      }
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
      // If not a valid URL, search it on Google
      const searchQuery = encodeURIComponent(inputUrl.trim());
      const googleSearchUrl = `https://www.google.com/search?q=${searchQuery}`;
      setUrl(googleSearchUrl);
      setCurrentUrl(googleSearchUrl);
      setAddressBarText(googleSearchUrl);
      setIsInvalidUrl(false);
      if (addressBarRef.current) {
        addressBarRef.current.blur();
      }
    }
  };

  const handleBack = () => {
    if (canGoBack && webViewRef.current) {
      webViewRef.current.goBack();
    } else {
      // If no history, go back to home (initial screen)
      handleGoHome();
    }
  };

  const handleGoHome = () => {
    setUrl('');
    setCurrentUrl('');
    setAddressBarText('');
    setSearchText('');
    setCanGoBack(false);
    setCanGoForward(false);
    setIsInvalidUrl(false);
    // Re-check clipboard when going home
    checkClipboard();
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

  // Show initial screen with search button and clipboard button when no URL is loaded
  if (!url) {
    return (
      <TouchableWithoutFeedback onPress={() => {
        Keyboard.dismiss();
        if (searchInputRef.current) {
          searchInputRef.current.blur();
        }
      }}>
        <View style={styles.container}>
          <View style={styles.initialScreen}>
            <TouchableOpacity
              style={styles.searchButton}
              onPress={() => {
                if (searchInputRef.current) {
                  searchInputRef.current.focus();
                }
              }}
            >
              <View style={{ marginRight: 8 }}>
                <MaterialIcons name="search" size={20} color="#fff" />
              </View>
              <Text style={styles.searchButtonText}>Search on Google</Text>
            </TouchableOpacity>
            {clipboardContent && (
              <TouchableOpacity
                style={styles.clipboardButton}
                onPress={handleOpenFromClipboard}
              >
                <View style={{ marginRight: 8 }}>
                  <MaterialIcons name="content-paste" size={18} color="#fff" />
                </View>
                <Text style={styles.clipboardButtonText}>Open link from clipboard</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Hidden search input that triggers keyboard with accessory view */}
          <TextInput
            ref={searchInputRef}
            style={styles.hiddenInput}
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={handleSearch}
            placeholder="Search on Google"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            returnKeyType="search"
            inputAccessoryViewID={Platform.OS === 'ios' ? searchAccessoryViewID : undefined}
          />
          {/* Input accessory view for search */}
          {Platform.OS === 'ios' && (
            <InputAccessoryView nativeID={searchAccessoryViewID}>
              <View style={styles.inputAccessory}>
                <TextInput
                  style={styles.inputAccessoryInput}
                  value={searchText}
                  onChangeText={setSearchText}
                  onSubmitEditing={handleSearch}
                  placeholder="Search on Google"
                  placeholderTextColor="#666"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="default"
                  returnKeyType="search"
                />
                <TouchableOpacity
                  style={styles.inputAccessoryButton}
                  onPress={() => {
                    Keyboard.dismiss();
                    if (searchInputRef.current) {
                      searchInputRef.current.blur();
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
            style={styles.navButton}
            onPress={handleBack}
          >
            <MaterialIcons 
              name={canGoBack ? "arrow-back" : "home"} 
              size={20} 
              color="#fff" 
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
  initialScreen: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
    marginBottom: 16,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    width: 0,
    height: 0,
  },
  clipboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#222',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  clipboardButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
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
