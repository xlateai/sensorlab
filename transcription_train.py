from transcription_environment import TranscriptionEnvironmentSingleInstance
from transcription_agent import TranscriptionMemoryCellAgent
import torch
import torch.optim as optim
import random
import string
import time


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
        episode_start_time = time.time()
        print(f"\n--- Episode {episode+1}/{num_episodes} ---")
        
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
        correct_predictions = 0
        
        while not done:
            step_count += 1
            
            # Progress reporting every 10k steps
            if step_count % 10000 == 0:
                elapsed = time.time() - episode_start_time
                steps_per_sec = step_count / elapsed
                eta_seconds = (len(env.current_audio_array) - step_count) / steps_per_sec if steps_per_sec > 0 else 0
                print(f"  Progress: {step_count:,}/{len(env.current_audio_array):,} steps ({step_count/len(env.current_audio_array)*100:.1f}%) | "
                      f"Correct: {correct_predictions} | Speed: {steps_per_sec:.0f} steps/sec | ETA: {eta_seconds:.0f}s")
            
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
            
            if reward == 1:
                correct_predictions += 1
            
            if done:
                break
        
        episode_duration = time.time() - episode_start_time
        
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
        steps_per_sec = step_count / episode_duration if episode_duration > 0 else 0
        
        print(f"Episode {episode+1} Summary:")
        print(f"  Duration: {episode_duration:.1f}s | Steps: {step_count:,} | Speed: {steps_per_sec:.0f} steps/sec")
        print(f"  Total Reward: {total_reward} | Correct Predictions: {correct_predictions}")
        print(f"  Completion: {completion_rate:.1f}% ({len(env.current_transcription_guess)}/{len(env.current_transcription_target)} chars)")
        print(f"  Current guess: '{env.current_transcription_guess[:50]}{'...' if len(env.current_transcription_guess) > 50 else ''}'")
        print(f"  Target text: '{env.current_transcription_target[:50]}{'...' if len(env.current_transcription_target) > 50 else ''}'")
    
    print("\nTraining complete!")