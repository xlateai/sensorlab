import jax
import jax.numpy as jnp
from audiolab.rl.parameter_group import LinearLayerParamGroup
from audiolab.rl.transcription.env.vec_environment import TranscriptionVecEnv

key = jax.random.PRNGKey(0)

MAX_SAMPLES = 1

NUM_AGENTS = 16

CHUNK_SIZE = 256
EMBEDDING_SIZE = 16

NUM_EPISODES = 1000


class Agents:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int):
        self.key = key
        self.num_agents = num_agents
        self.chunk_size = chunk_size
        self.embedding_size = embedding_size

        self.groups = [
            LinearLayerParamGroup(key, num_agents, chunk_size, embedding_size),
            LinearLayerParamGroup(key, num_agents, embedding_size, embedding_size),
            LinearLayerParamGroup(key, num_agents, embedding_size, 1),
        ]


    def forward(self, obs):
        out = obs
        for group in self.groups:
            out = group.forward(out)
            out = jax.nn.relu(out)
        out = jnp.clip(out, 0.0, 1.0)
        return out
    
   
    def __str__(self):
        s = ""

        # start by describing the average distance between agents by finding
        # the average weights and then computing the distance of each agent to that average
        # and then averaging those distances
        total_parameter_distance = 0.0
        for i, group in enumerate(self.groups):
            avg_weights = jnp.mean(group.weights, axis=0)
            avg_biases = jnp.mean(group.biases, axis=0)
            weight_dists = jnp.linalg.norm(group.weights - avg_weights, axis=(1,2))
            bias_dists = jnp.linalg.norm(group.biases - avg_biases, axis=1)
            mean_weight_dist = jnp.mean(weight_dists)
            mean_bias_dist = jnp.mean(bias_dists)
            total_parameter_distance += mean_weight_dist + mean_bias_dist

        s += f"Average parameter distance between agents: {total_parameter_distance:.4f}\n"
        for i, group in enumerate(self.groups):
            s += f"Layer {i+1}:\n"
            s += f"  Weights - mean: {jnp.mean(group.weights):.4f}, min: {jnp.min(group.weights):.4f}, max: {jnp.max(group.weights):.4f}, sum: {jnp.sum(group.weights):.4f}\n"
            s += f"  Biases  - mean: {jnp.mean(group.biases):.4f}, min: {jnp.min(group.biases):.4f}, max: {jnp.max(group.biases):.4f}, sum: {jnp.sum(group.biases):.4f}\n"
        
        return s
    
    def evaluate_theta_star(self, episodic_rewards: jnp.ndarray):
        """The "theta-star" of a set of agents is a single agent formed
        by averaging the parameters of all agents in the group, weighted by
        their episodic rewards.
        """

        # let's begin by normalizing the episodic rewards to sum to 1.0
        reward_sum = jnp.sum(episodic_rewards) + 1e-8
        normalized_rewards = episodic_rewards / reward_sum

        theta_star_parameters = []

        for group in self.groups:
            # compute the weighted average of the weights and biases
            weighted_avg_weights = jnp.tensordot(normalized_rewards, group.weights, axes=1)
            weighted_avg_biases = jnp.tensordot(normalized_rewards, group.biases, axes=1)

            # set all agents' weights and biases to the weighted average
            group.weights = jnp.tile(weighted_avg_weights[None, :, :], (self.num_agents, 1, 1))
            group.biases = jnp.tile(weighted_avg_biases[None, :], (self.num_agents, 1))

            theta_star_parameters.append((weighted_avg_weights, weighted_avg_biases))

        return theta_star_parameters


class TranscriptionAgentGroup:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int, verbose: bool = False):
        self.key, skey = jax.random.split(key, 2)
        self.verbose = verbose
        self.agents = Agents(key=skey, num_agents=num_agents, chunk_size=chunk_size, embedding_size=embedding_size)
        # Initialize next_agents with all weights and biases set to zero
        zero_key = jax.random.PRNGKey(42)
        self.next_agents = Agents(key=zero_key, num_agents=num_agents, chunk_size=chunk_size, embedding_size=embedding_size)
        for group in self.next_agents.groups:
            group.weights = jnp.zeros_like(group.weights)
            group.biases = jnp.zeros_like(group.biases)
        self.env = TranscriptionVecEnv(num_agents=num_agents, chunk_size=chunk_size, max_samples=MAX_SAMPLES)

    def reset(self):
        obs = self.env.reset()
        return obs

    def step(self, actions):
        obs, rewards, dones = self.env.step(actions)
        return obs, rewards, dones

    def episode(self):
        self.episodic_rewards = jnp.zeros(self.agents.num_agents)
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

trainer = TranscriptionAgentGroup(
    key,
    num_agents=NUM_AGENTS,
    chunk_size=CHUNK_SIZE,
    embedding_size=EMBEDDING_SIZE,
)

trainer.env.reset()
print("sentence being transcribed:", trainer.env.current_transcription_target)


print("character dictionary")
print(trainer.env.character_dictionary)

# Hardcoded experiment: collect theta stars from k random networks

# Refactored experiment: two trainers, granular reward collection, single theta-star evaluation
k = NUM_AGENTS
random_episode_rewards_matrix = []  # shape: [k, NUM_AGENTS]
theta_star_performances = []        # shape: [k]

# Create two trainers
trainer = TranscriptionAgentGroup(
    key,
    num_agents=NUM_AGENTS,
    chunk_size=CHUNK_SIZE,
    embedding_size=EMBEDDING_SIZE,
)

zero_key = jax.random.PRNGKey(42)
trainer_star = TranscriptionAgentGroup(
    zero_key,
    num_agents=NUM_AGENTS,
    chunk_size=CHUNK_SIZE,
    embedding_size=EMBEDDING_SIZE,
)
# Zero out trainer_star agents
for group in trainer_star.agents.groups:
    group.weights = jnp.zeros_like(group.weights)
    group.biases = jnp.zeros_like(group.biases)

print("Generating theta stars:")
for i in range(k):
    # Progress bar
    bar_len = 30
    progress = int(bar_len * (i + 1) / k)
    bar = '[' + '#' * progress + '-' * (bar_len - progress) + f'] {i+1}/{k}'
    print(f'\r{bar}', end='')

    # Randomize trainer agents
    new_key = jax.random.PRNGKey(i)
    trainer.agents = Agents(key=new_key, num_agents=NUM_AGENTS, chunk_size=CHUNK_SIZE, embedding_size=EMBEDDING_SIZE)
    # Run episode and collect granular rewards
    episodic_rewards = trainer.episode()  # shape: [NUM_AGENTS]
    random_episode_rewards_matrix.append(episodic_rewards)
    # Calculate theta_star
    theta_star_params = trainer.agents.evaluate_theta_star(episodic_rewards)
    # Store theta_star in trainer_star at index i
    for group_idx, (weights, biases) in enumerate(theta_star_params):
        trainer_star.agents.groups[group_idx].weights = trainer_star.agents.groups[group_idx].weights.at[i].set(weights)
        trainer_star.agents.groups[group_idx].biases = trainer_star.agents.groups[group_idx].biases.at[i].set(biases)
print()  # Newline after progress bar


    # ...existing code...

# Print results
print("\nRandom network episode performances (per agent, k x n):")
for i, rewards in enumerate(random_episode_rewards_matrix):
    print(f"RandomNet {i}: {rewards}")

# Final evaluation: run one episode for all theta-star agents
final_theta_star_rewards = trainer_star.episode()
print("\nFinal theta-star evaluation (episodic rewards per agent):")
print(final_theta_star_rewards)