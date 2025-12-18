import { useColorScheme } from '@/hooks/use-color-scheme';
import globalState, { ConsoleMessage } from '@/services/global-state';
import pythonService from '@/services/python-execution';
import React, { useEffect, useRef, useState } from 'react';
import {
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MobilePythonWebView from '@/components/mobile-python-webview';

interface EmbeddedPythonConsoleProps {
  onExecute: (code: string) => Promise<string>;
  fullScreen?: boolean;
}

export default function EmbeddedPythonConsole({ onExecute, fullScreen = false }: EmbeddedPythonConsoleProps) {
  const colorScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ConsoleMessage[]>(globalState.getConsoleMessages());
  const [currentInput, setCurrentInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(globalState.isExecuting());
  const [fontSize, setFontSize] = useState(() => {
    if (Platform.OS === 'web') {
      return 18.5; // 2 clicks bigger: 14.5 + 4 = 18.5
    } else if (Platform.OS === 'ios') {
      return 15.9; // 2 clicks bigger: 11.9 + 4 = 15.9
    } else {
      return 23.8; // 2 clicks bigger: 19.8 + 4 = 23.8
    }
  });
  const messagesRef = useRef<TextInput>(null);
  const inputRef = useRef<TextInput>(null);

  // Subscribe to global state changes
  useEffect(() => {
    const unsubscribeConsole = globalState.subscribe('consoleUpdated', (updatedMessages: ConsoleMessage[]) => {
      setMessages(updatedMessages);
    });

    const unsubscribeExecution = globalState.subscribe('executionStateChanged', (executing: boolean) => {
      setIsExecuting(executing);
    });

    const unsubscribePythonReady = globalState.subscribe('pythonReadyChanged', (ready: boolean) => {
      // Python ready state is handled by global state
    });

    return () => {
      unsubscribeConsole();
      unsubscribeExecution();
      unsubscribePythonReady();
    };
  }, []);

  useEffect(() => {
    // Auto scroll to bottom when new messages are added
    if (messagesRef.current) {
      if (Platform.OS !== 'web' && messagesRef.current.setSelection) {
        // Mobile: Use setSelection to scroll to bottom
        const textLength = messages.map(message => {
          const prefix = message.type === 'input' ? '' : 
                        message.type === 'error' ? 'ERROR: ' : '';
          return prefix + message.text;
        }).join('\n').length + (isExecuting ? '\nExecuting...'.length : 0);
        
        messagesRef.current.setSelection(textLength, textLength);
      } else {
        // Web: Use DOM methods to scroll to bottom
        setTimeout(() => {
          if (messagesRef.current) {
            const element = messagesRef.current as any;
            if (element._nativeTag || element.scrollTop !== undefined) {
              element.scrollTop = element.scrollHeight;
            }
          }
        }, 10);
      }
    }
  }, [messages, isExecuting]);

  // Removed auto-focus to prevent keyboard from opening automatically

  const handleMobileReady = () => {
    globalState.setPythonReady(true);
  };

  const handleSend = async () => {
    const code = currentInput.trim();
    if (!code) return;

    globalState.addConsoleMessage('input', `>>> ${code}`);
    setCurrentInput('');

    globalState.setExecuting(true);
    try {
      const result = await onExecute(code);
      if (result.trim()) {
        globalState.addConsoleMessage('output', result);
      }
    } catch (error) {
      globalState.addConsoleMessage('error', `Error: ${error}`);
    } finally {
      globalState.setExecuting(false);
    }
  };

  const handleRunMainPy = async () => {
    if (isExecuting) {
      // If already executing, request cancellation
      globalState.requestExecutionCancel();
      globalState.addConsoleMessage('output', '🛑 Execution cancelled by user');
      globalState.setExecuting(false);
      return;
    }

    globalState.addConsoleMessage('input', '>>> Running current code...');
    
    globalState.setExecuting(true);
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

  const clearConsole = () => {
    globalState.clearConsole();
  };

  const copyTerminalOutput = async () => {
    // Get all visible terminal output
    const terminalContent = messages
      .map(msg => msg.text)
      .join('\n');
    
    if (Platform.OS === 'web') {
      // Web: Use clipboard API
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(terminalContent);
        } else {
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = terminalContent;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);
        }
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    } else {
      // Mobile: Use Expo's Clipboard API
      try {
        const { setStringAsync } = await import('expo-clipboard');
        await setStringAsync(terminalContent);
      } catch (error) {
        console.error('Failed to copy to clipboard:', error);
      }
    }
  };

  const zoomIn = () => {
    setFontSize(prev => Math.min(prev + 2, 24));
  };

  const zoomOut = () => {
    const minSize = Platform.OS === 'ios' ? 6 : 8;
    setFontSize(prev => Math.max(prev - 2, minSize));
  };

  const isDark = true; // Always use dark theme for that terminal feel

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0} // Small offset for better spacing
      enabled={Platform.OS === 'ios'}
      style={[
        fullScreen ? styles.fullScreenContainer : styles.container,
        { 
          backgroundColor: 'rgba(0, 0, 0, 0.9)', // Semi-transparent black
          marginTop: fullScreen ? 0 : (Platform.OS === 'web' ? 0 : 8), // No margins in full screen
          flex: fullScreen ? 1 : undefined, // Ensure flex is set for fullScreen
        }
      ]}
    >
      {/* Console Messages - flex to fill available space */}
      <TextInput
        ref={messagesRef}
        style={[
          styles.messagesContainer,
          styles.messageText,
          { 
            fontSize: fontSize,
            lineHeight: fontSize * 1.4, // Consistent line spacing that scales with font size
          }
        ]}
        value={
          messages.map(message => {
            const prefix = message.type === 'input' ? '' : 
                          message.type === 'error' ? 'ERROR: ' : '';
            return prefix + message.text;
          }).join('\n') + (isExecuting ? '\nExecuting...' : '')
        }
        editable={false}
        multiline={true}
        scrollEnabled={true}
        textAlignVertical="top"
        selectTextOnFocus={false}
      />

      {/* Input Area - Fixed at bottom, moves with keyboard */}
      <View style={[
        styles.inputContainer,
        { 
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
        }
      ]}>
        {/* Button Row - Top section, full width */}
        <View style={styles.buttonRowWithSides}>
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={clearConsole}
              disabled={isExecuting}
            >
              <Text style={styles.buttonText}>Clear</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.actionButton}
              onPress={copyTerminalOutput}
            >
              <Text style={styles.buttonText}>Copy</Text>
            </TouchableOpacity>
          </View>
          
          {Platform.OS === 'ios' && (
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.actionButton, styles.zoomButton]}
                onPress={zoomOut}
              >
                <Text style={[styles.buttonText, styles.zoomButtonText]}>−</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.actionButton, styles.zoomButton]}
                onPress={zoomIn}
              >
                <Text style={[styles.buttonText, styles.zoomButtonText]}>+</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Input Row - Bottom section, full width */}
        <View style={styles.inputRow}>
          {/* Prompt */}
          <Text style={styles.prompt}>
            {'>>>'}
          </Text>
          
          {/* Input Field */}
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={currentInput}
            onChangeText={setCurrentInput}
            placeholder="Type Python code..."
            placeholderTextColor="rgba(255, 255, 255, 0.4)"
            multiline={false}
            onSubmitEditing={handleSend}
            editable={!isExecuting}
            returnKeyType="send"
            autoCorrect={false}
            autoCapitalize="none"
            autoComplete="off"
            textContentType="none"
            spellCheck={false}
            {...(Platform.OS === 'ios' && {
              enablesReturnKeyAutomatically: true,
              inputAccessoryViewID: 'keyboardDismissToolbar'
            })}
          />
          
          {/* Action buttons on the right of input */}
          <View style={styles.buttonGroup}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                { opacity: (!currentInput.trim() || isExecuting) ? 0.5 : 1 }
              ]}
              onPress={handleSend}
              disabled={isExecuting || !currentInput.trim()}
            >
              <Text style={styles.buttonText}>cmd</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.actionButton,
                isExecuting && styles.pauseButton
              ]}
              onPress={handleRunMainPy}
            >
              <Text style={[
                styles.buttonText,
                isExecuting && styles.pauseButtonText
              ]}>
                {isExecuting ? '■' : 'main.py'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Mobile Python WebView (hidden, for execution only) */}
      {Platform.OS !== 'web' && (
        <MobilePythonWebView onReady={handleMobileReady} />
      )}

      {/* iOS Keyboard Toolbar with Dismiss Button */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID="keyboardDismissToolbar">
          <View style={styles.keyboardToolbar}>
            <TouchableOpacity 
              style={styles.keyboardDismissButton}
              onPress={() => Keyboard.dismiss()}
            >
              <Text style={styles.keyboardDismissButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    height: Platform.OS === 'web' ? '35%' : 320, // Taller on mobile for better readability
    borderRadius: Platform.OS === 'web' ? 12 : 16, // More rounded on mobile
    borderWidth: Platform.OS === 'web' ? 1 : 0, // No border on mobile for cleaner look
    borderColor: 'rgba(255, 255, 255, 0.1)',
    margin: Platform.OS === 'web' ? 16 : 12,
    marginTop: Platform.OS === 'web' ? 16 : 0, // No top margin on mobile
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: Platform.OS === 'web' ? 4 : 8 },
    shadowOpacity: Platform.OS === 'web' ? 0.3 : 0.5,
    shadowRadius: Platform.OS === 'web' ? 8 : 16,
    elevation: Platform.OS === 'web' ? 8 : 12,
  },
  fullScreenContainer: {
    flex: 1,
    borderRadius: 0,
    borderWidth: 0,
    margin: 0,
    marginTop: 0,
    overflow: 'hidden',
  },
  messagesContainer: {
    flex: 1,
    padding: Platform.OS === 'web' ? 12 : 16,
    marginBottom: 0, // No margin needed as input is now part of the same container
    backgroundColor: 'transparent',
    borderWidth: 0,
    textAlignVertical: 'top',
  },
  messageText: {
    fontSize: Platform.OS === 'web' ? 11 : 15, // Even larger on mobile
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    lineHeight: Platform.OS === 'web' ? 13 : 20,
    color: '#00ff41', // Matrix green
  },
  inputText: {
    fontWeight: '600',
    color: '#00bfff', // Bright cyan for input commands
  },
  outputText: {
    color: '#00ff41', // Matrix green for output
  },
  errorText: {
    color: '#ff4444', // Red for errors
    fontWeight: '600',
  },
  executingText: {
    fontStyle: 'italic',
    color: '#ffaa00', // Orange for executing status
  },
  inputContainer: {
    flexDirection: 'column',
    paddingHorizontal: Platform.OS === 'web' ? 8 : 12,
    paddingVertical: Platform.OS === 'web' ? 6 : 10,
    // Increased bottom padding for better spacing above keyboard
    paddingBottom: Platform.OS === 'web' ? 10 : 16, 
    borderTopWidth: 1,
    gap: Platform.OS === 'web' ? 4 : 8,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    // Ensure it stays above tab bar on iOS
    position: 'relative',
    zIndex: 1000,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Platform.OS === 'web' ? 4 : 8,
    width: '100%',
  },
  prompt: {
    fontSize: Platform.OS === 'web' ? 10 : 14,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    fontWeight: '600',
    color: '#00ff41',
    minWidth: Platform.OS === 'web' ? 20 : 30,
  },
  input: {
    flex: 1,
    fontSize: Platform.OS === 'web' ? 10 : 14,
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
    paddingHorizontal: Platform.OS === 'web' ? 6 : 10,
    paddingVertical: Platform.OS === 'web' ? 4 : 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    color: '#ffffff',
    height: Platform.OS === 'web' ? 24 : 36,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: Platform.OS === 'web' ? 2 : 4,
  },
  buttonRowWithSides: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: Platform.OS === 'web' ? 2 : 4,
  },
  zoomButton: {
    minWidth: Platform.OS === 'web' ? 32 : 40,
  },
  zoomButtonText: {
    fontSize: Platform.OS === 'web' ? 12 : 16,
    fontWeight: 'bold',
  },
  actionButton: {
    paddingHorizontal: Platform.OS === 'web' ? 8 : 12,
    paddingVertical: Platform.OS === 'web' ? 4 : 8,
    borderRadius: 4,
    minWidth: Platform.OS === 'web' ? 40 : 60, // Slightly wider for better button consistency
    alignItems: 'center',
    height: Platform.OS === 'web' ? 24 : 36,
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  pauseButton: {
    backgroundColor: 'rgba(255, 68, 68, 0.3)', // Red color for pause/stop with transparency
    borderColor: 'rgba(255, 68, 68, 0.5)',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: Platform.OS === 'web' ? 8 : 12,
    fontWeight: '600',
    fontFamily: Platform.select({
      ios: 'Menlo',
      android: 'monospace',
      default: 'monospace',
    }),
  },
  pauseButtonText: {
    fontSize: Platform.OS === 'web' ? 14 : 18, // Larger square symbol
    color: '#ff4444',
    fontFamily: Platform.select({
      ios: 'System', // Use system font for better emoji/symbol rendering
      android: 'System',
      default: 'System',
    }),
    textAlign: 'center',
  },
  keyboardAvoidingInput: {
    // No additional styles needed, just acts as a wrapper
  },
  keyboardToolbar: {
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 0,
    height: 28,
  },
  keyboardDismissButton: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyboardDismissButtonText: {
    color: '#ffffff',
    fontSize: 14.3, // 10% bigger than 13 (13 * 1.1 = 14.3)
    fontWeight: '600',
  },
});