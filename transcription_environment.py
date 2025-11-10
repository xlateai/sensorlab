import gymnasium as gym
import numpy as np
import random
from datasets import load_dataset

class TranscriptionEnvironmentSingleInstance(gym.Env):
    """Basically, an agent's goal is to be given each timestep
    of the audio and predict either NULL or a character.

    The sooner the agent can predict the correct next character,
    the higher their reward will be.

    Ideally, the agent predicts NULL until they are 100% certain of the next
    character.
    """
    
    def __init__(self, max_samples: int=4):
        self.max_samples = max_samples
        self.dataset = None
        self.available_samples = []
        self.current_audio_array = None
        self.current_transcription_target = ""
        self.current_transcription_guess = ""
        self.current_timestep = 0
        
        # Load dataset and prepare available samples
        self._load_dataset()

    def _load_dataset(self):
        """Load the Emilia dataset and prepare the first max_samples for selection."""
        print(f"Loading Emilia dataset with max_samples={self.max_samples}...")
        self.dataset = load_dataset("amphion/Emilia-Dataset", streaming=True)
        
        # Get the first max_samples from the dataset
        train_iter = iter(self.dataset['train'])
        for i in range(self.max_samples):
            try:
                sample = next(train_iter)
                self.available_samples.append(sample)
                print(f"Loaded sample {i+1}/{self.max_samples}: '{sample['json']['text'][:50]}...'")
            except StopIteration:
                print(f"Dataset exhausted after {i} samples")
                break
        
        print(f"Successfully loaded {len(self.available_samples)} samples")

    def step(self, action):
        """
        Action should be a character prediction.
        Returns +1 reward for correct character, 0 for incorrect.
        Only appends to guess string if correct.
        
        Terminal criteria:
        1. Timesteps equal to audio sequence length, OR
        2. Full transcription completed early
        """
        if self.current_transcription_target is None:
            raise ValueError("Environment not reset. Call reset() first.")
            
        current_pos = len(self.current_transcription_guess)
        reward = 0
        
        # Check if transcription is already complete
        transcription_complete = (current_pos >= len(self.current_transcription_target))
        
        if not transcription_complete:
            # Get the expected character at current position
            expected_char = self.current_transcription_target[current_pos]
            
            if action == expected_char:
                # Correct prediction
                self.current_transcription_guess += action
                reward = 1
                transcription_complete = len(self.current_transcription_guess) >= len(self.current_transcription_target)
                info = {"correct": True, "expected": expected_char, "predicted": action}
            else:
                # Incorrect prediction - don't append to guess
                reward = 0
                info = {"correct": False, "expected": expected_char, "predicted": action}
        else:
            # Transcription already complete, no more characters to predict
            info = {"message": "Transcription already complete", "predicted": action}
        
        # Move to next timestep
        self.current_timestep += 1
        
        # Terminal conditions:
        # 1. Audio sequence is finished (timestep >= audio length)
        # 2. Transcription is complete (early termination)
        audio_finished = self.current_timestep >= len(self.current_audio_array)
        done = audio_finished or transcription_complete
        
        if done:
            if transcription_complete and not audio_finished:
                info["termination_reason"] = "transcription_complete_early"
            elif audio_finished:
                info["termination_reason"] = "audio_finished"
        
        # Observation is current audio timestep (or zeros if beyond audio length)
        obs = self._get_observation()
        
        return obs, reward, done, False, info

    def _get_observation(self):
        """Get the current audio timestep as observation."""
        if (self.current_audio_array is None or 
            self.current_timestep >= len(self.current_audio_array)):
            # Return silence if we're beyond the audio
            return np.array([0.0], dtype=np.float32)
        else:
            # Return current audio sample
            return np.array([self.current_audio_array[self.current_timestep]], dtype=np.float32)

    def reset(self, *, seed=None, options=None):
        """Reset environment by selecting a random sample from available indices."""
        if seed is not None:
            random.seed(seed)
            
        if not self.available_samples:
            raise ValueError("No samples available. Check dataset loading.")
        
        # Select a random sample from available samples
        selected_sample = random.choice(self.available_samples)
        
        # Set current state from selected sample
        self.current_audio_array = selected_sample['mp3']['array']
        self.current_transcription_target = selected_sample['json']['text']
        self.current_transcription_guess = ""
        self.current_timestep = 0
        
        print(f"Reset with sample: '{self.current_transcription_target}'")
        print(f"Audio length: {len(self.current_audio_array)} samples")
        print(f"Target length: {len(self.current_transcription_target)} characters")
        
        # Return initial observation
        observation = self._get_observation()
        info = {
            "target_text": self.current_transcription_target,
            "audio_length": len(self.current_audio_array),
            "sample_rate": selected_sample['mp3']['sampling_rate']
        }
        
        return observation, info

    def play_current_sample_audio(self):
        """Play the current audio sample using pygame."""
        import pygame
        import time
        
        if self.current_audio_array is None:
            print("No audio sample loaded. Call reset() first.")
            return
            
        # Get sample rate from the most recent sample
        sample_rate = 24000  # Default Emilia dataset sample rate
        for sample in self.available_samples:
            if np.array_equal(sample['mp3']['array'], self.current_audio_array):
                sample_rate = sample['mp3']['sampling_rate']
                break
        
        # Initialize pygame mixer
        pygame.mixer.init(frequency=sample_rate, size=-16, channels=1, buffer=1024)
        
        # Convert float32 to int16 for pygame
        audio_int16 = (self.current_audio_array * 32767).astype(np.int16)
        
        # Create pygame sound object and play
        sound = pygame.sndarray.make_sound(audio_int16)
        sound.play()
        
        # Wait for audio to finish
        duration = len(self.current_audio_array) / sample_rate
        time.sleep(duration)
        pygame.mixer.quit()


