


import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.distributions import Beta
import numpy as np

class TranscriptionMemoryCellAgent(nn.Module):
    """
    Memory cell agent that processes audio one timestep at a time and maintains
    internal state to predict characters using a Beta distribution (always outputs [0,1]).
    """

    def __init__(self, embedding_size: int = 32, chunk_size: int = 512):
        super().__init__()

        self.embedding_size = embedding_size
        self.chunk_size = chunk_size
        
        # 1. FFNN to expand audio chunk into embedding_size vector
        self.audio_expander = nn.Sequential(
            nn.LayerNorm(chunk_size),
            nn.Linear(chunk_size, embedding_size),
            nn.ReLU(),
            nn.Linear(embedding_size, embedding_size),
            nn.ReLU(),
            nn.Linear(embedding_size, embedding_size)
        )
        
        # 2. Linear layer to combine expanded audio and hidden state
        self.combined_proj = nn.Linear(embedding_size * 2, embedding_size)
        
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
        for module in [self.audio_expander, self.combined_proj, self.hidden_layer1, 
                  self.hidden_layer2, self.alpha_output, self.beta_output]:
            if isinstance(module, nn.Sequential):
                for layer in module:
                    if isinstance(layer, nn.Linear):
                        nn.init.xavier_uniform_(layer.weight)
                        nn.init.zeros_(layer.bias)
            elif isinstance(module, nn.Linear):
                nn.init.xavier_uniform_(module.weight)
                nn.init.zeros_(module.bias)
    
    def forward(self, audio_chunk):
        """
        Forward pass for a chunk of audio samples.
        
        Args:
            audio_chunk: 1D array/tensor of length chunk_size
        Returns:
            Beta distribution for character prediction (samples always in [0, 1])
        """
        # Convert audio chunk to tensor
        if isinstance(audio_chunk, np.ndarray):
            audio_tensor = torch.tensor(audio_chunk, dtype=torch.float32).unsqueeze(0)  # [1, chunk_size]
        elif isinstance(audio_chunk, torch.Tensor):
            if audio_chunk.dim() == 1:
                audio_tensor = audio_chunk.unsqueeze(0)  # [1, chunk_size]
            else:
                audio_tensor = audio_chunk  # [1, chunk_size] or [batch, chunk_size]
        else:
            # Assume list or other sequence
            audio_tensor = torch.tensor(audio_chunk, dtype=torch.float32).unsqueeze(0)
        
        # 1. Expand audio chunk to embedding_size vector
        expanded_audio = self.audio_expander(audio_tensor)  # [1, embedding_size]
        
        # 2. Combine expanded audio and hidden state with linear transformation
        combined_input = torch.cat([expanded_audio, self.hidden_state], dim=-1)  # [1, embedding_size * 2]
        combined = self.combined_proj(combined_input)  # [1, embedding_size]
        
        # 3. Process through two hidden layers
        hidden1 = F.relu(self.hidden_layer1(combined))  # [1, embedding_size]
        hidden2 = F.relu(self.hidden_layer2(hidden1))   # [1, embedding_size]
        
        # Update hidden state for next timestep
        self.hidden_state = hidden2.detach()  # Detach to prevent gradient flow to previous timesteps
        
        # 4. Predict alpha and beta parameters for Beta distribution
        alpha_raw = self.alpha_output(hidden2)  # [1, 1]
        # beta_raw = self.beta_output(hidden2)   # [1, 1]
        
        # Ensure positive parameters for Beta distribution (must be > 0)
        # alpha = F.softplus(alpha_raw) + 1e-6  # [1, 1]
        # beta = F.softplus(beta_raw) + 1e-6    # [1, 1]
        
        # Create and return Beta distribution (always samples in [0, 1])
        # NOTE: must clamp to at least 1.0 to avoid NaNs during training
        # distribution = Beta(alpha.squeeze().clamp(1.0), beta.squeeze().clamp(1.0))
        # return distribution

        return torch.sigmoid(alpha_raw).squeeze()  # [1]
    
    def reset(self):
        """Reset the hidden state to all zeros (initial value)"""
        self.hidden_state = torch.zeros(1, self.embedding_size)

    @property
    def num_parameters(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)