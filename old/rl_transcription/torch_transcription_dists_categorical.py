from environment import TranscriptionEnvironmentSingleInstance
import torch
from torch.distributions import Categorical


MAX_SAMPLES = 8
CHUNK_SIZE = 256
EMBEDDING_SIZE = 16



class Agent(torch.nn.Module):
    """Given a single chunk, predict a categorical distribution over next character (dictionary index)."""

    def __init__(self, dict_size):
        super(Agent, self).__init__()
        self.model = torch.nn.Sequential(
            torch.nn.Linear(CHUNK_SIZE, EMBEDDING_SIZE),
            torch.nn.ReLU(),
            torch.nn.Linear(EMBEDDING_SIZE, EMBEDDING_SIZE),
            torch.nn.ReLU(),
            torch.nn.Linear(EMBEDDING_SIZE, dict_size),  # Predict logits for each character
        )
        self.dict_size = dict_size

    def forward(self, obs):
        # obs shape: (batch_size, chunk_size)
        logits = self.model(obs)  # shape: (batch_size, dict_size)
        return Categorical(logits=logits)


if __name__ == "__main__":
    env = TranscriptionEnvironmentSingleInstance(
        max_samples=MAX_SAMPLES,
        chunk_size=CHUNK_SIZE,
        verbose=False,
        incorrect_reward=-0.1,
    )

    dict_size = len(env.character_dictionary)
    agent = Agent(dict_size)
    optimizer = torch.optim.Adam(agent.parameters(), lr=0.001)

    NUM_EPISODES = 100

    GREEDY = False

    for episode_i in range(NUM_EPISODES):
        obs, info = env.reset()
        while env.done is False:
            optimizer.zero_grad()

            obs_tensor = torch.tensor(obs, dtype=torch.float32).unsqueeze(0)  # Add batch dimension
            dist = agent.forward(obs_tensor)

            if GREEDY:
                action_idx = dist.probs.argmax(dim=-1).squeeze().item()
            else:
                raw_action = dist.sample()
                action_idx = raw_action.squeeze().item()  # Sample index

            action = env.numeric_to_character(action_idx)
            obs, reward, done, terminal, info = env.step(action)

            expected_character = info.get("expected", None)
            if expected_character is not None:
                expected_char_int = env.character_dictionary.index(expected_character)
                target = torch.tensor([expected_char_int], dtype=torch.long)
                
                if GREEDY:
                    target_log_prob = dist.log_prob(target)
                    loss = -target_log_prob
                else:
                    guess_log_prob = dist.log_prob(raw_action)
                    loss = -guess_log_prob * reward

                if torch.isnan(loss) or torch.isinf(loss):
                    continue
                loss.backward()
                optimizer.step()

        print(f"[ep{episode_i}] Percent completed: {env.get_completion_percent()*100:.2f}%")