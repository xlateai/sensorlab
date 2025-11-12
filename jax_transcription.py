import jax
import jax.numpy as jnp
from parameter_group import LinearLayerParamGroup
from environment import TranscriptionEnvironmentSingleInstance

# Parameters
num_agents = 64
chunk_size = 256
input_size = chunk_size
hidden_size = 128
output_size = 64  # Predict 64 character counts

# Initialize environment
env = TranscriptionEnvironmentSingleInstance(chunk_size=chunk_size, max_samples=1)

# Initialize param groups (3 layers)
key = jax.random.PRNGKey(0)
layer1 = LinearLayerParamGroup(key, num_agents, input_size, hidden_size)
layer2 = LinearLayerParamGroup(key, num_agents, hidden_size, hidden_size)
layer3 = LinearLayerParamGroup(key, num_agents, hidden_size, output_size)

# Step environment (get input)
obs = env.step()  # Should return shape (chunk_size,) or (num_agents, chunk_size)

# Prepare input for agents
x = jnp.tile(obs, (num_agents, 1))  # Shape: (num_agents, chunk_size)

# Forward pass
h1 = layer1.forward(x)
h2 = layer2.forward(h1)
out = layer3.forward(h2)  # Shape: (num_agents, output_size)

print(out)