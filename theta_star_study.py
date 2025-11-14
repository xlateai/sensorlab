import jax
import jax.numpy as jnp
from audiolab.rl.parameter_group import LinearLayerParamGroup
from audiolab.rl.transcription.env.vec_environment import TranscriptionVecEnv

key = jax.random.PRNGKey(0)

MAX_SAMPLES = 1

NUM_AGENTS = 128

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


class TranscriptionAgentGroup:
    def __init__(self, key: jax.random.PRNGKey, num_agents: int, chunk_size: int, embedding_size: int, verbose: bool = False):
        self.key, skey = jax.random.split(key, 2)
        self.verbose = verbose
        self.agents = Agents(key=skey, num_agents=num_agents, chunk_size=chunk_size, embedding_size=embedding_size)
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

print("character dictionary")
print(trainer.env.character_dictionary)

for episode_i in range(NUM_EPISODES):
    episodic_rewards = trainer.episode()
    
    # print max, min, and mean episodic rewards
    max_reward = jnp.max(episodic_rewards)
    min_reward = jnp.min(episodic_rewards)
    mean_reward = jnp.mean(episodic_rewards)

    # print the number that cloned
    print(trainer.agents)
    print(f"Episode {episode_i}: Max Reward: {max_reward}/{len(trainer.env.current_transcription_target)}, Min Reward: {min_reward}, Mean Reward: {mean_reward}")
    print(f"Best complete percent: {max_reward/len(trainer.env.current_transcription_target)*100:.2f}%")