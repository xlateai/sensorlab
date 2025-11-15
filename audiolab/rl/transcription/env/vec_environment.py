
import jax
import jax.numpy as jnp
import numpy as np
import random
from datasets import load_dataset


class TranscriptionVecEnv:
    """
    Vectorized environment for multiple agents using JAX.
    Each agent shares the same audio array, but has its own transcription guess.
    Observations, rewards, and dones are returned as jnp arrays.
    """
    def __init__(self, num_agents: int = 64, max_samples: int = 4, chunk_size: int = 512, verbose: bool = False):
        self.num_agents = num_agents
        self.max_samples = max_samples
        self.chunk_size = chunk_size
        self.verbose = verbose
        self.dataset = None
        self.available_samples = []
        self.current_audio_array = None
        self.current_transcription_target = ""
        self.current_transcription_guesses = np.array(["" for _ in range(num_agents)], dtype=object)
        self.current_audio_timestep = 0
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


    def step(self, actions):
        """
        actions: array-like of integer indices, length = num_agents
        Returns:
            obs: jnp.ndarray (num_agents, chunk_size)
            rewards: jnp.ndarray (num_agents,)
            dones: jnp.ndarray (num_agents,)
        """
        if self.current_transcription_target is None:
            raise ValueError("Environment not reset. Call reset() first.")

        guesses = self.current_transcription_guesses
        current_pos = np.vectorize(len)(guesses)
        transcription_complete = current_pos >= len(self.current_transcription_target)

        # Get expected indices for all agents (no list comprehension)
        expected_indices = np.full(self.num_agents, -1, dtype=int)
        not_complete = ~transcription_complete
        valid_pos = current_pos[not_complete]
        expected_indices[not_complete] = self.current_transcription_target_indices_encoded[valid_pos]

        actions = np.array(actions)

        # Determine which agents are correct
        correct = (actions == expected_indices) & not_complete
        rewards = correct.astype(int)

        # Update guesses (append character for correct agents, no list comprehension)
        dictionary = self.character_dictionary
        new_chars = np.empty(self.num_agents, dtype=object)
        new_chars[:] = ''
        new_chars[correct] = np.array(dictionary)[actions[correct]]
        new_guesses = np.where(correct, guesses + new_chars, guesses)

        audio_finished = self.current_audio_timestep + self.chunk_size >= len(self.current_audio_array)
        done = audio_finished | (np.vectorize(len)(new_guesses) >= len(self.current_transcription_target))

        self.current_transcription_guesses = new_guesses
        self.current_audio_timestep += self.chunk_size

        obs = self._get_observation()
        obs = jnp.tile(jnp.array(obs), (self.num_agents, 1))
        rewards = jnp.array(rewards)
        dones = jnp.array(done)

        return obs, rewards, dones
    @property
    def current_transcription_target_indices_encoded(self):
        if not hasattr(self, '_current_transcription_target_indices_encoded_cache') or \
           getattr(self, '_last_transcription_target', None) != self.current_transcription_target:
            dictionary = self.character_dictionary
            char_to_index = {c: i for i, c in enumerate(dictionary)}
            indices = np.fromiter((char_to_index[c] for c in self.current_transcription_target), dtype=int, count=len(self.current_transcription_target))
            self._current_transcription_target_indices_encoded_cache = indices
            self._last_transcription_target = self.current_transcription_target
        return self._current_transcription_target_indices_encoded_cache

    def _get_observation(self):
        """Get the current audio chunk as observation."""
        if self.current_audio_array is None:
            return np.zeros(self.chunk_size, dtype=np.float32)
        start = self.current_audio_timestep
        end = start + self.chunk_size
        audio_len = len(self.current_audio_array)
        if start >= audio_len:
            return np.zeros(self.chunk_size, dtype=np.float32)
        chunk = self.current_audio_array[start:end]
        if len(chunk) < self.chunk_size:
            pad_width = self.chunk_size - len(chunk)
            chunk = np.pad(chunk, (0, pad_width), mode='constant')
        return np.array(chunk, dtype=np.float32)

    def reset(self, seed=None):
        """
        Reset environment by selecting a random sample from available indices.
        Returns tiled initial observation (num_agents, chunk_size)
        """
        if seed is not None:
            random.seed(seed)
        if not self.available_samples:
            raise ValueError("No samples available. Check dataset loading.")
        selected_sample = random.choice(self.available_samples)
        self.current_audio_array = selected_sample['mp3']['array']
        self.current_transcription_target = selected_sample['json']['text']
        self.current_transcription_guesses = np.array(["" for _ in range(self.num_agents)], dtype=object)
        self.current_audio_timestep = 0
        if self.verbose:
            print(f"Reset with sample: '{self.current_transcription_target}'")
            print(f"Audio length: {len(self.current_audio_array)} samples")
            print(f"Target length: {len(self.current_transcription_target)} characters")
        obs = self._get_observation()
        obs = jnp.tile(jnp.array(obs), (self.num_agents, 1))
        return obs

    def play_current_sample_audio(self):
        """Play the current audio sample using pygame."""
        import pygame
        import time
        if self.current_audio_array is None:
            if self.verbose:
                print("No audio sample loaded. Call reset() first.")
            return
        sample_rate = 24000  # Default Emilia dataset sample rate
        for sample in self.available_samples:
            if np.array_equal(sample['mp3']['array'], self.current_audio_array):
                sample_rate = sample['mp3']['sampling_rate']
                break
        pygame.mixer.init(frequency=sample_rate, size=-16, channels=1, buffer=1024)
        audio_int16 = (self.current_audio_array * 32767).astype(np.int16)
        sound = pygame.sndarray.make_sound(audio_int16)
        sound.play()
        duration = len(self.current_audio_array) / sample_rate
        time.sleep(duration)
        pygame.mixer.quit()

    def next_character(self, agent_idx):
        """
        Get the next character for a specific agent.
        Returns None if transcription is already complete for that agent.
        """
        if self.current_transcription_target is None:
            return None
        guess = self.current_transcription_guesses[agent_idx]
        current_pos = len(guess)
        if current_pos >= len(self.current_transcription_target):
            return None
        return self.current_transcription_target[current_pos]

    def numeric_to_character(self, numeric_value):
        """
        Convert a numeric value (index) to a character using the character_dictionary.
        """
        idx = int(numeric_value)
        dictionary = self.character_dictionary
        if idx < 0 or idx >= len(dictionary):
            raise ValueError(f"Index {idx} out of bounds for character dictionary of size {len(dictionary)}")
        return dictionary[idx]
    
    def character_to_numeric(self, character):
        """
        Convert a character to its index in the character_dictionary.
        """
        dictionary = self.character_dictionary
        if not isinstance(character, str) or len(character) != 1:
            raise ValueError(f"character_to_numeric expects single character, got: {character}")
        try:
            return dictionary.index(character)
        except ValueError:
            raise ValueError(f"Character '{character}' not found in character dictionary.")

    @property
    def character_dictionary(self):
        if not hasattr(self, '_character_dictionary_cache'):
            chars = set()
            for sample in self.available_samples:
                chars.update(sample['json']['text'])
            self._character_dictionary_cache = sorted(chars)
        return self._character_dictionary_cache
    
    def was_completed(self, agent_idx):
        """Check if the current transcription guess matches the target for a specific agent."""
        return self.current_transcription_guesses[agent_idx] == self.current_transcription_target



