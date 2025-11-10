from transcription_environment import TranscriptionEnvironmentSingleInstance
from transcription_agent import TranscriptionMemoryCellAgent
import random
import string


if __name__ == "__main__":
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(max_samples=1)
    
    # Reset to get a sample
    obs, info = env.reset()
    
    # Play the audio
    # env.play_current_sample_audio()
    
    # Take random steps until episode terminates
    step_count = 0
    done = False
    
    while not done:
        step_count += 1
        # Random action - pick a random UTF-8 character from the massive space
        # UTF-8 can represent ~1.1 million characters, let's sample from a reasonable range
        random_unicode_point = random.randint(32, 65535)  # Basic Multilingual Plane (most common chars)
        random_char = chr(random_unicode_point)
        
        obs, reward, done, truncated, info = env.step(random_char)
        
        if done:
            break