if __name__ == "__main__":
    import string
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(max_samples=1)
    
    # Reset to get a sample
    obs, info = env.reset()
    
    print(f"\nAudio Stats:")
    print(f"Sample rate: {info['sample_rate']} Hz")
    print(f"Audio duration: {len(env.current_audio_array) / info['sample_rate']:.2f} seconds")
    print(f"Audio min/max: {env.current_audio_array.min():.4f} / {env.current_audio_array.max():.4f}")
    print(f"Audio mean: {env.current_audio_array.mean():.4f}")
    print(f"Audio std: {env.current_audio_array.std():.4f}")
    
    # Play the audio
    # env.play_current_sample_audio()
    
    # Take random steps until episode terminates
    print(f"\nTaking random steps until episode ends:")
    step_count = 0
    done = False
    
    while not done:
        step_count += 1
        # Random action - pick a random UTF-8 character from the massive space
        # UTF-8 can represent ~1.1 million characters, let's sample from a reasonable range
        random_unicode_point = random.randint(32, 65535)  # Basic Multilingual Plane (most common chars)
        random_char = chr(random_unicode_point)
        
        obs, reward, done, truncated, info = env.step(random_char)
        
        print(f"Step {step_count}: Action='{random_char}' (U+{random_unicode_point:04X}) | Reward={reward} | Expected='{info.get('expected', 'N/A')}' | Progress: '{env.current_transcription_guess}' | Timestep: {env.current_timestep}")
        
        if done:
            print(f"Episode complete! Reason: {info.get('termination_reason', 'unknown')}")
            print(f"Total steps: {step_count}")
            print(f"Audio length: {len(env.current_audio_array)} samples")
            print(f"Final transcription: '{env.current_transcription_guess}'")
            print(f"Target transcription: '{env.current_transcription_target}'")
            completion_rate = len(env.current_transcription_guess) / len(env.current_transcription_target) * 100
            print(f"Completion rate: {completion_rate:.1f}%")
            break

