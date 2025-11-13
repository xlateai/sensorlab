from environment import TranscriptionEnvironmentSingleInstance
import torch
from torch.distributions import Beta


MAX_SAMPLES = 1
CHUNK_SIZE = 256
EMBEDDING_SIZE = 8


class Agent:
    """Given a single chunk, predict a Beta distribution over next character.
    """

    def __init__(self):
        # sequential that predicts alpha and beta parameters from chunked input
        self.model = torch.nn.Sequential(
            torch.nn.Linear(CHUNK_SIZE, EMBEDDING_SIZE),
            torch.nn.ReLU(),
            torch.nn.Linear(EMBEDDING_SIZE, 2),  # Predict alpha and beta parameters
            torch.nn.Softplus(),
        )

    def forward(self, obs) -> Beta:
        # obs shape: (batch_size, chunk_size)
        params = self.model(obs)  # shape: (batch_size, 2)
        alpha = torch.clamp(params[:, 0], min=1.0)  # Ensure alpha > 1
        beta = torch.clamp(params[:, 1], min=1.0)   # Ensure beta > 1
        return Beta(alpha, beta)


if __name__ == "__main__":
    env = TranscriptionEnvironmentSingleInstance(
        max_samples=MAX_SAMPLES,
        chunk_size=CHUNK_SIZE,
        verbose=False,
    )

    agent = Agent()

    obs, info = env.reset()
    while env.done is False:
        obs_tensor = torch.tensor(obs, dtype=torch.float32).unsqueeze(0)  # Add batch dimension
        dist = agent.forward(obs_tensor)

        raw_action = dist.sample().squeeze().item()  # Sample and remove batch dimension
        # convert from [0, 1] range to dict_size range
        dict_size = len(env.character_dictionary)
        raw_action = int(max(0, min(dict_size - 1, int(raw_action * dict_size))))

        action = env.numeric_to_character(raw_action)
        obs, reward, done, terminal, info = env.step(action)
        print(raw_action, action, reward)
        # print(f"Action: {action}, Reward: {reward}, Done: {done}")