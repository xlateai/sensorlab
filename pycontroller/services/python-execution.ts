/**
 * Universal Python execution service
 * Handles Python code execution across web and mobile platforms
 */

import { Platform } from 'react-native';
import { executeMobilePython } from '../components/mobile-python-webview';

// Type definitions for Pyodide
interface PyodideInterface {
  runPython: (code: string) => any;
  loadPackage: (packages: string | string[]) => Promise<void>;
  globals: {
    get: (name: string) => any;
    set: (name: string, value: any) => void;
  };
  FS: {
    writeFile: (path: string, data: string) => void;
    readFile: (path: string, options?: { encoding: string }) => string;
  };
}

class PythonExecutionService {
  private pyodide: PyodideInterface | null = null;
  private isLoading = false;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Don't initialize immediately - wait for first execution request
  }

  /**
   * Initialize Pyodide runtime
   */
  private async initializePyodide(): Promise<void> {
    if (this.isInitialized || this.isLoading) {
      return this.initPromise || Promise.resolve();
    }

    // Check if we're in a browser environment
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
      throw new Error('Pyodide is only available in web browser environment');
    }

    this.isLoading = true;

    try {
      // Check if Pyodide is already loaded globally
      // @ts-ignore
      if (typeof loadPyodide !== 'undefined') {
        // @ts-ignore
        this.pyodide = await loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
        });
      } else {
        // Load Pyodide from CDN
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
        
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        // Wait a bit for the script to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Initialize Pyodide
        // @ts-ignore - Pyodide is loaded globally
        this.pyodide = await loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
        });
      }

      // Load NumPy for fast array operations
      console.log('Loading NumPy...');
      if (this.pyodide) {
        await this.pyodide.loadPackage("numpy");
      }
      
      // Set up Python environment
      await this.setupPythonEnvironment();

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Pyodide:', error);
      throw new Error(`Pyodide initialization failed: ${error}`);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Set up the Python environment with necessary configurations
   */
  private async setupPythonEnvironment(): Promise<void> {
    if (!this.pyodide) return;

    // Redirect Python stdout to capture print statements and set up XOS package
    this.pyodide.runPython(`
import sys
import io
import math
from js import console

class JSConsoleWriter:
    def __init__(self):
        self.buffer = []
        
    def write(self, text):
        if text.strip():  # Only add non-empty lines
            self.buffer.append(text.rstrip())
        return len(text)
        
    def flush(self):
        pass
        
    def getvalue(self):
        result = '\\n'.join(self.buffer)
        self.buffer.clear()
        return result

# Set up custom stdout capture
_stdout_capture = JSConsoleWriter()
sys.stdout = _stdout_capture

def get_output():
    return _stdout_capture.getvalue()

def clear_output():
    _stdout_capture.buffer.clear()

# XOS Package - Comprehensive graphics viewport system with NumPy optimization
import numpy as np

class XOSViewport:
    def __init__(self, width=None, height=None):
        # Use maximum screen resolution if not specified - make it square
        if width is None or height is None:
            try:
                # Try to get screen resolution from browser
                from js import window
                base_width = int(window.screen.width * (getattr(window, 'devicePixelRatio', 1)))
                base_height = int(window.screen.height * (getattr(window, 'devicePixelRatio', 1)))
                # Make viewport perfectly square using minimum dimension
                viewport_size = min(base_width, base_height)
                width = viewport_size
                height = viewport_size
            except:
                # Fallback to square resolution
                width = width or 1080
                height = height or 1080
        self.width = width
        self.height = height
        # RGB array as NumPy array: [height, width, 3] where each value is 0-255
        self.data = np.zeros((height, width, 3), dtype=np.uint8)
        
    def __getitem__(self, key):
        """Access pixel at [y, x] coordinates - returns NumPy array"""
        return self.data[key]
    
    def __setitem__(self, key, value):
        """Set pixel at [y, x] coordinates to RGB value"""
        self.data[key] = value
    
    def clear(self, color=[0, 0, 0]):
        """Clear viewport with specified color using NumPy vectorization"""
        self.data[:] = color
    
    def draw_circle_slow(self, center_x, center_y, radius, color=[255, 255, 255]):
        """Legacy slow circle drawing - kept for compatibility"""
        for y in range(max(0, center_y - radius), min(self.height, center_y + radius + 1)):
            for x in range(max(0, center_x - radius), min(self.width, center_x + radius + 1)):
                dx = x - center_x
                dy = y - center_y
                distance = math.sqrt(dx * dx + dy * dy)
                if distance <= radius:
                    self.data[y][x] = color
    
    def draw_circle(self, center_x, center_y, radius, color=[255, 255, 255]):
        """Fast NumPy-based circle drawing"""
        # Create coordinate grids
        y_coords, x_coords = np.ogrid[:self.height, :self.width]
        
        # Calculate distances from center
        distances = np.sqrt((x_coords - center_x)**2 + (y_coords - center_y)**2)
        
        # Create mask for pixels within radius
        mask = distances <= radius
        
        # Set pixels within the circle to the specified color
        self.data[mask] = color
                    
    def draw_line(self, x0, y0, x1, y1, color=[255, 255, 255]):
        """Draw a line using Bresenham's algorithm"""
        dx = abs(x1 - x0)
        dy = abs(y1 - y0)
        x, y = x0, y0
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        
        if dx > dy:
            err = dx / 2.0
            while x != x1:
                if 0 <= y < self.height and 0 <= x < self.width:
                    self.data[y][x] = color[:]
                err -= dy
                if err < 0:
                    y += sy
                    err += dx
                x += sx
        else:
            err = dy / 2.0
            while y != y1:
                if 0 <= y < self.height and 0 <= x < self.width:
                    self.data[y][x] = color[:]
                err -= dx
                if err < 0:
                    x += sx
                    err += dy
                y += sy
                
        # Draw final point
        if 0 <= y < self.height and 0 <= x < self.width:
            self.data[y][x] = color[:]

class XOS:
    def __init__(self):
        self.viewport = XOSViewport()
        self._viewport_data = None
    
    def update_display(self):
        """Update display with NumPy array data - much faster flattening"""
        # Flatten the NumPy array efficiently
        flat_data = self.viewport.data.flatten().tolist()
        self._viewport_data = {
            'width': self.viewport.width,
            'height': self.viewport.height,
            'data': flat_data
        }

# Create global xos instance
xos = XOS()

# Make xos available as a module for import
import types
xos_module = types.ModuleType('xos')
xos_module.viewport = xos.viewport
xos_module.update_display = xos.update_display
xos_module._instance = xos
xos_module.XOS = XOS
xos_module.XOSViewport = XOSViewport

# Add to sys.modules so it can be imported
sys.modules['xos'] = xos_module
`);

    // Create the main.py file in Pyodide's file system
    try {
      const mainPyContent = await this.getMainPyContent();
      this.pyodide.FS.writeFile('/main.py', mainPyContent);
    } catch (error) {
      console.warn('Could not load main.py:', error);
      // Create a simple fallback main.py
      this.pyodide.FS.writeFile('/main.py', `
print("Hello from Pyodide!")
print("This is a fallback main.py file")
import sys
print(f"Python version: {sys.version}")
`);
    }
  }

  /**
   * Get the content of main.py file
   */
  private async getMainPyContent(): Promise<string> {
    try {
      // Try to fetch main.py from the public directory or current path
      const response = await fetch('/main.py');
      if (response.ok) {
        return await response.text();
      }
      throw new Error('main.py not found');
    } catch (error) {
      // Fallback content if main.py is not accessible
      return `
#!/usr/bin/env python3
"""
Fallback main.py file for Pyodide execution
"""

import sys
import datetime

def main():
    print("🐍 Welcome to Pyodide Python execution!")
    print(f"Python version: {sys.version}")
    print(f"Current time: {datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Demo calculations
    print("\\n📊 Running some calculations:")
    numbers = [1, 2, 3, 4, 5]
    print(f"Numbers: {numbers}")
    print(f"Sum: {sum(numbers)}")
    print(f"Average: {sum(numbers) / len(numbers):.2f}")
    
    print("\\n✅ Execution completed successfully!")
    return "Script finished"

if __name__ == "__main__":
    try:
        result = main()
        print(f"\\n🎉 Result: {result}")
    except Exception as e:
        print(f"❌ Error occurred: {e}")
        import traceback
        traceback.print_exc()
`;
    }
  }

  /**
   * Execute Python code and return the output
   */
  async executePython(code: string): Promise<string> {
    // Try mobile execution first (for iOS/Android)
    if (Platform.OS !== 'web') {
      try {
        return await executeMobilePython(code);
      } catch (error) {
        return `Mobile Python execution failed: ${error}`;
      }
    }

    // Web execution using Pyodide
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return this.executeWebPython(code);
    }

    return 'Python execution not available on this platform';
  }

  /**
   * Execute Python code on web platform
   */
  private async executeWebPython(code: string): Promise<string> {
    // Import globalState to check for cancellation
    const { default: globalState } = await import('./global-state');
    
    // Check for cancellation before starting
    if (globalState.isExecutionCancelRequested()) {
      return 'Execution cancelled';
    }

    // Initialize Pyodide if not already done
    if (!this.isInitialized && !this.isLoading) {
      try {
        this.initPromise = this.initializePyodide();
        await this.initPromise;
      } catch (error) {
        return `Failed to initialize Python environment: ${error}`;
      }
    }

    // Wait for initialization if currently in progress
    if (this.isLoading && this.initPromise) {
      try {
        await this.initPromise;
      } catch (error) {
        return `Failed to initialize Python environment: ${error}`;
      }
    }

    // Check for cancellation after initialization
    if (globalState.isExecutionCancelRequested()) {
      return 'Execution cancelled';
    }

    if (!this.pyodide) {
      throw new Error('Pyodide runtime not available');
    }

    try {
      // Clear previous output
      this.pyodide.runPython('clear_output()');

      // Ensure xos is available globally for every execution
      this.pyodide.runPython(`
# Ensure xos is available as global variable
if 'xos' not in globals():
    import sys
    if 'xos' in sys.modules:
        import xos as xos_imported
        # Make viewport and update_display available globally
        xos = type('XOSGlobal', (), {
            'viewport': xos_imported.viewport,
            'update_display': xos_imported.update_display,
            'XOS': xos_imported.XOS,
            'XOSViewport': xos_imported.XOSViewport
        })()
        globals()['xos'] = xos
      `);

      // For interactive terminal behavior, always try to eval first and print result
      const codeToExecute = code.trim();
      
      // Check for cancellation before execution
      if (globalState.isExecutionCancelRequested()) {
        return 'Execution cancelled';
      }

      // Try to evaluate as expression first, then fallback to exec
      const pythonEvalCode = `
try:
    __result = eval(${JSON.stringify(codeToExecute)})
    if __result is not None:
        print(repr(__result))
except:
    # If eval fails, execute as statement
    exec(${JSON.stringify(codeToExecute)})
      `;
      
      this.pyodide.runPython(pythonEvalCode);

      // Check for cancellation after execution
      if (globalState.isExecutionCancelRequested()) {
        return 'Execution cancelled';
      }

      // Get the captured output
      const output = this.pyodide.runPython('get_output()');
      
      return output || ''; // Return empty string if no output
    } catch (error: any) {
      // Format Python errors nicely
      let errorMessage = error.toString();
      
      // Clean up the error message
      if (errorMessage.includes('PythonError:')) {
        errorMessage = errorMessage.replace('PythonError: ', '');
      }
      
      return `Error: ${errorMessage}`;
    }
  }

  /**
   * Execute the current code from global state
   */
  async executeCurrentCode(): Promise<string> {
    // Import globalState at runtime to avoid circular dependency
    const { default: globalState } = await import('./global-state');
    const currentCode = globalState.getCurrentCode();
    return this.executePython(currentCode);
  }

  /**
   * Execute current code and update viewport data
   */
  async executeCurrentCodeWithViewport(): Promise<string> {
    // Import globalState at runtime to avoid circular dependency
    const { default: globalState } = await import('./global-state');
    
    // Execute the current code
    const result = await this.executeCurrentCode();
    
    // Note: Viewport updates are now live via JavaScript bridge!
    // No need for manual updateViewportData() calls anymore
    
    return result;
  }

  /**
   * Update viewport data from Python xos instance
   */
  async updateViewportData(): Promise<void> {
    // Import globalState at runtime to avoid circular dependency
    const { default: globalState } = await import('./global-state');
    
    // Check if cancellation was requested
    if (globalState.isExecutionCancelRequested()) {
      return;
    }

    try {
      const viewportResult = await this.executePython(`
import json, sys
out = {}
try:
  # Try direct global xos first
  if 'xos' in globals():
    obj = globals()['xos']
    try:
      if hasattr(obj, 'update_display'):
        obj.update_display()
    except:
      pass
    if hasattr(obj, '_viewport_data') and obj._viewport_data:
      out = obj._viewport_data

  # Fallback to module-level xos in sys.modules
  if not out and 'xos' in sys.modules:
    mod = sys.modules['xos']
    try:
      # Try calling module update_display if present
      if hasattr(mod, 'update_display'):
        try:
          mod.update_display()
        except:
          pass
        upd = mod.update_display
        owner = getattr(upd, '__self__', None)
        if owner and hasattr(owner, '_viewport_data') and owner._viewport_data:
          out = owner._viewport_data

      # If the module exposes the original instance, check it too
      if not out and hasattr(mod, '_instance') and hasattr(mod._instance, '_viewport_data'):
        out = mod._instance._viewport_data
    except:
      pass
except Exception:
  pass

print(json.dumps(out or {}))
`);

      // Check again if cancellation was requested during viewport update
      if (globalState.isExecutionCancelRequested()) {
        return;
      }

      try {
        const cleanJson = viewportResult.trim();
        if (cleanJson && cleanJson.startsWith('{')) {
          const parsed = JSON.parse(cleanJson);
          if (parsed.data && parsed.width && parsed.height) {
            const uint8Array = new Uint8ClampedArray(parsed.data);
            globalState.updateViewportData({
              width: parsed.width,
              height: parsed.height,
              data: uint8Array
            });
          }
        }
      } catch (parseError) {
        // Silent parsing error - viewport data may not be available
      }
    } catch (error) {
      // Silent error - viewport update is optional
    }
  }

  /**
   * Execute the main.py file (deprecated - use executeCurrentCode instead)
   */
  async executeMainPy(): Promise<string> {
    // executeMainPy is deprecated. Use executeCurrentCode instead.
    return this.executeCurrentCode();
  }

  /**
   * Check if Python execution is ready
   */
  isReady(): boolean {
    if (Platform.OS !== 'web') {
      return true; // Mobile bridge is always ready once initialized
    }
    return this.isInitialized && this.pyodide !== null;
  }

  /**
   * Get initialization status
   */
  getStatus(): 'not-started' | 'loading' | 'ready' | 'error' {
    if (Platform.OS !== 'web') {
      return 'ready'; // Mobile is always ready
    }
    
    if (this.isInitialized) {
      return 'ready';
    }
    
    if (this.isLoading) {
      return 'loading';
    }
    
    return 'not-started';
  }

  /**
   * Check if the environment supports Python execution
   */
  isSupported(): boolean {
    return true; // Now supported on all platforms!
  }

  /**
   * Initialize mobile Python bridge - no longer needed with new implementation
   */
  initMobileBridge(webViewRef: any) {
    // This method is deprecated - mobile bridge is handled automatically
  }
}

// Singleton instance
const pythonService = new PythonExecutionService();

export default pythonService;