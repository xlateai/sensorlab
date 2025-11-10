import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
import sounddevice as sd
import threading
import time
import queue
from collections import deque

class RealTimeAudioPredictor(nn.Module):
    """
    Neural network that learns to predict the next audio frame from previous frames.
    Designed for real-time learning and inference.
    """
    
    def __init__(self, sequence_length=512, hidden_size=256, num_layers=3):
        super(RealTimeAudioPredictor, self).__init__()
        self.sequence_length = sequence_length
        self.hidden_size = hidden_size
        
        # LSTM for temporal modeling
        self.lstm = nn.LSTM(
            input_size=1,
            hidden_size=hidden_size,
            num_layers=num_layers,
            batch_first=True,
            dropout=0.1
        )
        
        # Output layers
        self.output_layers = nn.Sequential(
            nn.Linear(hidden_size, hidden_size // 2),
            nn.ReLU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_size // 2, hidden_size // 4),
            nn.ReLU(),
            nn.Linear(hidden_size // 4, 1),
            nn.Tanh()  # Output between -1 and 1
        )
        
        # Initialize weights
        self._init_weights()
        
        # Hidden state for continuous generation
        self.hidden_state = None
        
    def _init_weights(self):
        for module in self.modules():
            if isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                if module.bias is not None:
                    nn.init.zeros_(module.bias)
            elif isinstance(module, nn.LSTM):
                for name, param in module.named_parameters():
                    if 'weight' in name:
                        nn.init.xavier_uniform_(param)
                    elif 'bias' in name:
                        nn.init.zeros_(param)
    
    def forward(self, x, hidden=None):
        """
        Forward pass for training.
        x: (batch_size, sequence_length, 1)
        """
        lstm_out, hidden = self.lstm(x, hidden)
        # Use the last output for prediction
        last_output = lstm_out[:, -1, :]
        prediction = self.output_layers(last_output)
        return prediction, hidden
    
    def predict_next(self, sequence):
        """
        Predict the next audio sample given a sequence.
        sequence: (sequence_length,) numpy array
        """
        self.eval()
        with torch.no_grad():
            # Convert to tensor and reshape
            x = torch.tensor(sequence, dtype=torch.float32).unsqueeze(0).unsqueeze(-1)
            prediction, self.hidden_state = self.forward(x, self.hidden_state)
            return prediction.item()
    
    def reset_hidden_state(self):
        """Reset hidden state for fresh generation."""
        self.hidden_state = None

class RealTimeLearningAudioSystem:
    """
    System that simultaneously:
    1. Records audio from microphone
    2. Trains model to predict next audio frame
    3. Generates and plays predicted audio
    """
    
    def __init__(self, sample_rate=44100, chunk_size=1024, sequence_length=512):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size
        self.sequence_length = sequence_length
        
        # Model and optimizer
        self.model = RealTimeAudioPredictor(sequence_length=sequence_length)
        self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
        self.criterion = nn.MSELoss()
        
        # Audio buffers and queues
        self.mic_buffer = deque(maxlen=sequence_length * 10)  # Keep more history
        self.training_queue = queue.Queue(maxsize=20)  # Smaller queue to prevent backup
        
        # Control flags
        self.is_running = False
        self.learning_enabled = True
        
        # Statistics
        self.training_loss = 0.0
        self.training_steps = 0
        self.prediction_error = 0.0
        
        # Audio streams
        self.input_stream = None
        self.output_stream = None
        
        # Mix control (how much predicted vs random audio to play)
        self.prediction_mix = 0.0  # Start with 0% prediction, 100% noise
        self.mix_increase_rate = 0.01  # Gradually increase prediction mix
        
        # Synthetic audio for testing when mic is quiet
        self.use_synthetic_input = False
        self.synthetic_time = 0.0
        
    def audio_input_callback(self, indata, frames, time, status):
        """Callback for microphone input."""
        if status:
            print(f"Input status: {status}")
        
        # Convert to mono and normalize
        audio_mono = np.mean(indata, axis=1) if indata.shape[1] > 1 else indata.flatten()
        audio_normalized = np.clip(audio_mono, -1.0, 1.0)
        
        # Print audio level every few callbacks
        if hasattr(self, 'input_callback_count'):
            self.input_callback_count += 1
        else:
            self.input_callback_count = 1
        
        if self.input_callback_count % 50 == 0:  # Print every 50 callbacks (~1 second)
            audio_level = np.max(np.abs(audio_normalized))
            print(f"Input audio level: {audio_level:.3f}, Buffer size: {len(self.mic_buffer)}")
            
            # If no audio detected, switch to synthetic input for testing
            if audio_level < 0.001 and not self.use_synthetic_input:
                print("No microphone input detected. Switching to synthetic audio for testing...")
                self.use_synthetic_input = True
        
        # If using synthetic input or no real audio, generate test patterns
        if self.use_synthetic_input or np.max(np.abs(audio_normalized)) < 0.001:
            # Generate synthetic audio pattern
            t = np.linspace(self.synthetic_time, self.synthetic_time + frames/self.sample_rate, frames)
            # Mix of sine waves with some randomness
            freq1 = 110 + 30 * np.sin(self.synthetic_time * 0.3)
            freq2 = 165 + 20 * np.cos(self.synthetic_time * 0.7)
            synthetic_audio = 0.3 * (np.sin(2*np.pi*freq1*t) + 0.5*np.sin(2*np.pi*freq2*t))
            audio_normalized = synthetic_audio + 0.05 * np.random.normal(0, 1, len(t))
            audio_normalized = np.clip(audio_normalized, -1.0, 1.0)
            self.synthetic_time += frames/self.sample_rate
        
        # Add to buffer
        self.mic_buffer.extend(audio_normalized)
        
        # Create training data if we have enough samples
        if len(self.mic_buffer) >= self.sequence_length + 1:
            try:
                # Get sequence and target
                sequence = list(self.mic_buffer)[-self.sequence_length-1:-1]
                target = self.mic_buffer[-1]
                
                # Add to training queue (non-blocking)
                if not self.training_queue.full():
                    self.training_queue.put((sequence, target), block=False)
                else:
                    # Drop oldest training sample to make room
                    try:
                        self.training_queue.get_nowait()
                        self.training_queue.put((sequence, target), block=False)
                    except queue.Empty:
                        pass
            except Exception as e:
                print(f"Training data creation error: {e}")
    
    def audio_output_callback(self, outdata, frames, time, status):
        """Callback for audio output - plays predicted audio."""
        if status:
            print(f"Output status: {status}")
        
        # Track output callbacks for debugging
        if hasattr(self, 'output_callback_count'):
            self.output_callback_count += 1
        else:
            self.output_callback_count = 1
        
        try:
            if len(self.mic_buffer) >= self.sequence_length:
                # Get recent audio for prediction
                recent_audio = np.array(list(self.mic_buffer)[-self.sequence_length:])
                
                # Generate predicted audio
                predicted_samples = []
                current_sequence = recent_audio.copy()
                
                for _ in range(frames):
                    # Predict next sample
                    predicted_sample = self.model.predict_next(current_sequence)
                    predicted_samples.append(predicted_sample)
                    
                    # Update sequence for next prediction
                    current_sequence = np.roll(current_sequence, -1)
                    current_sequence[-1] = predicted_sample
                
                predicted_audio = np.array(predicted_samples)
                
                # Generate some ambient noise for mixing
                t = np.linspace(0, frames / self.sample_rate, frames)
                noise_freq = 220 + 50 * np.sin(time.outputBufferDacTime * 0.1)
                ambient_audio = 0.1 * np.sin(2 * np.pi * noise_freq * t)
                
                # Mix predicted and ambient audio
                mixed_audio = (
                    self.prediction_mix * predicted_audio + 
                    (1 - self.prediction_mix) * ambient_audio
                )
                
                # Scale to appropriate range and apply to output
                audio_scaled = np.clip(mixed_audio * 0.3, -1.0, 1.0)
                outdata[:] = audio_scaled.reshape(-1, 1)
                
                # Print audio output info every few callbacks
                if self.output_callback_count % 50 == 0:
                    pred_level = np.max(np.abs(predicted_audio))
                    output_level = np.max(np.abs(audio_scaled))
                    print(f"Output - Prediction level: {pred_level:.3f}, "
                          f"Final level: {output_level:.3f}, Mix: {self.prediction_mix:.1%}")
                
                # Gradually increase prediction mix as model learns
                if self.training_steps > 100:  # Start mixing after some training
                    self.prediction_mix = min(0.8, self.prediction_mix + self.mix_increase_rate)
                
            else:
                # Not enough data yet, play gentle noise
                t = np.linspace(0, frames / self.sample_rate, frames)
                gentle_noise = 0.05 * np.sin(2 * np.pi * 220 * t)
                outdata[:] = gentle_noise.reshape(-1, 1)
                
                if self.output_callback_count % 50 == 0:
                    print(f"Not enough data - Buffer size: {len(self.mic_buffer)}, need: {self.sequence_length}")
                
        except Exception as e:
            print(f"Audio generation error: {e}")
            outdata.fill(0)
    
    def training_worker(self):
        """Background thread that continuously trains the model."""
        print("Training worker started...")
        
        while self.is_running:
            try:
                if not self.learning_enabled:
                    time.sleep(0.1)
                    continue
                
                # Get training data
                training_data = []
                targets = []
                
                # Collect a smaller batch for faster processing
                batch_size = min(4, self.training_queue.qsize())  # Smaller batch
                if batch_size == 0:
                    time.sleep(0.01)
                    continue
                
                for _ in range(batch_size):
                    try:
                        sequence, target = self.training_queue.get(timeout=0.01)  # Shorter timeout
                        training_data.append(sequence)
                        targets.append(target)
                    except queue.Empty:
                        break
                
                if not training_data:
                    continue
                
                # Convert to tensors
                X = torch.tensor(training_data, dtype=torch.float32).unsqueeze(-1)
                y = torch.tensor(targets, dtype=torch.float32).unsqueeze(-1)
                
                # Check for valid data
                if torch.isnan(X).any() or torch.isnan(y).any():
                    print("Warning: NaN values in training data, skipping batch")
                    continue
                
                # Training step
                self.model.train()
                self.optimizer.zero_grad()
                
                predictions, _ = self.model(X)
                loss = self.criterion(predictions, y)
                
                # Check for valid loss
                if torch.isnan(loss) or loss.item() == 0.0:
                    print(f"Warning: Invalid loss {loss.item()}, predictions range: [{predictions.min().item():.6f}, {predictions.max().item():.6f}], targets range: [{y.min().item():.6f}, {y.max().item():.6f}]")
                    continue
                
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), max_norm=1.0)
                self.optimizer.step()
                
                # Update statistics
                self.training_loss = 0.9 * self.training_loss + 0.1 * loss.item()
                self.training_steps += 1
                
                # Print progress more frequently
                if self.training_steps % 20 == 0:  # More frequent updates
                    print(f"Training step {self.training_steps}, Loss: {self.training_loss:.6f}, "
                          f"Mix: {self.prediction_mix:.1%}, Queue size: {self.training_queue.qsize()}")
                
                # Print every 10 steps for more detailed feedback
                if self.training_steps % 10 == 0:
                    print(f"Step {self.training_steps}: Loss={loss.item():.6f}, Batch size={batch_size}, Queue: {self.training_queue.qsize()}")
                
            except Exception as e:
                print(f"Training error: {e}")
                time.sleep(0.1)
    
    def start(self):
        """Start the real-time learning system."""
        print("Starting Real-Time Learning Audio System...")
        print("The system will:")
        print("1. Listen to your microphone")
        print("2. Train a neural network to predict the next audio frame")
        print("3. Play the predicted audio (mixed with ambient sound)")
        print("\nControls:")
        print("- Press 'l' to toggle learning on/off")
        print("- Press 'r' to reset the model")
        print("- Press 's' to toggle synthetic input")
        print("- Press 'q' to quit")
        print("\nChecking audio devices...")
        
        # List available audio devices
        print("Available audio devices:")
        print(sd.query_devices())
        print("\nStarting in 3 seconds...")
        time.sleep(3)
        
        self.is_running = True
        
        # Start training thread
        training_thread = threading.Thread(target=self.training_worker, daemon=True)
        training_thread.start()
        
        # Start audio streams
        self.input_stream = sd.InputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype=np.float32,
            blocksize=self.chunk_size,
            callback=self.audio_input_callback
        )
        
        self.output_stream = sd.OutputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype=np.float32,
            blocksize=self.chunk_size,
            callback=self.audio_output_callback
        )
        
        self.input_stream.start()
        self.output_stream.start()
        
        print("System started! Make some sounds into your microphone...")
        print("You should hear gentle ambient noise initially.")
        print("Watch for input audio levels and training progress below:")
        print("-" * 60)
        
        # Simple command interface
        try:
            while self.is_running:
                command = input("Command (l=toggle learning, r=reset, q=quit): ").strip().lower()
                
                if command == 'q':
                    break
                elif command == 'l':
                    self.learning_enabled = not self.learning_enabled
                    status = "enabled" if self.learning_enabled else "disabled"
                    print(f"Learning {status}")
                elif command == 'r':
                    print("Resetting model...")
                    self.model = RealTimeAudioPredictor(sequence_length=self.sequence_length)
                    self.optimizer = optim.Adam(self.model.parameters(), lr=0.001)
                    self.training_loss = 0.0
                    self.training_steps = 0
                    self.prediction_mix = 0.0
                    print("Model reset complete")
                elif command == 's':
                    self.use_synthetic_input = not self.use_synthetic_input
                    status = "enabled" if self.use_synthetic_input else "disabled"
                    print(f"Synthetic input {status}")
                elif command == '':
                    # Just show status
                    print(f"Status - Learning: {self.learning_enabled}, "
                          f"Steps: {self.training_steps}, "
                          f"Loss: {self.training_loss:.6f}, "
                          f"Mix: {self.prediction_mix:.1%}, "
                          f"Synthetic: {self.use_synthetic_input}")
                
        except KeyboardInterrupt:
            print("\nShutting down...")
        
        self.stop()
    
    def stop(self):
        """Stop the system and clean up."""
        print("Stopping system...")
        self.is_running = False
        
        if self.input_stream:
            self.input_stream.stop()
            self.input_stream.close()
        
        if self.output_stream:
            self.output_stream.stop()
            self.output_stream.close()
        
        print("System stopped.")

def main():
    """Main function to run the real-time learning audio system."""
    print("Real-Time Audio Learning System")
    print("=" * 40)
    
    # Create and start the system
    system = RealTimeLearningAudioSystem(
        sample_rate=44100,
        chunk_size=512,  # Smaller chunks for lower latency
        sequence_length=256  # Shorter sequence for faster learning
    )
    
    try:
        system.start()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        system.stop()

if __name__ == "__main__":
    main()