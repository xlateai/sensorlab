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
    
    def __init__(self, max_samples: int=4, chunk_size: int=512, verbose: bool = False, incorrect_reward: float = -0.01, correct_reward: float = 1.0):
        self.max_samples = max_samples
        self.chunk_size = chunk_size
        self.verbose = verbose
        self.dataset = None
        self.available_samples = []
        self.current_audio_array = None
        self.current_transcription_target = ""
        self.current_transcription_guess = ""
        self.current_audio_timestep = 0

        self.incorrect_reward = incorrect_reward
        self.correct_reward = correct_reward
        self.noop_reward = 0.0

        # Load dataset and prepare available samples
        self._load_dataset()

    def _load_dataset(self):
        """Load the Emilia dataset and prepare the first max_samples for selection."""
        if self.verbose:
            print(f"Loading Emilia dataset with max_samples={self.max_samples}...")
        self.dataset = load_dataset("amphion/Emilia-Dataset", streaming=True)
        
        # Get the first max_samples from the dataset
        train_iter = iter(self.dataset['train'])
        for i in range(self.max_samples):
            try:
                sample = next(train_iter)
                self.available_samples.append(sample)
                if self.verbose:
                    print(f"Loaded sample {i+1}/{self.max_samples}: '{sample['json']['text'][:50]}...'")
            except StopIteration:
                if self.verbose:
                    print(f"Dataset exhausted after {i} samples")
                break
        
        if self.verbose:
            print(f"Successfully loaded {len(self.available_samples)} samples")

    def get_completion_percent(self):
        """Get the percent of the transcription that has been correctly guessed."""
        if self.current_transcription_target is None or len(self.current_transcription_target) == 0:
            return 0.0
        correct_length = len(self.current_transcription_guess)
        total_length = len(self.current_transcription_target)
        return correct_length / total_length

    def step(self, action):
        """
        Action should be an integer:
        0 = no-op (do nothing, advance timestep, reward 0)
        1..N = character prediction (shifted by +1)
        Returns +1 reward for correct character, -0.01 for incorrect, 0 for no-op.
        Only appends to guess string if correct.
        """
        if self.current_transcription_target is None:
            raise ValueError("Environment not reset. Call reset() first.")

        current_pos = len(self.current_transcription_guess)
        reward = 0
        transcription_complete = (current_pos >= len(self.current_transcription_target))
        info = {}

        if action == 0:
            # No-op: do nothing, advance timestep, reward 0
            reward = self.noop_reward
            info = {"noop": True}
        elif not transcription_complete:
            # Get the expected character at current position
            expected_char = self.current_transcription_target[current_pos]
            predicted_char = self.numeric_to_character(action)
            if predicted_char == expected_char:
                # Correct prediction
                self.current_transcription_guess += predicted_char
                reward = self.correct_reward
                transcription_complete = len(self.current_transcription_guess) >= len(self.current_transcription_target)
                info = {"correct": True, "expected": expected_char, "predicted": predicted_char}
            else:
                # Incorrect prediction - don't append to guess
                reward = self.incorrect_reward
                info = {"correct": False, "expected": expected_char, "predicted": predicted_char}
        else:
            # Transcription already complete, no more characters to predict
            info = {"message": "Transcription already complete", "predicted": action}

        # Move to next chunk
        self.current_audio_timestep += self.chunk_size

        # Terminal conditions:
        audio_finished = self.current_audio_timestep >= len(self.current_audio_array)
        done = audio_finished or transcription_complete

        if done:
            if transcription_complete and not audio_finished:
                info["termination_reason"] = "transcription_complete_early"
            elif audio_finished:
                info["termination_reason"] = "audio_finished"

            if self.verbose:
                print(f"\nEpisode complete! Reason: {info.get('termination_reason', 'unknown')}")
                print(f"Total steps: {self.current_audio_timestep}")
                print(f"Audio length: {len(self.current_audio_array)} samples")
                print(f"Final transcription: '{self.current_transcription_guess}'")
                print(f"Target transcription: '{self.current_transcription_target}'")
                completion_rate = len(self.current_transcription_guess) / len(self.current_transcription_target) * 100
                print(f"Completion rate: {completion_rate:.1f}%")

        obs = self._get_observation()

        self.observation = obs
        self.reward = reward
        self.done = done
        self.terminated = False
        self.info = info

        return self.observation, self.reward, self.done, self.terminated, self.info

    def _get_observation(self):
        """Get the current audio chunk as observation."""
        if self.current_audio_array is None:
            return np.zeros(self.chunk_size, dtype=np.float32)
        start = self.current_audio_timestep
        end = start + self.chunk_size
        audio_len = len(self.current_audio_array)
        if start >= audio_len:
            # Beyond audio, return zeros
            return np.zeros(self.chunk_size, dtype=np.float32)
        chunk = self.current_audio_array[start:end]
        if len(chunk) < self.chunk_size:
            # Pad with zeros if final chunk is short
            pad_width = self.chunk_size - len(chunk)
            chunk = np.pad(chunk, (0, pad_width), mode='constant')
        return np.array(chunk, dtype=np.float32)

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
        self.current_audio_timestep = 0
        self.done = False
        
        if self.verbose:
            print(f"Reset with sample: '{self.current_transcription_target}'")
            print(f"Audio length: {len(self.current_audio_array)} samples")
            print(f"Target length: {len(self.current_transcription_target)} characters")
            print(f"\nAudio Stats:")
            print(f"Sample rate: {selected_sample['mp3']['sampling_rate']} Hz")
            print(f"Audio duration: {len(self.current_audio_array) / selected_sample['mp3']['sampling_rate']:.2f} seconds")
            print(f"Audio shape: {self.current_audio_array.shape} (num_timesteps: {self.current_audio_array.shape[0]}, vector_bandwidth: {self.current_audio_array.ndim}D)")
            print(f"Audio min/max: {self.current_audio_array.min():.4f} / {self.current_audio_array.max():.4f}")
            print(f"Audio mean: {self.current_audio_array.mean():.4f}")
            print(f"Audio std: {self.current_audio_array.std():.4f}")
            print(f"\nReady to take steps (only showing +1 reward - correct guesses)...")
        
        # Return initial observation
        self.observation = self._get_observation()
        self.info = {
            "target_text": self.current_transcription_target,
            "audio_length": len(self.current_audio_array),
            "sample_rate": selected_sample['mp3']['sampling_rate']
        }
        
        return self.observation, self.info

    def play_current_sample_audio(self):
        """Play the current audio sample using pygame."""
        import pygame
        import time
        
        if self.current_audio_array is None:
            if self.verbose:
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

    def next_character(self):
        """
        Get the next character that should be predicted at the current position.
        Returns None if transcription is already complete.
        """
        if self.current_transcription_target is None:
            return None
        
        current_pos = len(self.current_transcription_guess)
        if current_pos >= len(self.current_transcription_target):
            return None  # Transcription already complete
        
        return self.current_transcription_target[current_pos]

    def numeric_to_character(self, numeric_value):
        """
        Convert a numeric value (index) to a character using the character_dictionary.
        0 is reserved for no-op. 1 maps to first character, etc.
        """
        idx = int(numeric_value)
        if idx == 0:
            return None  # No-op
        dictionary = self.character_dictionary
        idx -= 1  # Shift down by 1
        if idx < 0 or idx >= len(dictionary):
            raise ValueError(f"Index {idx+1} out of bounds for character dictionary of size {len(dictionary)}")
        return dictionary[idx]

    def character_to_numeric(self, character):
        """
        Convert a character to its index in the character_dictionary.
        Returns 1-based index (0 is reserved for no-op).
        """
        dictionary = self.character_dictionary
        if not isinstance(character, str) or len(character) != 1:
            raise ValueError(f"character_to_numeric expects single character, got: {character}")
        try:
            return dictionary.index(character) + 1  # Shift up by 1
        except ValueError:
            raise ValueError(f"Character '{character}' not found in character dictionary.")
    
    @property
    def was_completed(self):
        """Check if the current transcription guess matches the target."""
        return self.current_transcription_guess == self.current_transcription_target

    @property
    def character_dictionary(self):
        if not hasattr(self, '_character_dictionary_cache'):
            chars = set()
            for sample in self.available_samples:
                chars.update(sample['json']['text'])
            self._character_dictionary_cache = sorted(chars)
        return self._character_dictionary_cache


if __name__ == "__main__":
    import string
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(max_samples=1)
    
    # Reset to get a sample
    obs, info = env.reset()
    
    # Play the audio
    # env.play_current_sample_audio()
    
    # Take random steps until episode terminates
    step_count = 0
    done = False
    
    while not done:
        step_count += 1
        # Random action: 0 = no-op, 1..dict_size = character
        dict_size = len(env.character_dictionary)
        random_action = random.randint(0, dict_size)  # inclusive of 0
        obs, reward, done, truncated, info = env.step(random_action)
        
        if done:
            break

