# Pygame Wave Editor

A Python implementation of an interactive audio wave generator using pygame, recreating the functionality from the React Native WaveEditor component.

## Features

- **Real-time waveform visualization** with animated display
- **Multiple wave shapes**: Sine, Square, Triangle, Sawtooth, Noise
- **Wave types**: Single frequency waves and frequency sweeps
- **Interactive controls**: Volume, frequency multiplicity, phase negation
- **Multiple wave support**: Add up to 8 waves and see their composite waveform
- **Real-time audio playback** using pygame.mixer
- **Save/Load presets** for wave configurations
- **Pixel-perfect rendering** with pygame graphics

## Installation

1. Install the required dependencies:
```bash
pip install -r requirements.txt
```

2. Run the wave editor:
```bash
python pygame_wave_editor.py
```

## Controls

### Main Controls
- **Play/Stop Button**: Start or stop audio playback
- **Negate Button**: Invert the phase of all waves
- **Volume Slider**: Control overall volume (0-100%)
- **Multiplicity Slider**: Scale all frequencies by a multiplier (0-100%)

### Wave Controls
Each wave has its own set of controls:
- **Wave Type Button**: Switch between "Sine" (single frequency) and "Sweep" (frequency range)
- **Shape Dropdown**: Choose wave shape (Sine, Square, Triangle, Sawtooth, Noise)
- **Frequency Slider**: Set the frequency for sine waves (10Hz - 2000Hz)
- **Sweep Controls**: For sweep waves, control start/end frequencies
- **Remove Button**: Delete the wave (only available when multiple waves exist)

### Wave Management
- **Add Wave Button**: Add a new wave (up to 8 waves total)
- **Save Button**: Save current wave configuration
- **Load Button**: Load the most recently saved configuration

## Features Explained

### Waveform Visualization
- **Gray lines**: Individual wave components
- **Green/Gray thick line**: Composite waveform (green when playing, gray when stopped)
- **Real-time animation**: Waves animate to show their movement over time
- **Proper scaling**: Multiple waves are normalized to prevent clipping

### Wave Shapes
- **Sine**: Pure sine wave
- **Square**: Digital square wave (perfect on/off)
- **Triangle**: Linear ramp up and down
- **Sawtooth**: Linear ramp with sharp reset
- **Noise**: Random white noise

### Wave Types
- **Sine**: Single frequency wave
- **Sweep**: Multiple frequencies evenly spaced between start and end frequencies

### Audio Engine
- Uses numpy for mathematical wave generation
- pygame.mixer for real-time audio playback
- Automatic normalization to prevent audio clipping
- Real-time parameter updates while playing

## Code Structure

- `WaveDefinition`: Data class representing a single wave
- `WaveGenerator`: Handles mathematical wave generation
- `AudioEngine`: Manages real-time audio playback
- `UIElement` classes: Button, Slider, Label, Dropdown for interactive interface
- `WaveformRenderer`: Real-time visual waveform rendering
- `WaveEditor`: Main application class tying everything together

## Performance

- 60 FPS rendering with smooth animation
- Real-time audio synthesis and playback
- Efficient waveform calculation using numpy
- Responsive UI with proper event handling

## Future Enhancements

Potential additions could include:
- Custom wave shape drawing
- More sophisticated sweep patterns (logarithmic, exponential)
- MIDI input support
- Audio file export
- More advanced visualization options
- Preset management with file I/O

## Dependencies

- **pygame**: Graphics, window management, and audio playback
- **numpy**: Mathematical operations and array processing
- **Python 3.7+**: Core language support