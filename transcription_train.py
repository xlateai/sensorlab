from transcription_environment import TranscriptionEnvironmentSingleInstance
from transcription_agent import TranscriptionMemoryCellAgent
import torch
import torch.optim as optim
import random
import string


if __name__ == "__main__":
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(max_samples=1)
    
    # Create agent
    agent = TranscriptionMemoryCellAgent(embedding_size=32)
    print(f"Agent has {agent.num_parameters} parameters.")
    
    # Create optimizer for REINFORCE
    optimizer = optim.Adam(agent.parameters(), lr=0.001)
    
    # Training loop
    num_episodes = 100
    
    for episode in range(num_episodes):
        # Reset environment to get a sample
        obs, info = env.reset()
        
        # Reset agent memory for new episode
        agent.reset()
        
        # Storage for REINFORCE
        log_probs = []
        rewards = []
        
        # Take agent-predicted steps until episode terminates
        step_count = 0
        done = False
        
        while not done:
            step_count += 1
            
            # Get agent's prediction distribution based on current audio observation
            audio_value = obs[0]  # Extract single float from observation array
            distribution = agent.forward(audio_value)
            
            # Sample action from distribution
            action_value = distribution.sample()
            
            # Convert continuous action to character
            # Map to printable ASCII range [32, 126]
            char_code = int(torch.clamp(action_value * 10 + 79, 32, 126))  # Center around 79 ('O')
            predicted_char = chr(char_code)
            
            # Store log probability for REINFORCE
            log_probs.append(distribution.log_prob(action_value))
            
            # Take step in environment
            obs, reward, done, truncated, info = env.step(predicted_char)
            rewards.append(reward)
            
            if done:
                break
        
        # REINFORCE update
        if log_probs:
            # Convert to tensors
            log_probs = torch.stack(log_probs)
            rewards = torch.tensor(rewards, dtype=torch.float32)
            
            # Simple REINFORCE: multiply log probs by rewards
            policy_loss = -torch.sum(log_probs * rewards)
            
            # Backpropagation
            optimizer.zero_grad()
            policy_loss.backward()
            optimizer.step()
        
        # Print episode summary
        total_reward = sum(rewards) if rewards else 0
        completion_rate = len(env.current_transcription_guess) / len(env.current_transcription_target) * 100
        
        print(f"Episode {episode}: Steps={step_count}, Total Reward={total_reward}, Completion={completion_rate:.1f}%")
    
    print("Training complete!")