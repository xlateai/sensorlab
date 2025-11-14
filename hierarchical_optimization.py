
import jax
import jax.numpy as jnp
from audiolab.rl.parameter_group import LinearLayerParamGroup
from audiolab.rl.transcription.env.vec_environment import TranscriptionVecEnv
from theta_star_study import Agents

# Hierarchical stacking of theta-star parameter averaging
NUM_AGENTS = 16
CHUNK_SIZE = 256
EMBEDDING_SIZE = 16
DEPTH = 1

def hierarchical_theta_star(depth, key):
    """
    Recursively stack theta-star averaging for k depths.
    At each layer, agents are initialized and their parameters are averaged by simulated rewards.
    Returns the final theta-star parameter vectors for the last layer (not summed).
    """
    if depth < 1:
        raise ValueError("depth must be >= 1")
    
    # Base layer: random agents
    if depth == 1:
        agents = Agents(key, NUM_AGENTS, CHUNK_SIZE, EMBEDDING_SIZE)
        # Simulate random rewards for each agent
        rewards = jax.random.uniform(key, shape=(NUM_AGENTS,))
        theta_star_params = agents.evaluate_theta_star(rewards)
        return theta_star_params
    
    # Recursive stacking: each agent is itself a theta-star from previous layer
    theta_star_params_list = []
    for i in range(NUM_AGENTS):
        subkey = jax.random.PRNGKey(i + depth * 100)
        params = hierarchical_theta_star(depth - 1, subkey)
        theta_star_params_list.append(params)
    # For each layer, stack the weights and biases from all agents, then average
    final_theta_star = []
    for layer_idx in range(len(theta_star_params_list[0])):
        weights_stack = jnp.stack([params[layer_idx][0] for params in theta_star_params_list])
        biases_stack = jnp.stack([params[layer_idx][1] for params in theta_star_params_list])
        # Simulate random rewards for this layer
        rewards = jax.random.uniform(key, shape=(NUM_AGENTS,))
        rewards = rewards / (jnp.sum(rewards) + 1e-8)
        avg_weights = jnp.tensordot(rewards, weights_stack, axes=1)
        avg_biases = jnp.tensordot(rewards, biases_stack, axes=1)
        final_theta_star.append((avg_weights, avg_biases))
    return final_theta_star

def main(depth=DEPTH):
    key = jax.random.PRNGKey(0)
    final_theta_star = hierarchical_theta_star(depth, key)
    print(f"Final theta-star parameter vectors at depth {depth}:")
    for i, (weights, biases) in enumerate(final_theta_star):
        print(f"Layer {i+1} weights shape: {weights.shape}")
        print(f"Layer {i+1} biases shape: {biases.shape}")
        print(f"Layer {i+1} weights: {weights}")
        print(f"Layer {i+1} biases: {biases}\n")

if __name__ == "__main__":
    main(DEPTH)
