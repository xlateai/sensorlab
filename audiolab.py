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
GREEN = (0, 255, 100)
BLUE = (100, 150, 255)
PURPLE = (200, 100, 255)

class AudioVisualizer:
    def __init__(self):
        self.screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
        pygame.display.set_caption("AudioLab - Circular Waveform Visualizer")
        self.clock = pygame.time.Clock()
        
        # Audio parameters
        self.time_offset = 0
        self.frequency_base = 220  # Base frequency (A3)
        self.frequency_mod = 0.5   # Frequency modulation rate
        self.amplitude = 0.3
        
        # Visualization parameters
        self.waveform_points = []
        self.num_points = 360  # One point per degree
        
        # Generate initial audio buffer
        self.current_audio_data = self.generate_audio_chunk()
        self.play_audio()
    
    def generate_audio_chunk(self):
        """Generate a chunk of soothing audio data"""
        t = np.linspace(0, BUFFER_SIZE / SAMPLE_RATE, BUFFER_SIZE)
        
        # Create a soothing sound with multiple harmonics and slow modulation
        base_freq = self.frequency_base + 20 * np.sin(self.time_offset * self.frequency_mod)
        
        # Main tone with harmonics
        wave1 = np.sin(2 * np.pi * base_freq * t + self.time_offset)
        wave2 = 0.5 * np.sin(2 * np.pi * base_freq * 1.5 * t + self.time_offset * 1.2)
        wave3 = 0.3 * np.sin(2 * np.pi * base_freq * 2 * t + self.time_offset * 0.8)
        
        # Add some ambient texture
        ambient = 0.1 * np.sin(2 * np.pi * base_freq * 0.5 * t + self.time_offset * 0.3)
        
        # Combine waves
        combined_wave = (wave1 + wave2 + wave3 + ambient) * self.amplitude
        
        # Apply a gentle envelope to avoid clicks
        envelope = np.exp(-t * 2)  # Gentle decay
        combined_wave *= (1 - envelope * 0.3)  # Subtle envelope effect
        
        # Convert to stereo
        stereo_wave = np.array([combined_wave, combined_wave]).T
        
        # Convert to 16-bit integers
        audio_data = (stereo_wave * 32767).astype(np.int16)
        
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
        """Draw everything to the screen"""
        self.screen.fill(BLACK)
        
        # Draw center point
        pygame.draw.circle(self.screen, WHITE, SCREEN_CENTER, 5)
        
        # Draw base circle (reference)
        pygame.draw.circle(self.screen, (50, 50, 50), SCREEN_CENTER, CIRCLE_RADIUS, 2)
        
        # Draw waveform
        if len(self.waveform_points) > 2:
            # Create color gradient based on time
            color_shift = (math.sin(self.time_offset) + 1) / 2
            color = (
                int(100 + color_shift * 155),
                int(150 + color_shift * 105),
                int(200 + color_shift * 55)
            )
            
            pygame.draw.polygon(self.screen, color, self.waveform_points, 3)
            
            # Draw points for extra visual appeal
            for i, point in enumerate(self.waveform_points[::10]):  # Every 10th point
                brightness = int(200 + 55 * math.sin(self.time_offset + i * 0.1))
                point_color = (brightness, brightness//2, brightness//3)
                pygame.draw.circle(self.screen, point_color, (int(point[0]), int(point[1])), 2)
        
        # Draw some UI text
        font = pygame.font.Font(None, 36)
        title_text = font.render("AudioLab - Circular Waveform", True, WHITE)
        self.screen.blit(title_text, (20, 20))
        
        small_font = pygame.font.Font(None, 24)
        info_text = small_font.render("Press SPACE to regenerate audio, ESC to quit", True, (200, 200, 200))
        self.screen.blit(info_text, (20, SCREEN_HEIGHT - 40))
        
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
                    # Regenerate audio with slight variation
                    self.frequency_base += np.random.uniform(-20, 20)
                    self.frequency_base = max(100, min(400, self.frequency_base))
                    self.frequency_mod = np.random.uniform(0.1, 1.0)
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