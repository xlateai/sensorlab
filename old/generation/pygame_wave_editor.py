"""
Pygame Wave Editor - A simple interactive audio wave generator
Recreates the functionality from the React Native WaveEditor component
"""

import pygame
import numpy as np
import math
import json
import uuid
from enum import Enum
from dataclasses import dataclass, asdict
from typing import List, Optional, Tuple, Dict, Any
import threading
import time

# Initialize pygame
pygame.init()
pygame.mixer.pre_init(frequency=44100, size=-16, channels=2, buffer=512)
pygame.mixer.init()

# Constants
WINDOW_WIDTH = 1200
WINDOW_HEIGHT = 800
WAVEFORM_WIDTH = 800
WAVEFORM_HEIGHT = 300
FPS = 60

# Colors (matching the dark theme from the React Native app)
class Colors:
    BLACK = (10, 10, 10)
    DARK_GRAY = (26, 26, 26)
    GRAY = (136, 136, 136)
    LIGHT_GRAY = (255, 255, 255)
    GREEN = (0, 255, 0)
    RED = (255, 0, 0)
    ORANGE = (255, 136, 0)
    BLUE = (68, 68, 68)
    TRANSPARENT_GREEN = (0, 255, 0, 25)
    TRANSPARENT_RED = (255, 0, 0, 25)
    TRANSPARENT_ORANGE = (255, 136, 0, 25)

class WaveType(Enum):
    SINE = "sine"
    SWEEP = "sweep"

class WaveShape(Enum):
    SINE = "sine"
    SQUARE = "square"
    TRIANGLE = "triangle"
    SAWTOOTH = "sawtooth"
    NOISE = "noise"

