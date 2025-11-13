from environment import TranscriptionEnvironmentSingleInstance
import torch
import numpy as np
from typing import Union
from torch.distributions import Categorical


class Agent:
    def __init__(
        self,
        env: TranscriptionEnvironmentSingleInstance,
        chunk_size: int,
        embedding_size: int = 32,
    ):
        self.chunk_size = chunk_size
        
        # let's initialize a sequential model
        self.embedding_model = torch.nn.Sequential(
            torch.nn.Linear(chunk_size, embedding_size),
            torch.nn.ReLU(),
            torch.nn.Linear(embedding_size, embedding_size),
            torch.nn.ReLU(),
            torch.nn.Linear(embedding_size, embedding_size * 2),
            torch.nn.ReLU(),
        )

        num_possible_characters = len(env.character_dictionary)# + 1  # +1 for no-op
        self.action_head = torch.nn.Sequential(
            torch.nn.Linear(embedding_size * 2, embedding_size),
            torch.nn.ReLU(),
            torch.nn.Linear(embedding_size, num_possible_characters),
        )

    def forward(self, observation_chunk: Union[torch.Tensor, np.ndarray]) -> Categorical:
        if isinstance(observation_chunk, np.ndarray):
            observation_chunk = torch.tensor(observation_chunk, dtype=torch.float32)
        assert observation_chunk.squeeze().shape == (self.chunk_size,), f"Expected observation chunk shape ({self.chunk_size},), got: {observation_chunk.squeeze().shape}"
        embedding = self.embedding_model(observation_chunk)
        action_logits = self.action_head(embedding)
        return Categorical(logits=action_logits)


if __name__ == "__main__":
    import string
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(max_samples=1, chunk_size=512, verbose=False)
    agent = Agent(env, chunk_size=env.chunk_size)
    
    # Reset to get a sample
    obs, info = env.reset()
    
    # Play the audio
    # env.play_current_sample_audio()
    
    # Take random steps until episode terminates
    step_count = 0
    done = False
    
    while not done:
        step_count += 1
        # Random action - pick a random UTF-8 character from the massive space
        # UTF-8 can represent ~1.1 million characters, let's sample from a reasonable range
        # random_unicode_point = random.randint(32, 65535)  # Basic Multilingual Plane (most common chars)
        # choose from character dictionary indices
        # dict_size = len(env.character_dictionary)
        # random_char = env.numeric_to_character(random_index)

        dist = agent.forward(obs)
        # print(dist.probs)
        char_index = dist.sample()
        # print(char_index)
        action = env.numeric_to_character(char_index.item())
        obs, reward, done, truncated, info = env.step(action)

        print(action, reward, info["expected"])
        
        if done:
            break