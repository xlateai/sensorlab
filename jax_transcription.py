import jax
import jax.numpy as jnp
from parameter_group import LinearLayerParamGroup
from vec_environment import TranscriptionVecEnv

key = jax.random.PRNGKey(0)

NUM_AGENTS = 16
CHUNK_SIZE = 1024
EMBEDDING_SIZE = 32
MAX_SAMPLES = 1
FMC_BALANCE = 1.0
KEEP_TOP_PERCENT = 0.2


def relativize(vector: jnp.ndarray):
    std = vector.std()
    if std == 0:
        return jnp.ones(len(vector))
    standard = (vector - vector.mean()) / std
    standard = standard.at[standard > 0].set(jnp.log(1 + standard[standard > 0]) + 1)
    standard = standard.at[standard <= 0].set(jnp.exp(standard[standard <= 0]))
    return standard


class TranscriptionAgentGroup:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int):
        self.num_agents = num_agents

        self.key = key
        self.layer1 = LinearLayerParamGroup(key, num_agents, chunk_size, embedding_size)
        self.layer2 = LinearLayerParamGroup(key, num_agents, embedding_size, embedding_size)
        self.layer3 = LinearLayerParamGroup(key, num_agents, embedding_size, 1)
        self.groups = [self.layer1, self.layer2, self.layer3]

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
        self.key, skey = jax.random.split(self.key, 2)
        self._pair_indices = jax.random.randint(skey, (self.num_agents,), 0, self.num_agents)
        
        # now, sum the distances for each layer
        d1 = self.layer1.distances(self._pair_indices)
        d2 = self.layer2.distances(self._pair_indices)
        d3 = self.layer3.distances(self._pair_indices)

        return (d1 + d2 + d3) / 3.0
    
    def clone(self, clone_indices: jnp.ndarray, partner_indices: jnp.ndarray):
        for group in self.groups:
            group.clone(clone_indices, partner_indices)

    def episode(self):
        self.episodic_rewards = jnp.zeros(self.num_agents)
        
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

            self.episodic_rewards += rewards * (~dones)

        return self.episodic_rewards
    
    def calculate_virtual_rewards(self):
        # first, we measure the euclidean distance between each of the parents.
        pair_distances = self.random_distances()
        rel_dists = relativize(pair_distances)
        scores = relativize(self.episodic_rewards) ** FMC_BALANCE
        return scores * rel_dists
    
    def update_parameters(self):
        # let's use FMC to update the paramters
        # observing random distances also assigns _pair_indices
        
        vr = self.calculate_virtual_rewards()
        partner_vr = vr[self._pair_indices]

        print(vr)
        print(partner_vr)

        value = (partner_vr - vr) / jnp.where(vr > 0, vr, 1e-8)

        self.key, skey = jax.random.split(self.key, 2)

        # randomly clone based on their virtual rewards
        r = jax.random.uniform(skey, (self.num_agents, ))
        will_clone = value >= r

        # do not clone the top agents
        top_agent_indices = self.episodic_rewards.argsort()[-int(self.num_agents * KEEP_TOP_PERCENT):]
        arange = jnp.arange(self.num_agents)
        will_clone = jnp.where(jnp.isin(arange, top_agent_indices), False, will_clone)
        
        # now, extract the indices of the agents that will clone from `will_clone`
        clone_indices = arange[will_clone]
        partner_indices = self._pair_indices[will_clone]

        # now, the agents that will clone will take their partner's weights/biases (then mutate)
        self.clone(clone_indices, partner_indices)  # should also mutate


agents = TranscriptionAgentGroup(
    key,
    num_agents=NUM_AGENTS,
    chunk_size=CHUNK_SIZE,
    embedding_size=EMBEDDING_SIZE,
)

episodic_rewards = agents.episode()
print(episodic_rewards)

agents.update_parameters()