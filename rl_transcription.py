from environment import TranscriptionEnvironmentSingleInstance
import torch
import numpy as np
from typing import Union
from torch.distributions import Categorical


class Agent(torch.nn.Module):
    def __init__(
        self,
        env: TranscriptionEnvironmentSingleInstance,
        chunk_size: int,
        embedding_size: int = 32,
    ):
        super(Agent, self).__init__()

        self.chunk_size = chunk_size
        
        # let's initialize a sequential model
        self.embedding_model = torch.nn.Sequential(
            torch.nn.Linear(chunk_size, embedding_size),
            torch.nn.ReLU(),
            torch.nn.Linear(embedding_size, embedding_size),
            torch.nn.ReLU(),
            torch.nn.Linear(embedding_size, embedding_size),
            torch.nn.ReLU(),
        )

        num_possible_characters = len(env.character_dictionary) + 1  # +1 for no-op
        self.action_head = torch.nn.Sequential(
            torch.nn.Linear(embedding_size, embedding_size),
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
    VERBOSE = False
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(
        max_samples=1,
        chunk_size=512,
        incorrect_reward=-0.1,
    )
    agent = Agent(env, chunk_size=env.chunk_size)
    optimizer = torch.optim.Adam(agent.parameters(), lr=0.0001)
    
    for episode_i in range(NUM_EPISODES := 10_000):
        obs, info = env.reset()

        # can play audio like this
        # env.play_current_sample_audio()

        total_rewards = 0
        total_entropy = 0
        total_steps = 0

        while not env.done:
            # Random action - pick a random UTF-8 character from the massive space
            # UTF-8 can represent ~1.1 million characters, let's sample from a reasonable range
            # random_unicode_point = random.randint(32, 65535)  # Basic Multilingual Plane (most common chars)
            # choose from character dictionary indices
            # dict_size = len(env.character_dictionary)
            # random_char = env.numeric_to_character(random_index)

            dist = agent.forward(obs)
            # print(dist.probs)
            char_index = dist.sample()
            action = char_index.item()  # Pass integer action directly
            obs, reward, done, truncated, info = env.step(action)

            # For display, show the character if not a no-op
            # if action == 0:
                # action_str = "<NO-OP>"
            # else:
                # action_str = env.numeric_to_character(action)
            # print(action_str, reward, info.get("expected", ""))

            loss = -dist.log_prob(char_index) * reward  # Policy gradient loss
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            # print the correct string
            total_rewards += reward
            total_steps += 1
            total_entropy += dist.entropy().item()

            if VERBOSE:
                print(env.current_transcription_guess, f"| total reward: {total_rewards:0.4f}", f"| loss: {loss.item():0.4f}")

            if done:
                break

        print(f"[{episode_i}]: cumrw: {total_rewards:0.2f}, compl: {env.get_completion_percent()*100:0.2f}%, entr: {total_entropy/total_steps:0.4f}, noops: {env.total_noop_actions}, incorr: {env.total_incorrect_actions}")