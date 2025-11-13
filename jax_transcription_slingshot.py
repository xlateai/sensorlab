import jax
import jax.numpy as jnp
from parameter_group import LinearLayerParamGroup
from vec_environment import TranscriptionVecEnv

key = jax.random.PRNGKey(0)

NUM_AGENTS = 32

CHUNK_SIZE = 512
EMBEDDING_SIZE = 8

MAX_SAMPLES = 1

# max multiplier for slingshot update
MAX_SCALE = 3.0
MIN_SCALE = 1.1

NUM_EPISODES = 1000
KEEP_TOP_PERCENT = 0.1


class Agents:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int, ):
        self.num_agents = num_agents
        self.key = key
        self.layer1 = LinearLayerParamGroup(key, num_agents, chunk_size, embedding_size)
        self.layer2 = LinearLayerParamGroup(key, num_agents, embedding_size, embedding_size)
        self.layer3 = LinearLayerParamGroup(key, num_agents, embedding_size, 1)
        self.groups = [self.layer1, self.layer2, self.layer3]

    def forward(self, obs):
        h1 = self.layer1.forward(obs)
        h1 = jax.nn.relu(h1)
        h2 = self.layer2.forward(h1)
        h2 = jax.nn.relu(h2)
        out = self.layer3.forward(h2)
        out = jnp.clip(out, 0.0, 1.0)
        return out


class TranscriptionAgentGroup:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int, verbose: bool = False):
        self.verbose = verbose
        self.agents = Agents(key=key, num_agents=num_agents, chunk_size=chunk_size, embedding_size=embedding_size)
        self.env = TranscriptionVecEnv(num_agents=num_agents, chunk_size=chunk_size, max_samples=MAX_SAMPLES)

    def reset(self):
        obs = self.env.reset()
        return obs

    def step(self, actions):
        obs, rewards, dones = self.env.step(actions)
        return obs, rewards, dones

    def episode(self):
        self.episodic_rewards = jnp.zeros(self.num_agents)
        obs = self.reset()
        step_count = 0
        dones = jnp.array([False] * NUM_AGENTS)
        dictionary = self.env.character_dictionary
        dict_size = len(dictionary)
        while not jnp.all(dones):
            out = self.agents.forward(obs)
            # Convert model output to integer indices, then to characters using the dictionary
            # Use argmax if output is a vector, or scale if output is scalar

            if out.shape[1] == 1:
                # Scalar output: scale to [0, dict_size-1]
                indices = jnp.clip((out.flatten() * dict_size).astype(int), 0, dict_size - 1)
            else:
                # Vector output: use argmax
                indices = jnp.argmax(out, axis=1)
                raise ValueError("Output shape not recommended (yet)")
            
            actions = [self.env.numeric_to_character(idx) for idx in indices]
            # print(actions)
            obs, rewards, dones = self.step(actions)
            step_count += 1

            if self.verbose:
                print(f"Step {step_count}")
                print("actions:", actions)
                print("rewards:", rewards)
                print("dones:", dones)

            self.episodic_rewards += rewards * (~dones)

        return self.episodic_rewards
    
    def update_parameters(self):
        self.key, skey = jax.random.split(self.key, 2)

        # basically, we start by finding the deltas between all agents and
        # the best agent
        best_agent_i = jnp.argmax(self.episodic_rewards)



        # now, let's use these gradients to slingshot the worst agents towards and past
        # the best agent
        # first, let's generate random scales or learning rates per agent
        scales = jax.random.uniform(skey, (self.num_agents,)) * (MAX_SCALE - MIN_SCALE) + MIN_SCALE

        # now, we can compute the new weights for each group


agents = TranscriptionAgentGroup(
    key,
    num_agents=NUM_AGENTS,
    chunk_size=CHUNK_SIZE,
    embedding_size=EMBEDDING_SIZE,
)

print("character dictionary")
print(agents.env.character_dictionary)

for episode_i in range(NUM_EPISODES):
    episodic_rewards = agents.episode()
    
    # print max, min, and mean episodic rewards
    max_reward = jnp.max(episodic_rewards)
    min_reward = jnp.min(episodic_rewards)
    mean_reward = jnp.mean(episodic_rewards)

    # print the number that cloned
    print()
    print(f"Episode {episode_i}: Max Reward: {max_reward}/{len(agents.env.current_transcription_target)}, Min Reward: {min_reward}, Mean Reward: {mean_reward}")
    print(f"Best complete percent: {max_reward/len(agents.env.current_transcription_target)*100:.2f}%")

    agents.update_parameters()

    print(f"Number of agents that cloned: {jnp.sum(agents.will_clone)} out of {NUM_AGENTS}")
