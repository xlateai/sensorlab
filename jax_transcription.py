import jax
import jax.numpy as jnp
from parameter_group import LinearLayerParamGroup
from vec_environment import TranscriptionVecEnv

key = jax.random.PRNGKey(0)

NUM_AGENTS = 16
CHUNK_SIZE = 1024
EMBEDDING_SIZE = 32
MAX_SAMPLES = 1


class TranscriptionAgentGroup:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int):
        self.num_agents = num_agents

        self.layer1 = LinearLayerParamGroup(key, num_agents, chunk_size, embedding_size)
        self.layer2 = LinearLayerParamGroup(key, num_agents, embedding_size, embedding_size)
        self.layer3 = LinearLayerParamGroup(key, num_agents, embedding_size, 1)

        # Debug: print random distances
        # print("random distances:", self.random_distances())
        # exit()

        self.env = TranscriptionVecEnv(num_agents=num_agents, chunk_size=chunk_size, max_samples=MAX_SAMPLES)

    def reset(self):
        obs = self.env.reset()
        return obs

    def forward(self, obs):
        h1 = self.layer1.forward(obs)
        h1 = jax.nn.relu(h1)
        h2 = self.layer2.forward(h1)
        h2 = jax.nn.relu(h2)
        out = self.layer3.forward(h2)
        out = jax.nn.sigmoid(out)
        return out

    def step(self, actions):
        obs, rewards, dones = self.env.step(actions)
        return obs, rewards, dones
    
    def random_distances(self):
        # generate random pairs of indices for all agents
        self._pair_indices = jax.random.randint(jax.random.PRNGKey(0), (self.num_agents, 2), 0, self.num_agents)
        
        # now, sum the distances for each layer
        d1 = self.layer1.distances(self._pair_indices)
        d2 = self.layer2.distances(self._pair_indices)
        d3 = self.layer3.distances(self._pair_indices)

        return (d1 + d2 + d3) / 3.0

    def episode(self):
        obs = self.reset()
        step_count = 0
        dones = jnp.array([False] * NUM_AGENTS)
        while not jnp.all(dones):
            out = self.forward(obs)
            actions = [chr(int(jnp.clip(jnp.argmax(out[i]), 32, 126))) for i in range(NUM_AGENTS)]
            obs, rewards, dones = self.step(actions)
            step_count += 1
            print(f"Step {step_count}")
            print("actions:", actions)
            print("rewards:", rewards)
            print("dones:", dones)

# Initialize param groups (3 layers)

agents = TranscriptionAgentGroup(
    key,
    num_agents=NUM_AGENTS,
    chunk_size=CHUNK_SIZE,
    embedding_size=EMBEDDING_SIZE,
)


agents.episode()