@dataclass
class WaveDefinition:
    """Represents a single wave with its parameters"""
    id: str
    type: WaveType
    shape: WaveShape
    frequency: float = 100.0  # For sine waves
    start_freq: float = 100.0  # For sweep waves
    end_freq: float = 1000.0  # For sweep waves
    sweep_k: int = 10  # For sweep waves (number of frequencies)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for saving"""
        return {
            'id': self.id,
            'type': self.type.value,
            'shape': self.shape.value,
            'frequency': self.frequency,
            'start_freq': self.start_freq,
            'end_freq': self.end_freq,
            'sweep_k': self.sweep_k
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'WaveDefinition':
        """Create from dictionary when loading"""
        return cls(
            id=data['id'],
            type=WaveType(data['type']),
            shape=WaveShape(data['shape']),
            frequency=data.get('frequency', 100.0),
            start_freq=data.get('start_freq', 100.0),
            end_freq=data.get('end_freq', 1000.0),
            sweep_k=data.get('sweep_k', 10)
        )

@dataclass
class SavedWave:
    """Represents a saved wave configuration"""
    id: str
    name: str
    waves: List[WaveDefinition]
    created_at: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'waves': [wave.to_dict() for wave in self.waves],
            'created_at': self.created_at
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'SavedWave':
        return cls(
            id=data['id'],
            name=data['name'],
            waves=[WaveDefinition.from_dict(w) for w in data['waves']],
            created_at=data['created_at']
        )

def generate_uuid() -> str:
    """Generate a simple UUID for identification"""
    return str(uuid.uuid4())[:8]

def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp a value between min and max"""
    return max(min_val, min(max_val, value))

class WaveGenerator:
    """Handles audio wave generation and synthesis"""
    
    def __init__(self, sample_rate: int = 44100):
        self.sample_rate = sample_rate
        self.time = 0.0
        
    def generate_wave_shape(self, shape: WaveShape, frequency: float, duration: float, 
                           phase: float = 0.0) -> np.ndarray:
        """Generate a wave with the specified shape"""
        samples = int(self.sample_rate * duration)
        t = np.linspace(0, duration, samples, False)
        
        # Calculate the wave based on shape
        if shape == WaveShape.SINE:
            wave = np.sin(2 * np.pi * frequency * t + phase)
        elif shape == WaveShape.SQUARE:
            sine_wave = np.sin(2 * np.pi * frequency * t + phase)
            wave = np.sign(sine_wave)
        elif shape == WaveShape.TRIANGLE:
            # Triangle wave using arcsin of sine
            sine_wave = np.sin(2 * np.pi * frequency * t + phase)
            wave = (2 / np.pi) * np.arcsin(sine_wave)
        elif shape == WaveShape.SAWTOOTH:
            # Sawtooth wave
            wave = 2 * (t * frequency - np.floor(t * frequency + 0.5))
        elif shape == WaveShape.NOISE:
            # White noise
            wave = np.random.uniform(-1, 1, samples)
        else:
            # Default to sine
            wave = np.sin(2 * np.pi * frequency * t + phase)
            
        return wave
    
    def generate_frequencies_from_wave(self, wave_def: WaveDefinition) -> List[float]:
        """Get all frequencies from a wave definition"""
        if wave_def.type == WaveType.SINE:
            return [wave_def.frequency]
        else:  # SWEEP
            if wave_def.sweep_k < 2:
                return [wave_def.start_freq]
            
            frequencies = []
            step = (wave_def.end_freq - wave_def.start_freq) / (wave_def.sweep_k - 1)
            for i in range(wave_def.sweep_k):
                frequencies.append(wave_def.start_freq + (step * i))
            return frequencies
    
    def generate_composite_wave(self, waves: List[WaveDefinition], duration: float, 
                               volume: float = 1.0, multiplicity: float = 1.0, 
                               is_negated: bool = False, phase: float = 0.0) -> np.ndarray:
        """Generate a composite wave from multiple wave definitions"""
        if not waves:
            return np.zeros(int(self.sample_rate * duration))
        
        # Collect all individual waves
        all_waves = []
        wave_count = 0
        
        for wave_def in waves:
            frequencies = self.generate_frequencies_from_wave(wave_def)
            for freq in frequencies:
                adjusted_freq = freq * multiplicity
                wave = self.generate_wave_shape(wave_def.shape, adjusted_freq, duration, phase)
                all_waves.append(wave)
                wave_count += 1
        
        if not all_waves:
            return np.zeros(int(self.sample_rate * duration))
        
        # Sum all waves
        composite = np.sum(all_waves, axis=0)
        
        # Normalize to prevent clipping
        if wave_count > 0:
            normalization_factor = max(1, wave_count * 0.7)  # Gentler normalization
            composite = composite / normalization_factor
        
        # Apply volume and negation
        composite *= volume
        if is_negated:
            composite *= -1
        
        # Ensure values are in valid range
        composite = np.clip(composite, -1.0, 1.0)
        
        return composite

class AudioEngine:
    """Handles real-time audio playback using pygame.mixer"""
    
    def __init__(self):
        self.generator = WaveGenerator()
        self.is_playing = False
        self.audio_thread = None
        self.should_stop = False
        self.current_sound = None
        
    def start_playback(self, waves: List[WaveDefinition], volume: float = 1.0, 
                      multiplicity: float = 1.0, is_negated: bool = False):
        """Start playing the waves"""
        if self.is_playing:
            self.stop_playback()
        
        # Generate a looping audio buffer
        duration = 1.0  # 1 second buffer that will loop
        wave_data = self.generator.generate_composite_wave(
            waves, duration, volume, multiplicity, is_negated
        )
        
        # Convert to pygame sound format
        # pygame expects 16-bit integers
        wave_data_int = (wave_data * 32767).astype(np.int16)
        
        # Create stereo sound (duplicate mono to both channels)
        stereo_data = np.column_stack((wave_data_int, wave_data_int))
        
        try:
            # Create and play the sound
            self.current_sound = pygame.sndarray.make_sound(stereo_data)
            self.current_sound.play(loops=-1)  # Loop indefinitely
            self.is_playing = True
        except Exception as e:
            print(f"Error starting audio playback: {e}")
    
    def stop_playback(self):
        """Stop audio playback"""
        if self.current_sound:
            self.current_sound.stop()
            self.current_sound = None
        self.is_playing = False
    
    def update_playback(self, waves: List[WaveDefinition], volume: float = 1.0, 
                       multiplicity: float = 1.0, is_negated: bool = False):
        """Update the current playback parameters"""
        if self.is_playing:
            self.start_playback(waves, volume, multiplicity, is_negated)

class UIElement:
    """Base class for UI elements"""
    def __init__(self, x: int, y: int, width: int, height: int):
        self.rect = pygame.Rect(x, y, width, height)
        self.visible = True
        self.enabled = True
    
    def handle_event(self, event) -> bool:
        """Handle pygame event. Return True if event was consumed."""
        return False
    
    def update(self, dt: float):
        """Update the element (called every frame)"""
        pass
    
    def draw(self, surface: pygame.Surface):
        """Draw the element"""
        pass

class Button(UIElement):
    """A clickable button"""
    def __init__(self, x: int, y: int, width: int, height: int, text: str, 
                 callback=None, color=Colors.GRAY, text_color=Colors.LIGHT_GRAY):
        super().__init__(x, y, width, height)
        self.text = text
        self.callback = callback
        self.color = color
        self.text_color = text_color
        self.hover_color = tuple(min(255, c + 30) for c in color[:3])
        self.pressed_color = tuple(max(0, c - 30) for c in color[:3])
        self.font = pygame.font.Font(None, 24)
        self.is_hovered = False
        self.is_pressed = False
    
    def handle_event(self, event) -> bool:
        if not self.visible or not self.enabled:
            return False
        
        if event.type == pygame.MOUSEMOTION:
            self.is_hovered = self.rect.collidepoint(event.pos)
        elif event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1 and self.rect.collidepoint(event.pos):
                self.is_pressed = True
                return True
        elif event.type == pygame.MOUSEBUTTONUP:
            if event.button == 1 and self.is_pressed:
                self.is_pressed = False
                if self.rect.collidepoint(event.pos) and self.callback:
                    self.callback()
                return True
        
        return False
    
    def draw(self, surface: pygame.Surface):
        if not self.visible:
            return
        
        # Choose color based on state
        current_color = self.color
        if self.is_pressed:
            current_color = self.pressed_color
        elif self.is_hovered:
            current_color = self.hover_color
        
        # Draw button background
        pygame.draw.rect(surface, current_color, self.rect)
        pygame.draw.rect(surface, Colors.GRAY, self.rect, 2)
        
        # Draw text
        text_surface = self.font.render(self.text, True, self.text_color)
        text_rect = text_surface.get_rect(center=self.rect.center)
        surface.blit(text_surface, text_rect)

class Slider(UIElement):
    """A horizontal slider for value input"""
    def __init__(self, x: int, y: int, width: int, height: int, 
                 min_val: float, max_val: float, initial_val: float, 
                 callback=None, color=Colors.GREEN):
        super().__init__(x, y, width, height)
        self.min_val = min_val
        self.max_val = max_val
        self.value = initial_val
        self.callback = callback
        self.color = color
        self.is_dragging = False
        self.slider_rect = pygame.Rect(x, y + height // 4, width, height // 2)
        self.handle_size = 20
    
    def get_handle_pos(self) -> int:
        """Get the x position of the handle"""
        ratio = (self.value - self.min_val) / (self.max_val - self.min_val)
        return int(self.rect.x + ratio * self.rect.width)
    
    def set_value_from_pos(self, x: int):
        """Set value based on mouse x position"""
        ratio = clamp((x - self.rect.x) / self.rect.width, 0.0, 1.0)
        new_value = self.min_val + ratio * (self.max_val - self.min_val)
        if new_value != self.value:
            self.value = new_value
            if self.callback:
                self.callback(self.value)
    
    def handle_event(self, event) -> bool:
        if not self.visible or not self.enabled:
            return False
        
        if event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1:
                handle_x = self.get_handle_pos()
                handle_rect = pygame.Rect(handle_x - self.handle_size // 2, 
                                        self.rect.y, self.handle_size, self.rect.height)
                if handle_rect.collidepoint(event.pos) or self.rect.collidepoint(event.pos):
                    self.is_dragging = True
                    self.set_value_from_pos(event.pos[0])
                    return True
        elif event.type == pygame.MOUSEBUTTONUP:
            if event.button == 1 and self.is_dragging:
                self.is_dragging = False
                return True
        elif event.type == pygame.MOUSEMOTION:
            if self.is_dragging:
                self.set_value_from_pos(event.pos[0])
                return True
        
        return False
    
    def draw(self, surface: pygame.Surface):
        if not self.visible:
            return
        
        # Draw slider track
        pygame.draw.rect(surface, Colors.DARK_GRAY, self.slider_rect)
        pygame.draw.rect(surface, Colors.GRAY, self.slider_rect, 2)
        
        # Draw progress
        handle_x = self.get_handle_pos()
        progress_rect = pygame.Rect(self.rect.x, self.slider_rect.y, 
                                   handle_x - self.rect.x, self.slider_rect.height)
        pygame.draw.rect(surface, self.color, progress_rect)
        
        # Draw handle
        handle_rect = pygame.Rect(handle_x - self.handle_size // 2, self.rect.y, 
                                 self.handle_size, self.rect.height)
        pygame.draw.rect(surface, self.color, handle_rect)
        pygame.draw.rect(surface, Colors.LIGHT_GRAY, handle_rect, 2)

class Label(UIElement):
    """A text label"""
    def __init__(self, x: int, y: int, text: str, color=Colors.LIGHT_GRAY, font_size=24):
        self.font = pygame.font.Font(None, font_size)
        text_surface = self.font.render(text, True, color)
        super().__init__(x, y, text_surface.get_width(), text_surface.get_height())
        self.text = text
        self.color = color
        self.font_size = font_size
    
    def set_text(self, text: str):
        """Update the text content"""
        self.text = text
        text_surface = self.font.render(text, True, self.color)
        self.rect.width = text_surface.get_width()
        self.rect.height = text_surface.get_height()
    
    def draw(self, surface: pygame.Surface):
        if not self.visible:
            return
        
        text_surface = self.font.render(self.text, True, self.color)
        surface.blit(text_surface, (self.rect.x, self.rect.y))

class Dropdown(UIElement):
    """A dropdown menu for selecting options"""
    def __init__(self, x: int, y: int, width: int, height: int, 
                 options: List[Tuple[str, Any]], selected_index: int = 0, callback=None):
        super().__init__(x, y, width, height)
        self.options = options  # List of (display_name, value) tuples
        self.selected_index = selected_index
        self.callback = callback
        self.is_open = False
        self.font = pygame.font.Font(None, 20)
        self.dropdown_height = min(len(options) * 30, 200)  # Max height
    
    def handle_event(self, event) -> bool:
        if not self.visible or not self.enabled:
            return False
        
        if event.type == pygame.MOUSEBUTTONDOWN:
            if event.button == 1:
                if self.rect.collidepoint(event.pos):
                    self.is_open = not self.is_open
                    return True
                elif self.is_open:
                    # Check if clicking on dropdown options
                    dropdown_rect = pygame.Rect(self.rect.x, self.rect.bottom, 
                                              self.rect.width, self.dropdown_height)
                    if dropdown_rect.collidepoint(event.pos):
                        # Calculate which option was clicked
                        relative_y = event.pos[1] - dropdown_rect.y
                        option_index = relative_y // 30
                        if 0 <= option_index < len(self.options):
                            self.selected_index = option_index
                            if self.callback:
                                self.callback(self.options[option_index][1])
                        self.is_open = False
                        return True
                    else:
                        # Clicked outside, close dropdown
                        self.is_open = False
        
        return False
    
    def draw(self, surface: pygame.Surface):
        if not self.visible:
            return
        
        # Draw main button
        pygame.draw.rect(surface, Colors.DARK_GRAY, self.rect)
        pygame.draw.rect(surface, Colors.GRAY, self.rect, 2)
        
        # Draw selected option text
        if self.options and 0 <= self.selected_index < len(self.options):
            text = self.options[self.selected_index][0]
            text_surface = self.font.render(text, True, Colors.LIGHT_GRAY)
            text_rect = text_surface.get_rect(center=self.rect.center)
            surface.blit(text_surface, text_rect)
        
        # Draw dropdown arrow
        arrow_points = [
            (self.rect.right - 15, self.rect.centery - 5),
            (self.rect.right - 5, self.rect.centery - 5),
            (self.rect.right - 10, self.rect.centery + 5)
        ]
        pygame.draw.polygon(surface, Colors.GRAY, arrow_points)
        
        # Draw dropdown menu if open
        if self.is_open and self.options:
            dropdown_rect = pygame.Rect(self.rect.x, self.rect.bottom, 
                                      self.rect.width, self.dropdown_height)
            pygame.draw.rect(surface, Colors.DARK_GRAY, dropdown_rect)
            pygame.draw.rect(surface, Colors.GRAY, dropdown_rect, 2)
            
            # Draw options
            for i, (name, _) in enumerate(self.options):
                option_y = dropdown_rect.y + i * 30
                option_rect = pygame.Rect(dropdown_rect.x, option_y, dropdown_rect.width, 30)
                
                # Highlight selected option
                if i == self.selected_index:
                    pygame.draw.rect(surface, Colors.BLUE, option_rect)
                
                # Draw option text
                text_surface = self.font.render(name, True, Colors.LIGHT_GRAY)
                text_rect = text_surface.get_rect(center=option_rect.center)
                surface.blit(text_surface, text_rect)

class WaveformRenderer:
    """Renders waveform visualizations"""
    
    def __init__(self, width: int, height: int):
        self.width = width
        self.height = height
        self.surface = pygame.Surface((width, height))
        self.generator = WaveGenerator()
        self.animation_time = 0.0
        
    def update(self, dt: float):
        """Update animation"""
        self.animation_time += dt * 3.0  # Speed up animation
        if self.animation_time > 2 * math.pi:
            self.animation_time -= 2 * math.pi
    
    def draw_individual_wave(self, wave_def: WaveDefinition, multiplicity: float, 
                           is_negated: bool, color: Tuple[int, int, int], alpha: int = 100):
        """Draw a single wave"""
        frequencies = self.generator.generate_frequencies_from_wave(wave_def)
        
        for freq in frequencies:
            points = []
            adjusted_freq = freq * multiplicity
            
            for x in range(self.width):
                # Calculate wave value at this x position
                t = (x / self.width) * 4 * math.pi  # Show 2 cycles
                normalized_freq = adjusted_freq / 1000.0
                wave_t = t * normalized_freq + self.animation_time
                
                # Generate wave shape
                if wave_def.shape == WaveShape.SINE:
                    wave_value = math.sin(wave_t)
                elif wave_def.shape == WaveShape.SQUARE:
                    wave_value = 1.0 if math.sin(wave_t) >= 0 else -1.0
                elif wave_def.shape == WaveShape.TRIANGLE:
                    wave_value = (2 / math.pi) * math.asin(math.sin(wave_t))
                elif wave_def.shape == WaveShape.SAWTOOTH:
                    wave_value = 2 * (wave_t / (2 * math.pi) - math.floor(wave_t / (2 * math.pi) + 0.5))
                elif wave_def.shape == WaveShape.NOISE:
                    wave_value = (hash((x + int(self.animation_time * 100)) % 1000) / 2147483647.0) % 2.0 - 1.0
                else:
                    wave_value = math.sin(wave_t)
                
                if is_negated:
                    wave_value = -wave_value
                
                y = int(self.height / 2 + wave_value * (self.height / 4))
                y = clamp(y, 0, self.height - 1)
                points.append((x, y))
            
            # Draw the wave line
            if len(points) > 1:
                # Create a surface with per-pixel alpha for transparency
                temp_surface = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
                for i in range(len(points) - 1):
                    pygame.draw.line(temp_surface, (*color, alpha), points[i], points[i + 1], 2)
                self.surface.blit(temp_surface, (0, 0))
    
    def draw_composite_wave(self, waves: List[WaveDefinition], multiplicity: float, 
                          is_negated: bool, is_playing: bool):
        """Draw the composite waveform"""
        if not waves:
            return
        
        points = []
        
        for x in range(self.width):
            # Sum all waves at this x position
            combined_value = 0.0
            wave_count = 0
            
            for wave_def in waves:
                frequencies = self.generator.generate_frequencies_from_wave(wave_def)
                for freq in frequencies:
                    adjusted_freq = freq * multiplicity
                    t = (x / self.width) * 4 * math.pi
                    normalized_freq = adjusted_freq / 1000.0
                    wave_t = t * normalized_freq + self.animation_time
                    
                    # Generate wave shape (same logic as individual)
                    if wave_def.shape == WaveShape.SINE:
                        wave_value = math.sin(wave_t)
                    elif wave_def.shape == WaveShape.SQUARE:
                        wave_value = 1.0 if math.sin(wave_t) >= 0 else -1.0
                    elif wave_def.shape == WaveShape.TRIANGLE:
                        wave_value = (2 / math.pi) * math.asin(math.sin(wave_t))
                    elif wave_def.shape == WaveShape.SAWTOOTH:
                        wave_value = 2 * (wave_t / (2 * math.pi) - math.floor(wave_t / (2 * math.pi) + 0.5))
                    elif wave_def.shape == WaveShape.NOISE:
                        wave_value = (hash((x + int(self.animation_time * 100)) % 1000) / 2147483647.0) % 2.0 - 1.0
                    else:
                        wave_value = math.sin(wave_t)
                    
                    if is_negated:
                        wave_value = -wave_value
                    
                    combined_value += wave_value
                    wave_count += 1
            
            # Normalize
            if wave_count > 0:
                normalization_factor = max(1, wave_count * 0.7)
                combined_value = combined_value / normalization_factor
            
            y = int(self.height / 2 + combined_value * (self.height / 3))
            y = clamp(y, 0, self.height - 1)
            points.append((x, y))
        
        # Draw the composite wave
        if len(points) > 1:
            color = Colors.GREEN if is_playing else Colors.GRAY
            for i in range(len(points) - 1):
                pygame.draw.line(self.surface, color, points[i], points[i + 1], 3)
    
    def render_waveforms(self, waves: List[WaveDefinition], multiplicity: float, 
                        is_negated: bool, is_playing: bool) -> pygame.Surface:
        """Render all waveforms and return the surface"""
        # Clear the surface
        self.surface.fill(Colors.DARK_GRAY)
        
        # Draw border
        pygame.draw.rect(self.surface, Colors.GRAY, 
                        pygame.Rect(0, 0, self.width, self.height), 2)
        
        # Draw center line
        center_y = self.height // 2
        pygame.draw.line(self.surface, Colors.GRAY, (0, center_y), (self.width, center_y), 1)
        
        # Draw individual waves (in gray with transparency)
        for wave_def in waves:
            self.draw_individual_wave(wave_def, multiplicity, is_negated, Colors.GRAY, 60)
        
        # Draw composite wave
        self.draw_composite_wave(waves, multiplicity, is_negated, is_playing)
        
        return self.surface

class WaveEditor:
    """Main wave editor application"""
    
    def __init__(self):
        self.screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
        pygame.display.set_caption("Pygame Wave Editor")
        self.clock = pygame.time.Clock()
        self.running = True
        
        # Audio engine
        self.audio_engine = AudioEngine()
        
        # Wave state
        self.waves = [WaveDefinition(
            id=generate_uuid(),
            type=WaveType.SINE,
            shape=WaveShape.SINE,
            frequency=440.0
        )]
        self.volume = 0.3
        self.multiplicity = 1.0
        self.is_negated = False
        self.is_playing = False
        
        # Saved waves
        self.saved_waves: List[SavedWave] = []
        self.wave_name = ""
        
        # Waveform renderer
        self.waveform_renderer = WaveformRenderer(WAVEFORM_WIDTH, WAVEFORM_HEIGHT)
        
        # UI Elements
        self.setup_ui()
        
        print("Wave Editor initialized successfully!")
    
    def setup_ui(self):
        """Initialize all UI elements"""
        self.ui_elements = []
        
        # Play/Stop button
        self.play_button = Button(50, 350, 80, 40, "Play", self.toggle_playback, Colors.GREEN)
        self.ui_elements.append(self.play_button)
        
        # Negate button
        self.negate_button = Button(140, 350, 80, 40, "Negate", self.toggle_negate, Colors.RED)
        self.ui_elements.append(self.negate_button)
        
        # Volume slider
        self.volume_label = Label(50, 420, "Volume: 30%", Colors.GREEN)
        self.volume_slider = Slider(50, 450, 200, 20, 0.0, 1.0, self.volume, self.on_volume_change, Colors.GREEN)
        self.ui_elements.extend([self.volume_label, self.volume_slider])
        
        # Multiplicity slider
        self.multiplicity_label = Label(50, 500, "Multiplicity: 100%", Colors.ORANGE)
        self.multiplicity_slider = Slider(50, 530, 200, 20, 0.0, 1.0, self.multiplicity, self.on_multiplicity_change, Colors.ORANGE)
        self.ui_elements.extend([self.multiplicity_label, self.multiplicity_slider])
        
        # Wave controls (will be populated dynamically)
        self.wave_controls_y = 580
        self.setup_wave_controls()
        
        # Add wave button
        self.add_wave_button = Button(50, 720, 100, 30, "Add Wave", self.add_wave, Colors.GREEN)
        self.ui_elements.append(self.add_wave_button)
        
        # Save/Load controls
        self.save_button = Button(160, 720, 80, 30, "Save", self.save_wave, Colors.ORANGE)
        self.load_button = Button(250, 720, 80, 30, "Load", self.show_load_menu, Colors.ORANGE)
        self.ui_elements.extend([self.save_button, self.load_button])
    
    def setup_wave_controls(self):
        """Set up controls for each wave"""
        # Remove existing wave controls
        self.ui_elements = [elem for elem in self.ui_elements 
                           if not hasattr(elem, 'is_wave_control')]
        
        y_offset = self.wave_controls_y
        
        for i, wave in enumerate(self.waves):
            # Wave label
            wave_label = Label(50, y_offset, f"Wave {i+1}:", Colors.LIGHT_GRAY, 20)
            wave_label.is_wave_control = True
            self.ui_elements.append(wave_label)
            
            # Wave type button (Sine/Sweep)
            type_text = "Sine" if wave.type == WaveType.SINE else "Sweep"
            type_button = Button(120, y_offset, 60, 25, type_text, 
                               lambda idx=i: self.toggle_wave_type(idx), Colors.BLUE)
            type_button.is_wave_control = True
            self.ui_elements.append(type_button)
            
            # Shape dropdown
            shape_options = [(shape.value.title(), shape) for shape in WaveShape]
            shape_dropdown = Dropdown(190, y_offset, 80, 25, shape_options, 
                                    list(WaveShape).index(wave.shape),
                                    lambda shape, idx=i: self.change_wave_shape(idx, shape))
            shape_dropdown.is_wave_control = True
            self.ui_elements.append(shape_dropdown)
            
            # Frequency/sweep controls
            if wave.type == WaveType.SINE:
                freq_slider = Slider(280, y_offset + 5, 150, 15, 10.0, 2000.0, wave.frequency,
                                   lambda val, idx=i: self.change_wave_frequency(idx, val), Colors.GREEN)
                freq_slider.is_wave_control = True
                self.ui_elements.append(freq_slider)
                
                freq_label = Label(440, y_offset, f"{int(wave.frequency)}Hz", Colors.GRAY, 16)
                freq_label.is_wave_control = True
                self.ui_elements.append(freq_label)
            else:
                # Sweep controls (simplified)
                start_slider = Slider(280, y_offset, 70, 15, 10.0, 2000.0, wave.start_freq,
                                    lambda val, idx=i: self.change_wave_start_freq(idx, val), Colors.ORANGE)
                start_slider.is_wave_control = True
                self.ui_elements.append(start_slider)
                
                end_slider = Slider(360, y_offset, 70, 15, 10.0, 2000.0, wave.end_freq,
                                  lambda val, idx=i: self.change_wave_end_freq(idx, val), Colors.ORANGE)
                end_slider.is_wave_control = True
                self.ui_elements.append(end_slider)
            
            # Remove wave button (if more than one wave)
            if len(self.waves) > 1:
                remove_button = Button(500, y_offset, 30, 25, "X", 
                                     lambda idx=i: self.remove_wave(idx), Colors.RED)
                remove_button.is_wave_control = True
                self.ui_elements.append(remove_button)
            
            y_offset += 35
    
    def toggle_playback(self):
        """Toggle audio playback"""
        if self.is_playing:
            self.audio_engine.stop_playback()
            self.is_playing = False
            self.play_button.text = "Play"
            self.play_button.color = Colors.GREEN
        else:
            self.audio_engine.start_playback(self.waves, self.volume, self.multiplicity, self.is_negated)
            self.is_playing = True
            self.play_button.text = "Stop"
            self.play_button.color = Colors.RED
    
    def toggle_negate(self):
        """Toggle wave negation"""
        self.is_negated = not self.is_negated
        self.negate_button.color = Colors.RED if self.is_negated else Colors.GRAY
        if self.is_playing:
            self.audio_engine.update_playback(self.waves, self.volume, self.multiplicity, self.is_negated)
    
    def on_volume_change(self, value: float):
        """Handle volume slider change"""
        self.volume = value
        self.volume_label.set_text(f"Volume: {int(value * 100)}%")
        if self.is_playing:
            self.audio_engine.update_playback(self.waves, self.volume, self.multiplicity, self.is_negated)
    
    def on_multiplicity_change(self, value: float):
        """Handle multiplicity slider change"""
        self.multiplicity = value
        self.multiplicity_label.set_text(f"Multiplicity: {int(value * 100)}%")
        if self.is_playing:
            self.audio_engine.update_playback(self.waves, self.volume, self.multiplicity, self.is_negated)
    
    def add_wave(self):
        """Add a new wave"""
        if len(self.waves) < 8:
            new_wave = WaveDefinition(
                id=generate_uuid(),
                type=WaveType.SINE,
                shape=WaveShape.SINE,
                frequency=self.waves[0].frequency * 2  # Octave above first wave
            )
            self.waves.append(new_wave)
            self.setup_wave_controls()
    
    def remove_wave(self, index: int):
        """Remove a wave"""
        if len(self.waves) > 1 and 0 <= index < len(self.waves):
            self.waves.pop(index)
            self.setup_wave_controls()
    
    def toggle_wave_type(self, index: int):
        """Toggle wave type between sine and sweep"""
        if 0 <= index < len(self.waves):
            wave = self.waves[index]
            wave.type = WaveType.SWEEP if wave.type == WaveType.SINE else WaveType.SINE
            self.setup_wave_controls()
    
    def change_wave_shape(self, index: int, shape: WaveShape):
        """Change wave shape"""
        if 0 <= index < len(self.waves):
            self.waves[index].shape = shape
    
    def change_wave_frequency(self, index: int, frequency: float):
        """Change wave frequency"""
        if 0 <= index < len(self.waves):
            self.waves[index].frequency = frequency
            self.setup_wave_controls()  # Update frequency label
    
    def change_wave_start_freq(self, index: int, freq: float):
        """Change sweep start frequency"""
        if 0 <= index < len(self.waves):
            self.waves[index].start_freq = freq
    
    def change_wave_end_freq(self, index: int, freq: float):
        """Change sweep end frequency"""
        if 0 <= index < len(self.waves):
            self.waves[index].end_freq = freq
    
    def save_wave(self):
        """Save current wave configuration"""
        name = self.wave_name if self.wave_name.strip() else generate_uuid()[:4]
        saved_wave = SavedWave(
            id=generate_uuid(),
            name=name,
            waves=self.waves.copy(),
            created_at=time.strftime("%Y-%m-%d %H:%M:%S")
        )
        self.saved_waves.append(saved_wave)
        print(f"Saved wave configuration: {name}")
    
    def show_load_menu(self):
        """Show load menu (simplified for this implementation)"""
        if self.saved_waves:
            # For now, just load the last saved wave
            self.waves = self.saved_waves[-1].waves.copy()
            self.setup_wave_controls()
            print(f"Loaded wave configuration: {self.saved_waves[-1].name}")
    
    def handle_event(self, event):
        """Handle pygame events"""
        if event.type == pygame.QUIT:
            self.running = False
            return
        
        # Handle UI events
        for element in reversed(self.ui_elements):  # Reverse order for proper layering
            if element.handle_event(event):
                break  # Stop processing if event was consumed
    
    def update(self, dt: float):
        """Update the application"""
        # Update UI elements
        for element in self.ui_elements:
            element.update(dt)
        
        # Update waveform renderer
        self.waveform_renderer.update(dt)
    
    def draw(self):
        """Draw the application"""
        self.screen.fill(Colors.BLACK)
        
        # Draw waveform
        waveform_surface = self.waveform_renderer.render_waveforms(
            self.waves, self.multiplicity, self.is_negated, self.is_playing
        )
        self.screen.blit(waveform_surface, (50, 20))
        
        # Draw info overlay
        info_text = f"Waves: {len(self.waves)} | Volume: {int(self.volume*100)}% | Mult: {int(self.multiplicity*100)}%"
        if self.is_negated:
            info_text += " | Negated"
        info_label = Label(60, 30, info_text, Colors.GREEN, 16)
        info_label.draw(self.screen)
        
        # Draw UI elements
        for element in self.ui_elements:
            element.draw(self.screen)
        
        pygame.display.flip()
    
    def run(self):
        """Main application loop"""
        while self.running:
            dt = self.clock.tick(FPS) / 1000.0  # Delta time in seconds
            
            # Handle events
            for event in pygame.event.get():
                self.handle_event(event)
            
            # Update
            self.update(dt)
            
            # Draw
            self.draw()
        
        # Cleanup
        self.audio_engine.stop_playback()
        pygame.quit()

def main():
    """Main entry point"""
    try:
        editor = WaveEditor()
        editor.run()
    except Exception as e:
        print(f"Error running wave editor: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()