import React, { useRef, useState } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface MobilePythonWebViewProps {
  onReady?: () => void;
}

// Global execution queue for mobile Python
let executionQueue: Array<{
  code: string;
  resolve: (result: string) => void;
  reject: (error: Error) => void;
}> = [];

let webViewInstance: WebView | null = null;
let isWebViewReady = false;

export default function MobilePythonWebView({ onReady }: MobilePythonWebViewProps) {
  const webViewRef = useRef<WebView>(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleWebViewLoad = () => {
    webViewInstance = webViewRef.current;
    setIsLoading(false);
  };

  const handleMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      if (message.type === 'pyodide_ready') {
        isWebViewReady = true;
        onReady?.();
        
        // Process any queued executions
        processExecutionQueue();
      } else if (message.type === 'execution_result') {
        // Handle execution result
        if (executionQueue.length > 0) {
          const execution = executionQueue.shift();
          if (execution) {
            if (message.error) {
              execution.reject(new Error(message.error));
            } else {
              execution.resolve(message.result || '');
            }
          }
        }
      } else if (message.type === 'viewport_update') {
        // Handle fast viewport updates from JavaScript
        const { default: globalState } = require('@/services/global-state');
        globalState.updateViewportData({
          width: message.width,
          height: message.height,
          data: new Uint8ClampedArray(message.data)
        });
      }
    } catch (error) {
      console.error('❌ Error parsing WebView message:', error);
    }
  };

  const processExecutionQueue = () => {
    if (executionQueue.length > 0 && webViewInstance && isWebViewReady) {
      const execution = executionQueue[0]; // Don't remove yet, wait for result
      webViewInstance.postMessage(JSON.stringify({
        type: 'execute_python',
        code: execution.code
      }));
    }
  };

  // Only render on mobile platforms
  if (Platform.OS === 'web') {
    return null;
  }

  const pythonHTML = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Mobile Python Runtime</title>
    <script src="https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js"></script>
    <style>
        body { 
            margin: 0; 
            padding: 20px; 
            font-family: monospace; 
            background: #000;
            color: #0f0;
            font-size: 12px;
        }
        #status { 
            padding: 10px; 
            background: #333; 
            border-radius: 5px; 
            margin-bottom: 10px;
        }
        #output { 
            background: #111; 
            padding: 10px; 
            border-radius: 5px; 
            white-space: pre-wrap; 
            font-size: 10px;
            min-height: 100px;
            max-height: 200px;
            overflow-y: auto;
        }
    </style>
