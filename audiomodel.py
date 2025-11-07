import torch
import torch.nn as nn
import numpy as np
import sounddevice as sd
import threading
import time

class AudioGeneratorModel(nn.Module):
    """
    A simple neural network model that generates audio samples.
    Outputs 4096 values in the range of -5000 to +5000.
    """
    
    def __init__(self, sequence_length=4096, hidden_size=512):
        super(AudioGeneratorModel, self).__init__()
        self.sequence_length = sequence_length
        self.hidden_size = hidden_size
        
        # Simple feedforward network for now
        self.layers = nn.Sequential(
            nn.Linear(1, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, hidden_size),
            nn.ReLU(),
            nn.Linear(hidden_size, sequence_length),
            nn.Tanh()  # Output between -1 and 1
        )
        
        # Initialize weights randomly
        self._init_weights()
    
    def _init_weights(self):
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.normal_(module.weight, 0.0, 0.02)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
    
    def forward(self, x):
        # x is a dummy input, we'll just use current time as input
        output = self.layers(x)
        # Scale from [-1, 1] to [-5000, 5000]
        return output * 5000

class AudioGenerator:
    """
    Real-time audio generator using sounddevice and PyTorch model.
    """
    
    def __init__(self, model, sample_rate=44100, chunk_size=1024):
        self.model = model
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.is_playing = False
        self.time_step = 0.0
        self.stream = None
        
    def generate_audio_chunk(self):
        """Generate a chunk of audio data from the model."""
        with torch.no_grad():
            # Use current time as input (you could use previous samples instead)
            input_tensor = torch.tensor([[self.time_step]], dtype=torch.float32)
            
            # Generate 4096 samples from the model
            audio_samples = self.model(input_tensor).squeeze().numpy()
            
            # Take only the chunk size we need for this audio callback
            chunk_samples = audio_samples[:self.chunk_size]
            
            # Convert to float32 in range [-1, 1] for sounddevice
            # sounddevice expects float32 values between -1 and 1
            audio_float = np.clip(chunk_samples / 5000.0, -1.0, 1.0).astype(np.float32)
            
            # Update time step
            self.time_step += 0.01
            
            return audio_float
    
    def audio_callback(self, outdata, frames, time, status):
        """Sounddevice callback function."""
        if status:
            print(f"Audio status: {status}")
        
        if self.is_playing:
            try:
                audio_data = self.generate_audio_chunk()
                # Reshape to match expected output format (frames, channels)
                outdata[:] = audio_data[:frames].reshape(-1, 1)
            except Exception as e:
                print(f"Audio generation error: {e}")
                outdata.fill(0)
        else:
            outdata.fill(0)
    
    def start(self):
        """Start audio generation and playback."""
        self.is_playing = True
        
        # Create and start the audio stream
        self.stream = sd.OutputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype=np.float32,
            blocksize=self.chunk_size,
            callback=self.audio_callback
        )
        
        self.stream.start()
        print(f"Audio generation started at {self.sample_rate}Hz")
        print("Press Ctrl+C to stop...")
    
    def stop(self):
        """Stop audio generation and playback."""
        self.is_playing = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None
        print("Audio generation stopped.")
    
    def cleanup(self):
        """Clean up audio resources."""
        self.stop()

def main():
    """Main function to run the audio generator."""
    print("Initializing Audio Lab...")
    
    # Create the model
    model = AudioGeneratorModel(sequence_length=4096, hidden_size=256)
    print(f"Model created with {sum(p.numel() for p in model.parameters())} parameters")
    
    # Test the model output
    with torch.no_grad():
        test_input = torch.tensor([[0.0]], dtype=torch.float32)
        test_output = model(test_input)
        print(f"Model output shape: {test_output.shape}")
        print(f"Output range: [{test_output.min().item():.2f}, {test_output.max().item():.2f}]")
    
    # Create audio generator
    audio_gen = AudioGenerator(model, sample_rate=44100, chunk_size=1024)
    
    try:
        # Start generating audio
        audio_gen.start()
        
        # Keep the program running
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        audio_gen.cleanup()

if __name__ == "__main__":
    main()
