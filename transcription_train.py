from transcription_environment import TranscriptionEnvironmentSingleInstance
from transcription_agent import TranscriptionMemoryCellAgent

import torch


# CHUNK_SIZE = 1024
CHUNK_SIZE = 512
# CHUNK_SIZE = 32

NUM_EPISODES = 10


def safe_chr(code):
    # Clamp to valid range
    code = int(code)
    if 0xD800 <= code <= 0xDFFF:
        code = 0xE000  # Skip surrogate range to next valid code point
    return chr(code)

if __name__ == "__main__":
    
    env = TranscriptionEnvironmentSingleInstance(max_samples=1, chunk_size=CHUNK_SIZE, verbose=True)
    agent = TranscriptionMemoryCellAgent(embedding_size=32, chunk_size=CHUNK_SIZE)

    optimizer = torch.optim.Adam(agent.parameters(), lr=0.0001)
    
    for episode_i in range(NUM_EPISODES):

        timestep = 0
        done = False
        obs, info = env.reset()

        while not done:
            optimizer.zero_grad()

            print(obs)

            # Get prediction from agent (Beta distribution returns values in [0,1])
            distribution = agent.forward(obs)
            raw_sample = distribution.sample()
            # print(f"Raw sample (0-1): {raw_sample.item():.4f}")
            
            # Scale from [0,1] to character range [32, 65535]
            scaled_sample = raw_sample * (65535 - 32) + 32
            guess = safe_chr(int(scaled_sample.item()))
            
            obs, reward, done, truncated, info = env.step(guess)
            expected_char = info.get('expected', None)
            expected_char_integer = ord(expected_char) if expected_char else None

            # for now, let's just increase the probability of the correct action
            normalized_expected = (expected_char_integer - 32) / (65535 - 32)
            assert 0.0 <= normalized_expected <= 1.0, f"Normalized expected {normalized_expected} out of bounds for char '{expected_char}' ({expected_char_integer})"
            target = torch.tensor([[normalized_expected]], dtype=torch.float32)
            log_prob = distribution.log_prob(target)
            loss = -log_prob  # don't need reward multiply because this is the optimal action

            print(loss, log_prob, target)

            loss.backward()
            optimizer.step()

            # print(f"[{episode_i}/{timestep}]", guess, expected_char, reward, raw_sample, obs.shape, env.current_audio_timestep)
            timestep += 1

            if done:
                break
        