</head>
<body>
    <div id="status">🐍 Initializing Pyodide...</div>
    <div id="output"></div>

    <script>
        let pyodide = null;
        let isReady = false;

        function sendMessage(type, data) {
            const message = { type, ...data };
            window.ReactNativeWebView?.postMessage(JSON.stringify(message));
        }

        function updateStatus(message) {
            document.getElementById('status').textContent = message;
        }

        function addOutput(text) {
            const output = document.getElementById('output');
            output.textContent += text + '\\n';
            output.scrollTop = output.scrollHeight;
        }

        // Fast viewport using SharedArrayBuffer and direct memory access
        let viewportBuffer = null;
        let viewportWidth = 0;
        let viewportHeight = 0;

        function initFastViewport() {
            // Calculate square viewport size
            const screenWidth = ${Math.floor(Dimensions.get('window').width * Dimensions.get('screen').scale)};
            const screenHeight = ${Math.floor(Dimensions.get('window').height * Dimensions.get('screen').scale)};
            const viewportSize = Math.min(screenWidth, screenHeight);
            
            viewportWidth = viewportSize;
            viewportHeight = viewportSize;
            
            // Create buffer for RGB data (3 bytes per pixel)
            const bufferSize = viewportWidth * viewportHeight * 3;
            viewportBuffer = new ArrayBuffer(bufferSize);
            
            // Initialize to black
            const view = new Uint8Array(viewportBuffer);
            view.fill(0);
            
            console.log('✅ Fast viewport initialized:', viewportWidth, 'x', viewportHeight, 'buffer size:', bufferSize);
            
            return { width: viewportWidth, height: viewportHeight, buffer: viewportBuffer };
        }

        // Fast drawing functions using direct buffer access
        function setPixel(x, y, r, g, b) {
            if (x < 0 || x >= viewportWidth || y < 0 || y >= viewportHeight) return;
            
            const index = (y * viewportWidth + x) * 3;
            const view = new Uint8Array(viewportBuffer);
            view[index] = r;
            view[index + 1] = g;
            view[index + 2] = b;
        }

        function fillRect(x, y, width, height, r, g, b) {
            const endX = Math.min(x + width, viewportWidth);
            const endY = Math.min(y + height, viewportHeight);
            
            for (let py = Math.max(0, y); py < endY; py++) {
                for (let px = Math.max(0, x); px < endX; px++) {
                    setPixel(px, py, r, g, b);
                }
            }
        }

        function clearViewport(r = 0, g = 0, b = 0) {
            const view = new Uint8Array(viewportBuffer);
            for (let i = 0; i < view.length; i += 3) {
                view[i] = r;
                view[i + 1] = g;
                view[i + 2] = b;
            }
        }

        function drawCircle(centerX, centerY, radius, r, g, b) {
            const radiusSquared = radius * radius;
            const minX = Math.max(0, centerX - radius);
            const maxX = Math.min(viewportWidth - 1, centerX + radius);
            const minY = Math.max(0, centerY - radius);
            const maxY = Math.min(viewportHeight - 1, centerY + radius);
            
            for (let y = minY; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    const dx = x - centerX;
                    const dy = y - centerY;
                    if (dx * dx + dy * dy <= radiusSquared) {
                        setPixel(x, y, r, g, b);
                    }
                }
            }
        }

        function updateDisplay() {
            // Send the buffer data to React Native for rendering
            const rgbArray = Array.from(new Uint8Array(viewportBuffer));
            sendMessage('viewport_update', {
                width: viewportWidth,
                height: viewportHeight,
                data: rgbArray
            });
        }

        async function initPyodide() {
            try {
                updateStatus('🔄 Loading Pyodide...');
                
                pyodide = await loadPyodide({
                    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
                });

                updateStatus('⚙️ Setting up Python environment...');
                
                // Initialize fast viewport
                const viewportConfig = initFastViewport();

                // Install NumPy for compatibility (but we won't use it for viewport)
                updateStatus('📦 Installing NumPy...');
                await pyodide.loadPackage("numpy");

                // Set up stdout capture
                pyodide.runPython(\`
import sys
import io

class OutputCapture:
    def __init__(self):
        self.buffer = []
        
    def write(self, text):
        if text.strip():
            self.buffer.append(text.rstrip())
        return len(text)
        
    def flush(self):
        pass
        
    def getvalue(self):
        result = '\\\\n'.join(self.buffer)
        self.buffer.clear()
        return result

_output_capture = OutputCapture()
sys.stdout = _output_capture

def get_output():
    return _output_capture.getvalue()

def clear_output():
    _output_capture.buffer.clear()

# Initialize XOS package with JavaScript bridge optimization
import math

# Get actual pixel resolution from React Native - make it square
base_width = ${Math.floor(Dimensions.get('window').width * Dimensions.get('screen').scale)}
base_height = ${Math.floor(Dimensions.get('window').height * Dimensions.get('screen').scale)}
viewport_size = min(base_width, base_height)
screen_width = viewport_size
screen_height = viewport_size

# JavaScript bridge functions for fast viewport operations
from js import setPixel, fillRect, clearViewport, drawCircle, updateDisplay

class XOSViewport:
    def __init__(self, width=screen_width, height=screen_height):
        self.width = width
        self.height = height
        # Clear the viewport to black initially
        clearViewport(0, 0, 0)
        
    def set_pixel(self, x, y, color=[255, 255, 255]):
        """Set a single pixel to the specified color"""
        r, g, b = color if len(color) >= 3 else [color[0], color[0], color[0]]
        setPixel(int(x), int(y), int(r), int(g), int(b))
    
    def __setitem__(self, key, value):
        """Set pixel at [y, x] coordinates to RGB value (for NumPy-style access)"""
        if isinstance(key, tuple) and len(key) == 2:
            y, x = key
            if isinstance(value, (list, tuple)) and len(value) >= 3:
                self.set_pixel(x, y, value)
    
    def clear(self, color=[0, 0, 0]):
        """Clear viewport with specified color"""
        r, g, b = color if len(color) >= 3 else [color[0], color[0], color[0]]
        clearViewport(int(r), int(g), int(b))
    
    def fill_rect(self, x, y, width, height, color=[255, 255, 255]):
        """Fill a rectangle with the specified color"""
        r, g, b = color if len(color) >= 3 else [color[0], color[0], color[0]]
        fillRect(int(x), int(y), int(width), int(height), int(r), int(g), int(b))
    
    def draw_circle(self, center_x, center_y, radius, color=[255, 255, 255]):
        """Draw a filled circle"""
        r, g, b = color if len(color) >= 3 else [color[0], color[0], color[0]]
        drawCircle(int(center_x), int(center_y), int(radius), int(r), int(g), int(b))

class XOS:
    def __init__(self):
        self.viewport = XOSViewport()
    
    def update_display(self):
        """Update display - now uses direct JavaScript bridge (no serialization needed!)"""
        # Call JavaScript function to send current buffer to React Native
        updateDisplay()
        # No need to store _viewport_data anymore - it's live!

# Create global xos instance
xos = XOS()

# Make xos available as an importable module
import types
xos_module = types.ModuleType('xos')
xos_module.viewport = xos.viewport
xos_module.update_display = xos.update_display
xos_module._instance = xos
xos_module.XOS = XOS
xos_module.XOSViewport = XOSViewport

# Add to sys.modules so it can be imported
sys.modules['xos'] = xos_module

# Also make it available globally
globals()['xos'] = xos
                \`);

                updateStatus('✅ Python Ready!');
                isReady = true;
                
                sendMessage('pyodide_ready', {});
                
            } catch (error) {
                const errorMsg = 'Failed to initialize: ' + error.toString();
                updateStatus('❌ ' + errorMsg);
                console.error('Pyodide init error:', error);
            }
        }

        async function executePython(code) {
            if (!isReady || !pyodide) {
                return { error: 'Python not ready' };
            }

            try {
                // Clear previous output
                pyodide.runPython('clear_output()');
                
                // For interactive terminal behavior, always try to eval first and print result
                const codeToExecute = code.trim();
                
                // Try to evaluate as expression first, then fallback to exec
                const pythonEvalCode = \`
try:
    __result = eval(\` + JSON.stringify(codeToExecute) + \`)
    if __result is not None:
        print(repr(__result))
except:
    # If eval fails, execute as statement
    exec(\` + JSON.stringify(codeToExecute) + \`)
                \`;
                
                pyodide.runPython(pythonEvalCode);
                
                // Get the output
                const output = pyodide.runPython('get_output()');
                
                return { result: output || '' };
            } catch (error) {
                const errorMsg = error.toString();
                return { error: errorMsg };
            }
        }

        // Listen for messages from React Native
        window.addEventListener('message', async (event) => {
            try {
                const data = JSON.parse(event.data);
                
                if (data.type === 'execute_python') {
                    const result = await executePython(data.code);
                    sendMessage('execution_result', result);
                }
            } catch (error) {
                console.error('Error handling message:', error);
                sendMessage('execution_result', { error: error.toString() });
            }
        });

        // Initialize when page loads
        document.addEventListener('DOMContentLoaded', initPyodide);
        
        // Fallback initialization
        setTimeout(initPyodide, 100);
    </script>
</body>
</html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: pythonHTML }}
        onLoad={handleWebViewLoad}
        onMessage={handleMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        mixedContentMode="compatibility"
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        style={styles.webview}
        // Enable debugging in development
        webviewDebuggingEnabled={__DEV__}
      />
    </View>
  );
}

// Export function for executing Python code from mobile
export async function executeMobilePython(code: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!webViewInstance || !isWebViewReady) {
      reject(new Error('Python bridge not ready'));
      return;
    }

    // Add to execution queue
    executionQueue.push({ code, resolve, reject });

    // Process if this is the only item in queue
    if (executionQueue.length === 1) {
      webViewInstance.postMessage(JSON.stringify({
        type: 'execute_python',
        code
      }));
    }

    // Timeout after 30 seconds
    setTimeout(() => {
      const index = executionQueue.findIndex(e => e.code === code);
      if (index !== -1) {
        executionQueue.splice(index, 1);
        reject(new Error('Execution timeout'));
      }
    }, 30000);
  });
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: -1000, // Hide the WebView offscreen
    left: -1000,
    width: 1,
    height: 1,
    opacity: 0,
  },
  webview: {
    width: 1,
    height: 1,
  },
});