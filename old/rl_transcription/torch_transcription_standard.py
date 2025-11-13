from environment import TranscriptionEnvironmentSingleInstance
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F

MAX_SAMPLES = 1
CHUNK_SIZE = 256
EMBEDDING_SIZE = 32

class Agent(nn.Module):
    """Given a single chunk, predict a value in [0, 1] for the next character."""
    def __init__(self):
        super(Agent, self).__init__()
        self.model = nn.Sequential(
            nn.Linear(CHUNK_SIZE, EMBEDDING_SIZE),
            nn.ReLU(),
            nn.Linear(EMBEDDING_SIZE, EMBEDDING_SIZE),
            nn.ReLU(),
            nn.Linear(EMBEDDING_SIZE, 1),  # Predict a single value
            nn.Sigmoid(),  # Output in [0, 1]
        )

    def forward(self, obs):
        return self.model(obs)  # shape: (batch_size, 1)

if __name__ == "__main__":
    env = TranscriptionEnvironmentSingleInstance(
        max_samples=MAX_SAMPLES,
        chunk_size=CHUNK_SIZE,
        verbose=False,
    )

    agent = Agent()
    optimizer = optim.Adam(agent.parameters(), lr=1e-3)
    # optimizer = optim.SGD(agent.parameters(), lr=1e-2, momentum=0.9)
    loss_fn = nn.MSELoss()  # Mean Absolute Error

    NUM_EPISODES = 100

    for episode_i in range(NUM_EPISODES):
        obs, info = env.reset()
        while env.done is False:
            optimizer.zero_grad()
            obs_tensor = torch.tensor(obs, dtype=torch.float32).unsqueeze(0)  # Add batch dimension
            pred = agent.forward(obs_tensor).squeeze().item()  # Predicted value in [0, 1]

            dict_size = len(env.character_dictionary)
            pred_int = int(max(0, min(dict_size - 1, int(pred * dict_size))))
            action = env.numeric_to_character(pred_int)
            obs, reward, done, terminal, info = env.step(action)

            expected_character = info.get("expected", None)
            expected_char_int = env.character_dictionary.index(expected_character)
            expected_value = torch.tensor([expected_char_int / dict_size], dtype=torch.float32)
            pred_tensor = agent.forward(obs_tensor).squeeze()
            loss = loss_fn(pred_tensor, expected_value)
            if torch.isnan(loss) or torch.isinf(loss):
                continue
            loss.backward()
            optimizer.step()

        print(f"[ep{episode_i}] Percent completed: {env.get_completion_percent()*100:.2f}%")
