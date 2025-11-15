

import jax
import jax.numpy as jnp


class LinearLayerParamGroup:
    """The param group class houses a group of parameters and provides methods for crossover and mutation, as well as
    the forward pass for this operation. It allows us to abstract away the details of the crossover and mutation and
    to allow us to vectorize the forward pass for all agents.
    """

    def __init__(
        self,
        key: jax.random.PRNGKey,
        num_agents: int,
        input_size: int,
        output_size: int,
        mutation_rate: float = 0.1,
        mutation_amplitude: float = 0.25,
    ):
        self.key = key

        self.num_agents = num_agents
        self.input_size = input_size
        self.output_size = output_size

        self.mutation_rate = mutation_rate
        self.mutation_amplitude = mutation_amplitude

        # Initialize the weights and biases randomly
        self.key, skey0, skey1 = jax.random.split(self.key, 3)
        self.weights = jax.random.normal(skey0, (num_agents, input_size, output_size)) * 1.0
        self.biases = jax.random.normal(skey1, (num_agents, output_size)) * 1.0

    def forward(self, x):
        assert x.shape == (self.num_agents, self.input_size), f'Expected input shape {(self.num_agents, self.input_size)}, got {x.shape}'
        y = jax.vmap(LinearLayerParamGroup._forward_single)(x, self.weights, self.biases)
        assert y.shape == (self.num_agents, self.output_size), f'Expected output shape {(self.num_agents, self.output_size)}, got {y.shape}'
        return y
    
    @staticmethod
    def _forward_single(x, weights, bias):
        # z = jax.nn.sigmoid(jnp.dot(x, weights) + bias)
        z = jax.nn.relu(jnp.dot(x, weights) + bias)
        return z
    
    def mutate(self, mutation_indices: jnp.ndarray):
        self.key, skey0, skey1 = jax.random.split(self.key, 3)

        weight_mutations = jax.random.normal(skey0, (mutation_indices.shape[0], self.input_size, self.output_size)) * self.mutation_amplitude
        bias_mutations = jax.random.normal(skey1, (mutation_indices.shape[0], self.output_size)) * self.mutation_amplitude

        # mask out the mutations that will not be applied based on the mutation rate
        weight_mutation_mask = jax.random.bernoulli(skey0, self.mutation_rate, weight_mutations.shape)
        bias_mutation_mask = jax.random.bernoulli(skey1, self.mutation_rate, bias_mutations.shape)

        weight_mutations = weight_mutations * weight_mutation_mask
        bias_mutations = bias_mutations * bias_mutation_mask

        self.weights = self.weights.at[mutation_indices].add(weight_mutations)
        self.biases = self.biases.at[mutation_indices].add(bias_mutations)

    def distances(self, parent_indices: jnp.ndarray):
        # For each agent, compare its weights/biases to its paired agent
        # parent_indices should be shape (num_agents,)
        # For each i, compare weights[i] to weights[pair_indices[i]]
        pair_weights = self.weights[parent_indices]
        pair_biases = self.biases[parent_indices]

        weight_dists = jnp.linalg.norm(self.weights - pair_weights, axis=(1,2))
        bias_dists = jnp.linalg.norm(self.biases - pair_biases, axis=1)

        dists = weight_dists + bias_dists
        assert dists.shape == (parent_indices.shape[0],)
        return dists
    
    def clone(self, clone_indices: jnp.ndarray, partner_indices: jnp.ndarray, auto_mutate: bool = True):
        assert len(clone_indices) == len(partner_indices), 'Clone indices and partner indices must have the same length'

        self.weights = self.weights.at[clone_indices].set(self.weights[partner_indices])
        self.biases = self.biases.at[clone_indices].set(self.biases[partner_indices])

        if auto_mutate:
            self.mutate(clone_indices)



if __name__ == "__main__":
    key = jax.random.PRNGKey(0)
    num_agents = 10
    input_size = 5
    output_size = 2

    param_group = LinearLayerParamGroup(key, num_agents, input_size, output_size)

    x = jax.random.normal(key, (num_agents, input_size))
    y = param_group.forward(x)
    print("Output shape:", y.shape)  # Should be (num_agents, output_size)