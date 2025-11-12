import jax
import jax.numpy as jnp
from parameter_group import LinearLayerParamGroup
from environment import TranscriptionEnvironmentSingleInstance

# Parameters
CHUNK_SIZE = 256


class TranscriptionAgentGroup:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int):
        self.num_agents = num_agents

        self.env = TranscriptionEnvironmentSingleInstance(chunk_size=chunk_size, max_samples=1)
        self.env.reset()

        self.layer1 = LinearLayerParamGroup(key, num_agents, chunk_size, embedding_size)
        self.layer2 = LinearLayerParamGroup(key, num_agents, embedding_size, embedding_size)
        self.layer3 = LinearLayerParamGroup(key, num_agents, embedding_size, 1)

    def step(self):
        x = jnp.tile(self.env.observation, (agents.num_agents, 1))
        h1 = self.layer1.forward(x)
        h2 = self.layer2.forward(h1)
        out = self.layer3.forward(h2)
        reward = self.env.step(out[0])[1]
        return reward

# Initialize param groups (3 layers)
key = jax.random.PRNGKey(0)

agents = TranscriptionAgentGroup(
    key,
    num_agents=64,
    input_size=CHUNK_SIZE,
    embedding_size=32,
)

print(agents.step())