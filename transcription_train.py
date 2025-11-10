from transcription_environment import TranscriptionEnvironmentSingleInstance
from transcription_agent import TranscriptionMemoryCellAgent
import random
import string


if __name__ == "__main__":
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(max_samples=1)
    
    # Create agent (in inference mode, no training yet)
    agent = TranscriptionMemoryCellAgent(embedding_size=32)
    
    # Reset environment to get a sample
    obs, info = env.reset()
    
    # Reset agent memory for new episode
    agent.reset()
    
    # Play the audio
    # env.play_current_sample_audio()
    
    # Take agent-predicted steps until episode terminates
    step_count = 0
    done = False
    
    while not done:
        step_count += 1
        
        # Get agent's prediction based on current audio observation
        audio_value = obs[0]  # Extract single float from observation array
        agent_prediction = agent.forward(audio_value)
        
        # Convert agent's continuous output to a character
        # For now, we'll map the output to a character in a simple way
        # This is a placeholder - in real training you'd use proper character mapping
        char_code = int(abs(agent_prediction * 1000) % 95) + 32  # Map to printable ASCII
        predicted_char = chr(char_code)
        
        # Take step in environment
        obs, reward, done, truncated, info = env.step(predicted_char)
        
        if done:
            break