import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface WaveDefinition {
  id: string;
  type: 'sine' | 'sweep';
  shape: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';
  frequency: number;
  startFreq: number;
  endFreq: number;
  sweepK: number;
}

interface WebAudioBridgeProps {
  waves: WaveDefinition[];
  isPlaying: boolean;
  volume: number;
  multiplicity: number;
  isNegated: boolean;
  customCurves?: Array<{id: string, name: string, points: {x: number, y: number}[]}>;
  onAudioReady?: () => void;
  onError?: (error: string) => void;
}

export default function WebAudioBridge({
  waves,
  isPlaying,
  volume,
  multiplicity,
  isNegated,
  customCurves = [],
  onAudioReady,
  onError,
}: WebAudioBridgeProps) {
  const webViewRef = useRef<WebView>(null);
  const [isWebViewReady, setIsWebViewReady] = useState(false);

  // Send commands to WebView
  const sendToWebView = (command: string, data?: any) => {
    if (webViewRef.current && isWebViewReady) {
      const message = JSON.stringify({ command, data });
      webViewRef.current.postMessage(message);
    }
  };

  // Update audio parameters when they change
  useEffect(() => {
    if (isWebViewReady) {
      sendToWebView('updateWaves', { waves, volume, multiplicity, isNegated, customCurves });
    }
  }, [waves, volume, multiplicity, isNegated, customCurves, isWebViewReady]);

  // Control playback
  useEffect(() => {
    if (isWebViewReady) {
      if (isPlaying) {
        sendToWebView('startAudio');
      } else {
        sendToWebView('stopAudio');
      }
    }
  }, [isPlaying, isWebViewReady]);

  // Handle messages from WebView
  const onMessage = (event: any) => {
    try {
      const message = JSON.parse(event.nativeEvent.data);
      
      switch (message.type) {
        case 'ready':
          setIsWebViewReady(true);
          onAudioReady?.();
          break;
        case 'error':
          onError?.(message.error);
          break;
        case 'log':
        //   console.log('[WebAudio]', message.message);
          break;
      }
    } catch (error) {
      console.warn('Error parsing WebView message:', error);
    }
  };

  // HTML content with Web Audio API implementation
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Audio Bridge</title>
    <style>
        body { 
            margin: 0; 
            padding: 0; 
            background: transparent; 
            font-family: monospace;
            font-size: 12px;
            color: #00ff00;
        }
        #status {
            position: absolute;
            top: 5px;
            left: 5px;
            background: rgba(0,0,0,0.7);
            padding: 5px;
            border-radius: 3px;
            display: none; /* Hidden by default */
        }
        #debug { display: none; } /* Hidden debug info */
    </style>
