/**
 * Global state management for the application
 * Manages shared state between viewport and console components
 */

// Simple EventEmitter implementation for React Native
class SimpleEventEmitter {
  private listeners: { [event: string]: ((...args: any[]) => void)[] } = {};

  on(event: string, listener: (...args: any[]) => void) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
  }

  off(event: string, listener: (...args: any[]) => void) {
    if (!this.listeners[event]) return;
    const index = this.listeners[event].indexOf(listener);
    if (index > -1) {
      this.listeners[event].splice(index, 1);
    }
  }

  emit(event: string, ...args: any[]) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(listener => listener(...args));
  }
}

interface ConsoleMessage {
  type: 'input' | 'output' | 'error';
  text: string;
  timestamp: Date;
}

interface ViewportData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

interface AppState {
  consoleMessages: ConsoleMessage[];
  viewportData: ViewportData | null;
  isExecuting: boolean;
  pythonReady: boolean;
  currentCode: string;
  executionCancelRequested: boolean;
}

class GlobalStateManager extends SimpleEventEmitter {
  private state: AppState = {
    consoleMessages: [{
      type: 'output',
      text: '🐍 Python Console Ready!',
      timestamp: new Date(),
    }],
    viewportData: null,
    isExecuting: false,
    pythonReady: false,
    executionCancelRequested: false,
    currentCode: `# Welcome to XOS Graphics Programming with JavaScript Bridge! 🎨🚀⚡
# Import the xos package for super-fast viewport graphics via JavaScript bridge

import xos
import time
import math

def main():
    """Main demo - animated circles swapping between green and white with performance timing"""
    # Print viewport information
    print("🖥️  XOS VIEWPORT INFORMATION")
    print("=" * 40)
    print(f"Viewport dimensions: {xos.viewport.width} × {xos.viewport.height}")
    print(f"Total pixels: {xos.viewport.width * xos.viewport.height:,}")
    print("Bridge: JavaScript (Rust WASM ready)")
    print("=" * 40)

    # Calculate center position
    center_x = xos.viewport.width // 2
    center_y = xos.viewport.height // 2
    
    # Colors for swapping
    white = [255, 255, 255]
    green = [0, 255, 0]
    
    print("Starting 10 frames, 1s intervals")
    print()
    
    last_frame_time = time.time()
    total_render_time = 0
    
    # Run the swapping animation 10 times
    for i in range(10):
        # Start timing this frame's render
        frame_start_time = time.time()
        
        # Calculate delta from last frame (skip for first frame)
        if i > 0:
            delta_time = frame_start_time - last_frame_time
            print(f"Delta: {delta_time:.3f}s")
        
        # Determine color based on iteration (even = white, odd = green)
        if i % 2 == 0:
            color = white
            color_name = "W"
        else:
            color = green
            color_name = "G"
        
        # Clear background and draw circle
        xos.viewport.clear([0, 0, 0])
        xos.viewport.draw_circle(center_x, center_y, 100, color)
        
        # Update the display
        xos.update_display()
        
        # Calculate render time for this frame
        frame_render_time = time.time() - frame_start_time
        total_render_time += frame_render_time
        
        print(f"F{i + 1}: {color_name} | Render: {frame_render_time:.4f}s")
        
        # Update last frame time
        last_frame_time = frame_start_time
        
        # Wait 1 second before next iteration (skip wait on last iteration)
        if i < 9:
            time.sleep(1)
    
    print(f"\\nTotal render: {total_render_time:.4f}s | Avg: {total_render_time/10:.4f}s")

def animate_circles():
    """Draw animated colorful circles"""
    import random
    
    # Clear screen
    xos.viewport.clear([0, 0, 0])
    
    # Draw random circles
    for i in range(10):
        x = random.randint(50, xos.viewport.width - 50)
        y = random.randint(50, xos.viewport.height - 50) 
        radius = random.randint(20, 80)
        color = [random.randint(100, 255), random.randint(100, 255), random.randint(100, 255)]
        
        xos.viewport.draw_circle(x, y, radius, color)
    
    # Live update!
    xos.update_display()
    print("🌈 Random circles drawn!")

def draw_gradient():
    """Draw a gradient using fill_rect"""
    # Clear screen
    xos.viewport.clear([0, 0, 0])
    
    # Draw vertical gradient
    strip_width = xos.viewport.width // 20
    for i in range(20):
        x = i * strip_width
        color_intensity = int(255 * i / 19)
        xos.viewport.fill_rect(x, 0, strip_width, xos.viewport.height, 
                              [color_intensity, color_intensity // 2, 255 - color_intensity])
    
    xos.update_display()
    print("🎨 Gradient drawn!")

# Run the main demo
main()`,
  };

  // Get current state
  getState(): AppState {
    return { ...this.state };
  }

  // Add console message
  addConsoleMessage(type: 'input' | 'output' | 'error', text: string) {
    const message: ConsoleMessage = {
      type,
      text,
      timestamp: new Date(),
    };
    
    this.state.consoleMessages.push(message);
    this.emit('consoleUpdated', this.state.consoleMessages);
  }

  // Clear console messages
  clearConsole() {
    this.state.consoleMessages = [{
      type: 'output',
      text: 'Console cleared.',
      timestamp: new Date(),
    }];
    this.emit('consoleUpdated', this.state.consoleMessages);
  }

  // Get console messages
  getConsoleMessages(): ConsoleMessage[] {
    return [...this.state.consoleMessages];
  }

  // Update viewport data
  updateViewportData(data: ViewportData | null) {
    this.state.viewportData = data;
    this.emit('viewportUpdated', data);
  }

  // Get viewport data
  getViewportData(): ViewportData | null {
    return this.state.viewportData;
  }

  // Set execution state
  setExecuting(isExecuting: boolean) {
    this.state.isExecuting = isExecuting;
    if (!isExecuting) {
      this.state.executionCancelRequested = false; // Reset cancel flag when execution ends
    }
    this.emit('executionStateChanged', isExecuting);
  }

  // Get execution state
  isExecuting(): boolean {
    return this.state.isExecuting;
  }

  // Request execution cancellation
  requestExecutionCancel() {
    this.state.executionCancelRequested = true;
    this.emit('executionCancelRequested', true);
  }

  // Check if execution cancellation was requested
  isExecutionCancelRequested(): boolean {
    return this.state.executionCancelRequested;
  }

  // Set Python ready state
  setPythonReady(ready: boolean) {
    this.state.pythonReady = ready;
    if (ready) {
      this.addConsoleMessage('output', '🎉 Python ready for execution!');
    }
    this.emit('pythonReadyChanged', ready);
  }

  // Get Python ready state
  isPythonReady(): boolean {
    return this.state.pythonReady;
  }

  // Update current code
  updateCurrentCode(code: string) {
    this.state.currentCode = code;
    this.emit('codeUpdated', code);
  }

  // Get current code
  getCurrentCode(): string {
    return this.state.currentCode;
  }

  // Subscribe to state changes
  subscribe(event: string, callback: (...args: any[]) => void) {
    this.on(event, callback);
    return () => this.off(event, callback);
  }
}

// Singleton instance
const globalState = new GlobalStateManager();

export default globalState;
export type { AppState, ConsoleMessage, ViewportData };

