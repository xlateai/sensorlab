import jax
import jax.numpy as jnp
from parameter_group import LinearLayerParamGroup
from vec_environment import TranscriptionVecEnv

# Parameters
CHUNK_SIZE = 256
MAX_SAMPLES = 1


class TranscriptionAgentGroup:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int):
        self.num_agents = num_agents
        self.env = TranscriptionVecEnv(num_agents=num_agents, chunk_size=chunk_size, max_samples=MAX_SAMPLES)
        self.layer1 = LinearLayerParamGroup(key, num_agents, chunk_size, embedding_size)
        self.layer2 = LinearLayerParamGroup(key, num_agents, embedding_size, embedding_size)
        self.layer3 = LinearLayerParamGroup(key, num_agents, embedding_size, 1)

    def reset(self):
        obs = self.env.reset()
        return obs

    def forward(self, obs):
        h1 = self.layer1.forward(obs)
        h2 = self.layer2.forward(h1)
        out = self.layer3.forward(h2)
        return out

    def step(self, actions):
        obs, rewards, dones = self.env.step(actions)
        return obs, rewards, dones

# Initialize param groups (3 layers)
key = jax.random.PRNGKey(0)
num_agents = 8
chunk_size = CHUNK_SIZE
embedding_size = 32

agents = TranscriptionAgentGroup(
    key,
    num_agents=num_agents,
    chunk_size=chunk_size,
    embedding_size=embedding_size,
)

obs = agents.reset()
out = agents.forward(obs)
# Convert model output to character actions (simple argmax to int, then chr)
actions = [chr(int(jnp.clip(jnp.argmax(out[i]), 32, 126))) for i in range(num_agents)]
obs, rewards, dones = agents.step(actions)
print("rewards:", rewards)
print("dones:", dones)