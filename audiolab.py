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
        self.frequency_base = 110  # Lower base frequency for synth-wave
        self.frequency_mod = 0.3   # Slower modulation for smoother feel
        self.amplitude = 0.4
        self.phase_continuity = 0  # Track phase for smooth transitions
        
        # Synth-wave parameters
        self.lfo_rate = 0.2  # Low frequency oscillator for filter sweep
        self.filter_cutoff = 0.5
        
        # Audio smoothing
        self.previous_chunk = None
        self.fade_samples = 512  # Number of samples for crossfade
        
        # Visualization parameters
        self.waveform_points = []
        self.num_points = 360  # One point per degree
        
        # Generate initial audio buffer
        self.current_audio_data = self.generate_audio_chunk()
        self.play_audio()
    
    def generate_audio_chunk(self):
        """Generate a chunk of smooth synth-wave audio data"""
        t = np.linspace(0, BUFFER_SIZE / SAMPLE_RATE, BUFFER_SIZE)
        t_global = t + self.time_offset
        
        # Synth-wave style oscillators with smooth frequency modulation
        base_freq = self.frequency_base + 15 * np.sin(self.time_offset * self.frequency_mod)
        
        # Main synth lead with detuned oscillators
        osc1 = np.sin(2 * np.pi * base_freq * t_global + self.phase_continuity)
        osc2 = np.sin(2 * np.pi * base_freq * 1.01 * t_global + self.phase_continuity * 1.1)  # Slight detune
        osc3 = np.sin(2 * np.pi * base_freq * 0.5 * t_global + self.phase_continuity * 0.7)   # Sub oscillator
        
        # Synth-wave style sawtooth wave
        saw_wave = 2 * ((base_freq * t_global + self.phase_continuity / (2 * np.pi)) % 1) - 1
        saw_wave = np.clip(saw_wave, -1, 1)  # Hard clip for digital feel
        
        # Low-frequency oscillator for filter movement
        lfo = np.sin(2 * np.pi * self.lfo_rate * t_global)
        filter_mod = 0.5 + 0.3 * lfo
        
        # Mix oscillators with synth-wave character
        main_wave = (0.4 * osc1 + 0.3 * osc2 + 0.2 * osc3 + 0.3 * saw_wave * filter_mod)
        
        # Add some harmonic content for richness
        harmonic1 = 0.15 * np.sin(2 * np.pi * base_freq * 2 * t_global + self.phase_continuity * 2)
        harmonic2 = 0.1 * np.sin(2 * np.pi * base_freq * 3 * t_global + self.phase_continuity * 3)
        
        # Combine all elements
        combined_wave = (main_wave + harmonic1 + harmonic2) * self.amplitude
        
        # Apply smooth envelope to prevent clicks (attack/sustain/release style)
        envelope = np.ones_like(combined_wave)
        fade_in_samples = min(self.fade_samples, len(combined_wave) // 4)
        fade_out_samples = min(self.fade_samples, len(combined_wave) // 4)
        
        # Fade in at the beginning
        envelope[:fade_in_samples] = np.linspace(0, 1, fade_in_samples)
        # Fade out at the end
        envelope[-fade_out_samples:] = np.linspace(1, 0, fade_out_samples)
        
        combined_wave *= envelope
        
        # Convert to stereo and ensure C-contiguous array
        stereo_wave = np.column_stack((combined_wave, combined_wave))
        
        # Convert to 16-bit integers and ensure C-contiguous
        audio_data = (stereo_wave * 32767).astype(np.int16)
        audio_data = np.ascontiguousarray(audio_data)
        
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
        """Update the circular waveform visualization based on current audio data"""
        self.waveform_points = []
        
        # Use a subset of the audio data for visualization
        visualization_data = self.current_audio_data[::BUFFER_SIZE//self.num_points, 0]
        
        for i in range(self.num_points):
            angle = (i / self.num_points) * 2 * math.pi
            
            # Get amplitude value (normalize it)
            if i < len(visualization_data):
                amplitude_value = visualization_data[i] / 32767.0
            else:
                amplitude_value = 0
            
            # Calculate radius based on base circle radius plus amplitude
            radius = CIRCLE_RADIUS + (amplitude_value * 80)  # Scale amplitude for visibility
            
            # Calculate point position
            x = SCREEN_CENTER[0] + radius * math.cos(angle)
            y = SCREEN_CENTER[1] + radius * math.sin(angle)
            
            self.waveform_points.append((x, y))
    
    def draw(self):
        """Draw everything to the screen with synth-wave aesthetics"""
        # Dark gradient background
        self.screen.fill(DARK_PURPLE)
        
        # Add some background grid for synth-wave feel
        for i in range(0, SCREEN_WIDTH, 60):
            pygame.draw.line(self.screen, (40, 40, 80), (i, 0), (i, SCREEN_HEIGHT), 1)
        for i in range(0, SCREEN_HEIGHT, 40):
            pygame.draw.line(self.screen, (40, 40, 80), (0, i), (SCREEN_WIDTH, i), 1)
        
        # Draw glowing center point
        for radius in [8, 6, 4, 2]:
            alpha = 255 - (radius * 30)
            color = (*NEON_CYAN, max(0, alpha))
            # Create a surface for alpha blending
            glow_surface = pygame.Surface((radius*4, radius*4), pygame.SRCALPHA)
            pygame.draw.circle(glow_surface, color, (radius*2, radius*2), radius)
            self.screen.blit(glow_surface, (SCREEN_CENTER[0] - radius*2, SCREEN_CENTER[1] - radius*2))
        
        # Draw base circle (reference) with neon glow
        pygame.draw.circle(self.screen, (60, 60, 120), SCREEN_CENTER, CIRCLE_RADIUS, 2)
        pygame.draw.circle(self.screen, ELECTRIC_BLUE, SCREEN_CENTER, CIRCLE_RADIUS, 1)
        
        # Draw waveform with synth-wave colors and glow
        if len(self.waveform_points) > 2:
            # Create dynamic color based on audio intensity and time
            intensity = np.mean(np.abs(self.current_audio_data[:, 0])) / 32767.0
            time_shift = (math.sin(self.time_offset * 0.5) + 1) / 2
            
            # Primary neon color
            color = (
                int(NEON_PINK[0] * (0.5 + intensity * 0.5)),
                int(NEON_PINK[1] + (NEON_CYAN[1] - NEON_PINK[1]) * time_shift),
                int(NEON_PINK[2] + (NEON_CYAN[2] - NEON_PINK[2]) * time_shift)
            )
            
            # Draw waveform with glow effect
            # Outer glow
            pygame.draw.polygon(self.screen, (color[0]//4, color[1]//4, color[2]//4), self.waveform_points, 8)
            # Main line
            pygame.draw.polygon(self.screen, color, self.waveform_points, 4)
            # Inner highlight
            bright_color = tuple(min(255, c + 50) for c in color)
            pygame.draw.polygon(self.screen, bright_color, self.waveform_points, 2)
            
            # Draw pulsing points at key positions
            for i, point in enumerate(self.waveform_points[::30]):  # Every 30th point
                pulse = math.sin(self.time_offset * 2 + i * 0.5) * 0.5 + 0.5
                point_size = int(2 + pulse * 3)
                point_brightness = int(150 + pulse * 105)
                point_color = (point_brightness, point_brightness//2, 255)
                pygame.draw.circle(self.screen, point_color, (int(point[0]), int(point[1])), point_size)
        
        # Draw retro-style UI
        font = pygame.font.Font(None, 48)
        title_text = font.render("◆ AUDIOLAB ◆", True, NEON_CYAN)
        self.screen.blit(title_text, (20, 20))
        
        # Add a subtitle
        subtitle_font = pygame.font.Font(None, 24)
        subtitle_text = subtitle_font.render("S Y N T H   W A V E   V I S U A L I Z E R", True, NEON_PINK)
        self.screen.blit(subtitle_text, (25, 65))
        
        # Control instructions
        small_font = pygame.font.Font(None, 20)
        info_text = small_font.render("► SPACE: New wave pattern  ► ESC: Exit", True, WHITE)
        self.screen.blit(info_text, (20, SCREEN_HEIGHT - 30))
        
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