


import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Beta

class TranscriptionMemoryCellAgent(nn.Module):
    """
    Memory cell agent that processes audio one timestep at a time and maintains
    internal state to predict characters using a Beta distribution (always outputs [0,1]).
    """

    def __init__(self, embedding_size: int = 32):
        super().__init__()

        self.embedding_size = embedding_size
        
        # 1. FFNN to expand single audio value into embedding_size vector
        self.audio_expander = nn.Sequential(
            nn.Linear(1, embedding_size),
            nn.ReLU(),
            nn.Linear(embedding_size, embedding_size),
            nn.ReLU(),
            nn.Linear(embedding_size, embedding_size)
        )
        
        # 2. Cross-attention to combine expanded audio with hidden state
        self.query_proj = nn.Linear(embedding_size, embedding_size)
        self.key_proj = nn.Linear(embedding_size, embedding_size)
        self.value_proj = nn.Linear(embedding_size, embedding_size)
        self.attention_output = nn.Linear(embedding_size, embedding_size)
        
        # 3. Two additional linear layers for processing
        self.hidden_layer1 = nn.Linear(embedding_size, embedding_size)
        self.hidden_layer2 = nn.Linear(embedding_size, embedding_size)
        
        # 4. Final layers to predict alpha and beta parameters for Beta distribution
        self.alpha_output = nn.Linear(embedding_size, 1)
        self.beta_output = nn.Linear(embedding_size, 1)
        
        # Initialize hidden state
        self.hidden_state = torch.zeros(1, embedding_size)
        
        # Initialize weights
        self._init_weights()
    
    def _init_weights(self):
        """Initialize weights with Xavier/Glorot initialization"""
        for module in [self.audio_expander, self.query_proj, self.key_proj, 
                      self.value_proj, self.attention_output, self.hidden_layer1, 
                      self.hidden_layer2, self.alpha_output, self.beta_output]:
            if isinstance(module, nn.Sequential):
                for layer in module:
                    if isinstance(layer, nn.Linear):
                        nn.init.xavier_uniform_(layer.weight)
                        nn.init.zeros_(layer.bias)
            elif isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                nn.init.zeros_(module.bias)
    
    def forward(self, audio_value):
        """
        Forward pass for a single audio timestep.
        
        Args:
            audio_value: Single float value from audio stream, or numpy array containing a single value
            
        Returns:
            Beta distribution for character prediction (samples always in [0, 1])
        """
        # Convert audio value to tensor
        # Handle both float and numpy array inputs
        if isinstance(audio_value, (float, int)):
            audio_tensor = torch.tensor([[audio_value]], dtype=torch.float32)
        else:
            # Assume it's a numpy array or similar, extract the scalar value
            scalar_value = float(audio_value.item() if hasattr(audio_value, 'item') else audio_value[0])
            audio_tensor = torch.tensor([[scalar_value]], dtype=torch.float32)
        
        # 1. Expand single audio value to embedding_size vector
        expanded_audio = self.audio_expander(audio_tensor)  # [1, embedding_size]
        
        # 2. Cross-attention between expanded audio and hidden state
        # Use expanded audio as query, hidden state as key and value
        query = self.query_proj(expanded_audio)  # [1, embedding_size]
        key = self.key_proj(self.hidden_state)   # [1, embedding_size]
        value = self.value_proj(self.hidden_state)  # [1, embedding_size]
        
        # Compute attention scores
        attention_scores = torch.matmul(query, key.transpose(-2, -1)) / (self.embedding_size ** 0.5)  # [1, 1]
        attention_weights = F.softmax(attention_scores, dim=-1)  # [1, 1]
        
        # Apply attention to values
        attended_output = torch.matmul(attention_weights, value)  # [1, embedding_size]
        
        # Combine with residual connection and project
        combined = self.attention_output(attended_output + expanded_audio)  # [1, embedding_size]
        
        # 3. Process through two hidden layers
        hidden1 = F.relu(self.hidden_layer1(combined))  # [1, embedding_size]
        hidden2 = F.relu(self.hidden_layer2(hidden1))   # [1, embedding_size]
        
        # Update hidden state for next timestep
        self.hidden_state = hidden2.detach()  # Detach to prevent gradient flow to previous timesteps
        
        # 4. Predict alpha and beta parameters for Beta distribution
        alpha_raw = self.alpha_output(hidden2)  # [1, 1]
        beta_raw = self.beta_output(hidden2)   # [1, 1]
        
        # Ensure positive parameters for Beta distribution (must be > 0)
        alpha = F.softplus(alpha_raw) + 1e-6  # [1, 1]
        beta = F.softplus(beta_raw) + 1e-6    # [1, 1]
        
        # Create and return Beta distribution (always samples in [0, 1])
        distribution = Beta(alpha.squeeze(), beta.squeeze())
        return distribution
    
    def reset(self):
        """Reset the hidden state to all zeros (initial value)"""
        self.hidden_state = torch.zeros(1, self.embedding_size)

    @property
    def num_parameters(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)