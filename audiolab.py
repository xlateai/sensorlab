import pygame
import numpy as np
import math
import time

# Initialize pygame
pygame.mixer.pre_init(frequency=44100, size=-16, channels=2, buffer=512)
pygame.init()

# Constants
SCREEN_WIDTH = 1200
SCREEN_HEIGHT = 600
SCREEN_CENTER = (SCREEN_WIDTH // 2, SCREEN_HEIGHT // 2)
CIRCLE_RADIUS = 200
SAMPLE_RATE = 44100
BUFFER_SIZE = 4096

# Colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
NEON_PINK = (255, 20, 147)
NEON_CYAN = (0, 255, 255)
NEON_PURPLE = (186, 85, 211)
ELECTRIC_BLUE = (30, 144, 255)
DARK_PURPLE = (25, 25, 50)

class AudioVisualizer:
    def __init__(self):
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("AudioLab - Circular Waveform Visualizer")
        self.clock = pygame.time.Clock()
        
        # Audio parameters
        self.time_offset = 0
        self.frequency_base = 130  # Cleaner frequency range
        self.frequency_mod = 0.25   # Slower, smoother modulation
        self.amplitude = 0.5  # Increased for clarity
        self.phase_continuity = 0  # Track phase for smooth transitions
        
        # Synth-wave parameters
        self.lfo_rate = 0.15  # Slower LFO for subtler movement
        self.filter_cutoff = 0.5
        
        # Audio smoothing
        self.previous_chunk = None
        self.fade_samples = 256  # Shorter fades for less artifacts
        
        # Visualization parameters
        self.waveform_points = []
        self.num_points = 720  # Higher resolution - 2 points per degree for smoother curve
        
        # Generate initial audio buffer
        self.current_audio_data = self.generate_audio_chunk()
        self.play_audio()
    
    def generate_audio_chunk(self):
        """Generate a chunk of smooth synth-wave audio data"""
        t = np.linspace(0, BUFFER_SIZE / SAMPLE_RATE, BUFFER_SIZE)
        t_global = t + self.time_offset
        
        # Synth-wave style oscillators with smooth frequency modulation
        base_freq = self.frequency_base + 12 * np.sin(self.time_offset * self.frequency_mod)
        
        # Main synth lead - clean sine wave
        osc1 = np.sin(2 * np.pi * base_freq * t_global + self.phase_continuity)
        
        # Slightly detuned oscillator for chorus effect (much subtler)
        osc2 = 0.3 * np.sin(2 * np.pi * base_freq * 1.005 * t_global + self.phase_continuity * 1.1)
        
        # Sub oscillator (one octave down) for depth
        sub_osc = 0.15 * np.sin(2 * np.pi * base_freq * 0.5 * t_global + self.phase_continuity * 0.5)
        
        # Clean sawtooth wave (less harsh than before)
        saw_freq = base_freq * t_global + self.phase_continuity / (2 * np.pi)
        saw_wave = 2 * (saw_freq % 1) - 1
        # Soften the sawtooth with a simple filter
        saw_wave = 0.2 * np.tanh(saw_wave * 2)  # Soft clipping instead of hard clip
        
        # Low-frequency oscillator for subtle filter movement
        lfo = np.sin(2 * np.pi * self.lfo_rate * t_global)
        filter_mod = 0.7 + 0.3 * lfo
        
        # Mix oscillators with much cleaner balance
        main_wave = osc1 + osc2 + sub_osc + (saw_wave * filter_mod)
        
        # Add just a touch of harmonic content (much less than before)
        harmonic = 0.08 * np.sin(2 * np.pi * base_freq * 2 * t_global + self.phase_continuity * 2)
        
        # Combine with proper gain staging to prevent clipping
        combined_wave = (main_wave + harmonic) * self.amplitude * 0.6  # Reduced gain
        
        # Soft limiting to prevent any harsh clipping
        combined_wave = np.tanh(combined_wave)
        
        # Apply smooth envelope to prevent clicks
        envelope = np.ones_like(combined_wave)
        fade_in_samples = min(self.fade_samples, len(combined_wave) // 8)
        fade_out_samples = min(self.fade_samples, len(combined_wave) // 8)
        
        # Gentler fades
        if fade_in_samples > 0:
            envelope[:fade_in_samples] = np.sin(np.linspace(0, np.pi/2, fade_in_samples))**2
        if fade_out_samples > 0:
            envelope[-fade_out_samples:] = np.cos(np.linspace(0, np.pi/2, fade_out_samples))**2
        
        combined_wave *= envelope
        
        # Convert to stereo and ensure C-contiguous array
        stereo_wave = np.column_stack((combined_wave, combined_wave))
        
        # Convert to 16-bit integers with proper scaling
        audio_data = (stereo_wave * 16383).astype(np.int16)  # Leave headroom
        audio_data = np.ascontiguousarray(audio_data)
        
        # Debug: Print audio data information
        print(f"Audio data shape: {audio_data.shape} (samples: {audio_data.shape[0]}, channels: {audio_data.shape[1]})")
        print(f"Audio data dtype: {audio_data.dtype}")
        print(f"Audio data range: [{np.min(audio_data)}, {np.max(audio_data)}] (16-bit max: ±32767)")
        print(f"Volume percentage: {(np.max(np.abs(audio_data)) / 32767) * 100:.1f}% of max volume")
        print(f"Combined wave range before scaling: [{np.min(combined_wave):.4f}, {np.max(combined_wave):.4f}]")
        print(f"Buffer duration: {BUFFER_SIZE / SAMPLE_RATE * 1000:.1f}ms")
        print(f"First 10 samples (left channel): {audio_data[:10, 0]}")
        print(f"Is C-contiguous: {audio_data.flags['C_CONTIGUOUS']}")
        print("---")
        
        # Update phase continuity for smooth transitions
        self.phase_continuity += 2 * np.pi * base_freq * (BUFFER_SIZE / SAMPLE_RATE)
        self.phase_continuity = self.phase_continuity % (2 * np.pi)
        
        self.time_offset += BUFFER_SIZE / SAMPLE_RATE
        
        return audio_data
    
    def play_audio(self):
        """Play the current audio chunk"""
        try:
            sound_array = pygame.sndarray.make_sound(self.current_audio_data)
            sound_array.play()
        except Exception as e:
            print(f"Audio playback error: {e}")
    
    def update_waveform_visualization(self):
        """Update the circular waveform visualization with high resolution"""
        self.waveform_points = []
        
        # Use more of the audio data for smoother visualization
        # Interpolate the audio data to match our high-resolution point count
        audio_samples = self.current_audio_data[:, 0]  # Left channel
        
        # Create smooth interpolation from audio data to our point count
        sample_indices = np.linspace(0, len(audio_samples) - 1, self.num_points)
        interpolated_audio = np.interp(sample_indices, np.arange(len(audio_samples)), audio_samples)
        
        for i in range(self.num_points):
            angle = (i / self.num_points) * 2 * math.pi
            
            # Normalize the audio value
            amplitude_value = interpolated_audio[i] / 32767.0
            
            # Calculate radius based on base circle radius plus amplitude
            radius = CIRCLE_RADIUS + (amplitude_value * 100)  # Scaled for good visibility
            
            # Calculate point position
            x = SCREEN_CENTER[0] + radius * math.cos(angle)
            y = SCREEN_CENTER[1] + radius * math.sin(angle)
            
            self.waveform_points.append((x, y))
    
    def draw(self):
        """Draw clean waveform visualization"""
        # Plain black background
        self.screen.fill(BLACK)
        
        # Draw only the waveform - clean white line
        if len(self.waveform_points) > 2:
            # Draw the waveform as a smooth white polygon outline
            pygame.draw.polygon(self.screen, WHITE, self.waveform_points, 2)
        
        # Minimal UI - just controls at bottom
        small_font = pygame.font.Font(None, 20)
        info_text = small_font.render("SPACE: New pattern  |  ESC: Exit", True, (128, 128, 128))
        text_rect = info_text.get_rect()
        text_rect.centerx = SCREEN_WIDTH // 2
        text_rect.bottom = SCREEN_HEIGHT - 20
        self.screen.blit(info_text, text_rect)
        
        pygame.display.flip()
    
    def handle_events(self):
        """Handle pygame events"""
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    return False
                elif event.key == pygame.K_SPACE:
                    # Regenerate audio with synth-wave variations
                    self.frequency_base += np.random.uniform(-30, 30)
                    self.frequency_base = max(80, min(300, self.frequency_base))
                    self.frequency_mod = np.random.uniform(0.1, 0.8)
                    self.lfo_rate = np.random.uniform(0.1, 0.5)
        return True
    
    def run(self):
        """Main application loop"""
        running = True
        audio_timer = 0
        
        print("AudioLab started! Press SPACE to change audio, ESC to quit.")
        
        while running:
            dt = self.clock.tick(60) / 1000.0  # 60 FPS, dt in seconds
            audio_timer += dt
            
            running = self.handle_events()
            
            # Generate new audio chunk periodically
            if audio_timer >= (BUFFER_SIZE / SAMPLE_RATE) * 0.8:  # Slight overlap
                self.current_audio_data = self.generate_audio_chunk()
                self.play_audio()
                audio_timer = 0
            
            # Update visualization
            self.update_waveform_visualization()
            
            # Draw everything
            self.draw()
        
        pygame.quit()

if __name__ == "__main__":
    try:
        app = AudioVisualizer()
        app.run()
    except Exception as e:
        print(f"Error running AudioLab: {e}")
        pygame.quit()