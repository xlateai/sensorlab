from transcription_environment import TranscriptionEnvironmentSingleInstance
from transcription_agent import TranscriptionMemoryCellAgent
import random


if __name__ == "__main__":
    import string
    
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(max_samples=1)
    agent = TranscriptionMemoryCellAgent(embedding_size=32)

    # Play the audio
    # env.play_current_sample_audio()
    
    # Take random steps until episode terminates
    step_count = 0
    done = False

    obs = env.reset()
    
    while not done:
        step_count += 1
        # Random action - pick a random UTF-8 character from the massive space
        # UTF-8 can represent ~1.1 million characters, let's sample from a reasonable range
        # random_unicode_point = random.randint(32, 65535)  # Basic Multilingual Plane (most common chars)
        # guess = chr(random_unicode_point)
        guess = agent.forward(obs)
        
        obs, reward, done, truncated, info = env.step(guess)
        expected_char = info.get('expected_char', None)
        expected_char_integer = ord(expected_char) if expected_char else None

        # use MAE as loss
        loss = abs(ord(obs) - expected_char_integer) if expected_char_integer is not None else None
        if loss is not None:
            print(loss)

        if done:
            break
        