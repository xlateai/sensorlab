import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import globalState from '@/services/global-state';
import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Conditionally import Monaco Editor only on web
const Editor = Platform.OS === 'web' ? require('@monaco-editor/react').default : null;

export default function CodeScreen() {
  const colorScheme = useColorScheme();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const editorRef = useRef<any>(null);
  const webViewRef = useRef<WebView>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const currentCodeRef = useRef<string>(''); // Keep current code in ref to avoid re-renders

  // Initialize code from global state
  useEffect(() => {
    const currentCode = globalState.getCurrentCode();
    setCode(currentCode);
    setIsLoading(false);
  }, []);

  // Subscribe to code updates from global state
  useEffect(() => {
    const unsubscribe = globalState.subscribe('codeUpdated', (newCode: string) => {
      // Only update if the change didn't come from this WebView
      if (newCode !== currentCodeRef.current && newCode !== code) {
        setCode(newCode);
        currentCodeRef.current = newCode;
        // Send update to WebView on mobile
        if (Platform.OS !== 'web' && webViewRef.current) {
          webViewRef.current.postMessage(JSON.stringify({
            type: 'setValue',
            value: newCode
          }));
        }
      }
    });

    return unsubscribe;
  }, [code]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;

    // Configure Monaco editor for Python
    monaco.languages.python?.pythonDefaults?.setDiagnosticsOptions({
      noSemantics: true,
      noSyntaxValidation: false,
    });

    // Add custom black background theme with normal syntax colors
    monaco.editor.defineTheme('matrix-theme', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        // Keep standard VS Dark syntax colors but on black background
        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' }, // Standard green comments
        { token: 'keyword', foreground: '569CD6' }, // Standard blue keywords  
        { token: 'string', foreground: 'CE9178' }, // Standard orange strings
        { token: 'number', foreground: 'B5CEA8' }, // Standard light green numbers
        { token: 'variable', foreground: 'd4d4d4' }, // Standard gray variables
        { token: 'function', foreground: 'DCDCAA' }, // Standard yellow functions
        { token: 'type', foreground: '4EC9B0' }, // Standard cyan types
        { token: 'operator', foreground: 'd4d4d4' }, // Standard gray operators
      ],
      colors: {
        'editor.background': '#000000', // Pure black background
        'editor.foreground': '#d4d4d4', // Standard light gray text
        'editorLineNumber.foreground': '#858585', // Standard gray line numbers
        'editorLineNumber.activeForeground': '#c6c6c6', // Standard light gray active line number
        'editor.selectionBackground': '#264f78', // Standard blue selection
        'editor.inactiveSelectionBackground': '#3a3d41', // Standard gray inactive selection
        'editorCursor.foreground': '#ffffff', // White cursor
        'editor.lineHighlightBackground': '#0a0a0a', // Very subtle line highlight
        'editorIndentGuide.background': '#1a1a1a', // Dark gray indent guides
        'editorIndentGuide.activeBackground': '#404040', // Gray active indent guide
        'editor.selectionHighlightBackground': '#264f7880', // Semi-transparent blue
        'editorBracketMatch.background': '#264f7880', // Blue bracket matching
        'editorBracketMatch.border': '#569CD6',
      },
    });

    // Keep a light theme for contrast
    monaco.editor.defineTheme('custom-light', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '008000' },
        { token: 'keyword', foreground: '0000ff' },
        { token: 'string', foreground: 'a31515' },
        { token: 'number', foreground: '09885a' },
      ],
      colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
      },
    });

    // Set the matrix theme (always use the black/green theme)
    monaco.editor.setTheme('matrix-theme');

    // Focus the editor
    editor.focus();
  };

  const handleEditorChange = (value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    
    // Update global state with the new code
    globalState.updateCurrentCode(newCode);
  };

  const getEditorOptions = () => ({
    selectOnLineNumbers: true,
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'off' as const, // Disable word wrapping for horizontal scrolling
    theme: 'matrix-theme',
    fontSize: 18, // Increased 50% from 12 to 18
    lineNumbers: 'on' as const,
    lineNumbersMinChars: 2, // Smaller line number column
    renderLineHighlight: 'all' as const,
    contextmenu: true,
    mouseWheelZoom: true,
    smoothScrolling: true,
    cursorBlinking: 'smooth' as const,
    renderWhitespace: 'selection' as const,
    tabSize: 4,
    insertSpaces: true,
    folding: true,
    foldingStrategy: 'indentation' as const,
    showFoldingControls: 'always' as const,
    bracketPairColorization: { enabled: true },
    scrollbar: {
      horizontal: 'visible' as const, // Ensure horizontal scrollbar is visible
      horizontalScrollbarSize: 10,
      verticalScrollbarSize: 10
    }
  });

  // Memoize the HTML to prevent WebView re-renders
  const monacoHTML = React.useMemo(() => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Monaco Editor</title>
        <style>
            body {
                margin: 0;
                padding: 0;
                overflow: hidden;
                background: #000000;
            }
            #container {
                width: 100vw;
                height: calc(100vh - 80px);
            }
            #toolbar {
                height: 80px;
                background: #000000;
                border-bottom: 1px solid #333333;
                display: flex;
                flex-direction: column;
                padding: 5px 10px 0px 10px;
                font-size: 12px;
                font-family: -apple-system, system-ui;
            }
            .toolbar-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                height: 35px;
                width: 100%;
            }
            .toolbar-left {
                display: flex;
                gap: 6px;
                flex-wrap: nowrap;
                align-items: center;
            }
            .toolbar-right {
                display: flex;
                gap: 6px;
                align-items: center;
            }
            .toolbar-btn {
                background: #404040;
                border: none;
                padding: 4px 8px;
                border-radius: 4px;
                color: #ffffff;
                font-size: 10px;
                cursor: pointer;
                user-select: none;
                -webkit-user-select: none;
                -webkit-touch-callout: none;
                -webkit-tap-highlight-color: transparent;
                min-width: 28px;
                height: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
                white-space: nowrap;
                flex-shrink: 0;
            }
            .toolbar-btn:active {
                background: #555555;
            }
            .save-btn {
                background: #22c55e;
                color: white;
                font-weight: 600;
                min-width: 50px;
                transition: background-color 0.2s ease, opacity 0.2s ease;
            }
            .save-btn:active:not(:disabled) {
                background: #16a34a;
            }
            .save-btn:disabled {
                cursor: not-allowed;
                background: #6b7280 !important;
                opacity: 0.5;
            }
            .zoom-btn {
                background: #404040;
                font-weight: bold;
                font-size: 16px;
                min-width: 30px;
                line-height: 1;
            }
            .zoom-btn:active {
                background: #555555;
            }
        </style>
    </head>
    <body>
        <div id="toolbar">
            <!-- First Row -->
            <div class="toolbar-row">
                <div class="toolbar-left">
                    <button class="toolbar-btn" onclick="selectAll()">Select All</button>
                    <button class="toolbar-btn" onclick="copyText()">Copy</button>
                    <button class="toolbar-btn" onclick="cutText()">Cut</button>
                </div>
                <div class="toolbar-right">
                    <button class="toolbar-btn zoom-btn" onclick="event.preventDefault(); event.stopPropagation(); zoomOut(); return false;">−</button>
                    <button class="toolbar-btn zoom-btn" onclick="event.preventDefault(); event.stopPropagation(); zoomIn(); return false;">+</button>
                    <button class="toolbar-btn save-btn" onclick="saveCode()">Save</button>
                </div>
            </div>
            <!-- Second Row -->
            <div class="toolbar-row">
                <div class="toolbar-left">
                    <button class="toolbar-btn" onclick="pasteText()">Paste</button>
                    <button class="toolbar-btn" onclick="undoAction()">Undo</button>
                    <button class="toolbar-btn" onclick="redoAction()">Redo</button>
                </div>
                <div class="toolbar-right">
                    <!-- Empty space for alignment -->
                </div>
            </div>
        </div>
        <div id="container"></div>
        
        <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js"></script>
        <script>
            require.config({ paths: { 'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' }});
            
            let editor;
            let currentValue = ${JSON.stringify(code)};
            let currentFontSize = 12; // Default font size
            let savedValue = ${JSON.stringify(code)}; // Track saved state
            let hasUnsavedChanges = false;
            
            require(['vs/editor/editor.main'], function () {
                // Define matrix theme (same as web version)
                monaco.editor.defineTheme('matrix-theme', {
                    base: 'vs-dark',
                    inherit: true,
                    rules: [
                        // Keep standard VS Dark syntax colors but on black background
                        { token: 'comment', foreground: '6A9955', fontStyle: 'italic' }, // Standard green comments
                        { token: 'keyword', foreground: '569CD6' }, // Standard blue keywords  
                        { token: 'string', foreground: 'CE9178' }, // Standard orange strings
                        { token: 'number', foreground: 'B5CEA8' }, // Standard light green numbers
                        { token: 'variable', foreground: 'd4d4d4' }, // Standard gray variables
                        { token: 'function', foreground: 'DCDCAA' }, // Standard yellow functions
                        { token: 'type', foreground: '4EC9B0' }, // Standard cyan types
                        { token: 'operator', foreground: 'd4d4d4' }, // Standard gray operators
                    ],
                    colors: {
                        'editor.background': '#000000', // Pure black background
                        'editor.foreground': '#d4d4d4', // Standard light gray text
                        'editorLineNumber.foreground': '#858585', // Standard gray line numbers
                        'editorLineNumber.activeForeground': '#c6c6c6', // Standard light gray active line number
                        'editor.selectionBackground': '#264f78', // Standard blue selection
                        'editor.inactiveSelectionBackground': '#3a3d41', // Standard gray inactive selection
                        'editorCursor.foreground': '#ffffff', // White cursor
                        'editor.lineHighlightBackground': '#0a0a0a', // Very subtle line highlight
                        'editorIndentGuide.background': '#1a1a1a', // Dark gray indent guides
                        'editorIndentGuide.activeBackground': '#404040', // Gray active indent guide
                        'editor.selectionHighlightBackground': '#264f7880', // Semi-transparent blue
                        'editorBracketMatch.background': '#264f7880', // Blue bracket matching
                        'editorBracketMatch.border': '#569CD6',
                    },
                });
                
                editor = monaco.editor.create(document.getElementById('container'), {
                    value: currentValue,
                    language: 'python',
                    theme: 'matrix-theme',
                    automaticLayout: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    wordWrap: 'off', // Disable word wrapping for horizontal scrolling
                    fontSize: 12, // Reduced from 14 to 12 (about 15% smaller)
                    lineNumbers: 'on',
                    lineNumbersMinChars: 2, // Smaller line number column
                    renderLineHighlight: 'all',
                    contextmenu: false,
                    mouseWheelZoom: true,
                    smoothScrolling: true,
                    cursorBlinking: 'smooth',
                    renderWhitespace: 'selection',
                    tabSize: 4,
                    insertSpaces: true,
                    folding: true,
                    foldingStrategy: 'indentation',
                    showFoldingControls: 'always',
                    bracketPairColorization: { enabled: true },
                    scrollbar: {
                        horizontal: 'visible', // Ensure horizontal scrollbar is visible
                        horizontalScrollbarSize: 10,
                        verticalScrollbarSize: 10
                    }
                });
                
                // Toolbar functions for copy/paste operations
                window.selectAll = function() {
                    editor.setSelection(editor.getModel().getFullModelRange());
                    editor.focus();
                };
                
                window.copyText = function() {
                    const selection = editor.getSelection();
                    if (selection && !selection.isEmpty()) {
                        const selectedText = editor.getModel().getValueInRange(selection);
                        
                        // Create a temporary textarea that iOS can interact with
                        const textArea = document.createElement('textarea');
                        textArea.value = selectedText;
                        textArea.style.position = 'absolute';
                        textArea.style.left = '-9999px';
                        textArea.style.top = '0';
                        textArea.readOnly = false;
                        document.body.appendChild(textArea);
                        
                        // Focus and select the text
                        textArea.focus();
                        textArea.setSelectionRange(0, selectedText.length);
                        
                        // Try modern API first, then fallback
                        try {
                            if (navigator.clipboard) {
                                navigator.clipboard.writeText(selectedText);
                            } else {
                                document.execCommand('copy');
                            }
                        } catch (e) {
                            document.execCommand('copy');
                        }
                        
                        document.body.removeChild(textArea);
                        editor.focus();
                    }
                };
                
                window.cutText = function() {
                    const selection = editor.getSelection();
                    if (selection && !selection.isEmpty()) {
                        const selectedText = editor.getModel().getValueInRange(selection);
                        
                        // Create a temporary textarea that iOS can interact with
                        const textArea = document.createElement('textarea');
                        textArea.value = selectedText;
                        textArea.style.position = 'absolute';
                        textArea.style.left = '-9999px';
                        textArea.style.top = '0';
                        textArea.readOnly = false;
                        document.body.appendChild(textArea);
                        
                        // Focus and select the text
                        textArea.focus();
                        textArea.setSelectionRange(0, selectedText.length);
                        
                        // Try to copy to clipboard
                        try {
                            if (navigator.clipboard) {
                                navigator.clipboard.writeText(selectedText);
                            } else {
                                document.execCommand('copy');
                            }
                        } catch (e) {
                            document.execCommand('copy');
                        }
                        
                        document.body.removeChild(textArea);
                        
                        // Remove the selected text from editor
                        editor.executeEdits('cut', [{
                            range: selection,
                            text: ''
                        }]);
                        editor.focus();
                    }
                };
                
                window.pasteText = function() {
                    // Use Monaco's built-in clipboard integration
                    editor.focus();
                    
                    // Try to trigger Monaco's native paste command
                    editor.trigger('paste', 'editor.action.clipboardPasteAction', null);
                    
                    // Fallback: try modern clipboard API directly
                    if (navigator.clipboard && navigator.clipboard.readText) {
                        navigator.clipboard.readText().then(text => {
                            if (text) {
                                const selection = editor.getSelection();
                                editor.executeEdits('paste', [{
                                    range: selection,
                                    text: text
                                }]);
                                editor.focus();
                            }
                        }).catch(err => {
                            console.log('Clipboard read failed, user may need to paste manually');
                        });
                    }
                };
                
                window.undoAction = function() {
                    editor.getModel().undo();
                    editor.focus();
                };
                
                window.redoAction = function() {
                    editor.getModel().redo();
                    editor.focus();
                };
                
                // Update save button state
                function updateSaveButtonState() {
                    const saveBtn = document.querySelector('.save-btn');
                    if (!saveBtn) return;
                    
                    const currentEditorValue = editor.getValue();
                    hasUnsavedChanges = currentEditorValue !== savedValue;
                    
                    if (hasUnsavedChanges) {
                        saveBtn.disabled = false;
                        saveBtn.style.opacity = '1';
                        saveBtn.style.background = '#22c55e';
                        saveBtn.textContent = 'Save';
                    } else {
                        saveBtn.disabled = true;
                        saveBtn.style.opacity = '0.5';
                        saveBtn.style.background = '#6b7280';
                        saveBtn.textContent = 'Saved';
                    }
                }
                
                // Save function
                window.saveCode = function() {
                    const value = editor.getValue();
                    savedValue = value; // Update saved state
                    
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'manualSave',
                        value: value
                    }));
                    
                    // Update button state
                    updateSaveButtonState();
                    
                    // Brief visual feedback
                    const saveBtn = document.querySelector('.save-btn');
                    const originalBg = saveBtn.style.background;
                    saveBtn.textContent = '✓ Saved';
                    saveBtn.style.background = '#10b981';
                    
                    setTimeout(() => {
                        updateSaveButtonState(); // Restore proper state
                    }, 800);
                };
                
                // Auto-save function
                window.autoSave = function() {
                    if (hasUnsavedChanges) {
                        const value = editor.getValue();
                        savedValue = value;
                        window.ReactNativeWebView.postMessage(JSON.stringify({
                            type: 'autoSave',
                            value: value
                        }));
                        updateSaveButtonState();
                    }
                };
                
                // Zoom functions with bigger increments and no focus
                window.zoomIn = function() {
                    currentFontSize = Math.min(currentFontSize + 2, 28); // Max 28px, +2 increment
                    editor.updateOptions({ fontSize: currentFontSize });
                    // Don't focus to avoid keyboard
                };
                
                window.zoomOut = function() {
                    currentFontSize = Math.max(currentFontSize - 2, 8); // Min 8px, -2 increment
                    editor.updateOptions({ fontSize: currentFontSize });
                    // Don't focus to avoid keyboard
                };
                
                // Add Cmd+S / Ctrl+S save functionality
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function() {
                    saveCode(); // Use the same save function
                });
                
                // Add zoom keyboard shortcuts
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Equal, function() {
                    zoomIn();
                });
                
                editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Minus, function() {
                    zoomOut();
                });
                
                // Track content changes and update save button state
                editor.onDidChangeModelContent((event) => {
                    updateSaveButtonState();
                    document.title = hasUnsavedChanges ? 'Code Editor *' : 'Code Editor';
                });
                
                // Auto-save on visibility change (tab switching)
                document.addEventListener('visibilitychange', function() {
                    if (document.hidden) {
                        autoSave();
                    }
                });
                
                // Auto-save on page unload (app backgrounding)
                window.addEventListener('beforeunload', function() {
                    autoSave();
                });
                
                // Auto-save on focus loss (keyboard hiding, etc.)
                window.addEventListener('blur', function() {
                    autoSave();
                });
                
                // Auto-save when editor loses focus
                editor.onDidBlurEditorText(function() {
                    setTimeout(() => autoSave(), 100); // Small delay to ensure blur is complete
                });
                
                // Listen for messages from React Native
                window.addEventListener('message', function(event) {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'setValue') {
                            currentValue = data.value;
                            savedValue = data.value; // Also update saved state
                            if (editor && editor.getValue() !== currentValue) {
                                editor.setValue(currentValue);
                                updateSaveButtonState();
                            }
                        } else if (data.type === 'zoomIn') {
                            zoomIn();
                        } else if (data.type === 'zoomOut') {
                            zoomOut();
                        } else if (data.type === 'save') {
                            saveCode();
                        }
                    } catch (e) {
                        console.error('Failed to parse message:', e);
                    }
                });
                
                // Initial save button state update
                setTimeout(() => updateSaveButtonState(), 100);
                
                // Notify React Native that editor is ready
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'editorReady'
                }));
            });
        </script>
    </body>
    </html>`, [colorScheme, code]); // Dependencies for memoization

  // For non-web platforms, use WebView with Monaco Editor
  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView 
          style={styles.container}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <View style={[
            styles.editorContainer,
            { 
              borderColor: '#000000',
              backgroundColor: '#000000'
            }
          ]}>
            <WebView
            ref={webViewRef}
            source={{ html: monacoHTML }}
            style={styles.webView}
            onMessage={(event) => {
              try {
                const data = JSON.parse(event.nativeEvent.data);
                if (data.type === 'codeChange') {
                  // Store changes in ref only - no auto-sync
                  currentCodeRef.current = data.value;
                } else if (data.type === 'editorReady') {
                  setIsLoading(false);
                } else if (data.type === 'manualSave' || data.type === 'autoSave') {
                  // Handle both manual and auto saves
                  const codeToSave = data.value || currentCodeRef.current;
                  currentCodeRef.current = codeToSave;
                  globalState.updateCurrentCode(codeToSave);
                  setCode(codeToSave);
                }
              } catch (e) {
                console.error('Failed to parse WebView message:', e);
              }
            }}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            startInLoadingState={true}
            scalesPageToFit={false}
            scrollEnabled={false}
            keyboardDisplayRequiresUserAction={false}
            hideKeyboardAccessoryView={false}
            allowsInlineMediaPlayback={true}
            allowsLinkPreview={false}
            dataDetectorTypes="none"
            allowsBackForwardNavigationGestures={false}
            textInteractionEnabled={true}
            allowsFullscreenVideo={false}
          />
        </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ThemedView style={styles.content}>
          <ThemedText>Loading editor...</ThemedText>
        </ThemedView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        <View style={[
          styles.editorContainer,
          { 
            borderColor: '#000000',
            backgroundColor: '#000000'
          }
        ]}>
        <Editor
          height="100%"
          defaultLanguage="python"
          value={code}
          onMount={handleEditorDidMount}
          onChange={handleEditorChange}
          options={getEditorOptions()}
          theme="matrix-theme"
          loading={<ThemedText>Loading Monaco Editor...</ThemedText>}
        />
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editorContainer: {
    flex: 1,
    borderWidth: 0,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
