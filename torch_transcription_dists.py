from environment import TranscriptionEnvironmentSingleInstance
import torch
from torch.distributions import Beta


MAX_SAMPLES = 1
CHUNK_SIZE = 256
EMBEDDING_SIZE = 32


class Agent(torch.nn.Module):
    """Given a single chunk, predict a Beta distribution over next character.
    """

    def __init__(self):
        super(Agent, self).__init__()

        # sequential that predicts alpha and beta parameters from chunked input
        self.model = torch.nn.Sequential(
            torch.nn.Linear(CHUNK_SIZE, EMBEDDING_SIZE),
            torch.nn.ReLU(),
            torch.nn.Linear(EMBEDDING_SIZE, EMBEDDING_SIZE),
            torch.nn.ReLU(),
            torch.nn.Linear(EMBEDDING_SIZE, 2),  # Predict alpha and beta parameters
            torch.nn.Softplus(),
        )

    def forward(self, obs) -> Beta:
        # obs shape: (batch_size, chunk_size)
        params = self.model(obs)  # shape: (batch_size, 2)
        alpha = torch.clamp(params[:, 0], min=1.001)  # Ensure alpha > 1
        beta = torch.clamp(params[:, 1], min=1.001)   # Ensure beta > 1
        return Beta(alpha, beta)


if __name__ == "__main__":
    env = TranscriptionEnvironmentSingleInstance(
        max_samples=MAX_SAMPLES,
        chunk_size=CHUNK_SIZE,
        verbose=False,
    )

    agent = Agent()
    optimizer = torch.optim.Adam(agent.parameters(), lr=1e-3)

    NUM_EPISODES = 100

    for episode_i in range(NUM_EPISODES):
        obs, info = env.reset()
        while env.done is False:
            optimizer.zero_grad()
            
            obs_tensor = torch.tensor(obs, dtype=torch.float32).unsqueeze(0)  # Add batch dimension
            dist = agent.forward(obs_tensor)

            raw_action = dist.sample().squeeze().item()  # Sample and remove batch dimension

            # greedy action sample
            # raw_action = dist.mean.squeeze().item()
            # print("mean =", raw_action)
            # print("mode =", dist.mode.squeeze().item())

            # convert from [0, 1] range to dict_size range
            dict_size = len(env.character_dictionary)
            raw_action = int(max(0, min(dict_size - 1, int(raw_action * dict_size))))

            action = env.numeric_to_character(raw_action)
            obs, reward, done, terminal, info = env.step(action)

            expected_character = info.get("expected", None)
            expected_char_int = env.character_dictionary.index(expected_character)

            # print(raw_action, action, reward, expected_character)

            # [0, 1] range for log prob of Beta distribution
            expected_raw_distributional_value = torch.tensor([[expected_char_int / dict_size]], dtype=torch.float32)
            target_log_prob = dist.log_prob(expected_raw_distributional_value)
            # print(dist.concentration1, dist.concentration0)
            # print(target_log_prob.item(), expected_raw_distributional_value.item())

            # print(f"Action: {action}, Reward: {reward}, Done: {done}")
            loss = -target_log_prob
            # skip if loss is nan or inf
            if torch.isnan(loss) or torch.isinf(loss):
                continue
            loss.backward()
            optimizer.step()

        print(f"[ep{episode_i}] Percent completed: {env.get_completion_percent()*100:.2f}%")