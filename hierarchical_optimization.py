
import jax
import jax.numpy as jnp
from audiolab.rl.parameter_group import LinearLayerParamGroup
from audiolab.rl.transcription.env.vec_environment import TranscriptionVecEnv
from theta_star_study import Agents

# Hierarchical stacking of theta-star parameter averaging
NUM_AGENTS = 16
CHUNK_SIZE = 256
EMBEDDING_SIZE = 16
DEPTH = 2  # going above 2 is insanely slow

from theta_star_study import TranscriptionAgentGroup

def hierarchical_theta_star(depth, key, trainer):
    """
    Recursively stack theta-star averaging for k depths.
    At each layer, agents are initialized and their parameters are averaged by trainer episode rewards.
    Returns the final theta-star parameter vectors for the last layer (not summed).
    """
    if depth < 1:
        raise ValueError("depth must be >= 1")
    # Base layer: random agents
    if depth == 1:
        agents = Agents(key, NUM_AGENTS, CHUNK_SIZE, EMBEDDING_SIZE)
        trainer.agents = agents
        rewards = trainer.episode()  # Use trainer to get agent rewards
        theta_star_params = agents.evaluate_theta_star(rewards)
        print(f"Depth {depth}: rewards = {rewards}")
        return theta_star_params, rewards
    # Recursive stacking: each agent is itself a theta-star from previous layer
    theta_star_params_list = []
    rewards_list = []
    for i in range(NUM_AGENTS):
        subkey = jax.random.PRNGKey(i + depth * 100)
        params, raw_rewards = hierarchical_theta_star(depth - 1, subkey, trainer)
        theta_star_params_list.append(params)
        rewards_list.append(raw_rewards)
    # Stack weights and biases for all layers
    num_layers = len(theta_star_params_list[0])
    weights_stacks = [jnp.stack([params[layer_idx][0] for params in theta_star_params_list]) for layer_idx in range(num_layers)]
    biases_stacks = [jnp.stack([params[layer_idx][1] for params in theta_star_params_list]) for layer_idx in range(num_layers)]

    # Create agents and update all layers' parameters before evaluation
    agents = Agents(key, NUM_AGENTS, CHUNK_SIZE, EMBEDDING_SIZE)
    for layer_idx in range(num_layers):
        for i in range(NUM_AGENTS):
            agents.layers[layer_idx][0] = weights_stacks[layer_idx][i]
            agents.layers[layer_idx][1] = biases_stacks[layer_idx][i]
    trainer.agents = agents
    rewards = trainer.episode()
    print(f"Depth {depth}: rewards = {rewards}")

    # Now construct the final theta-star using the rewards
    rewards_norm = rewards / (jnp.sum(rewards) + 1e-8)
    final_theta_star = []
    for layer_idx in range(num_layers):
        avg_weights = jnp.tensordot(rewards_norm, weights_stacks[layer_idx], axes=1)
        avg_biases = jnp.tensordot(rewards_norm, biases_stacks[layer_idx], axes=1)
        final_theta_star.append((avg_weights, avg_biases))
        
    return final_theta_star, rewards


def main(depth=DEPTH):
    key = jax.random.PRNGKey(0)
    trainer = TranscriptionAgentGroup(
        key,
        num_agents=NUM_AGENTS,
        chunk_size=CHUNK_SIZE,
        embedding_size=EMBEDDING_SIZE,
    )

    final_theta_star, raw_rewards = hierarchical_theta_star(depth, key, trainer)
    # print(f"Final theta-star parameters and raw performances at depth {depth}:")
    # for i, (weights, biases) in enumerate(final_theta_star):
        # print(f"Layer {i+1} theta-star weights shape: {weights.shape}")
        # print(f"Layer {i+1} theta-star biases shape: {biases.shape}")
    # print(f"Raw rewards used for composition: {raw_rewards}")

if __name__ == "__main__":
    main(DEPTH)
