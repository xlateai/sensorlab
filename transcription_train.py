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
        supervised_log_probs = []  # Log probs of correct characters
        
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
            action_value = distribution.sample()  # This will be in [0, 1] range due to sigmoid
            action_value = torch.clamp(action_value, 0.0, 1.0)  # Clamp to ensure [0,1] range
            
            # Convert continuous action to character using environment method
            # Scale from [0,1] to Unicode range [32, 65535]
            char_code = int(action_value * (65535 - 32) + 32)
            predicted_char = env.numeric_to_character(char_code)
            
            # Store log probability for REINFORCE
            log_probs.append(distribution.log_prob(action_value))
            
            # Supervised learning component: get correct character and its log prob
            correct_char = env.next_character()
            if correct_char is not None:
                # Convert correct character to normalized [0,1] range
                correct_char_code = env.character_to_numeric(correct_char)
                correct_action_value = (correct_char_code - 32) / (65535 - 32)  # Normalize to [0,1]
                correct_log_prob = distribution.log_prob(torch.tensor(correct_action_value))
                supervised_log_probs.append(correct_log_prob)
            
            # Take step in environment
            obs, reward, done, truncated, info = env.step(predicted_char)
            rewards.append(reward)
            
            if reward == 1:
                correct_predictions += 1
            
            if done:
                break
        
        episode_duration = time.time() - episode_start_time
        
        # REINFORCE update with composite loss
        if log_probs:
            # Convert to tensors
            log_probs = torch.stack(log_probs)
            rewards = torch.tensor(rewards, dtype=torch.float32)
            
            # REINFORCE loss: multiply log probs by rewards
            reinforcement_loss = -torch.sum(log_probs * rewards)
            
            # Supervised loss: maximize log probability of correct characters
            supervised_loss = torch.tensor(0.0)
            if supervised_log_probs:
                supervised_log_probs = torch.stack(supervised_log_probs)
                supervised_loss = -torch.mean(supervised_log_probs)  # Negative log likelihood
            
            # Composite loss: combine both components
            # Use a smaller weight for supervised to avoid overwhelming REINFORCE
            total_loss = reinforcement_loss + 0.1 * supervised_loss
            
            # Backpropagation
            optimizer.zero_grad()
            total_loss.backward()
            optimizer.step()
            
            # Log the loss components for monitoring
            if episode % 10 == 0 or supervised_log_probs:  # Log more frequently if we have supervised data
                print(f"    Losses - REINFORCE: {reinforcement_loss.item():.3f}, Supervised: {supervised_loss.item():.3f}, Total: {total_loss.item():.3f}")
        
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