</head>
<body>
    <div id="status">Audio Bridge Ready</div>
    <div id="debug"></div>

    <script>
        class WebAudioBridge {
            constructor() {
                this.audioContext = null;
                this.oscillators = [];
                this.gainNodes = [];
                this.masterGain = null;
                this.isInitialized = false;
                this.currentWaves = [];
                this.customCurves = [];
                this.volume = 0.3;
                this.multiplicity = 1.0;
                this.isNegated = false;
                
                this.log('WebAudioBridge initializing...');
                this.init();
            }

            log(message) {
                console.log('[WebAudioBridge]', message);
                // Send log to React Native
                this.sendMessage('log', { message });
                
                // Optional: show in debug div
                const debug = document.getElementById('debug');
                if (debug && debug.style.display !== 'none') {
                    debug.innerHTML += '<div>' + message + '</div>';
                }
            }

            sendMessage(type, data = {}) {
                try {
                    window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...data }));
                } catch (error) {
                    console.error('Failed to send message to React Native:', error);
                }
            }

            async init() {
                try {
                    // Initialize Audio Context
                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    
                    // Create master gain node for volume control
                    this.masterGain = this.audioContext.createGain();
                    this.masterGain.connect(this.audioContext.destination);
                    
                    this.isInitialized = true;
                    this.log('Audio context initialized successfully');
                    
                    // Notify React Native that we're ready
                    this.sendMessage('ready');
                    
                } catch (error) {
                    this.log('Failed to initialize audio context: ' + error.message);
                    this.sendMessage('error', { error: error.message });
                }
            }

            generateWaveShape(shape, audioContext) {
                const oscillator = audioContext.createOscillator();
                
                // Check if it's a custom curve
                const customCurve = this.customCurves.find(curve => curve.id === shape);
                
                if (customCurve && customCurve.points && customCurve.points.length > 1) {
                    // Generate custom periodic wave from Bezier curve points
                    const harmonics = 128; // Number of harmonics to use
                    const real = new Float32Array(harmonics);
                    const imag = new Float32Array(harmonics);
                    
                    // Sample the custom curve at regular intervals to create a wavetable
                    const samples = 512; // Number of samples for the wavetable
                    const wavetable = new Array(samples);
                    
                    for (let i = 0; i < samples; i++) {
                        const t = i / samples;
                        
                        // Find the appropriate curve segment and interpolate
                        const curveIndex = Math.floor(t * (customCurve.points.length - 1));
                        const nextIndex = Math.min(curveIndex + 1, customCurve.points.length - 1);
                        const localT = (t * (customCurve.points.length - 1)) - curveIndex;
                        
                        const p1 = customCurve.points[curveIndex];
                        const p2 = customCurve.points[nextIndex];
                        const y = p1.y + (p2.y - p1.y) * localT;
                        
                        // Convert from 0-1 range to -1 to 1 range
                        wavetable[i] = (y - 0.5) * 2;
                    }
                    
                    // Convert wavetable to frequency domain using DFT
                    // This is a simplified approach - we'll create harmonic content based on the curve
                    for (let h = 1; h < harmonics && h < 64; h++) {
                        let realSum = 0;
                        let imagSum = 0;
                        
                        // Calculate Fourier coefficients for this harmonic
                        for (let i = 0; i < samples; i++) {
                            const angle = (2 * Math.PI * h * i) / samples;
                            realSum += wavetable[i] * Math.cos(angle);
                            imagSum -= wavetable[i] * Math.sin(angle);
                        }
                        
                        // Normalize and apply
                        real[h] = realSum / samples;
                        imag[h] = imagSum / samples;
                    }
                    
                    // Create and apply the custom periodic wave
                    const customWave = audioContext.createPeriodicWave(real, imag, { disableNormalization: false });
                    oscillator.setPeriodicWave(customWave);
                } else {
                    // Standard wave shapes
                    switch (shape) {
                        case 'sine':
                            oscillator.type = 'sine';
                            break;
                        case 'square':
                            oscillator.type = 'square';
                            break;
                        case 'triangle':
                            oscillator.type = 'triangle';
                            break;
                        case 'sawtooth':
                            oscillator.type = 'sawtooth';
                            break;
                        case 'noise':
                            // For noise, create custom periodic wave
                            const real = new Float32Array(16);
                            const imag = new Float32Array(16);
                            for (let i = 0; i < 16; i++) {
                                real[i] = Math.random() * 2 - 1;
                                imag[i] = Math.random() * 2 - 1;
                            }
                            const customWave = audioContext.createPeriodicWave(real, imag);
                            oscillator.setPeriodicWave(customWave);
                            break;
                        default:
                            oscillator.type = 'sine';
                    }
                }
                
                return oscillator;
            }

            generateWaveFrequencies(wave) {
                if (wave.type === 'sine') {
                    return [wave.frequency];
                } else {
                    // sweep type
                    if (wave.sweepK < 2) return [wave.startFreq];
                    
                    const freqs = [];
                    const step = (wave.endFreq - wave.startFreq) / (wave.sweepK - 1);
                    
                    for (let i = 0; i < wave.sweepK; i++) {
                        freqs.push(wave.startFreq + (step * i));
                    }
                    
                    return freqs;
                }
            }

            async startAudio() {
                if (!this.isInitialized || !this.audioContext) {
                    this.log('Audio context not ready');
                    return;
                }

                try {
                    // Resume audio context if suspended (required for user interaction)
                    if (this.audioContext.state === 'suspended') {
                        await this.audioContext.resume();
                        this.log('Audio context resumed');
                    }

                    this.stopAudio(); // Clean up any existing audio

                    // Get all frequencies from all waves
                    const allWaveData = [];
                    this.currentWaves.forEach(wave => {
                        const frequencies = this.generateWaveFrequencies(wave);
                        frequencies.forEach(freq => {
                            allWaveData.push({ frequency: freq, shape: wave.shape });
                        });
                    });

                    this.log(\`Starting audio with \${allWaveData.length} oscillators\`);

                    // Create oscillators for each frequency and shape
                    allWaveData.forEach((waveData) => {
                        const oscillator = this.generateWaveShape(waveData.shape, this.audioContext);
                        const multipliedFreq = waveData.frequency * this.multiplicity;
                        oscillator.frequency.setValueAtTime(multipliedFreq, this.audioContext.currentTime);
                        
                        // Create gain node for individual oscillator
                        const gainNode = this.audioContext.createGain();
                        const volumePerOscillator = this.volume / allWaveData.length;
                        const finalGain = this.isNegated ? -volumePerOscillator : volumePerOscillator;
                        gainNode.gain.setValueAtTime(finalGain, this.audioContext.currentTime);
                        
                        // Connect: Oscillator -> Individual Gain -> Master Gain -> Destination
                        oscillator.connect(gainNode);
                        gainNode.connect(this.masterGain);
                        
                        // Store references
                        this.oscillators.push(oscillator);
                        this.gainNodes.push(gainNode);
                        
                        // Start oscillator
                        oscillator.start();
                    });

                    this.log('Audio started successfully');

                } catch (error) {
                    this.log('Error starting audio: ' + error.message);
                    this.sendMessage('error', { error: error.message });
                }
            }

            stopAudio() {
                try {
                    // Stop all oscillators
                    this.oscillators.forEach(oscillator => {
                        try {
                            oscillator.stop();
                        } catch (e) {
                            // Oscillator might already be stopped
                        }
                    });
                    
                    // Clear arrays
                    this.oscillators = [];
                    this.gainNodes = [];
                    
                    this.log('Audio stopped');
                    
                } catch (error) {
                    this.log('Error stopping audio: ' + error.message);
                }
            }

            updateWaves(data) {
                const oldWaves = JSON.stringify(this.currentWaves);
                this.currentWaves = data.waves || [];
                this.customCurves = data.customCurves || [];
                this.volume = data.volume || 0.3;
                this.multiplicity = data.multiplicity || 1.0;
                this.isNegated = data.isNegated || false;
                
                this.log(\`Updated waves: \${this.currentWaves.length} waves, volume: \${Math.round(this.volume * 100)}%, multiplicity: \${Math.round(this.multiplicity * 100)}%\`);
                
                // Update master gain
                if (this.masterGain) {
                    const masterVolume = this.volume;
                    this.masterGain.gain.setValueAtTime(masterVolume, this.audioContext.currentTime);
                }
                
                // Update individual oscillator frequencies and gains if playing
                if (this.oscillators.length > 0 && this.audioContext) {
                    const newWaves = JSON.stringify(this.currentWaves);
                    
                    // Check if wave structure changed (different shapes, counts, etc)
                    const currentFreqs = [];
                    this.currentWaves.forEach(wave => {
                        const frequencies = this.generateWaveFrequencies(wave);
                        frequencies.forEach(freq => {
                            currentFreqs.push({ frequency: freq, shape: wave.shape });
                        });
                    });
                    
                    // If oscillator count matches, update frequencies live
                    if (this.oscillators.length === currentFreqs.length) {
                        // this.log('Live updating frequencies and gains');
                        
                        // Update each oscillator's frequency and gain
                        this.oscillators.forEach((oscillator, index) => {
                            if (oscillator && currentFreqs[index]) {
                                const multipliedFreq = currentFreqs[index].frequency * this.multiplicity;
                                oscillator.frequency.setValueAtTime(multipliedFreq, this.audioContext.currentTime);
                            }
                        });
                        
                        // Update gain nodes
                        this.gainNodes.forEach((gainNode, index) => {
                            if (gainNode) {
                                const volumePerOscillator = this.volume / currentFreqs.length;
                                const finalGain = this.isNegated ? -volumePerOscillator : volumePerOscillator;
                                gainNode.gain.setValueAtTime(finalGain, this.audioContext.currentTime);
                            }
                        });
                    } else {
                        // Structure changed, need to restart
                        this.log('Wave structure changed - restarting audio');
                        const wasPlaying = this.oscillators.length > 0;
                        this.stopAudio();
                        if (wasPlaying) {
                            // Small delay to ensure clean restart
                            setTimeout(() => {
                                this.startAudio();
                            }, 10);
                        }
                    }
                }
            }
        }

        // Initialize bridge
        let bridge = null;
        
        // Handle messages from React Native
        document.addEventListener('message', function(event) {
            handleMessage(event.data);
        });
        
        window.addEventListener('message', function(event) {
            handleMessage(event.data);
        });

        function handleMessage(data) {
            try {
                const message = JSON.parse(data);
                
                if (!bridge) {
                    bridge = new WebAudioBridge();
                }
                
                switch (message.command) {
                    case 'startAudio':
                        bridge.startAudio();
                        break;
                    case 'stopAudio':
                        bridge.stopAudio();
                        break;
                    case 'updateWaves':
                        bridge.updateWaves(message.data);
                        break;
                    default:
                        bridge.log('Unknown command: ' + message.command);
                }
                
            } catch (error) {
                console.error('Error handling message:', error);
            }
        }

        // Auto-initialize when page loads
        window.onload = function() {
            if (!bridge) {
                bridge = new WebAudioBridge();
            }
        };
    </script>
</body>
</html>
`;

  // Only render WebView on platforms that support it
  if (Platform.OS === 'web') {
    // On web, we can use Web Audio API directly, so this component isn't needed
    return null;
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        style={styles.webView}
        onMessage={onMessage}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        // iOS specific props
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        // Android specific props
        mixedContentMode="compatibility"
        originWhitelist={['*']}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 0,
    height: 0,
    opacity: 0,
    position: 'absolute',
  },
  webView: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});