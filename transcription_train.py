from transcription_environment import TranscriptionEnvironmentSingleInstance
from transcription_agent import TranscriptionMemoryCellAgent


# CHUNK_SIZE = 1024
# CHUNK_SIZE = 512
CHUNK_SIZE = 32


def safe_chr(code):
    # Clamp to valid range
    code = int(code)
    if 0xD800 <= code <= 0xDFFF:
        code = 0xE000  # Skip surrogate range to next valid code point
    return chr(code)

if __name__ == "__main__":
    # Create environment with just 1 sample for testing
    env = TranscriptionEnvironmentSingleInstance(max_samples=1, chunk_size=CHUNK_SIZE, verbose=True)
    agent = TranscriptionMemoryCellAgent(embedding_size=32, chunk_size=CHUNK_SIZE)

    # Play the audio
    # env.play_current_sample_audio()
    
    # Take random steps until episode terminates
    step_count = 0
    done = False

    obs, info = env.reset()
    
    while not done:
        step_count += 1
        # Get prediction from agent (Beta distribution returns values in [0,1])
        distribution = agent.forward(obs)
        raw_sample = distribution.sample()
        # print(f"Raw sample (0-1): {raw_sample.item():.4f}")
        
        # Scale from [0,1] to character range [32, 65535]
        scaled_sample = raw_sample * (65535 - 32) + 32
        guess = safe_chr(int(scaled_sample.item()))
        
        obs, reward, done, truncated, info = env.step(guess)
        expected_char = info.get('expected_char', None)
        expected_char_integer = ord(expected_char) if expected_char else None

        # print(guess, expected_char, reward)

        if done:
            break
        