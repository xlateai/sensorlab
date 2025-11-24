import wandb
from audiolab.rl.transcription.env.environment import TranscriptionEnvironmentSingleInstance
import torch
import numpy as np
from typing import Union
from torch.distributions import Categorical


class Agent(torch.nn.Module):
    def __init__(
        self,
        env: TranscriptionEnvironmentSingleInstance,
        chunk_size: int,
        embedding_size: int = 4,
    ):
        super(Agent, self).__init__()

        self.chunk_size = chunk_size
        
        # let's initialize a sequential model
        self.embedding_model = torch.nn.Sequential(
            torch.nn.Linear(chunk_size, chunk_size // 2),
            torch.nn.ReLU(),
            torch.nn.Linear(chunk_size // 2, embedding_size),
            torch.nn.ReLU(),
        )

        self.last_embedding = torch.zeros((embedding_size,), dtype=torch.float32)
        self.memory_cell_combiner = torch.nn.Sequential(
            torch.nn.Linear(embedding_size * 2, embedding_size),
            torch.nn.ReLU(),
        )

        num_possible_characters = len(env.character_dictionary) + 1  # +1 for no-op
        self.action_head = torch.nn.Sequential(
            torch.nn.Linear(embedding_size, num_possible_characters),
        )

    def forward(self, observation_chunk: Union[torch.Tensor, np.ndarray]) -> Categorical:
        if isinstance(observation_chunk, np.ndarray):
            observation_chunk = torch.tensor(observation_chunk, dtype=torch.float32)
        assert observation_chunk.squeeze().shape == (self.chunk_size,), f"Expected observation chunk shape ({self.chunk_size},), got: {observation_chunk.squeeze().shape}"
        embedding = self.embedding_model(observation_chunk)
        combined_embedding = torch.cat([embedding, self.last_embedding], dim=-1)
        combined_embedding = self.memory_cell_combiner(combined_embedding)
        self.last_embedding = combined_embedding.detach()
        action_logits = self.action_head(combined_embedding)
        return Categorical(logits=action_logits)


if __name__ == "__main__":
    USE_WANDB = True
    VERBOSE = False
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(
        max_samples=1,
        chunk_size=256,
        incorrect_reward=0.0,
        # incorrect_reward=-0.1,
    )
    agent = Agent(env, chunk_size=env.chunk_size)
    optimizer = torch.optim.Adam(agent.parameters(), lr=0.001)
    
    if USE_WANDB:
        wandb.init(project="audiolab-rl-transcription")

    for episode_i in range(NUM_EPISODES := 10_000):
        obs, info = env.reset()

        total_rewards = 0
        total_entropy = 0
        total_steps = 0

        while not env.done:
            dist = agent.forward(obs)
            char_index = dist.sample()
            action = char_index.item()
            obs, reward, done, truncated, info = env.step(action)

            loss = -dist.log_prob(char_index) * reward  # Policy gradient loss
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            total_rewards += reward
            total_steps += 1
            total_entropy += dist.entropy().item()

            if VERBOSE:
                print(env.current_transcription_guess, f"| total reward: {total_rewards:0.4f}", f"| loss: {loss.item():0.4f}")

            if done:
                break

        compl = env.get_completion_percent()*100
        entr = total_entropy/total_steps if total_steps > 0 else 0.0
        noops = env.total_noop_actions
        incorr = env.total_incorrect_actions
        print(f"[{episode_i}]: cumrw: {total_rewards:0.2f}, compl: {compl:0.2f}%, entr: {entr:0.4f}, noops: {noops}, incorr: {incorr}")

        if USE_WANDB:
            wandb.log({
                "episode": episode_i,
                "cum_reward": total_rewards,
                "completion_percent": compl,
                "avg_entropy": entr,
                "total_noop_actions": noops,
                "total_incorrect_actions": incorr,
            })

    if USE_WANDB:
        wandb.finish()